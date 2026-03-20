import { useEffect, useRef, useState } from "react";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";
import { TRIGGER_EMOTION_TAGS, TRIGGER_TAGS, MAX_TAGS_PER_MOMENT } from "@triggermap/shared/constants/tags";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";

const TRIGGER_EMOJIS = {
  work: "💼", family: "🏠", partner: "💛", social: "👥",
  alone: "🧘", exercise: "🏃", travel: "✈️", health: "🩺", money: "💰",
};

const EMOTION_EMOJIS = {
  frustrated: "😤", anxious: "😰", neutral: "😐", calm: "😌", energized: "⚡",
};

const EMOTION_COLORS = {
  calm: "#5ee6a0",
  neutral: "#9eb0c9",
  anxious: "#ffb347",
  frustrated: "#ff6b7a",
  energized: "#a78bfa",
};

const EMOTION_ECHOES = {
  calm: ["Stillness noticed.", "That calm matters. We see it.", "A quiet moment, held."],
  neutral: ["Noted. Even the steady moments count.", "Middle ground — still worth seeing.", "Logged without judgment."],
  anxious: ["That tension you're carrying — we see it.", "Anxiety logged. Naming it is already a step.", "You showed up even when it felt heavy."],
  frustrated: ["Frustration acknowledged. You didn't push it away.", "That friction is real. We heard it.", "Noted — sometimes just naming the heat helps."],
  energized: ["That spark is worth remembering.", "Energy captured — hold onto this one.", "Momentum logged. This feeds your patterns."],
};

const WEATHER_MAP = {
  calm:      { icon: "☀️", label: "Clear skies",  desc: "Your recent moments lean calm. A good day to notice what's working." },
  neutral:   { icon: "🌤️", label: "Partly clear", desc: "Steady and grounded. Not much turbulence in your recent moments." },
  anxious:   { icon: "🌧️", label: "Overcast",     desc: "Some tension showing up. Be gentle with yourself." },
  frustrated:{ icon: "⛈️", label: "Turbulent",    desc: "Friction in the air. Take it one moment at a time." },
  energized: { icon: "⚡", label: "Electric",      desc: "High energy in your recent logs. Ride it wisely." },
  mixed:     { icon: "🌦️", label: "Changeable",   desc: "Emotions shifting. That's okay — patterns reveal themselves over time." },
  quiet:     { icon: "🌙", label: "Still night",   desc: "No recent data yet. Log a moment to see your emotional weather." },
};

function computeWeather(moments) {
  if (!moments?.length) return WEATHER_MAP.quiet;
  const now = Date.now();
  const recent = moments.filter((m) => now - new Date(m.timestamp).getTime() < 24 * 60 * 60 * 1000);
  if (!recent.length) return WEATHER_MAP.quiet;
  const counts = {};
  for (const m of recent) counts[m.emotion] = (counts[m.emotion] || 0) + 1;
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (sorted.length >= 2 && sorted[0][1] === sorted[1][1]) return WEATHER_MAP.mixed;
  return WEATHER_MAP[sorted[0][0]] || WEATHER_MAP.neutral;
}

function getEmotionTags(trigger, emotion) {
  return TRIGGER_EMOTION_TAGS[trigger]?.[emotion] || TRIGGER_TAGS[trigger] || [];
}

export default function HomePage() {
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
  const fadeRef = useRef(null);

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
      setTimeout(reset, 3500);
    } catch {
      setSaved(false);
      setFeedback(null);
    } finally {
      setLoading(false);
    }
  }

  const weather = computeWeather(moments);
  const emotionColor = EMOTION_COLORS[emotion] || "#56d0e0";
  const tags = trigger && emotion ? getEmotionTags(trigger, emotion) : [];

  // ── Post-log: emotionally alive feedback ──
  if (saved && feedback) {
    const echoList = EMOTION_ECHOES[emotion] || EMOTION_ECHOES.neutral;
    const echo = feedback.patternFeedback || echoList[Math.floor(Math.random() * echoList.length)];
    const orbColor = EMOTION_COLORS[emotion] || "#56d0e0";

    return (
      <Layout title="Heard you.">
        <section className="postLogScene sceneIn">
          <div className="postLogOrb" style={{ "--orb-color": orbColor }}>
            <div className="postLogOrbInner">
              <span className="postLogEmoji">{EMOTION_EMOJIS[emotion] || "😐"}</span>
            </div>
          </div>
          <h2 className="postLogTitle" style={{ color: orbColor }}>Heard you.</h2>
          <p className="postLogEcho">{echo}</p>
          {feedback.smartReflectionPrompt ? (
            <p className="postLogReflection">{feedback.smartReflectionPrompt}</p>
          ) : null}
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
            <h2>What triggered this moment?</h2>
            <p className="muted">
              {todayCount > 0
                ? `${todayCount} moment${todayCount !== 1 ? "s" : ""} logged today`
                : "Tap a trigger to start logging"}
            </p>
          </article>

          {/* Emotional weather ribbon */}
          <div className="weatherRibbon">
            <div className="weatherShimmer" />
            <span className="weatherIcon">{weather.icon}</span>
            <div className="weatherCopy">
              <strong className="weatherLabel">{weather.label}</strong>
              <p className="weatherDesc">{weather.desc}</p>
            </div>
          </div>

          <div className="tileGrid">
            {TRIGGERS.map((t) => (
              <button
                key={t}
                className="triggerTile"
                onClick={() => { setTrigger(t); setStep("emotion"); }}
                type="button"
              >
                <span className="triggerTileEmoji">{TRIGGER_EMOJIS[t] || "📌"}</span>
                <span className="triggerTileLabel">{t}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Step 2: Emotion + tags ── */}
      {step === "emotion" ? (
        <section className="sceneIn stack">
          <article className="card stack">
            <p className="sectionKicker" style={{ color: emotionColor }}>{trigger}</p>
            <h2>How did it affect you?</h2>
            <p className="muted">Choose an emotion, then refine with tags</p>
          </article>
          <div className="emotionChipRow">
            {EMOTIONS.map((e) => (
              <button
                key={e}
                className={`emotionChip ${emotion === e ? "emotionChipActive" : ""}`}
                data-emotion={e}
                onClick={() => { setEmotion(e); setSelectedTags([]); }}
                type="button"
              >
                <span className="emotionChipEmoji">{EMOTION_EMOJIS[e] || "•"}</span>
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
              <p className="tagHint">Optional — up to {MAX_TAGS_PER_MOMENT}</p>
            </div>
          ) : null}

          <label>
            Note (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What happened right before this?"
            />
          </label>

          <div className="logActions">
            <button className="ghostButton" type="button" onClick={() => { setStep("trigger"); setEmotion(null); setNote(""); setSelectedTags([]); }}>
              ← Back
            </button>
            <button
              className="primaryButton"
              disabled={!emotion || loading}
              onClick={handleSave}
              type="button"
            >
              {loading ? "Saving..." : "Log moment"}
            </button>
          </div>
        </section>
      ) : null}
    </Layout>
  );
}