import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import {
  createEmotionCoordinates,
  EMOTION_AXIS_STEPS,
  emotionRegionKey,
  derivedEmotionLabel,
  coordinatesToLegacy,
} from "@triggermap/shared/constants/emotions";
import { REGION_TAGS, MAX_TAGS_PER_MOMENT } from "@triggermap/shared/constants/tags";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";
import { StreakOrb } from "../components/StreakOrb";
import { MoodWeather } from "../components/MoodWeather";
import { DailyPrediction } from "../components/DailyPrediction";
import { FeedbackCard } from "../components/FeedbackCard";
import { EMOTION_COLORS, REGION_COLORS, colorForLabel } from "../lib/designSystem";

const TRIGGER_EMOJIS = {
  work: "\u{1F3E2}", family: "\u{1F3E0}", partner: "\u{1F49B}", social: "\u{1F465}",
  alone: "\u{1F9D8}", exercise: "\u{1F3C3}", travel: "\u{1F4CD}", health: "\u{1F48A}", money: "\u{1F4B0}",
  sleep: "\u{1F634}", other: "\u{1F4CC}",
};

const FEEL_LABELS = ["Rough", "Off", "Okay", "Good", "Great"];
const ENERGY_LABELS = ["Drained", "Low", "Steady", "Alert", "Wired"];

const PROMPTS = ["What just happened?", "What pulled you here?", "What\u2019s on your mind?"];

function getPrompt(count) {
  if (count >= 3) return "Back again, good habit.";
  return PROMPTS[count % PROMPTS.length];
}

/** Compute dominant emotion from recent moments (supports both old and new format) */
function computeDominant(moments) {
  if (!moments?.length) return { label: null, trigger: null, trend: null, color: null, count: 0 };
  const now = Date.now();
  const recent = moments.filter((m) => now - new Date(m.timestamp).getTime() < 48 * 3600000);
  if (!recent.length) return { label: null, trigger: null, trend: null, color: null, count: 0 };

  // Average valence of recent moments
  let totalW = 0, vSum = 0;
  for (const m of recent) {
    const ageH = (now - new Date(m.timestamp).getTime()) / 3600000;
    const w = ageH < 2 ? 1.5 : ageH < 6 ? 1.2 : 1.0;
    const v = m.valence ?? (m.emotion === "calm" ? 0.5 : m.emotion === "energized" ? 0.5 : m.emotion === "neutral" ? 0 : -0.5);
    vSum += v * w;
    totalW += w;
  }
  const avgV = vSum / totalW;
  const label = avgV >= 0.3 ? "calm" : avgV >= -0.15 ? "neutral" : "uneasy";
  const color = colorForLabel(label);

  // Dominant trigger (week)
  const weekMs = 7 * 24 * 3600000;
  const weekMoments = moments.filter((m) => m.trigger && now - new Date(m.timestamp).getTime() < weekMs);
  let trigger = null;
  if (weekMoments.length >= 3) {
    const tc = {};
    for (const m of weekMoments) tc[m.trigger] = (tc[m.trigger] || 0) + 1;
    trigger = Object.entries(tc).sort(([, a], [, b]) => b - a)[0]?.[0] || null;
  }

  // Trend
  const day = 86400000;
  const r3 = moments.filter((m) => now - new Date(m.timestamp).getTime() < 3 * day);
  const o3 = moments.filter((m) => { const a = now - new Date(m.timestamp).getTime(); return a >= 3 * day && a < 7 * day; });
  let trend = null;
  if (r3.length >= 2 && o3.length >= 2) {
    const av = (arr) => arr.reduce((s, m) => s + (m.valence ?? 0), 0) / arr.length;
    const d = av(r3) - av(o3);
    trend = d > 0.2 ? "improving" : d < -0.2 ? "declining" : "stable";
  }

  return { label, trigger, trend, color, count: moments.length };
}

export default function HomePage() {
  const router = useRouter();
  const { saveMoment, loadTimeline } = useSession();
  const [step, setStep] = useState("trigger");
  const [trigger, setTrigger] = useState(null);
  const [feel, setFeel] = useState(0);
  const [energy, setEnergy] = useState(0);
  const [note, setNote] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [loading, setLoading] = useState(false);
  const [todayCount, setTodayCount] = useState(0);
  const [moments, setMoments] = useState([]);
  const [saved, setSaved] = useState(false);
  const [feedback, setFeedback] = useState(null);
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
  }, []);

  const dominant = useMemo(() => computeDominant(moments), [moments]);

  // Derived emotion values
  const coords = useMemo(() => createEmotionCoordinates(feel, energy), [feel, energy]);
  const region = useMemo(() => emotionRegionKey(coords.valence, coords.arousal), [coords]);
  const derivedLabel = useMemo(() => derivedEmotionLabel(coords.valence, coords.arousal), [coords]);
  const labelColor = useMemo(() => colorForLabel(derivedLabel), [derivedLabel]);
  const regionTags = useMemo(() => REGION_TAGS[region] || [], [region]);

  function reset() {
    setStep("trigger");
    setTrigger(null);
    setFeel(0);
    setEnergy(0);
    setNote("");
    setSelectedTags([]);
    setSaved(false);
    setFeedback(null);
  }

  async function handleSave() {
    if (!trigger || loading) return;
    try {
      setLoading(true);
      const payload = {
        trigger,
        valence: coords.valence,
        arousal: coords.arousal,
        intensity: coords.intensity,
        emotion: coordinatesToLegacy(coords.valence, coords.arousal),
        note,
        notes: note,
      };
      if (selectedTags.length > 0) payload.tags = selectedTags;
      const response = await saveMoment(payload);
      setTodayCount((c) => c + 1);
      setSaved(true);
      setFeedback({
        patternFeedback: response?.patternFeedback || null,
        smartReflectionPrompt: response?.smartReflectionPrompt || null,
        pairCount: response?.pairCount || 0,
      });
      timerRef.current = setTimeout(() => { router.push("/timeline"); }, 3000);
    } catch {
      setSaved(false);
      setFeedback(null);
    } finally {
      setLoading(false);
    }
  }

  // ── Post-log: feedback with ripple rings ──
  if (saved && feedback) {
    return (
      <Layout title="Heard you.">
        <div className="stateGlow" style={{ "--state-color": labelColor }} />
        <section className="postLogScene sceneIn">
          <div className="rippleRing rippleRing1" style={{ "--ripple-color": labelColor }} />
          <div className="rippleRing rippleRing2" style={{ "--ripple-color": labelColor }} />
          <div className="rippleRing rippleRing3" style={{ "--ripple-color": labelColor }} />
          <div className="postLogOrb" style={{ "--orb-color": labelColor }}>
            <div className="postLogOrbInner">
              <span className="postLogEmoji" style={{ fontSize: 18, fontWeight: 700, color: labelColor }}>{derivedLabel}</span>
            </div>
          </div>
          <h2 className="postLogTitle" style={{ color: labelColor }}>Heard you.</h2>
          <FeedbackCard feedback={feedback} trigger={trigger} emotion={derivedLabel} />
          <button
            className="goTimelineBtn"
            type="button"
            onClick={() => { clearTimeout(timerRef.current); router.push("/timeline"); }}
          >
            View on timeline {"\u2192"}
          </button>
        </section>
      </Layout>
    );
  }

  return (
    <Layout title="Log a moment">
      {/* ── Step 1: Trigger selection ── */}
      {step === "trigger" ? (
        <section className="sceneIn stack">
          <article className="card cardFeature stack">
            <p className="sectionKicker">Quick log</p>
            <h2>{getPrompt(todayCount)}</h2>
            <p className="muted">
              {todayCount > 0
                ? `${todayCount} moment${todayCount !== 1 ? "s" : ""} logged today`
                : "Tap a trigger to start logging"}
            </p>
          </article>

          <MoodWeather moments={moments} />
          <StreakOrb moments={moments} />

          {dominant.label && dominant.count >= 3 ? (
            <div className="patternNudge" style={{ borderLeftColor: dominant.color }}>
              <div className="nudgeDot" style={{ backgroundColor: dominant.color }} />
              <div className="nudgeContent">
                <p className="nudgeLabel">
                  Trending {dominant.label}{dominant.trend === "improving" ? " \u2191" : dominant.trend === "declining" ? " \u2193" : ""}
                </p>
                <p className="nudgeBody">
                  {dominant.trigger
                    ? `${dominant.trigger} has been your most logged trigger this week.`
                    : dominant.trend === "improving"
                      ? "Your emotional tone has been shifting positively."
                      : dominant.trend === "declining"
                        ? "Things have felt heavier lately. Name what\u2019s contributing."
                        : "Your patterns are building. Keep logging for sharper insights."}
                </p>
              </div>
            </div>
          ) : null}

          <DailyPrediction />

          <div className="tileGrid">
            {TRIGGERS.map((t) => (
              <button
                key={t}
                className="triggerTile"
                data-trigger={t}
                onClick={() => { setTrigger(t); setStep("emotion"); }}
                type="button"
              >
                <span className="triggerTileEmoji">{TRIGGER_EMOJIS[t] || "\u{1F4CC}"}</span>
                <span className="triggerTileLabel">{t}</span>
              </button>
            ))}
          </div>

          <div className="bottomCard" style={dominant.label ? { borderColor: `${dominant.color}40` } : undefined}>
            <span className="bottomCardEmoji">
              {moments.length >= 10 ? "\u{1F31F}" : todayCount >= 3 ? "\u2728" : todayCount > 0 ? "\u{1F525}" : "\u{1F331}"}
            </span>
            <span className="bottomCardText">
              {moments.length >= 10 && dominant.trigger
                ? `Strong data this week. ${dominant.trigger} and your patterns are becoming clear.`
                : moments.length >= 10
                  ? "Strong week so far. Your patterns are getting sharper."
                  : todayCount >= 3
                    ? "Nice pattern data building up. Check your report later."
                    : moments.length >= 5
                      ? "Good momentum this week. Keep going for richer insights."
                      : todayCount > 0
                        ? `${3 - todayCount} more today to strengthen this week\u2019s observations.`
                        : "Each moment you log sharpens your weekly pattern report."}
            </span>
          </div>
        </section>
      ) : null}

      {/* ── Step 2: Two-Slider Emotion + Tags ── */}
      {step === "emotion" ? (
        <section className="sceneIn stack">
          <button className="backButton" type="button" onClick={() => { setStep("trigger"); setFeel(0); setEnergy(0); setNote(""); setSelectedTags([]); }}>
            {"\u2190"} Back
          </button>

          <div className="emotionHeader">
            <p className="sectionKicker" style={{ color: labelColor }}>{trigger}</p>
            <h2>How did it affect you?</h2>
            <p className="muted">Slide to describe how it felt</p>
          </div>

          {/* Feel slider */}
          <div className="sliderGroup">
            <label className="sliderLabel">How does this feel?</label>
            <input
              type="range"
              className="axisSlider axisSliderFeel"
              min={-1}
              max={1}
              step={0.01}
              value={feel}
              onChange={(e) => setFeel(parseFloat(e.target.value))}
            />
            <div className="sliderStepLabels">
              {FEEL_LABELS.map((l, i) => (
                <span key={l} className={`sliderStepLabel ${Math.abs(feel - EMOTION_AXIS_STEPS[i]) < 0.15 ? "sliderStepLabelActive" : ""}`}>{l}</span>
              ))}
            </div>
          </div>

          {/* Energy slider */}
          <div className="sliderGroup">
            <label className="sliderLabel">{"What\u2019s your energy like?"}</label>
            <input
              type="range"
              className="axisSlider axisSliderEnergy"
              min={-1}
              max={1}
              step={0.01}
              value={energy}
              onChange={(e) => setEnergy(parseFloat(e.target.value))}
            />
            <div className="sliderStepLabels">
              {ENERGY_LABELS.map((l, i) => (
                <span key={l} className={`sliderStepLabel ${Math.abs(energy - EMOTION_AXIS_STEPS[i]) < 0.15 ? "sliderStepLabelActive" : ""}`}>{l}</span>
              ))}
            </div>
          </div>

          {/* Live summary card */}
          <div className="summaryCardLive sceneIn" style={{ borderColor: `${labelColor}40`, "--summary-color": labelColor }}>
            <div className="summaryDot" style={{ backgroundColor: labelColor }} />
            <div className="summaryContent">
              <span className="summaryLabel" style={{ color: labelColor }}>{derivedLabel}</span>
              <span className="summaryCoords">
                feel {coords.valence > 0 ? "+" : ""}{coords.valence} · energy {coords.arousal > 0 ? "+" : ""}{coords.arousal}
              </span>
            </div>
          </div>

          {/* Adaptive tags */}
          {regionTags.length > 0 ? (
            <div className="tagSection sceneIn">
              <p className="tagLabel">What about this felt <em style={{ color: labelColor }}>{derivedLabel}</em>?</p>
              <div className="tagChipRow">
                {regionTags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  const atMax = selectedTags.length >= MAX_TAGS_PER_MOMENT && !active;
                  return (
                    <button
                      key={tag}
                      type="button"
                      className={`tagChip ${active ? "tagChipActive" : ""}`}
                      disabled={atMax}
                      onClick={() => setSelectedTags((prev) =>
                        prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
                      )}
                    >
                      {tag}
                    </button>
                  );
                })}
              </div>
              <p className="tagHint">Optional, up to {MAX_TAGS_PER_MOMENT}</p>
            </div>
          ) : null}

          <div className="noteCard">
            <label className="noteLabel">Note (optional)</label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What happened right before this?"
            />
          </div>

          <button
            className="primaryButton saveButton"
            disabled={loading}
            onClick={handleSave}
            type="button"
          >
            {loading ? "Saving..." : "Log moment"}
          </button>
        </section>
      ) : null}
    </Layout>
  );
}