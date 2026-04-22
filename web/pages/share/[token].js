import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";

const PLAY_STORE_URL = "https://play.google.com/store/apps/details?id=com.triggermap.app";

const EMOTION_EMOJIS = {
  calm: "😌", neutral: "😐", anxious: "😰", frustrated: "😤", energized: "⚡",
  overwhelmed: "😵", heavy: "😞", low: "😔", uneasy: "😟", happy: "😊",
  excited: "🤩", peaceful: "🕊️", motivated: "💪", grateful: "🙏",
};
const TRIGGER_LABELS = {
  work: "Work", family: "Family", partner: "Partner", social: "Social",
  alone: "Alone time", exercise: "Exercise", travel: "Travel", health: "Health", money: "Money",
};

function emoji(emotion) { return EMOTION_EMOJIS[emotion] || "•"; }
function triggerLabel(t) { return TRIGGER_LABELS[t] || (t ? t[0].toUpperCase() + t.slice(1) : ""); }

function scoreTone(score) {
  if (score >= 4.2) return { emoji: "🌟", label: "Great", color: "#a78bfa" };
  if (score >= 3.5) return { emoji: "😌", label: "Good", color: "#5ee6a0" };
  if (score >= 2.8) return { emoji: "😐", label: "Mixed", color: "#9eb0c9" };
  if (score >= 2)   return { emoji: "😟", label: "Uneasy", color: "#ffb347" };
  return { emoji: "😤", label: "Tough", color: "#ff6b7a" };
}

function confidenceLabel(c) {
  if (c === "high") return "High confidence";
  if (c === "medium" || c === "moderate") return "Building picture";
  if (c === "low") return "Early signal";
  return "Just getting started";
}

export default function SharePage() {
  const router = useRouter();
  const { token } = router.query;
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    // Defensive: env vars sometimes ship with stray whitespace/CRLF — strip everything weird.
    const apiBase = (process.env.NEXT_PUBLIC_API_URL || "")
      .trim()
      .replace(/[\r\n\s]+/g, "")
      .replace(/\/$/, "");
    if (!apiBase) {
      setError("Configuration issue. Please reach out to support.");
      setLoading(false);
      return;
    }
    fetch(`${apiBase}/api/share?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((json) => {
        if (!json.ok) throw new Error(json.error?.message || "Not found");
        setSnapshot(json.data);
      })
      .catch((e) => setError(e.message || "Could not load this snapshot"))
      .finally(() => setLoading(false));
  }, [token]);

  const title = snapshot?.firstName
    ? `${snapshot.firstName}'s week on TriggerMap`
    : "A week on TriggerMap";
  const description = snapshot
    ? `${snapshot.totalMoments} moments · ${snapshot.daysLogged} days logged${snapshot.topEmotion ? ` · mostly ${snapshot.topEmotion}` : ""}`
    : "A private weekly emotional snapshot from TriggerMap.";

  return (
    <>
      <Head>
        <title>{title}</title>
        <meta name="description" content={description} />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta name="twitter:card" content="summary" />
      </Head>
      <div style={styles.page}>
        <div style={styles.header}>
          <p style={styles.brand}>● TriggerMap</p>
          <p style={styles.tag}>Private snapshot · expires in 7 days</p>
        </div>

        {loading && (
          <div style={styles.card}>
            <div style={styles.skeletonLine} />
            <div style={{ ...styles.skeletonLine, width: "60%" }} />
            <div style={{ ...styles.skeletonLine, width: "80%" }} />
          </div>
        )}

        {error && !loading && (
          <div style={styles.card}>
            <p style={styles.errorTitle}>This link has expired or doesn't exist.</p>
            <p style={styles.hint}>Share links are valid for 7 days from creation. Ask the sender to generate a new one.</p>
            <a href={PLAY_STORE_URL} style={styles.ctaButton}>📱 Get TriggerMap on Google Play</a>
          </div>
        )}

        {snapshot && !error && (
          <div style={styles.content}>
            <h1 style={styles.title}>{title}</h1>
            <p style={styles.subtitle}>
              {snapshot.weekLabel ? `${snapshot.weekLabel} · ` : ""}
              {snapshot.daysLogged} day{snapshot.daysLogged !== 1 ? "s" : ""} logged · {snapshot.totalMoments} moment{snapshot.totalMoments !== 1 ? "s" : ""}
            </p>

            {/* Headline pills */}
            <div style={styles.pillRow}>
              {snapshot.topEmotion && (
                <div style={styles.pill}>
                  <span>{emoji(snapshot.topEmotion)}</span>
                  <span style={styles.pillText}>mostly {snapshot.topEmotion}</span>
                </div>
              )}
              {snapshot.topTrigger && (
                <div style={styles.pill}>
                  <span>🎯</span>
                  <span style={styles.pillText}>{triggerLabel(snapshot.topTrigger)} dominant</span>
                </div>
              )}
              {snapshot.stability && (
                <div style={styles.pill}>
                  <span>🧭</span>
                  <span style={styles.pillText}>{snapshot.stability}</span>
                </div>
              )}
              {snapshot.drift && (
                <div style={styles.pill}>
                  <span>📉</span>
                  <span style={styles.pillText}>{snapshot.drift}</span>
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
                        <span style={{ fontSize: 22 }}>{tone.emoji}</span>
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

            {/* Signature loop */}
            {snapshot.signatureLoop && (
              <div style={styles.card}>
                <p style={styles.cardLabel}>Signature pattern</p>
                <div style={styles.loopRow}>
                  <div style={styles.loopChip}>
                    <span style={{ fontSize: 18 }}>🎯</span>
                    <span style={styles.loopChipLabel}>{triggerLabel(snapshot.signatureLoop.trigger)}</span>
                  </div>
                  <span style={styles.loopArrow}>→</span>
                  <div style={styles.loopChip}>
                    <span style={{ fontSize: 18 }}>{emoji(snapshot.signatureLoop.emotion)}</span>
                    <span style={styles.loopChipLabel}>{snapshot.signatureLoop.emotion}</span>
                  </div>
                </div>
                <p style={styles.loopMeta}>Repeated {snapshot.signatureLoop.count}× this week</p>
              </div>
            )}

            {/* Helped vs Friction grid */}
            {(snapshot.helped || snapshot.friction) && (
              <div style={styles.splitGrid}>
                {snapshot.helped && (
                  <div style={{ ...styles.card, ...styles.helpCard }}>
                    <p style={styles.cardLabel}>✅ What helped</p>
                    <p style={styles.smallEmoji}>{emoji(snapshot.helped.emotion)}</p>
                    <p style={styles.helpText}>{triggerLabel(snapshot.helped.trigger)} → {snapshot.helped.emotion}</p>
                  </div>
                )}
                {snapshot.friction && (
                  <div style={{ ...styles.card, ...styles.frictionCard }}>
                    <p style={styles.cardLabel}>⚠️ Added friction</p>
                    <p style={styles.smallEmoji}>{emoji(snapshot.friction.emotion)}</p>
                    <p style={styles.frictionText}>{triggerLabel(snapshot.friction.trigger)} → {snapshot.friction.emotion}</p>
                  </div>
                )}
              </div>
            )}

            {/* Insight highlight */}
            {(snapshot.insightSummary || snapshot.llmHighlight) && (
              <div style={styles.card}>
                <p style={styles.cardLabel}>💡 What stood out</p>
                <p style={styles.insightText}>{snapshot.insightSummary || snapshot.llmHighlight}</p>
              </div>
            )}

            {/* Top actions */}
            {snapshot.topActions?.length > 0 && (
              <div style={styles.card}>
                <p style={styles.cardLabel}>Suggested next steps</p>
                {snapshot.topActions.map((a, i) => (
                  <div key={i} style={styles.actionRow}>
                    <span style={styles.actionDot}>→</span>
                    <span style={styles.actionText}>{a.text}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Confidence footer */}
            <p style={styles.confidence}>{confidenceLabel(snapshot.confidence)}</p>

            {/* Strong CTA */}
            <div style={styles.ctaCard}>
              <p style={styles.ctaTitle}>Want your own emotional snapshot?</p>
              <p style={styles.ctaBody}>TriggerMap maps your moods, triggers, and patterns — privately, in under 30 seconds a day.</p>
              <a href={PLAY_STORE_URL} style={styles.ctaButton}>📱 Get TriggerMap on Google Play</a>
              <p style={styles.ctaFinePrint}>Free · No account needed to start</p>
            </div>

            <p style={styles.footer}>This snapshot contains no personal notes or raw entries. Just patterns.</p>
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
    maxWidth: 540,
    margin: "0 auto",
  },
  header: { marginBottom: 28 },
  brand: { color: "#78b4ff", fontSize: 13, fontWeight: 700, letterSpacing: 1.4, textTransform: "uppercase", margin: 0 },
  tag: { color: "#7e8fa6", fontSize: 12, margin: "4px 0 0" },
  title: { fontSize: 26, fontWeight: 800, lineHeight: 1.25, margin: "0 0 6px" },
  subtitle: { color: "#9eb0c9", fontSize: 14, margin: "0 0 20px" },
  hint: { color: "#7e8fa6", fontSize: 14, margin: "0 0 16px" },
  pillRow: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  pill: {
    display: "inline-flex", alignItems: "center", gap: 6,
    padding: "7px 13px", borderRadius: 20,
    backgroundColor: "rgba(120,180,255,0.10)",
    border: "1px solid rgba(120,180,255,0.20)",
    fontSize: 13, fontWeight: 600,
  },
  pillText: { textTransform: "capitalize" },
  card: {
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 14,
    padding: "16px",
    marginBottom: 14,
  },
  cardLabel: { color: "#9eb0c9", fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: "uppercase", margin: "0 0 12px" },
  trajectoryRow: { display: "flex", overflowX: "auto", gap: 8 },
  dayCell: {
    display: "flex", flexDirection: "column", alignItems: "center",
    gap: 4, minWidth: 56, padding: "10px 6px",
    borderRadius: 10, backgroundColor: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.07)",
  },
  loopRow: {
    display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
  },
  loopChip: {
    display: "inline-flex", alignItems: "center", gap: 8,
    padding: "8px 12px", borderRadius: 10,
    backgroundColor: "rgba(120,180,255,0.10)",
    border: "1px solid rgba(120,180,255,0.18)",
  },
  loopChipLabel: { fontSize: 14, fontWeight: 700, textTransform: "capitalize" },
  loopArrow: { color: "#78b4ff", fontSize: 18, fontWeight: 700 },
  loopMeta: { color: "#9eb0c9", fontSize: 12, margin: "10px 0 0" },
  splitGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 },
  helpCard: { borderColor: "rgba(94,230,160,0.25)", marginBottom: 0 },
  helpText: { color: "#5ee6a0", fontSize: 13, fontWeight: 600, margin: 0, textTransform: "capitalize" },
  frictionCard: { borderColor: "rgba(255,179,71,0.30)", marginBottom: 0 },
  frictionText: { color: "#ffb347", fontSize: 13, fontWeight: 600, margin: 0, textTransform: "capitalize" },
  smallEmoji: { fontSize: 22, margin: "0 0 6px" },
  insightText: { color: "#dbe6f5", fontSize: 14, lineHeight: 1.6, margin: 0 },
  actionRow: { display: "flex", gap: 8, marginBottom: 10, alignItems: "flex-start" },
  actionDot: { color: "#78b4ff", fontWeight: 700, flexShrink: 0, marginTop: 1 },
  actionText: { color: "#dbe6f5", fontSize: 14, lineHeight: 1.5 },
  errorTitle: { color: "#ff6b7a", fontWeight: 700, margin: "0 0 8px" },
  content: {},
  confidence: {
    color: "#7e8fa6", fontSize: 11, textAlign: "center",
    margin: "16px 0 24px", textTransform: "uppercase", letterSpacing: 1, fontWeight: 600,
  },
  ctaCard: {
    backgroundColor: "rgba(120,180,255,0.08)",
    border: "1px solid rgba(120,180,255,0.25)",
    borderRadius: 16,
    padding: "20px",
    textAlign: "center",
    marginTop: 12,
  },
  ctaTitle: { color: "#e8f0fc", fontSize: 17, fontWeight: 800, margin: "0 0 6px" },
  ctaBody: { color: "#9eb0c9", fontSize: 13, lineHeight: 1.5, margin: "0 0 16px" },
  ctaButton: {
    display: "inline-block",
    backgroundColor: "#78b4ff",
    color: "#080e1a",
    padding: "13px 22px",
    borderRadius: 10,
    fontWeight: 800,
    fontSize: 15,
    textDecoration: "none",
    boxShadow: "0 4px 18px rgba(120,180,255,0.35)",
  },
  ctaFinePrint: { color: "#7e8fa6", fontSize: 11, margin: "12px 0 0" },
  footer: { color: "#5e6c80", fontSize: 11, textAlign: "center", margin: "24px 0 0", fontStyle: "italic" },
  skeletonLine: {
    height: 14, width: "100%", borderRadius: 6,
    backgroundColor: "rgba(255,255,255,0.06)",
    marginBottom: 10,
  },
};
