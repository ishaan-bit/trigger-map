import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import {
  emotionRegionKey,
  derivedEmotionLabel,
  coordinatesToLegacy,
} from "@triggermap/shared/constants/emotions";
import { MAX_TAGS_PER_MOMENT } from "@triggermap/shared/constants/tags";
import {
  buildContributionTagMeta,
  getContributionSuggestions,
} from "@triggermap/shared/constants/contributions";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";
import { useEmotionalState } from "../hooks/useEmotionalState";
import { useOnboarding } from "../hooks/useOnboarding";
import { useI18n } from "../lib/i18n";
import { StreakOrb } from "../components/StreakOrb";
import { MoodWeather } from "../components/MoodWeather";
import { FeedbackCard } from "../components/FeedbackCard";
import { EmotionPad } from "../components/EmotionPad";
import { SpotlightOverlay, GuidedTooltip } from "../components/SpotlightOverlay";
import { Tooltip } from "../components/Tooltip";
import { getRelevantContributionSuggestionsSync, recordTagUsage } from "../lib/adaptiveTags";
import { emotionColor } from "../lib/emotionModel";

const TRIGGER_EMOJIS = {
  work: "\u{1F3E2}", family: "\u{1F3E0}", partner: "\u{1F49B}", social: "\u{1F465}",
  alone: "\u{1F9D8}", exercise: "\u{1F3C3}", travel: "\u{1F4CD}", health: "\u{1F48A}", money: "\u{1F4B0}",
  sleep: "\u{1F634}", other: "\u{1F4CC}",
};

function vibrate(ms) {
  try {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // ignore (iOS Safari)
  }
}

function getPrompt(count, dominantEmotion, t) {
  if (count >= 3) return t("log.prompts.returning");
  if (dominantEmotion) {
    const key = `log.prompts.${dominantEmotion}`;
    const v = t(key);
    if (v && v !== key) return v;
  }
  return t(`log.prompts.default${count % 3}`);
}

function translateLabel(t, key) {
  return t(`emotions.${key}`, key.replace(/_/g, " "));
}

export default function HomePage() {
  const router = useRouter();
  const { saveMoment, loadTimeline } = useSession();
  const { dominantEmotion, dominantTrigger, emotionalTrend, emotionColor: stateColor, momentCount, refresh } = useEmotionalState();
  const { state: obState, advance, skip, isCompleted, markNudgeSeen, isNudgeSeen } = useOnboarding();
  const { t, lang } = useI18n();

  const isFirstLog = obState === "framing_shown";
  const isSecondLog = obState === "first_log_done";

  const [step, setStep] = useState("trigger");
  const [trigger, setTrigger] = useState(null);
  const [coords, setCoords] = useState({ valence: 0, arousal: 0, intensity: 0 });
  const [hasInteracted, setHasInteracted] = useState(false);
  const [selectedTags, setSelectedTags] = useState([]);
  const [adaptiveTags, setAdaptiveTags] = useState([]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [todayCount, setTodayCount] = useState(0);
  const [moments, setMoments] = useState([]);

  const [showFraming, setShowFraming] = useState(false);
  const [showTriggerHint, setShowTriggerHint] = useState(false);
  const [showEmotionHint, setShowEmotionHint] = useState(false);
  const [showInsightsNudge, setShowInsightsNudge] = useState(false);
  const timerRef = useRef(null);

  useEffect(() => {
    loadTimeline()
      .then((m) => {
        const all = Array.isArray(m) ? m : [];
        setMoments(all);
        const today = new Date().toDateString();
        setTodayCount(all.filter((x) => new Date(x.timestamp).toDateString() === today).length);
      })
      .catch(() => {});
  }, [loadTimeline]);

  // FTUE framing overlay on first visit after the onboarding carousel.
  useEffect(() => {
    if (obState === "framing_shown") {
      const tm = setTimeout(() => setShowFraming(true), 400);
      return () => clearTimeout(tm);
    }
    return undefined;
  }, [obState]);

  useEffect(() => {
    if (obState === "framing_shown" && !showFraming) setShowTriggerHint(true);
  }, [obState, showFraming]);

  // Progressive nudge: suggest insights once there's enough data.
  useEffect(() => {
    if (!isCompleted || momentCount < 5) return;
    if (!isNudgeSeen("insights_ready")) setShowInsightsNudge(true);
  }, [isCompleted, momentCount, isNudgeSeen]);

  // ── Derived emotion values ──
  const regionKey = useMemo(() => emotionRegionKey(coords.valence, coords.arousal), [coords.valence, coords.arousal]);
  const legacyEmotion = useMemo(() => coordinatesToLegacy(coords.valence, coords.arousal), [coords.valence, coords.arousal]);
  const derivedKey = useMemo(() => derivedEmotionLabel(coords.valence, coords.arousal), [coords.valence, coords.arousal]);
  const derivedLabel = translateLabel(t, derivedKey);
  const accentColor = emotionColor(coords.valence, coords.arousal);

  const contextForTags = useMemo(() => ({
    emotion: legacyEmotion,
    regionKey,
    valence: coords.valence,
    arousal: coords.arousal,
    intensity: coords.intensity,
    emotionLabel: derivedKey,
  }), [legacyEmotion, regionKey, coords.valence, coords.arousal, coords.intensity, derivedKey]);

  const suggestionSet = useMemo(() => getContributionSuggestions({
    domain: trigger,
    valence: coords.valence,
    arousal: coords.arousal,
    intensity: coords.intensity,
    emotionLabel: derivedKey,
  }), [trigger, coords.valence, coords.arousal, coords.intensity, derivedKey]);

  const selectedMeta = useMemo(
    () => buildContributionTagMeta(selectedTags, [...adaptiveTags, ...suggestionSet.all]),
    [selectedTags, adaptiveTags, suggestionSet.all]
  );

  // Refresh adaptive tag pool when the user crosses an emotion region.
  useEffect(() => {
    if (!hasInteracted || !trigger) {
      setAdaptiveTags([]);
      return;
    }
    setAdaptiveTags(getRelevantContributionSuggestionsSync(trigger, contextForTags));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionKey, hasInteracted, trigger]);

  function handleEmotionChange(valence, arousal, intensity) {
    setHasInteracted(true);
    setCoords((prev) => (prev.valence === valence && prev.arousal === arousal && prev.intensity === intensity
      ? prev
      : { valence, arousal, intensity }));
  }

  function toggleTag(tag) {
    vibrate(6);
    setSelectedTags((prev) => {
      if (prev.includes(tag)) return prev.filter((x) => x !== tag);
      if (prev.length >= MAX_TAGS_PER_MOMENT) return prev;
      return [...prev, tag];
    });
  }

  function goToEmotion(tr) {
    setTrigger(tr);
    setStep("emotion");
    setShowTriggerHint(false);
    if (isFirstLog) setShowEmotionHint(true);
    vibrate(6);
  }

  function backToTrigger() {
    setStep("trigger");
    setTrigger(null);
    setCoords({ valence: 0, arousal: 0, intensity: 0 });
    setHasInteracted(false);
    setSelectedTags([]);
    setAdaptiveTags([]);
    setNote("");
  }

  async function handleSave() {
    if (!hasInteracted || saving || saved) return;
    try {
      setSaving(true);
      const payload = {
        trigger,
        valence: coords.valence,
        arousal: coords.arousal,
        intensity: coords.intensity,
        emotion: legacyEmotion,
        emotionPoint: { valence: coords.valence, arousal: coords.arousal, x: coords.valence, y: coords.arousal },
        emotionLabel: derivedKey,
        emotionSubtitle: derivedLabel,
        emotionQuadrant: suggestionSet.emotionQuadrant,
        emotionIntensity: suggestionSet.intensityBand,
        note,
        notes: note,
        lang,
        tags: selectedTags,
        contributionTags: selectedTags,
        contributionTagMeta: selectedMeta,
      };
      const response = await saveMoment(payload);
      if (selectedTags.length > 0) recordTagUsage(trigger, contextForTags, selectedTags);
      setTodayCount((c) => c + 1);
      setSaved(true);
      setFeedback({
        patternFeedback: response?.patternFeedback || null,
        smartReflectionPrompt: response?.smartReflectionPrompt || null,
        pairCount: response?.pairCount || 0,
      });
      vibrate([0, 30, 40, 30]);
      refresh?.();

      // Onboarding-aware redirect.
      if (isFirstLog) {
        advance("first_log_done");
        timerRef.current = setTimeout(() => router.push("/timeline"), 3000);
      } else if (isSecondLog) {
        advance("second_log_done");
        timerRef.current = setTimeout(() => router.push("/report"), 3000);
      } else {
        timerRef.current = setTimeout(() => router.push("/timeline"), 3000);
      }
    } catch {
      setSaved(false);
      setFeedback(null);
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // ── Post-log scene ──
  if (saved && feedback) {
    const title = isFirstLog ? t("ftue.firstDataPoint") : isSecondLog ? t("ftue.patternsForming") : t("emotion.heardYou", "Heard you.");
    const subtext = isFirstLog ? t("ftue.firstDataPointSub") : isSecondLog ? t("ftue.patternsFormingSub") : null;
    const btnLabel = isFirstLog ? t("ftue.seeTimeline") : isSecondLog ? t("ftue.seeInsights") : t("emotion.goTimeline", "View on timeline");
    const dest = isSecondLog ? "/report" : "/timeline";
    return (
      <Layout title={title} emotion={dominantEmotion}>
        <div className="stateGlow" style={{ "--state-color": accentColor }} />
        <section className="postLogScene sceneIn">
          <div className="rippleRing rippleRing1" style={{ "--ripple-color": accentColor }} />
          <div className="rippleRing rippleRing2" style={{ "--ripple-color": accentColor }} />
          <div className="rippleRing rippleRing3" style={{ "--ripple-color": accentColor }} />
          <div className="postLogOrb" style={{ "--orb-color": accentColor }}>
            <div className="postLogOrbInner">
              <span className="postLogEmoji" style={{ fontSize: 18, fontWeight: 700, color: accentColor }}>{derivedLabel}</span>
            </div>
          </div>
          <h2 className="postLogTitle" style={{ color: accentColor }}>{title}</h2>
          <FeedbackCard feedback={feedback} trigger={trigger} emotion={legacyEmotion || "neutral"} />
          {subtext ? <p className="postLogReflection" style={{ textAlign: "center", maxWidth: 280 }}>{subtext}</p> : null}
          <button
            className="goTimelineBtn"
            type="button"
            onClick={() => { clearTimeout(timerRef.current); router.push(dest); }}
          >
            {btnLabel} {"→"}
          </button>
        </section>
      </Layout>
    );
  }

  return (
    <Layout title={t("tabs.log", "Log")} emotion={dominantEmotion}>
      {step === "trigger" ? (
        <section className="sceneIn stack">
          <article className="card cardFeature stack">
            <p className="sectionKicker">{t("log.kicker")}</p>
            <h2>{getPrompt(todayCount, dominantEmotion, t)}</h2>
            <p className="muted">
              {todayCount > 0
                ? (todayCount !== 1 ? t("log.momentCountPlural", { count: todayCount }) : t("log.momentCount", { count: todayCount }))
                : t("log.tapToStart")}
            </p>
            <p className="muted" style={{ fontSize: 12 }}>{t("log.valueStatement")}</p>
          </article>

          <MoodWeather moments={moments} />
          <StreakOrb moments={moments} />

          {dominantEmotion && momentCount >= 3 ? (
            <div className="patternNudge" style={{ borderLeftColor: stateColor }}>
              <div className="nudgeDot" style={{ backgroundColor: stateColor }} />
              <div className="nudgeContent">
                <p className="nudgeLabel">
                  {t("log.trending", { emotion: translateLabel(t, dominantEmotion) })}
                  {emotionalTrend === "improving" ? " ↑" : emotionalTrend === "declining" ? " ↓" : ""}
                </p>
                <p className="nudgeBody">
                  {dominantTrigger
                    ? t("log.nudgeTrigger", { trigger: t(`triggers.${dominantTrigger}`, dominantTrigger) })
                    : emotionalTrend === "improving"
                      ? t("log.nudgeImproving")
                      : emotionalTrend === "declining"
                        ? t("log.nudgeDeclining")
                        : t("log.nudgeBuildPatterns")}
                </p>
              </div>
            </div>
          ) : null}

          <Tooltip id="log_tooltip" text={t("log.tooltip")} hidden={obState === "framing_shown"} />
          <GuidedTooltip
            visible={showInsightsNudge}
            text={t("nudge.insightsReady")}
            onDismiss={() => { setShowInsightsNudge(false); markNudgeSeen("insights_ready"); }}
            duration={6000}
            delay={800}
          />
          <GuidedTooltip
            visible={showTriggerHint}
            text={t("ftue.whatHappened")}
            onDismiss={() => setShowTriggerHint(false)}
            duration={5000}
          />

          <div className="tileGrid">
            {TRIGGERS.map((tr) => (
              <button key={tr} className="triggerTile" data-trigger={tr} onClick={() => goToEmotion(tr)} type="button">
                <span className="triggerTileEmoji">{TRIGGER_EMOJIS[tr] || "\u{1F4CC}"}</span>
                <span className="triggerTileLabel">{t(`triggers.${tr}`, tr)}</span>
              </button>
            ))}
          </div>

          <div className="bottomCard" style={dominantEmotion ? { borderColor: `${stateColor}40` } : undefined}>
            <span className="bottomCardEmoji">
              {moments.length >= 10 ? "\u{1F31F}" : todayCount >= 3 ? "✨" : todayCount > 0 ? "\u{1F525}" : "\u{1F331}"}
            </span>
            <span className="bottomCardText">
              {moments.length >= 10 && dominantTrigger
                ? t("log.bottomStrong", { trigger: t(`triggers.${dominantTrigger}`, dominantTrigger), emotion: dominantEmotion ? translateLabel(t, dominantEmotion) : t("log.nudgeBuildPatterns") })
                : moments.length >= 10
                  ? t("log.bottomStrongGeneral")
                  : todayCount >= 3
                    ? t("log.bottom3Today")
                    : moments.length >= 5
                      ? t("log.bottomGoodWeek")
                      : todayCount > 0
                        ? t("log.bottomMoreToday", { count: 3 - todayCount })
                        : t("log.bottomDefault")}
            </span>
          </div>
        </section>
      ) : null}

      {step === "emotion" ? (
        <section className="sceneIn stack">
          <button className="backButton" type="button" onClick={backToTrigger}>{"←"} {t("common.back", "Back")}</button>

          <div className="emotionHeader">
            <p className="sectionKicker" style={{ color: accentColor }}>{t(`triggers.${trigger}`, trigger)}</p>
            <h2>{t("emotion.prompt")}</h2>
          </div>

          <EmotionPad
            value={coords}
            onChange={handleEmotionChange}
            accentColor={accentColor}
            derivedLabel={derivedLabel}
            t={t}
          />

          <GuidedTooltip
            visible={showEmotionHint && !hasInteracted}
            text={t("ftue.howAffected")}
            onDismiss={() => setShowEmotionHint(false)}
            duration={5000}
            delay={600}
          />

          {hasInteracted && adaptiveTags.length > 0 ? (
            <div className="tagSection sceneIn">
              <div className="tagHeaderRow">
                <p className="tagLabel">{t("emotion.whatContributed")}</p>
                <div className="tagDots">
                  {Array.from({ length: MAX_TAGS_PER_MOMENT }).map((_, i) => (
                    <span key={i} className={`tagDot${i < selectedTags.length ? " tagDotActive" : ""}`} style={i < selectedTags.length ? { backgroundColor: accentColor } : undefined} />
                  ))}
                </div>
              </div>

              {selectedTags.some((tag) => !adaptiveTags.some((item) => item.label === tag)) ? (
                <div className="pinnedRow">
                  <p className="pinnedLabel">{t("emotion.selected", "Selected")}</p>
                  <div className="tagChipRow">
                    {selectedTags.filter((tag) => !adaptiveTags.some((item) => item.label === tag)).map((tag) => (
                      <button key={`sel-${tag}`} type="button" className="tagChip tagChipActive" style={{ borderColor: accentColor }} onClick={() => toggleTag(tag)}>{tag}</button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="tagChipRow">
                {adaptiveTags.map((item) => {
                  const tag = item.label;
                  const active = selectedTags.includes(tag);
                  const atMax = selectedTags.length >= MAX_TAGS_PER_MOMENT && !active;
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`tagChip${active ? " tagChipActive" : ""}`}
                      style={active ? { borderColor: accentColor } : undefined}
                      disabled={atMax}
                      onClick={() => toggleTag(tag)}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <p className="tagHint">{t("emotion.tagHint")}</p>
            </div>
          ) : null}

          <div className="noteCard">
            <label className="noteLabel">{t("emotion.noteLabel")}</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={t("emotion.notePlaceholder")} />
          </div>

          <button
            className="primaryButton saveButton"
            disabled={!hasInteracted || saving}
            onClick={handleSave}
            type="button"
            style={hasInteracted && !saving ? { backgroundColor: accentColor } : undefined}
          >
            {saving ? t("emotion.saving") : t("emotion.saveMoment")}
          </button>
        </section>
      ) : null}

      <SpotlightOverlay
        visible={showFraming}
        emoji={"\u{1F3AF}"}
        message={t("ftue.framingMessage")}
        cta={t("ftue.logFirstMoment")}
        onDismiss={() => setShowFraming(false)}
        skipLabel={t("ftue.skipGuide")}
        onSkip={() => { setShowFraming(false); skip(); }}
        position="center"
      />
    </Layout>
  );
}
