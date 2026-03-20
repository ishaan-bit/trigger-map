import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";

const EMOTION_EMOJIS = {
  frustrated: "�", anxious: "😰", neutral: "😐", calm: "😌", energized: "⚡",
};

const EMOTION_COLORS = {
  calm: "#5ee6a0", neutral: "#9eb0c9", anxious: "#ffb347", frustrated: "#ff6b7a", energized: "#a78bfa",
};

const TIME_ICONS = { morning: "🌅", afternoon: "☀️", evening: "🌆", night: "🌙" };

const ENERGY_COLORS = {
  steady: "#5ee6a0", balanced: "#7bc9d8", tense: "#ffb347",
  drained: "#ff6b7a", uplifted: "#a78bfa",
};

const CONFIDENCE_LABELS = {
  too_early: "Just getting started",
  low: "Early patterns",
  emerging: "Taking shape",
  moderate: "Solid picture",
  strong: "High confidence",
};

const TRIGGERS_SET = new Set(["work", "family", "partner", "social", "alone", "exercise", "travel", "health", "money"]);
const EMOTIONS_SET = new Set(["calm", "neutral", "anxious", "frustrated", "energized"]);

function cleanText(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\u2014/g, ", ")
    .replace(/\u2013/g, ", ")
    .trim();
}

/** Color-code trigger and emotion words inside text */
function colorizeInsightText(text) {
  if (!text) return null;
  const pattern = new RegExp(`\\b(${[...TRIGGERS_SET, ...EMOTIONS_SET].join("|")})\\b`, "gi");
  const parts = [];
  let lastIdx = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIdx) parts.push(text.slice(lastIdx, match.index));
    const word = match[1].toLowerCase();
    const color = EMOTION_COLORS[word] || (TRIGGERS_SET.has(word) ? "#7bc9d8" : null);
    parts.push(<span key={match.index} style={{ color: color || "#7bc9d8", fontWeight: 600 }}>{match[0]}</span>);
    lastIdx = match.index + match[0].length;
  }
  if (lastIdx < text.length) parts.push(text.slice(lastIdx));
  return parts.length > 1 ? parts : text;
}

function parseLlmSections(narrative) {
  if (!narrative) return null;
  const text = cleanText(narrative);
  const headerRe = /^[ \t]*(?:\d+[.)]\s*)?(?:what stood out|what (?:stands|stood) out|(?:most )?notable pattern[s]?|what may be contributing|(?:possible|potential|likely) (?:cause|contributing factor)[s]?|one thing to try|something to try|try this|suggestion|action\s*(?:item|step))[ \t]*:?/gmi;
  const labelMap = [
    /(?:what (?:stood|stands) out|(?:most )?notable pattern)/i,
    /(?:what may be contributing|(?:possible|potential|likely) (?:cause|contributing factor))/i,
    /(?:one thing to try|something to try|try this|suggestion|action\s*(?:item|step))/i,
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
    if (!seen.has(h.section)) { seen.add(h.section); firstHits.push(h); }
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
      let body = cleanedText.slice(start, end).replace(/^\s*[:\-\u2013\u2014]?\s*/, "").trim().replace(/\s+$/, "");
      result[firstHits[i].section] = body.length >= 5 ? body : null;
    }
    return result;
  }
  const chunks = text.split(/\n\s*\n/).filter(Boolean).slice(0, 3);
  const stripHeader = (s) => s.replace(/^[ \t]*(?:\d+[.)]\s*)?(?:what stood out|what may be contributing|one thing to try)[:\s]*/i, "").trim();
  return [
    stripHeader(chunks[0] || text),
    chunks[1] ? stripHeader(chunks[1]) : null,
    chunks[2] ? stripHeader(chunks[2]) : null,
  ];
}

const INSIGHT_SECTION_META = [
  { icon: "🔍", label: "What stood out", accentColor: "#a78bfa" },
  { icon: "🧩", label: "What may be contributing", accentColor: "#ffb347" },
  { icon: "💡", label: "One thing to try", accentColor: "#5ee6a0" },
];

function topEntries(record, limit = 5) {
  return Object.entries(record || {}).sort(([, a], [, b]) => b - a).slice(0, limit);
}

function deriveTopEmotion(report) {
  if (report?.topEmotion) return report.topEmotion;
  const entries = Object.entries(report?.emotionFrequency || {});
  if (!entries.length) return "neutral";
  return entries.sort(([, a], [, b]) => b - a)[0][0];
}

function HBar({ label, value, max, color = "#7bc9d8", icon, glowing }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <div className="chartRow">
      <span className="chartLabel">{icon ? `${icon} ` : ""}{label}</span>
      <div className="chartTrack">
        <span className="chartBar" style={{
          width: `${pct}%`,
          background: `linear-gradient(90deg, ${color}, ${color}aa)`,
          boxShadow: glowing ? `0 0 12px ${color}40` : "none",
        }} />
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
  const eColor = EMOTION_COLORS[emotion] || "#9eb0c9";
  return (
    <span className={`pairingChip ${positive ? "pairingChipPositive" : "pairingChipNegative"}`}
      style={{ borderColor: `${eColor}50`, background: `${eColor}12`, boxShadow: `0 0 8px ${eColor}15` }}>
      <span style={{ color: "#7bc9d8", fontWeight: 700 }}>{trigger}</span>
      {" "}
      <span style={{ color: eColor, fontWeight: 700 }}>{emotion}</span>
      <span className="pairingCount"> ×{count}</span>
    </span>
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

  const topEmotion = deriveTopEmotion(report);
  const stateColor = EMOTION_COLORS[topEmotion] || "#7bc9d8";

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
      {/* State-adaptive ambient glow */}
      {report?.totalMoments ? (
        <div className="stateGlow" style={{ "--state-color": stateColor }} />
      ) : null}

      {loading ? <div className="card loadingCard sceneIn">Reading your patterns...</div> : null}
      {error ? (
        <div className="card feedbackPanel stack sceneIn">
          <strong>Report unavailable</strong>
          <p className="feedback">{error}</p>
          <button className="primaryButton" onClick={loadReport} type="button">Try again</button>
        </div>
      ) : null}

      {report ? (
        <div className="stack reportStack">

          {/* 1. AT A GLANCE HERO */}
          <div className="card cardFeature stack sceneIn" style={{ borderTop: `2px solid ${stateColor}30` }}>
            <p className="sectionKicker" style={{ color: stateColor }}>Weekly patterns</p>
            <h2>Your Week</h2>
            {report.totalMoments ? (
              <p className="muted">
                {report.totalMoments} moment{report.totalMoments !== 1 ? "s" : ""} across {dq.daysLogged || "-"} day{(dq.daysLogged || 0) !== 1 ? "s" : ""}
              </p>
            ) : null}
            {report.totalMoments ? (
              <div className="heroRow">
                <span className="heroPill" style={{ borderColor: `${EMOTION_COLORS[report.topEmotion] || stateColor}40`, boxShadow: `0 0 12px ${EMOTION_COLORS[report.topEmotion] || stateColor}15` }}>
                  <span>{report.topEmotion ? (EMOTION_EMOJIS[report.topEmotion] || "•") : "🌀"}</span>
                  <span style={{ color: EMOTION_COLORS[report.topEmotion] || stateColor }}>{report.topEmotion || "Mixed"}</span>
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
              <div className="takeawayBar" style={{ borderLeftColor: stateColor }}>{colorizeInsightText(cleanText(report.aiInsight.summary))}</div>
            ) : null}
          </div>

          {/* Starter state */}
          {confidence === "too_early" ? (
            <div className="card stack sceneIn" style={{ textAlign: "center" }}>
              <span className="emptyOrb">🌱</span>
              <strong>{isSignedIn ? "A few more moments to go" : "Start tracking to see patterns"}</strong>
              <p className="muted">
                {isSignedIn
                  ? "Log at least 3 moments this week for your pattern report to take shape. With 5 or more, you unlock personalised AI insights that get sharper the more you log."
                  : "Log at least 3 moments to see your first patterns. Sign in and log 5+ to unlock personalised AI insights."}
              </p>
              {!isSignedIn ? (
                <>
                  <button className="primaryButton inlineButton" onClick={() => router.push("/login")} type="button">Sign in to unlock deeper insights</button>
                  <a className="nudgeSecondaryLink" href="/">Log a moment</a>
                </>
              ) : (
                <a className="primaryButton inlineButton" href="/">Log a moment</a>
              )}
            </div>
          ) : null}

          {confidence !== "too_early" ? (
            <>
              {/* 2. WHAT SHOWED UP */}
              <SectionHeader label="What showed up" badge="live" extra={`${dq.uniqueEmotions || 0} emotions · ${dq.uniqueTriggers || 0} triggers`} />

              {emotionEntries.length ? (
                <div className="card stack sceneIn">
                  {emotionEntries.map(([key, value]) => (
                    <HBar key={key} label={key} value={value} max={emotionMax} color={EMOTION_COLORS[key] || "#f0b96a"} icon={EMOTION_EMOJIS[key]} glowing={key === topEmotion} />
                  ))}
                </div>
              ) : null}

              {triggerEntries.length ? (
                <div className="card stack sceneIn">
                  {triggerEntries.map(([key, value]) => (
                    <HBar key={key} label={key} value={value} max={triggerMax} color="#7bc9d8" />
                  ))}
                </div>
              ) : null}

              {dq.hasEnoughForRhythm && timeEntries.length ? (
                <div className="card stack sceneIn">
                  <p className="sectionKicker">When you logged</p>
                  {timeEntries.map(([key, value]) => (
                    <HBar key={key} label={key} value={value} max={timeMax} color={stateColor} icon={TIME_ICONS[key]} />
                  ))}
                </div>
              ) : null}

              {/* 3. WHAT HELPED / WHAT DRAINED */}
              {(report.regulators?.length > 0 || report.frictionZones?.length > 0) ? (
                <>
                  <SectionHeader label="What helped · What drained" badge="live" />
                  <div className="card stack sceneIn">
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

              {/* 4. PATTERNS & PAIRINGS */}
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
                      <SectionHeader label="Trigger + Emotion" badge="live" />
                      <div className="card stack sceneIn">
                        {Object.entries(report.correlations).slice(0, 5).map(([trigger, emotions]) => (
                          <div className="correlationRow" key={trigger}>
                            <strong className="correlationTrigger" style={{ color: "#7bc9d8" }}>{trigger}</strong>
                            <div className="correlationChips">
                              {Object.entries(emotions).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a).slice(0, 3).map(([emo, count]) => (
                                <span className="correlationChip" key={emo} data-emotion={emo}
                                  style={{ color: EMOTION_COLORS[emo], borderColor: `${EMOTION_COLORS[emo]}40`, background: `${EMOTION_COLORS[emo]}10` }}>
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
                      <div className="card stack sceneIn">
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
                      <div className="metricGrid metricGridTwo sceneIn">
                        {report.volatilityScore !== null ? (
                          <div className="card stack metricCard">
                            <p className="metricLabel">Volatility</p>
                            <strong className="metricValue" style={{ color: report.volatilityScore < 0.5 ? "#5ee6a0" : report.volatilityScore < 1.5 ? "#ffb347" : "#ff6b7a" }}>
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
                        <p className="muted sceneIn" style={{ fontSize: 13 }}>{colorizeInsightText(cleanText(report.trajectoryNote))}</p>
                      ) : null}
                      <div className="trajectoryRow sceneIn">
                        {report.weeklyEmotionTrajectory.map((day) => {
                          const dayColor = EMOTION_COLORS[day.dominantEmotion] || "#9eb0c9";
                          return (
                            <div className="trajectoryDay" key={day.date} style={{ "--day-color": dayColor }}>
                              <span className="trajectoryEmoji">{EMOTION_EMOJIS[day.dominantEmotion] || "•"}</span>
                              <span className="trajectoryScore" style={{ color: dayColor }}>{day.score}</span>
                              <span className="trajectoryDate">
                                {new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  ) : null}

                  {/* Gut check */}
                  {report.predictionAccuracy ? (
                    <>
                      <SectionHeader label="Gut check" badge="live" />
                      <div className="card gutCheckCard sceneIn">
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
                                : "Your days unfolded differently than expected. Not a bad thing, it means you're adapting."}
                          </p>
                        </div>
                      </div>
                    </>
                  ) : null}
                </>
              )}

              {/* 5. TRY THIS WEEK */}
              {report.aiInsight?.microExperiment ? (
                <div className="card experimentCard sceneIn" style={{ borderLeftColor: stateColor }}>
                  <span className="aiLabelPill aiLabelPillGreen">Try this week</span>
                  <p>{colorizeInsightText(cleanText(report.aiInsight.microExperiment))}</p>
                </div>
              ) : null}

              {/* 6. WEEKLY INSIGHT */}
              {(() => {
                if (!isSignedIn) {
                  return (
                    <div className="insightSection sceneIn">
                      <SectionHeader label="Insights" badge="weekly" />
                      <div className="insightStateCard" style={{ borderColor: `${stateColor}20` }}>
                        <span className="insightStateIcon">🔒</span>
                        <strong className="insightStateTitle">Unlock deeper insights</strong>
                        <p className="insightStateBody">Sign in for free to get personalised pattern analysis based on your data.</p>
                        <button className="primaryButton inlineButton" onClick={() => router.push("/login")} type="button">Sign in to unlock deeper insights</button>
                        <a className="nudgeSecondaryLink" href="/">Log a moment</a>
                      </div>
                    </div>
                  );
                }

                if (hasLlmInsight || hasLlmTeaser) {
                  const narrativeSource = report.llmInsight?.narrative || report.llmTeaser?.narrative;
                  const sections = parseLlmSections(narrativeSource);
                  const generatedAt = report.llmInsight?.generatedAt || report.llmTeaser?.generatedAt;
                  const daysAgo = generatedAt
                    ? Math.max(0, Math.floor((Date.now() - new Date(generatedAt).getTime()) / 86400000))
                    : null;
                  return (
                    <div className="insightSection sceneIn">
                      <SectionHeader label="Weekly insight" badge="weekly" />
                      {sections ? (
                        <div className="insightCardsRow">
                          {INSIGHT_SECTION_META.map((meta, i) => (
                            sections[i] ? (
                              <div key={meta.label} className="insightSectionCard" style={{ borderLeft: `3px solid ${meta.accentColor}40` }}>
                                <span className="insightSectionIcon">{meta.icon}</span>
                                <span className="insightSectionLabel" style={{ color: meta.accentColor }}>{meta.label}</span>
                                <p className="insightSectionBody">{colorizeInsightText(sections[i])}</p>
                              </div>
                            ) : null
                          ))}
                        </div>
                      ) : (
                        <div className="insightSectionCard">
                          <p className="insightSectionBody">{colorizeInsightText(cleanText(narrativeSource))}</p>
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

                return (
                  <div className="insightSection sceneIn">
                    <SectionHeader label="Insights" badge="weekly" />
                    <div className="insightStateCard">
                      <span className="insightStateIcon">📊</span>
                      <strong className="insightStateTitle">Building your insight</strong>
                      <p className="insightStateBody">
                        {(() => {
                          const remaining = Math.max(0, 5 - (report.totalMoments || 0));
                          if (remaining > 0) return `Log ${remaining} more moment${remaining !== 1 ? "s" : ""} this week to unlock your personalised AI insight. Insights get better the more you log.`;
                          return "Your personalised insight is being prepared. Check back soon.";
                        })()}
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* 7. DATA QUALITY NUDGE */}
              {confidence === "low" ? (
                <div className="card stack sceneIn" style={{ textAlign: "center" }}>
                  <strong>Patterns are forming</strong>
                  <p className="muted">
                    {dq.totalMoments} moments across {dq.daysLogged} day{dq.daysLogged !== 1 ? "s" : ""}. A few more days will unlock trajectory and stability insights.
                  </p>
                  <a className="primaryButton inlineButton" href="/">Log a moment</a>
                </div>
              ) : null}
            </>
          ) : null}

          {/* FOOTER */}
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
          <p className="feedback">Log at least 3 moments this week to see your patterns. With 5+, you get personalised AI insights.</p>
          <a className="primaryButton inlineButton" href="/">Log a moment</a>
        </div>
      ) : null}
    </Layout>
  );
}
