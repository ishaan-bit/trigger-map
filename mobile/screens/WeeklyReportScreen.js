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
import { submitActionFeedback, fetchModes, submitModeFeedback, fetchProgress } from "@/services/api";
import { trackEvent } from "@/services/analyticsService";
import { palette, radius } from "@/utils/theme";
import { tap, selection } from "@/utils/haptics";
import { TRIGGER_COLORS, EMOTION_COLORS as DS_EMOTION_COLORS, emotionStyle, triggerStyle, STAGGER_DELAY } from "@/utils/designSystem";
import { useEmotionalState } from "@/hooks/useEmotionalState";
import { useLanguage } from "@/i18n/LanguageContext";

/* ── Helpers ── */

function cleanText(str) {
  if (typeof str !== "string") return str;
  return str
    .replace(/\\u([0-9A-Fa-f]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\n/g, "\n")
    .replace(/\u2014/g, ", ")
    .replace(/\u2013/g, ", ")
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/[\u200b-\u200f\ufeff]/g, "")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "")
    .replace(/\*\*/g, "")
    .replace(/#{1,3}\s+/g, "")
    .replace(/^\s*[-*\u2022]\s+/gm, "")
    .replace(/[^\S\n]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
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

function getInsightSectionMeta(t) {
  return [
    { icon: "🔍", label: t("report.insightStoodOut"), color: palette.accent },
    { icon: "🧩", label: t("report.insightContributing"), color: palette.purple },
    { icon: "💡", label: t("report.insightTryThis"), color: palette.success },
  ];
}

const EMOTION_EMOJIS = { frustrated: "😤", anxious: "😰", neutral: "😐", calm: "😌", energized: "⚡" };
const EMOTION_COLORS = { calm: "#5ee6a0", neutral: "#9eb0c9", anxious: "#ffb347", frustrated: "#ff6b7a", energized: "#a78bfa" };
const TIME_ICONS = { morning: "🌅", afternoon: "☀️", evening: "🌆", night: "🌙" };
const TIME_COLORS = { morning: "#ffb347", afternoon: "#a78bfa", evening: "#56d0e0", night: "#9eb0c9" };
const ENERGY_COLORS = { steady: palette.success, balanced: palette.accent, tense: palette.warning, drained: palette.danger, uplifted: palette.purple };
function getConfidenceLabel(key, t) { return t("report.confidence." + key) || key; }

function topEntries(record, limit = 5) {
  return Object.entries(record || {}).sort(([, a], [, b]) => b - a).slice(0, limit);
}

function capitalize(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : str; }

function triggerDisplay(key, t) {
  const mapped = t ? t("triggers." + key) : null;
  return mapped && mapped !== "triggers." + key ? mapped : capitalize(key);
}

function scoreTone(score, t) {
  if (score >= 4.2) return { emoji: "🌟", label: t ? t("report.toneGreat") : "Great", color: "#a78bfa" };
  if (score >= 3.5) return { emoji: "😌", label: t ? t("report.toneGood") : "Good", color: "#5ee6a0" };
  if (score >= 2.8) return { emoji: "😐", label: t ? t("report.toneMixed") : "Mixed", color: "#9eb0c9" };
  if (score >= 2)   return { emoji: "😟", label: t ? t("report.toneUneasy") : "Uneasy", color: "#ffb347" };
  return { emoji: "😤", label: t ? t("report.toneTough") : "Tough", color: "#ff6b7a" };
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

function SectionHeader({ label, extra, badge, t }) {
  return (
    <View style={s.sectionHeader}>
      <View style={s.sectionHeaderLeft}>
        <Text style={s.sectionKicker}>{label.toUpperCase()}</Text>
        {badge ? (
          <View style={[s.freqBadge, badge === "weekly" && s.freqBadgeWeekly]}>
            <Text style={[s.freqBadgeText, badge === "weekly" && s.freqBadgeTextWeekly]}>
              {badge === "weekly" ? (t ? t("report.badgeWeekly") : "WEEKLY") : (t ? t("report.badgeLive") : "LIVE")}
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

function NarrativeCard({ icon, title, items, positive, t }) {
  return (
    <AnimatedSection index={positive ? 1 : 0} style={[s.narrativeCard, { borderLeftWidth: 3, borderLeftColor: positive ? palette.success : palette.danger }]}>
      <Text style={s.narrativeIcon}>{icon}</Text>
      <View style={s.narrativeContent}>
        <Text style={s.narrativeTitle}>{title}</Text>
        {items.map((item, i) => (
          <Text key={i} style={s.narrativeText}>
            {item.trigger ? (
              <>
                <Text style={{ color: TRIGGER_COLORS[item.trigger] || palette.accent, fontWeight: "600" }}>{triggerDisplay(item.trigger, t)}</Text>
                {positive ? (t ? t("report.helpsFeel") : " helps you feel ") : (t ? t("report.leavesFeeling") : " tends to leave you feeling ")}
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

const TAB_KEYS = [
  { key: "mirror", labelKey: "report.tabMirror", icon: "🪞" },
  { key: "week", labelKey: "report.tabThisWeek", icon: "📅" },
  { key: "progress", labelKey: "report.progress.tabLabel", icon: "📈" },
  { key: "actions", labelKey: "report.tabActions", icon: "⚡" },
  { key: "premium", labelKey: "report.tabPremium", icon: "💎" },
];

function TabBar({ activeTab, onTabChange, t }) {
  return (
    <View style={s.tabBar}>
      {TAB_KEYS.map((tab) => {
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
              {tab.icon} {t(tab.labelKey)}
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

function MirrorTab({ report, dq, confidence, isSignedIn, handleSignIn, t }) {
  const bm = report?.baselineMetrics;
  const insight = report?.aiInsight;
  const drivers = insight?.drivers;
  const loops = insight?.behavioralLoop;
  const direction = insight?.actionableDirection;
  const whereToFocus = insight?.whereToFocus;
  const whatWorking = insight?.whatWorking;
  const invoked = report?.invokedMetrics;
  const compound = report?.compoundPatterns;

  return (
    <View style={s.tabContent}>
      {/* Current State */}
      {bm?.stateOfMind ? (
        <AnimatedSection index={0} style={s.section}>
          <SectionHeader label={t("report.currentState")} badge="weekly" t={t} />
          <View style={s.stateOfMindCard}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={s.stateOfMindText}>{capitalize(bm.stateOfMind)}</Text>
              {bm.baselineDeltas?.deltaDrift != null ? (
                <DeltaChip value={bm.baselineDeltas.deltaDrift} />
              ) : null}
            </View>
            {bm.baseline?.reliable ? (
              <Text style={s.stateOfMindSub}>
                {t("report.baselineText", { baselineScore: bm.baseline.score.toFixed(1), weekScore: bm.recentAverage?.toFixed(1) || "—" })}
                {bm.drift ? ` · ${capitalize(bm.drift.label)}` : ""}
              </Text>
            ) : (
              <Text style={s.stateOfMindSub}>{t("report.baselineForming")}</Text>
            )}
          </View>
        </AnimatedSection>
      ) : (
        <AnimatedSection index={0} style={s.section}>
          <SectionHeader label={t("report.currentState")} badge="weekly" t={t} />
          <View style={s.card}>
            <Text style={s.aiSummary}>{t("report.logMoreForState")}</Text>
          </View>
        </AnimatedSection>
      )}

      {/* Drivers — top triggers with effect tags */}
      {drivers?.length ? (
        <AnimatedSection index={1} style={s.section}>
          <SectionHeader label={t("report.drivers")} badge="weekly" t={t} />
          <View style={s.card}>
            {drivers.map((d, i) => {
              const tColor = TRIGGER_COLORS[d.trigger] || palette.accent;
              const effectColor = d.effect === "regulator" ? palette.success : d.effect === "friction" ? palette.danger : palette.muted;
              const effectLabel = d.effect === "regulator" ? t("report.helps") : d.effect === "friction" ? t("report.friction") : t("report.neutral");
              return (
                <View key={i} style={[s.driverRow, i < drivers.length - 1 && { borderBottomWidth: 1, borderBottomColor: palette.glassBorder }]}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[s.driverTrigger, { color: tColor }]}>{triggerDisplay(d.trigger, t)}</Text>
                    {d.emotion ? <Text style={s.driverEmotion}>{d.emotion} · {d.count}×</Text> : <Text style={s.driverEmotion}>{d.count}×</Text>}
                  </View>
                  <View style={[s.effectBadge, { backgroundColor: effectColor + "18", borderColor: effectColor + "40" }]}>
                    <Text style={[s.effectBadgeText, { color: effectColor }]}>{effectLabel}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </AnimatedSection>
      ) : null}

      {/* Behavioral Loop — trigger → emotion → recovery */}
      {loops?.length ? (
        <AnimatedSection index={2} style={s.section}>
          <SectionHeader label={t("report.behavioralLoop")} badge="weekly" t={t} />
          {loops.map((loop, i) => {
            const isFriction = loop.type === "friction";
            const loopColor = isFriction ? palette.danger : palette.success;
            const emoColor = EMOTION_COLORS[loop.emotion] || palette.textSecondary;
            return (
              <View key={i} style={[s.loopCard, { borderLeftColor: loopColor }]}>
                <View style={s.loopFlow}>
                  <View style={[s.loopNode, { backgroundColor: (TRIGGER_COLORS[loop.trigger] || palette.accent) + "20" }]}>
                    <Text style={[s.loopNodeText, { color: TRIGGER_COLORS[loop.trigger] || palette.accent }]}>{triggerDisplay(loop.trigger, t)}</Text>
                  </View>
                  <Text style={s.loopArrow}>→</Text>
                  <View style={[s.loopNode, { backgroundColor: emoColor + "20" }]}>
                    <Text style={[s.loopNodeText, { color: emoColor }]}>{EMOTION_EMOJIS[loop.emotion] || "•"} {loop.emotion}</Text>
                  </View>
                  {loop.recovery ? (
                    <>
                      <Text style={s.loopArrow}>→</Text>
                      <View style={[s.loopNode, { backgroundColor: palette.accentSoft }]}>
                        <Text style={[s.loopNodeText, { color: palette.accent }]}>⏱ {loop.recovery}</Text>
                      </View>
                    </>
                  ) : null}
                </View>
                <Text style={s.loopMeta}>{t("report.xThisWeek", { count: loop.count })}</Text>
              </View>
            );
          })}
        </AnimatedSection>
      ) : null}

      {/* Invoked Signals — masking, crash risk, false recovery */}
      {(compound?.falseRecovery || compound?.crashRisk || invoked?.weeklyMasking) ? (
        <AnimatedSection index={3} style={s.section}>
          <SectionHeader label={t("report.deeperSignals")} badge="weekly" t={t} />
          <View style={s.card}>
            {compound?.crashRisk ? (
              <View style={s.signalRow}>
                <Text style={[s.signalIcon, { color: palette.danger }]}>⚠️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.signalLabel, { color: palette.danger }]}>{t("report.crashRiskLabel")}</Text>
                  <Text style={s.signalBody}>{t("report.crashRiskBody")}</Text>
                </View>
              </View>
            ) : null}
            {compound?.falseRecovery ? (
              <View style={s.signalRow}>
                <Text style={[s.signalIcon, { color: palette.warning }]}>🔄</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.signalLabel, { color: palette.warning }]}>{t("report.falseRecoveryLabel")}</Text>
                  <Text style={s.signalBody}>{t("report.falseRecoveryBody")}</Text>
                </View>
              </View>
            ) : null}
            {invoked?.weeklyMasking?.level && invoked.weeklyMasking.level !== "none" ? (
              <View style={s.signalRow}>
                <Text style={[s.signalIcon, { color: palette.purple }]}>🎭</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[s.signalLabel, { color: palette.purple }]}>{t("report.maskingLevel", { level: invoked.weeklyMasking.level })}</Text>
                  <Text style={s.signalBody}>{t("report.maskingBody")}</Text>
                </View>
              </View>
            ) : null}
          </View>
        </AnimatedSection>
      ) : null}

      {/* Actionable Direction */}
      {direction ? (
        <AnimatedSection index={4} style={s.section}>
          <SectionHeader label={t("report.direction")} badge="weekly" t={t} />
          <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: palette.accent }]}>
            <Text style={{ color: palette.text, fontSize: 14, lineHeight: 21 }}>{direction}</Text>
          </View>
        </AnimatedSection>
      ) : null}

      {/* What's Working / Where to Focus */}
      {(whatWorking?.length || whereToFocus?.length) ? (
        <AnimatedSection index={5} style={s.section}>
          {whatWorking?.length ? (
            <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: palette.success, marginBottom: 8 }]}>
              <Text style={s.cardLabel}>{t("report.whatWorking")}</Text>
              {whatWorking.slice(0, 3).map((item, i) => (
                <Text key={i} style={{ color: palette.text, fontSize: 13, lineHeight: 19 }}>{item.text}</Text>
              ))}
            </View>
          ) : null}
          {whereToFocus?.length ? (
            <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: palette.warning }]}>
              <Text style={s.cardLabel}>{t("report.whereToFocus")}</Text>
              {whereToFocus.slice(0, 3).map((item, i) => (
                <Text key={i} style={{ color: palette.text, fontSize: 13, lineHeight: 19 }}>{item.text}</Text>
              ))}
            </View>
          ) : null}
        </AnimatedSection>
      ) : null}

      {/* Confidence */}
      <AnimatedSection index={6} style={s.section}>
        <View style={s.card}>
          <Text style={s.cardLabel}>{t("report.confidenceLabel")}</Text>
          <Text style={s.aiSummary}>{getConfidenceLabel(confidence, t)}</Text>
          <Text style={{ color: palette.muted, fontSize: 11 }}>
            {t("report.basedOnMoments", { moments: dq.totalMoments || 0, days: dq.daysLogged || 0 })}
          </Text>
        </View>
      </AnimatedSection>

      {!isSignedIn ? (
        <View style={{ marginTop: 8 }}>
          <PrimaryButton label={t("report.signInDeepen")} onPress={handleSignIn} />
        </View>
      ) : null}
    </View>
  );
}

/* ── Tab 2: This Week (temporal) ── */

function ThisWeekTab({ report, dq, isSignedIn, handleSignIn, router, t }) {
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
          <SectionHeader label={t("report.weeklySummary")} badge="weekly" t={t} />
          <View style={s.summaryCard}>
            <Text style={s.summaryText}>{cleanText(report.aiInsight.summary)}</Text>
          </View>
          {deltas ? (
            <View style={[s.card, { marginTop: 6 }]}>
              <Text style={{ color: palette.textSecondary, fontSize: 12 }}>
                {deltas.totalMomentsDelta > 0
                  ? (deltas.totalMomentsDelta !== 1 ? t("report.moreMomentsPlural", { count: deltas.totalMomentsDelta }) : t("report.moreMoments", { count: deltas.totalMomentsDelta }))
                  : deltas.totalMomentsDelta < 0
                    ? (Math.abs(deltas.totalMomentsDelta) !== 1 ? t("report.fewerMomentsPlural", { count: Math.abs(deltas.totalMomentsDelta) }) : t("report.fewerMoments", { count: Math.abs(deltas.totalMomentsDelta) }))
                    : t("report.sameMoments")}
              </Text>
            </View>
          ) : null}
        </AnimatedSection>
      ) : null}

      {/* Emotional trajectory */}
      {report.weeklyEmotionTrajectory?.length >= 1 ? (
        <AnimatedSection index={1} style={s.section}>
          <SectionHeader label={t("report.emotionalTone")} badge="live" t={t} />
          <View style={s.card}>
            <Text style={s.trajectoryHint}>
              {report.weeklyEmotionTrajectory.length === 1 ? t("report.toneFromDays") : t("report.toneShifted")}
            </Text>
            {report.trajectoryNote ? <Text style={s.trajectoryNote}>{cleanText(report.trajectoryNote)}</Text> : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.trajectoryScroll}>
              {report.weeklyEmotionTrajectory.map((day) => {
                const tone = scoreTone(day.score, t);
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
                  ? t("report.lowStretch", { days: report.negativeStreak.days })
                  : t("report.highStretch", { days: report.positiveStreak.days })}
              </Text>
            ) : null}
          </View>
        </AnimatedSection>
      ) : null}

      {/* Drift timeline */}
      {bm?.dailyDrift?.length >= 2 ? (
        <AnimatedSection index={2} style={s.section}>
          <SectionHeader label={t("report.driftFromBaseline")} badge="live" t={t} />
          <View style={s.card}>
            <Text style={s.trajectoryHint}>{t("report.driftHint")}</Text>
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
          <SectionHeader label={t("report.emotionsTitle")} badge="live" t={t} extra={t("report.recorded", { count: dq.uniqueEmotions || 0 })} />
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
          <SectionHeader label={t("report.triggersTitle")} badge="live" t={t} extra={t("report.areasCount", { count: dq.uniqueTriggers || 0 })} />
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
          <SectionHeader label={t("report.whenLogged")} badge="live" t={t} />
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
          <SectionHeader label={t("report.triggerEmotion")} badge="live" t={t} />
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
          <SectionHeader label={t("report.gutCheck")} badge="live" t={t} />
          <View style={s.card}>
            <View style={s.gutCheckRow}>
              <Text style={s.gutCheckEmoji}>{report.predictionAccuracy.rate >= 0.5 ? "🎯" : "🔮"}</Text>
              <View style={s.gutCheckContent}>
                <Text style={s.gutCheckTitle}>{t("report.gutCheckDays", { correct: report.predictionAccuracy.correct, total: report.predictionAccuracy.daysCompared })}</Text>
                <Text style={s.gutCheckBody}>
                  {report.predictionAccuracy.rate >= 0.8 ? t("report.gutCheckPerfect")
                    : report.predictionAccuracy.rate >= 0.6 ? t("report.gutCheckStrong")
                    : report.predictionAccuracy.rate >= 0.4 ? t("report.gutCheckMixed")
                    : report.predictionAccuracy.correct === 0 ? t("report.gutCheckNone")
                    : t("report.gutCheckOff")}
                </Text>
              </View>
            </View>
          </View>
        </AnimatedSection>
      ) : null}

      {/* Timeline CTA */}
      <AnimatedSection index={8} style={s.section}>
        <Pressable style={s.ctaCard} onPress={() => { tap(); router.push("/(tabs)/timeline"); }} accessibilityRole="button">
          <Text style={s.ctaCardText}>📖 {t("report.viewTimeline")}</Text>
        </Pressable>
      </AnimatedSection>

      {!isSignedIn ? (
        <View style={{ marginTop: 8 }}>
          <PrimaryButton label={t("report.signInAnalytics")} onPress={handleSignIn} />
        </View>
      ) : null}
    </View>
  );
}

/* ── Tab 3: Actions (behavioural) ── */

function ActionsTab({ report, deviceId, token, onFeedback, t }) {
  const actions = report?.actions || [];
  const feedback = report?.actionFeedback || [];
  const [responded, setResponded] = useState(() => {
    const map = {};
    for (const f of feedback) { map[f.actionId] = f.response; }
    return map;
  });
  const [submitting, setSubmitting] = useState(null);
  const [feedbackAck, setFeedbackAck] = useState({});

  async function handleResponse(actionId, response) {
    if (responded[actionId] || submitting) return;
    setSubmitting(actionId);
    tap();
    try {
      await submitActionFeedback(actionId, response, deviceId, token);
      setResponded((prev) => ({ ...prev, [actionId]: response }));
      setFeedbackAck((prev) => ({ ...prev, [actionId]: response === "helped" ? t("report.markedHelpful") : t("report.adjustThis") }));
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
          <Text style={s.insightStateTitle}>{t("report.actionsOnWay")}</Text>
          <Text style={s.insightStateBody}>
            {t("report.actionsOnWayBody")}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={s.tabContent}>
      <AnimatedSection index={0} style={s.section}>
        <SectionHeader label={t("report.thisWeeksActions")} badge="live" t={t} extra={actions.length !== 1 ? t("report.suggestionsCountPlural", { count: actions.length }) : t("report.suggestionsCount", { count: actions.length })} />
        <Text style={{ color: palette.textSecondary, fontSize: 12, marginBottom: 4 }}>
          {t("report.basedOnPatterns")}
        </Text>
      </AnimatedSection>

      {actions.map((action, i) => {
        const done = responded[action.id];
        const ack = feedbackAck[action.id];
        return (
          <AnimatedSection key={action.id} index={i + 1} style={s.section}>
            <View style={[s.actionCard, done && s.actionCardDone]}>
              <View style={s.actionHeader}>
                <Text style={s.actionIcon}>{action.icon || "⚡"}</Text>
                <View style={s.actionHeaderText}>
                  <Text style={s.actionCategory}>{action.category || t("report.defaultCategory")}</Text>
                  <Text style={s.actionTitle}>{action.title}</Text>
                </View>
              </View>
              <Text style={s.actionReason}>{action.reason}</Text>
              {done ? (
                <View style={[s.actionFeedbackDone, { backgroundColor: done === "helped" ? palette.successSoft : palette.warningSoft }]}>
                  <Text style={[s.actionFeedbackDoneText, { color: done === "helped" ? palette.success : palette.warning }]}>
                    {done === "helped" ? "✓ " : "✕ "}{ack || (done === "helped" ? t("report.markedHelpful") : t("report.adjustThis"))}
                  </Text>
                </View>
              ) : (
                <View style={s.actionButtons}>
                  <Pressable
                    style={[s.actionBtn, s.actionBtnHelped]}
                    onPress={() => handleResponse(action.id, "helped")}
                    disabled={!!submitting}
                    accessibilityRole="button"
                    accessibilityLabel={t("report.helped")}
                  >
                    <Text style={s.actionBtnHelpedText}>✓ {t("report.helped")}</Text>
                  </Pressable>
                  <Pressable
                    style={[s.actionBtn, s.actionBtnNotHelpful]}
                    onPress={() => handleResponse(action.id, "not_helpful")}
                    disabled={!!submitting}
                    accessibilityRole="button"
                    accessibilityLabel={t("report.notHelpful")}
                  >
                    <Text style={s.actionBtnNotHelpfulText}>✕ {t("report.notHelpful")}</Text>
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

/* ── Tab 4: Progress (trajectory + drift intelligence) ── */

function TrendBadge({ trend, t }) {
  if (!trend) return null;
  const label =
    trend === "improving"
      ? t("report.progress.trendImproving")
      : trend === "declining"
      ? t("report.progress.trendDeclining")
      : t("report.progress.trendStable");
  const color =
    trend === "improving" ? palette.success : trend === "declining" ? palette.danger : palette.muted;
  const arrow = trend === "improving" ? "↑" : trend === "declining" ? "↓" : "→";
  return (
    <View style={[s.progressTrendBadge, { backgroundColor: color + "15", borderColor: color + "40" }]}>
      <Text style={[s.progressTrendBadgeText, { color }]}>{arrow} {label}</Text>
    </View>
  );
}

function ProgressTab({ progress, isSignedIn, isPremium, handleSignIn, handleUpgrade, purchasing, t }) {
  if (!progress) {
    return (
      <View style={s.tabContent}>
        <View style={s.insightStateCard}>
          <Text style={s.insightStateIcon}>📈</Text>
          <Text style={s.insightStateTitle}>{t("report.progress.tabLabel")}</Text>
          <Text style={s.insightStateBody}>{t("report.progress.needMoreWeeks")}</Text>
        </View>
      </View>
    );
  }

  const { trajectory, metrics, patternShifts, attributions, weeklySnapshots, dataQuality } = progress;
  const hasShifts =
    (patternShifts?.strengthening?.length || 0) +
    (patternShifts?.weakening?.length || 0) +
    (patternShifts?.unresolved?.length || 0) +
    (patternShifts?.emerging?.length || 0) > 0;
  const hasAttributions =
    (attributions?.helped?.length || 0) +
    (attributions?.notWorking?.length || 0) +
    (attributions?.needsAttention?.length || 0) > 0;

  const toneColor = (tone) =>
    tone === "great" || tone === "good" ? palette.success
    : tone === "mixed" ? palette.muted
    : tone === "uneasy" ? palette.warning
    : tone === "tough" ? palette.danger
    : palette.text;

  const toneEmoji = (tone) =>
    tone === "great" ? "🌟" : tone === "good" ? "😌" : tone === "mixed" ? "😐"
    : tone === "uneasy" ? "😟" : tone === "tough" ? "😤" : "•";

  return (
    <View style={s.tabContent}>

      {/* ── 1. TRAJECTORY ARC ── */}
      {trajectory ? (
        <AnimatedSection index={0} style={s.section}>
          <SectionHeader label={t("report.progress.trajectoryTitle")} badge="weekly" t={t} />

          {/* Visual arc: past → present → projected */}
          <View style={s.progressArc}>
            {/* Past */}
            <View style={s.progressArcNode}>
              <Text style={[s.progressArcEmoji]}>{toneEmoji(trajectory.past?.tone)}</Text>
              <Text style={[s.progressArcScore, { color: toneColor(trajectory.past?.tone) }]}>
                {trajectory.past?.score?.toFixed(1) || "—"}
              </Text>
              <Text style={s.progressArcLabel}>
                {t("report.progress.weeksAgo", { count: trajectory.weeksTracked || "—" })}
              </Text>
            </View>

            {/* Connector with direction */}
            <View style={s.progressArcConnector}>
              <View style={[s.progressArcLine, {
                backgroundColor: trajectory.direction === "improving" ? palette.success + "60"
                  : trajectory.direction === "declining" ? palette.danger + "60"
                  : palette.muted + "40",
              }]} />
              {trajectory.change !== null ? (
                <View style={[s.progressArcDelta, {
                  backgroundColor: trajectory.direction === "improving" ? palette.successSoft
                    : trajectory.direction === "declining" ? palette.dangerSoft
                    : palette.glass,
                }]}>
                  <Text style={[s.progressArcDeltaText, {
                    color: trajectory.direction === "improving" ? palette.success
                      : trajectory.direction === "declining" ? palette.danger
                      : palette.muted,
                  }]}>
                    {trajectory.change > 0 ? "+" : ""}{trajectory.change.toFixed(1)}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Present */}
            <View style={s.progressArcNode}>
              <Text style={[s.progressArcEmoji]}>{toneEmoji(trajectory.present?.tone)}</Text>
              <Text style={[s.progressArcScore, { color: toneColor(trajectory.present?.tone) }]}>
                {trajectory.present?.score?.toFixed(1) || "—"}
              </Text>
              <Text style={s.progressArcLabel}>{t("report.progress.thisWeek")}</Text>
            </View>

            {/* Projected */}
            <View style={s.progressArcConnector}>
              <View style={[s.progressArcLine, { backgroundColor: palette.muted + "30", borderStyle: "dashed" }]} />
            </View>
            <View style={[s.progressArcNode, { opacity: 0.7 }]}>
              <Text style={s.progressArcEmoji}>
                {trajectory.projected === "improving" ? "📈" : trajectory.projected === "declining" ? "📉" : "➡️"}
              </Text>
              <Text style={[s.progressArcScore, { color: palette.muted, fontSize: 13 }]}>
                {trajectory.projected === "improving"
                  ? t("report.progress.projectedImproving")
                  : trajectory.projected === "declining"
                  ? t("report.progress.projectedDeclining")
                  : t("report.progress.projectedHolding")}
              </Text>
              <Text style={s.progressArcLabel}>{t("report.progress.projected")}</Text>
            </View>
          </View>

          {/* Direction badge */}
          {trajectory.direction ? (
            <View style={[s.progressDirectionBadge, {
              backgroundColor: trajectory.direction === "improving" ? palette.successSoft
                : trajectory.direction === "declining" ? palette.dangerSoft
                : palette.glass,
              borderColor: trajectory.direction === "improving" ? palette.success + "40"
                : trajectory.direction === "declining" ? palette.danger + "40"
                : palette.glassBorder,
            }]}>
              <Text style={[s.progressDirectionText, {
                color: trajectory.direction === "improving" ? palette.success
                  : trajectory.direction === "declining" ? palette.danger
                  : palette.muted,
              }]}>
                {trajectory.direction === "improving" ? "↑ " : trajectory.direction === "declining" ? "↓ " : "→ "}
                {trajectory.direction === "improving"
                  ? t("report.progress.changeImproving")
                  : trajectory.direction === "declining"
                  ? t("report.progress.changeDeclining")
                  : t("report.progress.changeStable")}
                {trajectory.change !== null ? ` (${trajectory.change > 0 ? "+" : ""}${trajectory.change.toFixed(1)})` : ""}
              </Text>
            </View>
          ) : null}
        </AnimatedSection>
      ) : null}

      {/* ── 2. WHAT'S CHANGING (core metrics) ── */}
      {metrics ? (
        <AnimatedSection index={1} style={s.section}>
          <SectionHeader label={t("report.progress.metricsTitle")} badge="live" t={t} />
          <View style={s.progressMetricsGrid}>
            {[
              { key: "stability", label: t("report.progress.metricStability"), data: metrics.stability, icon: "🟢", invertDisplay: false },
              { key: "volatility", label: t("report.progress.metricVolatility"), data: metrics.volatility, icon: "⚡", invertDisplay: true },
              { key: "drift", label: t("report.progress.metricDrift"), data: metrics.drift, icon: "📊", invertDisplay: false },
              { key: "recoveryDays", label: t("report.progress.metricRecovery"), data: metrics.recoveryDays, icon: "⏱", invertDisplay: true },
            ].filter((m) => m.data).map((m) => {
              const { data: md } = m;
              const displayCurrent = m.invertDisplay
                ? (md.current <= 0 ? "—" : (m.key === "recoveryDays" ? `~${md.current}d` : md.current.toFixed(1)))
                : (md.current === null ? "—" : (m.key === "stability" ? `${Math.round(md.current * 100)}%` : md.current.toFixed(1)));
              const displayPrev = m.invertDisplay
                ? (md.previous <= 0 ? "—" : (m.key === "recoveryDays" ? `~${md.previous}d` : md.previous.toFixed(1)))
                : (md.previous === null ? "—" : (m.key === "stability" ? `${Math.round(md.previous * 100)}%` : md.previous.toFixed(1)));

              return (
                <View key={m.key} style={s.progressMetricCard}>
                  <View style={s.progressMetricHeader}>
                    <Text style={s.progressMetricIcon}>{m.icon}</Text>
                    <Text style={s.progressMetricLabel}>{m.label}</Text>
                  </View>
                  <View style={s.progressThenNow}>
                    <View style={s.progressThenNowItem}>
                      <Text style={s.progressThenNowLabel}>{t("report.progress.thenLabel")}</Text>
                      <Text style={s.progressThenNowValue}>{displayPrev}</Text>
                    </View>
                    <Text style={s.progressThenNowArrow}>→</Text>
                    <View style={s.progressThenNowItem}>
                      <Text style={s.progressThenNowLabel}>{t("report.progress.nowLabel")}</Text>
                      <Text style={[s.progressThenNowValue, { fontWeight: "700" }]}>{displayCurrent}</Text>
                    </View>
                  </View>
                  <TrendBadge trend={md.trend} t={t} />
                </View>
              );
            })}
          </View>
        </AnimatedSection>
      ) : null}

      {/* ── 3. PATTERN SHIFTS ── */}
      {hasShifts ? (
        <AnimatedSection index={2} style={s.section}>
          <SectionHeader label={t("report.progress.patternsTitle")} badge="weekly" t={t} />

          {patternShifts.strengthening?.length ? (
            <View style={[s.progressShiftGroup, { borderLeftColor: palette.success }]}>
              <Text style={[s.progressShiftGroupLabel, { color: palette.success }]}>
                {t("report.progress.strengthening")}
              </Text>
              {patternShifts.strengthening.map((p, i) => (
                <View key={i} style={s.progressShiftItem}>
                  <Text style={s.progressShiftPair}>
                    <Text style={{ color: TRIGGER_COLORS[p.trigger] || palette.accent }}>{capitalize(p.trigger)}</Text>
                    {" → "}
                    <Text style={{ color: EMOTION_COLORS[p.emotion] || palette.text }}>{p.emotion}</Text>
                  </Text>
                  <Text style={s.progressShiftCount}>
                    {t("report.progress.patternTimes", { count: p.count })}
                    {p.prevCount ? ` (${t("report.progress.wasTimes", { count: p.prevCount })})` : ""}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {patternShifts.weakening?.length ? (
            <View style={[s.progressShiftGroup, { borderLeftColor: palette.accent }]}>
              <Text style={[s.progressShiftGroupLabel, { color: palette.accent }]}>
                {t("report.progress.weakening")}
              </Text>
              {patternShifts.weakening.map((p, i) => (
                <View key={i} style={s.progressShiftItem}>
                  <Text style={s.progressShiftPair}>
                    <Text style={{ color: TRIGGER_COLORS[p.trigger] || palette.accent }}>{capitalize(p.trigger)}</Text>
                    {" → "}
                    <Text style={{ color: EMOTION_COLORS[p.emotion] || palette.text }}>{p.emotion}</Text>
                  </Text>
                  <Text style={s.progressShiftCount}>
                    {t("report.progress.patternTimes", { count: p.count })}
                    {p.prevCount ? ` (${t("report.progress.wasTimes", { count: p.prevCount })})` : ""}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {patternShifts.unresolved?.length ? (
            <View style={[s.progressShiftGroup, { borderLeftColor: palette.warning }]}>
              <Text style={[s.progressShiftGroupLabel, { color: palette.warning }]}>
                {t("report.progress.unresolved")}
              </Text>
              {patternShifts.unresolved.map((p, i) => (
                <View key={i} style={s.progressShiftItem}>
                  <Text style={s.progressShiftPair}>
                    <Text style={{ color: TRIGGER_COLORS[p.trigger] || palette.accent }}>{capitalize(p.trigger)}</Text>
                    {" → "}
                    <Text style={{ color: EMOTION_COLORS[p.emotion] || palette.text }}>{p.emotion}</Text>
                  </Text>
                  <Text style={s.progressShiftCount}>
                    {t("report.progress.patternTimes", { count: p.count })}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {patternShifts.emerging?.length ? (
            <View style={[s.progressShiftGroup, { borderLeftColor: palette.purple }]}>
              <Text style={[s.progressShiftGroupLabel, { color: palette.purple }]}>
                {t("report.progress.emerging")}
              </Text>
              {patternShifts.emerging.map((p, i) => (
                <View key={i} style={s.progressShiftItem}>
                  <Text style={s.progressShiftPair}>
                    <Text style={{ color: TRIGGER_COLORS[p.trigger] || palette.accent }}>{capitalize(p.trigger)}</Text>
                    {" → "}
                    <Text style={{ color: EMOTION_COLORS[p.emotion] || palette.text }}>{p.emotion}</Text>
                  </Text>
                  <Text style={s.progressShiftCount}>
                    {t("report.progress.patternTimes", { count: p.count })}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </AnimatedSection>
      ) : null}

      {/* ── 4. ATTRIBUTIONS ── */}
      {hasAttributions ? (
        <AnimatedSection index={3} style={s.section}>
          <SectionHeader label={t("report.progress.attributionsTitle")} badge="weekly" t={t} />

          {attributions.helped?.length ? (
            attributions.helped.map((a, i) => (
              <View key={`h-${i}`} style={[s.progressAttrCard, { borderLeftColor: palette.success }]}>
                <View style={s.progressAttrHeader}>
                  <Text style={{ fontSize: 14 }}>✓</Text>
                  <Text style={[s.progressAttrLabel, { color: palette.success }]}>
                    {t("report.progress.helped")}
                  </Text>
                </View>
                <Text style={s.progressAttrTrigger}>{capitalize(a.trigger)}</Text>
                {a.improvement ? (
                  <Text style={[s.progressAttrNote, { color: palette.success }]}>
                    {t("report.progress.improvedBy", { value: a.improvement.toFixed(1) })}
                  </Text>
                ) : null}
              </View>
            ))
          ) : null}

          {attributions.notWorking?.length ? (
            attributions.notWorking.map((a, i) => (
              <View key={`n-${i}`} style={[s.progressAttrCard, { borderLeftColor: palette.warning }]}>
                <View style={s.progressAttrHeader}>
                  <Text style={{ fontSize: 14 }}>✕</Text>
                  <Text style={[s.progressAttrLabel, { color: palette.warning }]}>
                    {t("report.progress.notWorking")}
                  </Text>
                </View>
                <Text style={s.progressAttrTrigger}>{capitalize(a.trigger)}</Text>
                {a.note ? <Text style={s.progressAttrNote}>{a.note}</Text> : null}
              </View>
            ))
          ) : null}

          {attributions.needsAttention?.length ? (
            attributions.needsAttention.map((a, i) => (
              <View key={`a-${i}`} style={[s.progressAttrCard, { borderLeftColor: palette.danger }]}>
                <View style={s.progressAttrHeader}>
                  <Text style={{ fontSize: 14 }}>⚠️</Text>
                  <Text style={[s.progressAttrLabel, { color: palette.danger }]}>
                    {t("report.progress.needsAttention")}
                  </Text>
                </View>
                <Text style={s.progressAttrTrigger}>{capitalize(a.trigger)}</Text>
                {a.note ? <Text style={s.progressAttrNote}>{a.note}</Text> : null}
              </View>
            ))
          ) : null}
        </AnimatedSection>
      ) : null}

      {/* ── 5. WEEK BY WEEK ── */}
      {weeklySnapshots?.length >= 2 ? (
        <AnimatedSection index={4} style={s.section}>
          <SectionHeader label={t("report.progress.weeklyTitle")} badge="live" t={t} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.progressWeekScroll}>
            {weeklySnapshots.map((week) => {
              const color = toneColor(week.tone);
              return (
                <View key={week.weekLabel} style={s.progressWeekCard}>
                  <Text style={s.progressWeekLabel}>{week.weekLabel}</Text>
                  <Text style={[s.progressWeekEmoji]}>{toneEmoji(week.tone)}</Text>
                  <Text style={[s.progressWeekScore, { color }]}>
                    {week.score?.toFixed(1) || "—"}
                  </Text>
                  {week.stability !== null ? (
                    <Text style={s.progressWeekMeta}>
                      {Math.round(week.stability * 100)}%
                    </Text>
                  ) : null}
                  <Text style={s.progressWeekMoments}>
                    {t("report.progress.weekMoments", { count: week.moments })}
                  </Text>
                  <Text style={s.progressWeekDate}>
                    {week.startDate ? new Date(week.startDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : ""}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </AnimatedSection>
      ) : null}

      {/* ── 6. CONFIDENCE ── */}
      <AnimatedSection index={5} style={s.section}>
        <View style={s.card}>
          <Text style={s.aiSummary}>
            {dataQuality?.confidence === "strong"
              ? t("report.progress.confidenceStrong", { weeks: dataQuality.weeksAvailable })
              : dataQuality?.confidence === "moderate"
              ? t("report.progress.confidenceModerate", { weeks: dataQuality.weeksAvailable })
              : t("report.progress.confidenceEmerging")}
          </Text>
        </View>
      </AnimatedSection>

      {!isSignedIn ? (
        <View style={{ marginTop: 8 }}>
          <PrimaryButton label={t("report.signInDeepen")} onPress={handleSignIn} />
        </View>
      ) : null}
    </View>
  );
}

/* ── Tab 5: Premium (decision-oriented) ── */

function getDirectionText(report) {
  if (report?.llmInsight?.narrative) {
    const sec = parseLlmSections(report.llmInsight.narrative);
    if (sec?.[2]) return sec[2];
  }
  if (report?.aiInsight?.actionableDirection) return report.aiInsight.actionableDirection;
  if (report?.aiInsight?.microExperiment) return report.aiInsight.microExperiment;
  return null;
}

function buildSignals(report, t) {
  const out = [];
  const bm = report?.baselineMetrics;
  const compound = report?.compoundPatterns;
  const invoked = report?.invokedMetrics;
  if (bm?.drift) {
    const v = bm.drift.value;
    out.push({
      key: "drift", icon: v >= 0.2 ? "📈" : v <= -0.2 ? "📉" : "➡️",
      label: t("report.prem.signalDrift"),
      body: v >= 0.2 ? t("report.prem.driftUp") : v <= -0.2 ? t("report.prem.driftDown") : t("report.prem.driftStable"),
      color: v >= 0.2 ? palette.success : v <= -0.2 ? palette.danger : palette.muted,
    });
  }
  if (bm?.stability) {
    out.push({
      key: "stability", icon: bm.stability.score >= 0.6 ? "🟢" : "🟡",
      label: t("report.prem.signalStability"),
      body: bm.stability.score >= 0.6 ? t("report.prem.stabilityHigh") : t("report.prem.stabilityLow"),
      color: bm.stability.score >= 0.6 ? palette.success : palette.warning,
    });
  }
  if (compound?.crashRisk) {
    out.push({ key: "crash", icon: "⚠️", label: t("report.prem.signalCrashRisk"), body: t("report.crashRiskBody"), color: palette.danger });
  }
  if (compound?.falseRecovery) {
    out.push({ key: "recovery", icon: "🔄", label: t("report.prem.signalFalseRecovery"), body: t("report.falseRecoveryBody"), color: palette.warning });
  }
  if (invoked?.weeklyMasking?.level && invoked.weeklyMasking.level !== "none") {
    out.push({ key: "masking", icon: "🎭", label: t("report.prem.signalMasking"), body: t("report.maskingBody"), color: palette.purple });
  }
  if (report?.volatilityLabel) {
    const high = report.volatilityLabel.toLowerCase().includes("high") || report.volatilityLabel.toLowerCase().includes("volatile");
    out.push({
      key: "volatility", icon: high ? "⚡" : "🌊",
      label: t("report.prem.signalVolatility"),
      body: high ? t("report.prem.volatilityHigh") : t("report.prem.volatilityLow"),
      color: high ? palette.warning : palette.success,
    });
  }
  return out;
}

function sortRegulatorsByFeedback(regulators, feedback) {
  const helpedTriggers = new Set();
  const skippedTriggers = new Set();
  for (const f of feedback) {
    const trig = f.trigger || f.category;
    if (!trig) continue;
    if (f.response === "tried" || f.response === "helped") helpedTriggers.add(trig.toLowerCase());
    if (f.response === "skipped" || f.response === "not_helpful") skippedTriggers.add(trig.toLowerCase());
  }
  return [...regulators].sort((a, b) => {
    const aHelped = helpedTriggers.has((a.trigger || "").toLowerCase()) ? -2 : 0;
    const bHelped = helpedTriggers.has((b.trigger || "").toLowerCase()) ? -2 : 0;
    const aSkipped = skippedTriggers.has((a.trigger || "").toLowerCase()) ? 1 : 0;
    const bSkipped = skippedTriggers.has((b.trigger || "").toLowerCase()) ? 1 : 0;
    return (aHelped + aSkipped) - (bHelped + bSkipped);
  });
}

/* ── Mode Cards (adaptive modes content) ── */

function ModeCards({ mode, data, t, onFeedback, isPremium }) {
  const [feedbackGiven, setFeedbackGiven] = useState({});

  if (!data) {
    return (
      <View style={s.modeContent}>
        <Text style={s.modeContentBody}>{t("report.prem.mode.generating")}</Text>
      </View>
    );
  }

  const items = data.items || [];
  const narrative = data.narrative || "";

  function handleFeedback(itemId, response) {
    tap();
    setFeedbackGiven((prev) => ({ ...prev, [itemId]: response }));
    if (onFeedback) onFeedback(mode, itemId, response);
  }

  return (
    <View style={s.modeContent}>
      {narrative ? <Text style={s.modeNarrative}>{cleanText(narrative)}</Text> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.modeCardsScroll}>
        {items.map((item) => {
          const given = feedbackGiven[item.id];
          return (
            <View key={item.id} style={s.modeCard}>
              <Text style={s.modeCardTitle}>{item.name}</Text>
              <Text style={s.modeCardDesc}>{item.description}</Text>
              {item.intensity ? (
                <Text style={s.modeCardMeta}>{item.intensity} · ~{item.durationMin} min</Text>
              ) : item.type ? (
                <Text style={s.modeCardMeta}>{item.type}{item.nutrientFocus ? ` · ${item.nutrientFocus}` : ""}</Text>
              ) : null}

              {isPremium && !given ? (
                <View style={s.modeFeedbackRow}>
                  <Pressable
                    style={[s.modeFeedbackBtn, s.modeFeedbackHelpful]}
                    onPress={() => handleFeedback(item.id, "helpful")}
                    accessibilityRole="button"
                  >
                    <Text style={s.modeFeedbackHelpfulText}>👍 {t("report.prem.mode.helpful")}</Text>
                  </Pressable>
                  <Pressable
                    style={[s.modeFeedbackBtn, s.modeFeedbackNot]}
                    onPress={() => handleFeedback(item.id, "not_helpful")}
                    accessibilityRole="button"
                  >
                    <Text style={s.modeFeedbackNotText}>👎</Text>
                  </Pressable>
                </View>
              ) : given ? (
                <View style={s.modeFeedbackDone}>
                  <Text style={s.modeFeedbackDoneText}>
                    {given === "helpful" ? `✓ ${t("report.prem.mode.thanksHelpful")}` : t("report.prem.mode.thanksNot")}
                  </Text>
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      {data.generatedAt ? (
        <Text style={s.modeFooter}>
          {t("report.generatedBy", { date: new Date(data.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) })}
        </Text>
      ) : null}
    </View>
  );
}

function PremiumTab({ report, dq, isSignedIn, isPremium, hasLlmInsight, hasLlmTeaser, handleSignIn, handleUpgrade, purchasing, subscription, t, modes, onModeFeedback }) {
  const [activeMode, setActiveMode] = useState("core");
  const bm = report?.baselineMetrics;
  const regulators = report?.regulators || [];
  const feedback = report?.actionFeedback || [];
  const triedCount = feedback.filter((f) => f.response === "tried" || f.response === "helped").length;
  const skippedCount = feedback.filter((f) => f.response === "skipped" || f.response === "not_helpful").length;
  const directionText = getDirectionText(report);
  const signals = buildSignals(report, t);
  const llmSections = hasLlmInsight ? parseLlmSections(report.llmInsight.narrative) : null;
  const sortedRegulators = sortRegulatorsByFeedback(regulators, feedback);
  const helpedTriggerSet = new Set(feedback.filter((f) => f.response === "tried" || f.response === "helped").map((f) => (f.trigger || f.category || "").toLowerCase()));

  const expiryDate = subscription?.expiresAt
    ? new Date(subscription.expiresAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : null;

  const lockedCta = !isSignedIn
    ? { label: t("report.signInToUnlock"), onPress: handleSignIn }
    : { label: purchasing ? t("common.pleaseWait") : t("report.upgradePremium"), onPress: handleUpgrade, disabled: purchasing };

  /* ── Render helpers ── */

  function renderDirectionCard() {
    if (!isSignedIn) {
      return (
        <LockedSection title={t("report.prem.unlockDirection")} teaser={t("report.prem.directionLocked")} ctaLabel={t("report.signInToUnlock")} onPress={handleSignIn}>
          <View style={s.premDirectionCard}><Text style={[s.premDirectionText, { color: palette.muted }]}>{t("report.prem.directionHint")}</Text></View>
        </LockedSection>
      );
    }

    if (isPremium && directionText) {
      return (
        <View style={s.premDirectionCard}>
          <Text style={s.premDirectionKicker}>{t("report.prem.tryThis")}</Text>
          <Text style={s.premDirectionText}>{cleanText(directionText)}</Text>
          <Text style={s.premDirectionHint}>{t("report.prem.directionHint")}</Text>
        </View>
      );
    }

    if (hasLlmTeaser) {
      const src = report.llmTeaser?.narrative;
      const teaser = parseLlmSections(src);
      const preview = teaser?.[2] || teaser?.[0] || cleanText(src).split(/\n\s*\n/)[0] || "";
      return (
        <View style={s.section}>
          <View style={s.teaserCard}>
            <Text style={s.premDirectionKicker}>{t("report.prem.tryThis")}</Text>
            {preview ? <Text style={s.teaserBody} numberOfLines={2}>{preview}</Text> : null}
            <LinearGradient colors={["transparent", palette.glass]} locations={[0, 1]} style={s.teaserFade} />
          </View>
          <Text style={s.premTeaserNote}>{t("report.prem.teaserHint")}</Text>
          <Pressable style={s.teaserCtaButton} onPress={handleUpgrade} disabled={purchasing} accessibilityRole="button">
            <Text style={s.teaserCtaButtonText}>{purchasing ? t("common.pleaseWait") : t("report.seeFullPicture")}</Text>
          </Pressable>
        </View>
      );
    }

    if (!isPremium) {
      return (
        <View style={s.insightStateCard}>
          <Text style={s.insightStateIcon}>💎</Text>
          <Text style={s.insightStateTitle}>{t("report.unlockInsightsTitle")}</Text>
          <Text style={s.insightStateBody}>{t("report.unlockInsightsBody")}</Text>
          <Pressable style={s.teaserCtaButton} onPress={handleUpgrade} disabled={purchasing} accessibilityRole="button">
            <Text style={s.teaserCtaButtonText}>{purchasing ? t("common.pleaseWait") : t("report.upgradePremium")}</Text>
          </Pressable>
        </View>
      );
    }

    return (
      <View style={s.premDirectionCard}>
        <Text style={s.premDirectionKicker}>{t("report.prem.tryThis")}</Text>
        <Text style={s.premDirectionText}>{t("report.prem.directionEmpty")}</Text>
      </View>
    );
  }

  return (
    <View style={s.tabContent}>

      {/* ── Premium status badge ── */}
      {isPremium ? (
        <View style={s.premBadge}>
          <Text style={s.premBadgeText}>
            {expiryDate ? t("report.prem.statusUntil", { date: expiryDate }) : t("report.prem.statusActive")}
          </Text>
        </View>
      ) : null}

      {/* ── 1. YOUR DIRECTION (hero) ── */}
      <AnimatedSection index={0} style={s.section}>
        <SectionHeader label={t("report.prem.directionTitle")} badge="weekly" t={t} />
        {renderDirectionCard()}
      </AnimatedSection>

      {/* ── 2. WHAT'S SHIFTING (signal cards) ── */}
      {signals.length > 0 ? (
        isPremium ? (
          <AnimatedSection index={1} style={s.section}>
            <SectionHeader label={t("report.prem.shifting")} badge="live" t={t}
              extra={signals.length !== 1 ? t("report.prem.signalCountPlural", { count: signals.length }) : t("report.prem.signalCount", { count: signals.length })} />
            <View style={s.premSignalGrid}>
              {signals.map((sig) => (
                <View key={sig.key} style={[s.premSignalCard, { borderLeftColor: sig.color }]}>
                  <Text style={s.premSignalIcon}>{sig.icon}</Text>
                  <Text style={[s.premSignalLabel, { color: sig.color }]}>{sig.label}</Text>
                  <Text style={s.premSignalBody}>{sig.body}</Text>
                </View>
              ))}
            </View>
          </AnimatedSection>
        ) : (
          <AnimatedSection index={1} style={s.section}>
            <SectionHeader label={t("report.prem.shifting")} badge="live" t={t} />
            {/* Show first signal as preview, lock the rest */}
            <View style={s.premSignalGrid}>
              <View style={[s.premSignalCard, { borderLeftColor: signals[0].color }]}>
                <Text style={s.premSignalIcon}>{signals[0].icon}</Text>
                <Text style={[s.premSignalLabel, { color: signals[0].color }]}>{signals[0].label}</Text>
                <Text style={s.premSignalBody}>{signals[0].body}</Text>
              </View>
            </View>
            {signals.length > 1 ? (
              <LockedSection
                title={t("report.prem.unlockSignals")}
                teaser={t("report.prem.shiftingHint")}
                ctaLabel={lockedCta.label}
                onPress={lockedCta.onPress}
              >
                <View style={s.premSignalGrid}>
                  {signals.slice(1, 3).map((sig) => (
                    <View key={sig.key} style={[s.premSignalCard, { borderLeftColor: sig.color }]}>
                      <Text style={s.premSignalIcon}>{sig.icon}</Text>
                      <Text style={[s.premSignalLabel, { color: sig.color }]}>{sig.label}</Text>
                    </View>
                  ))}
                </View>
              </LockedSection>
            ) : null}
          </AnimatedSection>
        )
      ) : null}

      {/* ── 3. PATTERN INTELLIGENCE (LLM insight cards) ── */}
      {isPremium && hasLlmInsight && llmSections ? (
        <AnimatedSection index={2} style={s.section}>
          <SectionHeader label={t("report.prem.patternIntel")} badge="weekly" t={t} />
          <View style={s.insightCardsRow}>
            {llmSections.map((body, idx) => {
              if (!body) return null;
              const insightMeta = getInsightSectionMeta(t);
              const meta = insightMeta[idx] || {};
              return (
                <View key={idx} style={s.insightSectionCard}>
                  <View style={s.insightSectionHeader}>
                    <Text style={s.insightSectionIcon}>{meta.icon || "💡"}</Text>
                    <Text style={[s.insightSectionLabel, meta.color ? { color: meta.color } : null]}>
                      {meta.label || t("report.sectionLabel", { num: idx + 1 })}
                    </Text>
                  </View>
                  <Text style={s.insightSectionBody}>{cleanText(body)}</Text>
                </View>
              );
            })}
            <Text style={s.insightFooter}>
              {t("report.generatedBy", { date: report.llmInsight.generatedAt
                ? new Date(report.llmInsight.generatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
                : "" })}
            </Text>
          </View>
        </AnimatedSection>
      ) : !isPremium && isSignedIn ? (
        <AnimatedSection index={2} style={s.section}>
          <LockedSection
            title={t("report.prem.unlockIntel")}
            teaser={t("report.prem.patternIntelHint")}
            ctaLabel={lockedCta.label}
            onPress={lockedCta.onPress}
          >
            <View style={s.insightCardsRow}>
              <View style={s.insightSectionCard}>
                <View style={s.insightSectionHeader}>
                  <Text style={s.insightSectionIcon}>🔍</Text>
                  <Text style={s.insightSectionLabel}>{t("report.insightStoodOut")}</Text>
                </View>
                <Text style={[s.insightSectionBody, { color: palette.muted }]}>{t("report.prem.patternIntelHint")}</Text>
              </View>
            </View>
          </LockedSection>
        </AnimatedSection>
      ) : null}

      {/* ── 4. YOUR LEVERS (adaptive regulators) ── */}
      {sortedRegulators.length > 0 ? (
        isPremium ? (
          <AnimatedSection index={3} style={s.section}>
            <SectionHeader label={t("report.prem.leversTitle")} badge="weekly" t={t}
              extra={helpedTriggerSet.size > 0 ? t("report.prem.leversAdaptive") : null} />
            <View style={s.card}>
              {sortedRegulators.slice(0, 6).map((r, i) => {
                const isHelped = helpedTriggerSet.has((r.trigger || "").toLowerCase());
                return (
                  <View key={i} style={s.effectRow}>
                    <View style={[s.effectDot, { backgroundColor: (EMOTION_COLORS[r.emotion] || palette.success) + "40" }]}>
                      <Text style={{ fontSize: 14 }}>{EMOTION_EMOJIS[r.emotion] || "🌿"}</Text>
                    </View>
                    <View style={s.effectContent}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                        <Text style={s.effectTitle}>{r.trigger} → {r.emotion}</Text>
                        {isHelped ? (
                          <View style={s.premHelpedBadge}>
                            <Text style={s.premHelpedBadgeText}>✓ {t("report.prem.leverHelped")}</Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={s.effectCount}>{r.count !== 1 ? t("report.timesThisPeriodPlural", { count: r.count }) : t("report.timesThisPeriod", { count: r.count })}</Text>
                    </View>
                  </View>
                );
              })}
            </View>
          </AnimatedSection>
        ) : isSignedIn ? (
          <AnimatedSection index={3} style={s.section}>
            <LockedSection
              title={t("report.prem.unlockLevers")}
              teaser={t("report.prem.leversHint")}
              ctaLabel={lockedCta.label}
              onPress={lockedCta.onPress}
            >
              <View style={s.card}>
                {sortedRegulators.slice(0, 2).map((r, i) => (
                  <View key={i} style={s.effectRow}>
                    <View style={[s.effectDot, { backgroundColor: palette.muted + "40" }]}>
                      <Text style={{ fontSize: 14 }}>🌿</Text>
                    </View>
                    <View style={s.effectContent}>
                      <Text style={s.effectTitle}>{r.trigger} → ...</Text>
                    </View>
                  </View>
                ))}
              </View>
            </LockedSection>
          </AnimatedSection>
        ) : null
      ) : null}

      {/* ── 5. BEHAVIOUR SNAPSHOT (compact metrics) ── */}
      {bm?.baseline?.reliable ? (
        isPremium ? (
          <AnimatedSection index={4} style={s.section}>
            <SectionHeader label={t("report.prem.snapshot")} badge="weekly" t={t} />
            <View style={s.premMetricGrid}>
              <View style={s.premMetricItem}>
                <Text style={s.premMetricLabel}>{t("report.prem.baseline")}</Text>
                <Text style={s.premMetricValue}>{bm.baseline.score.toFixed(1)}/5</Text>
              </View>
              {bm.recentAverage != null ? (
                <View style={s.premMetricItem}>
                  <Text style={s.premMetricLabel}>{t("report.prem.recentAvg")}</Text>
                  <Text style={s.premMetricValue}>{bm.recentAverage.toFixed(1)}/5</Text>
                </View>
              ) : null}
              {bm.drift ? (
                <View style={s.premMetricItem}>
                  <Text style={s.premMetricLabel}>{t("report.prem.drift")}</Text>
                  <Text style={[s.premMetricValue, { color: bm.drift.value >= 0 ? palette.success : palette.danger }]}>
                    {bm.drift.value > 0 ? "+" : ""}{bm.drift.value.toFixed(1)}
                  </Text>
                </View>
              ) : null}
              {bm.stability ? (
                <View style={s.premMetricItem}>
                  <Text style={s.premMetricLabel}>{t("report.prem.stability")}</Text>
                  <Text style={s.premMetricValue}>{Math.round(bm.stability.score * 100)}%</Text>
                </View>
              ) : null}
              {bm.recoveryLatency ? (
                <View style={s.premMetricItem}>
                  <Text style={s.premMetricLabel}>{t("report.prem.recovery")}</Text>
                  <Text style={s.premMetricValue}>~{bm.recoveryLatency.days}d</Text>
                </View>
              ) : null}
              <View style={s.premMetricItem}>
                <Text style={s.premMetricLabel}>{t("report.prem.daysTracked")}</Text>
                <Text style={s.premMetricValue}>{bm.baseline.daysUsed}</Text>
              </View>
            </View>
          </AnimatedSection>
        ) : isSignedIn ? (
          <AnimatedSection index={4} style={s.section}>
            <LockedSection
              title={t("report.prem.unlockSnapshot")}
              teaser={t("report.prem.snapshotHint")}
              ctaLabel={lockedCta.label}
              onPress={lockedCta.onPress}
            >
              <View style={s.premMetricGrid}>
                <View style={s.premMetricItem}>
                  <Text style={s.premMetricLabel}>{t("report.prem.baseline")}</Text>
                  <Text style={s.premMetricValue}>—</Text>
                </View>
                <View style={s.premMetricItem}>
                  <Text style={s.premMetricLabel}>{t("report.prem.stability")}</Text>
                  <Text style={s.premMetricValue}>—</Text>
                </View>
              </View>
            </LockedSection>
          </AnimatedSection>
        ) : null
      ) : null}

      {/* ── 6. ACTION EFFECTIVENESS (compact) ── */}
      {(triedCount > 0 || skippedCount > 0) ? (
        <AnimatedSection index={5} style={s.section}>
          <SectionHeader label={t("report.prem.effectiveness")} badge="live" t={t} />
          <View style={s.card}>
            <View style={s.metricsRow}>
              <View style={[s.metricCard, { borderLeftWidth: 3, borderLeftColor: palette.success }]}>
                <Text style={s.metricLabel}>{t("report.helped")}</Text>
                <Text style={[s.metricValue, { color: palette.success }]}>{triedCount}</Text>
              </View>
              <View style={[s.metricCard, { borderLeftWidth: 3, borderLeftColor: palette.muted }]}>
                <Text style={s.metricLabel}>{t("report.notHelpful")}</Text>
                <Text style={[s.metricValue, { color: palette.muted }]}>{skippedCount}</Text>
              </View>
            </View>
            <Text style={s.premAdjustingNote}>{t("report.prem.adjusting")}</Text>
          </View>
        </AnimatedSection>
      ) : null}

      {/* ── 7. ADAPTIVE MODES (Move · Fuel · Perspective) ── */}
      {isPremium ? (
        <AnimatedSection index={6} style={s.section}>
          <SectionHeader label={t("report.prem.adaptiveTitle")} badge="live" t={t} />

          {/* Mode sub-tabs */}
          <View style={s.modeTabBar}>
            {["core", "move", "fuel", "perspective"].map((tab) => (
              <Pressable
                key={tab}
                style={[s.modeTab, activeMode === tab && s.modeTabActive]}
                onPress={() => { tap(); setActiveMode(tab); }}
                accessibilityRole="tab"
                accessibilityState={{ selected: activeMode === tab }}
              >
                <Text style={[s.modeTabText, activeMode === tab && s.modeTabTextActive]}>
                  {t(`report.prem.mode.${tab}`)}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Mode content */}
          {activeMode === "core" ? (
            <View style={s.modeContent}>
              <Text style={s.modeContentBody}>{t("report.prem.mode.coreBody")}</Text>
            </View>
          ) : (
            <ModeCards mode={activeMode} data={modes?.[activeMode]} t={t} onFeedback={onModeFeedback} isPremium={isPremium} />
          )}
        </AnimatedSection>
      ) : isSignedIn ? (
        <AnimatedSection index={6} style={s.section}>
          <LockedSection
            title={t("report.prem.unlockModes")}
            teaser={t("report.prem.modesHint")}
            ctaLabel={lockedCta.label}
            onPress={lockedCta.onPress}
          >
            <View style={s.modeTabBar}>
              {["core", "move", "fuel", "perspective"].map((tab) => (
                <View key={tab} style={s.modeTab}>
                  <Text style={s.modeTabText}>{t(`report.prem.mode.${tab}`)}</Text>
                </View>
              ))}
            </View>
          </LockedSection>
        </AnimatedSection>
      ) : null}
    </View>
  );
}

/* ── Main screen ── */

export function WeeklyReportScreen() {
  const { loadWeeklyReport, refreshSession, subscription, user, token, subscribe, deviceId } = useAppSession();
  const router = useRouter();
  const { dominantEmotion } = useEmotionalState();
  const { t, lang } = useLanguage();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [activeTab, setActiveTab] = useState("mirror");
  const [modes, setModes] = useState(null);
  const [progress, setProgress] = useState(null);

  const isSignedIn = Boolean(user && token);
  const isPremium = subscription?.status === "active" || subscription?.status === "grace_period";

  const callbacksRef = useRef({});
  callbacksRef.current = { loadWeeklyReport, refreshSession, token, isPremium, isSignedIn };
  const reportRef = useRef(null);
  reportRef.current = report;

  const load = useCallback(async (isRetry = false) => {
    if (isRetry && reportRef.current) { setError(""); } else { setLoading(true); setError(""); }
    try {
      const nextReport = await callbacksRef.current.loadWeeklyReport(lang);
      setReport(nextReport);
    } catch {
      if (!reportRef.current) setReport(null);
      setError(t("report.unableToLoad"));
    } finally { setLoading(false); }
  }, []);

  useFocusEffect(useCallback(() => {
    load();
    const { token: t, refreshSession: rs, isPremium: p, isSignedIn: si } = callbacksRef.current;
    if (t) rs().catch(() => null);
    trackEvent("report_screen_viewed", { tier: p ? "premium" : si ? "signed" : "anonymous" });
  }, [load]));

  // Load adaptive modes for premium users
  useEffect(() => {
    if (isPremium && token && !modes) {
      fetchModes(token).then(setModes).catch(() => null);
    }
  }, [isPremium, token]);

  // Load progress metrics
  useEffect(() => {
    if (token || deviceId) {
      fetchProgress(token, deviceId)
        .then((res) => setProgress(res?.progress || null))
        .catch(() => null);
    }
  }, [token, deviceId]);

  const handleModeFeedback = useCallback((mode, itemId, response) => {
    if (token) {
      submitModeFeedback(mode, itemId, response, token).catch(() => null);
      trackEvent("mode_feedback", { mode, itemId, response });
    }
  }, [token]);

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
        Alert.alert(t("premium.subscriptionUnavailable"), t("report.subscriptionUnavailableMsg"));
      } else {
        Alert.alert(t("report.upgradeError"), msg || t("report.somethingWrong"));
      }
    } finally { setPurchasing(false); }
  }

  return (
    <ScreenShell
      loading={loading}
      loadingTitle={t("report.buildingReport")}
      loadingMessage={t("report.buildingReportMsg")}
      timeoutMessage={t("report.unableToLoad")}
      onRetry={() => load(true)}
      scroll
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={s.canvas}>
        <Image source={require("@/assets/report-bg.png")} style={s.bgImage} resizeMode="cover" accessible={false} />

        <View style={s.content}>

          {/* Hero header */}
          <View style={s.header}>
            <Text style={s.kicker}>{t("report.weeklyPatterns")}</Text>
            <Text style={s.title}>{t("report.yourWeek")}</Text>
            {report?.totalMoments ? (
              <Text style={s.subtitle}>
                {report.totalMoments !== 1
                  ? t("report.momentsSummaryPlural", { moments: report.totalMoments, days: dq.daysLogged || "-" })
                  : t("report.momentsSummary", { moments: report.totalMoments, days: dq.daysLogged || "-" })}
              </Text>
            ) : null}
            {report?.totalMoments ? (
              <View style={s.heroRow}>
                <View style={s.heroPill}>
                  <Text style={s.heroPillEmoji}>{report.topEmotion ? (EMOTION_EMOJIS[report.topEmotion] || "•") : "🌀"}</Text>
                  <Text style={[s.heroPillLabel, report.topEmotion && { color: EMOTION_COLORS[report.topEmotion] }]}>
                    {report.topEmotion || t("report.mixedEmotion")}
                  </Text>
                </View>
                <View style={s.heroPill}>
                  <Text style={s.heroPillEmoji}>🎯</Text>
                  <Text style={[s.heroPillLabel, report.topTrigger && { color: TRIGGER_COLORS[report.topTrigger] || palette.accent }]}>
                    {report.topTrigger || (report.tiedTriggers?.length > 1 ? t("report.areasCount", { count: report.tiedTriggers.length }) : "-")}
                  </Text>
                </View>
                <View style={[s.heroPill, s.confidencePill]}>
                  <Text style={s.heroPillLabel}>{getConfidenceLabel(confidence, t)}</Text>
                </View>
              </View>
            ) : null}
          </View>

          {error ? (
            <View style={s.stateCard}>
              <Text style={s.stateTitle}>{t("report.reportUnavailable")}</Text>
              <Text style={s.stateBody}>{error}</Text>
              <PrimaryButton label={t("report.retry")} onPress={() => load(true)} />
            </View>
          ) : null}

          {report && !error && confidence === "too_early" ? (
            <View style={s.starterCard}>
              <Text style={s.starterEmoji}>🌱</Text>
              <Text style={s.starterTitle}>{isSignedIn ? t("report.starterSignedIn") : t("report.starterAnon")}</Text>
              <Text style={s.starterBody}>
                {isSignedIn ? t("report.starterBodySignedIn") : t("report.starterBodyAnon")}
              </Text>
              {!isSignedIn ? (
                <>
                  <PrimaryButton label={t("report.signInDeeper")} onPress={handleSignIn} />
                  <Pressable style={s.nudgeSecondary} onPress={() => router.push("/(tabs)/log")} accessibilityRole="button">
                    <Text style={s.nudgeSecondaryText}>{t("report.logMoment")}</Text>
                  </Pressable>
                </>
              ) : (
                <PrimaryButton label={t("report.logMoment")} onPress={() => router.push("/(tabs)/log")} />
              )}
            </View>
          ) : null}

          {report && !error && confidence !== "too_early" ? (
            <>
              {/* Tab bar */}
              <TabBar activeTab={activeTab} onTabChange={setActiveTab} t={t} />

              {/* Tab content */}
              {activeTab === "mirror" ? (
                <MirrorTab report={report} dq={dq} confidence={confidence} isSignedIn={isSignedIn} handleSignIn={handleSignIn} t={t} />
              ) : activeTab === "week" ? (
                <ThisWeekTab report={report} dq={dq} confidence={confidence} isSignedIn={isSignedIn} handleSignIn={handleSignIn} router={router} t={t} />
              ) : activeTab === "progress" ? (
                <ProgressTab
                  progress={progress} isSignedIn={isSignedIn} isPremium={isPremium}
                  handleSignIn={handleSignIn} handleUpgrade={handleUpgrade} purchasing={purchasing} t={t}
                />
              ) : activeTab === "actions" ? (
                <ActionsTab report={report} deviceId={deviceId} token={token} t={t} />
              ) : (
                <PremiumTab
                  report={report} dq={dq} confidence={confidence}
                  isSignedIn={isSignedIn} isPremium={isPremium}
                  hasLlmInsight={hasLlmInsight} hasLlmTeaser={hasLlmTeaser}
                  handleSignIn={handleSignIn} handleUpgrade={handleUpgrade}
                  purchasing={purchasing} subscription={subscription} t={t}
                  modes={modes} onModeFeedback={handleModeFeedback}
                />
              )}
            </>
          ) : null}

          {!report && !loading && !error ? (
            <View style={[s.stateCard, s.emptyStateCard]}>
              <Image source={require("@/assets/report-empty.png")} style={s.emptyIllustration} resizeMode="contain" accessible={false} />
              <Text style={s.stateTitle}>{t("report.firstInsight")}</Text>
              <Text style={s.stateBody}>{t("report.firstInsightBody")}</Text>
              <PrimaryButton label={t("report.logMoment")} onPress={() => router.push("/(tabs)/log")} />
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
    flex: 1, alignItems: "center", paddingVertical: 11,
    borderRadius: radius.sm, borderWidth: 1.5,
  },
  actionBtnHelped: {
    backgroundColor: "rgba(94, 230, 160, 0.15)",
    borderColor: "rgba(94, 230, 160, 0.45)",
  },
  actionBtnNotHelpful: {
    backgroundColor: "rgba(255, 179, 71, 0.12)",
    borderColor: "rgba(255, 179, 71, 0.35)",
  },
  actionBtnHelpedText: { fontSize: 13, fontWeight: "700", color: "#5ee6a0" },
  actionBtnNotHelpfulText: { fontSize: 13, fontWeight: "700", color: "#ffb347" },
  actionFeedbackDone: {
    alignItems: "center", paddingVertical: 10, borderRadius: radius.sm, marginTop: 4,
  },
  actionFeedbackDoneText: { fontSize: 13, fontWeight: "600" },

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

  /* Drivers */
  driverRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  driverTrigger: { fontSize: 14, fontWeight: "700", textTransform: "capitalize" },
  driverEmotion: { color: palette.textSecondary, fontSize: 12, textTransform: "capitalize" },
  effectBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, borderWidth: 1 },
  effectBadgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },

  /* Behavioral loop */
  loopCard: {
    borderRadius: radius.md, padding: 14, gap: 8,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
    borderLeftWidth: 3,
  },
  loopFlow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
  loopNode: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: radius.pill },
  loopNodeText: { fontSize: 12, fontWeight: "700" },
  loopArrow: { color: palette.muted, fontSize: 16, fontWeight: "700" },
  loopMeta: { color: palette.muted, fontSize: 11 },

  /* Deeper signals */
  signalRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 6 },
  signalIcon: { fontSize: 18, marginTop: 1 },
  signalLabel: { fontSize: 13, fontWeight: "700" },
  signalBody: { color: palette.textSecondary, fontSize: 12, lineHeight: 17 },

  /* Premium tab — decision cards */
  premBadge: {
    alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill, backgroundColor: palette.accentSoft,
    borderWidth: 1, borderColor: palette.accentMedium,
  },
  premBadgeText: { color: palette.accent, fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  premDirectionCard: {
    borderRadius: radius.md, padding: 18, gap: 8,
    backgroundColor: palette.card,
    borderWidth: 1, borderColor: palette.accentMedium,
    borderLeftWidth: 4, borderLeftColor: palette.accent,
  },
  premDirectionKicker: {
    color: palette.accent, fontSize: 10, fontWeight: "800", letterSpacing: 1.4, textTransform: "uppercase",
  },
  premDirectionText: { color: palette.text, fontSize: 15, fontWeight: "600", lineHeight: 22 },
  premDirectionHint: { color: palette.muted, fontSize: 11, lineHeight: 16, marginTop: 2 },
  premTeaserNote: { color: palette.textSecondary, fontSize: 12, fontStyle: "italic", textAlign: "center", marginTop: 4 },
  premSignalGrid: { gap: 8 },
  premSignalCard: {
    borderRadius: radius.md, padding: 14, gap: 4,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
    borderLeftWidth: 3,
  },
  premSignalIcon: { fontSize: 16 },
  premSignalLabel: { fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase" },
  premSignalBody: { color: palette.textSecondary, fontSize: 13, lineHeight: 18 },
  premHelpedBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: radius.pill,
    backgroundColor: "rgba(94, 230, 160, 0.15)", borderWidth: 1, borderColor: "rgba(94, 230, 160, 0.35)",
  },
  premHelpedBadgeText: { color: "#5ee6a0", fontSize: 10, fontWeight: "700" },
  premMetricGrid: {
    flexDirection: "row", flexWrap: "wrap", gap: 8,
    backgroundColor: palette.glass, borderRadius: radius.md,
    borderWidth: 1, borderColor: palette.glassBorder, padding: 12,
  },
  premMetricItem: { width: "30%", gap: 2, alignItems: "center", paddingVertical: 8 },
  premMetricLabel: { color: palette.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", textAlign: "center" },
  premMetricValue: { color: palette.text, fontSize: 18, fontWeight: "700" },
  premAdjustingNote: { color: palette.muted, fontSize: 11, fontStyle: "italic", marginTop: 4 },

  /* Adaptive modes */
  modeTabBar: {
    flexDirection: "row", gap: 4,
    backgroundColor: palette.glass, borderRadius: radius.md,
    borderWidth: 1, borderColor: palette.glassBorder, padding: 4,
  },
  modeTab: {
    flex: 1, alignItems: "center", paddingVertical: 8,
    borderRadius: radius.sm,
  },
  modeTabActive: {
    backgroundColor: palette.accentSoft, borderWidth: 1, borderColor: palette.accentMedium,
  },
  modeTabText: { color: palette.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.4 },
  modeTabTextActive: { color: palette.accent },
  modeContent: { gap: 10 },
  modeContentBody: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
  modeNarrative: { color: palette.text, fontSize: 14, lineHeight: 21 },
  modeCardsScroll: { gap: 10, paddingVertical: 4 },
  modeCard: {
    width: 260, borderRadius: radius.md, padding: 16, gap: 8,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
    borderLeftWidth: 3, borderLeftColor: palette.accent,
  },
  modeCardTitle: { color: palette.text, fontSize: 15, fontWeight: "700" },
  modeCardDesc: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
  modeCardMeta: { color: palette.muted, fontSize: 11, fontWeight: "600", textTransform: "capitalize" },
  modeFeedbackRow: { flexDirection: "row", gap: 8, marginTop: 4 },
  modeFeedbackBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.sm, borderWidth: 1.5,
  },
  modeFeedbackHelpful: {
    backgroundColor: "rgba(94, 230, 160, 0.12)", borderColor: "rgba(94, 230, 160, 0.35)",
  },
  modeFeedbackNot: {
    backgroundColor: "rgba(255, 179, 71, 0.10)", borderColor: "rgba(255, 179, 71, 0.30)",
  },
  modeFeedbackHelpfulText: { color: "#5ee6a0", fontSize: 12, fontWeight: "700" },
  modeFeedbackNotText: { color: "#ffb347", fontSize: 12, fontWeight: "700" },
  modeFeedbackDone: { paddingVertical: 6, marginTop: 2 },
  modeFeedbackDoneText: { color: palette.muted, fontSize: 11, fontWeight: "600" },
  modeFooter: { color: palette.textSecondary, fontSize: 11, fontStyle: "italic", textAlign: "right" },

  /* ── Progress tab ── */
  progressArc: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 20, paddingHorizontal: 8, gap: 0,
  },
  progressArcNode: { alignItems: "center", gap: 4, width: 80 },
  progressArcConnector: {
    flex: 1, flexDirection: "row", alignItems: "center", marginHorizontal: -4,
  },
  progressArcLine: { flex: 1, height: 2, backgroundColor: palette.glassBorder },
  progressArcEmoji: { fontSize: 22 },
  progressArcScore: { color: palette.text, fontSize: 18, fontWeight: "800" },
  progressArcLabel: { color: palette.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase" },
  progressArcDelta: {
    alignSelf: "center", flexDirection: "row", alignItems: "center",
    backgroundColor: "rgba(94,230,160,0.12)", borderRadius: radius.pill,
    paddingHorizontal: 10, paddingVertical: 4, marginTop: 8,
  },
  progressArcDeltaText: { fontSize: 12, fontWeight: "700" },
  progressDirectionBadge: {
    alignSelf: "center", borderRadius: radius.pill,
    paddingHorizontal: 12, paddingVertical: 5, marginTop: 6,
  },
  progressDirectionText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4 },
  progressMetricsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  progressMetricCard: {
    flex: 1, minWidth: "45%", borderRadius: radius.md, padding: 12, gap: 6,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
  },
  progressMetricHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  progressMetricIcon: { fontSize: 16 },
  progressMetricLabel: { color: palette.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  progressThenNow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  progressThenNowItem: { alignItems: "center", gap: 1 },
  progressThenNowLabel: { color: palette.muted, fontSize: 8, fontWeight: "700", textTransform: "uppercase" },
  progressThenNowValue: { color: palette.text, fontSize: 16, fontWeight: "800" },
  progressThenNowArrow: { color: palette.muted, fontSize: 14, marginHorizontal: 2 },
  progressTrendBadge: {
    alignSelf: "flex-start", borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 2, marginTop: 2,
  },
  progressTrendBadgeText: { fontSize: 9, fontWeight: "800", letterSpacing: 0.3 },
  progressShiftGroup: { gap: 6 },
  progressShiftGroupLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 0.4, textTransform: "uppercase" },
  progressShiftItem: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: palette.glass, borderRadius: radius.sm, padding: 10,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  progressShiftPair: { color: palette.text, fontSize: 13, fontWeight: "600" },
  progressShiftCount: { color: palette.muted, fontSize: 11, fontWeight: "700" },
  progressAttrCard: {
    borderRadius: radius.md, padding: 12, gap: 4,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
  },
  progressAttrHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  progressAttrLabel: { color: palette.text, fontSize: 13, fontWeight: "700" },
  progressAttrTrigger: { color: palette.accent, fontSize: 13, fontWeight: "700" },
  progressAttrNote: { color: palette.textSecondary, fontSize: 12, lineHeight: 17 },
  progressWeekScroll: { gap: 8, paddingVertical: 4 },
  progressWeekCard: {
    width: 120, borderRadius: radius.md, padding: 12, gap: 4, alignItems: "center",
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
  },
  progressWeekLabel: { color: palette.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  progressWeekEmoji: { fontSize: 20 },
  progressWeekScore: { color: palette.text, fontSize: 18, fontWeight: "800" },
  progressWeekMeta: { color: palette.muted, fontSize: 10, fontWeight: "600" },
  progressWeekMoments: { color: palette.textSecondary, fontSize: 10 },
  progressWeekDate: { color: palette.muted, fontSize: 9 },
});
