import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { palette, radius } from "@/utils/theme";
import { EMOTION_STYLES } from "@/utils/designSystem";

/**
 * EmotionGarden — a visual row of "planted" emotion seeds from today's moments.
 * Each moment becomes a small bloom. Inspired by indie-game terrarium/garden
 * mechanics where tiny player actions slowly fill a living scene.
 */

const BLOOM = {
  calm:       { seed: "🌿", bloom: "🌸", color: "#5ee6a0" },
  neutral:    { seed: "🌱", bloom: "🌼", color: "#9eb0c9" },
  anxious:    { seed: "🍂", bloom: "🍁", color: "#ffb347" },
  frustrated: { seed: "🪨", bloom: "🔥", color: "#ff6b7a" },
  energized:  { seed: "⚡", bloom: "🌻", color: "#a78bfa" },
};

export function EmotionGarden({ moments }) {
  const todayBlooms = getTodayBlooms(moments);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (todayBlooms.length > 0) {
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    }
  }, [todayBlooms.length, fadeAnim]);

  if (todayBlooms.length === 0) return null;

  return (
    <Animated.View style={[styles.wrap, { opacity: fadeAnim }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Today's garden</Text>
        <Text style={styles.count}>{todayBlooms.length} bloom{todayBlooms.length !== 1 ? "s" : ""}</Text>
      </View>
      <View style={styles.row}>
        {todayBlooms.map((b, i) => (
          <BloomItem key={`${b.emotion}-${i}`} bloom={b} index={i} isNewest={i === todayBlooms.length - 1} />
        ))}
        {/* Empty soil slots for visual rhythm */}
        {todayBlooms.length < 6 && Array.from({ length: Math.min(3, 6 - todayBlooms.length) }).map((_, i) => (
          <View key={`empty-${i}`} style={styles.emptySlot}>
            <Text style={styles.emptyDot}>·</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

function BloomItem({ bloom, index, isNewest }) {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const targetScale = isNewest ? 1.15 : 1;

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: targetScale,
      friction: 5,
      tension: 60,
      delay: index * 100,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim, index, targetScale]);

  const meta = BLOOM[bloom.emotion] || BLOOM.neutral;
  const eStyle = EMOTION_STYLES[bloom.emotion] || EMOTION_STYLES.neutral;
  const icon = bloom.isMature ? meta.bloom : meta.seed;
  const label = bloom.emotion;

  return (
    <Animated.View style={[styles.bloomSlot, {
      transform: [{ scale: scaleAnim }],
      backgroundColor: eStyle.bg,
      borderColor: eStyle.border,
      borderWidth: 1,
    }]}>
      <Text style={styles.bloomIcon}>{icon}</Text>
      <View style={[styles.bloomGlow, { backgroundColor: eStyle.color }]} />
      <Text style={[styles.bloomLabel, { color: eStyle.color }]} numberOfLines={1}>{label}</Text>
    </Animated.View>
  );
}

function getTodayBlooms(moments) {
  if (!moments?.length) return [];
  const today = new Date().toDateString();
  const todayMoments = moments.filter(
    (m) => new Date(m.timestamp).toDateString() === today
  );
  // A bloom is "mature" if more than 1 hour old (the emotion had time to settle)
  const now = Date.now();
  return todayMoments
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .slice(0, 8) // max 8 blooms visible
    .map((m) => ({
      emotion: m.emotion,
      isMature: now - new Date(m.timestamp).getTime() > 3_600_000,
    }));
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: "rgba(13, 20, 36, 0.50)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.04)",
    gap: 10,
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
    color: palette.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  row: {
    flexDirection: "row",
    gap: 6,
    alignItems: "flex-end",
  },
  bloomSlot: {
    alignItems: "center",
    justifyContent: "center",
    width: 44,
    height: 52,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.03)",
    position: "relative",
  },
  bloomIcon: {
    fontSize: 20,
    zIndex: 1,
  },
  bloomGlow: {
    position: "absolute",
    bottom: 12,
    width: 24,
    height: 4,
    borderRadius: 2,
    opacity: 0.3,
  },
  bloomLabel: {
    fontSize: 8,
    fontWeight: "600",
    textTransform: "capitalize",
    marginTop: 2,
    letterSpacing: 0.2,
  },
  emptySlot: {
    alignItems: "center",
    justifyContent: "center",
    width: 36,
    height: 40,
    borderRadius: 8,
    backgroundColor: "rgba(255,255,255,0.02)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
    borderStyle: "dashed",
  },
  emptyDot: {
    color: palette.muted,
    fontSize: 16,
    opacity: 0.4,
  },
});
