import { useEffect, useState } from "react";
import { TRIGGERS } from "@triggermap/shared/constants/triggers";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";
import { TRIGGER_TAGS, MAX_TAGS_PER_MOMENT } from "@triggermap/shared/constants/tags";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";

const TRIGGER_EMOJIS = {
  work: "💼", family: "🏠", partner: "💛", social: "👥",
  alone: "🧘", exercise: "🏃", travel: "✈️", health: "🩺", money: "💰",
};

const EMOTION_EMOJIS = {
  frustrated: "💢", anxious: "⚡", neutral: "🌫️", calm: "🍃", energized: "☀️",
};

export default function HomePage() {
  const { saveMoment, loadTimeline } = useSession();
  const [step, setStep] = useState("trigger");
  const [trigger, setTrigger] = useState(null);
  const [emotion, setEmotion] = useState(null);
  const [note, setNote] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [todayCount, setTodayCount] = useState(0);

  useEffect(() => {
    loadTimeline()
      .then((moments) => {
        const today = new Date().toDateString();
        setTodayCount(moments.filter((m) => new Date(m.timestamp).toDateString() === today).length);
      })
      .catch(() => {});
  }, []);

  function reset() {
    setStep("trigger");
    setTrigger(null);
    setEmotion(null);
    setNote("");
    setSelectedTags([]);
    setMessage("");
  }

  async function handleSave() {
    if (!trigger || !emotion || loading) return;
    try {
      setLoading(true);
      const payload = { trigger, emotion, note, notes: note };
      if (selectedTags.length > 0) payload.tags = selectedTags;
      const response = await saveMoment(payload);
      setMessage(response?.patternFeedback || response?.smartReflectionPrompt || "Moment saved ✓");
      setTodayCount((c) => c + 1);
      setTimeout(reset, 1800);
    } catch (error) {
      setMessage(error.message || "Unable to save. Check connection.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Log a moment">
      {/* ── Step 1: Trigger selection ── */}
      {step === "trigger" ? (
        <section className="stack">
          <article className="card cardFeature stack">
            <p className="sectionKicker">Quick log</p>
            <h2>What triggered this moment?</h2>
            <p className="muted">
              {todayCount > 0
                ? `${todayCount} moment${todayCount !== 1 ? "s" : ""} logged today`
                : "Tap a trigger to start logging"}
            </p>
          </article>
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
          <div className="bottomCard">
            <span style={{ fontSize: 18 }}>
              {todayCount >= 3 ? "✨" : todayCount > 0 ? "🔥" : "🌱"}
            </span>
            <p className="muted" style={{ margin: 0, flex: 1, fontSize: 13, lineHeight: 1.4 }}>
              {todayCount >= 3
                ? "Nice pattern data building up. Check your report later."
                : todayCount > 0
                  ? `${3 - todayCount} more to unlock stronger observations this week.`
                  : "Each moment you log sharpens your weekly pattern report."}
            </p>
          </div>
        </section>
      ) : null}

      {/* ── Step 2: Emotion selection ── */}
      {step === "emotion" ? (
        <section className="stack">
          <article className="card stack">
            <p className="sectionKicker">{trigger}</p>
            <h2>How did it affect you?</h2>
            <p className="muted">Choose an emotion, add an optional note, then save.</p>
          </article>
          <div className="emotionChipRow">
            {EMOTIONS.map((e) => (
              <button
                key={e}
                className={`emotionChip ${emotion === e ? "emotionChipActive" : ""}`}
                data-emotion={e}
                onClick={() => setEmotion(e)}
                type="button"
              >
                <span className="emotionChipEmoji">{EMOTION_EMOJIS[e] || "•"}</span>
                <span className="emotionChipLabel">{e}</span>
              </button>
            ))}
          </div>

          <label>
            Note (optional)
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What happened right before this?"
            />
          </label>

          {trigger && (TRIGGER_TAGS[trigger] || []).length > 0 ? (
            <div className="tagSection">
              <p className="tagLabel">What kind of moment was this?</p>
              <div className="tagChipRow">
                {TRIGGER_TAGS[trigger].map((tag) => {
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

          {message ? <p className="feedback feedbackPanel" style={{ padding: "12px 16px", borderRadius: 12 }}>{message}</p> : null}
        </section>
      ) : null}
    </Layout>
  );
}