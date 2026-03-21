import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";
import { EmotionGarden } from "../components/EmotionGarden";
import { StreakOrb } from "../components/StreakOrb";
import { MoodWeather } from "../components/MoodWeather";
import { MicroInsight } from "../components/MicroInsight";
import { EMOTION_COLORS } from "../lib/designSystem";

const EMOTION_EMOJIS = {
  frustrated: "\u{1F624}", anxious: "\u{1F630}", neutral: "\u{1F610}", calm: "\u{1F60C}", energized: "\u26A1",
};

const TRIGGER_EMOJIS = {
  work: "\u{1F4BC}", family: "\u{1F3E0}", partner: "\u{1F49B}", social: "\u{1F465}",
  alone: "\u{1F9D8}", exercise: "\u{1F3C3}", travel: "\u2708\uFE0F", health: "\u{1FA7A}", money: "\u{1F4B0}",
};

const MERGE_WINDOW_MS = 30 * 60 * 1000;

function mergeSimilarMoments(moments) {
  if (!moments?.length) return [];
  const merged = [];
  for (const m of moments) {
    const last = merged[merged.length - 1];
    if (last && last.trigger === m.trigger && last.emotion === m.emotion &&
        Math.abs(new Date(last.timestamp).getTime() - new Date(m.timestamp).getTime()) < MERGE_WINDOW_MS) {
      if (!last._count) last._count = 1;
      last._count += 1;
      if (m.note && !last.note) last.note = m.note;
    } else {
      merged.push({ ...m });
    }
  }
  return merged;
}

function groupByDay(moments) {
  const groups = {};
  for (const moment of moments) {
    const date = new Date(moment.timestamp);
    const key = date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
    if (!groups[key]) groups[key] = [];
    groups[key].push(moment);
  }
  return Object.entries(groups);
}

export default function TimelinePage() {
  const { loadTimeline, updateMoment, removeMoment } = useSession();
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(null);
  const [editEmotion, setEditEmotion] = useState("");
  const [editNote, setEditNote] = useState("");

  async function load() {
    try {
      setLoading(true);
      setError("");
      const result = await loadTimeline();
      setMoments(Array.isArray(result) ? result : []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load data. Check connection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function startEdit(moment) {
    setEditing(moment.id);
    setEditEmotion(moment.emotion);
    setEditNote(moment.note || "");
  }

  async function saveEdit(momentId) {
    try {
      await updateMoment(momentId, { emotion: editEmotion, note: editNote });
      setEditing(null);
      await load();
    } catch (err) {
      alert("Edit failed: " + err.message);
    }
  }

  async function handleDelete(momentId) {
    if (!confirm("Delete this moment? This cannot be undone.")) return;
    try {
      await removeMoment(momentId);
      setMoments((prev) => prev.filter((m) => m.id !== momentId));
    } catch (err) {
      alert("Delete failed: " + err.message);
    }
  }

  const merged = mergeSimilarMoments(moments);
  const dayGroups = groupByDay(merged);

  // Determine dominant emotion for state-adaptive glow
  const dominantEmotion = (() => {
    if (!moments?.length) return null;
    const counts = {};
    const now = Date.now();
    for (const m of moments) {
      if (now - new Date(m.timestamp).getTime() < 24 * 60 * 60 * 1000) {
        counts[m.emotion] = (counts[m.emotion] || 0) + 1;
      }
    }
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || null;
  })();

  return (
    <Layout
      title="Timeline"
      actions={<button className="ghostButton" onClick={load} type="button">Refresh</button>}
    >
      {dominantEmotion && <div className="stateGlow" style={{ "--state-color": EMOTION_COLORS[dominantEmotion] || "#7bc9d8" }} />}

      <div className="card cardFeature stack sceneIn">
        <p className="sectionKicker">Past 7 days</p>
        <h2>Timeline</h2>
        <p className="muted">
          {moments.length
            ? `${moments.length} moment${moments.length !== 1 ? "s" : ""} this week`
            : "Your moments, grouped by day."}
        </p>
      </div>

      <MoodWeather moments={moments} />
      <StreakOrb moments={moments} />
      <EmotionGarden moments={moments} />

      {loading ? <div className="card loadingCard">Loading your latest moments...</div> : null}
      {error ? (
        <div className="card feedbackPanel stack">
          <strong>Timeline unavailable</strong>
          <p className="feedback">{error}</p>
          <button className="primaryButton" onClick={load} type="button">Try again</button>
        </div>
      ) : null}

      {!loading && !error && !moments.length ? (
        <div className="card feedbackPanel stack emptyStatePanel">
          <span style={{ fontSize: 56 }}>{"\u{1F4DD}"}</span>
          <strong>No moments yet</strong>
          <p className="feedback">Start logging triggers and emotions to see your timeline come to life.</p>
          <a className="primaryButton inlineButton" href="/">Log a moment</a>
        </div>
      ) : null}

      {!loading && !error && dayGroups.map(([dayLabel, dayMoments]) => (
        <section key={dayLabel} className="sceneIn stack">
          <div className="dayHeader">
            <p className="sectionKicker">{dayLabel}</p>
            <span className="dayCount">{dayMoments.length} {dayMoments.length === 1 ? "moment" : "moments"}</span>
          </div>
          <div className="tlConnector">
            {dayMoments.map((moment, idx) => {
              const eColor = EMOTION_COLORS[moment.emotion] || "#9eb0c9";
              const isLast = idx === dayMoments.length - 1;
              return (
                <div key={moment.id} className="tlItem">
                  <div className="tlDotCol">
                    <div className="tlDot" style={{ background: eColor, boxShadow: `0 0 8px ${eColor}60` }} />
                    {!isLast ? <div className="tlLine" style={{ background: `${eColor}30` }} /> : null}
                  </div>
                  <article className="card momentCard stack tlCard" style={{ borderLeft: `3px solid ${eColor}` }}>
                    {editing === moment.id ? (
                      <div className="stack">
                        <div className="momentMeta">
                          <span className="momentTriggerIcon" style={{ backgroundColor: `${eColor}18`, borderColor: `${eColor}30` }}>
                            {TRIGGER_EMOJIS[moment.trigger] || "\u{1F4CC}"}
                          </span>
                          <span className="momentTrigger">{moment.trigger}</span>
                          <span className="momentArrow">{"\u2192"}</span>
                          <select className="editSelect" value={editEmotion} onChange={(e) => setEditEmotion(e.target.value)}>
                            {EMOTIONS.map((e) => <option key={e} value={e}>{EMOTION_EMOJIS[e] || ""} {e}</option>)}
                          </select>
                        </div>
                        <textarea className="editTextarea" value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2} placeholder="Note (optional)" />
                        <div className="editActions">
                          <button className="primaryButton" type="button" onClick={() => saveEdit(moment.id)}>Save</button>
                          <button className="ghostButton" type="button" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="momentMeta">
                          <span className="momentTriggerIcon" style={{ backgroundColor: `${eColor}18`, borderColor: `${eColor}30` }}>
                            {TRIGGER_EMOJIS[moment.trigger] || "\u{1F4CC}"}
                          </span>
                          <span className="momentTrigger">{moment.trigger}</span>
                          <span className="momentArrow">{"\u2192"}</span>
                          <span className="momentEmotion" data-emotion={moment.emotion}>
                            <span className="emotionEmoji">{EMOTION_EMOJIS[moment.emotion] || "\u2022"}</span>
                            {moment.emotion}
                          </span>
                          {moment._count > 1 ? <span className="momentBadge">{"\u00D7"}{moment._count}</span> : null}
                        </div>
                        <strong>{new Date(moment.timestamp).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</strong>
                        {moment.note ? <p className="momentNote">{moment.note}</p> : null}
                        {moment.tags?.length ? (
                          <div className="momentTagRow">
                            {moment.tags.map((tag) => <span key={tag} className="momentTag">{tag}</span>)}
                          </div>
                        ) : null}
                        <div className="momentActions">
                          <button className="momentActionBtn" type="button" onClick={() => startEdit(moment)}>Edit</button>
                          <button className="momentActionBtn momentActionBtnDanger" type="button" onClick={() => handleDelete(moment.id)}>Delete</button>
                        </div>
                      </>
                    )}
                  </article>
                </div>
              );
            })}
          </div>
        </section>
      ))}

      {!loading && !error && moments.length >= 3 && (
        <MicroInsight text="Patterns become clearer with more data. Keep logging to unlock deeper insights." />
      )}
    </Layout>
  );
}
