import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useState } from "react";
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
import { InsightCard } from "@/components/InsightCard";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Tooltip } from "@/components/Tooltip";
import { useAppSession } from "@/hooks/useAppSession";
import { trackEvent } from "@/services/analyticsService";
import { palette, radius } from "@/utils/theme";

const screenWidth = Dimensions.get("window").width;

const EMOTION_EMOJIS = {
  angry: "🔥", anxious: "⚡", sad: "🌧", calm: "🍃", happy: "☀️",
  numb: "🌫", ashamed: "🫧", hopeful: "🌱", frustrated: "💢", grateful: "✨",
};

const TIME_ICONS = { morning: "🌅", afternoon: "☀️", evening: "🌆", night: "🌙" };

const ENERGY_COLORS = {
  steady: palette.success, balanced: palette.accent, tense: palette.warning,
  drained: palette.danger, uplifted: palette.purple,
};

function topEntries(record, limit = 5) {
  return Object.entries(record || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
}

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

/** Locked section with blur, lock icon, gradient overlay and CTA */
function LockedSection({ title, teaser, ctaLabel, onPress, children }) {
  return (
    <View style={s.lockedWrap}>
      <View style={s.lockedContent} pointerEvents="none">
        {children}
      </View>
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

export function WeeklyReportScreen() {
  const { loadWeeklyReport, subscription, user, token } = useAppSession();
  const router = useRouter();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isSignedIn = Boolean(user && token);
  const isPremium = subscription?.status === "active" || subscription?.status === "grace_period";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const nextReport = await loadWeeklyReport();
      setReport(nextReport);
    } catch {
      setReport(null);
      setError("Unable to load report. Check connection.");
    } finally {
      setLoading(false);
    }
  }, [loadWeeklyReport]);

  useFocusEffect(useCallback(() => {
    load();
    trackEvent("report_screen_viewed", { tier: isPremium ? "premium" : isSignedIn ? "signed" : "anonymous" });
  }, [load, isPremium, isSignedIn]));

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

  function handleSignInUnlock() {
    trackEvent("report_signin_unlock_tapped", {});
    router.push("/login");
  }

  function handlePremiumUnlock() {
    trackEvent("report_premium_unlock_tapped", {});
    router.push("/(tabs)/premium");
  }

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
          {/* ─── HEADER ─── */}
          <View style={s.header}>
            <Text style={s.kicker}>Weekly patterns</Text>
            <Text style={s.title}>Your Report</Text>
            {report?.totalMoments ? (
              <Text style={s.subtitle}>{report.totalMoments} moment{report.totalMoments !== 1 ? "s" : ""} this week</Text>
            ) : null}
          </View>

          <Tooltip id="report_tooltip" text="Insights appear after you've logged a few moments this week." />

          {error ? (
            <View style={s.stateCard}>
              <Text style={s.stateTitle}>Report unavailable</Text>
              <Text style={s.stateBody}>{error}</Text>
              <PrimaryButton label="Retry" onPress={load} />
            </View>
          ) : null}

          {report && !error ? (
            <>
              {/* ════════════════════════════════════════════════════
                  SECTION 1 — Weekly Patterns (visible to ALL users)
                  ════════════════════════════════════════════════════ */}
              <SectionHeader label="Weekly patterns" extra={`${report.totalMoments || 0} moments`} />

              {/* Key metrics — always visible */}
              <View style={s.metricsGrid}>
                <View style={s.metricCard}>
                  <Text style={s.metricLabel}>Top trigger</Text>
                  <Text style={s.metricValue}>{report.topTrigger || "—"}</Text>
                  {report.topPair?.count > 0 ? (
                    <Text style={s.metricHint}>→ {report.topPair.emotion} ({report.topPair.count}×)</Text>
                  ) : null}
                </View>
                <View style={s.metricCard}>
                  <Text style={s.metricLabel}>Top emotion</Text>
                  <Text style={s.metricValue}>
                    {EMOTION_EMOJIS[report.topEmotion] || ""} {report.topEmotion || "—"}
                  </Text>
                </View>
                <View style={s.metricCard}>
                  <Text style={s.metricLabel}>Volatility</Text>
                  <Text style={s.metricValue}>{report.volatilityChange || "—"}</Text>
                  <Text style={s.metricHint}>Score: {report.volatilityScore ?? "—"}</Text>
                </View>
                <View style={s.metricCard}>
                  <Text style={s.metricLabel}>Stable day</Text>
                  <Text style={s.metricValue}>{report.mostStableDay || "—"}</Text>
                </View>
              </View>

              {/* Trigger frequency — always visible */}
              {triggerEntries.length ? (
                <View style={s.section}>
                  <SectionHeader label="Trigger frequency" />
                  <View style={s.card}>
                    {triggerEntries.map(([key, value]) => (
                      <HBar key={key} label={key} value={value} max={triggerMax} color={palette.accent} />
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Emotion frequency — always visible */}
              {emotionEntries.length ? (
                <View style={s.section}>
                  <SectionHeader label="Emotion frequency" />
                  <View style={s.card}>
                    {emotionEntries.map(([key, value]) => (
                      <HBar key={key} label={key} value={value} max={emotionMax} color={palette.warning} icon={EMOTION_EMOJIS[key]} />
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Time of day — always visible */}
              {timeEntries.length ? (
                <View style={s.section}>
                  <SectionHeader label="Time of day" />
                  <View style={s.card}>
                    {timeEntries.map(([key, value]) => (
                      <HBar key={key} label={key} value={value} max={timeMax} color={palette.warning} icon={TIME_ICONS[key]} />
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Energy distribution — always visible */}
              {energyEntries.length ? (
                <View style={s.section}>
                  <SectionHeader label="Energy distribution" />
                  <View style={s.card}>
                    {energyEntries.map(([key, value]) => (
                      <HBar key={key} label={key} value={value} max={energyMax} color={ENERGY_COLORS[key] || palette.accent} />
                    ))}
                  </View>
                </View>
              ) : null}

              {/* Weekly emotion trajectory — always visible */}
              {report.weeklyEmotionTrajectory?.length > 1 ? (
                <View style={s.section}>
                  <SectionHeader label="Emotion trajectory" />
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

              {/* ════════════════════════════════════════════════════
                  SECTION 2 — Insight Summary (locked for anonymous)
                  ════════════════════════════════════════════════════ */}
              {!isSignedIn ? (
                <LockedSection
                  title="Your personal insights are waiting"
                  teaser="Create a free account to unlock pattern observations, emotional correlations, and weekly reflections."
                  ctaLabel="Sign in to unlock"
                  onPress={handleSignInUnlock}
                >
                  {/* Placeholder content behind the blur */}
                  <View style={s.card}>
                    <View style={s.aiLabelRow}>
                      <View style={s.aiLabelPill}><Text style={s.aiLabelText}>Pattern insight</Text></View>
                    </View>
                    <Text style={[s.aiSummary, { color: palette.muted }]}>
                      Your week was shaped by "{report.topTrigger || "..."}" triggers, feeling mostly {report.topEmotion || "..."}.
                    </Text>
                    <Text style={[s.aiSuggestion, { color: palette.muted }]}>
                      Deeper observations about trigger patterns and emotional trends are available when you sign in.
                    </Text>
                  </View>
                  {Object.keys(report.correlations || {}).length ? (
                    <View style={[s.card, { marginTop: 8 }]}>
                      {Object.entries(report.correlations).slice(0, 3).map(([trigger, emotions]) => (
                        <View style={s.correlationRow} key={trigger}>
                          <Text style={s.correlationTrigger}>{trigger}</Text>
                          <View style={s.correlationChips}>
                            {Object.entries(emotions).sort(([, a], [, b]) => b - a).slice(0, 2).map(([emo, count]) => (
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
                  ) : null}
                </LockedSection>
              ) : (
                <>
                  <SectionHeader label="Insight summary" />

                  {/* Rule-based insight — unlocked for signed-in */}
                  {hasRuleInsight ? (
                    <View style={s.aiCard}>
                      <View style={s.aiLabelRow}>
                        <View style={s.aiLabelPill}><Text style={s.aiLabelText}>Pattern insight</Text></View>
                      </View>
                      <Text style={s.aiSummary}>{report.aiInsight.summary}</Text>
                      {report.aiInsight.suggestion ? <Text style={s.aiSuggestion}>{report.aiInsight.suggestion}</Text> : null}
                    </View>
                  ) : (
                    <View style={s.card}>
                      <Text style={s.aiSuggestion}>Your weekly observations will appear here once a few more moments are logged.</Text>
                    </View>
                  )}

                  {/* Correlations — unlocked for signed-in */}
                  {Object.keys(report.correlations || {}).length ? (
                    <View style={s.section}>
                      <SectionHeader label="Trigger → Emotion" />
                      <View style={s.card}>
                        {Object.entries(report.correlations).slice(0, 5).map(([trigger, emotions]) => (
                          <View style={s.correlationRow} key={trigger}>
                            <Text style={s.correlationTrigger}>{trigger}</Text>
                            <View style={s.correlationChips}>
                              {Object.entries(emotions).sort(([, a], [, b]) => b - a).slice(0, 3).map(([emo, count]) => (
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

                  {/* Observations — unlocked for signed-in */}
                  {report.insights?.length ? (
                    <View style={s.section}>
                      <SectionHeader label="Observations" extra={`${report.insights.length} pattern${report.insights.length !== 1 ? "s" : ""}`} />
                      {report.insights.map((insight, idx) => (
                        <InsightCard key={idx} body={insight} tone={idx === 0 ? "accent" : "default"} title={`Observation ${idx + 1}`} />
                      ))}
                    </View>
                  ) : null}

                  <InsightCard
                    title="Weekly stability"
                    body={report.volatilityChange || "Not enough data yet."}
                    footer={`Score: ${report.volatilityScore ?? 0} · Most steady: ${report.mostStableDay || "—"}`}
                  />
                </>
              )}

              {/* ════════════════════════════════════════════════════
                  SECTION 3 — Personalised AI Reflection (premium only)
                  ════════════════════════════════════════════════════ */}
              {isSignedIn && !isPremium ? (
                <LockedSection
                  title="Personalised AI reflection"
                  teaser="A deeper narrative about your emotional patterns, written by AI and tailored to your journey."
                  ctaLabel="Unlock Premium"
                  onPress={handlePremiumUnlock}
                >
                  <View style={[s.aiCard, { opacity: 0.5 }]}>
                    <View style={s.aiLabelRow}>
                      <View style={[s.aiLabelPill, { backgroundColor: palette.purpleSoft }]}>
                        <Text style={[s.aiLabelText, { color: palette.purple }]}>AI reflection</Text>
                      </View>
                    </View>
                    <Text style={[s.aiSummary, { color: palette.muted }]}>
                      Your emotional patterns this week reveal a recurring theme connecting "{report.topTrigger || "..."}" to how you feel...
                    </Text>
                    <Text style={[s.aiSuggestion, { color: palette.muted }]}>
                      Premium members receive a personalised reflection that evolves as you log more moments.
                    </Text>
                  </View>
                </LockedSection>
              ) : null}

              {isPremium ? (
                <View style={s.section}>
                  <SectionHeader label="Personalised AI Reflection" />
                  {hasLlmInsight ? (
                    <View style={[s.aiCard, { borderColor: palette.purpleSoft }]}>
                      <View style={s.aiLabelRow}>
                        <View style={[s.aiLabelPill, { backgroundColor: palette.purpleSoft }]}>
                          <Text style={[s.aiLabelText, { color: palette.purple }]}>AI reflection</Text>
                        </View>
                      </View>
                      <Text style={s.aiSummary}>{report.llmInsight.narrative}</Text>
                    </View>
                  ) : (
                    <View style={s.card}>
                      <View style={s.aiLabelRow}>
                        <View style={[s.aiLabelPill, { backgroundColor: palette.purpleSoft }]}>
                          <Text style={[s.aiLabelText, { color: palette.purple }]}>AI reflection</Text>
                        </View>
                      </View>
                      <Text style={s.aiSuggestion}>Your personalised reflection will appear here once enough patterns have formed. Keep logging moments.</Text>
                    </View>
                  )}
                </View>
              ) : null}
            </>
          ) : null}

          {!report && !loading && !error ? (
            <View style={[s.stateCard, s.emptyStateCard]}>
              <Image source={require("@/assets/report-empty.png")} style={s.emptyIllustration} resizeMode="contain" accessible={false} />
              <Text style={s.stateTitle}>Your first report is on its way</Text>
              <Text style={s.stateBody}>Log a few moments this week and your patterns will appear here.</Text>
              <PrimaryButton label="Log a moment" onPress={() => router.push("/(tabs)/log")} />
            </View>
          ) : null}
        </View>
      </View>
    </ScreenShell>
  );
}

const s = StyleSheet.create({
  canvas: { position: "relative", minHeight: 1 },
  bgImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined, opacity: 0.05 },
  content: { gap: 16 },
  header: { gap: 4, marginTop: 12 },
  kicker: { color: palette.accent, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
  title: { color: palette.text, fontSize: 26, fontWeight: "700" },
  subtitle: { color: palette.muted, fontSize: 13, marginTop: 2 },

  /* ─ AI / insight card ─ */
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
  aiSummary: { color: palette.text, fontSize: 16, lineHeight: 24, fontWeight: "600" },
  aiSuggestion: { color: palette.muted, fontSize: 14, lineHeight: 20 },

  /* ─ Metrics grid ─ */
  metricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  metricCard: {
    width: (screenWidth - 64 - 8) / 2, borderRadius: radius.md, padding: 14, gap: 4,
    backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  metricLabel: {
    color: palette.muted, fontSize: 10, fontWeight: "700",
    letterSpacing: 0.8, textTransform: "uppercase",
  },
  metricValue: { color: palette.text, fontSize: 15, fontWeight: "700", textTransform: "capitalize" },
  metricHint: { color: palette.muted, fontSize: 11 },

  /* ─ Generic section / card ─ */
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

  /* ─ Horizontal bar ─ */
  hbarRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hbarLabel: { width: 80, color: palette.text, fontSize: 13, textTransform: "capitalize" },
  hbarTrack: {
    flex: 1, height: 8, borderRadius: radius.pill,
    backgroundColor: palette.glass,
    overflow: "hidden",
  },
  hbarFill: { height: "100%", borderRadius: radius.pill },
  hbarValue: { width: 26, color: palette.muted, fontSize: 12, textAlign: "right" },

  /* ─ Trajectory ─ */
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

  /* ─ Correlation ─ */
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

  /* ─ Locked section (blur + gradient overlay) ─ */
  lockedWrap: {
    position: "relative",
    borderRadius: radius.md,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.glassBorder,
    backgroundColor: palette.glass,
  },
  lockedContent: {
    opacity: 0.3,
    padding: 14,
    gap: 8,
  },
  lockedGradient: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 1,
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    zIndex: 2,
    paddingHorizontal: 28,
  },
  lockedIcon: {
    width: 44, height: 44, borderRadius: radius.sm,
    alignItems: "center", justifyContent: "center",
    backgroundColor: palette.accentSoft,
    borderWidth: 1, borderColor: palette.accentMedium,
  },
  lockedTitle: {
    color: palette.text, fontSize: 16, fontWeight: "700", textAlign: "center",
  },
  lockedTeaser: {
    color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 280,
  },
  lockedCta: {
    marginTop: 4, paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: radius.pill,
    backgroundColor: palette.accentStrong,
  },
  lockedCtaText: { color: palette.text, fontSize: 14, fontWeight: "700" },

  /* ─ State cards ─ */
  stateCard: {
    borderRadius: radius.md, padding: 20, gap: 10,
    backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  emptyStateCard: { alignItems: "center", paddingVertical: 32 },
  emptyIllustration: { width: 120, height: 120, marginBottom: 8, opacity: 0.9 },
  stateTitle: { color: palette.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  stateBody: { color: palette.muted, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 260 },
});