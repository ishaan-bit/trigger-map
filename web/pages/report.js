import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";

const EMOTION_EMOJIS = {
  frustrated: "💢", anxious: "⚡", neutral: "🌫️", calm: "🍃", energized: "☀️",
};

const TIME_ICONS = { morning: "🌅", afternoon: "☀️", evening: "🌆", night: "🌙" };

const ENERGY_COLORS = {
  steady: "#9de4b7", balanced: "#7bc9d8", tense: "#f0b96a",
  drained: "#f07f84", uplifted: "#c084fc",
};

const CONFIDENCE_LABELS = {
  too_early: "Just getting started",
  low: "Early patterns",
  emerging: "Taking shape",
  moderate: "Solid picture",
  strong: "High confidence",
};

function cleanText(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\u2014/g, ", ")
    .replace(/\u2013/g, ", ")
    .trim();
}

function parseLlmSections(narrative) {
  if (!narrative) return null;
  const text = cleanText(narrative);

  const headerRe = /(?:what stood out|what may be contributing|one thing to try)/gi;
  const labelMap = [
    /what stood out/i,
    /what may be contributing/i,
    /one thing to try/i,
  ];

  const hits = [];
  let m;
  while ((m = headerRe.exec(text)) !== null) {
    const section = labelMap.findIndex((p) => p.test(m[0]));
    if (section >= 0) hits.push({ idx: m.index, section, len: m[0].length });
  }

  const seen = new Set();
  const firstHits = [];
  for (const h of hits) {
    if (!seen.has(h.section)) {
      seen.add(h.section);
      firstHits.push(h);
    }
  }
  firstHits.sort((a, b) => a.idx - b.idx);

  if (firstHits.length >= 2) {
    let cutoff = text.length;
    const seenAgain = new Set();
    for (const h of hits) {
      if (seenAgain.has(h.section)) { cutoff = Math.min(cutoff, h.idx); break; }
      seenAgain.add(h.section);
    }
    const cleanedText = text.slice(0, cutoff).trim();

    const result = [null, null, null];
    for (let i = 0; i < firstHits.length; i++) {
      const start = firstHits[i].idx + firstHits[i].len;
      const end = i < firstHits.length - 1 ? firstHits[i + 1].idx : cleanedText.length;
      result[firstHits[i].section] = cleanedText.slice(start, end).replace(/^\s*[:\-\u2013\u2014]?\s*/, "").trim();
    }
    return result;
  }

  const chunks = text.split(/\n\s*\n/).filter(Boolean).slice(0, 3);
  return [
    chunks[0] || text,
    chunks[1] || null,
    chunks[2] || null,
  ];
}

const INSIGHT_SECTION_META = [
  { icon: "🔍", label: "What stood out" },
  { icon: "🧩", label: "What may be contributing" },
  { icon: "💡", label: "One thing to try" },
];

function topEntries(record, limit = 5) {
  return Object.entries(record || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
}

function HBar({ label, value, max, color = "#7bc9d8", icon }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="chartRow">
      <span className="chartLabel">{icon ? `${icon} ` : ""}{label}</span>
      <div className="chartTrack">
        <span className="chartBar" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="chartValue">{value}</span>
    </div>
  );
}

function SectionHeader({ label, badge, extra }) {
  return (
    <div className="reportSectionHeader">
      <div className="reportSectionHeaderLeft">
        <span className="sectionKicker">{label.toUpperCase()}</span>
        {badge ? (
          <span className={`freqBadge ${badge === "weekly" ? "freqBadgeWeekly" : ""}`}>
            {badge === "weekly" ? "WEEKLY" : "LIVE"}
          </span>
        ) : null}
      </div>
      {extra ? <span className="reportSectionExtra">{extra}</span> : null}
    </div>
  );
}

function LockedSection({ title, teaser, ctaLabel, onAction, children }) {
  return (
    <div className="lockedWrap">
      <div className="lockedContent">{children}</div>
      <div className="lockedGradient" />
      <div className="lockedOverlay">
        <span className="lockedIcon">🔒</span>
        <strong className="lockedTitle">{title}</strong>
        <p className="lockedTeaser">{teaser}</p>
        <button className="primaryButton inlineButton" onClick={onAction} type="button">{ctaLabel}</button>
      </div>
    </div>
  );
}

function PairingChip({ trigger, emotion, count, positive }) {
  const cls = positive ? "pairingChipPositive" : "pairingChipNegative";
  return (
    <span className={`pairingChip ${cls}`}>{trigger} → {emotion} ×{count}</span>
  );
}

export default function ReportPage() {
  const router = useRouter();
  const { loadWeeklyReport, isSignedIn } = useSession();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadReport() {
    try {
      setLoading(true);
      setError("");
      const data = await loadWeeklyReport();
      setReport(data || null);
    } catch (loadError) {
      setError(loadError.message || "Unable to load data. Check connection.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadReport(); }, []);

  const dq = report?.dataQuality || {};
  const confidence = dq.confidence || "too_early";
  const hasRuleInsight = !!report?.aiInsight?.summary;
  const hasLlmInsight = !!report?.llmInsight?.narrative;
  const hasLlmTeaser = !!report?.llmTeaser?.narrative;

  const triggerEntries = topEntries(report?.triggerFrequency, 6);
  const emotionEntries = topEntries(report?.emotionFrequency, 6);
  const triggerMax = triggerEntries[0]?.[1] || 1;
  const emotionMax = emotionEntries[0]?.[1] || 1;
  const energyEntries = Object.entries(report?.energyDistribution || {}).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
  const energyMax = energyEntries[0]?.[1] || 1;
  const timeEntries = Object.entries(report?.timeOfDayPatterns || {}).filter(([, v]) => v > 0);
  const timeMax = Math.max(...timeEntries.map(([, v]) => v), 1);

  return (
    <Layout
      title="Weekly report"
      actions={<button className="ghostButton" onClick={loadReport} type="button">Refresh</button>}
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
        <div className="stack reportStack">

          {/* ── 1. AT A GLANCE HERO ── */}
          <div className="card cardFeature stack">
            <p className="sectionKicker">Weekly patterns</p>
            <h2>Your Week</h2>
            {report.totalMoments ? (
              <p className="muted">
                {report.totalMoments} moment{report.totalMoments !== 1 ? "s" : ""} across {dq.daysLogged || "-"} day{(dq.daysLogged || 0) !== 1 ? "s" : ""}
              </p>
            ) : null}
            {report.totalMoments ? (
              <div className="heroRow">
                <span className="heroPill">
                  <span>{report.topEmotion ? (EMOTION_EMOJIS[report.topEmotion] || "•") : "🌀"}</span>
                  {report.topEmotion || "Mixed"}
                </span>
                <span className="heroPill">
                  <span>🎯</span>
                  {report.topTrigger || (report.tiedTriggers?.length > 1 ? `${report.tiedTriggers.length} areas` : "-")}
                </span>
                <span className="heroPill heroPillConfidence">
                  {CONFIDENCE_LABELS[confidence] || confidence}
                </span>
              </div>
            ) : null}
            {hasRuleInsight ? (
              <div className="takeawayBar">{cleanText(report.aiInsight.summary)}</div>
            ) : null}
          </div>

          {/* Starter state */}
          {confidence === "too_early" ? (
            <div className="card stack" style={{ textAlign: "center" }}>
              <span style={{ fontSize: 48 }}>🌱</span>
              <strong>A few more moments to go</strong>
              <p className="muted">Log at least 3 moments this week for patterns to start forming. The more days you cover, the sharper the picture.</p>
              <a className="primaryButton inlineButton" href="/">Log a moment</a>
            </div>
          ) : null}

          {confidence !== "too_early" ? (
            <>
              {/* ── 2. WHAT SHOWED UP ── */}
              <SectionHeader label="What showed up" badge="live" extra={`${dq.uniqueEmotions || 0} emotions · ${dq.uniqueTriggers || 0} triggers`} />

              {emotionEntries.length ? (
                <div className="card stack">
                  {emotionEntries.map(([key, value]) => (
                    <HBar key={key} label={key} value={value} max={emotionMax} color="#f0b96a" icon={EMOTION_EMOJIS[key]} />
                  ))}
                </div>
              ) : null}

              {triggerEntries.length ? (
                <div className="card stack">
                  {triggerEntries.map(([key, value]) => (
                    <HBar key={key} label={key} value={value} max={triggerMax} />
                  ))}
                </div>
              ) : null}

              {dq.hasEnoughForRhythm && timeEntries.length ? (
                <div className="card stack">
                  <p className="sectionKicker">When you logged</p>
                  {timeEntries.map(([key, value]) => (
                    <HBar key={key} label={key} value={value} max={timeMax} color="#f0b96a" icon={TIME_ICONS[key]} />
                  ))}
                </div>
              ) : null}

              {/* ── 3. WHAT HELPED / WHAT DRAINED ── */}
              {(report.regulators?.length > 0 || report.frictionZones?.length > 0) ? (
                <>
                  <SectionHeader label="What helped · What drained" badge="live" />
                  <div className="card stack">
                    {report.regulators?.length ? (
                      <div className="pairingGroup">
                        <span className="pairingGroupLabel">🌿 Regulators</span>
                        <div className="pairingList">
                          {report.regulators.slice(0, 4).map((r) => (
                            <PairingChip key={`${r.trigger}-${r.emotion}`} trigger={r.trigger} emotion={r.emotion} count={r.count} positive />
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {report.frictionZones?.length ? (
                      <div className="pairingGroup">
                        <span className="pairingGroupLabel">🔥 Friction zones</span>
                        <div className="pairingList">
                          {report.frictionZones.slice(0, 4).map((f) => (
                            <PairingChip key={`${f.trigger}-${f.emotion}`} trigger={f.trigger} emotion={f.emotion} count={f.count} positive={false} />
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                </>
              ) : null}

              {/* ── 4. PATTERNS & PAIRINGS (sign-in gate) ── */}
              {!isSignedIn && confidence !== "low" ? (
                <LockedSection
                  title="Patterns and pairings"
                  teaser="Create a free account to see emotional correlations, energy flow, and weekly trajectory."
                  ctaLabel="Sign in to unlock"
                  onAction={() => { router.push("/login"); }}
                >
                  <div className="card">
                    <p className="muted">Deeper correlations between triggers and emotions appear here once you sign in.</p>
                  </div>
                </LockedSection>
              ) : (
                <>
                  {/* Correlations */}
                  {dq.hasEnoughForPairings && Object.keys(report.correlations || {}).length ? (
                    <>
                      <SectionHeader label="Trigger → Emotion" badge="live" />
                      <div className="card stack">
                        {Object.entries(report.correlations).slice(0, 5).map(([trigger, emotions]) => (
                          <div className="correlationRow" key={trigger}>
                            <strong className="correlationTrigger">{trigger}</strong>
                            <div className="correlationChips">
                              {Object.entries(emotions).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a).slice(0, 3).map(([emo, count]) => (
                                <span className="correlationChip" key={emo} data-emotion={emo}>
                                  {EMOTION_EMOJIS[emo] || ""} {emo} ×{count}
                                </span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {/* Energy flow */}
                  {energyEntries.length ? (
                    <>
                      <SectionHeader label="Energy flow" badge="live" />
                      <div className="card stack">
                        {energyEntries.map(([key, value]) => (
                          <HBar key={key} label={key} value={value} max={energyMax} color={ENERGY_COLORS[key] || "#7bc9d8"} />
                        ))}
                      </div>
                    </>
                  ) : null}

                  {/* Stability */}
                  {dq.hasEnoughForStability ? (
                    <>
                      <SectionHeader label="Stability" badge="weekly" />
                      <div className="metricGrid metricGridTwo">
                        {report.volatilityScore !== null ? (
                          <div className="card stack metricCard">
                            <p className="metricLabel">Volatility</p>
                            <strong className="metricValue">
                              {report.volatilityScore < 0.5 ? "🟢" : report.volatilityScore < 1.5 ? "🟡" : "🔴"} {report.volatilityScore}
                            </strong>
                          </div>
                        ) : null}
                        {report.mostStableDay ? (
                          <div className="card stack metricCard">
                            <p className="metricLabel">Steadiest day</p>
                            <strong className="metricValue">
                              {new Date(report.mostStableDay).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                            </strong>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : null}

                  {/* Trajectory */}
                  {dq.hasEnoughForTrajectory && report.weeklyEmotionTrajectory?.length > 1 ? (
                    <>
                      <SectionHeader label="Emotion trajectory" badge="live" />
                      {report.trajectoryNote ? (
                        <p className="muted" style={{ fontSize: 13 }}>{cleanText(report.trajectoryNote)}</p>
                      ) : null}
                      <div className="trajectoryRow">
                        {report.weeklyEmotionTrajectory.map((day) => (
                          <div className="trajectoryDay" key={day.date}>
                            <span className="trajectoryEmoji">{EMOTION_EMOJIS[day.dominantEmotion] || "•"}</span>
                            <span className="trajectoryScore">{day.score}</span>
                            <span className="trajectoryDate">
                              {new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}
                            </span>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : null}

                  {/* Gut check */}
                  {report.predictionAccuracy ? (
                    <>
                      <SectionHeader label="Gut check" badge="live" />
                      <div className="card gutCheckCard">
                        <span className="gutCheckEmoji">
                          {report.predictionAccuracy.rate >= 0.5 ? "🎯" : "🔮"}
                        </span>
                        <div className="gutCheckContent">
                          <strong>{report.predictionAccuracy.correct} of {report.predictionAccuracy.daysCompared} days</strong>
                          <p className="muted">
                            {report.predictionAccuracy.rate >= 0.6
                              ? "Your morning gut feeling matched how the day actually went. Strong self-awareness."
                              : report.predictionAccuracy.rate >= 0.3
                                ? "Your predictions were a mixed bag. Your days may hold more surprises than you expect."
                                : "Your days unfolded differently than expected. Not a bad thing — it means you're adapting."}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </>
              )}

              {/* ── 5. TRY THIS WEEK ── */}
              {report.aiInsight?.microExperiment ? (
                <div className="card experimentCard">
                  <span className="aiLabelPill aiLabelPillGreen">Try this week</span>
                  <p>{cleanText(report.aiInsight.microExperiment)}</p>
                </div>
              ) : null}

              {/* ── 6. WEEKLY INSIGHT — strict state model ── */}
              {(() => {
                /* ── ANONYMOUS ── */
                if (!isSignedIn) {
                  return (
                    <div className="insightSection">
                      <SectionHeader label="Insights" badge="weekly" />
                      <div className="insightStateCard">
                        <span className="insightStateIcon">🔒</span>
                        <strong className="insightStateTitle">Unlock deeper insights</strong>
                        <p className="insightStateBody">Sign in for free to get personalised pattern analysis based on your data.</p>
                        <button className="primaryButton inlineButton" onClick={() => router.push("/login")} type="button">Sign in to unlock deeper insights</button>
                        <a className="nudgeSecondaryLink" href="/">Log a moment</a>
                      </div>
                    </div>
                  );
                }

                /* ── HAS INSIGHT (LLM or teaser) ── */
                if (hasLlmInsight || hasLlmTeaser) {
                  const narrativeSource = report.llmInsight?.narrative || report.llmTeaser?.narrative;
                  const sections = parseLlmSections(narrativeSource);
                  const generatedAt = report.llmInsight?.generatedAt || report.llmTeaser?.generatedAt;
                  const daysAgo = generatedAt
                    ? Math.max(0, Math.floor((Date.now() - new Date(generatedAt).getTime()) / 86400000))
                    : null;
                  return (
                    <div className="insightSection">
                      <SectionHeader label="Weekly insight" badge="weekly" />
                      {sections ? (
                        <div className="insightCardsRow">
                          {INSIGHT_SECTION_META.map((meta, i) => (
                            sections[i] ? (
                              <div key={meta.label} className="insightSectionCard">
                                <span className="insightSectionIcon">{meta.icon}</span>
                                <span className="insightSectionLabel">{meta.label}</span>
                                <p className="insightSectionBody">{sections[i]}</p>
                              </div>
                            ) : null
                          ))}
                        </div>
                      ) : (
                        <div className="insightSectionCard">
                          <p className="insightSectionBody">{cleanText(narrativeSource)}</p>
                        </div>
                      )}
                      {daysAgo !== null ? (
                        <p className="insightFooter">
                          Updated {daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`}
                        </p>
                      ) : null}
                    </div>
                  );
                }

                /* ── NOT ENOUGH DATA ── */
                return (
                  <div className="insightSection">
                    <SectionHeader label="Insights" badge="weekly" />
                    <div className="insightStateCard">
                      <span className="insightStateIcon">📊</span>
                      <strong className="insightStateTitle">Building your insight</strong>
                      <p className="insightStateBody">Keep logging — your personalised insight will appear here once there is enough data.</p>
                    </div>
                  </div>
                );
              })()}

              {/* ── 7. DATA QUALITY NUDGE ── */}
              {confidence === "low" ? (
                <div className="card stack" style={{ textAlign: "center" }}>
                  <strong>Patterns are forming</strong>
                  <p className="muted">
                    {dq.totalMoments} moments across {dq.daysLogged} day{dq.daysLogged !== 1 ? "s" : ""}. A few more days will unlock trajectory and stability insights.
                  </p>
                  <a className="primaryButton inlineButton" href="/">Log a moment</a>
                </div>
              ) : null}
            </>
          ) : null}

          {/* ── FOOTER ── */}
          {report.totalMoments ? (
            <div className="reportFooter">
              <span className="reportFooterText">
                Based on <strong>{report.totalMoments}</strong> moment{report.totalMoments !== 1 ? "s" : ""} this week
              </span>
            </div>
          ) : null}
        </div>
      ) : !loading && !error ? (
        <div className="card feedbackPanel stack emptyStatePanel">
          <span style={{ fontSize: 56 }}>📝</span>
          <strong>Your first insight is on its way</strong>
          <p className="feedback">Log a few moments this week and we will surface the patterns behind your emotions.</p>
          <a className="primaryButton inlineButton" href="/">Log a moment</a>
        </div>
      ) : null}
    </Layout>
  );
}
