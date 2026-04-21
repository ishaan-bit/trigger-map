import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const EMOTION_EMOJIS = {
  calm: "😌", neutral: "😐", anxious: "😰", frustrated: "😤", energized: "⚡",
  overwhelmed: "😵", heavy: "😞", low: "😔", uneasy: "😟",
};
const TRIGGER_LABELS = {
  work: "Work", family: "Family", partner: "Partner", social: "Social",
  alone: "Alone time", exercise: "Exercise", travel: "Travel", health: "Health", money: "Money",
};

function scoreTone(score) {
  if (score >= 4.2) return { emoji: "🌟", label: "Great", color: "#a78bfa" };
  if (score >= 3.5) return { emoji: "😌", label: "Good", color: "#5ee6a0" };
  if (score >= 2.8) return { emoji: "😐", label: "Mixed", color: "#9eb0c9" };
  if (score >= 2)   return { emoji: "😟", label: "Uneasy", color: "#ffb347" };
  return { emoji: "😤", label: "Tough", color: "#ff6b7a" };
}

export default function SharePage() {
  const router = useRouter();
  const { token } = router.query;
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || "").replace(/\/$/, "");
    fetch(`${apiBase}/api/share?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error?.message || "Not found");
        setSnapshot(json.data);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const title = snapshot?.firstName
    ? `${snapshot.firstName}'s week on TriggerMap`
    : "A week on TriggerMap";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="robots" content="noindex" />
      </Head>
      <div style={styles.page}>
        <div style={styles.header}>
          <p style={styles.brand}>TriggerMap</p>
          <p style={styles.tag}>Shared snapshot · expires in 7 days</p>
        </div>

        {loading && <p style={styles.hint}>Loading…</p>}

        {error && (
          <div style={styles.card}>
            <p style={styles.errorTitle}>This link has expired or doesn't exist.</p>
            <p style={styles.hint}>Share links are valid for 7 days from creation.</p>
          </div>
        )}

        {snapshot && !error && (
          <div style={styles.content}>
            <h1 style={styles.title}>{title}</h1>
            {snapshot.weekLabel && (
              <p style={styles.subtitle}>{snapshot.weekLabel} · {snapshot.daysLogged} day{snapshot.daysLogged !== 1 ? "s" : ""} logged · {snapshot.totalMoments} moment{snapshot.totalMoments !== 1 ? "s" : ""}</p>
            )}

            {/* Headline pills */}
            <div style={styles.pillRow}>
              {snapshot.topEmotion && (
                <div style={styles.pill}>
                  <span>{EMOTION_EMOJIS[snapshot.topEmotion] || "•"}</span>
                  <span style={{ marginLeft: 6 }}>{snapshot.topEmotion}</span>
                </div>
              )}
              {snapshot.topTrigger && (
                <div style={styles.pill}>
                  <span>🎯</span>
                  <span style={{ marginLeft: 6 }}>{TRIGGER_LABELS[snapshot.topTrigger] || snapshot.topTrigger}</span>
                </div>
              )}
              {snapshot.stateOfMind && (
                <div style={styles.pill}>
                  <span>🧠</span>
                  <span style={{ marginLeft: 6, textTransform: "capitalize" }}>{snapshot.stateOfMind}</span>
                </div>
              )}
            </div>

            {/* Emotional trajectory strip */}
            {snapshot.weeklyEmotionTrajectory?.length > 0 && (
              <div style={styles.card}>
                <p style={styles.cardLabel}>Emotional tone this week</p>
                <div style={styles.trajectoryRow}>
                  {snapshot.weeklyEmotionTrajectory.map((day) => {
                    const tone = scoreTone(day.score);
                    return (
                      <div key={day.date} style={styles.dayCell}>
                        <span style={{ fontSize: 20 }}>{tone.emoji}</span>
                        <span style={{ color: tone.color, fontSize: 11, fontWeight: 700 }}>{tone.label}</span>
                        <span style={{ color: "#7e8fa6", fontSize: 10 }}>
                          {new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Insight highlight */}
            {snapshot.llmHighlight && (
              <div style={styles.card}>
                <p style={styles.cardLabel}>What stood out this week</p>
                <p style={styles.insightText}>{snapshot.llmHighlight}</p>
              </div>
            )}

            {/* Top actions */}
            {snapshot.topActions?.length > 0 && (
              <div style={styles.card}>
                <p style={styles.cardLabel}>Suggested actions</p>
                {snapshot.topActions.map((a, i) => (
                  <div key={i} style={styles.actionRow}>
                    <span style={styles.actionDot}>→</span>
                    <span style={styles.actionText}>{a.text}</span>
                  </div>
                ))}
              </div>
            )}

            <p style={styles.cta}>
              Want your own insights?{" "}
              <a href="/" style={styles.ctaLink}>Try TriggerMap</a>
            </p>
          </div>
        )}
      </div>
    </>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#080e1a",
    color: "#e8f0fc",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    padding: "24px 20px 60px",
    maxWidth: 520,
    margin: "0 auto",
  },
  header: { marginBottom: 32 },
  brand: { color: "#78b4ff", fontSize: 13, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", margin: 0 },
  tag: { color: "#7e8fa6", fontSize: 12, margin: "4px 0 0" },
  title: { fontSize: 26, fontWeight: 800, lineHeight: 1.25, margin: "0 0 6px" },
  subtitle: { color: "#9eb0c9", fontSize: 14, margin: "0 0 20px" },
  hint: { color: "#7e8fa6", fontSize: 14 },
  pillRow: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  pill: {
    display: "inline-flex", alignItems: "center",
    padding: "6px 12px", borderRadius: 20,
    backgroundColor: "rgba(120,180,255,0.08)",
    border: "1px solid rgba(120,180,255,0.15)",
    fontSize: 13, fontWeight: 600,
  },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 12,
    padding: "16px",
    marginBottom: 14,
  },
  cardLabel: { color: "#9eb0c9", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", margin: "0 0 12px" },
  trajectoryRow: { display: "flex", overflowX: "auto", gap: 8 },
  dayCell: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: 4, minWidth: 52, padding: "10px 6px",
    borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  insightText: { color: "#c8d8f0", fontSize: 14, lineHeight: 1.6, margin: 0 },
  actionRow: { display: "flex", gap: 8, marginBottom: 10, alignItems: "flex-start" },
  actionDot: { color: "#78b4ff", fontWeight: 700, flexShrink: 0, marginTop: 1 },
  actionText: { color: "#c8d8f0", fontSize: 14, lineHeight: 1.5 },
  errorTitle: { color: "#ff6b7a", fontWeight: 700, margin: "0 0 8px" },
  content: {},
  cta: { color: "#7e8fa6", fontSize: 13, marginTop: 24, textAlign: "center" },
  ctaLink: { color: "#78b4ff", textDecoration: "none", fontWeight: 600 },
};
