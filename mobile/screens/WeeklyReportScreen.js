import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
  Alert,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppSession } from "@/hooks/useAppSession";
import { trackEvent } from "@/services/analyticsService";
import { palette, radius } from "@/utils/theme";

const screenWidth = Dimensions.get("window").width;

/** Strip encoding artifacts from any backend/stored text */
function cleanText(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\u2014/g, ", ")
    .replace(/\u2013/g, ", ")
    .trim();
}

/**
 * Parse a structured LLM narrative into 3 distinct sections.
 * Expected headers: "What stood out", "What may be contributing", "One thing to try".
 * Falls back to showing the whole narrative in section 1 if parsing fails.
 */
function parseLlmSections(narrative) {
  if (!narrative) return null;
  const text = cleanText(narrative);

  const headerRe = /(?:what stood out|what may be contributing|one thing to try)/gi;
  const labelMap = [
    /what stood out/i,
    /what may be contributing/i,
    /one thing to try/i,
  ];

  // Collect ALL header positions
  const hits = [];
  let m;
  while ((m = headerRe.exec(text)) !== null) {
    const section = labelMap.findIndex((p) => p.test(m[0]));
    if (section >= 0) hits.push({ idx: m.index, section, len: m[0].length });
  }

  // Take only the FIRST occurrence of each section
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
    // Find where the duplicate/second set starts (first repeated header)
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

  // Fallback: split by double newlines into up to 3 chunks
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

const EMOTION_EMOJIS = {
  frustrated: "💢", anxious: "⚡", neutral: "🌫️",
  calm: "🍃", energized: "☀️",
};

const TIME_ICONS = { morning: "🌅", afternoon: "☀️", evening: "🌆", night: "🌙" };

const ENERGY_COLORS = {
  steady: palette.success, balanced: palette.accent, tense: palette.warning,
  drained: palette.danger, uplifted: palette.purple,
};

const CONFIDENCE_LABELS = {
  too_early: "Just getting started",
  low: "Early patterns",
  emerging: "Taking shape",
  moderate: "Solid picture",
  strong: "High confidence",
};

function topEntries(record, limit = 5) {
  return Object.entries(record || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
}

/* -- Shared components -- */

function HBar({ label, value, max, color = palette.accent, icon }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  return (
    <View style={s.hbarRow}>
      <Text style={s.hbarLabel} numberOfLines={1}>
        {icon ? `${icon} ` : ""}{label}
      </Text>
      <View style={s.hbarTrack}>
        <View style={[s.hbarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={s.hbarValue}>{value}</Text>
    </View>
  );
}

function SectionHeader({ label, extra, badge }) {
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionHeaderLeft}>
        <Text style={s.sectionKicker}>{label.toUpperCase()}</Text>
        {badge ? (
          <View style={[s.freqBadge, badge === "weekly" && s.freqBadgeWeekly]}>
            <Text style={[s.freqBadgeText, badge === "weekly" && s.freqBadgeTextWeekly]}>
              {badge === "weekly" ? "WEEKLY" : "LIVE"}
            </Text>
          </View>
        ) : null}
      </View>
      {extra ? <Text style={s.sectionExtra}>{extra}</Text> : null}
    </View>
  );
}

function LockedSection({ title, teaser, ctaLabel, onPress, children }) {
  return (
    <View style={s.lockedWrap}>
      <View style={s.lockedContent} pointerEvents="none">{children}</View>
      <LinearGradient
        colors={["transparent", "rgba(11,18,32,0.92)", "rgba(11,18,32,0.98)"]}
        locations={[0, 0.45, 1]}
        style={s.lockedGradient}
      />
      <View style={s.lockedOverlay}>
        <View style={s.lockedIcon}><Text style={{ fontSize: 18 }}>🔒</Text></View>
        <Text style={s.lockedTitle}>{title}</Text>
        <Text style={s.lockedTeaser}>{teaser}</Text>
        <Pressable style={s.lockedCta} onPress={onPress} accessibilityRole="button">
          <Text style={s.lockedCtaText}>{ctaLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

function PairingChip({ trigger, emotion, count, positive }) {
  const bg = positive ? (palette.successSoft || palette.glass) : (palette.dangerSoft || palette.glass);
  const border = positive ? (palette.success + "44") : (palette.danger + "44");
  return (
    <View style={[s.pairingChip, { backgroundColor: bg, borderColor: border }]}>
      <Text style={s.pairingText}>
        {trigger} → {emotion} ×{count}
      </Text>
    </View>
  );
}

/* -- Main screen -- */

export function WeeklyReportScreen() {
  const { loadWeeklyReport, refreshSession, subscription, user, token, subscribe } = useAppSession();
  const router = useRouter();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [purchasing, setPurchasing] = useState(false);

  const isSignedIn = Boolean(user && token);
  const isPremium = subscription?.status === "active" || subscription?.status === "grace_period";

  const callbacksRef = useRef({});
  callbacksRef.current = { loadWeeklyReport, refreshSession, token, isPremium, isSignedIn };

  const reportRef = useRef(null);
  reportRef.current = report;

  const load = useCallback(async (isRetry = false) => {
    if (isRetry && reportRef.current) {
      // Retry: keep existing report visible, show subtle indicator
      setError("");
    } else {
      setLoading(true);
      setError("");
    }
    try {
      const nextReport = await callbacksRef.current.loadWeeklyReport();
      setReport(nextReport);
    } catch {
      // Only clear report if we never had one
      if (!reportRef.current) setReport(null);
      setError("Unable to load report. Check connection.");
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const { token: t, refreshSession: rs, isPremium: p, isSignedIn: si } = callbacksRef.current;
    if (t) rs().catch(() => null);
    trackEvent("report_screen_viewed", { tier: p ? "premium" : si ? "signed" : "anonymous" });
  }, [load]));

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

  function handleSignIn() { trackEvent("report_signin_unlock_tapped", {}); router.push("/login"); }
  function handlePremium() { trackEvent("report_premium_unlock_tapped", {}); router.push("/(tabs)/premium"); }
  async function handleUpgrade() {
    trackEvent("report_upgrade_tapped", {});
    try {
      setPurchasing(true);
      await subscribe();
      load();
    } catch (err) {
      const msg = err?.message || "";
      if (err?.code === "E_USER_CANCELLED" || msg.includes("cancelled")) return;
      if (msg.includes("not found") || msg.includes("No subscription")) {
        Alert.alert("Subscription unavailable", "Could not find the subscription product. Make sure the app is up to date.");
      } else {
        Alert.alert("Upgrade error", msg || "Something went wrong.");
      }
    } finally {
      setPurchasing(false);
    }
  }

  return (
    <ScreenShell
      loading={loading}
      loadingTitle="Building your report"
      loadingMessage="Summarizing patterns from the past week."
      timeoutMessage="Unable to load report. Check connection."
      onRetry={() => load(true)}
      scroll
    >
      <View style={s.canvas}>
        <Image source={require("@/assets/report-bg.png")} style={s.bgImage} resizeMode="cover" accessible={false} />

        <View style={s.content}>

          {/* --- 1. AT A GLANCE HERO --- */}
          <View style={s.header}>
            <Text style={s.kicker}>Weekly patterns</Text>
            <Text style={s.title}>Your Week</Text>
            {report?.totalMoments ? (
              <Text style={s.subtitle}>
                {report.totalMoments} moment{report.totalMoments !== 1 ? "s" : ""} across {dq.daysLogged || "-"} day{(dq.daysLogged || 0) !== 1 ? "s" : ""}
              </Text>
            ) : null}
            {report?.totalMoments ? (
              <View style={s.heroRow}>
                <View style={s.heroPill}>
                  <Text style={s.heroPillEmoji}>
                    {report.topEmotion ? (EMOTION_EMOJIS[report.topEmotion] || "•") : "🌀"}
                  </Text>
                  <Text style={s.heroPillLabel}>
                    {report.topEmotion || "Mixed"}
                  </Text>
                </View>
                <View style={s.heroPill}>
                  <Text style={s.heroPillEmoji}>🎯</Text>
                  <Text style={s.heroPillLabel}>
                    {report.topTrigger || (report.tiedTriggers?.length > 1 ? `${report.tiedTriggers.length} areas` : "-")}
                  </Text>
                </View>
                <View style={[s.heroPill, s.confidencePill]}>
                  <Text style={s.heroPillLabel}>{CONFIDENCE_LABELS[confidence] || confidence}</Text>
                </View>
              </View>
            ) : null}
            {hasRuleInsight ? (
              <Text style={s.takeaway}>{cleanText(report.aiInsight.summary)}</Text>
            ) : null}
          </View>

          {error ? (
            <View style={s.stateCard}>
              <Text style={s.stateTitle}>Report unavailable</Text>
              <Text style={s.stateBody}>{error}</Text>
              <PrimaryButton label="Retry" onPress={() => load(true)} />
            </View>
          ) : null}

          {report && !error && confidence === "too_early" ? (
            /* ---------- STARTER STATE (0-2 moments) ---------- */
            <View style={s.starterCard}>
              <Text style={s.starterEmoji}>🌱</Text>
              <Text style={s.starterTitle}>
                {isSignedIn ? "A few more moments to go" : "Start tracking to see patterns"}
              </Text>
              <Text style={s.starterBody}>
                {isSignedIn
                  ? "Log at least 3 moments this week for patterns to start forming. The more days you cover, the sharper the picture."
                  : "Log a few moments and sign in to unlock personalised insights about your patterns."}
              </Text>
              {!isSignedIn ? (
                <>
                  <PrimaryButton label="Sign in to unlock deeper insights" onPress={handleSignIn} />
                  <Pressable style={s.nudgeSecondary} onPress={() => router.push("/(tabs)/log")} accessibilityRole="button">
                    <Text style={s.nudgeSecondaryText}>Log a moment</Text>
                  </Pressable>
                </>
              ) : (
                <PrimaryButton label="Log a moment" onPress={() => router.push("/(tabs)/log")} />
              )}
            </View>
          ) : null}

          {report && !error && confidence !== "too_early" ? (
            <>
              {/* --- 2. WHAT SHOWED UP --- */}
              <SectionHeader label="What showed up" badge="live" extra={`${dq.uniqueEmotions || 0} emotions · ${dq.uniqueTriggers || 0} triggers`} />

              {emotionEntries.length ? (
                <View style={s.card}>
                  {emotionEntries.map(([key, value]) => (
                    <HBar key={key} label={key} value={value} max={emotionMax} color={palette.warning} icon={EMOTION_EMOJIS[key]} />
                  ))}
                </View>
              ) : null}

              {triggerEntries.length ? (
                <View style={s.card}>
                  {triggerEntries.map(([key, value]) => (
                    <HBar key={key} label={key} value={value} max={triggerMax} color={palette.accent} />
                  ))}
                </View>
              ) : null}

              {/* Time of day — conditional on rhythm data */}
              {dq.hasEnoughForRhythm && timeEntries.length ? (
                <View style={s.card}>
                  <Text style={s.cardLabel}>When you logged</Text>
                  {timeEntries.map(([key, value]) => (
                    <HBar key={key} label={key} value={value} max={timeMax} color={palette.warning} icon={TIME_ICONS[key]} />
                  ))}
                </View>
              ) : null}

              {/* --- 3. WHAT HELPED / WHAT DRAINED --- */}
              {(report.regulators?.length > 0 || report.frictionZones?.length > 0) ? (
                <>
                  <SectionHeader label="What helped · What drained" badge="live" />
                  <View style={s.card}>
                    {report.regulators?.length ? (
                      <View style={s.pairingGroup}>
                        <Text style={s.pairingGroupLabel}>🌿 Regulators</Text>
                        <View style={s.pairingList}>
                          {report.regulators.slice(0, 4).map((r) => (
                            <PairingChip key={`${r.trigger}-${r.emotion}`} trigger={r.trigger} emotion={r.emotion} count={r.count} positive />
                          ))}
                        </View>
                      </View>
                    ) : null}
                    {report.frictionZones?.length ? (
                      <View style={s.pairingGroup}>
                        <Text style={s.pairingGroupLabel}>🔥 Friction zones</Text>
                        <View style={s.pairingList}>
                          {report.frictionZones.slice(0, 4).map((f) => (
                            <PairingChip key={`${f.trigger}-${f.emotion}`} trigger={f.trigger} emotion={f.emotion} count={f.count} positive={false} />
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </View>
                </>
              ) : null}

              {/* --- 4. PATTERNS & PAIRINGS (conditional) --- */}
              {!isSignedIn && confidence !== "low" ? (
                <LockedSection
                  title="Patterns and pairings"
                  teaser="Create a free account to see emotional correlations, energy flow, and weekly trajectory."
                  ctaLabel="Sign in to unlock"
                  onPress={handleSignIn}
                >
                  <View style={s.card}>
                    <Text style={[s.aiSummary, { color: palette.muted }]}>
                      Deeper correlations between triggers and emotions appear here once you sign in.
                    </Text>
                  </View>
                </LockedSection>
              ) : (
                <>
                  {/* Correlations */}
                  {dq.hasEnoughForPairings && Object.keys(report.correlations || {}).length ? (
                    <View style={s.section}>
                      <SectionHeader label="Trigger → Emotion" badge="live" />
                      <View style={s.card}>
                        {Object.entries(report.correlations).slice(0, 5).map(([trigger, emotions]) => (
                          <View style={s.correlationRow} key={trigger}>
                            <Text style={s.correlationTrigger}>{trigger}</Text>
                            <View style={s.correlationChips}>
                              {Object.entries(emotions).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a).slice(0, 3).map(([emo, count]) => (
                                <View style={s.correlationChip} key={emo}>
                                  <Text style={s.correlationChipText}>
                                    {EMOTION_EMOJIS[emo] || ""} {emo} ×{count}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          </View>
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {/* Energy distribution */}
                  {energyEntries.length ? (
                    <View style={s.section}>
                      <SectionHeader label="Energy flow" badge="live" />
                      <View style={s.card}>
                        {energyEntries.map(([key, value]) => (
                          <HBar key={key} label={key} value={value} max={energyMax} color={ENERGY_COLORS[key] || palette.accent} />
                        ))}
                      </View>
                    </View>
                  ) : null}

                  {/* --- 5. TIME & RHYTHM (conditional) --- */}
                  {dq.hasEnoughForStability ? (
                    <View style={s.section}>
                      <SectionHeader label="Stability" badge="weekly" />
                      <View style={s.metricsRow}>
                        {report.volatilityScore !== null ? (
                          <View style={s.metricCard}>
                            <Text style={s.metricLabel}>Volatility</Text>
                            <Text style={s.metricValue}>
                              {report.volatilityScore < 0.5 ? "🟢" : report.volatilityScore < 1.5 ? "🟡" : "🔴"} {report.volatilityScore}
                            </Text>
                          </View>
                        ) : null}
                        {report.mostStableDay ? (
                          <View style={s.metricCard}>
                            <Text style={s.metricLabel}>Steadiest day</Text>
                            <Text style={s.metricValue}>
                              {new Date(report.mostStableDay).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    </View>
                  ) : null}

                  {/* Trajectory */}
                  {dq.hasEnoughForTrajectory && report.weeklyEmotionTrajectory?.length > 1 ? (
                    <View style={s.section}>
                      <SectionHeader label="Emotion trajectory" badge="live" />
                      {report.trajectoryNote ? (
                        <Text style={s.trajectoryNote}>{cleanText(report.trajectoryNote)}</Text>
                      ) : null}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.trajectoryScroll}>
                        {report.weeklyEmotionTrajectory.map((day) => (
                          <View style={s.trajectoryDay} key={day.date}>
                            <Text style={s.trajectoryEmoji}>{EMOTION_EMOJIS[day.dominantEmotion] || "•"}</Text>
                            <Text style={s.trajectoryScore}>{day.score}</Text>
                            <Text style={s.trajectoryDate}>
                              {new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                    </View>
                  ) : null}

                  {/* Micro-experiment */}

                  {/* Gut check — prediction accuracy */}
                  {report.predictionAccuracy ? (
                    <View style={s.section}>
                      <SectionHeader label="Gut check" badge="live" />
                      <View style={s.card}>
                        <View style={s.gutCheckRow}>
                          <Text style={s.gutCheckEmoji}>
                            {report.predictionAccuracy.rate >= 0.5 ? "🎯" : "🔮"}
                          </Text>
                          <View style={s.gutCheckContent}>
                            <Text style={s.gutCheckTitle}>
                              {report.predictionAccuracy.correct} of {report.predictionAccuracy.daysCompared} days
                            </Text>
                            <Text style={s.gutCheckBody}>
                              {report.predictionAccuracy.rate >= 0.6
                                ? "Your morning gut feeling matched how the day actually went. Strong self-awareness."
                                : report.predictionAccuracy.rate >= 0.3
                                  ? "Your predictions were a mixed bag. Your days may hold more surprises than you expect."
                                  : "Your days unfolded differently than expected. Not a bad thing — it means you're adapting."}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ) : null}
                </>
              )}

              {/* --- 5b. TRY THIS WEEK (all users) --- */}
              {report.aiInsight?.microExperiment ? (
                <View style={s.experimentCard}>
                  <View style={s.aiLabelRow}>
                    <View style={[s.aiLabelPill, { backgroundColor: palette.successSoft || palette.glass }]}>
                      <Text style={[s.aiLabelText, { color: palette.success }]}>Try this week</Text>
                    </View>
                  </View>
                  <Text style={s.experimentText}>{cleanText(report.aiInsight.microExperiment)}</Text>
                </View>
              ) : null}

              {/* --- 6. WEEKLY INSIGHT — strict state model --- */}
              {(() => {
                /* ── ANONYMOUS ── */
                if (!isSignedIn) {
                  return (
                    <View style={s.section}>
                      <SectionHeader label="Insights" badge="weekly" />
                      <View style={s.insightStateCard}>
                        <Text style={s.insightStateIcon}>🔒</Text>
                        <Text style={s.insightStateTitle}>Unlock deeper insights</Text>
                        <Text style={s.insightStateBody}>
                          Sign in for free to get personalised pattern analysis based on your data.
                        </Text>
                        <PrimaryButton label="Sign in to unlock deeper insights" onPress={handleSignIn} />
                        <Pressable style={s.nudgeSecondary} onPress={() => router.push("/(tabs)/log")} accessibilityRole="button">
                          <Text style={s.nudgeSecondaryText}>Log a moment</Text>
                        </Pressable>
                      </View>
                    </View>
                  );
                }

                /* ── PREMIUM + full insight ── */
                if (isPremium && hasLlmInsight) {
                  const sections = parseLlmSections(report.llmInsight.narrative);
                  const generatedAt = report.llmInsight.generatedAt;
                  const daysAgo = generatedAt
                    ? Math.max(0, Math.floor((Date.now() - new Date(generatedAt).getTime()) / 86400000))
                    : null;
                  return (
                    <View style={s.section}>
                      <SectionHeader label="Weekly insight" badge="weekly" />
                      {sections ? (
                        <View style={s.insightCardsRow}>
                          {INSIGHT_SECTION_META.map((meta, i) => (
                            sections[i] ? (
                              <View key={meta.label} style={s.insightSectionCard}>
                                <Text style={s.insightSectionIcon}>{meta.icon}</Text>
                                <Text style={s.insightSectionLabel}>{meta.label}</Text>
                                <Text style={s.insightSectionBody}>{sections[i]}</Text>
                              </View>
                            ) : null
                          ))}
                        </View>
                      ) : (
                        <View style={s.insightSectionCard}>
                          <Text style={s.insightSectionBody}>{cleanText(report.llmInsight.narrative)}</Text>
                        </View>
                      )}
                      {daysAgo !== null ? (
                        <Text style={s.insightFooter}>
                          Updated {daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`}
                        </Text>
                      ) : null}
                    </View>
                  );
                }

                /* ── PREMIUM, no insight yet (post-purchase) ── */
                if (isPremium && !hasLlmInsight) {
                  return (
                    <View style={s.section}>
                      <SectionHeader label="Weekly insight" badge="weekly" />
                      <View style={s.insightStateCard}>
                        <Text style={s.insightStateIcon}>✨</Text>
                        <Text style={s.insightStateTitle}>Your insight is updating</Text>
                        <Text style={s.insightStateBody}>
                          This usually takes under a minute. Your patterns are being analyzed.
                        </Text>
                      </View>
                    </View>
                  );
                }

                /* ── SIGNED-IN FREE + teaser or insight available ── */
                if (hasLlmTeaser || hasLlmInsight) {
                  const narrativeSource = report.llmTeaser?.narrative || report.llmInsight?.narrative;
                  const sections = parseLlmSections(narrativeSource);
                  const teaserText = sections?.[0] || cleanText(narrativeSource).split(/\n\s*\n/)[0] || "";

                  /* First free preview: show all 3 cards */
                  if (hasLlmInsight && report.llmInsight.firstFree) {
                    const fullSections = parseLlmSections(report.llmInsight.narrative);
                    return (
                      <View style={s.section}>
                        <SectionHeader label="Weekly insight" badge="weekly" />
                        <View style={s.aiLabelRow}>
                          <View style={[s.aiLabelPill, { backgroundColor: palette.successSoft, marginLeft: 0 }]}>
                            <Text style={[s.aiLabelText, { color: palette.success }]}>Free preview</Text>
                          </View>
                        </View>
                        {fullSections ? (
                          <View style={s.insightCardsRow}>
                            {INSIGHT_SECTION_META.map((meta, i) => (
                              fullSections[i] ? (
                                <View key={meta.label} style={s.insightSectionCard}>
                                  <Text style={s.insightSectionIcon}>{meta.icon}</Text>
                                  <Text style={s.insightSectionLabel}>{meta.label}</Text>
                                  <Text style={s.insightSectionBody}>{fullSections[i]}</Text>
                                </View>
                              ) : null
                            ))}
                          </View>
                        ) : (
                          <View style={s.insightSectionCard}>
                            <Text style={s.insightSectionBody}>{cleanText(report.llmInsight.narrative)}</Text>
                          </View>
                        )}
                        <Text style={s.firstFreeHint}>Future pattern insights require Premium.</Text>
                      </View>
                    );
                  }

                  return (
                    <View style={s.section}>
                      <SectionHeader label="Weekly insight" badge="weekly" />
                      <View style={s.teaserCard}>
                        <Text style={s.teaserTitle}>A deeper pattern is emerging…</Text>
                        <Text style={s.teaserBody} numberOfLines={3}>{teaserText}</Text>
                        <LinearGradient
                          colors={["transparent", palette.glass]}
                          locations={[0, 1]}
                          style={s.teaserFade}
                        />
                      </View>
                      <Pressable style={s.teaserCtaButton} onPress={handleUpgrade} disabled={purchasing} accessibilityRole="button">
                        <Text style={s.teaserCtaButtonText}>{purchasing ? "Please wait…" : "Upgrade to Premium"}</Text>
                      </Pressable>
                      <Text style={s.teaserSubtext}>Unlock full insights into your patterns</Text>
                    </View>
                  );
                }

                /* ── SIGNED-IN FREE, no teaser yet — neutral ── */
                return (
                  <View style={s.section}>
                    <SectionHeader label="Insights" badge="weekly" />
                    <View style={s.insightStateCard}>
                      <Text style={s.insightStateIcon}>📊</Text>
                      <Text style={s.insightStateTitle}>Building your insight</Text>
                      <Text style={s.insightStateBody}>
                        Keep logging — your personalised insight will appear here once there is enough data.
                      </Text>
                    </View>
                  </View>
                );
              })()}
            </>
          ) : null}

          {!report && !loading && !error ? (
            <View style={[s.stateCard, s.emptyStateCard]}>
              <Image source={require("@/assets/report-empty.png")} style={s.emptyIllustration} resizeMode="contain" accessible={false} />
              <Text style={s.stateTitle}>Your first insight is on its way</Text>
              <Text style={s.stateBody}>Log a few moments this week and we will surface the patterns behind your emotions.</Text>
              <PrimaryButton label="Log a moment" onPress={() => router.push("/(tabs)/log")} />
            </View>
          ) : null}
        </View>
      </View>
    </ScreenShell>
  );
}

/* ----------------------------------------------------------
   Styles
   ---------------------------------------------------------- */

const s = StyleSheet.create({
  canvas: { position: "relative", minHeight: 1 },
  bgImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined, opacity: 0.05 },
  content: { gap: 14 },

  /* Header / hero */
  header: { gap: 6, marginTop: 10 },
  kicker: { color: palette.accent, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
  title: { color: palette.text, fontSize: 26, fontWeight: "700" },
  subtitle: { color: palette.muted, fontSize: 13, marginTop: 2 },
  freshness: { color: palette.muted, fontSize: 11, marginTop: 4, fontStyle: "italic" },
  heroRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  heroPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.pill, backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  confidencePill: { backgroundColor: palette.accentSoft, borderColor: palette.accentMedium },
  heroPillEmoji: { fontSize: 14 },
  heroPillLabel: { color: palette.text, fontSize: 12, fontWeight: "600", textTransform: "capitalize" },
  takeaway: {
    color: palette.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 6,
    paddingVertical: 10, paddingHorizontal: 14,
    borderRadius: radius.sm, backgroundColor: palette.glass,
    borderLeftWidth: 3, borderLeftColor: palette.accent,
    overflow: "hidden",
  },

  /* AI / insight */
  aiCard: {
    borderRadius: radius.md, padding: 18, gap: 10,
    backgroundColor: palette.accentSoft,
    borderWidth: 1, borderColor: palette.accentMedium,
  },
  aiLabelRow: { flexDirection: "row" },
  aiLabelPill: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill,
    backgroundColor: palette.accentSoft,
  },
  aiLabelText: {
    color: palette.accent, fontSize: 11, fontWeight: "700",
    textTransform: "uppercase", letterSpacing: 0.6,
  },
  aiSummary: { color: palette.text, fontSize: 14, lineHeight: 22 },
  aiSuggestion: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  firstFreeHint: { color: palette.muted, fontSize: 12, lineHeight: 17, fontStyle: "italic", marginTop: 4 },

  /* Micro-experiment */
  experimentCard: {
    borderRadius: radius.md, padding: 16, gap: 8,
    backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
    borderLeftWidth: 3, borderLeftColor: palette.success,
  },
  experimentText: { color: palette.textSecondary, fontSize: 14, lineHeight: 21 },

  /* Metrics */
  metricsRow: { flexDirection: "row", gap: 8 },
  metricCard: {
    flex: 1, borderRadius: radius.md, padding: 14, gap: 4,
    backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  metricLabel: {
    color: palette.muted, fontSize: 10, fontWeight: "700",
    letterSpacing: 0.8, textTransform: "uppercase",
  },
  metricValue: { color: palette.text, fontSize: 15, fontWeight: "700", textTransform: "capitalize" },

  /* Section / card */
  section: { gap: 8 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionKicker: {
    color: palette.accent, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.2,
  },
  sectionExtra: { color: palette.muted, fontSize: 11 },
  freqBadge: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: radius.pill,
    backgroundColor: palette.successSoft || "rgba(52,199,89,0.12)",
  },
  freqBadgeWeekly: {
    backgroundColor: palette.purpleSoft || "rgba(175,130,255,0.12)",
  },
  freqBadgeText: {
    color: palette.success || "#34C759", fontSize: 8, fontWeight: "800", letterSpacing: 0.5,
  },
  freqBadgeTextWeekly: {
    color: palette.purple || "#AF82FF",
  },
  card: {
    borderRadius: radius.md, padding: 14, gap: 10,
    backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  cardLabel: {
    color: palette.muted, fontSize: 10, fontWeight: "700",
    letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2,
  },

  /* Horizontal bar */
  hbarRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hbarLabel: { width: 80, color: palette.text, fontSize: 13, textTransform: "capitalize" },
  hbarTrack: {
    flex: 1, height: 8, borderRadius: radius.pill,
    backgroundColor: palette.glass,
    overflow: "hidden",
  },
  hbarFill: { height: "100%", borderRadius: radius.pill },
  hbarValue: { width: 26, color: palette.muted, fontSize: 12, textAlign: "right" },

  /* Pairings */
  pairingGroup: { gap: 6 },
  pairingGroupLabel: {
    color: palette.text, fontSize: 13, fontWeight: "700",
  },
  pairingList: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  pairingChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill,
    borderWidth: 1,
  },
  pairingText: { color: palette.text, fontSize: 12, textTransform: "capitalize" },

  /* Trajectory */
  trajectoryScroll: { gap: 8, paddingVertical: 4 },
  trajectoryDay: {
    alignItems: "center", gap: 4, minWidth: 56,
    paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: radius.md, backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  trajectoryEmoji: { fontSize: 20 },
  trajectoryScore: { color: palette.text, fontSize: 14, fontWeight: "700" },
  trajectoryDate: {
    color: palette.muted, fontSize: 10, fontWeight: "600",
    textTransform: "uppercase", letterSpacing: 0.4,
  },
  trajectoryNote: { color: palette.muted, fontSize: 13, lineHeight: 19, fontStyle: "italic" },

  /* Correlation */
  correlationRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingBottom: 8, borderBottomWidth: 1,
    borderBottomColor: palette.glassBorder,
  },
  correlationTrigger: { width: 70, color: palette.text, fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  correlationChips: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  correlationChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
    backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  correlationChipText: { color: palette.text, fontSize: 11, textTransform: "capitalize" },

  /* Locked */
  lockedWrap: {
    position: "relative", borderRadius: radius.md, overflow: "hidden",
    borderWidth: 1, borderColor: palette.glassBorder, backgroundColor: palette.glass,
  },
  lockedContent: { opacity: 0.3, padding: 14, gap: 8, minHeight: 220 },
  lockedGradient: { ...StyleSheet.absoluteFillObject, zIndex: 1 },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center",
    gap: 10, zIndex: 2, paddingHorizontal: 28,
  },
  lockedIcon: {
    width: 44, height: 44, borderRadius: radius.sm,
    alignItems: "center", justifyContent: "center",
    backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: palette.accentMedium,
  },
  lockedTitle: { color: palette.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  lockedTeaser: { color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 280 },
  lockedCta: {
    marginTop: 4, paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: radius.pill, backgroundColor: palette.accentStrong,
  },
  lockedCtaText: { color: palette.text, fontSize: 14, fontWeight: "700" },

  /* Data quality nudge */
  nudgeCard: {
    borderRadius: radius.md, padding: 20, gap: 10,
    backgroundColor: palette.accentSoft,
    borderWidth: 1, borderColor: palette.accentMedium,
  },
  nudgeTitle: { color: palette.text, fontSize: 16, fontWeight: "700" },
  nudgeBody: { color: palette.muted, fontSize: 14, lineHeight: 20 },
  nudgeSecondary: {
    marginTop: 4, paddingVertical: 10, alignItems: "center",
  },
  nudgeSecondaryText: {
    color: palette.accent, fontSize: 14, fontWeight: "600", textDecorationLine: "underline",
  },

  /* Starter state (too_early) */
  starterCard: {
    alignItems: "center", gap: 14, paddingVertical: 40, paddingHorizontal: 24,
    borderRadius: radius.md, backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  starterEmoji: { fontSize: 40 },
  starterTitle: { color: palette.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  starterBody: { color: palette.muted, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 280 },

  /* State cards */
  stateCard: {
    borderRadius: radius.md, padding: 20, gap: 10,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
  },
  emptyStateCard: { alignItems: "center", paddingVertical: 32 },
  emptyIllustration: { width: 120, height: 120, marginBottom: 8, opacity: 0.9 },
  stateTitle: { color: palette.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  stateBody: { color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 260 },

  /* Gut check (prediction accuracy) */
  gutCheckRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  gutCheckEmoji: { fontSize: 28, marginTop: 2 },
  gutCheckContent: { flex: 1, gap: 4 },
  gutCheckTitle: { color: palette.text, fontSize: 15, fontWeight: "700" },
  gutCheckBody: { color: palette.muted, fontSize: 13, lineHeight: 19 },

  /* Teaser card (State 3) */
  teaserCard: {
    position: "relative", borderRadius: radius.md, padding: 18, gap: 8,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
    overflow: "hidden",
  },
  teaserTitle: { color: palette.text, fontSize: 16, fontWeight: "700" },
  teaserBody: { color: palette.textSecondary, fontSize: 14, lineHeight: 21 },
  teaserFade: {
    position: "absolute", left: 0, right: 0, bottom: 0, height: 32,
  },
  teaserCtaButton: {
    alignSelf: "stretch", alignItems: "center",
    paddingVertical: 14, borderRadius: radius.pill,
    backgroundColor: palette.accentStrong,
  },
  teaserCtaButtonText: { color: palette.text, fontSize: 15, fontWeight: "700" },
  teaserSubtext: { color: palette.muted, fontSize: 12, textAlign: "center", lineHeight: 17 },

  /* Insight state cards (States 1, 2, 5) */
  insightStateCard: {
    alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 24,
    borderRadius: radius.md, backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  insightStateIcon: { fontSize: 28 },
  insightStateTitle: { color: palette.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  insightStateBody: { color: palette.muted, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 280 },
  insightFooter: { color: palette.muted, fontSize: 11, fontStyle: "italic", textAlign: "right" },

  /* Insight 3-card layout */
  insightCardsRow: { gap: 10 },
  insightSectionCard: {
    borderRadius: radius.md, padding: 16, gap: 6,
    backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  insightSectionIcon: { fontSize: 20 },
  insightSectionLabel: {
    color: palette.purple, fontSize: 11, fontWeight: "700",
    letterSpacing: 0.6, textTransform: "uppercase",
  },
  insightSectionBody: {
    color: palette.text, fontSize: 14, lineHeight: 21,
  },
});
