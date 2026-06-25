import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { palette, radius } from "@/utils/theme";
import { EMOTION_STYLES } from "@/utils/designSystem";
import { emotionColor as getFieldColor } from "@/utils/emotionModel";
import { legacyToCoordinates, coordinatesToLegacy } from "@triggermap/shared";
import { useLanguage } from "@/i18n/LanguageContext";

// ── Animation configs per emotion feel ──
const ANIM_CONFIGS = {
  float:   { prop: "translateY", from: 0, to: -3, dur: [3200, 4200] },
  breathe: { prop: "scale", from: 1, to: 1.04, dur: [3500, 4500] },
  jitter:  { prop: "translateX", from: -1.2, to: 1.2, dur: [250, 400] },
  shake:   { prop: "translateX", from: -1.5, to: 1.5, dur: [350, 550] },
  pulse:   { prop: "scale", from: 1, to: 1.06, dur: [1200, 1800] },
};

const EMOTION_ANIM = {
  calm: "float", neutral: "breathe", anxious: "jitter",
  frustrated: "shake", energized: "pulse", overwhelmed: "shake",
  heavy: "float", uneasy: "jitter", excited: "pulse",
  peaceful: "float", grateful: "breathe", content: "breathe",
  restless: "jitter", alert: "pulse", disconnected: "float",
  flat: "breathe", low: "float",
};

function getPeakPeriod(hours) {
  const m = hours.filter(h => h < 12).length;
  const a = hours.filter(h => h >= 12 && h < 17).length;
  const e = hours.filter(h => h >= 17).length;
  if (m >= a && m >= e) return "morning";
  if (a >= e) return "afternoon";
  return "evening";
}

/**
 * EmotionGarden — living emotional field from today's moments.
 * Each unique emotion becomes a bloom. Size = frequency, motion = emotion type.
 */
export function EmotionGarden({ moments, highlightEmotion }) {
  const { t } = useLanguage();
  const [expandedIdx, setExpandedIdx] = useState(null);

  // Group today's moments by emotion
  const { blooms, centroid, todayCount } = useMemo(() => {
    if (!moments?.length) return { blooms: [], centroid: null, todayCount: 0 };
    const today = new Date().toDateString();
    const todayMoments = moments.filter(m => new Date(m.timestamp).toDateString() === today);
    if (!todayMoments.length) return { blooms: [], centroid: null, todayCount: 0 };

    const groups = {};
    let vSum = 0, aSum = 0, n = 0;
    for (const m of todayMoments) {
      // Resolve from coordinates when no legacy emotion is stored, so distinct
      // feelings don't all collapse into a single "Neutral" bloom.
      const emo = m.emotion || (typeof m.valence === "number" && typeof m.arousal === "number" ? coordinatesToLegacy(m.valence, m.arousal) : "neutral");
      if (!groups[emo]) groups[emo] = { emotion: emo, count: 0, triggers: {}, hours: [], valence: 0, arousal: 0 };
      groups[emo].count++;
      if (m.trigger) groups[emo].triggers[m.trigger] = (groups[emo].triggers[m.trigger] || 0) + 1;
      groups[emo].hours.push(new Date(m.timestamp).getHours());
      const v = typeof m.valence === "number" ? m.valence : (legacyToCoordinates(m.emotion)?.valence || 0);
      const a = typeof m.arousal === "number" ? m.arousal : (legacyToCoordinates(m.emotion)?.arousal || 0);
      groups[emo].valence += v;
      groups[emo].arousal += a;
      vSum += v; aSum += a; n++;
    }

    const bloomList = Object.values(groups)
      .map(g => ({
        ...g,
        valence: g.valence / g.count,
        arousal: g.arousal / g.count,
        topTrigger: Object.entries(g.triggers).sort((a, b) => b[1] - a[1])[0]?.[0],
        peakPeriod: getPeakPeriod(g.hours),
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);

    return {
      blooms: bloomList,
      centroid: n > 0 ? { valence: vSum / n, arousal: aSum / n } : null,
      todayCount: todayMoments.length,
    };
  }, [moments]);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (blooms.length > 0) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    }
  }, [blooms.length, fadeAnim]);

  const handleTap = useCallback((idx) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
    setExpandedIdx(prev => prev === idx ? null : idx);
  }, []);

  if (blooms.length === 0) return null;

  const ambientColor = centroid ? getFieldColor(centroid.valence, centroid.arousal) : palette.accent;
  // Background mood tint: calmer day → cooler, intense → warmer
  const avgMag = centroid ? Math.sqrt(centroid.valence ** 2 + centroid.arousal ** 2) : 0;
  const warmth = Math.min(1, avgMag * 1.5);

  return (
    <Animated.View style={[styles.wrap, { opacity: fadeAnim }]}>
      {/* Mood-tinted background */}
      <LinearGradient
        colors={[
          `rgba(${Math.round(86 + warmth * 80)}, ${Math.round(208 - warmth * 80)}, ${Math.round(224 - warmth * 40)}, 0.06)`,
          "transparent",
        ]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />

      <View style={styles.header}>
        <Text style={styles.title}>{t("garden.title")}</Text>
        <Text style={styles.count}>
          {todayCount !== 1 ? t("garden.bloomCountPlural", { count: todayCount }) : t("garden.bloomCount", { count: todayCount })}
        </Text>
      </View>

      {/* Today's emotional center — mini 2D indicator */}
      {centroid && (
        <View style={styles.centroidRow}>
          <View style={[styles.centroidField, { borderColor: `${ambientColor}30` }]}>
            <View style={styles.centroidGridH} />
            <View style={styles.centroidGridV} />
            <View style={[styles.centroidDot, {
              backgroundColor: ambientColor,
              left: `${((centroid.valence + 1) / 2) * 100}%`,
              top: `${((1 - (centroid.arousal + 1) / 2)) * 100}%`,
            }]} />
          </View>
          <Text style={[styles.centroidLabel, { color: ambientColor }]}>{t("garden.todaysCenter") || "today's center"}</Text>
        </View>
      )}

      {/* Organic bloom field */}
      <View style={styles.bloomField}>
        {blooms.map((bloom, i) => (
          <BloomItem
            key={bloom.emotion}
            bloom={bloom}
            index={i}
            maxCount={blooms[0]?.count || 1}
            isExpanded={expandedIdx === i}
            isHighlighted={highlightEmotion === bloom.emotion}
            onTap={() => handleTap(i)}
          />
        ))}
        {/* Seed placeholders */}
        {blooms.length < 4 && Array.from({ length: Math.min(2, 4 - blooms.length) }).map((_, i) => (
          <View key={`seed-${i}`} style={styles.seedSlot}>
            <Text style={styles.seedIcon}>·</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

function BloomItem({ bloom, index, maxCount, isExpanded, isHighlighted, onTap }) {
  const { t } = useLanguage();
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const lifeAnim = useRef(new Animated.Value(0)).current;
  const highlightAnim = useRef(new Animated.Value(0)).current;

  // Growth animation
  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 55,
      delay: index * 120,
      useNativeDriver: true,
    }).start();
  }, [index, scaleAnim]);

  // Living animation
  useEffect(() => {
    const animType = EMOTION_ANIM[bloom.emotion] || "breathe";
    const config = ANIM_CONFIGS[animType];
    const dur = config.dur[0] + Math.random() * (config.dur[1] - config.dur[0]);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(lifeAnim, { toValue: 1, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(lifeAnim, { toValue: 0, duration: dur, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bloom.emotion, lifeAnim]);

  // Highlight pulse
  useEffect(() => {
    if (isHighlighted) {
      Animated.sequence([
        Animated.timing(highlightAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
        Animated.timing(highlightAnim, { toValue: 0, duration: 800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]).start();
    }
  }, [isHighlighted, highlightAnim]);

  const animType = EMOTION_ANIM[bloom.emotion] || "breathe";
  const config = ANIM_CONFIGS[animType];

  const lifeTransform = config.prop === "scale"
    ? { scale: lifeAnim.interpolate({ inputRange: [0, 1], outputRange: [config.from, config.to] }) }
    : { [config.prop]: lifeAnim.interpolate({ inputRange: [0, 1], outputRange: [config.from, config.to] }) };

  const eStyle = EMOTION_STYLES[bloom.emotion] || EMOTION_STYLES.neutral;
  const fieldColor = getFieldColor(bloom.valence, bloom.arousal);
  const sizeScale = 0.85 + (bloom.count / Math.max(maxCount, 1)) * 0.35;
  const bloomLabel = t(`emotions.${bloom.emotion}`) !== `emotions.${bloom.emotion}` ? t(`emotions.${bloom.emotion}`) : bloom.emotion;
  const triggerLabel = bloom.topTrigger
    ? (t(`triggers.${bloom.topTrigger}`) !== `triggers.${bloom.topTrigger}` ? t(`triggers.${bloom.topTrigger}`) : bloom.topTrigger)
    : null;

  return (
    <Pressable onPress={onTap} accessibilityRole="button">
      <Animated.View style={[
        styles.bloomSlot,
        {
          transform: [
            { scale: Animated.multiply(scaleAnim, Animated.add(new Animated.Value(sizeScale), Animated.multiply(highlightAnim, new Animated.Value(0.1)))) },
            lifeTransform,
          ],
          backgroundColor: `${fieldColor}14`,
          borderColor: `${fieldColor}30`,
          borderWidth: 1,
        },
      ]}>
        {/* Glow proportional to intensity */}
        <View style={[styles.bloomGlow, {
          backgroundColor: fieldColor,
          opacity: 0.15 + Math.min(bloom.count / 6, 0.3),
          width: 20 + bloom.count * 3,
          height: 4 + bloom.count * 0.5,
        }]} />
        <Text style={styles.bloomIcon}>{eStyle.icon || "🌱"}</Text>
        <Text style={[styles.bloomLabel, { color: fieldColor }]} numberOfLines={1}>{bloomLabel}</Text>
        {bloom.count > 1 && <Text style={[styles.bloomCount, { color: fieldColor }]}>×{bloom.count}</Text>}
      </Animated.View>

      {/* Expanded detail overlay */}
      {isExpanded && (
        <View style={[styles.bloomDetail, { borderColor: `${fieldColor}40` }]}>
          <Text style={[styles.detailTitle, { color: fieldColor }]}>{bloomLabel}</Text>
          <Text style={styles.detailRow}>{t("garden.feltCount", { count: bloom.count }) || `Felt ${bloom.count}× today`}</Text>
          {triggerLabel && <Text style={styles.detailRow}>{t("garden.mostlyFrom", { trigger: triggerLabel }) || `Mostly from ${triggerLabel}`}</Text>}
          <Text style={styles.detailRow}>{t("garden.peak", { period: bloom.peakPeriod }) || `Peak: ${bloom.peakPeriod}`}</Text>
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: "rgba(13, 20, 36, 0.88)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
    gap: 10,
    overflow: "hidden",
    position: "relative",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  count: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: "600",
  },
  // ── Centroid mini-plane ──
  centroidRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  centroidField: {
    width: 36,
    height: 36,
    borderRadius: 6,
    backgroundColor: "rgba(6,10,18,0.6)",
    borderWidth: 1,
    position: "relative",
    overflow: "hidden",
  },
  centroidGridH: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148,180,224,0.12)",
  },
  centroidGridV: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148,180,224,0.12)",
  },
  centroidDot: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: -3,
    marginLeft: -3,
  },
  centroidLabel: {
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
  },
  // ── Bloom field ──
  bloomField: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "flex-start",
    paddingVertical: 4,
  },
  bloomSlot: {
    alignItems: "center",
    justifyContent: "center",
    minWidth: 52,
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderRadius: 10,
    position: "relative",
  },
  bloomIcon: {
    fontSize: 20,
    zIndex: 1,
  },
  bloomGlow: {
    position: "absolute",
    bottom: 10,
    borderRadius: 3,
  },
  bloomLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "capitalize",
    marginTop: 2,
    letterSpacing: 0.2,
  },
  bloomCount: {
    fontSize: 9,
    fontWeight: "700",
    marginTop: 1,
    opacity: 0.7,
  },
  // ── Expanded detail ──
  bloomDetail: {
    marginTop: 4,
    padding: 10,
    borderRadius: 8,
    backgroundColor: "rgba(13,20,36,0.95)",
    borderWidth: 1,
    gap: 3,
  },
  detailTitle: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  detailRow: {
    color: palette.textSecondary,
    fontSize: 11,
    lineHeight: 16,
  },
  // ── Seed placeholders ──
  seedSlot: {
    alignItems: "center",
    justifyContent: "center",
    width: 40,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
    borderStyle: "dashed",
  },
  seedIcon: {
    color: palette.muted,
    fontSize: 16,
    opacity: 0.4,
  },
});
