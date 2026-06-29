import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";
import { colorForLabel } from "../lib/designSystem";

const EMOTION_COLORS = {
  calm: "#5ee6a0", neutral: "#9eb0c9", anxious: "#ffb347", frustrated: "#ff6b7a", energized: "#a78bfa",
  overwhelmed: "#ff6b7a", heavy: "#c084fc", low: "#9e7bfa", uneasy: "#ff9f6b",
  excited: "#56d0e0", peaceful: "#a78bfa", grateful: "#88d498", content: "#5ee6a0",
  restless: "#ffb347", alert: "#ffd166", disconnected: "#7e8fa6", flat: "#8da4bd",
};
/** Map a 1-5 wellbeing score to a tone emoji and label */
function scoreTone(score) {
  if (score >= 4.2) return { emoji: "🌟", label: "Great", color: "#a78bfa" };
  if (score >= 3.5) return { emoji: "😌", label: "Good", color: "#5ee6a0" };
  if (score >= 2.8) return { emoji: "😐", label: "Mixed", color: "#9eb0c9" };
  if (score >= 2)   return { emoji: "😟", label: "Uneasy", color: "#ffb347" };
  return { emoji: "😤", label: "Tough", color: "#ff6b7a" };
}
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
const EMOTIONS_SET = new Set(["calm", "neutral", "anxious", "frustrated", "energized",
  "overwhelmed", "heavy", "low", "uneasy", "excited", "peaceful", "grateful", "content",
  "restless", "alert", "disconnected", "flat"]);

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

const TRIGGER_COLORS = {
  work: "#a78bfa", family: "#5ee6a0", partner: "#ffb347", social: "#56d0e0",
  alone: "#88d498", exercise: "#56d0e0", travel: "#56d0e0", health: "#ff6b7a",
  money: "#ffb347", sleep: "#a78bfa", other: "#94b4e0",
};

const TAB_KEYS = [
  { key: "mirror", label: "Read", icon: "🔮" },
  { key: "week", label: "This Week", icon: "📅" },
  { key: "progress", label: "Progress", icon: "📈" },
  { key: "actions", label: "Actions", icon: "⚡" },
  { key: "premium", label: "For You", icon: "🧭" },
];

function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

function DeltaChip({ value }) {
  if (value == null) return null;
  const positive = value >= 0;
  const color = positive ? "#5ee6a0" : "#ff6b7a";
  return (
    <span className="deltaChip" style={{ color, borderColor: `${color}40`, background: `${color}12` }}>
      {positive ? "↑" : "↓"} {Math.abs(value).toFixed(1)}
    </span>
  );
}

function TrendBadge({ trend }) {
  if (!trend) return null;
  const color = trend === "improving" ? "#5ee6a0" : trend === "declining" ? "#ff6b7a" : "#9eb0c9";
  const arrow = trend === "improving" ? "↑" : trend === "declining" ? "↓" : "→";
  return (
    <span className="trendBadge" style={{ color, borderColor: `${color}40`, background: `${color}12` }}>
      {arrow} {capitalize(trend)}
    </span>
  );
}

function TabBar({ activeTab, onTabChange }) {
  return (
    <div className="reportTabBar">
      {TAB_KEYS.map((tab) => (
        <button
          key={tab.key}
          className={`reportTab ${activeTab === tab.key ? "reportTabActive" : ""}`}
          onClick={() => onTabChange(tab.key)}
          type="button"
        >
          {tab.icon} {tab.label}
        </button>
      ))}
    </div>
  );
}

/* ── Mirror Tab ── */
function MirrorTab({ report, dq, confidence, router }) {
  const bm = report?.baselineMetrics;
  const insight = report?.aiInsight;
  const drivers = insight?.drivers;
  const loops = insight?.behavioralLoop;
  const direction = insight?.actionableDirection;
  const whereToFocus = insight?.whereToFocus;
  const whatWorking = insight?.whatWorking;
  const invoked = report?.invokedMetrics;
  const compound = report?.compoundPatterns;
  const tone = bm?.recentAverage != null ? scoreTone(bm.recentAverage) : null;

  if (confidence === "too_early") {
    return (
      <div className="card stack sceneIn" style={{ textAlign: "center" }}>
        <span className="emptyOrb">🪞</span>
        <strong>{report?.totalMoments ? "Your mirror is forming" : "Start tracking to see your mirror"}</strong>
        <p className="muted">Log at least 3 moments this week for your pattern mirror to take shape.</p>
        <a className="primaryButton inlineButton" href="/">Log a moment</a>
      </div>
    );
  }

  return (
    <div className="stack">
      {/* Current State */}
      {bm?.stateOfMind ? (
        <div className="sceneIn">
          <SectionHeader label="Current State" badge="weekly" />
          <div className="card stateOfMindCard" style={{ borderLeft: `3px solid ${tone?.color || "#7bc9d8"}` }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ color: tone?.color || "#7bc9d8", fontSize: 16 }}>
                {tone ? `${tone.emoji} ` : ""}{capitalize(bm.stateOfMind)}
              </strong>
              {bm.baselineDeltas?.deltaDrift != null ? <DeltaChip value={bm.baselineDeltas.deltaDrift} /> : null}
            </div>
            {bm.baseline?.reliable ? (
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>
                Baseline: {bm.baseline.score.toFixed(1)} · This week: {bm.recentAverage?.toFixed(1) || "-"}
                {bm.drift ? ` · ${capitalize(bm.drift.label)}` : ""}
              </p>
            ) : (
              <p className="muted" style={{ fontSize: 13, marginTop: 4 }}>Personal baseline still forming...</p>
            )}
          </div>
        </div>
      ) : (
        <div className="card sceneIn" style={{ textAlign: "center" }}>
          <span style={{ fontSize: 32 }}>🪞</span>
          <p className="muted">Your inner mirror is taking shape. Keep logging to see your current state here.</p>
        </div>
      )}

      {/* Drivers */}
      {drivers?.length ? (
        <div className="sceneIn">
          <SectionHeader label="Drivers" badge="weekly" />
          <div className="card stack">
            {drivers.map((d, i) => {
              const tColor = TRIGGER_COLORS[d.trigger] || "#7bc9d8";
              const effectColor = d.effect === "regulator" ? "#5ee6a0" : d.effect === "friction" ? "#ff6b7a" : "#9eb0c9";
              const effectLabel = d.effect === "regulator" ? "Helps" : d.effect === "friction" ? "Friction" : "Neutral";
              return (
                <div key={i} className="driverRow">
                  <div style={{ flex: 1 }}>
                    <span style={{ color: tColor, fontWeight: 700 }}>{capitalize(d.trigger)}</span>
                    {d.emotion ? (
                      <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>{d.emotion} · {d.count}×</span>
                    ) : (
                      <span className="muted" style={{ marginLeft: 8, fontSize: 13 }}>{d.count}×</span>
                    )}
                  </div>
                  <span className="effectBadge" style={{ color: effectColor, borderColor: `${effectColor}40`, background: `${effectColor}18` }}>
                    {effectLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Behavioral Loops */}
      {loops?.length ? (
        <div className="sceneIn">
          <SectionHeader label="Behavioral Loops" badge="weekly" />
          {loops.map((loop, i) => {
            const isFriction = loop.type === "friction";
            const loopColor = isFriction ? "#ff6b7a" : "#5ee6a0";
            const emoColor = EMOTION_COLORS[loop.emotion] || "#9eb0c9";
            return (
              <div key={i} className="card loopCard" style={{ borderLeft: `3px solid ${loopColor}`, marginBottom: 8 }}>
                <div className="loopFlow">
                  <span className="loopNode" style={{ color: TRIGGER_COLORS[loop.trigger] || "#7bc9d8", background: `${TRIGGER_COLORS[loop.trigger] || "#7bc9d8"}20` }}>
                    {capitalize(loop.trigger)}
                  </span>
                  <span className="loopArrow">→</span>
                  <span className="loopNode" style={{ color: emoColor, background: `${emoColor}20` }}>
                    {loop.emotion}
                  </span>
                  {loop.recovery ? (
                    <>
                      <span className="loopArrow">→</span>
                      <span className="loopNode" style={{ color: "#7bc9d8", background: "rgba(123,201,216,0.12)" }}>
                        ⏱ {loop.recovery}
                      </span>
                    </>
                  ) : null}
                </div>
                <span className="muted" style={{ fontSize: 12 }}>{loop.count}× this week</span>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Deeper Signals */}
      {(compound?.falseRecovery || compound?.crashRisk || (invoked?.weeklyMasking?.level && invoked.weeklyMasking.level !== "none")) ? (
        <div className="sceneIn">
          <SectionHeader label="Deeper Signals" badge="weekly" />
          <div className="card stack">
            {compound?.crashRisk ? (
              <div className="signalRow">
                <span className="signalIcon" style={{ color: "#ff6b7a" }}>⚠️</span>
                <div>
                  <strong style={{ color: "#ff6b7a" }}>Crash Risk Detected</strong>
                  <p className="muted" style={{ fontSize: 13 }}>Pattern suggests emotional overload may be building. Watch for sudden dips.</p>
                </div>
              </div>
            ) : null}
            {compound?.falseRecovery ? (
              <div className="signalRow">
                <span className="signalIcon" style={{ color: "#ffb347" }}>🔄</span>
                <div>
                  <strong style={{ color: "#ffb347" }}>False Recovery</strong>
                  <p className="muted" style={{ fontSize: 13 }}>Recovery signals may not reflect deeper state. Stay aware.</p>
                </div>
              </div>
            ) : null}
            {invoked?.weeklyMasking?.level && invoked.weeklyMasking.level !== "none" ? (
              <div className="signalRow">
                <span className="signalIcon" style={{ color: "#c084fc" }}>🎭</span>
                <div>
                  <strong style={{ color: "#c084fc" }}>Masking: {capitalize(invoked.weeklyMasking.level)}</strong>
                  <p className="muted" style={{ fontSize: 13 }}>External signals may not match internal state.</p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Inner State (Vacuum) */}
      {invoked?.currentVacuum != null ? (
        <div className="sceneIn">
          <SectionHeader label="Inner State" badge="weekly" />
          <div className="card" style={{ borderLeft: "3px solid #c084fc" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <strong style={{ fontSize: 16 }}>
                  {scoreTone(invoked.currentVacuum).emoji} {invoked.currentVacuum.toFixed(1)}/5
                </strong>
                <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>Vacuum score</p>
              </div>
              {invoked.vacuumDrift != null ? (
                <div style={{ textAlign: "right" }}>
                  <DeltaChip value={invoked.vacuumDrift} />
                  <p className="muted" style={{ fontSize: 11, marginTop: 2 }}>
                    {invoked.vacuumDrift > 0.15 ? "Rising" : invoked.vacuumDrift < -0.15 ? "Falling" : "Stable"}
                  </p>
                </div>
              ) : null}
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              How full or empty your emotional bandwidth feels, independent of surface emotions.
            </p>
          </div>
        </div>
      ) : null}

      {/* Context Bleed */}
      {invoked?.contamination?.length > 0 ? (
        <div className="sceneIn">
          <SectionHeader label="Context Bleed" badge="weekly" />
          <div className="card stack">
            {invoked.contamination.slice(0, 3).map((c, i) => (
              <div key={i} className="signalRow">
                <span style={{ fontSize: 16 }}>🔗</span>
                <p style={{ fontSize: 13, margin: 0 }}>
                  <span style={{ color: TRIGGER_COLORS[c.sourceTrigger] || "#7bc9d8", fontWeight: 600 }}>{capitalize(c.sourceTrigger)}</span>
                  {" emotions are bleeding into "}
                  {c.affectedTriggers.map((tr) => (
                    <span key={tr} style={{ color: TRIGGER_COLORS[tr] || "#7bc9d8", fontWeight: 600 }}>{capitalize(tr)} </span>
                  ))}
                </p>
              </div>
            ))}
            <p className="muted" style={{ fontSize: 11 }}>Emotional cross-contamination between contexts.</p>
          </div>
        </div>
      ) : null}

      {/* Direction */}
      {direction ? (
        <div className="sceneIn">
          <SectionHeader label="Direction" badge="weekly" />
          <div className="card" style={{ borderLeft: `3px solid ${tone?.color || "#7bc9d8"}` }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{colorizeInsightText(cleanText(direction))}</p>
          </div>
        </div>
      ) : null}

      {/* What's Working / Where to Focus */}
      {(whatWorking?.length || whereToFocus?.length) ? (
        <div className="sceneIn">
          {whatWorking?.length ? (
            <>
              <p className="sectionKicker" style={{ color: "#5ee6a0" }}>WHAT&apos;S WORKING</p>
              <div className="card stack" style={{ borderLeft: "3px solid #5ee6a0", marginBottom: 12 }}>
                {whatWorking.slice(0, 3).map((item, i) => (
                  <p key={i} style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{colorizeInsightText(cleanText(item.text))}</p>
                ))}
              </div>
            </>
          ) : null}
          {whereToFocus?.length ? (
            <>
              <p className="sectionKicker" style={{ color: "#ffb347" }}>WHERE TO FOCUS</p>
              <div className="card stack" style={{ borderLeft: "3px solid #ffb347" }}>
                {whereToFocus.slice(0, 3).map((item, i) => (
                  <p key={i} style={{ margin: 0, fontSize: 13, lineHeight: 1.5 }}>{colorizeInsightText(cleanText(item.text))}</p>
                ))}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/* ── This Week Tab ── */
function ShareWeekCard({ shareWeek, report }) {
  const [status, setStatus] = useState("idle");
  if (!report?.totalMoments) return null;
  async function onShare() {
    setStatus("sharing");
    try {
      const res = await shareWeek();
      const token = res?.token || res?.shareToken || res?.snapshot?.token;
      const url = token ? `${window.location.origin}/share/${token}` : window.location.origin;
      if (navigator.share) {
        await navigator.share({ title: "My week on TriggerMap", text: "Here's my emotional week.", url });
        setStatus("done");
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setStatus("done");
      } else {
        window.open(url, "_blank");
        setStatus("done");
      }
    } catch {
      setStatus("idle");
    }
  }
  return (
    <div className="card stack sceneIn shareWeekCard">
      <strong>Share your week</strong>
      <p className="muted" style={{ fontSize: 13 }}>A private snapshot of your week — yours to share, no account needed.</p>
      <button className="primaryButton inlineButton" type="button" onClick={onShare} disabled={status === "sharing"}>
        {status === "sharing" ? "Preparing…" : status === "done" ? "Link ready ✓" : "Share my week"}
      </button>
    </div>
  );
}

function ThisWeekTab({ report, dq, confidence, isPremium, shareWeek, router }) {
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

  const hasRuleInsight = !!report?.aiInsight?.summary;
  const hasLlmInsight = !!report?.llmInsight?.narrative;
  const hasLlmTeaser = !!report?.llmTeaser?.narrative;

  if (confidence === "too_early") {
    return (
      <div className="card stack sceneIn" style={{ textAlign: "center" }}>
        <span className="emptyOrb">🌱</span>
        <strong>{report?.totalMoments ? "A few more moments to go" : "Start tracking to see patterns"}</strong>
        <p className="muted">
          Log at least 3 moments this week for your pattern report to take shape.
        </p>
        <a className="primaryButton inlineButton" href="/">Log a moment</a>
      </div>
    );
  }

  return (
    <div className="stack">
      <ShareWeekCard shareWeek={shareWeek} report={report} />
      {/* Hero summary */}
      <div className="card cardFeature stack sceneIn" style={{ borderTop: `2px solid ${stateColor}30` }}>
        <p className="sectionKicker" style={{ color: stateColor }}>Weekly patterns</p>
        <h2 style={{ margin: 0 }}>Your Week</h2>
        {report.totalMoments ? (
          <p className="muted">
            {report.totalMoments} moment{report.totalMoments !== 1 ? "s" : ""} across {dq.daysLogged || "-"} day{(dq.daysLogged || 0) !== 1 ? "s" : ""}
          </p>
        ) : null}
        {report.totalMoments ? (
          <div className="heroRow">
            <span className="heroPill" style={{ borderColor: `${EMOTION_COLORS[report.topEmotion] || stateColor}40` }}>
              <span style={{ color: EMOTION_COLORS[report.topEmotion] || stateColor }}>{report.topEmotion || "Mixed"}</span>
            </span>
            <span className="heroPill">🎯 {report.topTrigger || (report.tiedTriggers?.length > 1 ? `${report.tiedTriggers.length} areas` : "-")}</span>
            <span className="heroPill heroPillConfidence">{CONFIDENCE_LABELS[confidence] || confidence}</span>
          </div>
        ) : null}
        {hasRuleInsight ? (
          <div className="takeawayBar" style={{ borderLeftColor: stateColor }}>{colorizeInsightText(cleanText(report.aiInsight.summary))}</div>
        ) : null}
        {report?.frictionZones?.length > 0 ? (() => {
          const fz = report.frictionZones[0];
          const frictionColor = EMOTION_COLORS[fz.emotion] || "#ff6b7a";
          return (
            <div className="dominantCard" style={{ borderColor: `${frictionColor}40`, borderLeftColor: frictionColor }}>
              <span className="dominantIcon">🔥</span>
              <div className="dominantContent">
                <span className="dominantLabel" style={{ color: frictionColor }}>PRIMARY FRICTION</span>
                <p className="dominantText">
                  <span style={{ color: "#7bc9d8", fontWeight: 600 }}>{fz.trigger}</span> tends to leave you feeling{" "}
                  <span style={{ color: frictionColor, fontWeight: 600 }}>{fz.emotion}</span> — {fz.count} time{fz.count !== 1 ? "s" : ""} this week.
                </p>
              </div>
            </div>
          );
        })() : null}
      </div>

      {/* Emotions & Triggers */}
      <SectionHeader label="What showed up" badge="live" extra={`${dq.uniqueEmotions || 0} emotions · ${dq.uniqueTriggers || 0} triggers`} />
      {emotionEntries.length ? (
        <div className="card stack sceneIn">
          {emotionEntries.map(([key, value]) => (
            <HBar key={key} label={key} value={value} max={emotionMax} color={EMOTION_COLORS[key] || colorForLabel(key)} glowing={key === topEmotion} />
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

      {/* Time of day */}
      {dq.hasEnoughForRhythm && timeEntries.length ? (
        <div className="card stack sceneIn">
          <p className="sectionKicker">When you logged</p>
          {timeEntries.map(([key, value]) => (
            <HBar key={key} label={key} value={value} max={timeMax} color={stateColor} icon={TIME_ICONS[key]} />
          ))}
        </div>
      ) : null}

      {/* Regulators & Friction */}
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

      {/* Correlations, Energy, Stability, Trajectory — all client-derived, always shown */}
      {true ? (
        <>
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
                          style={{ color: EMOTION_COLORS[emo] || colorForLabel(emo), borderColor: `${EMOTION_COLORS[emo] || colorForLabel(emo)}40`, background: `${EMOTION_COLORS[emo] || colorForLabel(emo)}10` }}>
                          {emo} ×{count}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

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

          {dq.hasEnoughForStability ? (
            <>
              <SectionHeader label="Stability" badge="weekly" />
              <div className="metricGrid metricGridTwo sceneIn">
                {report.volatilityScore !== null ? (
                  <div className="card stack metricCard">
                    <p className="metricLabel">Day-to-day shifts</p>
                    <strong className="metricValue" style={{ color: report.volatilityScore < 0.8 ? "#5ee6a0" : report.volatilityScore < 1.5 ? "#ffb347" : "#ff6b7a" }}>
                      {report.volatilityLabel || (report.volatilityScore < 0.3 ? "Steady" : report.volatilityScore < 0.8 ? "Mild shifts" : report.volatilityScore < 1.5 ? "Moderate swings" : "High variability")}
                    </strong>
                    <p className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {report.volatilityScore < 0.8 ? "Your emotions stayed fairly consistent." : report.volatilityScore < 1.5 ? "Some emotional range within your days." : "Wide swings between emotions within days."}
                    </p>
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

          {dq.hasEnoughForTrajectory && report.weeklyEmotionTrajectory?.length > 1 ? (
            <>
              <SectionHeader label="Emotional tone" badge="live" />
              <p className="muted sceneIn" style={{ fontSize: 12, marginBottom: 2 }}>
                How your average emotional tone shifted day by day.
              </p>
              {report.trajectoryNote ? (
                <p className="muted sceneIn" style={{ fontSize: 13 }}>{colorizeInsightText(cleanText(report.trajectoryNote))}</p>
              ) : null}
              <div className="trajectoryRow sceneIn">
                {report.weeklyEmotionTrajectory.map((day) => {
                  const tone = scoreTone(day.score);
                  return (
                    <div className="trajectoryDay" key={day.date} style={{ "--day-color": tone.color }}>
                      <span className="trajectoryEmoji">{tone.emoji}</span>
                      <span className="trajectoryLabel" style={{ color: tone.color }}>{tone.label}</span>
                      <span className="trajectoryDate">
                        {new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {/* Micro-experiment */}
      {report.aiInsight?.microExperiment ? (
        <div className="card experimentCard sceneIn" style={{ borderLeftColor: stateColor }}>
          <span className="aiLabelPill aiLabelPillGreen">Try this week</span>
          <p>{colorizeInsightText(cleanText(report.aiInsight.microExperiment))}</p>
        </div>
      ) : null}

      {/* Weekly Insight (LLM) */}
      {(() => {
        if (!isPremium && (hasLlmInsight || hasLlmTeaser)) {
          return (
            <div className="insightSection sceneIn">
              <SectionHeader label="Insights" badge="premium" />
              <div className="insightStateCard" style={{ borderColor: `${stateColor}20` }}>
                <span className="insightStateIcon">🔒</span>
                <strong className="insightStateTitle">Unlock the AI narrative</strong>
                <p className="insightStateBody">Premium turns your patterns into a personalised weekly read. All the signals above stay free.</p>
                <button className="primaryButton inlineButton" onClick={() => router.push("/premium")} type="button">Go Premium</button>
              </div>
            </div>
          );
        }
        if (!isPremium) return null;
        if (hasLlmInsight || hasLlmTeaser) {
          const narrativeSource = report.llmInsight?.narrative || report.llmTeaser?.narrative;
          const sections = parseLlmSections(narrativeSource);
          const generatedAt = report.llmInsight?.generatedAt || report.llmTeaser?.generatedAt;
          const daysAgo = generatedAt ? Math.max(0, Math.floor((Date.now() - new Date(generatedAt).getTime()) / 86400000)) : null;
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
                <p className="insightFooter">Updated {daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`}</p>
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
                  if (remaining > 0) return `Log ${remaining} more moment${remaining !== 1 ? "s" : ""} this week to unlock your personalised AI insight.`;
                  return "Your personalised insight is being prepared. Check back soon.";
                })()}
              </p>
            </div>
          </div>
        );
      })()}

      {confidence === "low" ? (
        <div className="card stack sceneIn" style={{ textAlign: "center" }}>
          <strong>Patterns are forming</strong>
          <p className="muted">{dq.totalMoments} moments across {dq.daysLogged} day{dq.daysLogged !== 1 ? "s" : ""}. A few more days will unlock trajectory and stability insights.</p>
          <a className="primaryButton inlineButton" href="/">Log a moment</a>
        </div>
      ) : null}
    </div>
  );
}

/* ── Progress Tab ── */
function ProgressTab({ progress, router }) {
  if (!progress) {
    return (
      <div className="card stack sceneIn" style={{ textAlign: "center" }}>
        <span style={{ fontSize: 48 }}>📈</span>
        <strong>Progress</strong>
        <p className="muted">Log for 2+ weeks to see your trajectory, score trends, and pattern shifts over time.</p>
        <a className="primaryButton inlineButton" href="/">Log a moment</a>
      </div>
    );
  }

  const { trajectory, metrics, patternShifts, attributions, weeklySnapshots, dataQuality } = progress;
  const hasShifts = patternShifts && (patternShifts.strengthening?.length || patternShifts.weakening?.length || patternShifts.unresolved?.length || patternShifts.emerging?.length);
  const hasAttributions = attributions && (attributions.helped?.length || attributions.notWorking?.length || attributions.needsAttention?.length);

  return (
    <div className="stack">
      {/* Trajectory Arc */}
      {trajectory ? (
        <div className="sceneIn">
          <SectionHeader label="Trajectory" badge="weekly" />
          <div className="card progressArc">
            <div className="progressArcNode">
              <span className="progressArcEmoji">{scoreTone(trajectory.past?.score || 3).emoji}</span>
              <strong style={{ color: scoreTone(trajectory.past?.score || 3).color }}>{trajectory.past?.score?.toFixed(1) || "-"}</strong>
              <span className="muted" style={{ fontSize: 11 }}>{trajectory.weeksTracked || "-"} weeks ago</span>
            </div>
            <div className="progressArcConnector">
              <div className="progressArcLine" style={{ background: trajectory.direction === "improving" ? "#5ee6a060" : trajectory.direction === "declining" ? "#ff6b7a60" : "#9eb0c940" }} />
              {trajectory.change != null ? (
                <span className="progressArcDelta" style={{ color: trajectory.direction === "improving" ? "#5ee6a0" : trajectory.direction === "declining" ? "#ff6b7a" : "#9eb0c9" }}>
                  {trajectory.change > 0 ? "+" : ""}{trajectory.change.toFixed(1)}
                </span>
              ) : null}
            </div>
            <div className="progressArcNode">
              <span className="progressArcEmoji">{scoreTone(trajectory.present?.score || 3).emoji}</span>
              <strong style={{ color: scoreTone(trajectory.present?.score || 3).color }}>{trajectory.present?.score?.toFixed(1) || "-"}</strong>
              <span className="muted" style={{ fontSize: 11 }}>This week</span>
            </div>
            <div className="progressArcConnector">
              <div className="progressArcLine" style={{ background: "#9eb0c930", borderTop: "1px dashed #9eb0c940" }} />
            </div>
            <div className="progressArcNode" style={{ opacity: 0.7 }}>
              <span className="progressArcEmoji">{trajectory.projected === "improving" ? "📈" : trajectory.projected === "declining" ? "📉" : "➡️"}</span>
              <span className="muted" style={{ fontSize: 13 }}>
                {trajectory.projected === "improving" ? "Improving" : trajectory.projected === "declining" ? "Declining" : "Holding"}
              </span>
              <span className="muted" style={{ fontSize: 11 }}>Projected</span>
            </div>
          </div>
          {trajectory.direction ? (
            <div className="progressDirectionBadge" style={{
              color: trajectory.direction === "improving" ? "#5ee6a0" : trajectory.direction === "declining" ? "#ff6b7a" : "#9eb0c9",
              borderColor: (trajectory.direction === "improving" ? "#5ee6a0" : trajectory.direction === "declining" ? "#ff6b7a" : "#9eb0c9") + "40",
              background: (trajectory.direction === "improving" ? "#5ee6a0" : trajectory.direction === "declining" ? "#ff6b7a" : "#9eb0c9") + "12",
            }}>
              {trajectory.direction === "improving" ? "↑ " : trajectory.direction === "declining" ? "↓ " : "→ "}
              {capitalize(trajectory.direction)}
              {trajectory.change != null ? ` (${trajectory.change > 0 ? "+" : ""}${trajectory.change.toFixed(1)})` : ""}
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Metrics Grid */}
      {metrics ? (
        <div className="sceneIn">
          <SectionHeader label="Key Metrics" badge="live" />
          <div className="metricGrid metricGridTwo">
            {[
              { key: "stability", label: "Stability", data: metrics.stability, icon: "🟢", invert: false },
              { key: "volatility", label: "Volatility", data: metrics.volatility, icon: "⚡", invert: true },
              { key: "drift", label: "Drift", data: metrics.drift, icon: "📊", invert: false },
              { key: "recoveryDays", label: "Recovery", data: metrics.recoveryDays, icon: "⏱", invert: true },
            ].filter((m) => m.data).map((m) => {
              const md = m.data;
              const fmt = (val) => {
                if (val == null || val <= 0) return "-";
                if (m.key === "stability") return `${Math.round(val * 100)}%`;
                if (m.key === "recoveryDays") return `~${val}d`;
                return val.toFixed(1);
              };
              return (
                <div key={m.key} className="card stack metricCard">
                  <p className="metricLabel">{m.icon} {m.label}</p>
                  <div className="progressThenNow">
                    <div>
                      <span className="muted" style={{ fontSize: 11 }}>Then</span>
                      <p style={{ margin: 0 }}>{fmt(md.previous)}</p>
                    </div>
                    <span style={{ color: "#9eb0c9" }}>→</span>
                    <div>
                      <span className="muted" style={{ fontSize: 11 }}>Now</span>
                      <p style={{ margin: 0, fontWeight: 700 }}>{fmt(md.current)}</p>
                    </div>
                  </div>
                  <TrendBadge trend={md.trend} />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Pattern Shifts */}
      {hasShifts ? (
        <div className="sceneIn">
          <SectionHeader label="Pattern Shifts" badge="weekly" />
          {[
            { key: "strengthening", label: "Strengthening", color: "#5ee6a0", items: patternShifts.strengthening },
            { key: "weakening", label: "Weakening", color: "#7bc9d8", items: patternShifts.weakening },
            { key: "unresolved", label: "Unresolved", color: "#ffb347", items: patternShifts.unresolved },
            { key: "emerging", label: "Emerging", color: "#c084fc", items: patternShifts.emerging },
          ].filter((g) => g.items?.length).map((g) => (
            <div key={g.key} className="card" style={{ borderLeft: `3px solid ${g.color}`, marginBottom: 8 }}>
              <p className="sectionKicker" style={{ color: g.color }}>{g.label}</p>
              {g.items.map((p, i) => (
                <div key={i} style={{ padding: "4px 0" }}>
                  <span style={{ color: TRIGGER_COLORS[p.trigger] || "#7bc9d8", fontWeight: 600 }}>{capitalize(p.trigger)}</span>
                  <span style={{ color: "#9eb0c9" }}> → </span>
                  <span style={{ color: EMOTION_COLORS[p.emotion] || "#9eb0c9", fontWeight: 600 }}>{p.emotion}</span>
                  <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>
                    {p.count}×{p.prevCount ? ` (was ${p.prevCount}×)` : ""}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {/* Attributions */}
      {hasAttributions ? (
        <div className="sceneIn">
          <SectionHeader label="What's Contributing" badge="weekly" />
          {attributions.helped?.map((a, i) => (
            <div key={`h${i}`} className="card" style={{ borderLeft: "3px solid #5ee6a0", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>✓</span>
                <span style={{ color: "#5ee6a0", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>Helped</span>
              </div>
              <strong>{capitalize(a.trigger)}</strong>
              {a.improvement ? <p className="muted" style={{ fontSize: 12 }}>Improved by {a.improvement.toFixed(1)}</p> : null}
            </div>
          ))}
          {attributions.notWorking?.map((a, i) => (
            <div key={`n${i}`} className="card" style={{ borderLeft: "3px solid #ffb347", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>✕</span>
                <span style={{ color: "#ffb347", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>Not working</span>
              </div>
              <strong>{capitalize(a.trigger)}</strong>
              {a.note ? <p className="muted" style={{ fontSize: 12 }}>{a.note}</p> : null}
            </div>
          ))}
          {attributions.needsAttention?.map((a, i) => (
            <div key={`a${i}`} className="card" style={{ borderLeft: "3px solid #ff6b7a", marginBottom: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span>⚠️</span>
                <span style={{ color: "#ff6b7a", fontWeight: 600, fontSize: 12, textTransform: "uppercase" }}>Needs attention</span>
              </div>
              <strong>{capitalize(a.trigger)}</strong>
              {a.note ? <p className="muted" style={{ fontSize: 12 }}>{a.note}</p> : null}
            </div>
          ))}
        </div>
      ) : null}

      {/* Week-by-Week Snapshots */}
      {weeklySnapshots?.length >= 2 ? (
        <div className="sceneIn">
          <SectionHeader label="Week by Week" badge="live" />
          <div className="weekSnapshotRow">
            {weeklySnapshots.map((week) => {
              const color = scoreTone(week.score || 3).color;
              return (
                <div key={week.weekLabel} className="weekSnapshotCard">
                  <span className="muted" style={{ fontSize: 11, fontWeight: 700 }}>{week.weekLabel}</span>
                  <span style={{ fontSize: 20 }}>{scoreTone(week.score || 3).emoji}</span>
                  <strong style={{ color }}>{week.score?.toFixed(1) || "-"}</strong>
                  {week.stability != null ? <span className="muted" style={{ fontSize: 11 }}>{Math.round(week.stability * 100)}%</span> : null}
                  <span className="muted" style={{ fontSize: 11 }}>{week.moments} moments</span>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ── Actions Tab ── */
function ActionsTab({ report, sendActionFeedback }) {
  const actions = report?.actions || [];
  const feedback = report?.actionFeedback || [];
  const [responded, setResponded] = useState(() => {
    const map = {};
    for (const f of feedback) { map[f.actionId] = f.response; }
    return map;
  });
  const [submitting, setSubmitting] = useState(null);

  async function handleResponse(actionId, response) {
    if (responded[actionId] || submitting) return;
    setSubmitting(actionId);
    try {
      await sendActionFeedback(actionId, response);
      setResponded((prev) => ({ ...prev, [actionId]: response }));
    } catch (err) {
      console.error("Action feedback failed:", err?.message || err);
    } finally {
      setSubmitting(null);
    }
  }

  if (!actions.length) {
    return (
      <div className="card stack sceneIn" style={{ textAlign: "center" }}>
        <span style={{ fontSize: 48 }}>⚡</span>
        <strong>Actions on the way</strong>
        <p className="muted">Keep logging patterns. Once we see enough data, personalised action suggestions will appear here.</p>
        <a className="primaryButton inlineButton" href="/">Log a moment</a>
      </div>
    );
  }

  return (
    <div className="stack">
      <SectionHeader label="This week's actions" badge="live" extra={`${actions.length} suggestion${actions.length !== 1 ? "s" : ""}`} />
      <p className="muted sceneIn" style={{ fontSize: 12 }}>Based on your patterns this week</p>

      {actions.map((action) => {
        const done = responded[action.id];
        const isBusy = submitting === action.id;
        return (
          <div key={action.id} className={`card actionCard sceneIn ${done ? "actionCardDone" : ""}`}>
            <div className="actionHeader">
              <span className="actionIcon">{action.icon || "⚡"}</span>
              <div>
                <span className="sectionKicker" style={{ fontSize: 10 }}>{action.category || "Suggestion"}</span>
                <strong className="actionTitle">{action.title}</strong>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{colorizeInsightText(cleanText(action.reason))}</p>
            {done ? (
              <div className="actionFeedbackDone" style={{
                background: done === "helped" ? "#5ee6a018" : "#ffb34718",
                color: done === "helped" ? "#5ee6a0" : "#ffb347",
              }}>
                {done === "helped" ? "✓ Marked helpful" : "✕ Will adjust"}
              </div>
            ) : (
              <div className="actionButtons">
                <button
                  className="actionBtn actionBtnHelped"
                  onClick={() => handleResponse(action.id, "helped")}
                  disabled={!!submitting}
                  type="button"
                >
                  {isBusy ? "…" : "✓ Helped"}
                </button>
                <button
                  className="actionBtn actionBtnNot"
                  onClick={() => handleResponse(action.id, "not_helpful")}
                  disabled={!!submitting}
                  type="button"
                >
                  {isBusy ? "…" : "✕ Not helpful"}
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Premium Tab ── */
function PremiumTab({ report, modes, isPremium, router }) {
  const bm = report?.baselineMetrics;
  const invoked = report?.invokedMetrics;
  const compound = report?.compoundPatterns;
  const feedback = report?.actionFeedback || [];
  const hasLlmInsight = !!report?.llmInsight?.narrative;
  const topEmotion = deriveTopEmotion(report);
  const tone = bm?.recentAverage != null ? scoreTone(bm.recentAverage) : null;

  // Build signals
  const signals = [];
  if (bm?.drift) {
    const v = bm.drift.value;
    signals.push({ key: "drift", icon: v >= 0.2 ? "📈" : v <= -0.2 ? "📉" : "➡️", label: "Drift from baseline", body: v >= 0.2 ? "Trending upward from your baseline" : v <= -0.2 ? "Dipping below your baseline" : "Holding steady near baseline", color: v >= 0.2 ? "#5ee6a0" : v <= -0.2 ? "#ff6b7a" : "#9eb0c9" });
  }
  if (bm?.stability) {
    signals.push({ key: "stability", icon: bm.stability.score >= 0.6 ? "🟢" : "🟡", label: "Stability", body: bm.stability.score >= 0.6 ? "Emotionally steady this week" : "Some instability detected", color: bm.stability.score >= 0.6 ? "#5ee6a0" : "#ffb347" });
  }
  if (compound?.crashRisk) signals.push({ key: "crash", icon: "⚠️", label: "Crash risk", body: "Pattern suggests emotional overload building", color: "#ff6b7a" });
  if (compound?.falseRecovery) signals.push({ key: "recovery", icon: "🔄", label: "False recovery", body: "Recovery signals may not reflect deeper state", color: "#ffb347" });
  if (invoked?.weeklyMasking?.level && invoked.weeklyMasking.level !== "none") signals.push({ key: "masking", icon: "🎭", label: "Masking", body: `${capitalize(invoked.weeklyMasking.level)} masking detected`, color: "#c084fc" });
  if (invoked?.vacuumDrift != null && Math.abs(invoked.vacuumDrift) > 0.15) signals.push({ key: "vacuum", icon: invoked.vacuumDrift > 0 ? "🧘" : "⚡", label: "Inner state shift", body: invoked.vacuumDrift > 0 ? "Emotional bandwidth rising" : "Emotional bandwidth falling", color: invoked.vacuumDrift > 0 ? "#5ee6a0" : "#ffb347" });
  if (report?.volatilityLabel) {
    const high = report.volatilityLabel.toLowerCase().includes("high");
    signals.push({ key: "volatility", icon: high ? "⚡" : "🌊", label: "Volatility", body: high ? "High variability in emotions" : "Fairly stable emotional range", color: high ? "#ffb347" : "#5ee6a0" });
  }

  // LLM sections for pattern intelligence
  const llmSections = hasLlmInsight ? parseLlmSections(report.llmInsight.narrative) : null;

  // Direction text
  const directionText = (() => {
    if (report?.llmInsight?.narrative) {
      const sec = parseLlmSections(report.llmInsight.narrative);
      if (sec?.[2]) return sec[2];
    }
    if (report?.aiInsight?.actionableDirection) return report.aiInsight.actionableDirection;
    if (report?.aiInsight?.microExperiment) return report.aiInsight.microExperiment;
    return null;
  })();

  // Regulators with feedback
  const regulators = report?.regulators || [];
  const helpedTriggerSet = new Set(feedback.filter((f) => f.response === "tried" || f.response === "helped").map((f) => (f.trigger || f.category || "").toLowerCase()));

  // Action effectiveness
  const triedCount = feedback.filter((f) => f.response === "tried" || f.response === "helped").length;
  const skippedCount = feedback.filter((f) => f.response === "skipped" || f.response === "not_helpful").length;

  if (!isPremium) {
    return (
      <div className="card stack sceneIn" style={{ textAlign: "center" }}>
        <span style={{ fontSize: 48 }}>🧭</span>
        <strong>For You — Premium</strong>
        <p className="muted">Premium unlocks adaptive Move / Fuel / Perspective modes, signal cards, and deeper pattern intelligence — personalised to your week.</p>
        <button className="primaryButton inlineButton" onClick={() => router.push("/premium")} type="button">Go Premium</button>
      </div>
    );
  }

  return (
    <div className="stack">
      {/* Direction */}
      {directionText ? (
        <div className="sceneIn">
          <SectionHeader label="Try this" badge="weekly" />
          <div className="card" style={{ borderLeft: `3px solid ${tone?.color || "#7bc9d8"}` }}>
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.6 }}>{colorizeInsightText(cleanText(directionText))}</p>
          </div>
        </div>
      ) : null}

      {/* Signal Cards */}
      {signals.length > 0 ? (
        <div className="sceneIn">
          <SectionHeader label="What's shifting" badge="weekly" />
          <div className="premSignalGrid">
            {signals.map((sig) => (
              <div key={sig.key} className="premSignalCard" style={{ borderLeft: `3px solid ${sig.color}` }}>
                <span style={{ fontSize: 18 }}>{sig.icon}</span>
                <strong style={{ color: sig.color, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>{sig.label}</strong>
                <p className="muted" style={{ fontSize: 13, margin: 0 }}>{sig.body}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Pattern Intelligence (LLM) */}
      {hasLlmInsight && llmSections ? (
        <div className="sceneIn">
          <SectionHeader label="Pattern Intelligence" badge="weekly" />
          <div className="insightCardsRow">
            {INSIGHT_SECTION_META.map((meta, i) => (
              llmSections[i] ? (
                <div key={meta.label} className="insightSectionCard" style={{ borderLeft: `3px solid ${meta.accentColor}40` }}>
                  <span className="insightSectionIcon">{meta.icon}</span>
                  <span className="insightSectionLabel" style={{ color: meta.accentColor }}>{meta.label}</span>
                  <p className="insightSectionBody">{colorizeInsightText(cleanText(llmSections[i]))}</p>
                </div>
              ) : null
            ))}
          </div>
          {report.llmInsight.generatedAt ? (
            <p className="insightFooter" style={{ marginTop: 8 }}>
              Generated {new Date(report.llmInsight.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Levers (Regulators) */}
      {regulators.length > 0 ? (
        <div className="sceneIn">
          <SectionHeader label="Your Levers" badge="weekly" extra={helpedTriggerSet.size > 0 ? "Adaptive" : null} />
          <div className="card stack">
            {regulators.slice(0, 6).map((r, i) => {
              const isHelped = helpedTriggerSet.has((r.trigger || "").toLowerCase());
              return (
                <div key={i} className="driverRow">
                  <div style={{ flex: 1 }}>
                    <span style={{ color: TRIGGER_COLORS[r.trigger] || "#7bc9d8", fontWeight: 600 }}>{capitalize(r.trigger)}</span>
                    <span style={{ color: "#9eb0c9" }}> → </span>
                    <span style={{ color: EMOTION_COLORS[r.emotion] || "#5ee6a0", fontWeight: 600 }}>{r.emotion}</span>
                    <span className="muted" style={{ marginLeft: 8, fontSize: 12 }}>{r.count}× this week</span>
                  </div>
                  {isHelped ? (
                    <span className="effectBadge" style={{ color: "#5ee6a0", borderColor: "#5ee6a040", background: "#5ee6a018" }}>✓ Helped</span>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {/* Behaviour Snapshot */}
      {bm?.baseline?.reliable ? (
        <div className="sceneIn">
          <SectionHeader label="Behaviour Snapshot" badge="weekly" />
          <div className="metricGrid metricGridTwo">
            <div className="card stack metricCard">
              <p className="metricLabel">Baseline</p>
              <strong className="metricValue">{bm.baseline.score.toFixed(1)}/5</strong>
            </div>
            {bm.recentAverage != null ? (
              <div className="card stack metricCard">
                <p className="metricLabel">Recent Average</p>
                <strong className="metricValue">{bm.recentAverage.toFixed(1)}/5</strong>
              </div>
            ) : null}
            {bm.drift ? (
              <div className="card stack metricCard">
                <p className="metricLabel">Drift</p>
                <strong className="metricValue" style={{ color: bm.drift.value >= 0 ? "#5ee6a0" : "#ff6b7a" }}>
                  {bm.drift.value > 0 ? "+" : ""}{bm.drift.value.toFixed(1)}
                </strong>
              </div>
            ) : null}
            {bm.stability ? (
              <div className="card stack metricCard">
                <p className="metricLabel">Stability</p>
                <strong className="metricValue">{Math.round(bm.stability.score * 100)}%</strong>
              </div>
            ) : null}
            {bm.recoveryLatency ? (
              <div className="card stack metricCard">
                <p className="metricLabel">Recovery</p>
                <strong className="metricValue">~{bm.recoveryLatency.days}d</strong>
              </div>
            ) : null}
            <div className="card stack metricCard">
              <p className="metricLabel">Days Tracked</p>
              <strong className="metricValue">{bm.baseline.daysUsed}</strong>
            </div>
            {invoked?.currentVacuum != null ? (
              <div className="card stack metricCard">
                <p className="metricLabel">Vacuum</p>
                <strong className="metricValue" style={{ color: (invoked.vacuumDrift || 0) >= 0 ? "#5ee6a0" : "#ff6b7a" }}>
                  {invoked.currentVacuum.toFixed(1)}/5
                </strong>
              </div>
            ) : null}
            {invoked?.weeklyInvokedAvg != null ? (
              <div className="card stack metricCard">
                <p className="metricLabel">Internal Influence</p>
                <strong className="metricValue" style={{ color: invoked.weeklyInvokedAvg >= 0 ? "#5ee6a0" : "#ffb347" }}>
                  {invoked.weeklyInvokedAvg > 0 ? "+" : ""}{invoked.weeklyInvokedAvg.toFixed(2)}
                </strong>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Adaptive Modes */}
      {modes && (modes.move || modes.fuel || modes.perspective) ? (
        <div className="sceneIn">
          <SectionHeader label="Adaptive Modes" badge="weekly" />
          {["move", "fuel", "perspective"].filter((k) => modes[k]?.items?.length || modes[k]?.narrative).map((modeKey) => {
            const modeData = modes[modeKey];
            const modeIcon = modeKey === "move" ? "🏃" : modeKey === "fuel" ? "🍎" : "💡";
            const modeLabel = capitalize(modeKey);
            return (
              <div key={modeKey} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 20 }}>{modeIcon}</span>
                  <strong>{modeLabel}</strong>
                </div>
                {modeData.narrative ? (
                  <p className="muted" style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 8 }}>{colorizeInsightText(cleanText(modeData.narrative))}</p>
                ) : null}
                {modeData.items?.slice(0, 3).map((item, i) => (
                  <div key={item.id || i} style={{ padding: "8px 0", borderTop: i > 0 ? "1px solid rgba(197,214,235,0.06)" : "none" }}>
                    <strong style={{ fontSize: 14 }}>{item.name}</strong>
                    <p className="muted" style={{ fontSize: 12, margin: "2px 0 0" }}>{item.description}</p>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Action Effectiveness */}
      {(triedCount > 0 || skippedCount > 0) ? (
        <div className="sceneIn">
          <SectionHeader label="Action Effectiveness" badge="live" />
          <div className="card">
            <div className="metricGrid metricGridTwo">
              <div className="card stack metricCard" style={{ borderLeft: "3px solid #5ee6a0" }}>
                <p className="metricLabel">Helped</p>
                <strong className="metricValue" style={{ color: "#5ee6a0" }}>{triedCount}</strong>
              </div>
              <div className="card stack metricCard" style={{ borderLeft: "3px solid #9eb0c9" }}>
                <p className="metricLabel">Not helpful</p>
                <strong className="metricValue" style={{ color: "#9eb0c9" }}>{skippedCount}</strong>
              </div>
            </div>
            <p className="muted" style={{ fontSize: 12, textAlign: "center", marginTop: 8 }}>Your feedback is shaping future suggestions</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ReportPage() {
  const router = useRouter();
  const { loadWeeklyReport, loadProgress, loadModes, sendActionFeedback, shareWeek, isPremium } = useSession();
  const [report, setReport] = useState(null);
  const [progress, setProgress] = useState(null);
  const [modes, setModes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("mirror");

  const loadReport = useCallback(async () => {
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
  }, [loadWeeklyReport]);

  useEffect(() => { loadReport(); }, [loadReport]);

  // Load progress data when switching to progress tab (device-ID, no gating).
  useEffect(() => {
    if (activeTab === "progress" && !progress) {
      loadProgress().then((data) => setProgress(data)).catch((err) => console.error("Progress fetch failed:", err?.message));
    }
  }, [activeTab, progress, loadProgress]);

  // Load modes when switching to the For You tab — only when premium (matches
  // mobile; avoids churning rule-based fallbacks for free users).
  useEffect(() => {
    if (activeTab === "premium" && !modes && isPremium) {
      loadModes().then((data) => setModes(data)).catch((err) => console.error("Modes fetch failed:", err?.message));
    }
  }, [activeTab, modes, isPremium, loadModes]);

  const dq = report?.dataQuality || {};
  const confidence = dq.confidence || "too_early";
  const topEmotion = deriveTopEmotion(report);
  const stateColor = EMOTION_COLORS[topEmotion] || "#7bc9d8";

  return (
    <Layout
      title="Weekly report"
      actions={<button className="ghostButton" onClick={loadReport} type="button">Refresh</button>}
    >
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
        <div className="reportStack">
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

          {activeTab === "mirror" ? <MirrorTab report={report} dq={dq} confidence={confidence} router={router} /> : null}
          {activeTab === "week" ? <ThisWeekTab report={report} dq={dq} confidence={confidence} isPremium={isPremium} shareWeek={shareWeek} router={router} /> : null}
          {activeTab === "progress" ? <ProgressTab progress={progress} router={router} /> : null}
          {activeTab === "actions" ? <ActionsTab report={report} sendActionFeedback={sendActionFeedback} /> : null}
          {activeTab === "premium" ? <PremiumTab report={report} modes={modes} isPremium={isPremium} router={router} /> : null}

          {/* Footer */}
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
          <p className="feedback">Log at least 3 moments this week to see your patterns.</p>
          <a className="primaryButton inlineButton" href="/">Log a moment</a>
        </div>
      ) : null}
    </Layout>
  );
}
