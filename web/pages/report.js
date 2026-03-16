import { useEffect, useState } from "react";
import Image from "next/image";
import { Layout } from "../components/Layout";
import { fetchWeeklyReport } from "../lib/api";

const EMOTION_EMOJIS = {
  angry: "🔥", anxious: "⚡", sad: "🌧", calm: "🍃", happy: "☀️",
  numb: "🌫", ashamed: "🫧", hopeful: "🌱", frustrated: "💢", grateful: "✨",
};

const TIME_ICONS = { morning: "🌅", afternoon: "☀️", evening: "🌆", night: "🌙" };

function formatMetricLabel(value) {
  if (!value || value === "none") return "—";
  return value;
}

function maxValue(record = {}) {
  return Math.max(...Object.values(record).map((v) => Number(v || 0)), 1);
}

function EnergyBar({ label, value, max }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="chartRow">
      <span className="chartLabel">{label}</span>
      <div className="chartTrack">
        <span className="chartBar" style={{ width: `${pct}%` }} />
      </div>
      <span className="chartValue">{value}</span>
    </div>
  );
}

function PremiumGate({ children, available, teaser }) {
  if (!available) return children;
  return (
    <div className="premiumGateWrap">
      <div className="premiumGateBlur">{children}</div>
      <div className="premiumGateOverlay">
        <span className="premiumGateIcon">✦</span>
        <strong className="premiumGateTitle">Premium insight ready</strong>
        <p className="premiumGateText">{teaser}</p>
        <a className="primaryButton inlineButton premiumGateCta" href="/premium">Unlock Premium</a>
      </div>
    </div>
  );
}

export default function ReportPage() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadReport() {
    try {
      setLoading(true);
      setError("");
      const payload = await fetchWeeklyReport();
      setReport(payload.report || null);
    } catch (loadError) {
      setError(loadError.message || "Unable to load data. Check connection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReport(); }, []);

  const triggerMax = maxValue(report?.triggerFrequency);
  const emotionMax = maxValue(report?.emotionFrequency);
  const energyMax = Math.max(
    ...Object.values(report?.energyDistribution || {}).map(Number), 1
  );
  const timeMax = Math.max(
    ...Object.values(report?.timeOfDayPatterns || {}).map(Number), 1
  );

  const hasAi = !!report?.aiInsight?.summary;
  const showPreviewGate = !hasAi && report?.aiPreview?.available;

  return (
    <Layout
      title="Weekly report"
      actions={
        <button className="ghostButton" onClick={loadReport} type="button">Refresh</button>
      }
    >
      {loading ? <div className="card loadingCard">Building your weekly view...</div> : null}
      {error ? (
        <div className="card feedbackPanel stack">
          <strong>Report unavailable</strong>
          <p className="feedback">{error}</p>
          <button className="primaryButton" onClick={loadReport} type="button">Try again</button>
        </div>
      ) : null}

      {report ? (
        <div className="stack reportStack reportAtmosphere">

          {/* ─── AI INSIGHT (premium) or PREVIEW GATE ─── */}
          {hasAi ? (
            <section className="card cardAccent summaryCard stack">
              <span className="summaryLabel">AI insight</span>
              <p className="sectionKicker">Weekly summary</p>
              <h2>{report.aiInsight.summary}</h2>
              {report.aiInsight.suggestion ? <p className="muted">{report.aiInsight.suggestion}</p> : null}
            </section>
          ) : (
            <PremiumGate available={showPreviewGate} teaser={report.aiPreview?.teaser}>
              <section className="card cardFeature stack">
                <p className="sectionKicker">AI summary</p>
                <h2 style={{ color: "#5a6b80" }}>
                  Your week was most shaped by &ldquo;{report.topTrigger}&rdquo; triggers, and you often felt {report.topEmotion}.
                </h2>
                <p className="muted" style={{ color: "#4a5a6e" }}>Upgrade to Premium for personalised suggestions and deeper analysis.</p>
              </section>
            </PremiumGate>
          )}

          {/* ─── HEADLINE METRICS ─── */}
          <section className="metricGrid">
            <article className="card stack metricCard">
              <p className="metricLabel">Top trigger</p>
              <strong className="metricValue">{formatMetricLabel(report.topTrigger)}</strong>
              {report.topPair?.count > 0 ? (
                <span className="metricHint">
                  Most often → {report.topPair.emotion} ({report.topPair.count}×)
                </span>
              ) : null}
            </article>
            <article className="card stack metricCard">
              <p className="metricLabel">Top emotion</p>
              <strong className="metricValue">
                <span className="metricEmoji">{EMOTION_EMOJIS[report.topEmotion] || ""}</span>{" "}
                {formatMetricLabel(report.topEmotion)}
              </strong>
            </article>
            <article className="card stack metricCard">
              <p className="metricLabel">Volatility</p>
              <strong className="metricValue">{formatMetricLabel(report.volatilityChange)}</strong>
              {report.volatilityScore != null ? (
                <span className="metricHint">Score: {report.volatilityScore}</span>
              ) : null}
            </article>
            <article className="card stack metricCard">
              <p className="metricLabel">Most stable day</p>
              <strong className="metricValue">{formatMetricLabel(report.mostStableDay)}</strong>
            </article>
          </section>

          {/* ─── FREQUENCY CHARTS (side by side) ─── */}
          <section className="chartGrid">
            <article className="card stack">
              <p className="sectionKicker">Trigger frequency</p>
              {Object.entries(report.triggerFrequency || {}).length ? (
                Object.entries(report.triggerFrequency)
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, value]) => (
                    <div className="chartRow" key={key}>
                      <span className="chartLabel">{key}</span>
                      <div className="chartTrack">
                        <span className="chartBar" style={{ width: `${(Number(value) / triggerMax) * 100}%` }} />
                      </div>
                      <span className="chartValue">{value}</span>
                    </div>
                  ))
              ) : <p className="muted">No trigger data yet.</p>}
            </article>

            <article className="card stack">
              <p className="sectionKicker">Emotion frequency</p>
              {Object.entries(report.emotionFrequency || {}).length ? (
                Object.entries(report.emotionFrequency)
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, value]) => (
                    <div className="chartRow" key={key}>
                      <span className="chartLabel">
                        <span className="emotionEmoji">{EMOTION_EMOJIS[key] || ""}</span> {key}
                      </span>
                      <div className="chartTrack">
                        <span className="chartBar chartBarWarm" style={{ width: `${(Number(value) / emotionMax) * 100}%` }} />
                      </div>
                      <span className="chartValue">{value}</span>
                    </div>
                  ))
              ) : <p className="muted">No emotion data yet.</p>}
            </article>
          </section>

          {/* ─── ENERGY + TIME OF DAY (side by side) ─── */}
          <section className="chartGrid">
            <article className="card stack">
              <p className="sectionKicker">Energy distribution</p>
              {Object.entries(report.energyDistribution || {}).filter(([, v]) => v > 0).length ? (
                Object.entries(report.energyDistribution)
                  .filter(([, v]) => v > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([key, value]) => (
                    <EnergyBar key={key} label={key} value={value} max={energyMax} />
                  ))
              ) : <p className="muted">Energy data will appear with more logs.</p>}
            </article>

            <article className="card stack">
              <p className="sectionKicker">Time of day</p>
              {Object.entries(report.timeOfDayPatterns || {}).filter(([, v]) => v > 0).length ? (
                Object.entries(report.timeOfDayPatterns)
                  .filter(([, v]) => v > 0)
                  .map(([key, value]) => (
                    <div className="chartRow" key={key}>
                      <span className="chartLabel">{TIME_ICONS[key] || ""} {key}</span>
                      <div className="chartTrack">
                        <span className="chartBar chartBarGold" style={{ width: `${(Number(value) / timeMax) * 100}%` }} />
                      </div>
                      <span className="chartValue">{value}</span>
                    </div>
                  ))
              ) : <p className="muted">Time-of-day data will appear with more logs.</p>}
            </article>
          </section>

          {/* ─── WEEKLY TRAJECTORY ─── */}
          {report.weeklyEmotionTrajectory?.length > 1 ? (
            <section className="card stack">
              <p className="sectionKicker">Weekly emotion trajectory</p>
              <div className="trajectoryRow">
                {report.weeklyEmotionTrajectory.map((day) => (
                  <div className="trajectoryDay" key={day.date}>
                    <span className="trajectoryEmoji">{EMOTION_EMOJIS[day.dominantEmotion] || "•"}</span>
                    <span className="trajectoryScore">{day.score}</span>
                    <span className="trajectoryDate">{new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* ─── CORRELATIONS (premium gate) ─── */}
          <PremiumGate
            available={showPreviewGate}
            teaser="Unlock Premium to see full trigger → emotion correlations."
          >
            <section className="card stack">
              <p className="sectionKicker">Trigger → Emotion correlations</p>
              {Object.entries(report.correlations || {}).length ? (
                Object.entries(report.correlations).map(([trigger, emotions]) => (
                  <div className="correlationRow" key={trigger}>
                    <strong className="correlationTrigger">{trigger}</strong>
                    <div className="correlationChips">
                      {Object.entries(emotions)
                        .sort(([, a], [, b]) => b - a)
                        .map(([emotion, count]) => (
                          <span className="correlationChip" key={emotion} data-emotion={emotion}>
                            {EMOTION_EMOJIS[emotion] || ""} {emotion} ×{count}
                          </span>
                        ))}
                    </div>
                  </div>
                ))
              ) : <p className="muted">Correlations need at least a few trigger-emotion pairs.</p>}
            </section>
          </PremiumGate>

          {/* ─── BEHAVIORAL TAKEAWAYS ─── */}
          <section className="card stack">
            <p className="sectionKicker">Behavioral takeaways</p>
            {report.insights?.length ? report.insights.map((entry, idx) => (
              <div className="insightRow" key={idx}>{entry}</div>
            )) : <p className="muted">Log more moments to unlock weekly takeaways.</p>}
          </section>

          {/* ─── TOTAL MOMENTS FOOTER ─── */}
          <div className="reportFooter">
            <span className="reportFooterText">
              Based on <strong>{report.totalMoments}</strong> moment{report.totalMoments !== 1 ? "s" : ""} this week
            </span>
          </div>
        </div>
      ) : !loading && !error ? (
        <div className="card feedbackPanel stack emptyStatePanel">
          <Image src="/assets/report-empty.png" alt="Weekly report empty state" width={220} height={220} loading="lazy" className="emptyStateArt" />
          <strong>Not enough data yet</strong>
          <p className="feedback">Log a few moments this week and QuietDen will generate your first report.</p>
          <a className="primaryButton inlineButton" href="/">Log a moment</a>
        </div>
      ) : null}
    </Layout>
  );
}