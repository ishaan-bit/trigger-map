import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";

const EMOTION_EMOJIS = {
  frustrated: "💢", anxious: "⚡", neutral: "🌫️", calm: "🍃", energized: "☀️",
};

const EMOTION_BORDER_COLORS = {
  frustrated: "#f07f84",
  anxious: "#f0b96a",
  neutral: "#9eb0c9",
  calm: "#9de4b7",
  energized: "#f0d96a",
};

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

  const dayGroups = groupByDay(moments);

  return (
    <Layout
      title="Timeline"
      actions={<button className="ghostButton" onClick={load} type="button">Refresh</button>}
    >
      <div className="card cardFeature stack">
        <p className="sectionKicker">Past 7 days</p>
        <h2>Timeline</h2>
        <p className="muted">
          {moments.length
            ? `${moments.length} moment${moments.length !== 1 ? "s" : ""} this week`
            : "Your moments, grouped by day."}
        </p>
      </div>

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
          <span style={{ fontSize: 56 }}>📝</span>
          <strong>No moments yet</strong>
          <p className="feedback">Start logging triggers and emotions to see your timeline come to life.</p>
          <a className="primaryButton inlineButton" href="/">Log a moment</a>
        </div>
      ) : null}

      {!loading && !error && dayGroups.map(([dayLabel, dayMoments]) => (
        <section key={dayLabel} className="stack">
          <div className="dayHeader">
            <p className="sectionKicker">{dayLabel}</p>
            <span className="dayCount">{dayMoments.length} {dayMoments.length === 1 ? "moment" : "moments"}</span>
          </div>
          {dayMoments.map((moment) => (
            <article
              className="card momentCard stack"
              key={moment.id}
              style={{ borderLeftWidth: 3, borderLeftColor: EMOTION_BORDER_COLORS[moment.emotion] || "#9eb0c9" }}
            >
              {editing === moment.id ? (
                /* ── Edit mode ── */
                <div className="stack">
                  <div className="momentMeta">
                    <span className="momentTrigger">{moment.trigger}</span>
                    <span className="momentArrow">→</span>
                    <select
                      className="editSelect"
                      value={editEmotion}
                      onChange={(e) => setEditEmotion(e.target.value)}
                    >
                      {EMOTIONS.map((e) => <option key={e} value={e}>{EMOTION_EMOJIS[e] || ""} {e}</option>)}
                    </select>
                  </div>
                  <textarea
                    className="editTextarea"
                    value={editNote}
                    onChange={(e) => setEditNote(e.target.value)}
                    rows={2}
                    placeholder="Note (optional)"
                  />
                  <div className="editActions">
                    <button className="primaryButton" type="button" onClick={() => saveEdit(moment.id)}>Save</button>
                    <button className="ghostButton" type="button" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </div>
              ) : (
                /* ── View mode ── */
                <>
                  <div className="momentMeta">
                    <span className="momentTrigger">{moment.trigger}</span>
                    <span className="momentArrow">→</span>
                    <span className="momentEmotion" data-emotion={moment.emotion}>
                      <span className="emotionEmoji">{EMOTION_EMOJIS[moment.emotion] || "•"}</span>
                      {moment.emotion}
                    </span>
                  </div>
                  <strong>{new Date(moment.timestamp).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</strong>
                  {moment.note ? <p className="momentNote">{moment.note}</p> : null}
                  <div className="momentActions">
                    <button className="momentActionBtn" type="button" onClick={() => startEdit(moment)}>Edit</button>
                    <button className="momentActionBtn momentActionBtnDanger" type="button" onClick={() => handleDelete(moment.id)}>Delete</button>
                  </div>
                </>
              )}
            </article>
          ))}
        </section>
      ))}
    </Layout>
  );
}
