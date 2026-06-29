import { useEffect, useMemo, useState } from "react";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";
import { useOnboarding } from "../hooks/useOnboarding";
import { useI18n } from "../lib/i18n";
import { derivedEmotionLabel } from "@triggermap/shared/constants/emotions";
import { EmotionGarden } from "../components/EmotionGarden";
import { MoodWeather } from "../components/MoodWeather";
import { MicroInsight } from "../components/MicroInsight";
import { EditMomentModal } from "../components/EditMomentModal";
import { EmotionTrajectory } from "../components/EmotionTrajectory";
import { GuidedTooltip } from "../components/SpotlightOverlay";
import { Tooltip } from "../components/Tooltip";
import { emotionColor, resolveEmotion } from "../lib/emotionModel";
import { getRelativeDayLabel } from "../lib/date";
import { generateMicroInsights } from "../lib/microInsights";

const TRIGGER_EMOJIS = {
  work: "\u{1F4BC}", family: "\u{1F3E0}", partner: "\u{1F49B}", social: "\u{1F465}",
  alone: "\u{1F9D8}", exercise: "\u{1F3C3}", travel: "✈️", health: "\u{1FA7A}", money: "\u{1F4B0}", sleep: "\u{1F634}",
};

const MERGE_WINDOW_MS = 30 * 60 * 1000;

function momentColorFor(m) {
  if (typeof m.valence === "number" && typeof m.arousal === "number") return emotionColor(m.valence, m.arousal);
  const map = { calm: "#5ee6a0", neutral: "#9eb0c9", anxious: "#ffb347", frustrated: "#ff6b7a", energized: "#a78bfa" };
  return map[resolveEmotion(m)] || "#9eb0c9";
}

function momentLabelKey(m) {
  if (m.derivedLabel) return m.derivedLabel;
  if (typeof m.valence === "number" && typeof m.arousal === "number") return derivedEmotionLabel(m.valence, m.arousal);
  return resolveEmotion(m);
}

// Merge same-trigger + same-resolved-emotion within 30 min (coordinate-aware so
// distinct feelings stored only as valence/arousal don't all merge as undefined).
function mergeSimilarMoments(moments) {
  if (!moments?.length) return [];
  const merged = [];
  for (const m of moments) {
    const last = merged[merged.length - 1];
    if (
      last &&
      last.trigger === m.trigger &&
      resolveEmotion(last) === resolveEmotion(m) &&
      Math.abs(new Date(last.timestamp).getTime() - new Date(m.timestamp).getTime()) < MERGE_WINDOW_MS
    ) {
      last._count = (last._count || 1) + 1;
      if (new Date(m.timestamp) < new Date(last.timestamp)) last.timestamp = m.timestamp;
      if (m.note && !last.note) last.note = m.note;
    } else {
      merged.push({ ...m });
    }
  }
  return merged;
}

function groupByDay(moments, t, lang) {
  const groups = {};
  for (const moment of moments) {
    const label = getRelativeDayLabel(moment.timestamp, t, lang);
    if (!groups[label]) groups[label] = [];
    groups[label].push(moment);
  }
  return Object.entries(groups);
}

export default function TimelinePage() {
  const { loadTimeline, updateMoment, removeMoment } = useSession();
  const { state: obState, advance, isCompleted, markNudgeSeen, isNudgeSeen } = useOnboarding();
  const { t, lang } = useI18n();
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editingMoment, setEditingMoment] = useState(null);
  const [showTrajectory, setShowTrajectory] = useState(false);
  const [gardenHighlight, setGardenHighlight] = useState(null);
  const [showTimelineExplain, setShowTimelineExplain] = useState(false);
  const [showPatternsOverTime, setShowPatternsOverTime] = useState(false);
  const [showDeeperNudge, setShowDeeperNudge] = useState(false);

  const isFirstLogTimeline = obState === "first_log_done";

  async function load() {
    try {
      setLoading(true);
      setError("");
      const result = await loadTimeline();
      setMoments(Array.isArray(result) ? result : []);
    } catch (e) {
      setError(e.message || t("timeline.unavailable", "Timeline unavailable"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // FTUE: explain timeline after the first log.
  useEffect(() => {
    if (isFirstLogTimeline && moments.length > 0) setShowTimelineExplain(true);
  }, [isFirstLogTimeline, moments.length]);

  // Progressive nudge: deeper patterns at 10+ moments.
  useEffect(() => {
    if (!isCompleted || moments.length < 10) return;
    if (!isNudgeSeen("deeper_patterns")) setShowDeeperNudge(true);
  }, [isCompleted, moments.length, isNudgeSeen]);

  function startEdit(moment) {
    setGardenHighlight(resolveEmotion(moment));
    setTimeout(() => setGardenHighlight(null), 1500);
    setEditingMoment(moment);
  }

  async function handleSaveEdit(momentId, updates) {
    try {
      await updateMoment(momentId, updates);
      setEditingMoment(null);
      await load();
    } catch (e) {
      alert(`${t("timeline.editFailed", "Edit failed")}: ${e.message}`);
    }
  }

  async function handleDelete(moment) {
    if (!confirm(t("timeline.deleteConfirm", "Delete this moment? This cannot be undone."))) return;
    try {
      await removeMoment(moment.id);
      setMoments((prev) => prev.filter((m) => m.id !== moment.id));
    } catch (e) {
      alert(`${t("timeline.deleteFailed", "Delete failed")}: ${e.message}`);
    }
  }

  const dayGroups = useMemo(() => groupByDay(mergeSimilarMoments(moments), t, lang), [moments, t, lang]);
  const microInsights = useMemo(() => generateMicroInsights(moments), [moments]);
  const newestMomentId = useMemo(() => {
    if (!moments.length) return null;
    return moments.reduce((n, m) => (new Date(m.timestamp) > new Date(n.timestamp) ? m : n), moments[0]).id;
  }, [moments]);

  return (
    <Layout title={t("timeline.title", "Timeline")} actions={<button className="ghostButton" onClick={load} type="button">{t("common.retry", "Refresh")}</button>}>
      <div className="card cardFeature stack sceneIn">
        <p className="sectionKicker">{t("timeline.kicker", "Past 7 days")}</p>
        <h2>{t("timeline.title", "Timeline")}</h2>
        <p className="muted">
          {moments.length
            ? (moments.length !== 1 ? t("timeline.subtitleWithCountPlural", { count: moments.length }) : t("timeline.subtitleWithCount", { count: moments.length }))
            : t("timeline.subtitleEmpty", "Your moments, grouped by day.")}
        </p>
      </div>

      <MoodWeather moments={moments} />

      {moments.length >= 2 ? (
        <button className="trajectoryToggle" type="button" onClick={() => setShowTrajectory((p) => !p)}>
          {showTrajectory ? t("timeline.hideTrajectory", "▾ hide trajectory") : t("timeline.showTrajectory", "▸ emotional trajectory")}
        </button>
      ) : null}
      {showTrajectory && moments.length >= 2 ? <EmotionTrajectory moments={moments} t={t} /> : null}

      <EmotionGarden moments={moments} highlightEmotion={gardenHighlight} />

      <Tooltip id="timeline_tooltip" text={t("timeline.tooltip")} hidden={microInsights.length > 0 || isFirstLogTimeline} />

      <GuidedTooltip
        visible={showTimelineExplain && !showPatternsOverTime}
        text={t("ftue.timelineExplain")}
        onDismiss={() => { setShowTimelineExplain(false); setShowPatternsOverTime(true); advance("timeline_seen"); }}
        duration={5000}
        delay={500}
      />
      <GuidedTooltip
        visible={showPatternsOverTime && isFirstLogTimeline}
        text={t("ftue.patternsOverTime")}
        onDismiss={() => setShowPatternsOverTime(false)}
        duration={4000}
        delay={300}
      />
      <GuidedTooltip
        visible={showDeeperNudge}
        text={t("nudge.deeperPatterns")}
        onDismiss={() => { setShowDeeperNudge(false); markNudgeSeen("deeper_patterns"); }}
        duration={6000}
        delay={600}
      />

      {microInsights.length > 0 ? (
        <div className="microInsightsGroup">
          {microInsights.map((text, idx) => <MicroInsight key={idx} text={text} />)}
        </div>
      ) : null}

      {loading ? <div className="card loadingCard">{t("timeline.loadingMessage", "Loading your latest moments…")}</div> : null}
      {error ? (
        <div className="card feedbackPanel stack">
          <strong>{t("timeline.unavailable", "Timeline unavailable")}</strong>
          <p className="feedback">{error}</p>
          <button className="primaryButton" onClick={load} type="button">{t("common.retry", "Try again")}</button>
        </div>
      ) : null}

      {!loading && !error && !moments.length ? (
        <div className="card feedbackPanel stack emptyStatePanel">
          <span style={{ fontSize: 56 }}>{"\u{1F4DD}"}</span>
          <strong>{t("timeline.emptyTitle", "No moments yet")}</strong>
          <p className="feedback">{t("timeline.emptyBody", "Start logging triggers and emotions to see your timeline come to life.")}</p>
          <a className="primaryButton inlineButton" href="/">{t("report.logMoment", "Log a moment")}</a>
        </div>
      ) : null}

      {!loading && !error && dayGroups.map(([dayLabel, dayMoments]) => (
        <section key={dayLabel} className="sceneIn stack">
          <div className="dayHeader">
            <p className="sectionKicker">{dayLabel}</p>
            <span className="dayCount">{dayMoments.length} {dayMoments.length === 1 ? t("timeline.moment", "moment") : t("timeline.moments", "moments")}</span>
          </div>
          <div className="tlConnector">
            {dayMoments.map((moment, idx) => {
              const eColor = momentColorFor(moment);
              const labelKey = momentLabelKey(moment);
              const label = t(`emotions.${labelKey}`, String(labelKey).replace(/_/g, " "));
              const isLast = idx === dayMoments.length - 1;
              const tags = (moment.contributionTags?.length ? moment.contributionTags : moment.tags) || [];
              const shownTags = tags.slice(0, 3);
              const overflow = tags.length - shownTags.length;
              return (
                <div key={moment.id} className="tlItem">
                  <div className="tlDotCol">
                    <div className="tlDot" style={{ background: eColor, boxShadow: `0 0 8px ${eColor}60` }} />
                    {!isLast ? <div className="tlLine" style={{ background: `${eColor}30` }} /> : null}
                  </div>
                  <article
                    className={`card momentCard stack tlCard${moment.id === newestMomentId ? " tlCardNewest" : ""}`}
                    style={{ borderLeft: `3px solid ${eColor}`, ...(moment.id === newestMomentId ? { "--glow-color": eColor } : {}) }}
                  >
                    <div className="momentMeta">
                      <span className="momentTriggerIcon" style={{ backgroundColor: `${eColor}18`, borderColor: `${eColor}30` }}>
                        {TRIGGER_EMOJIS[moment.trigger] || "\u{1F4CC}"}
                      </span>
                      <span className="momentTrigger">{t(`triggers.${moment.trigger}`, moment.trigger)}</span>
                      <span className="momentArrow">{"→"}</span>
                      <span className="momentEmotion" style={{ color: eColor, borderColor: `${eColor}40`, background: `${eColor}12` }}>{label}</span>
                      {moment._count > 1 ? <span className="momentBadge">{"×"}{moment._count}</span> : null}
                    </div>
                    <strong>{new Date(moment.timestamp).toLocaleTimeString(lang === "hi" ? "hi-IN" : "en-IN", { hour: "numeric", minute: "2-digit" })}</strong>
                    {moment.note ? <p className="momentNote">{moment.note}</p> : null}
                    {shownTags.length ? (
                      <div className="momentTagRow">
                        {shownTags.map((tag) => <span key={tag} className="momentTag">{tag}</span>)}
                        {overflow > 0 ? <span className="momentTag">+{overflow}</span> : null}
                      </div>
                    ) : null}
                    <div className="momentActions">
                      <button className="momentActionBtn" type="button" onClick={() => startEdit(moment)}>{t("timeline.edit", "Edit")}</button>
                      <button className="momentActionBtn momentActionBtnDanger" type="button" onClick={() => handleDelete(moment)}>{t("timeline.delete", "Delete")}</button>
                    </div>
                  </article>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      <EditMomentModal
        visible={!!editingMoment}
        moment={editingMoment}
        onSave={handleSaveEdit}
        onClose={() => setEditingMoment(null)}
      />
    </Layout>
  );
}
