import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import {
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

const EMOTION_EMOJIS = {
  frustrated: "\uD83D\uDCA2", anxious: "\u26A1", neutral: "\uD83C\uDF2B\uFE0F",
  calm: "\uD83C\uDF43", energized: "\u2600\uFE0F",
};

const TIME_ICONS = { morning: "\uD83C\uDF05", afternoon: "\u2600\uFE0F", evening: "\uD83C\uDF06", night: "\uD83C\uDF19" };

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

function SectionHeader({ label, extra }) {
  return (
    <View style={s.sectionHeader}>
      <Text style={s.sectionKicker}>{label}</Text>
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
        <View style={s.lockedIcon}><Text style={{ fontSize: 18 }}>{"\uD83D\uDD12"}</Text></View>
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
        {trigger} {"\u2192"} {emotion} {"\u00D7"}{count}
      </Text>
    </View>
  );
}

/* -- Main screen -- */

export function WeeklyReportScreen() {
  const { loadWeeklyReport, refreshSession, subscription, user, token } = useAppSession();
  const router = useRouter();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isSignedIn = Boolean(user && token);
  const isPremium = subscription?.status === "active" || subscription?.status === "grace_period";

  const callbacksRef = useRef({});
  callbacksRef.current = { loadWeeklyReport, refreshSession, token, isPremium, isSignedIn };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextReport = await callbacksRef.current.loadWeeklyReport();
      setReport(nextReport);
    } catch {
      setReport(null);
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

  return (
    <ScreenShell
      loading={loading}
      loadingTitle="Building your report"
      loadingMessage="Summarizing patterns from the past week."
      timeoutMessage="Unable to load report. Check connection."
      onRetry={load}
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
                    {report.topEmotion ? (EMOTION_EMOJIS[report.topEmotion] || "\u2022") : "\uD83C\uDF00"}
                  </Text>
                  <Text style={s.heroPillLabel}>
                    {report.topEmotion || "Mixed"}
                  </Text>
                </View>
                <View style={s.heroPill}>
                  <Text style={s.heroPillEmoji}>{"\uD83C\uDFAF"}</Text>
                  <Text style={s.heroPillLabel}>
                    {report.topTrigger || (report.tiedTriggers?.length ? "Split" : "-")}
                  </Text>
                </View>
                <View style={[s.heroPill, s.confidencePill]}>
                  <Text style={s.heroPillLabel}>{CONFIDENCE_LABELS[confidence] || confidence}</Text>
                </View>
              </View>
            ) : null}
            {hasRuleInsight ? (
              <Text style={s.takeaway}>{report.aiInsight.summary}</Text>
            ) : null}
          </View>

          {error ? (
            <View style={s.stateCard}>
              <Text style={s.stateTitle}>Report unavailable</Text>
              <Text style={s.stateBody}>{error}</Text>
              <PrimaryButton label="Retry" onPress={load} />
            </View>
          ) : null}

          {report && !error && confidence === "too_early" ? (
            /* ---------- STARTER STATE (0-2 moments) ---------- */
            <View style={s.starterCard}>
              <Text style={s.starterEmoji}>{"\uD83C\uDF31"}</Text>
              <Text style={s.starterTitle}>A few more moments to go</Text>
              <Text style={s.starterBody}>
                Log at least 3 moments this week for patterns to start forming. The more days you cover, the sharper the picture.
              </Text>
              <PrimaryButton label="Log a moment" onPress={() => router.push("/(tabs)/log")} />
            </View>
          ) : null}

          {report && !error && confidence !== "too_early" ? (
            <>
              {/* --- 2. WHAT SHOWED UP --- */}
              <SectionHeader label="What showed up" extra={`${dq.uniqueEmotions || 0} emotions \u00B7 ${dq.uniqueTriggers || 0} triggers`} />

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
                  <SectionHeader label="What helped \u00B7 What drained" />
                  <View style={s.card}>
                    {report.regulators?.length ? (
                      <View style={s.pairingGroup}>
                        <Text style={s.pairingGroupLabel}>{"\uD83C\uDF3F"} Regulators</Text>
                        <View style={s.pairingList}>
                          {report.regulators.slice(0, 4).map((r) => (
                            <PairingChip key={`${r.trigger}-${r.emotion}`} trigger={r.trigger} emotion={r.emotion} count={r.count} positive />
                          ))}
                        </View>
                      </View>
                    ) : null}
                    {report.frictionZones?.length ? (
                      <View style={s.pairingGroup}>
                        <Text style={s.pairingGroupLabel}>{"\uD83D\uDD25"} Friction zones</Text>
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
                      <SectionHeader label="Trigger \u2192 Emotion" />
                      <View style={s.card}>
                        {Object.entries(report.correlations).slice(0, 5).map(([trigger, emotions]) => (
                          <View style={s.correlationRow} key={trigger}>
                            <Text style={s.correlationTrigger}>{trigger}</Text>
                            <View style={s.correlationChips}>
                              {Object.entries(emotions).sort(([, a], [, b]) => b - a).slice(0, 3).map(([emo, count]) => (
                                <View style={s.correlationChip} key={emo}>
                                  <Text style={s.correlationChipText}>
                                    {EMOTION_EMOJIS[emo] || ""} {emo} {"\u00D7"}{count}
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
                      <SectionHeader label="Energy flow" />
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
                      <SectionHeader label="Stability" />
                      <View style={s.metricsRow}>
                        {report.volatilityScore !== null ? (
                          <View style={s.metricCard}>
                            <Text style={s.metricLabel}>Volatility</Text>
                            <Text style={s.metricValue}>
                              {report.volatilityScore < 0.5 ? "\uD83D\uDFE2" : report.volatilityScore < 1.5 ? "\uD83D\uDFE1" : "\uD83D\uDD34"} {report.volatilityScore}
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
                      <SectionHeader label="Emotion trajectory" />
                      {report.trajectoryNote ? (
                        <Text style={s.trajectoryNote}>{report.trajectoryNote}</Text>
                      ) : null}
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.trajectoryScroll}>
                        {report.weeklyEmotionTrajectory.map((day) => (
                          <View style={s.trajectoryDay} key={day.date}>
                            <Text style={s.trajectoryEmoji}>{EMOTION_EMOJIS[day.dominantEmotion] || "\u2022"}</Text>
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
                  {report.aiInsight?.microExperiment ? (
                    <View style={s.experimentCard}>
                      <View style={s.aiLabelRow}>
                        <View style={[s.aiLabelPill, { backgroundColor: palette.successSoft || palette.glass }]}>
                          <Text style={[s.aiLabelText, { color: palette.success }]}>Try this week</Text>
                        </View>
                      </View>
                      <Text style={s.experimentText}>{report.aiInsight.microExperiment}</Text>
                    </View>
                  ) : null}
                </>
              )}

              {/* --- 6. PREMIUM PATTERN READ --- */}
              {isSignedIn && !isPremium && confidence !== "low" ? (
                <LockedSection
                  title="Pattern read"
                  teaser="A concise AI analysis grounded in your actual data, not generic advice."
                  ctaLabel="Unlock Premium"
                  onPress={handlePremium}
                >
                  <View style={[s.aiCard, { opacity: 0.5 }]}>
                    <Text style={[s.aiSummary, { color: palette.muted }]}>
                      Your patterns suggest a connection between how you spend your energy and how you feel afterward...
                    </Text>
                  </View>
                </LockedSection>
              ) : null}

              {isPremium ? (
                <View style={s.section}>
                  <SectionHeader label="Pattern read" />
                  {hasLlmInsight ? (
                    <View style={[s.aiCard, { borderColor: palette.purpleSoft }]}>
                      <View style={s.aiLabelRow}>
                        <View style={[s.aiLabelPill, { backgroundColor: palette.purpleSoft }]}>
                          <Text style={[s.aiLabelText, { color: palette.purple }]}>AI</Text>
                        </View>
                      </View>
                      <Text style={s.aiSummary}>{report.llmInsight.narrative}</Text>
                    </View>
                  ) : (
                    <View style={s.card}>
                      <Text style={s.aiSuggestion}>Your pattern read will appear here after enough data has accumulated.</Text>
                    </View>
                  )}
                </View>
              ) : null}

              {/* --- 7. DATA QUALITY NUDGE --- */}
              {confidence === "low" ? (
                <View style={s.nudgeCard}>
                  <Text style={s.nudgeTitle}>Patterns are forming</Text>
                  <Text style={s.nudgeBody}>
                    {`${dq.totalMoments} moments across ${dq.daysLogged} day${dq.daysLogged !== 1 ? "s" : ""}. A few more days will unlock trajectory and stability insights.`}
                  </Text>
                  <PrimaryButton label="Log a moment" onPress={() => router.push("/(tabs)/log")} />
                </View>
              ) : null}
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
  content: { gap: 16 },

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
  takeaway: { color: palette.text, fontSize: 15, lineHeight: 22, marginTop: 8 },

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
  aiSummary: { color: palette.text, fontSize: 15, lineHeight: 23, fontWeight: "600" },
  aiSuggestion: { color: palette.muted, fontSize: 14, lineHeight: 20 },

  /* Micro-experiment */
  experimentCard: {
    borderRadius: radius.md, padding: 18, gap: 10,
    backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  experimentText: { color: palette.text, fontSize: 14, lineHeight: 21 },

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
  sectionKicker: {
    color: palette.accent, fontSize: 11, fontWeight: "700",
    letterSpacing: 1.2, textTransform: "uppercase",
  },
  sectionExtra: { color: palette.muted, fontSize: 11 },
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
  correlationChips: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
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
  lockedContent: { opacity: 0.3, padding: 14, gap: 8 },
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
});
