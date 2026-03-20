import { useEffect, useState } from "react";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";
import { EMOTIONS } from "@triggermap/shared/constants/emotions";

const EMOTION_EMOJIS = {
  frustrated: "�", anxious: "😰", neutral: "😐", calm: "😌", energized: "⚡",
};

const EMOTION_COLORS = {
  calm: "#5ee6a0",
  neutral: "#9eb0c9",
  anxious: "#ffb347",
  frustrated: "#ff6b7a",
  energized: "#a78bfa",
};

const WEATHER_MAP = {
  calm:      { icon: "☀️", label: "Clear skies",  desc: "Your recent moments lean calm. A good day to notice what's working." },
  neutral:   { icon: "🌤️", label: "Partly clear", desc: "Steady and grounded. Not much turbulence in your recent moments." },
  anxious:   { icon: "🌧️", label: "Overcast",     desc: "Some tension showing up. Be gentle with yourself." },
  frustrated:{ icon: "⛈️", label: "Turbulent",    desc: "Friction in the air. Take it one moment at a time." },
  energized: { icon: "⚡", label: "Electric",      desc: "High energy in your recent logs. Ride it wisely." },
  mixed:     { icon: "🌦️", label: "Changeable",   desc: "Emotions shifting. That's okay. Patterns reveal themselves over time." },
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
  const weather = computeWeather(moments);

  return (
    <Layout
      title="Timeline"
      actions={<button className="ghostButton" onClick={load} type="button">Refresh</button>}
    >
      <div className="card cardFeature stack sceneIn">
        <p className="sectionKicker">Past 7 days</p>
        <h2>Timeline</h2>
        <p className="muted">
          {moments.length
            ? `${moments.length} moment${moments.length !== 1 ? "s" : ""} this week`
            : "Your moments, grouped by day."}
        </p>
      </div>

      {/* Emotional weather ribbon */}
      <div className="weatherRibbon sceneIn">
        <div className="weatherShimmer" />
        <span className="weatherIcon">{weather.icon}</span>
        <div className="weatherCopy">
          <strong className="weatherLabel">{weather.label}</strong>
          <p className="weatherDesc">{weather.desc}</p>
        </div>
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
                  <article className="card momentCard stack tlCard">
                    {editing === moment.id ? (
                      <div className="stack">
                        <div className="momentMeta">
                          <span className="momentTrigger">{moment.trigger}</span>
                          <span className="momentArrow">→</span>
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
                          <span className="momentTrigger">{moment.trigger}</span>
                          <span className="momentArrow">→</span>
                          <span className="momentEmotion" data-emotion={moment.emotion}>
                            <span className="emotionEmoji">{EMOTION_EMOJIS[moment.emotion] || "•"}</span>
                            {moment.emotion}
                          </span>
                          {moment._count > 1 ? <span className="momentBadge">×{moment._count}</span> : null}
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
    </Layout>
  );
}
