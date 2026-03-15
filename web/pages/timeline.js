import { useEffect, useState } from "react";
import Image from "next/image";
import { Layout } from "../components/Layout";
import { fetchTimeline } from "../lib/api";

const EMOTION_EMOJIS = {
  angry: "🔥", anxious: "⚡", sad: "🌧", calm: "🍃", happy: "☀️",
  numb: "🌫", ashamed: "🫧", hopeful: "🌱", frustrated: "💢", grateful: "✨",
};

function groupByDay(moments) {
  const groups = {};
  for (const moment of moments) {
    const date = new Date(moment.timestamp);
    const key = date.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
    if (!groups[key]) {
      groups[key] = [];
    }
    groups[key].push(moment);
  }
  return Object.entries(groups);
}

export default function TimelinePage() {
  const [moments, setMoments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadTimeline() {
    try {
      setLoading(true);
      setError("");
      const payload = await fetchTimeline();
      setMoments(payload.moments || []);
    } catch (loadError) {
      setError(loadError.message || "Unable to load data. Check connection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTimeline();
  }, []);

  const dayGroups = groupByDay(moments);

  return (
    <Layout
      title="Timeline"
      actions={
        <button className="ghostButton" onClick={loadTimeline} type="button">
          Refresh
        </button>
      }
    >
      {loading ? <div className="card loadingCard">Loading your latest moments...</div> : null}
      {error ? (
        <div className="card feedbackPanel stack">
          <strong>Timeline unavailable</strong>
          <p className="feedback">{error}</p>
          <button className="primaryButton" onClick={loadTimeline} type="button">Try again</button>
        </div>
      ) : null}
      {!loading && !error && !moments.length ? (
        <div className="card feedbackPanel stack emptyStatePanel">
          <Image src="/assets/timeline-empty.png" alt="Timeline empty state" width={220} height={220} loading="lazy" className="emptyStateArt" />
          <strong>No moments yet</strong>
          <p className="feedback">Log from the capture screen — your entries will appear here.</p>
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
            <article className="card momentCard stack" key={moment.id}>
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
            </article>
          ))}
        </section>
      ))}
    </Layout>
  );
}