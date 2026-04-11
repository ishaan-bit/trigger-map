import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { LineChart, BarChart } from "react-native-chart-kit";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { GuidedTooltip } from "@/components/SpotlightOverlay";
import { useAppSession } from "@/hooks/useAppSession";
import { useOnboarding } from "@/hooks/useOnboarding";
import { submitActionFeedback, fetchModes, submitModeFeedback, fetchProgress } from "@/services/api";
import { trackEvent } from "@/services/analyticsService";
import { palette, radius } from "@/utils/theme";
import { tap, selection } from "@/utils/haptics";
import { TRIGGER_COLORS, EMOTION_COLORS as DS_EMOTION_COLORS, emotionStyle, triggerStyle, STAGGER_DELAY } from "@/utils/designSystem";
import { useEmotionalState } from "@/hooks/useEmotionalState";
import { useLanguage } from "@/i18n/LanguageContext";
import { emotionColor as getFieldColor } from "@/utils/emotionModel";
import { MOVEMENTS, EQUIPMENT, filterMovements, pickMovements } from "@triggermap/shared";
import { NOURISHMENTS, DIETS, filterNourishments, pickNourishments } from "@triggermap/shared";

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

  const headerPatterns = [
    /(?:what (?:stood|stands) out|(?:most )?notable pattern[s]?|क्या ख़ास रहा)/i,
    /(?:what may be contributing|(?:possible|potential|likely) (?:cause|contributing factor)[s]?|क्या कारण हो सकता है)/i,
    /(?:one thing to try|something (?:to try|worth trying)|try this|suggestion|action\s*(?:item|step)|एक बात आज़माएँ)/i,
  ];

  const stripHeader = (s) => s.replace(/^[ \t]*(?:\d+[.)]\s*)?(?:what stood out|what (?:stands|stood) out|(?:most )?notable pattern[s]?|what may be contributing|(?:possible|potential|likely) (?:cause|contributing factor)[s]?|one thing to try|something (?:to try|worth trying)|try this|suggestion|action\s*(?:item|step)|क्या ख़ास रहा|क्या कारण हो सकता है|एक बात आज़माएँ)[:\s]*/i, "").trim();

  // Primary: split by double-newline (matches backend storage format)
  const chunks = text.split(/\n\s*\n/).filter(Boolean);
  if (chunks.length >= 3) {
    const result = [null, null, null];
    const assigned = new Set();
    for (const chunk of chunks) {
      const firstLine = chunk.split("\n")[0];
      const idx = headerPatterns.findIndex((p, i) => !assigned.has(i) && p.test(firstLine));
      if (idx >= 0) {
        assigned.add(idx);
        const body = stripHeader(chunk);
        result[idx] = body.length >= 5 ? body : null;
      }
    }
    // Post-process: check if an assigned chunk secretly contains an unassigned header mid-text
    if (assigned.size >= 2) {
      const unassigned = [0, 1, 2].filter((i) => !assigned.has(i));
      for (const missing of unassigned) {
        const inlineRe = headerPatterns[missing];
        for (const filled of [...assigned]) {
          if (!result[filled]) continue;
          const match = inlineRe.exec(result[filled]);
          if (match) {
            const before = result[filled].slice(0, match.index).trim();
            const after = stripHeader(result[filled].slice(match.index)).trim();
            if (before.length >= 5 && after.length >= 5) {
              result[filled] = before;
              result[missing] = after;
              assigned.add(missing);
              break;
            }
          }
        }
      }
      return result;
    }
  }

  // Secondary: scan for header positions within the text
  const headerRe = /^[ \t]*(?:\d+[.)]\s*)?(?:what stood out|what (?:stands|stood) out|(?:most )?notable pattern[s]?|what may be contributing|(?:possible|potential|likely) (?:cause|contributing factor)[s]?|one thing to try|something (?:to try|worth trying)|try this|suggestion|action\s*(?:item|step)|क्या ख़ास रहा|क्या कारण हो सकता है|एक बात आज़माएँ)[ \t]*:?/gmi;
  const hits = [];
  let m;
  while ((m = headerRe.exec(text)) !== null) {
    const section = headerPatterns.findIndex((p) => p.test(m[0]));
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
    // If only 2 hits found, try splitting the longest section into 2
    if (firstHits.length === 2) {
      const missing = [0, 1, 2].find((i) => result[i] === null);
      const longest = result[0] && result[1] ? (result[0].length > result[1].length ? 0 : 1) : (result[0] ? 0 : (result[1] ? 1 : 2));
      if (missing != null && result[longest] && result[longest].length > 40) {
        const sentences = result[longest].split(/(?<=[.!?\u0964])\s+/);
        if (sentences.length >= 2) {
          const mid = Math.ceil(sentences.length / 2);
          const first = sentences.slice(0, mid).join(" ");
          const second = sentences.slice(mid).join(" ");
          result[longest] = first;
          result[missing] = second;
        }
      }
    }
    return result;
  }

  // Fallback: split on paragraph breaks, then try sentence-based splitting
  let fallbackChunks = text.split(/\n\s*\n/).filter(Boolean);
  if (fallbackChunks.length < 3) {
    const sentences = text.split(/(?<=[.!?\u0964])\s+/).filter(s => s.length > 5);
    if (sentences.length >= 3) {
      const perChunk = Math.ceil(sentences.length / 3);
      fallbackChunks = [
        sentences.slice(0, perChunk).join(" "),
        sentences.slice(perChunk, perChunk * 2).join(" "),
        sentences.slice(perChunk * 2).join(" "),
      ].filter(Boolean);
    }
  }
  fallbackChunks = fallbackChunks.slice(0, 3);
  return [
    stripHeader(fallbackChunks[0] || text),
    fallbackChunks[1] ? stripHeader(fallbackChunks[1]) : null,
    fallbackChunks[2] ? stripHeader(fallbackChunks[2]) : null,
  ];
}

function getInsightSectionMeta(t) {
  return [
    { icon: "🔍", label: t("report.insightStoodOut"), color: palette.accent },
    { icon: "🧩", label: t("report.insightContributing"), color: palette.purple },
    { icon: "💡", label: t("report.insightTryThis"), color: palette.success },
  ];
}

function PastInsightExpanded({ narrative, t }) {
  const sections = parseLlmSections(narrative);
  if (!sections || sections.every((s) => !s)) {
    return <Text style={s.pastInsightPreview}>{cleanText(narrative || "")}</Text>;
  }
  const meta = getInsightSectionMeta(t);
  return (
    <View style={{ gap: 14 }}>
      {sections.map((body, idx) => {
        if (!body) return null;
        const m = meta[idx] || {};
        return (
          <View key={idx} style={{ gap: 4 }}>
            <Text style={{ color: palette.accent, fontSize: 13, fontWeight: "700" }}>
              {m.icon ? m.icon + " " : ""}{m.label || ""}
            </Text>
            <Text style={s.pastInsightPreview}>{cleanText(body)}</Text>
          </View>
        );
      })}
    </View>
  );
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

function emotionDisplay(key, t) {
  const mapped = t ? t("emotions." + key) : null;
  return mapped && mapped !== "emotions." + key ? mapped : capitalize(key);
}

function localeDateStr(dateStr, lang, opts) {
  if (!dateStr) return "";
  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  return new Date(dateStr).toLocaleDateString(locale, opts || { day: "numeric", month: "short" });
}

function scoreTone(score, t) {
  if (score >= 4.2) return { emoji: "🌟", label: t ? t("report.toneGreat") : "Great", color: "#a78bfa" };
  if (score >= 3.5) return { emoji: "😌", label: t ? t("report.toneGood") : "Good", color: "#5ee6a0" };
  if (score >= 2.8) return { emoji: "😐", label: t ? t("report.toneMixed") : "Mixed", color: "#9eb0c9" };
  if (score >= 2)   return { emoji: "😟", label: t ? t("report.toneUneasy") : "Uneasy", color: "#ffb347" };
  return { emoji: "😤", label: t ? t("report.toneTough") : "Tough", color: "#ff6b7a" };
}

/* ── Color-coded text: highlights trigger/emotion words in any prose ── */

let _colorWordMap = null;
function buildColorWordMap(t) {
  if (_colorWordMap && _colorWordMap._lang === (t?._lang || "")) return _colorWordMap;
  const map = {};
  for (const [key, color] of Object.entries(TRIGGER_COLORS)) {
    map[key.toLowerCase()] = color;
    const display = triggerDisplay(key, t);
    if (display) map[display.toLowerCase()] = color;
  }
  for (const [key, color] of Object.entries(EMOTION_COLORS)) {
    map[key.toLowerCase()] = color;
    const display = emotionDisplay(key, t);
    if (display) map[display.toLowerCase()] = color;
  }
  map._lang = t?._lang || "";
  _colorWordMap = map;
  return map;
}

function renderColoredText(text, t, baseStyle) {
  if (!text) return null;
  const colorMap = buildColorWordMap(t);
  const words = Object.keys(colorMap).filter(k => k !== "_lang" && k.length > 1).sort((a, b) => b.length - a.length);
  if (!words.length) return <Text style={baseStyle}>{text}</Text>;
  const escaped = words.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  const parts = text.split(re);
  if (parts.length === 1) return <Text style={baseStyle}>{text}</Text>;
  return (
    <Text style={baseStyle}>
      {parts.map((part, i) => {
        const color = colorMap[part.toLowerCase()];
        return color
          ? <Text key={i} style={{ color, fontWeight: "600" }}>{part}</Text>
          : <Text key={i}>{part}</Text>;
      })}
    </Text>
  );
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
                <Text style={{ color: EMOTION_COLORS[item.emotion] || palette.textSecondary, fontWeight: "600" }}>{t("emotions." + item.emotion) || item.emotion}</Text>
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.tabBar}>
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
    </ScrollView>
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

function MirrorTab({ report, dq, confidence, isSignedIn, handleSignIn, t, lang }) {
  const bm = report?.baselineMetrics;
  const insight = report?.aiInsight;
  const drivers = insight?.drivers;
  const loops = insight?.behavioralLoop;
  const direction = insight?.actionableDirection;
  const whereToFocus = insight?.whereToFocus;
  const whatWorking = insight?.whatWorking;
  const invoked = report?.invokedMetrics;
  const compound = report?.compoundPatterns;
  const tone = bm?.recentAverage != null ? scoreTone(bm.recentAverage, t) : null;
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [expandedInsight, setExpandedInsight] = useState(null);

  return (
    <View style={s.tabContent}>
      {/* Current State */}
      {bm?.stateOfMind ? (
        <AnimatedSection index={0} style={s.section}>
          <SectionHeader label={t("report.currentState")} badge="weekly" t={t} />
          <View style={[s.stateOfMindCard, tone && { borderLeftColor: tone.color, borderColor: tone.color + "40" }]}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={[s.stateOfMindText, tone && { color: tone.color }]}>{tone ? tone.emoji + " " : ""}{capitalize(bm.stateOfMind)}</Text>
              {bm.baselineDeltas?.deltaDrift != null ? (
                <DeltaChip value={bm.baselineDeltas.deltaDrift} />
              ) : null}
            </View>
            {bm.baseline?.reliable ? (
              <Text style={s.stateOfMindSub}>
                {t("report.baselineText", { baselineScore: bm.baseline.score.toFixed(1), weekScore: bm.recentAverage?.toFixed(1) || "-" })}
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
                    {d.emotion ? <Text style={s.driverEmotion}>{t("emotions." + d.emotion) || d.emotion} · {d.count}×</Text> : <Text style={s.driverEmotion}>{d.count}×</Text>}
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
                    <Text style={[s.loopNodeText, { color: emoColor }]}>{EMOTION_EMOJIS[loop.emotion] || "•"} {t("emotions." + loop.emotion) || loop.emotion}</Text>
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
      {(compound?.falseRecovery || compound?.crashRisk || (invoked?.weeklyMasking?.level && invoked.weeklyMasking.level !== "none")) ? (
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

      {/* Inner State — Vacuum state score + drift */}
      {invoked?.currentVacuum != null ? (
        <AnimatedSection index={4} style={s.section}>
          <SectionHeader label={t("report.innerState")} badge="weekly" t={t} />
          <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: palette.purple }]}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View style={{ gap: 2 }}>
                <Text style={{ color: palette.text, fontSize: 16, fontWeight: "700" }}>
                  {scoreTone(invoked.currentVacuum, t).emoji} {t("report.vacuumScoreValue", { score: invoked.currentVacuum.toFixed(1) })}
                </Text>
                <Text style={{ color: palette.textSecondary, fontSize: 12 }}>{t("report.vacuumScore")}</Text>
              </View>
              {invoked.vacuumDrift != null ? (
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <DeltaChip value={invoked.vacuumDrift} />
                  <Text style={{ color: palette.muted, fontSize: 11 }}>
                    {invoked.vacuumDrift > 0.15 ? t("report.vacuumDriftRising") : invoked.vacuumDrift < -0.15 ? t("report.vacuumDriftFalling") : t("report.vacuumDriftStable")}
                  </Text>
                </View>
              ) : null}
            </View>
            <Text style={{ color: palette.muted, fontSize: 11, marginTop: 6 }}>{t("report.vacuumExplainer")}</Text>
          </View>
        </AnimatedSection>
      ) : null}

      {/* Context Bleed — emotional carry-over between triggers */}
      {invoked?.contamination?.length > 0 ? (
        <AnimatedSection index={5} style={s.section}>
          <SectionHeader label={t("report.contextBleed")} badge="weekly" t={t} />
          <View style={s.card}>
            {invoked.contamination.slice(0, 3).map((c, i) => (
              <View key={i} style={[s.signalRow, i > 0 && { borderTopWidth: 1, borderTopColor: palette.glassBorder, paddingTop: 8, marginTop: 4 }]}>
                <Text style={{ fontSize: 16 }}>🔗</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: palette.text, fontSize: 13, fontWeight: "600" }}>
                    {t("report.contextBleedBody", { source: triggerDisplay(c.sourceTrigger, t), target: c.affectedTriggers.map(tr => triggerDisplay(tr, t)).join(", ") })}
                  </Text>
                </View>
              </View>
            ))}
            <Text style={{ color: palette.muted, fontSize: 11, marginTop: 6 }}>{t("report.contextBleedExplainer")}</Text>
          </View>
        </AnimatedSection>
      ) : null}

      {/* Actionable Direction */}
      {direction ? (
        <AnimatedSection index={6} style={s.section}>
          <SectionHeader label={t("report.direction")} badge="weekly" t={t} />
          <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: tone?.color || palette.accent }]}>
            {renderColoredText(direction, t, { color: palette.text, fontSize: 14, lineHeight: 21 })}
          </View>
        </AnimatedSection>
      ) : null}

      {/* What's Working / Where to Focus */}
      {(whatWorking?.length || whereToFocus?.length) ? (
        <AnimatedSection index={5} style={s.section}>
          {whatWorking?.length ? (
            <>
              <Text style={s.sectionTitle}>{t("report.whatWorking")}</Text>
              <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: palette.success, marginBottom: 8 }]}>
                {whatWorking.slice(0, 3).map((item, i) => (
                  <View key={i}>{renderColoredText(item.text, t, { color: palette.text, fontSize: 13, lineHeight: 19 })}</View>
                ))}
              </View>
            </>
          ) : null}
          {whereToFocus?.length ? (
            <>
              <Text style={s.sectionTitle}>{t("report.whereToFocus")}</Text>
              <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: palette.warning }]}>
                {whereToFocus.slice(0, 3).map((item, i) => (
                  <View key={i}>{renderColoredText(item.text, t, { color: palette.text, fontSize: 13, lineHeight: 19 })}</View>
                ))}
              </View>
            </>
          ) : null}
        </AnimatedSection>
      ) : null}

      {/* Confidence */}
      <AnimatedSection index={6} style={s.section}>
        <Text style={s.sectionTitle}>{t("report.confidenceLabel")}</Text>
        <View style={s.card}>
          <Text style={s.aiSummary}>{getConfidenceLabel(confidence, t)}</Text>
          <Text style={{ color: palette.muted, fontSize: 11 }}>
            {t("report.basedOnMoments", { moments: report?.mirror?.totalMoments || dq.totalMoments || 0, days: report?.mirror?.daysLogged || dq.daysLogged || 0 })}
          </Text>
        </View>
      </AnimatedSection>

      {!isSignedIn ? (
        <View style={{ marginTop: 8 }}>
          <PrimaryButton label={t("report.signInDeepen")} onPress={handleSignIn} />
        </View>
      ) : null}

      {/* Past Insights Archive — at bottom of Mirror tab */}
      {report?.insightHistory?.length > 0 ? (
        <AnimatedSection index={8} style={s.section}>
          <SectionHeader label={t("report.prem.pastInsights")} badge="archive" t={t} />
          <View style={s.pastInsightsList}>
            {(historyExpanded ? report.insightHistory : report.insightHistory.slice(0, 3)).map((entry, idx) => {
              const isOpen = expandedInsight === (entry.generatedAt || idx);
              const preview = (entry.narrative || "").split(/\n\s*\n/)[0] || entry.narrative || "";
              return (
                <Pressable
                  key={entry.generatedAt || idx}
                  style={[s.pastInsightCard, isOpen && { borderColor: palette.accent + "60" }]}
                  onPress={() => { tap(); setExpandedInsight(isOpen ? null : (entry.generatedAt || idx)); }}
                  accessibilityRole="button"
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <Text style={s.pastInsightDate}>
                      {entry.weekLabel || (entry.generatedAt ? localeDateStr(entry.generatedAt, lang) : "")}
                    </Text>
                    <Text style={{ color: palette.muted, fontSize: 12 }}>{isOpen ? "▲" : "▼"}</Text>
                  </View>
                  {isOpen ? (
                    <PastInsightExpanded narrative={entry.narrative} t={t} />
                  ) : (
                    <Text style={s.pastInsightPreview} numberOfLines={2}>{cleanText(preview)}</Text>
                  )}
                  {entry.sectionCount && !isOpen ? (
                    <Text style={s.pastInsightMeta}>
                      {entry.sectionCount} {entry.sectionCount === 1 ? "section" : "sections"}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
            {report.insightHistory.length > 3 ? (
              <Pressable
                style={s.pastInsightToggle}
                onPress={() => { tap(); setHistoryExpanded((v) => !v); }}
                accessibilityRole="button"
              >
                <Text style={s.pastInsightToggleText}>
                  {historyExpanded ? t("report.prem.showLess") : t("report.prem.showMore", { count: report.insightHistory.length - 3 })}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </AnimatedSection>
      ) : null}
    </View>
  );
}

/* ── Tab 2: This Week (temporal) ── */

function ThisWeekTab({ report, dq, isSignedIn, handleSignIn, router, t, lang }) {
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
            {renderColoredText(cleanText(report.aiInsight.summary), t, s.summaryText)}
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

      {/* Internal Signal — evoked vs invoked summary */}
      {report?.invokedMetrics?.weeklyInvokedAvg != null ? (() => {
        const avg = report.invokedMetrics.weeklyInvokedAvg;
        const absAvg = Math.abs(avg);
        const signalText = absAvg > 0.4 ? t("report.internalDriven") : absAvg < 0.15 ? t("report.externalDriven") : t("report.mixedDriven");
        const signalColor = avg > 0.3 ? palette.success : avg < -0.3 ? palette.warning : palette.accent;
        const signalIcon = avg > 0.3 ? "🧘" : avg < -0.3 ? "⚡" : "⚖️";
        return (
          <AnimatedSection index={1} style={s.section}>
            <SectionHeader label={t("report.internalSignal")} badge="weekly" t={t} />
            <View style={[s.card, { borderLeftWidth: 3, borderLeftColor: signalColor }]}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 18 }}>{signalIcon}</Text>
                <Text style={{ color: palette.text, fontSize: 13, lineHeight: 19, flex: 1 }}>{signalText}</Text>
              </View>
              <Text style={{ color: palette.muted, fontSize: 11, marginTop: 4 }}>
                {t("report.invokedAvgLabel", { value: (avg > 0 ? "+" : "") + avg.toFixed(2) })}
              </Text>
            </View>
          </AnimatedSection>
        );
      })() : null}

      {/* Emotional trajectory */}
      {report.weeklyEmotionTrajectory?.length >= 1 ? (
        <AnimatedSection index={2} style={s.section}>
          <SectionHeader label={t("report.emotionalTone")} badge="live" t={t} />
          <View style={s.card}>
            <Text style={s.trajectoryHint}>
              {report.weeklyEmotionTrajectory.length === 1 ? t("report.toneFromDays") : t("report.toneShifted")}
            </Text>
            {report.trajectoryNote ? renderColoredText(cleanText(report.trajectoryNote), t, s.trajectoryNote) : null}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.trajectoryScroll}>
              {report.weeklyEmotionTrajectory.map((day) => {
                const tone = scoreTone(day.score, t);
                return (
                  <Pressable style={[s.trajectoryDay, { borderColor: tone.color + "30" }]} key={day.date} onPress={() => selection()}>
                    <Text style={s.trajectoryEmoji}>{tone.emoji}</Text>
                    <Text style={[s.trajectoryLabel, { color: tone.color }]}>{tone.label}</Text>
                    <Text style={s.trajectoryDate}>{new Date(day.date).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "short" })}</Text>
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
                    <Text style={s.trajectoryDate}>{new Date(day.date).toLocaleDateString(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "short" })}</Text>
                  </View>
                );
              })}
            </ScrollView>
          </View>
        </AnimatedSection>
      ) : null}

      {/* Emotions breakdown — circular gradient wheel + bar legend */}
      {emotionEntries.length ? (
        <AnimatedSection index={3} style={s.section}>
          <SectionHeader label={t("report.emotionsTitle")} badge="live" t={t} extra={t("report.recorded", { count: dq.uniqueEmotions || 0 })} />
          <View style={s.card}>
            {emotionEntries.map(([key, value]) => (
              <HBar key={key} label={t("emotions." + key) || key} value={value} max={emotionMax} color={EMOTION_COLORS[key] || palette.warning} icon={EMOTION_EMOJIS[key]} highlight />
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
              <HBar key={key} label={triggerDisplay(key, t)} value={value} max={triggerMax} color={TRIGGER_COLORS[key] || palette.accent} highlight />
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
              <HBar key={key} label={t("report.times." + key) || key} value={value} max={timeMax} color={TIME_COLORS[key] || palette.warning} icon={TIME_ICONS[key]} />
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
                  <Text style={[s.correlationTrigger, { color: tColor }]}>{triggerDisplay(trigger, t)}</Text>
                  <View style={s.correlationChips}>
                    {Object.entries(emotions).filter(([, c]) => c > 0).sort(([, a], [, b]) => b - a).slice(0, 3).map(([emo, count]) => {
                      const emoColor = EMOTION_COLORS[emo] || palette.text;
                      return (
                        <View style={[s.correlationChip, { backgroundColor: emoColor + "15", borderColor: emoColor + "40" }]} key={emo}>
                          <Text style={[s.correlationChipText, { color: emoColor }]}>{EMOTION_EMOJIS[emo] || ""} {t("emotions." + emo) || emo} ×{count}</Text>
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

      {/* Timeline CTA */}
      <AnimatedSection index={7} style={s.section}>
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
  const [errorId, setErrorId] = useState(null);
  const lastAttempt = useRef({});

  async function handleResponse(actionId, response) {
    if (responded[actionId] || submitting) return;
    setSubmitting(actionId);
    setErrorId(null);
    lastAttempt.current[actionId] = response;
    tap();
    try {
      await submitActionFeedback(actionId, response, deviceId, token);
      setResponded((prev) => ({ ...prev, [actionId]: response }));
      setFeedbackAck((prev) => ({ ...prev, [actionId]: response === "helped" ? t("report.markedHelpful") : t("report.adjustThis") }));
      trackEvent("action_feedback", { actionId, response });
      if (onFeedback) onFeedback(actionId, response);
    } catch (err) {
      console.error("Action feedback failed:", err?.message || err);
      setErrorId(actionId);
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
        const isBusy = submitting === action.id;
        const hasError = errorId === action.id;
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
              {renderColoredText(action.reason, t, s.actionReason)}
              {done ? (
                <View style={[s.actionFeedbackDone, { backgroundColor: done === "helped" ? palette.successSoft : palette.warningSoft }]}>
                  <Text style={[s.actionFeedbackDoneText, { color: done === "helped" ? palette.success : palette.warning }]}>
                    {done === "helped" ? "✓ " : "✕ "}{ack || (done === "helped" ? t("report.markedHelpful") : t("report.adjustThis"))}
                  </Text>
                </View>
              ) : (
                <View style={s.actionButtons}>
                  <Pressable
                    style={[s.actionBtn, s.actionBtnHelped, isBusy && { opacity: 0.5 }]}
                    onPress={() => handleResponse(action.id, "helped")}
                    disabled={!!submitting}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={t("report.helped")}
                  >
                    <Text style={s.actionBtnHelpedText}>{isBusy ? "…" : `✓ ${t("report.helped")}`}</Text>
                  </Pressable>
                  <Pressable
                    style={[s.actionBtn, s.actionBtnNotHelpful, isBusy && { opacity: 0.5 }]}
                    onPress={() => handleResponse(action.id, "not_helpful")}
                    disabled={!!submitting}
                    hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                    accessibilityRole="button"
                    accessibilityLabel={t("report.notHelpful")}
                  >
                    <Text style={s.actionBtnNotHelpfulText}>{isBusy ? "…" : `✕ ${t("report.notHelpful")}`}</Text>
                  </Pressable>
                </View>
              )}
              {hasError ? (
                <Pressable onPress={() => handleResponse(action.id, lastAttempt.current[action.id] || "helped")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Text style={{ color: palette.warning, fontSize: 12, marginTop: 4, textAlign: "center" }}>
                    {t("common.retryError") || "Something went wrong, tap to retry"}
                  </Text>
                </Pressable>
              ) : null}
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

function ProgressTab({ progress, isSignedIn, isPremium, handleSignIn, handleUpgrade, purchasing, t, lang }) {
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
                {trajectory.past?.score?.toFixed(1) || "-"}
              </Text>
              <Text style={s.progressArcLabel}>
                {t("report.progress.weeksAgo", { count: trajectory.weeksTracked || "-" })}
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
                {trajectory.present?.score?.toFixed(1) || "-"}
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

      {/* ── 2. SCORE TREND CHART ── */}
      {weeklySnapshots?.length >= 2 ? (() => {
        const chartW = Dimensions.get("window").width - 64;
        const labels = weeklySnapshots.map(w => w.weekLabel?.replace(/^W/, "") || "");
        const scores = weeklySnapshots.map(w => w.score ?? 0);
        return (
          <AnimatedSection index={1} style={s.section}>
            <SectionHeader label={t("report.progress.scoreTrend") || "Score trend"} badge="live" t={t} />
            <View style={s.chartContainer}>
              <LineChart
                data={{ labels, datasets: [{ data: scores }] }}
                width={chartW}
                height={180}
                yAxisSuffix=""
                fromZero
                yAxisInterval={1}
                chartConfig={{
                  backgroundGradientFrom: palette.glass,
                  backgroundGradientTo: palette.glass,
                  decimalPlaces: 1,
                  color: (opacity = 1) => `rgba(120, 180, 255, ${opacity})`,
                  labelColor: () => palette.textSecondary,
                  propsForDots: { r: "4", strokeWidth: "2", stroke: palette.accent },
                  propsForBackgroundLines: { stroke: palette.glassBorder || "rgba(255,255,255,0.08)" },
                }}
                bezier
                style={{ borderRadius: 12 }}
              />
            </View>
          </AnimatedSection>
        );
      })() : null}

      {/* ── 3. WHAT'S CHANGING (core metrics) ── */}
      {metrics ? (
        <AnimatedSection index={2} style={s.section}>
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
                ? (md.current <= 0 ? "-" : (m.key === "recoveryDays" ? `~${md.current}d` : md.current.toFixed(1)))
                : (md.current === null ? "-" : (m.key === "stability" ? `${Math.round(md.current * 100)}%` : md.current.toFixed(1)));
              const displayPrev = m.invertDisplay
                ? (md.previous <= 0 ? "-" : (m.key === "recoveryDays" ? `~${md.previous}d` : md.previous.toFixed(1)))
                : (md.previous === null ? "-" : (m.key === "stability" ? `${Math.round(md.previous * 100)}%` : md.previous.toFixed(1)));

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

      {/* ── 4. PATTERN SHIFTS ── */}
      {hasShifts ? (
        <AnimatedSection index={3} style={s.section}>
          <SectionHeader label={t("report.progress.patternsTitle")} badge="weekly" t={t} />

          {patternShifts.strengthening?.length ? (
            <View style={[s.progressShiftGroup, { borderLeftColor: palette.success }]}>
              <Text style={[s.progressShiftGroupLabel, { color: palette.success }]}>
                {t("report.progress.strengthening")}
              </Text>
              {patternShifts.strengthening.map((p, i) => (
                <View key={i} style={s.progressShiftItem}>
                  <Text style={s.progressShiftPair}>
                    <Text style={{ color: TRIGGER_COLORS[p.trigger] || palette.accent }}>{triggerDisplay(p.trigger, t)}</Text>
                    {" → "}
                    <Text style={{ color: EMOTION_COLORS[p.emotion] || palette.text }}>{emotionDisplay(p.emotion, t)}</Text>
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
                    <Text style={{ color: TRIGGER_COLORS[p.trigger] || palette.accent }}>{triggerDisplay(p.trigger, t)}</Text>
                    {" → "}
                    <Text style={{ color: EMOTION_COLORS[p.emotion] || palette.text }}>{emotionDisplay(p.emotion, t)}</Text>
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
                    <Text style={{ color: TRIGGER_COLORS[p.trigger] || palette.accent }}>{triggerDisplay(p.trigger, t)}</Text>
                    {" → "}
                    <Text style={{ color: EMOTION_COLORS[p.emotion] || palette.text }}>{emotionDisplay(p.emotion, t)}</Text>
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
                    <Text style={{ color: TRIGGER_COLORS[p.trigger] || palette.accent }}>{triggerDisplay(p.trigger, t)}</Text>
                    {" → "}
                    <Text style={{ color: EMOTION_COLORS[p.emotion] || palette.text }}>{emotionDisplay(p.emotion, t)}</Text>
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

      {/* ── 5. ATTRIBUTIONS ── */}
      {hasAttributions ? (
        <AnimatedSection index={4} style={s.section}>
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
                <Text style={s.progressAttrTrigger}>{triggerDisplay(a.trigger, t)}</Text>
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
                <Text style={s.progressAttrTrigger}>{triggerDisplay(a.trigger, t)}</Text>
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
                <Text style={s.progressAttrTrigger}>{triggerDisplay(a.trigger, t)}</Text>
                {a.note ? <Text style={s.progressAttrNote}>{a.note}</Text> : null}
              </View>
            ))
          ) : null}
        </AnimatedSection>
      ) : null}

      {/* ── 6. WEEK BY WEEK ── */}
      {weeklySnapshots?.length >= 2 ? (
        <AnimatedSection index={5} style={s.section}>
          <SectionHeader label={t("report.progress.weeklyTitle")} badge="live" t={t} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.progressWeekScroll}>
            {weeklySnapshots.map((week) => {
              const color = toneColor(week.tone);
              return (
                <View key={week.weekLabel} style={s.progressWeekCard}>
                  <Text style={s.progressWeekLabel}>{week.weekLabel}</Text>
                  <Text style={[s.progressWeekEmoji]}>{toneEmoji(week.tone)}</Text>
                  <Text style={[s.progressWeekScore, { color }]}>
                    {week.score?.toFixed(1) || "-"}
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
                    {week.startDate ? localeDateStr(week.startDate, lang) : ""}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </AnimatedSection>
      ) : null}

      {/* ── 7. CONFIDENCE ── */}
      <AnimatedSection index={6} style={s.section}>
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
  if (invoked?.vacuumDrift != null && Math.abs(invoked.vacuumDrift) > 0.15) {
    out.push({
      key: "vacuum", icon: invoked.vacuumDrift > 0 ? "🧘" : "⚡",
      label: t("report.prem.vacuum"),
      body: invoked.vacuumDrift > 0 ? t("report.vacuumDriftRising") : t("report.vacuumDriftFalling"),
      color: invoked.vacuumDrift > 0 ? palette.success : palette.warning,
    });
  }
  if (invoked?.contamination?.length > 0) {
    const c = invoked.contamination[0];
    out.push({
      key: "bleed", icon: "🔗",
      label: t("report.contextBleed"),
      body: t("report.contextBleedBody", { source: triggerDisplay(c.sourceTrigger, t), target: c.affectedTriggers.map(tr => triggerDisplay(tr, t)).join(", ") }),
      color: palette.purple,
    });
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

function ModeCards({ mode, data, t, lang, onFeedback, isPremium, dominantEmotion, savedFeedback }) {
  // Only restore feedback for items in the CURRENT output — don't carry stale feedback from previous generations
  const currentItemIds = useMemo(() => new Set((data?.items || []).map((i) => i.id)), [data]);
  const freshFeedback = useMemo(() => {
    if (!savedFeedback) return {};
    const filtered = {};
    for (const [id, resp] of Object.entries(savedFeedback)) {
      if (currentItemIds.has(id)) filtered[id] = resp;
    }
    return filtered;
  }, [savedFeedback, currentItemIds]);
  const [feedbackGiven, setFeedbackGiven] = useState(freshFeedback);
  // Reset when generation changes
  useEffect(() => { setFeedbackGiven(freshFeedback); }, [freshFeedback]);

  // Move state
  const [moveDuration, setMoveDuration] = useState(null); // null | [min,max]

  // Fuel state
  const [fuelDiet, setFuelDiet] = useState(null);

  // Derive emotion tags for state-adaptive pick
  const emotions = useMemo(() => {
    if (!dominantEmotion) return [];
    return [dominantEmotion];
  }, [dominantEmotion]);

  // Move suggestions — use server-picked items when available (adaptive + feedback-aware),
  // fall back to full client library otherwise. Duration filter + emotion sort applied on top.
  const moveSuggestions = useMemo(() => {
    let pool;
    if (mode === "move" && data?.items?.length > 0) {
      const movementMap = Object.fromEntries(MOVEMENTS.map((m) => [m.id, m]));
      // Merge server reason with client catalogue data
      const serverReasons = Object.fromEntries(data.items.map((si) => [si.id, si.reason]));
      pool = data.items.map((si) => {
        const mv = movementMap[si.id];
        return mv ? { ...mv, reason: serverReasons[si.id] || null } : null;
      }).filter(Boolean);
    } else {
      pool = filterMovements({});
    }
    if (moveDuration) {
      const [lo, hi] = moveDuration;
      pool = pool.filter((m) => m.durationMin >= lo && m.durationMin <= hi);
    }
    // Sort by: liked first, then emotion relevance, disliked last
    return [...pool].sort((a, b) => {
      const aFb = feedbackGiven[a.id];
      const bFb = feedbackGiven[b.id];
      const aLiked = aFb === "helpful" ? 1 : aFb === "not_helpful" ? -1 : 0;
      const bLiked = bFb === "helpful" ? 1 : bFb === "not_helpful" ? -1 : 0;
      if (aLiked !== bLiked) return bLiked - aLiked;
      const aScore = emotions.length ? (a.emotionTags || []).filter((e) => emotions.includes(e)).length : 0;
      const bScore = emotions.length ? (b.emotionTags || []).filter((e) => emotions.includes(e)).length : 0;
      return bScore - aScore;
    });
  }, [mode, data, moveDuration, emotions, feedbackGiven]);

  // Fuel suggestions — use server-picked items when available (adaptive + feedback-aware),
  // fall back to full client library otherwise. Diet filter + emotion sort applied on top.
  const fuelSuggestions = useMemo(() => {
    let pool;
    if (mode === "fuel" && data?.items?.length > 0) {
      const nourishMap = Object.fromEntries(NOURISHMENTS.map((n) => [n.id, n]));
      // Merge server reason with client catalogue data
      const serverReasons = Object.fromEntries(data.items.map((si) => [si.id, si.reason]));
      pool = data.items.map((si) => {
        const nItem = nourishMap[si.id];
        return nItem ? { ...nItem, reason: serverReasons[si.id] || null } : null;
      }).filter(Boolean);
    } else {
      pool = filterNourishments({ diets: fuelDiet ? [fuelDiet] : undefined });
    }
    if (fuelDiet && fuelDiet !== "nonVeg") {
      // nonVeg users can eat everything — no filtering needed
      pool = pool.filter((n) => n.diet?.includes(fuelDiet));
    }
    // Sort by: liked first, then emotion relevance, disliked last
    return [...pool].sort((a, b) => {
      const aFb = feedbackGiven[a.id];
      const bFb = feedbackGiven[b.id];
      const aLiked = aFb === "helpful" ? 1 : aFb === "not_helpful" ? -1 : 0;
      const bLiked = bFb === "helpful" ? 1 : bFb === "not_helpful" ? -1 : 0;
      if (aLiked !== bLiked) return bLiked - aLiked;
      const aScore = emotions.length ? (a.emotionTags || []).filter((e) => emotions.includes(e)).length : 0;
      const bScore = emotions.length ? (b.emotionTags || []).filter((e) => emotions.includes(e)).length : 0;
      return bScore - aScore;
    });
  }, [mode, data, fuelDiet, emotions, feedbackGiven]);

  // Fuel day plan - one item per meal slot, prioritized by emotion relevance
  // Backfills from full library when server items don't cover all slots for the active diet
  const fuelPlan = useMemo(() => {
    const isHi = lang === "hi";
    const SLOTS = [
      { key: "morning", label: isHi ? "सुबह का पेय" : "Morning", icon: "☀️", types: ["drink"] },
      { key: "breakfast", label: isHi ? "नाश्ता" : "Breakfast", icon: "🍳", types: ["meal"] },
      { key: "midSnack", label: isHi ? "दोपहर का स्नैक" : "Mid-morning Snack", icon: "🥜", types: ["snack"] },
      { key: "lunch", label: isHi ? "दोपहर का खाना" : "Lunch", icon: "🍱", types: ["meal"] },
      { key: "eveSnack", label: isHi ? "शाम का स्नैक" : "Evening Snack", icon: "🫖", types: ["snack", "drink"] },
      { key: "dinner", label: isHi ? "रात का खाना" : "Dinner", icon: "🍽️", types: ["meal"] },
      { key: "ritual", label: isHi ? "भोजन रिचुअल" : "Food Ritual", icon: "🧘", types: ["ritual"] },
    ];
    // Full library pool for backfill (diet-filtered, diet=nonVeg includes all items)
    const allLibrary = fuelDiet && fuelDiet !== "nonVeg"
      ? NOURISHMENTS.filter((n) => n.diet?.includes(fuelDiet))
      : NOURISHMENTS;
    const used = new Set();
    return SLOTS.map((slot) => {
      // Try server suggestions first
      let pool = fuelSuggestions.filter((n) => slot.types.includes(n.type) && !used.has(n.id));
      let pick = pool[0] || null;
      // Backfill from full library if server items can't fill this slot
      if (!pick) {
        const backfill = allLibrary.filter((n) => slot.types.includes(n.type) && !used.has(n.id));
        pick = backfill[0] || null;
      }
      if (pick) used.add(pick.id);
      return { ...slot, item: pick };
    }).filter((slot) => slot.item);
  }, [fuelSuggestions, lang, fuelDiet]);

  const MODE_ICONS = { move: "🏃", fuel: "🥗", perspective: "💡" };

  // Perspective mode has no client-side fallback; move/fuel fall back to library when no server data
  if (mode === "perspective" && (!data || (!data.items?.length && !data.narrative))) {
    return (
      <View style={s.modeContent}>
        <View style={[s.insightStateCard, { paddingVertical: 20, borderLeftWidth: 3, borderLeftColor: palette.accent }]}>
          <Text style={s.insightStateIcon}>{MODE_ICONS[mode] || "✨"}</Text>
          <Text style={s.insightStateTitle}>{t(`report.prem.mode.${mode}`)} {t("report.prem.mode.warmTitle")}</Text>
          <Text style={s.insightStateBody}>{t("report.prem.mode.warmBody")}</Text>
        </View>
      </View>
    );
  }

  const items = data?.items || [];
  const rawNarrative = data?.narrative || "";
  const hi = lang === "hi";

  // Guard: if backend stored raw JSON as narrative, extract the opening
  const narrative = useMemo(() => {
    const trimmed = rawNarrative.trim();
    if (!trimmed.startsWith("{")) return rawNarrative;
    try {
      const parsed = JSON.parse(trimmed);
      return parsed.opening || rawNarrative;
    } catch {
      const m = trimmed.match(/"opening"\s*:\s*"((?:[^"\\]|\\.)*)"/s);
      return m ? m[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : rawNarrative;
    }
  }, [rawNarrative]);

  function handleFeedback(itemId, response) {
    tap();
    setFeedbackGiven((prev) => ({ ...prev, [itemId]: response }));
    if (onFeedback) onFeedback(mode, itemId, response);
  }

  return (
    <View style={s.modeContent}>
      {narrative ? renderColoredText(cleanText(narrative), t, s.modeNarrative) : null}

      {/* ── Move: duration filter + exercise list ── */}
      {mode === "move" && (
        <>
          <View style={s.filterRow}>
            {[{ label: "⏱ < 5 min each", val: [0, 4] }, { label: "⏱ 5-10 min each", val: [5, 10] }, { label: "⏱ 10+ min each", val: [10, 999] }].map((opt) => {
              const active = moveDuration && moveDuration[0] === opt.val[0] && moveDuration[1] === opt.val[1];
              return (
                <Pressable key={opt.label} onPress={() => { tap(); setMoveDuration(active ? null : opt.val); }} style={[s.filterChip, active && s.filterChipActive]}>
                  <Text style={[s.filterChipText, active && s.filterChipTextActive]}>{opt.label}</Text>
                </Pressable>
              );
            })}
          </View>
          {moveSuggestions.length > 0 ? (
            <>
              {moveSuggestions.slice(0, 8).map((mv) => (
                <View key={mv.id} style={s.suggestionCard}>
                  <Text style={s.suggestionTitle}>{hi ? mv.nameHi : mv.name}</Text>
                  {mv.reason ? (
                    <Text style={s.suggestionReason}>{mv.reason}</Text>
                  ) : null}
                  <Text style={[s.suggestionDesc, mv.reason ? s.suggestionDescSecondary : null]}>{hi ? mv.descriptionHi : mv.description}</Text>
                  <View style={s.suggestionMeta}>
                    <Text style={s.suggestionMetaText}>{mv.intensity} · ~{mv.durationMin} min · {mv.equipment}</Text>
                  </View>
                  {dominantEmotion && mv.emotionTags?.includes(dominantEmotion) && (
                    <View style={s.suggestionMatch}>
                      <Text style={s.suggestionMatchText}>✓ {t("report.prem.mode.matchesMood")}</Text>
                    </View>
                  )}
                  {isPremium && !feedbackGiven[mv.id] ? (
                    <View style={s.modeFeedbackRow}>
                      <Pressable style={[s.modeFeedbackBtn, s.modeFeedbackHelpful]} onPress={() => handleFeedback(mv.id, "helpful")} accessibilityRole="button">
                        <Text style={s.modeFeedbackHelpfulText}>👍 {t("report.prem.mode.helpful")}</Text>
                      </Pressable>
                      <Pressable style={[s.modeFeedbackBtn, s.modeFeedbackNot]} onPress={() => handleFeedback(mv.id, "not_helpful")} accessibilityRole="button">
                        <Text style={s.modeFeedbackNotText}>👎</Text>
                      </Pressable>
                    </View>
                  ) : feedbackGiven[mv.id] ? (
                    <View style={s.modeFeedbackDone}>
                      <Text style={s.modeFeedbackDoneText}>{feedbackGiven[mv.id] === "helpful" ? `✓ ${t("report.prem.mode.thanksHelpful")}` : t("report.prem.mode.thanksNot")}</Text>
                    </View>
                  ) : null}
                </View>
              ))}
              <Text style={s.suggestionCounter}>{t("report.prem.mode.showing", { shown: Math.min(moveSuggestions.length, 8), total: moveSuggestions.length })}</Text>
            </>
          ) : (
            <Text style={s.modeContentBody}>{t("report.prem.mode.noExercises")}</Text>
          )}
        </>
      )}

      {/* ── Fuel: diet filter + full-day plan ── */}
      {mode === "fuel" && (
        <>
          <View style={s.filterRow}>
            {[{ label: "All", val: null }, { label: "🥬 Veg", val: "vegetarian" }, { label: "🌱 Vegan", val: "vegan" }, { label: "🍗 Non-Veg", val: "nonVeg" }].map((opt) => (
              <Pressable key={opt.label} onPress={() => { tap(); setFuelDiet(opt.val); }} style={[s.filterChip, fuelDiet === opt.val && s.filterChipActive]}>
                <Text style={[s.filterChipText, fuelDiet === opt.val && s.filterChipTextActive]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
          {fuelPlan.length > 0 ? (
            fuelPlan.map(({ key, label, icon, item }) => (
              <View key={key} style={s.suggestionCard}>
                <Text style={s.fuelSlotLabel}>{icon} {label}</Text>
                <Text style={s.suggestionTitle}>{hi ? item.nameHi : item.name}</Text>
                {item.reason ? (
                  <Text style={s.suggestionReason}>{item.reason}</Text>
                ) : null}
                <Text style={[s.suggestionDesc, item.reason ? s.suggestionDescSecondary : null]}>{hi ? item.descriptionHi : item.description}</Text>
                <View style={s.suggestionMeta}>
                  <Text style={s.suggestionMetaText}>{item.nutrientFocus}{item.prepLevel ? ` · ${item.prepLevel} prep` : ""}</Text>
                </View>
                {dominantEmotion && item.emotionTags?.includes(dominantEmotion) && (
                  <View style={s.suggestionMatch}>
                    <Text style={s.suggestionMatchText}>✓ {t("report.prem.mode.matchesMood")}</Text>
                  </View>
                )}
                {isPremium && !feedbackGiven[item.id] ? (
                  <View style={s.modeFeedbackRow}>
                    <Pressable style={[s.modeFeedbackBtn, s.modeFeedbackHelpful]} onPress={() => handleFeedback(item.id, "helpful")} accessibilityRole="button">
                      <Text style={s.modeFeedbackHelpfulText}>👍 {t("report.prem.mode.helpful")}</Text>
                    </Pressable>
                    <Pressable style={[s.modeFeedbackBtn, s.modeFeedbackNot]} onPress={() => handleFeedback(item.id, "not_helpful")} accessibilityRole="button">
                      <Text style={s.modeFeedbackNotText}>👎</Text>
                    </Pressable>
                  </View>
                ) : feedbackGiven[item.id] ? (
                  <View style={s.modeFeedbackDone}>
                    <Text style={s.modeFeedbackDoneText}>{feedbackGiven[item.id] === "helpful" ? `✓ ${t("report.prem.mode.thanksHelpful")}` : t("report.prem.mode.thanksNot")}</Text>
                  </View>
                ) : null}
              </View>
            ))
          ) : (
            <Text style={s.modeContentBody}>{t("report.prem.mode.noFuelItems")}</Text>
          )}
        </>
      )}

      {/* ── Perspective: server-driven items only ── */}
      {mode === "perspective" && items.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.modeCardsScroll}>
          {items.map((item) => {
            const given = feedbackGiven[item.id];
            return (
              <View key={item.id} style={s.modeCard}>
                <Text style={s.modeCardTitle}>{item.name}</Text>
                <Text style={s.modeCardDesc}>{item.description}</Text>
                {isPremium && !given ? (
                  <View style={s.modeFeedbackRow}>
                    <Pressable style={[s.modeFeedbackBtn, s.modeFeedbackHelpful]} onPress={() => handleFeedback(item.id, "helpful")} accessibilityRole="button">
                      <Text style={s.modeFeedbackHelpfulText}>👍 {t("report.prem.mode.helpful")}</Text>
                    </Pressable>
                    <Pressable style={[s.modeFeedbackBtn, s.modeFeedbackNot]} onPress={() => handleFeedback(item.id, "not_helpful")} accessibilityRole="button">
                      <Text style={s.modeFeedbackNotText}>👎</Text>
                    </Pressable>
                  </View>
                ) : given ? (
                  <View style={s.modeFeedbackDone}>
                    <Text style={s.modeFeedbackDoneText}>{given === "helpful" ? `✓ ${t("report.prem.mode.thanksHelpful")}` : t("report.prem.mode.thanksNot")}</Text>
                  </View>
                ) : null}
              </View>
            );
          })}
        </ScrollView>
      )}

      {data?.generatedAt ? (
        <Text style={s.modeFooter}>
          {t("report.generatedBy", { date: localeDateStr(data.generatedAt, lang) })}
        </Text>
      ) : null}
    </View>
  );
}

function PremiumTab({ report, dq, isSignedIn, isPremium, hasLlmInsight, hasLlmTeaser, handleSignIn, handleUpgrade, purchasing, subscription, t, lang, modes, onModeFeedback, token, onModesRefresh, dominantEmotion }) {
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
    ? localeDateStr(subscription.expiresAt, lang, { day: "numeric", month: "short", year: "numeric" })
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
          {renderColoredText(cleanText(directionText), t, s.premDirectionText)}
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

      {/* ── Full paywall gate for non-premium ── */}
      {!isPremium ? (
        <View style={s.tabContent}>
          {/* Premium status badge (not premium) */}
          <View style={s.insightStateCard}>
            <Text style={s.insightStateIcon}>💎</Text>
            <Text style={s.insightStateTitle}>{t("report.unlockInsightsTitle")}</Text>
            <Text style={s.insightStateBody}>{t("report.prem.paywallBody")}</Text>
            {!isSignedIn ? (
              <PrimaryButton label={t("report.signInToUnlock")} onPress={handleSignIn} />
            ) : (
              <Pressable style={s.teaserCtaButton} onPress={handleUpgrade} disabled={purchasing} accessibilityRole="button">
                <Text style={s.teaserCtaButtonText}>{purchasing ? t("common.pleaseWait") : t("report.upgradePremium")}</Text>
              </Pressable>
            )}
          </View>

          {/* Teaser: show one signal preview if available */}
          {signals.length > 0 ? (
            <AnimatedSection index={1} style={s.section}>
              <SectionHeader label={t("report.prem.shifting")} badge="live" t={t} />
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
                />
              ) : null}
            </AnimatedSection>
          ) : null}

          {/* Teaser: direction preview */}
          {hasLlmTeaser ? (
            <AnimatedSection index={2} style={s.section}>
              <SectionHeader label={t("report.prem.directionTitle")} badge="weekly" t={t} />
              {renderDirectionCard()}
            </AnimatedSection>
          ) : null}
        </View>
      ) : (
        /* ── Premium content (full access) ── */
        <View style={s.tabContent}>

          {/* ── Premium status badge ── */}
          <View style={s.premBadge}>
            <Text style={s.premBadgeText}>
              {expiryDate ? t("report.prem.statusUntil", { date: expiryDate }) : t("report.prem.statusActive")}
            </Text>
          </View>

          {/* ── 1. ADAPTIVE MODES (Move · Fuel · Perspective) — moved to top ── */}
          <AnimatedSection index={0} style={s.section}>
            <SectionHeader label={t("report.prem.adaptiveTitle")} badge="live" t={t} />
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
            {activeMode === "core" ? (
              <View style={s.modeContent}>
                <Text style={s.modeContentBody}>{t("report.prem.mode.coreBody")}</Text>
              </View>
            ) : (
              <ModeCards mode={activeMode} data={modes?.[activeMode]} t={t} lang={lang} onFeedback={onModeFeedback} isPremium={isPremium} dominantEmotion={dominantEmotion} savedFeedback={modes?.feedback} />
            )}


          </AnimatedSection>

          {/* ── Remaining premium sections visible only in Core mode ── */}
          {activeMode === "core" ? (
            <>
          {/* ── 2. YOUR DIRECTION (hero) ── */}
          <AnimatedSection index={1} style={s.section}>
            <SectionHeader label={t("report.prem.directionTitle")} badge="weekly" t={t} />
            {renderDirectionCard()}
          </AnimatedSection>

          {/* ── 3. WHAT'S SHIFTING (signal cards) ── */}
          {signals.length > 0 ? (
            <AnimatedSection index={2} style={s.section}>
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
          ) : null}

          {/* ── 4. PATTERN INTELLIGENCE (LLM insight cards) ── */}
          {hasLlmInsight && llmSections ? (
            <AnimatedSection index={3} style={s.section}>
              <SectionHeader label={t("report.prem.patternIntel")} badge="weekly" t={t} />
              <View style={s.insightCardsRow}>
                {llmSections.map((body, idx) => {
                  if (!body) return null;
                  const insightMeta = getInsightSectionMeta(t);
                  const meta = insightMeta[idx] || {};
                  return (
                    <View key={idx} style={s.insightSectionWrap}>
                      <View style={s.insightSectionHeaderOuter}>
                        <Text style={s.insightSectionIcon}>{meta.icon || "💡"}</Text>
                        <Text style={[s.insightSectionLabelOuter, meta.color ? { color: meta.color } : null]}>
                          {meta.label || t("report.sectionLabel", { num: idx + 1 })}
                        </Text>
                      </View>
                      <View style={[s.insightSectionCard, { borderLeftWidth: 3, borderLeftColor: meta.color || palette.accent }]}>
                        {renderColoredText(cleanText(body), t, s.insightSectionBody)}
                      </View>
                    </View>
                  );
                })}
                <Text style={s.insightFooter}>
                  {t("report.generatedBy", { date: report.llmInsight.generatedAt
                    ? localeDateStr(report.llmInsight.generatedAt, lang)
                    : "" })}
                </Text>
              </View>
            </AnimatedSection>
          ) : null}

          {/* ── 5. YOUR LEVERS (adaptive regulators) ── */}
          {sortedRegulators.length > 0 ? (
            <AnimatedSection index={4} style={s.section}>
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
                          <Text style={s.effectTitle}>{triggerDisplay(r.trigger, t)} → {emotionDisplay(r.emotion, t)}</Text>
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
          ) : null}

          {/* ── 6. BEHAVIOUR SNAPSHOT (compact metrics) ── */}
          {bm?.baseline?.reliable ? (
            <AnimatedSection index={5} style={s.section}>
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
                {report?.invokedMetrics?.currentVacuum != null ? (
                  <View style={s.premMetricItem}>
                    <Text style={s.premMetricLabel}>{t("report.prem.vacuum")}</Text>
                    <Text style={[s.premMetricValue, { color: report.invokedMetrics.vacuumDrift >= 0 ? palette.success : palette.danger }]}>
                      {report.invokedMetrics.currentVacuum.toFixed(1)}/5
                    </Text>
                  </View>
                ) : null}
                {report?.invokedMetrics?.weeklyInvokedAvg != null ? (
                  <View style={s.premMetricItem}>
                    <Text style={s.premMetricLabel}>{t("report.prem.internalInfluence")}</Text>
                    <Text style={[s.premMetricValue, { color: report.invokedMetrics.weeklyInvokedAvg >= 0 ? palette.success : palette.warning }]}>
                      {report.invokedMetrics.weeklyInvokedAvg > 0 ? "+" : ""}{report.invokedMetrics.weeklyInvokedAvg.toFixed(2)}
                    </Text>
                  </View>
                ) : null}
              </View>
            </AnimatedSection>
          ) : null}

          {/* ── 7. ACTION EFFECTIVENESS (compact) ── */}
          {(triedCount > 0 || skippedCount > 0) ? (
            <AnimatedSection index={6} style={s.section}>
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
            </>
          ) : null}
        </View>
      )}
    </View>
  );
}

/* ── Main screen ── */

export function WeeklyReportScreen() {
  const { loadWeeklyReport, refreshSession, subscription, user, token, subscribe, deviceId, invalidateCache } = useAppSession();
  const router = useRouter();
  const { state: obState, advance: obAdvance } = useOnboarding();
  const { dominantEmotion } = useEmotionalState();
  const { t, lang } = useLanguage();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [purchasing, setPurchasing] = useState(false);
  const [activeTab, setActiveTab] = useState("mirror");
  const [modes, setModes] = useState(null);
  const [progress, setProgress] = useState(null);
  const [showInsightsGuide, setShowInsightsGuide] = useState(false);
  const [showActionsGuide, setShowActionsGuide] = useState(false);
  const [showCloseLoop, setShowCloseLoop] = useState(false);

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

    // Refresh adaptive modes every time screen gains focus
    if (p && t) {
      fetchModes(t)
        .then((data) => {
          const populated = ["move", "fuel", "perspective"].filter((m) => data?.[m] != null);
          console.log("Modes response:", populated.length ? `${populated.join(", ")} populated` : "all empty");
          setModes(data);
        })
        .catch((err) => console.error("Modes fetch failed:", err?.message || err));
    }

    // FTUE: show insights guide when arriving from second log
    if (obState === "second_log_done") {
      const timer = setTimeout(() => setShowInsightsGuide(true), 800);
      return () => clearTimeout(timer);
    }
  }, [load, obState]));

  // Load progress metrics
  useEffect(() => {
    if (token || deviceId) {
      fetchProgress(token, deviceId)
        .then((res) => {
          console.log("Progress response:", res?.progress ? "has data" : "null");
          setProgress(res?.progress || null);
        })
        .catch((err) => console.error("Progress fetch failed:", err?.message || err));
    }
  }, [token, deviceId]);

  const handleModeFeedback = useCallback((mode, itemId, response) => {
    if (token) {
      submitModeFeedback(mode, itemId, response, token).catch(() => null);
      trackEvent("mode_feedback", { mode, itemId, response });
      // Update local feedback cache so it persists across tab switches
      setModes((prev) => prev ? { ...prev, feedback: { ...prev.feedback, [itemId]: response } } : prev);
    }
  }, [token]);

  const handleActionFeedback = useCallback((actionId, response) => {
    trackEvent("action_feedback", { actionId, response });
    // Only invalidate cache — do NOT reload the report here.
    // The optimistic UI in ActionsTab already shows the feedback.
    // Fresh actions will be fetched on next report load (new moment, tab revisit, etc).
    invalidateCache("weeklyReport");
  }, [invalidateCache]);

  const dq = report?.dataQuality || {};
  const confidence = dq.confidence || "too_early";
  const hasLlmInsight = !!report?.llmInsight?.narrative;
  const hasLlmTeaser = !!report?.llmTeaser?.narrative;
  // Historical users with sparse current week should still see tabs
  const lifetimeMoments = report?.lifetimeMoments ?? 0;
  const isHistoricalUser = lifetimeMoments >= 3;
  const showTabs = confidence !== "too_early" || isHistoricalUser;

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
                    {report.topEmotion ? (t("emotions." + report.topEmotion) || report.topEmotion) : t("report.mixedEmotion")}
                  </Text>
                </View>
                <View style={s.heroPill}>
                  <Text style={s.heroPillEmoji}>🎯</Text>
                  <Text style={[s.heroPillLabel, report.topTrigger && { color: TRIGGER_COLORS[report.topTrigger] || palette.accent }]}>
                    {report.topTrigger ? triggerDisplay(report.topTrigger, t) : (report.tiedTriggers?.length > 1 ? t("report.areasCount", { count: report.tiedTriggers.length }) : "-")}
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

          {report && !error && confidence === "too_early" && !isHistoricalUser ? (
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

          {report && !error && showTabs ? (
            <>
              {/* Tab bar */}
              <TabBar activeTab={activeTab} onTabChange={setActiveTab} t={t} />

              {/* FTUE guided tooltips */}
              {showInsightsGuide ? (
                <GuidedTooltip
                  text={t("ftue.insightsExplain")}
                  onDismiss={() => {
                    setShowInsightsGuide(false);
                    obAdvance("insights_seen");
                    setTimeout(() => setShowActionsGuide(true), 400);
                  }}
                  duration={6000}
                />
              ) : null}
              {showActionsGuide ? (
                <GuidedTooltip
                  text={t("ftue.actionsExplain")}
                  onDismiss={() => {
                    setShowActionsGuide(false);
                    setTimeout(() => setShowCloseLoop(true), 400);
                  }}
                  duration={6000}
                />
              ) : null}
              {showCloseLoop ? (
                <GuidedTooltip
                  text={t("ftue.closeLoop")}
                  onDismiss={() => {
                    setShowCloseLoop(false);
                    obAdvance("completed");
                  }}
                  duration={7000}
                />
              ) : null}

              {/* Light week banner for historical users with sparse current data */}
              {confidence === "too_early" && isHistoricalUser ? (
                <View style={s.lightWeekBanner}>
                  <Text style={s.lightWeekText}>
                    {t("report.lightWeek") || "Quiet week so far \u2014 showing your recent patterns and past insights."}
                  </Text>
                </View>
              ) : null}

              {/* Silence banner for returning users who haven't logged in 7+ days */}
              {confidence === "stale" && report?.silenceWindow ? (
                <View style={s.lightWeekBanner}>
                  <Text style={s.lightWeekText}>
                    {t("report.silenceBanner") || "Welcome back!"}{" "}
                    {(t("report.silenceBannerBody") || "It's been {days} days since your last check-in. Here's what we still see from your previous activity.").replace("{days}", report.silenceWindow.daysSinceLastLog || "a few")}
                  </Text>
                </View>
              ) : null}

              {/* Tab content */}
              {activeTab === "mirror" ? (
                <MirrorTab report={report} dq={dq} confidence={confidence} isSignedIn={isSignedIn} handleSignIn={handleSignIn} t={t} lang={lang} />
              ) : activeTab === "week" ? (
                <ThisWeekTab report={report} dq={dq} confidence={confidence} isSignedIn={isSignedIn} handleSignIn={handleSignIn} router={router} t={t} lang={lang} />
              ) : activeTab === "progress" ? (
                <ProgressTab
                  progress={progress} isSignedIn={isSignedIn} isPremium={isPremium}
                  handleSignIn={handleSignIn} handleUpgrade={handleUpgrade} purchasing={purchasing} t={t} lang={lang}
                />
              ) : activeTab === "actions" ? (
                <ActionsTab report={report} deviceId={deviceId} token={token} t={t} onFeedback={handleActionFeedback} />
              ) : (
                <PremiumTab
                  report={report} dq={dq} confidence={confidence}
                  isSignedIn={isSignedIn} isPremium={isPremium}
                  hasLlmInsight={hasLlmInsight} hasLlmTeaser={hasLlmTeaser}
                  handleSignIn={handleSignIn} handleUpgrade={handleUpgrade}
                  purchasing={purchasing} subscription={subscription} t={t} lang={lang}
                  modes={modes} onModeFeedback={handleModeFeedback}
                  token={token} onModesRefresh={async () => { const m = await fetchModes(token); setModes(m); }}
                  dominantEmotion={dominantEmotion}
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
    flexDirection: "row", gap: 6, marginTop: 8, marginBottom: 4, paddingHorizontal: 2,
  },
  tab: {
    alignItems: "center", paddingVertical: 10, paddingHorizontal: 14,
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
  sectionTitle: {
    color: palette.text, fontSize: 13, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 4,
    textShadowColor: "rgba(0,0,0,0.4)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
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
  insightCardsRow: { gap: 18 },

  /* Past insights archive */
  pastInsightsList: { gap: 10 },
  pastInsightCard: {
    padding: 14, borderRadius: radius.md, backgroundColor: palette.glass,
    borderWidth: 1, borderColor: palette.glassBorder, gap: 6,
  },
  pastInsightDate: { color: palette.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.5 },
  pastInsightPreview: { color: palette.textSecondary, fontSize: 13, lineHeight: 19 },
  pastInsightMeta: { color: palette.muted, fontSize: 11 },
  pastInsightToggle: { alignItems: "center", paddingVertical: 10 },
  pastInsightToggleText: { color: palette.accent, fontSize: 13, fontWeight: "600" },

  insightSectionWrap: { gap: 4 },
  insightSectionHeaderOuter: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 4, paddingBottom: 6,
  },
  insightSectionLabelOuter: {
    color: palette.accent, fontSize: 12, fontWeight: "700", letterSpacing: 0.6, textTransform: "uppercase",
  },
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

  lightWeekBanner: {
    paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.sm,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
    marginBottom: 8,
  },
  lightWeekText: { color: palette.textSecondary, fontSize: 13, lineHeight: 19, textAlign: "center" },

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
    flex: 1, alignItems: "center", paddingVertical: 11, minHeight: 44,
    justifyContent: "center", borderRadius: radius.sm, borderWidth: 1.5,
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
  modeContent: { gap: 10, backgroundColor: "rgba(6, 10, 18, 0.70)", borderRadius: radius.md, padding: 12 },
  modeContentBody: { color: palette.text, fontSize: 13, lineHeight: 19, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
  modeNarrative: { color: palette.text, fontSize: 14, lineHeight: 21, textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
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

  /* ── Mode filter chips ── */
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 2 },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.06)", borderWidth: 1, borderColor: palette.glassBorder,
  },
  filterChipActive: { backgroundColor: "rgba(94,230,160,0.15)", borderColor: "rgba(94,230,160,0.4)" },
  filterChipText: { color: palette.muted, fontSize: 11, fontWeight: "600" },
  filterChipTextActive: { color: "#5ee6a0" },

  /* ── Library browser ── */
  libraryToggle: { alignSelf: "flex-start", paddingVertical: 6, paddingHorizontal: 0 },
  libraryToggleText: { color: palette.accent, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  libraryGrid: { gap: 8 },
  libraryItem: {
    borderRadius: radius.sm, padding: 12, gap: 4,
    backgroundColor: "rgba(255,255,255,0.04)", borderWidth: 1, borderColor: palette.glassBorder,
  },
  libraryItemName: { color: palette.text, fontSize: 13, fontWeight: "700" },
  libraryItemDesc: { color: palette.textSecondary, fontSize: 12, lineHeight: 17 },
  libraryItemMeta: { color: palette.muted, fontSize: 10, fontWeight: "600", textTransform: "capitalize" },
  libraryEmpty: { color: palette.muted, fontSize: 12, textAlign: "center", paddingVertical: 16 },

  /* ── Regen panel ── */
  regenToggle: { alignSelf: "flex-start", paddingVertical: 8, paddingHorizontal: 0, marginTop: 4 },
  regenToggleText: { color: palette.accent, fontSize: 11, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase" },
  regenPanel: {
    gap: 12, padding: 14, borderRadius: radius.md,
    backgroundColor: "rgba(6, 10, 18, 0.85)", borderWidth: 1, borderColor: palette.glassBorder,
  },
  regenRow: { gap: 6 },
  regenLabel: { color: palette.textSecondary, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  regenButton: {
    paddingVertical: 12, borderRadius: radius.sm,
    backgroundColor: "rgba(94, 230, 160, 0.15)", borderWidth: 1, borderColor: "rgba(94, 230, 160, 0.4)",
    alignItems: "center",
  },
  regenButtonText: { color: "#5ee6a0", fontSize: 13, fontWeight: "700" },

  /* ── Charts ── */
  chartContainer: {
    backgroundColor: "rgba(6, 10, 18, 0.85)",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    padding: 12,
    alignItems: "center",
    overflow: "hidden",
  },

  /* ── Progress tab ── */
  progressArc: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    paddingVertical: 20, paddingHorizontal: 12, gap: 0,
    backgroundColor: "rgba(6, 10, 18, 0.85)", borderRadius: radius.md,
    borderWidth: 1, borderColor: palette.glassBorder,
  },
  progressArcNode: { alignItems: "center", gap: 4, width: 80 },
  progressArcConnector: {
    flex: 1, flexDirection: "row", alignItems: "center", marginHorizontal: -4,
  },
  progressArcLine: { flex: 1, height: 2, backgroundColor: palette.glassBorder },
  progressArcEmoji: { fontSize: 22 },
  progressArcScore: { color: palette.text, fontSize: 18, fontWeight: "800" },
  progressArcLabel: { color: palette.textSecondary, fontSize: 10, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", textShadowColor: "rgba(0,0,0,0.5)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
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

  /* ── Suggestion Card (Move / Fuel) ── */
  suggestionCard: {
    borderRadius: radius.md, padding: 14, gap: 6, marginTop: 6,
    backgroundColor: palette.glass, borderWidth: 1, borderColor: palette.glassBorder,
  },
  suggestionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  suggestionTitle: { color: palette.text, fontSize: 15, fontWeight: "700", flex: 1 },
  fuelSlotLabel: { color: palette.accent, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  rotateBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.sm, backgroundColor: "rgba(94,230,160,0.12)" },
  rotateBtnText: { color: "#5ee6a0", fontSize: 12, fontWeight: "700" },
  suggestionDesc: { color: palette.textSecondary, fontSize: 13, lineHeight: 18 },
  suggestionDescSecondary: { color: palette.muted, fontSize: 12, lineHeight: 16, marginTop: 2 },
  suggestionReason: { color: palette.text, fontSize: 13, lineHeight: 19, fontStyle: "italic", marginBottom: 2 },
  suggestionMeta: { flexDirection: "row", flexWrap: "wrap", gap: 4, marginTop: 2 },
  suggestionMetaText: { color: palette.muted, fontSize: 11, fontWeight: "600" },
  suggestionMatch: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
  suggestionMatchText: { color: "#5ee6a0", fontSize: 11, fontWeight: "700" },
  suggestionCounter: { color: palette.muted, fontSize: 10, fontWeight: "600", textAlign: "right", marginTop: 4 },
});
