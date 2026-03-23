import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Easing,
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
import { tap, selection } from "@/utils/haptics";
import { TRIGGER_COLORS, EMOTION_COLORS as DS_EMOTION_COLORS, emotionStyle, triggerStyle, STAGGER_DELAY } from "@/utils/designSystem";
import { useEmotionalState } from "@/hooks/useEmotionalState";

/* ── Helpers ── */

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
      let body = cleanedText.slice(start, end).replace(/^\s*[:\-\u2013\u2014]?\s*/, "").trim();
      body = body.replace(/\s+$/, "");
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
  { icon: "🔍", label: "What stood out", color: palette.accent },
  { icon: "🧩", label: "What may be contributing", color: palette.purple },
  { icon: "💡", label: "One thing to try", color: palette.success },
];

const EMOTION_EMOJIS = { frustrated: "😤", anxious: "😰", neutral: "😐", calm: "😌", energized: "⚡" };
const EMOTION_COLORS = { calm: "#5ee6a0", neutral: "#9eb0c9", anxious: "#ffb347", frustrated: "#ff6b7a", energized: "#a78bfa" };
const TIME_ICONS = { morning: "🌅", afternoon: "☀️", evening: "🌆", night: "🌙" };
const TIME_COLORS = { morning: "#ffb347", afternoon: "#a78bfa", evening: "#56d0e0", night: "#9eb0c9" };
const ENERGY_COLORS = { steady: palette.success, balanced: palette.accent, tense: palette.warning, drained: palette.danger, uplifted: palette.purple };
const CONFIDENCE_LABELS = { too_early: "Just getting started", low: "Early patterns", emerging: "Taking shape", moderate: "Solid picture", strong: "High confidence" };

function topEntries(record, limit = 5) {
  return Object.entries(record || {}).sort(([, a], [, b]) => b - a).slice(0, limit);
}

function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : str; }

function scoreTone(score) {
  if (score >= 4.2) return { emoji: "🌟", label: "Great", color: "#a78bfa" };
  if (score >= 3.5) return { emoji: "😌", label: "Good", color: "#5ee6a0" };
  if (score >= 2.8) return { emoji: "😐", label: "Mixed", color: "#9eb0c9" };
  if (score >= 2)   return { emoji: "😟", label: "Uneasy", color: "#ffb347" };
  return { emoji: "😤", label: "Tough", color: "#ff6b7a" };
}

/* ── Shared sub-components ── */

function AnimatedSection({ children, index = 0, style }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(24)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, delay: index * STAGGER_DELAY, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, delay: index * STAGGER_DELAY, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim, index]);
  return (
    <Animated.View style={[style, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {children}
    </Animated.View>
  );
}

function HBar({ label, value, max, color = palette.accent, icon, highlight }) {
  const pct = max ? Math.round((value / max) * 100) : 0;
  const isTop = pct >= 80;
  return (
    <View style={[s.hbarRow, isTop && highlight && { backgroundColor: color + "08", borderRadius: 8, marginHorizontal: -4, paddingHorizontal: 4, paddingVertical: 2 }]}>
      <Text style={[s.hbarLabel, { color: highlight ? color : palette.text }]} numberOfLines={1}>
        {icon ? `${icon} ` : ""}{label}
      </Text>
      <View style={s.hbarTrack}>
        <View style={[s.hbarFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[s.hbarValue, isTop && { color, fontWeight: "700" }]}>{value}</Text>
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
      <LinearGradient colors={["transparent", "rgba(11,18,32,0.92)", "rgba(11,18,32,0.98)"]} locations={[0, 0.45, 1]} style={s.lockedGradient} />
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

function InsightCard({ icon, label, body, color, index }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(18)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, delay: index * 120, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, delay: index * 120, easing: Easing.out(Easing.ease), useNativeDriver: true }),
    ]).start();
  }, [fadeAnim, slideAnim, index]);
  return (
    <Animated.View style={[s.insightSectionCard, { borderLeftWidth: 3, borderLeftColor: color, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={s.insightSectionHeader}>
        <Text style={s.insightSectionIcon}>{icon}</Text>
        <Text style={[s.insightSectionLabel, { color }]}>{label}</Text>
      </View>
      <Text style={s.insightSectionBody}>{body}</Text>
    </Animated.View>
  );
}

function NarrativeCard({ icon, title, items, positive }) {
  return (
    <AnimatedSection index={positive ? 1 : 0} style={[s.narrativeCard, { borderLeftWidth: 3, borderLeftColor: positive ? palette.success : palette.danger }]}>
      <Text style={s.narrativeIcon}>{icon}</Text>
      <View style={s.narrativeContent}>
        <Text style={s.narrativeTitle}>{title}</Text>
        {items.map((item, i) => (
          <Text key={i} style={s.narrativeText}>
            {item.trigger ? (
              <>
                <Text style={{ color: TRIGGER_COLORS[item.trigger] || palette.accent, fontWeight: "600" }}>{capitalize(item.trigger)}</Text>
                {positive ? " brings you " : " tends to leave you "}
                <Text style={{ color: EMOTION_COLORS[item.emotion] || palette.textSecondary, fontWeight: "600" }}>{item.emotion}</Text>
                {item.count ? ` (${item.count}×)` : ""}
              </>
            ) : item.text}
          </Text>
        ))}
      </View>
    </AnimatedSection>
  );
}

/* ── Tab pill selector ── */

const TABS = [
  { key: "summary", label: "Your Week", icon: "✨" },
  { key: "patterns", label: "Patterns", icon: "🔗" },
  { key: "analytics", label: "Analytics", icon: "📊" },
];

function TabBar({ activeTab, onTabChange }) {
  return (
    <View style={s.tabBar}>
      {TABS.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            style={[s.tab, active && s.tabActive]}
            onPress={() => { tap(); onTabChange(tab.key); }}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[s.tabText, active && s.tabTextActive]}>
              {tab.icon} {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Tab 1: Your Week (Summary) ── */

function SummaryTab({ report, dq, confidence, isSignedIn, isPremium, hasLlmInsight, hasLlmTeaser, handleSignIn, handleUpgrade, purchasing, router }) {
  const hasRuleInsight = !!report?.aiInsight?.summary;
  const bm = report?.baselineMetrics;

  return (
    <View style={s.tabContent}>
      {/* State of mind hero */}
      {bm?.stateOfMind ? (
        <AnimatedSection index={0} style={s.stateOfMindCard}>
          <Text style={s.stateOfMindLabel}>HOW YOU'RE DOING</Text>
          <Text style={s.stateOfMindText}>{capitalize(bm.stateOfMind)}</Text>
          {bm?.baseline?.reliable && bm?.drift ? (
            <Text style={s.stateOfMindSub}>
              {bm.drift.direction === "stable"
                ? "Tracking close to your personal baseline."
                : bm.drift.direction === "improving"
                  ? "Trending a bit better than your usual."
                  : "A bit below your usual — temporary dips are normal."}
            </Text>
          ) : null}
        </AnimatedSection>
      ) : null}

      {/* Human-readable summary */}
      {hasRuleInsight ? (
        <AnimatedSection index={1} style={s.summaryCard}>
          <Text style={s.summaryText}>{cleanText(report.aiInsight.summary)}</Text>
        </AnimatedSection>
      ) : null}

      {/* What's working well */}
      {report.aiInsight?.whatWorking?.length > 0 ? (
        <NarrativeCard icon="🌿" title="What's working" items={report.aiInsight.whatWorking} positive />
      ) : report.regulators?.length > 0 ? (
        <NarrativeCard icon="🌿" title="What's working" items={report.regulators.slice(0, 3).map(r => ({ trigger: r.trigger, emotion: r.emotion, count: r.count }))} positive />
      ) : null}

      {/* Where to focus */}
      {report.aiInsight?.whereToFocus?.length > 0 ? (
        <NarrativeCard icon="🔥" title="Worth noticing" items={report.aiInsight.whereToFocus} positive={false} />
      ) : report.frictionZones?.length > 0 ? (
        <NarrativeCard icon="🔥" title="Worth noticing" items={report.frictionZones.slice(0, 3).map(f => ({ trigger: f.trigger, emotion: f.emotion, count: f.count }))} positive={false} />
      ) : null}

      {/* Try this week */}
      {report.aiInsight?.microExperiment ? (
        <AnimatedSection index={3} style={s.experimentCard}>
          <View style={s.aiLabelRow}>
            <View style={[s.aiLabelPill, { backgroundColor: palette.successSoft || palette.glass }]}>
              <Text style={[s.aiLabelText, { color: palette.success }]}>Try this week</Text>
            </View>
          </View>
          <Text style={s.experimentText}>{cleanText(report.aiInsight.microExperiment)}</Text>
        </AnimatedSection>
      ) : null}

      {/* LLM Insight section */}
      {renderLlmInsightSection({ report, isSignedIn, isPremium, hasLlmInsight, hasLlmTeaser, handleSignIn, handleUpgrade, purchasing, router })}
    </View>
  );
}

function renderLlmInsightSection({ report, isSignedIn, isPremium, hasLlmInsight, hasLlmTeaser, handleSignIn, handleUpgrade, purchasing, router }) {
  /* Anonymous */
  if (!isSignedIn) {
    return (
      <View style={s.section}>
        <SectionHeader label="Deeper insights" badge="weekly" />
        <View style={s.insightStateCard}>
          <Text style={s.insightStateIcon}>🔒</Text>
          <Text style={s.insightStateTitle}>Unlock personalised insights</Text>
          <Text style={s.insightStateBody}>Sign in for free to get pattern analysis tailored to your data. The more you log, the better it gets.</Text>
          <PrimaryButton label="Sign in to unlock" onPress={handleSignIn} />
        </View>
      </View>
    );
  }

  /* Premium + full insight */
  if (isPremium && hasLlmInsight) {
    const sections = parseLlmSections(report.llmInsight.narrative);
    const generatedAt = report.llmInsight.generatedAt;
    const daysAgo = generatedAt ? Math.max(0, Math.floor((Date.now() - new Date(generatedAt).getTime()) / 86400000)) : null;
    return (
      <View style={s.section}>
        <SectionHeader label="Your personalised insight" badge="weekly" />
        {sections ? (
          <View style={s.insightCardsRow}>
            {INSIGHT_SECTION_META.map((meta, i) => (
              sections[i] ? <InsightCard key={meta.label} icon={meta.icon} label={meta.label} body={sections[i]} color={meta.color} index={i} /> : null
            ))}
          </View>
        ) : (
          <InsightCard icon="🔍" label="Insight" body={cleanText(report.llmInsight.narrative)} color={palette.accent} index={0} />
        )}
        {daysAgo !== null ? (
          <Text style={s.insightFooter}>Updated {daysAgo === 0 ? "today" : daysAgo === 1 ? "yesterday" : `${daysAgo} days ago`}</Text>
        ) : null}
      </View>
    );
  }

  /* Premium, no insight yet */
  if (isPremium && !hasLlmInsight) {
    return (
      <View style={s.section}>
        <SectionHeader label="Your personalised insight" badge="weekly" />
        <View style={s.insightStateCard}>
          <Text style={s.insightStateIcon}>✨</Text>
          <Text style={s.insightStateTitle}>Your insight is on its way</Text>
          <Text style={s.insightStateBody}>Analysing your patterns — this usually takes under a minute. Insights sharpen the more you log.</Text>
        </View>
      </View>
    );
  }

  /* Free + first-free or free pass: show all 3 cards */
  if (hasLlmInsight && (report.llmInsight.firstFree || report.llmInsight.freePass)) {
    const fullSections = parseLlmSections(report.llmInsight.narrative);
    return (
      <View style={s.section}>
        <SectionHeader label="Your personalised insight" badge="weekly" />
        <View style={s.aiLabelRow}>
          <View style={[s.aiLabelPill, { backgroundColor: palette.successSoft, marginLeft: 0 }]}>
            <Text style={[s.aiLabelText, { color: palette.success }]}>Free preview</Text>
          </View>
        </View>
        {fullSections ? (
          <View style={s.insightCardsRow}>
            {INSIGHT_SECTION_META.map((meta, i) => (
              fullSections[i] ? <InsightCard key={meta.label} icon={meta.icon} label={meta.label} body={fullSections[i]} color={meta.color} index={i} /> : null
            ))}
          </View>
        ) : (
          <InsightCard icon="🔍" label="Insight" body={cleanText(report.llmInsight.narrative)} color={palette.accent} index={0} />
        )}
        <Text style={s.firstFreeHint}>Future personalised insights require Premium.</Text>
      </View>
    );
  }

  /* Free + teaser */
  if (hasLlmTeaser) {
    const narrativeSource = report.llmTeaser?.narrative;
    const sections = parseLlmSections(narrativeSource);
    const teaserText = sections?.[0] || cleanText(narrativeSource).split(/\n\s*\n/)[0] || "";
    return (
      <View style={s.section}>
        <SectionHeader label="Personalised insight" badge="weekly" />
        <View style={s.teaserCard}>
          <Text style={s.teaserTitle}>{teaserText ? "Your pattern insight is ready" : "A deeper pattern is emerging…"}</Text>
          {teaserText ? <Text style={s.teaserBody} numberOfLines={3}>{teaserText}</Text> : null}
          <LinearGradient colors={["transparent", palette.glass]} locations={[0, 1]} style={s.teaserFade} />
        </View>
        <Pressable style={s.teaserCtaButton} onPress={handleUpgrade} disabled={purchasing} accessibilityRole="button">
          <Text style={s.teaserCtaButtonText}>{purchasing ? "Please wait…" : "See the full picture"}</Text>
        </Pressable>
        <Text style={s.teaserSubtext}>Unlock full personalised insights</Text>
      </View>
    );
  }

  /* Signed-in free, enough data */
  if (report.totalMoments >= 5) {
    return (
      <View style={s.section}>
        <SectionHeader label="Personalised insight" badge="weekly" />
        <View style={s.insightStateCard}>
          <Text style={s.insightStateIcon}>🔓</Text>
          <Text style={s.insightStateTitle}>Your insight is ready to unlock</Text>
          <Text style={s.insightStateBody}>You have enough data for a personalised deep-dive. Upgrade to see what your moments are really saying.</Text>
          <Pressable style={s.teaserCtaButton} onPress={handleUpgrade} disabled={purchasing} accessibilityRole="button">
            <Text style={s.teaserCtaButtonText}>{purchasing ? "Please wait…" : "Upgrade to Premium"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  /* Signed-in free, not enough data */
  const remaining = Math.max(0, 5 - (report.totalMoments || 0));
  return (
    <View style={s.section}>
      <SectionHeader label="Deeper insights" badge="weekly" />
      <View style={s.insightStateCard}>
        <Text style={s.insightStateIcon}>📊</Text>
        <Text style={s.insightStateTitle}>Building your insight</Text>
        <Text style={s.insightStateBody}>
          {remaining > 0 ? `Log ${remaining} more moment${remaining !== 1 ? "s" : ""} to unlock your first personalised insight. Every log makes it sharper.` : "Your personalised insight is being prepared. Check back soon."}
        </Text>
      </View>
    </View>
  );
}

/* ── Tab 2: Patterns ── */

function PatternsTab({ report, dq, isSignedIn, handleSignIn }) {
  const bm = report?.baselineMetrics;

  return (
    <View style={s.tabContent}>
      {/* Baseline & drift */}
      {bm?.baseline?.reliable ? (
        <AnimatedSection index={0} style={s.section}>
          <SectionHeader label="Your baseline" badge="weekly" />
          <View style={s.card}>
            <View style={s.baselineRow}>
              <View style={s.baselineStat}>
                <Text style={s.baselineLabel}>Emotional baseline</Text>
                <Text style={[s.baselineValue, { color: bm.baseline.score >= 3.5 ? palette.success : bm.baseline.score >= 2.5 ? palette.warning : palette.danger }]}>
                  {bm.baseline.score.toFixed(1)}/5
                </Text>
                <Text style={s.baselineHint}>{capitalize(bm.baseline.label)}</Text>
              </View>
              {bm.recentAverage !== null ? (
                <View style={s.baselineStat}>
                  <Text style={s.baselineLabel}>This week</Text>
                  <Text style={[s.baselineValue, { color: bm.recentAverage >= 3.5 ? palette.success : bm.recentAverage >= 2.5 ? palette.warning : palette.danger }]}>
                    {bm.recentAverage.toFixed(1)}/5
                  </Text>
                  {bm.drift ? <Text style={s.baselineHint}>{capitalize(bm.drift.label)}</Text> : null}
                </View>
              ) : null}
            </View>
            {bm.stability ? (
              <View style={s.baselineMeta}>
                <Text style={s.baselineMetaText}>Stability: <Text style={{ fontWeight: "700", color: bm.stability.score >= 0.6 ? palette.success : palette.warning }}>{bm.stability.label}</Text></Text>
                {bm.recoveryLatency ? <Text style={s.baselineMetaText}>Recovery: {bm.recoveryLatency.label}</Text> : null}
              </View>
            ) : null}
            <Text style={s.baselineExplainer}>
              Your baseline is learned from {bm.baseline.daysUsed} days of logging. The more you log, the more accurate it becomes at detecting when something shifts.
            </Text>
          </View>
        </AnimatedSection>
      ) : (
        <AnimatedSection index={0} style={s.section}>
          <SectionHeader label="Your baseline" badge="weekly" />
          <View style={s.card}>
            <Text style={s.baselineExplainer}>
              We're still learning your personal emotional baseline. Keep logging — after about 5 days, we'll be able to show you how your current week compares to your normal and detect when things start to shift.
            </Text>
          </View>
        </AnimatedSection>
      )}

      {/* Drift timeline */}
      {bm?.dailyDrift?.length >= 2 ? (
        <AnimatedSection index={1} style={s.section}>
          <SectionHeader label="Drift from baseline" badge="live" />
          <View style={s.card}>
            <Text style={s.trajectoryHint}>How your daily emotional tone compared to your personal baseline. Above zero = better than usual, below = tougher.</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.trajectoryScroll}>
              {bm.dailyDrift.map((day) => {
                const color = day.deviation >= 0.2 ? palette.success : day.deviation <= -0.2 ? palette.danger : palette.muted;
                return (
                  <View style={[s.driftDay, { borderColor: color + "40" }]} key={day.date}>
                    <Text style={[s.driftBar, { color }]}>{day.deviation > 0 ? "+" : ""}{day.deviation.toFixed(1)}</Text>
                    <Text style={s.trajectoryDate}>{new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </AnimatedSection>
      ) : null}

      {/* Emotional loops */}
      {(report.regulators?.length > 0 || report.frictionZones?.length > 0) ? (
        <>
          <SectionHeader label="Emotional loops" badge="live" />
          {report.frictionZones?.length ? (
            <NarrativeCard icon="🔥" title="Friction zones" items={report.frictionZones.slice(0, 3).map((f) => ({ trigger: f.trigger, emotion: f.emotion, count: f.count }))} positive={false} />
          ) : null}
          {report.regulators?.length ? (
            <NarrativeCard icon="🌿" title="What helps" items={report.regulators.slice(0, 3).map((r) => ({ trigger: r.trigger, emotion: r.emotion, count: r.count }))} positive />
          ) : null}
        </>
      ) : null}

      {/* Correlations */}
      {!isSignedIn ? (
        <LockedSection title="Patterns and pairings" teaser="Create a free account to see emotional correlations and trajectory." ctaLabel="Sign in to unlock" onPress={handleSignIn}>
          <View style={s.card}><Text style={[s.aiSummary, { color: palette.muted }]}>Deeper correlations appear here once you sign in.</Text></View>
        </LockedSection>
      ) : (
        <>
          {dq.hasEnoughForPairings && Object.keys(report.correlations || {}).length ? (
            <AnimatedSection index={2} style={s.section}>
              <SectionHeader label="Trigger → Emotion" badge="live" />
              <View style={s.card}>
                {Object.entries(report.correlations).slice(0, 5).map(([trigger, emotions]) => {
                  const tColor = TRIGGER_COLORS[trigger] || palette.accent;
                  return (
                    <View style={s.correlationRow} key={trigger}>
                      <Text style={[s.correlationTrigger, { color: tColor }]}>{trigger}</Text>
                      <View style={s.correlationChips}>
                        {Object.entries(emotions).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a).slice(0, 3).map(([emo, count]) => {
                          const emoColor = EMOTION_COLORS[emo] || palette.text;
                          return (
                            <View style={[s.correlationChip, { backgroundColor: emoColor + "15", borderColor: emoColor + "40" }]} key={emo}>
                              <Text style={[s.correlationChipText, { color: emoColor }]}>{EMOTION_EMOJIS[emo] || ""} {emo} ×{count}</Text>
                            </View>
                          );
                        })}
                      </View>
                    </View>
                  );
                })}
              </View>
            </AnimatedSection>
          ) : null}

          {/* Stability */}
          {dq.hasEnoughForStability ? (
            <AnimatedSection index={3} style={s.section}>
              <SectionHeader label="Stability" badge="weekly" />
              <View style={s.metricsRow}>
                {report.volatilityScore !== null ? (
                  <View style={s.metricCard}>
                    <Text style={s.metricLabel}>Day-to-day shifts</Text>
                    <Text style={[s.metricValue, { color: report.volatilityScore < 0.8 ? "#5ee6a0" : report.volatilityScore < 1.5 ? "#ffb347" : "#ff6b7a" }]}>
                      {report.volatilityLabel || "Steady"}
                    </Text>
                    <Text style={s.metricHint}>
                      {report.volatilityScore < 0.8 ? "Emotions stayed fairly consistent." : report.volatilityScore < 1.5 ? "Some emotional range within your days." : "Wide swings between emotions."}
                    </Text>
                  </View>
                ) : null}
                {report.mostStableDay ? (
                  <View style={s.metricCard}>
                    <Text style={s.metricLabel}>Steadiest day</Text>
                    <Text style={s.metricValue}>{new Date(report.mostStableDay).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}</Text>
                  </View>
                ) : null}
              </View>
            </AnimatedSection>
          ) : null}

          {/* Trajectory */}
          {report.weeklyEmotionTrajectory?.length >= 1 ? (
            <AnimatedSection index={4} style={s.section}>
              <SectionHeader label="Emotional tone" badge="live" />
              <View style={s.card}>
                <Text style={s.trajectoryHint}>
                  {report.weeklyEmotionTrajectory.length === 1 ? "Your tone from logged days. More days = richer picture." : "How your average tone shifted day by day."}
                </Text>
                {report.trajectoryNote ? <Text style={s.trajectoryNote}>{cleanText(report.trajectoryNote)}</Text> : null}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.trajectoryScroll}>
                  {report.weeklyEmotionTrajectory.map((day) => {
                    const tone = scoreTone(day.score);
                    return (
                      <Pressable style={[s.trajectoryDay, { borderColor: tone.color + "30" }]} key={day.date} onPress={() => selection()}>
                        <Text style={s.trajectoryEmoji}>{tone.emoji}</Text>
                        <Text style={[s.trajectoryLabel, { color: tone.color }]}>{tone.label}</Text>
                        <Text style={s.trajectoryDate}>{new Date(day.date).toLocaleDateString("en-IN", { weekday: "short" })}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </View>
            </AnimatedSection>
          ) : null}
        </>
      )}
    </View>
  );
}

/* ── Tab 3: Analytics ── */

function AnalyticsTab({ report, dq, isSignedIn, handleSignIn }) {
  const triggerEntries = topEntries(report?.triggerFrequency, 9);
  const emotionEntries = topEntries(report?.emotionFrequency, 5);
  const triggerMax = triggerEntries[0]?.[1] || 1;
  const emotionMax = emotionEntries[0]?.[1] || 1;
  const energyEntries = Object.entries(report?.energyDistribution || {}).filter(([, v]) => v > 0).sort(([, a], [, b]) => b - a);
  const energyMax = energyEntries[0]?.[1] || 1;
  const timeEntries = Object.entries(report?.timeOfDayPatterns || {}).filter(([, v]) => v > 0);
  const timeMax = Math.max(...timeEntries.map(([, v]) => v), 1);
  const bm = report?.baselineMetrics;

  return (
    <View style={s.tabContent}>
      {/* Emotions breakdown */}
      {emotionEntries.length ? (
        <AnimatedSection index={0} style={s.section}>
          <SectionHeader label="Emotions" badge="live" extra={`${dq.uniqueEmotions || 0} recorded`} />
          <View style={s.card}>
            {emotionEntries.map(([key, value]) => (
              <HBar key={key} label={key} value={value} max={emotionMax} color={EMOTION_COLORS[key] || palette.warning} icon={EMOTION_EMOJIS[key]} highlight />
            ))}
          </View>
        </AnimatedSection>
      ) : null}

      {/* Triggers breakdown */}
      {triggerEntries.length ? (
        <AnimatedSection index={1} style={s.section}>
          <SectionHeader label="Triggers" badge="live" extra={`${dq.uniqueTriggers || 0} areas`} />
          <View style={s.card}>
            {triggerEntries.map(([key, value]) => (
              <HBar key={key} label={key} value={value} max={triggerMax} color={TRIGGER_COLORS[key] || palette.accent} highlight />
            ))}
          </View>
        </AnimatedSection>
      ) : null}

      {/* Time of day */}
      {dq.hasEnoughForRhythm && timeEntries.length ? (
        <AnimatedSection index={2} style={s.section}>
          <SectionHeader label="When you logged" badge="live" />
          <View style={s.card}>
            {timeEntries.map(([key, value]) => (
              <HBar key={key} label={key} value={value} max={timeMax} color={TIME_COLORS[key] || palette.warning} icon={TIME_ICONS[key]} />
            ))}
          </View>
        </AnimatedSection>
      ) : null}

      {/* Energy flow */}
      {isSignedIn && energyEntries.length ? (
        <AnimatedSection index={3} style={s.section}>
          <SectionHeader label="Energy flow" badge="live" />
          <View style={s.card}>
            {energyEntries.map(([key, value]) => (
              <HBar key={key} label={key} value={value} max={energyMax} color={ENERGY_COLORS[key] || palette.accent} />
            ))}
          </View>
        </AnimatedSection>
      ) : null}

      {/* Gut check */}
      {report.predictionAccuracy ? (
        <AnimatedSection index={4} style={s.section}>
          <SectionHeader label="Gut check" badge="live" />
          <View style={s.card}>
            <View style={s.gutCheckRow}>
              <Text style={s.gutCheckEmoji}>{report.predictionAccuracy.rate >= 0.5 ? "🎯" : "🔮"}</Text>
              <View style={s.gutCheckContent}>
                <Text style={s.gutCheckTitle}>{report.predictionAccuracy.correct} of {report.predictionAccuracy.daysCompared} days</Text>
                <Text style={s.gutCheckBody}>
                  {report.predictionAccuracy.rate >= 0.8 ? "You read yourself almost perfectly. Your gut is dialled in."
                    : report.predictionAccuracy.rate >= 0.6 ? "Strong self-awareness. Your morning read mostly matched the day."
                    : report.predictionAccuracy.rate >= 0.4 ? "Hit-and-miss — your days had more turns than expected."
                    : report.predictionAccuracy.correct === 0 ? "None of your predictions landed. Your days unfolded in unexpected ways."
                    : "Mostly off the mark, but surprises teach you something."}
                </Text>
              </View>
            </View>
          </View>
        </AnimatedSection>
      ) : null}

      {/* Baseline advanced */}
      {bm?.baseline?.reliable ? (
        <AnimatedSection index={5} style={s.section}>
          <SectionHeader label="Baseline details" badge="weekly" />
          <View style={s.card}>
            <View style={s.analyticsGrid}>
              <View style={s.analyticsStat}>
                <Text style={s.analyticsStatLabel}>Baseline score</Text>
                <Text style={s.analyticsStatValue}>{bm.baseline.score.toFixed(2)}/5</Text>
              </View>
              {bm.recentAverage != null ? (
                <View style={s.analyticsStat}>
                  <Text style={s.analyticsStatLabel}>7-day average</Text>
                  <Text style={s.analyticsStatValue}>{bm.recentAverage.toFixed(2)}/5</Text>
                </View>
              ) : null}
              {bm.drift ? (
                <View style={s.analyticsStat}>
                  <Text style={s.analyticsStatLabel}>Drift</Text>
                  <Text style={[s.analyticsStatValue, { color: bm.drift.value >= 0 ? palette.success : palette.danger }]}>
                    {bm.drift.value > 0 ? "+" : ""}{bm.drift.value.toFixed(2)}
                  </Text>
                </View>
              ) : null}
              {bm.stability ? (
                <View style={s.analyticsStat}>
                  <Text style={s.analyticsStatLabel}>Stability</Text>
                  <Text style={s.analyticsStatValue}>{Math.round(bm.stability.score * 100)}%</Text>
                </View>
              ) : null}
              {bm.recoveryLatency ? (
                <View style={s.analyticsStat}>
                  <Text style={s.analyticsStatLabel}>Recovery</Text>
                  <Text style={s.analyticsStatValue}>~{bm.recoveryLatency.days}d</Text>
                </View>
              ) : null}
              <View style={s.analyticsStat}>
                <Text style={s.analyticsStatLabel}>Days used</Text>
                <Text style={s.analyticsStatValue}>{bm.baseline.daysUsed}</Text>
              </View>
            </View>
          </View>
        </AnimatedSection>
      ) : null}

      {!isSignedIn ? (
        <View style={{ marginTop: 12 }}>
          <PrimaryButton label="Sign in for deeper analytics" onPress={handleSignIn} />
        </View>
      ) : null}
    </View>
  );
}

/* ── Main screen ── */

export function WeeklyReportScreen() {
  const { loadWeeklyReport, refreshSession, subscription, user, token, subscribe } = useAppSession();
  const router = useRouter();
  const { dominantEmotion } = useEmotionalState();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [activeTab, setActiveTab] = useState("summary");

  const isSignedIn = Boolean(user && token);
  const isPremium = subscription?.status === "active" || subscription?.status === "grace_period";

  const callbacksRef = useRef({});
  callbacksRef.current = { loadWeeklyReport, refreshSession, token, isPremium, isSignedIn };
  const reportRef = useRef(null);
  reportRef.current = report;

  const load = useCallback(async (isRetry = false) => {
    if (isRetry && reportRef.current) { setError(""); } else { setLoading(true); setError(""); }
    try {
      const nextReport = await callbacksRef.current.loadWeeklyReport();
      setReport(nextReport);
    } catch {
      if (!reportRef.current) setReport(null);
      setError("Unable to load report. Check connection.");
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const { token: t, refreshSession: rs, isPremium: p, isSignedIn: si } = callbacksRef.current;
    if (t) rs().catch(() => null);
    trackEvent("report_screen_viewed", { tier: p ? "premium" : si ? "signed" : "anonymous" });
  }, [load]));

  const dq = report?.dataQuality || {};
  const confidence = dq.confidence || "too_early";
  const hasLlmInsight = !!report?.llmInsight?.narrative;
  const hasLlmTeaser = !!report?.llmTeaser?.narrative;

  function handleSignIn() { tap(); trackEvent("report_signin_unlock_tapped", {}); router.push("/login"); }
  async function handleUpgrade() {
    tap();
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
    } finally { setPurchasing(false); }
  }

  return (
    <ScreenShell
      loading={loading}
      loadingTitle="Building your report"
      loadingMessage="Summarizing patterns from the past week."
      timeoutMessage="Unable to load report. Check connection."
      onRetry={() => load(true)}
      scroll
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={s.canvas}>
        <Image source={require("@/assets/report-bg.png")} style={s.bgImage} resizeMode="cover" accessible={false} />

        <View style={s.content}>

          {/* Hero header */}
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
                  <Text style={s.heroPillEmoji}>{report.topEmotion ? (EMOTION_EMOJIS[report.topEmotion] || "•") : "🌀"}</Text>
                  <Text style={[s.heroPillLabel, report.topEmotion && { color: EMOTION_COLORS[report.topEmotion] }]}>
                    {report.topEmotion || "Mixed"}
                  </Text>
                </View>
                <View style={s.heroPill}>
                  <Text style={s.heroPillEmoji}>🎯</Text>
                  <Text style={[s.heroPillLabel, report.topTrigger && { color: TRIGGER_COLORS[report.topTrigger] || palette.accent }]}>
                    {report.topTrigger || (report.tiedTriggers?.length > 1 ? `${report.tiedTriggers.length} areas` : "-")}
                  </Text>
                </View>
                <View style={[s.heroPill, s.confidencePill]}>
                  <Text style={s.heroPillLabel}>{CONFIDENCE_LABELS[confidence] || confidence}</Text>
                </View>
              </View>
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
            <View style={s.starterCard}>
              <Text style={s.starterEmoji}>🌱</Text>
              <Text style={s.starterTitle}>{isSignedIn ? "A few more moments to go" : "Start tracking to see patterns"}</Text>
              <Text style={s.starterBody}>
                {isSignedIn
                  ? "Log at least 3 moments this week for your patterns to take shape. With 5+, you unlock personalised insights that get sharper the more you log."
                  : "Log at least 3 moments to see your first patterns. Sign in and log 5+ to unlock personalised insights."}
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
              {/* Tab bar */}
              <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

              {/* Tab content */}
              {activeTab === "summary" ? (
                <SummaryTab
                  report={report} dq={dq} confidence={confidence}
                  isSignedIn={isSignedIn} isPremium={isPremium}
                  hasLlmInsight={hasLlmInsight} hasLlmTeaser={hasLlmTeaser}
                  handleSignIn={handleSignIn} handleUpgrade={handleUpgrade}
                  purchasing={purchasing} router={router}
                />
              ) : activeTab === "patterns" ? (
                <PatternsTab report={report} dq={dq} isSignedIn={isSignedIn} handleSignIn={handleSignIn} />
              ) : (
                <AnalyticsTab report={report} dq={dq} isSignedIn={isSignedIn} handleSignIn={handleSignIn} />
              )}
            </>
          ) : null}

          {!report && !loading && !error ? (
            <View style={[s.stateCard, s.emptyStateCard]}>
              <Image source={require("@/assets/report-empty.png")} style={s.emptyIllustration} resizeMode="contain" accessible={false} />
              <Text style={s.stateTitle}>Your first insight is on its way</Text>
              <Text style={s.stateBody}>Log at least 3 moments this week to see your patterns. With 5+, you get personalised insights.</Text>
              <PrimaryButton label="Log a moment" onPress={() => router.push("/(tabs)/log")} />
            </View>
          ) : null}
        </View>
      </View>
    </ScreenShell>
  );
}

/* ── Styles ── */

const s = StyleSheet.create({
  canvas: { position: "relative", minHeight: 1 },
  bgImage: { ...StyleSheet.absoluteFillObject, width: undefined, height: undefined, opacity: 0.05 },
  content: { gap: 14 },

  /* Header / hero */
  header: { gap: 6, marginTop: 10 },
  kicker: { color: palette.accent, fontSize: 11, fontWeight: "700", letterSpacing: 1.4, textTransform: "uppercase" },
  title: { color: palette.text, fontSize: 26, fontWeight: "700" },
  subtitle: { color: palette.textSecondary, fontSize: 13, marginTop: 2 },
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

  /* Tab bar */
  tabBar: {
    flexDirection: "row", gap: 6, marginTop: 8, marginBottom: 4,
  },
  tab: {
    flex: 1, alignItems: "center", paddingVertical: 10,
    borderRadius: radius.sm, backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  tabActive: {
    backgroundColor: palette.accentSoft, borderColor: palette.accentMedium,
  },
  tabText: { color: palette.muted, fontSize: 12, fontWeight: "600" },
  tabTextActive: { color: palette.accent },
  tabContent: { gap: 14 },

  /* State of mind hero card */
  stateOfMindCard: {
    borderRadius: radius.md, padding: 18, gap: 6,
    backgroundColor: palette.card,
    borderWidth: 1, borderColor: palette.accentMedium,
    borderLeftWidth: 3, borderLeftColor: palette.accent,
  },
  stateOfMindLabel: {
    color: palette.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.4,
  },
  stateOfMindText: { color: palette.text, fontSize: 18, fontWeight: "700" },
  stateOfMindSub: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },

  /* Summary card */
  summaryCard: {
    borderRadius: radius.md, padding: 16, gap: 4,
    backgroundColor: palette.card,
    borderWidth: 1, borderColor: palette.glassBorder,
    borderLeftWidth: 3, borderLeftColor: palette.accent,
  },
  summaryText: { color: palette.text, fontSize: 14, lineHeight: 21 },

  /* AI / insight */
  aiLabelRow: { flexDirection: "row" },
  aiLabelPill: {
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill,
    backgroundColor: palette.accentSoft,
  },
  aiLabelText: {
    color: palette.accent, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6,
  },
  aiSummary: { color: palette.text, fontSize: 14, lineHeight: 22 },
  firstFreeHint: { color: palette.textSecondary, fontSize: 12, lineHeight: 17, fontStyle: "italic", marginTop: 4 },

  /* Micro-experiment */
  experimentCard: {
    borderRadius: radius.md, padding: 16, gap: 8,
    backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
    borderLeftWidth: 3, borderLeftColor: palette.success,
  },
  experimentText: { color: palette.text, fontSize: 14, lineHeight: 21 },

  /* Baseline */
  baselineRow: { flexDirection: "row", gap: 12 },
  baselineStat: { flex: 1, gap: 4 },
  baselineLabel: { color: palette.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  baselineValue: { color: palette.text, fontSize: 22, fontWeight: "700" },
  baselineHint: { color: palette.muted, fontSize: 12, textTransform: "capitalize" },
  baselineMeta: { marginTop: 10, gap: 4 },
  baselineMetaText: { color: palette.textSecondary, fontSize: 13, lineHeight: 18 },
  baselineExplainer: { color: palette.muted, fontSize: 12, lineHeight: 17, marginTop: 8, fontStyle: "italic" },

  /* Drift timeline */
  driftDay: {
    alignItems: "center", gap: 4, minWidth: 52,
    paddingVertical: 10, paddingHorizontal: 6,
    borderRadius: radius.md, backgroundColor: palette.card,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  driftBar: { fontSize: 15, fontWeight: "700" },

  /* Analytics grid */
  analyticsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  analyticsStat: {
    width: "30%", gap: 2,
  },
  analyticsStatLabel: { color: palette.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  analyticsStatValue: { color: palette.text, fontSize: 16, fontWeight: "700" },

  /* Metrics */
  metricsRow: { flexDirection: "row", gap: 8 },
  metricCard: {
    flex: 1, borderRadius: radius.md, padding: 14, gap: 4,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
  },
  metricLabel: { color: palette.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" },
  metricValue: { color: palette.text, fontSize: 15, fontWeight: "700", textTransform: "capitalize" },
  metricHint: { color: palette.textSecondary, fontSize: 11, lineHeight: 16, marginTop: 4 },

  /* Section / card */
  section: { gap: 8 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sectionHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 6 },
  sectionKicker: { color: palette.accent, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  sectionExtra: { color: palette.textSecondary, fontSize: 11 },
  freqBadge: {
    paddingHorizontal: 5, paddingVertical: 1, borderRadius: radius.pill,
    backgroundColor: palette.successSoft || "rgba(52,199,89,0.12)",
  },
  freqBadgeWeekly: { backgroundColor: palette.purpleSoft || "rgba(175,130,255,0.12)" },
  freqBadgeText: { color: palette.success || "#34C759", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  freqBadgeTextWeekly: { color: palette.purple || "#AF82FF" },
  card: {
    borderRadius: radius.md, padding: 14, gap: 10,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
  },
  cardLabel: {
    color: palette.textSecondary, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase", marginBottom: 2,
  },

  /* Horizontal bar */
  hbarRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  hbarLabel: { width: 80, color: palette.text, fontSize: 13, textTransform: "capitalize" },
  hbarTrack: { flex: 1, height: 8, borderRadius: radius.pill, backgroundColor: palette.glass, overflow: "hidden" },
  hbarFill: { height: "100%", borderRadius: radius.pill },
  hbarValue: { width: 26, color: palette.textSecondary, fontSize: 12, textAlign: "right" },

  /* Trajectory */
  trajectoryScroll: { gap: 8, paddingVertical: 4 },
  trajectoryDay: {
    alignItems: "center", gap: 4, minWidth: 56,
    paddingVertical: 12, paddingHorizontal: 8,
    borderRadius: radius.md, backgroundColor: palette.card,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  trajectoryEmoji: { fontSize: 20 },
  trajectoryLabel: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  trajectoryDate: { color: palette.textSecondary, fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.4 },
  trajectoryHint: { color: palette.textSecondary, fontSize: 12, lineHeight: 17 },
  trajectoryNote: { color: palette.textSecondary, fontSize: 13, lineHeight: 19, fontStyle: "italic" },

  /* Correlation */
  correlationRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: palette.glassBorder,
  },
  correlationTrigger: { width: 70, color: palette.text, fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  correlationChips: { flex: 1, flexDirection: "row", flexWrap: "wrap", gap: 4 },
  correlationChip: {
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
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
  lockedTeaser: { color: palette.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center", maxWidth: 280 },
  lockedCta: {
    marginTop: 4, paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: radius.pill, backgroundColor: palette.accentStrong,
  },
  lockedCtaText: { color: palette.text, fontSize: 14, fontWeight: "700" },

  /* Gut check */
  gutCheckRow: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  gutCheckEmoji: { fontSize: 28, marginTop: 2 },
  gutCheckContent: { flex: 1, gap: 4 },
  gutCheckTitle: { color: palette.text, fontSize: 15, fontWeight: "700" },
  gutCheckBody: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },

  /* Teaser / upgrade */
  teaserCard: {
    position: "relative", borderRadius: radius.md, padding: 18, gap: 8,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
    overflow: "hidden",
  },
  teaserTitle: { color: palette.text, fontSize: 16, fontWeight: "700" },
  teaserBody: { color: palette.textSecondary, fontSize: 14, lineHeight: 21 },
  teaserFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 32 },
  teaserCtaButton: {
    alignSelf: "stretch", alignItems: "center",
    paddingVertical: 14, borderRadius: radius.pill, backgroundColor: palette.accentStrong,
  },
  teaserCtaButtonText: { color: palette.text, fontSize: 15, fontWeight: "700" },
  teaserSubtext: { color: palette.textSecondary, fontSize: 12, textAlign: "center", lineHeight: 17 },

  /* Insight state cards */
  insightStateCard: {
    alignItems: "center", gap: 10, paddingVertical: 28, paddingHorizontal: 24,
    borderRadius: radius.md, backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  insightStateIcon: { fontSize: 28 },
  insightStateTitle: { color: palette.text, fontSize: 16, fontWeight: "700", textAlign: "center" },
  insightStateBody: { color: palette.textSecondary, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 280 },
  insightFooter: { color: palette.textSecondary, fontSize: 11, fontStyle: "italic", textAlign: "right" },
  insightCardsRow: { gap: 10 },
  insightSectionCard: {
    borderRadius: radius.md, padding: 16, gap: 6,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder, overflow: "hidden",
  },
  insightSectionHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  insightSectionIcon: { fontSize: 20 },
  insightSectionLabel: {
    color: palette.purple, fontSize: 11, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase",
  },
  insightSectionBody: { color: palette.text, fontSize: 14, lineHeight: 21 },

  /* Narrative cards */
  narrativeCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16,
    borderRadius: radius.md, backgroundColor: palette.card,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  narrativeIcon: { fontSize: 20, marginTop: 2 },
  narrativeContent: { flex: 1, gap: 6 },
  narrativeTitle: { color: palette.text, fontSize: 14, fontWeight: "700" },
  narrativeText: { color: palette.text, fontSize: 13, lineHeight: 19 },

  /* State cards */
  stateCard: {
    borderRadius: radius.md, padding: 20, gap: 10,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
  },
  emptyStateCard: { alignItems: "center", paddingVertical: 32 },
  emptyIllustration: { width: 120, height: 120, marginBottom: 8, opacity: 0.9 },
  stateTitle: { color: palette.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  stateBody: { color: palette.textSecondary, fontSize: 14, lineHeight: 20, textAlign: "center", maxWidth: 260 },

  /* Starter state */
  starterCard: {
    alignItems: "center", gap: 14, paddingVertical: 40, paddingHorizontal: 24,
    borderRadius: radius.md, backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  starterEmoji: { fontSize: 40 },
  starterTitle: { color: palette.text, fontSize: 18, fontWeight: "700", textAlign: "center" },
  starterBody: { color: palette.textSecondary, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 280 },

  nudgeSecondary: { marginTop: 4, paddingVertical: 10, alignItems: "center" },
  nudgeSecondaryText: { color: palette.accent, fontSize: 14, fontWeight: "600", textDecorationLine: "underline" },

  /* Dominant pattern */
  dominantCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 16,
    borderRadius: radius.md, backgroundColor: palette.card, borderWidth: 1, borderLeftWidth: 3,
  },
  dominantIcon: { fontSize: 24, marginTop: 2 },
  dominantContent: { flex: 1, gap: 4 },
  dominantLabel: { color: palette.danger, fontSize: 10, fontWeight: "800", letterSpacing: 1.2 },
  dominantText: { color: palette.text, fontSize: 14, lineHeight: 21 },
});
