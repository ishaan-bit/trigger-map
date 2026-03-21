import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/router";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";
import { TRIGGER_EMOTION_TAGS, TRIGGER_TAGS, MAX_TAGS_PER_MOMENT } from "@triggermap/shared/constants/tags";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";
import { StreakOrb } from "../components/StreakOrb";
import { MoodWeather } from "../components/MoodWeather";
import { DailyPrediction } from "../components/DailyPrediction";
import { FeedbackCard } from "../components/FeedbackCard";
import { EMOTION_COLORS } from "../lib/designSystem";

const TRIGGER_EMOJIS = {
  work: "\u{1F4BC}", family: "\u{1F3E0}", partner: "\u{1F49B}", social: "\u{1F465}",
  alone: "\u{1F9D8}", exercise: "\u{1F3C3}", travel: "\u2708\uFE0F", health: "\u{1FA7A}", money: "\u{1F4B0}",
  sleep: "\u{1F634}", other: "\u{1F4CC}",
};

const EMOTION_EMOJIS = {
  frustrated: "\u{1F624}", anxious: "\u{1F630}", neutral: "\u{1F610}", calm: "\u{1F60C}", energized: "\u26A1",
};

const SCORE = { frustrated: 1, anxious: 2, neutral: 3, calm: 4, energized: 5 };

const EMOTION_PROMPTS = {
  calm: "Steady waters. What\u2019s on your mind?",
  neutral: "What just happened?",
  anxious: "Something pulling at you?",
  frustrated: "Name what\u2019s grinding.",
  energized: "Riding some energy.",
};

const PROMPTS = ["What just happened?", "What pulled you here?", "What\u2019s on your mind?"];

function getPrompt(count, dominantEmotion) {
  if (count >= 3) return "Back again, good habit.";
  if (dominantEmotion && EMOTION_PROMPTS[dominantEmotion]) return EMOTION_PROMPTS[dominantEmotion];
  return PROMPTS[count % PROMPTS.length];
}

function getEmotionTags(trigger, emotion) {
  return TRIGGER_EMOTION_TAGS[trigger]?.[emotion] || TRIGGER_TAGS[trigger] || [];
}

function computeDominant(moments) {
  if (!moments?.length) return { emotion: null, trigger: null, trend: null, color: null, count: 0 };
  const now = Date.now();
  const recent = moments.filter((m) => now - new Date(m.timestamp).getTime() < 48 * 3600000);
  if (!recent.length) return { emotion: null, trigger: null, trend: null, color: null, count: 0 };

  let totalW = 0, wSum = 0;
  for (const m of recent) {
    const ageH = (now - new Date(m.timestamp).getTime()) / 3600000;
    const w = ageH < 2 ? 1.5 : ageH < 6 ? 1.2 : 1.0;
    wSum += (SCORE[m.emotion] || 3) * w;
    totalW += w;
  }
  const avg = wSum / totalW;
  const emotion = avg >= 4.0 ? "calm" : avg >= 3.3 ? "energized" : avg >= 2.6 ? "neutral" : avg >= 1.8 ? "anxious" : "frustrated";

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
    const a = (arr) => arr.reduce((s, m) => s + (SCORE[m.emotion] || 3), 0) / arr.length;
    const d = a(r3) - a(o3);
    trend = d > 0.5 ? "improving" : d < -0.5 ? "declining" : "stable";
  }

  return { emotion, trigger, trend, color: EMOTION_COLORS[emotion] || "#56d0e0", count: moments.length };
}

export default function HomePage() {
  const router = useRouter();
  const { saveMoment, loadTimeline } = useSession();
  const [step, setStep] = useState("trigger");
  const [trigger, setTrigger] = useState(null);
  const [emotion, setEmotion] = useState(null);
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

  function reset() {
    setStep("trigger");
    setTrigger(null);
    setEmotion(null);
    setNote("");
    setSelectedTags([]);
    setSaved(false);
    setFeedback(null);
  }

  async function handleSave() {
    if (!trigger || !emotion || loading) return;
    try {
      setLoading(true);
      const payload = { trigger, emotion, note, notes: note };
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

  const emotionColor = EMOTION_COLORS[emotion] || "#56d0e0";
  const tags = trigger && emotion ? getEmotionTags(trigger, emotion) : [];

  // ── Post-log: feedback with ripple rings (matches Android EmotionSelectionScreen) ──
  if (saved && feedback) {
    const orbColor = EMOTION_COLORS[emotion] || "#56d0e0";

    return (
      <Layout title="Heard you.">
        <div className="stateGlow" style={{ "--state-color": orbColor }} />
        <section className="postLogScene sceneIn">
          {/* Ripple rings */}
          <div className="rippleRing rippleRing1" style={{ "--ripple-color": orbColor }} />
          <div className="rippleRing rippleRing2" style={{ "--ripple-color": orbColor }} />
          <div className="rippleRing rippleRing3" style={{ "--ripple-color": orbColor }} />
          {/* Breathing emotion orb */}
          <div className="postLogOrb" style={{ "--orb-color": orbColor }}>
            <div className="postLogOrbInner">
              <span className="postLogEmoji">{EMOTION_EMOJIS[emotion] || "\u{1F610}"}</span>
            </div>
          </div>
          <h2 className="postLogTitle" style={{ color: orbColor }}>Heard you.</h2>
          <FeedbackCard feedback={feedback} trigger={trigger} emotion={emotion} />
          <button
            className="goTimelineBtn"
            type="button"
            onClick={() => { clearTimeout(timerRef.current); router.push("/timeline"); }}
          >
            View on timeline \u2192
          </button>
        </section>
      </Layout>
    );
  }

  return (
    <Layout title="Log a moment">
      {/* ── Step 1: Trigger selection (matches Android TriggerSelectionScreen) ── */}
      {step === "trigger" ? (
        <section className="sceneIn stack">
          {/* Header */}
          <article className="card cardFeature stack">
            <p className="sectionKicker">Quick log</p>
            <h2>{getPrompt(todayCount, dominant.emotion)}</h2>
            <p className="muted">
              {todayCount > 0
                ? `${todayCount} moment${todayCount !== 1 ? "s" : ""} logged today`
                : "Tap a trigger to start logging"}
            </p>
          </article>

          {/* Mood weather */}
          <MoodWeather moments={moments} />

          {/* Streak orb */}
          <StreakOrb moments={moments} />

          {/* Pattern nudge (matches Android) */}
          {dominant.emotion && dominant.count >= 3 ? (
            <div className="patternNudge" style={{ borderLeftColor: dominant.color }}>
              <div className="nudgeDot" style={{ backgroundColor: dominant.color }} />
              <div className="nudgeContent">
                <p className="nudgeLabel">
                  Trending {dominant.emotion}{dominant.trend === "improving" ? " \u2191" : dominant.trend === "declining" ? " \u2193" : ""}
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

          {/* Daily prediction */}
          <DailyPrediction />

          {/* Trigger grid */}
          <div className="tileGrid">
            {TRIGGERS.map((t) => (
              <button
                key={t}
                className="triggerTile"
                onClick={() => { setTrigger(t); setStep("emotion"); }}
                type="button"
              >
                <span className="triggerTileEmoji">{TRIGGER_EMOJIS[t] || "\u{1F4CC}"}</span>
                <span className="triggerTileLabel">{t}</span>
              </button>
            ))}
          </div>

          {/* Bottom card (matches Android) */}
          <div className="bottomCard" style={dominant.emotion ? { borderColor: `${dominant.color}40` } : undefined}>
            <span className="bottomCardEmoji">
              {moments.length >= 10 ? "\u{1F31F}" : todayCount >= 3 ? "\u2728" : todayCount > 0 ? "\u{1F525}" : "\u{1F331}"}
            </span>
            <span className="bottomCardText">
              {moments.length >= 10 && dominant.trigger
                ? `Strong data this week. ${dominant.trigger} and ${dominant.emotion || "your patterns"} are becoming clear.`
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

      {/* ── Step 2: Emotion + tags (matches Android EmotionSelectionScreen) ── */}
      {step === "emotion" ? (
        <section className="sceneIn stack">
          <button className="backButton" type="button" onClick={() => { setStep("trigger"); setEmotion(null); setNote(""); setSelectedTags([]); }}>
            \u2190 Back
          </button>
          <div className="emotionHeader">
            <p className="sectionKicker" style={{ color: emotionColor }}>{trigger}</p>
            <h2>How did it{"\n"}affect you?</h2>
            <p className="muted">Choose an emotion, then refine with tags</p>
          </div>
          <div className="emotionChipRow">
            {EMOTIONS.map((e) => (
              <button
                key={e}
                className={`emotionChip ${emotion === e ? "emotionChipActive" : ""}`}
                data-emotion={e}
                onClick={() => { setEmotion(e); setSelectedTags([]); }}
                type="button"
              >
                <span className="emotionChipEmoji">{EMOTION_EMOJIS[e] || "\u2022"}</span>
                <span className="emotionChipLabel">{e}</span>
              </button>
            ))}
          </div>

          {emotion && tags.length > 0 ? (
            <div className="tagSection sceneIn">
              <p className="tagLabel">What about this felt <em style={{ color: emotionColor }}>{emotion}</em>?</p>
              <div className="tagChipRow">
                {tags.map((tag) => {
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
            disabled={!emotion || loading}
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