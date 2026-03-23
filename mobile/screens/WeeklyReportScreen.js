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
import { submitActionFeedback } from "@/services/api";
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
  { key: "mirror", label: "Mirror", icon: "🪞" },
  { key: "week", label: "This Week", icon: "📅" },
  { key: "actions", label: "Actions", icon: "⚡" },
  { key: "premium", label: "Premium", icon: "💎" },
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

/* ── Delta chip ── */

function DeltaChip({ value, label, inverted = false }) {
  if (value == null || value === 0) return null;
  const positive = inverted ? value < 0 : value > 0;
  const color = positive ? palette.success : palette.danger;
  const arrow = value > 0 ? "↑" : "↓";
  const display = label || `${value > 0 ? "+" : ""}${typeof value === "number" ? (Number.isInteger(value) ? value : value.toFixed(1)) : value}`;
  return (
    <View style={[s.deltaChip, { backgroundColor: color + "15", borderColor: color + "40" }]}>
      <Text style={[s.deltaChipText, { color }]}>{display} {arrow}</Text>
    </View>
  );
}

/* ── Tab 1: Mirror (persistent identity) ── */

function MirrorTab({ report, dq, confidence, isSignedIn, handleSignIn }) {
  const bm = report?.baselineMetrics;
  const deltas = report?.weeklyDeltas;
  const highlights = report?.changeHighlights || [];

  return (
    <View style={s.tabContent}>
      {/* State of Mind */}
      {bm?.stateOfMind ? (
        <AnimatedSection index={0} style={s.section}>
          <SectionHeader label="State of mind" badge="weekly" />
          <View style={s.stateOfMindCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={s.stateOfMindText}>{capitalize(bm.stateOfMind)}</Text>
              {bm.baselineDeltas?.deltaDrift != null ? (
                <DeltaChip value={bm.baselineDeltas.deltaDrift} />
              ) : null}
            </View>
            {bm.baseline?.reliable ? (
              <Text style={s.stateOfMindSub}>
                Baseline {bm.baseline.score.toFixed(1)}/5 · This week {bm.recentAverage?.toFixed(1) || "—"}/5
                {bm.drift ? ` · ${capitalize(bm.drift.label)}` : ""}
              </Text>
            ) : (
              <Text style={s.stateOfMindSub}>Keep logging — your baseline is still forming.</Text>
            )}
          </View>
        </AnimatedSection>
      ) : (
        <AnimatedSection index={0} style={s.section}>
          <SectionHeader label="State of mind" badge="weekly" />
          <View style={s.card}>
            <Text style={s.aiSummary}>Log a few more moments to see your state of mind emerge.</Text>
          </View>
        </AnimatedSection>
      )}

      {/* Core Patterns — persistent view */}
      {(report.regulators?.length > 0 || report.frictionZones?.length > 0) ? (
        <AnimatedSection index={1} style={s.section}>
          <SectionHeader label="Core patterns" badge="weekly" />
          {report.regulators?.length ? (
            <NarrativeCard
              icon="🌿"
              title="What helps"
              items={report.regulators.slice(0, 3).map((r) => ({ trigger: r.trigger, emotion: r.emotion, count: r.count }))}
              positive
            />
          ) : null}
          {report.frictionZones?.length ? (
            <NarrativeCard
              icon="🔥"
              title="Friction zones"
              items={report.frictionZones.slice(0, 3).map((f) => ({ trigger: f.trigger, emotion: f.emotion, count: f.count }))}
              positive={false}
            />
          ) : null}
        </AnimatedSection>
      ) : null}

      {/* Stability & Recovery */}
      {bm?.stability ? (
        <AnimatedSection index={2} style={s.section}>
          <SectionHeader label="Stability" badge="weekly" />
          <View style={s.card}>
            <View style={s.baselineRow}>
              <View style={s.baselineStat}>
                <Text style={s.baselineLabel}>Stability</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <Text style={[s.baselineValue, { color: bm.stability.score >= 0.6 ? palette.success : palette.warning }]}>
                    {bm.stability.label}
                  </Text>
                  {bm.baselineDeltas?.deltaStability != null ? (
                    <DeltaChip value={bm.baselineDeltas.deltaStability} />
                  ) : null}
                </View>
              </View>
              {bm.recoveryLatency ? (
                <View style={s.baselineStat}>
                  <Text style={s.baselineLabel}>Recovery</Text>
                  <Text style={s.baselineValue}>{bm.recoveryLatency.label}</Text>
                </View>
              ) : null}
            </View>
          </View>
        </AnimatedSection>
      ) : null}

      {/* Change Highlights */}
      {highlights.length > 0 ? (
        <AnimatedSection index={3} style={s.section}>
          <SectionHeader label="What changed" badge="live" />
          <View style={s.card}>
            {highlights.map((h, i) => (
              <View key={i} style={s.highlightRow}>
                <Text style={s.highlightBullet}>•</Text>
                <Text style={s.highlightText}>{h}</Text>
              </View>
            ))}
          </View>
        </AnimatedSection>
      ) : null}

      {/* Confidence */}
      <AnimatedSection index={4} style={s.section}>
        <View style={s.card}>
          <Text style={s.cardLabel}>Confidence</Text>
          <Text style={s.aiSummary}>{CONFIDENCE_LABELS[confidence] || confidence}</Text>
          <Text style={{ color: palette.muted, fontSize: 11 }}>
            Based on {dq.totalMoments || 0} moments across {dq.daysLogged || 0} days
          </Text>
        </View>
      </AnimatedSection>

      {!isSignedIn ? (
        <View style={{ marginTop: 8 }}>
          <PrimaryButton label="Sign in to deepen your patterns" onPress={handleSignIn} />
        </View>
      ) : null}
    </View>
  );
}

/* ── Tab 2: This Week (temporal) ── */

function ThisWeekTab({ report, dq, isSignedIn, handleSignIn, router }) {
  const bm = report?.baselineMetrics;
  const deltas = report?.weeklyDeltas;
  const triggerEntries = topEntries(report?.triggerFrequency, 9);
  const emotionEntries = topEntries(report?.emotionFrequency, 5);
  const triggerMax = triggerEntries[0]?.[1] || 1;
  const emotionMax = emotionEntries[0]?.[1] || 1;
  const timeEntries = Object.entries(report?.timeOfDayPatterns || {}).filter(([, v]) => v > 0);
  const timeMax = Math.max(...timeEntries.map(([, v]) => v), 1);

  return (
    <View style={s.tabContent}>
      {/* Weekly summary */}
      {report?.aiInsight?.summary ? (
        <AnimatedSection index={0} style={s.section}>
          <SectionHeader label="Weekly summary" badge="weekly" />
          <View style={s.summaryCard}>
            <Text style={s.summaryText}>{cleanText(report.aiInsight.summary)}</Text>
          </View>
          {deltas ? (
            <View style={[s.card, { marginTop: 6 }]}>
              <Text style={{ color: palette.textSecondary, fontSize: 12 }}>
                {deltas.totalMomentsDelta > 0
                  ? `${deltas.totalMomentsDelta} more moment${deltas.totalMomentsDelta !== 1 ? "s" : ""} than last week`
                  : deltas.totalMomentsDelta < 0
                    ? `${Math.abs(deltas.totalMomentsDelta)} fewer moment${Math.abs(deltas.totalMomentsDelta) !== 1 ? "s" : ""} than last week`
                    : "Same number of moments as last week"}
              </Text>
            </View>
          ) : null}
        </AnimatedSection>
      ) : null}

      {/* Emotional trajectory */}
      {report.weeklyEmotionTrajectory?.length >= 1 ? (
        <AnimatedSection index={1} style={s.section}>
          <SectionHeader label="Emotional tone" badge="live" />
          <View style={s.card}>
            <Text style={s.trajectoryHint}>
              {report.weeklyEmotionTrajectory.length === 1 ? "Your tone from logged days." : "How your average tone shifted day by day."}
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
            {(report.positiveStreak?.days >= 2 || report.negativeStreak?.days >= 2) ? (
              <Text style={[s.trajectoryNote, { marginTop: 6 }]}>
                {report.negativeStreak?.days >= 2
                  ? `${report.negativeStreak.days}-day low stretch mid-week`
                  : `${report.positiveStreak.days}-day high-energy stretch`}
              </Text>
            ) : null}
          </View>
        </AnimatedSection>
      ) : null}

      {/* Drift timeline */}
      {bm?.dailyDrift?.length >= 2 ? (
        <AnimatedSection index={2} style={s.section}>
          <SectionHeader label="Drift from baseline" badge="live" />
          <View style={s.card}>
            <Text style={s.trajectoryHint}>Above zero = better than usual, below = tougher.</Text>
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

      {/* Emotions breakdown */}
      {emotionEntries.length ? (
        <AnimatedSection index={3} style={s.section}>
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
        <AnimatedSection index={4} style={s.section}>
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
        <AnimatedSection index={5} style={s.section}>
          <SectionHeader label="When you logged" badge="live" />
          <View style={s.card}>
            {timeEntries.map(([key, value]) => (
              <HBar key={key} label={key} value={value} max={timeMax} color={TIME_COLORS[key] || palette.warning} icon={TIME_ICONS[key]} />
            ))}
          </View>
        </AnimatedSection>
      ) : null}

      {/* Correlations */}
      {isSignedIn && dq.hasEnoughForPairings && Object.keys(report.correlations || {}).length ? (
        <AnimatedSection index={6} style={s.section}>
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

      {/* Gut check */}
      {report.predictionAccuracy ? (
        <AnimatedSection index={7} style={s.section}>
          <SectionHeader label="Gut check" badge="live" />
          <View style={s.card}>
            <View style={s.gutCheckRow}>
              <Text style={s.gutCheckEmoji}>{report.predictionAccuracy.rate >= 0.5 ? "🎯" : "🔮"}</Text>
              <View style={s.gutCheckContent}>
                <Text style={s.gutCheckTitle}>{report.predictionAccuracy.correct} of {report.predictionAccuracy.daysCompared} days</Text>
                <Text style={s.gutCheckBody}>
                  {report.predictionAccuracy.rate >= 0.8 ? "You read yourself almost perfectly."
                    : report.predictionAccuracy.rate >= 0.6 ? "Strong self-awareness. Your morning read mostly matched the day."
                    : report.predictionAccuracy.rate >= 0.4 ? "Hit-and-miss — your days had more turns than expected."
                    : report.predictionAccuracy.correct === 0 ? "None of your predictions landed."
                    : "Mostly off the mark, but surprises teach you something."}
                </Text>
              </View>
            </View>
          </View>
        </AnimatedSection>
      ) : null}

      {/* Timeline CTA */}
      <AnimatedSection index={8} style={s.section}>
        <Pressable style={s.ctaCard} onPress={() => { tap(); router.push("/(tabs)/timeline"); }} accessibilityRole="button">
          <Text style={s.ctaCardText}>📖 View full timeline</Text>
        </Pressable>
      </AnimatedSection>

      {!isSignedIn ? (
        <View style={{ marginTop: 8 }}>
          <PrimaryButton label="Sign in for deeper analytics" onPress={handleSignIn} />
        </View>
      ) : null}
    </View>
  );
}

/* ── Tab 3: Actions (behavioural) ── */

function ActionsTab({ report, deviceId, token, onFeedback }) {
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
    tap();
    try {
      await submitActionFeedback(actionId, response, deviceId, token);
      setResponded((prev) => ({ ...prev, [actionId]: response }));
      trackEvent("action_feedback", { actionId, response });
      if (onFeedback) onFeedback(actionId, response);
    } catch {
      // Silently fail — user can retry
    } finally {
      setSubmitting(null);
    }
  }

  if (!actions.length) {
    return (
      <View style={s.tabContent}>
        <View style={s.insightStateCard}>
          <Text style={s.insightStateIcon}>⚡</Text>
          <Text style={s.insightStateTitle}>Actions are on their way</Text>
          <Text style={s.insightStateBody}>
            Log at least 3 moments to unlock actions. With 5+, you get personalised AI insights.
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.tabContent}>
      <AnimatedSection index={0} style={s.section}>
        <SectionHeader label="This week's actions" badge="live" extra={`${actions.length} suggestion${actions.length !== 1 ? "s" : ""}`} />
        <Text style={{ color: palette.textSecondary, fontSize: 12, marginBottom: 4 }}>
          Based on your patterns. Try one and let us know.
        </Text>
      </AnimatedSection>

      {actions.map((action, i) => {
        const done = responded[action.id];
        return (
          <AnimatedSection key={action.id} index={i + 1} style={s.section}>
            <View style={[s.actionCard, done && s.actionCardDone]}>
              <View style={s.actionHeader}>
                <Text style={s.actionIcon}>{action.icon || "⚡"}</Text>
                <View style={s.actionHeaderText}>
                  <Text style={s.actionCategory}>{action.category || "Action"}</Text>
                  <Text style={s.actionTitle}>{action.title}</Text>
                </View>
              </View>
              <Text style={s.actionReason}>{action.reason}</Text>
              {done ? (
                <View style={s.actionFeedbackDone}>
                  <Text style={s.actionFeedbackDoneText}>
                    {done === "tried" ? "👍 You tried this" : "👎 Skipped"}
                  </Text>
                </View>
              ) : (
                <View style={s.actionButtons}>
                  <Pressable
                    style={[s.actionBtn, s.actionBtnTry]}
                    onPress={() => handleResponse(action.id, "tried")}
                    disabled={!!submitting}
                    accessibilityRole="button"
                  >
                    <Text style={s.actionBtnTryText}>👍 Tried it</Text>
                  </Pressable>
                  <Pressable
                    style={[s.actionBtn, s.actionBtnSkip]}
                    onPress={() => handleResponse(action.id, "skipped")}
                    disabled={!!submitting}
                    accessibilityRole="button"
                  >
                    <Text style={s.actionBtnSkipText}>👎 Skip</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </AnimatedSection>
        );
      })}
    </View>
  );
}

/* ── Tab 4: Premium (deep learning) ── */

function PremiumTab({ report, dq, isSignedIn, isPremium, hasLlmInsight, hasLlmTeaser, handleSignIn, handleUpgrade, purchasing }) {
  const bm = report?.baselineMetrics;
  const regulators = report?.regulators || [];
  const feedback = report?.actionFeedback || [];
  const triedCount = feedback.filter((f) => f.response === "tried").length;
  const skippedCount = feedback.filter((f) => f.response === "skipped").length;

  function renderLlmInsight() {
    if (!isSignedIn) {
      return (
        <LockedSection
          title="Personal insight"
          teaser="Sign in to unlock personalised AI-powered pattern analysis."
          ctaLabel="Sign in to unlock"
          onPress={handleSignIn}
        >
          <View style={s.card}><Text style={[s.aiSummary, { color: palette.muted }]}>Deeper pattern analysis appears here.</Text></View>
        </LockedSection>
      );
    }

    if (isPremium && hasLlmInsight) {
      const sections = parseLlmSections(report.llmInsight.narrative);
      if (sections) {
        return (
          <View style={s.section}>
            <SectionHeader label="Personal insight" badge="weekly" />
            <View style={s.insightCardsRow}>
              {sections.map((body, idx) => {
                if (!body) return null;
                const meta = INSIGHT_SECTION_META[idx] || {};
                return (
                  <View key={idx} style={s.insightSectionCard}>
                    <View style={s.insightSectionHeader}>
                      <Text style={s.insightSectionIcon}>{meta.icon || "💡"}</Text>
                      <Text style={[s.insightSectionLabel, meta.color ? { color: meta.color } : null]}>
                        {meta.label || `Section ${idx + 1}`}
                      </Text>
                    </View>
                    <Text style={s.insightSectionBody}>{cleanText(body)}</Text>
                  </View>
                );
              })}
              <Text style={s.insightFooter}>
                Generated by QuietDen · {report.llmInsight.generatedAt
                  ? new Date(report.llmInsight.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                  : ""}
              </Text>
            </View>
          </View>
        );
      }
      return (
        <View style={s.section}>
          <SectionHeader label="Personal insight" badge="weekly" />
          <View style={s.card}>
            <Text style={s.aiSummary}>{cleanText(report.llmInsight.narrative)}</Text>
          </View>
        </View>
      );
    }

    if (hasLlmTeaser) {
      const narrativeSource = report.llmTeaser?.narrative;
      const teaserSections = parseLlmSections(narrativeSource);
      const teaserText = teaserSections?.[0] || cleanText(narrativeSource).split(/\n\s*\n/)[0] || "";
      return (
        <View style={s.section}>
          <SectionHeader label="Personal insight" badge="weekly" />
          <View style={s.teaserCard}>
            <Text style={s.teaserTitle}>{teaserText ? "Your pattern insight is ready" : "A deeper pattern is emerging…"}</Text>
            {teaserText ? <Text style={s.teaserBody} numberOfLines={3}>{teaserText}</Text> : null}
            <LinearGradient colors={["transparent", palette.glass]} locations={[0, 1]} style={s.teaserFade} />
          </View>
          <Pressable style={s.teaserCtaButton} onPress={handleUpgrade} disabled={purchasing} accessibilityRole="button">
            <Text style={s.teaserCtaButtonText}>{purchasing ? "Please wait…" : "See the full picture"}</Text>
          </Pressable>
        </View>
      );
    }

    if (!isPremium) {
      return (
        <View style={s.section}>
          <SectionHeader label="Personal insight" badge="weekly" />
          <View style={s.insightStateCard}>
            <Text style={s.insightStateIcon}>💎</Text>
            <Text style={s.insightStateTitle}>Unlock Premium insights</Text>
            <Text style={s.insightStateBody}>
              Get a personalised AI deep-dive into your patterns, effect sizes, and behavioural profile.
            </Text>
            <Pressable style={s.teaserCtaButton} onPress={handleUpgrade} disabled={purchasing} accessibilityRole="button">
              <Text style={s.teaserCtaButtonText}>{purchasing ? "Please wait…" : "Upgrade to Premium"}</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return null;
  }

  return (
    <View style={s.tabContent}>
      {/* What Works For You — effect sizes from regulators */}
      {regulators.length ? (
        <AnimatedSection index={0} style={s.section}>
          <SectionHeader label="What works for you" badge="weekly" />
          <View style={s.card}>
            {regulators.slice(0, 5).map((r, i) => (
              <View key={i} style={s.effectRow}>
                <View style={[s.effectDot, { backgroundColor: (EMOTION_COLORS[r.emotion] || palette.success) + "40" }]}>
                  <Text style={{ fontSize: 14 }}>{EMOTION_EMOJIS[r.emotion] || "🌿"}</Text>
                </View>
                <View style={s.effectContent}>
                  <Text style={s.effectTitle}>{r.trigger} → {r.emotion}</Text>
                  <Text style={s.effectCount}>{r.count} time{r.count !== 1 ? "s" : ""} this period</Text>
                </View>
              </View>
            ))}
          </View>
        </AnimatedSection>
      ) : null}

      {/* Behaviour Profile — chips */}
      {bm?.baseline?.reliable ? (
        <AnimatedSection index={1} style={s.section}>
          <SectionHeader label="Behaviour profile" badge="weekly" />
          <View style={s.card}>
            <View style={s.profileChips}>
              <View style={s.profileChip}><Text style={s.profileChipText}>Baseline: {bm.baseline.label}</Text></View>
              {bm.stability ? <View style={s.profileChip}><Text style={s.profileChipText}>{capitalize(bm.stability.label)}</Text></View> : null}
              {bm.recoveryLatency ? <View style={s.profileChip}><Text style={s.profileChipText}>{capitalize(bm.recoveryLatency.label)}</Text></View> : null}
              {report.volatilityLabel ? <View style={s.profileChip}><Text style={s.profileChipText}>{capitalize(report.volatilityLabel)}</Text></View> : null}
            </View>
            <Text style={s.baselineExplainer}>
              Built from {bm.baseline.daysUsed} days of data. The more you log, the richer this profile becomes.
            </Text>
          </View>
        </AnimatedSection>
      ) : null}

      {/* Action Effectiveness */}
      {(triedCount > 0 || skippedCount > 0) ? (
        <AnimatedSection index={2} style={s.section}>
          <SectionHeader label="Action effectiveness" badge="live" />
          <View style={s.card}>
            <View style={s.metricsRow}>
              <View style={s.metricCard}>
                <Text style={s.metricLabel}>Tried</Text>
                <Text style={[s.metricValue, { color: palette.success }]}>{triedCount}</Text>
              </View>
              <View style={s.metricCard}>
                <Text style={s.metricLabel}>Skipped</Text>
                <Text style={[s.metricValue, { color: palette.muted }]}>{skippedCount}</Text>
              </View>
            </View>
          </View>
        </AnimatedSection>
      ) : null}

      {/* Baseline advanced details */}
      {bm?.baseline?.reliable ? (
        <AnimatedSection index={3} style={s.section}>
          <SectionHeader label="Baseline details" badge="weekly" />
          <View style={s.card}>
            <View style={s.analyticsGrid}>
              <View style={s.analyticsStat}>
                <Text style={s.analyticsStatLabel}>Baseline</Text>
                <Text style={s.analyticsStatValue}>{bm.baseline.score.toFixed(2)}/5</Text>
              </View>
              {bm.recentAverage != null ? (
                <View style={s.analyticsStat}>
                  <Text style={s.analyticsStatLabel}>7-day avg</Text>
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

      {/* LLM Insight */}
      {renderLlmInsight()}
    </View>
  );
}

/* ── Main screen ── */

export function WeeklyReportScreen() {
  const { loadWeeklyReport, refreshSession, subscription, user, token, subscribe, deviceId } = useAppSession();
  const router = useRouter();
  const { dominantEmotion } = useEmotionalState();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [activeTab, setActiveTab] = useState("mirror");

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
              {activeTab === "mirror" ? (
                <MirrorTab report={report} dq={dq} confidence={confidence} isSignedIn={isSignedIn} handleSignIn={handleSignIn} />
              ) : activeTab === "week" ? (
                <ThisWeekTab report={report} dq={dq} confidence={confidence} isSignedIn={isSignedIn} handleSignIn={handleSignIn} router={router} />
              ) : activeTab === "actions" ? (
                <ActionsTab report={report} deviceId={deviceId} token={token} />
              ) : (
                <PremiumTab
                  report={report} dq={dq} confidence={confidence}
                  isSignedIn={isSignedIn} isPremium={isPremium}
                  hasLlmInsight={hasLlmInsight} hasLlmTeaser={hasLlmTeaser}
                  handleSignIn={handleSignIn} handleUpgrade={handleUpgrade}
                  purchasing={purchasing}
                />
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

  /* Delta chips */
  deltaChip: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
  },
  deltaChipText: { fontSize: 11, fontWeight: "700" },

  /* Action cards */
  actionCard: {
    borderRadius: radius.md, padding: 16, gap: 10,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
  },
  actionCardDone: { opacity: 0.6 },
  actionHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
  },
  actionHeaderText: {
    flexDirection: "column", flex: 1, gap: 2,
  },
  actionIcon: { fontSize: 22 },
  actionCategory: {
    color: palette.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1, textTransform: "uppercase",
  },
  actionTitle: { color: palette.text, fontSize: 15, fontWeight: "700" },
  actionReason: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
  actionButtons: { flexDirection: "row", gap: 8, marginTop: 4 },
  actionBtn: {
    flex: 1, alignItems: "center", paddingVertical: 10,
    borderRadius: radius.sm, borderWidth: 1, borderColor: palette.glassBorder,
  },
  actionBtnTry: { backgroundColor: palette.successSoft || "rgba(52,199,89,0.12)", borderColor: (palette.success || "#34C759") + "40" },
  actionBtnSkip: { backgroundColor: "rgba(148, 180, 224, 0.10)", borderColor: "rgba(148, 180, 224, 0.25)" },
  actionBtnTryText: { fontSize: 13, fontWeight: "600", color: palette.text },
  actionBtnSkipText: { fontSize: 13, fontWeight: "600", color: palette.muted },
  actionFeedbackDone: { alignItems: "center", paddingVertical: 8 },
  actionFeedbackDoneText: { color: palette.muted, fontSize: 12, fontStyle: "italic" },

  /* Effect rows (premium) */
  effectRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: palette.glassBorder,
  },
  effectDot: { width: 8, height: 8, borderRadius: 4 },
  effectContent: { flex: 1, gap: 2 },
  effectTitle: { color: palette.text, fontSize: 13, fontWeight: "600", textTransform: "capitalize" },
  effectCount: { color: palette.textSecondary, fontSize: 11 },

  /* Profile chips */
  profileChips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  profileChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
  },
  profileChipText: { color: palette.text, fontSize: 12, fontWeight: "600" },

  /* Change highlights */
  highlightRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 4 },
  highlightBullet: { fontSize: 14, marginTop: 1 },
  highlightText: { flex: 1, color: palette.text, fontSize: 13, lineHeight: 19 },

  /* CTA card */
  ctaCard: {
    borderRadius: radius.md, padding: 16, gap: 6,
    backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: palette.accentMedium,
    alignItems: "center",
  },
  ctaCardText: { color: palette.text, fontSize: 14, fontWeight: "600", textAlign: "center" },
});
