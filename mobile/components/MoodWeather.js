import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { palette, radius } from "@/utils/theme";

const WEATHER_MAP = {
  clear:      { icon: "☀️", label: "Clear skies",  color: palette.success, desc: "Mostly calm, your recent moments feel settled." },
  clearing:   { icon: "🌤️", label: "Clearing up",  color: palette.success, desc: "Leaning positive, more calm than tension today." },
  neutral:    { icon: "🌤️", label: "Partly clear",  color: palette.muted,   desc: "A steady mix, nothing pulling too hard in any direction." },
  overcast:   { icon: "🌧️", label: "Overcast",      color: palette.warning, desc: "Some tension showing up. Be gentle with yourself." },
  turbulent:  { icon: "⛈️", label: "Turbulent",     color: palette.danger,  desc: "Frustration running high, something is grinding." },
  electric:   { icon: "⚡", label: "Electric",      color: palette.accent,  desc: "High energy, you're riding a wave right now." },
  mixed:      { icon: "🌦️", label: "Changeable",    color: palette.purple,  desc: "Emotions shifting, your inner weather is restless today." },
  quiet:      { icon: "🌙", label: "Still night",   color: palette.muted,   desc: "Not much data yet today, log a moment to see your forecast." },
};

// Higher = calmer/more positive. Matches shared/constants/emotions.js EMOTION_SCORE.
const SCORE = { frustrated: 1, anxious: 2, neutral: 3, calm: 4, energized: 5 };
// Recency weight — more recent moments count more
function recencyWeight(ageMs) {
  const hours = ageMs / 3_600_000;
  if (hours < 2) return 1.5;
  if (hours < 6) return 1.2;
  return 1.0;
}

/**
 * Compute the "weather" from recent moments using weighted average scoring
 * instead of naive frequency counting. This means 3 calm + 1 anxious won't
 * flip to Overcast — the average tone actually matters.
 */
function computeWeather(moments) {
  if (!moments?.length) return WEATHER_MAP.quiet;

  const now = Date.now();
  const recent = moments.filter(
    (m) => now - new Date(m.timestamp).getTime() < 24 * 60 * 60 * 1000
  );

  if (recent.length === 0) return WEATHER_MAP.quiet;

  // Weighted average score
  let totalWeight = 0;
  let weightedSum = 0;
  const counts = {};
  for (const m of recent) {
    const w = recencyWeight(now - new Date(m.timestamp).getTime());
    weightedSum += (SCORE[m.emotion] || 3) * w;
    totalWeight += w;
    counts[m.emotion] = (counts[m.emotion] || 0) + 1;
  }
  const avg = weightedSum / totalWeight; // 1-5 scale

  // Variance check for "mixed"
  const distinctEmotions = Object.keys(counts).length;
  if (distinctEmotions >= 3) {
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] - (sorted[1]?.[1] || 0) <= 1) return WEATHER_MAP.mixed;
  }

  // Check if energized is clearly dominant (>= 50% of moments)
  if (counts.energized && counts.energized >= recent.length * 0.5) {
    return WEATHER_MAP.electric;
  }

  // Map weighted average to weather
  if (avg >= 4.0) return WEATHER_MAP.clear;
  if (avg >= 3.3) return WEATHER_MAP.clearing;
  if (avg >= 2.6) return WEATHER_MAP.neutral;
  if (avg >= 1.8) return WEATHER_MAP.overcast;
  return WEATHER_MAP.turbulent;
}

/**
 * Emotional weather ribbon — shows the user's current inner forecast.
 * Appears on TimelineScreen and TriggerSelectionScreen.
 */
export function MoodWeather({ moments }) {
  const weather = computeWeather(moments);
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const breatheAnim = useRef(new Animated.Value(0)).current;
  const showBreathe = weather === WEATHER_MAP.overcast || weather === WEATHER_MAP.turbulent;

  useEffect(() => {
    Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();
  }, [shimmerAnim]);

  useEffect(() => {
    if (showBreathe) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(breatheAnim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(breatheAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      ).start();
    }
  }, [showBreathe, breatheAnim]);

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });
  const breatheScale = breatheAnim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1.2] });
  const breatheOpacity = breatheAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.7] });

  return (
    <View style={[styles.ribbon, { borderColor: `${weather.color}30` }]}>
      <Animated.View
        style={[
          styles.shimmer,
          { backgroundColor: weather.color, transform: [{ translateX: shimmerTranslate }] },
        ]}
      />
      <View style={styles.row}>
        <Text style={styles.icon}>{weather.icon}</Text>
        <View style={styles.textCol}>
          <Text style={[styles.label, { color: weather.color }]}>{weather.label}</Text>
          <Text style={styles.desc}>{weather.desc}</Text>
        </View>
      </View>
      {showBreathe && (
        <View style={styles.breatheRow}>
          <Animated.View style={[styles.breatheDot, {
            backgroundColor: weather.color,
            transform: [{ scale: breatheScale }],
            opacity: breatheOpacity,
          }]} />
          <Text style={styles.breatheText}>Breathe with the dot</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  ribbon: {
    borderRadius: radius.md,
    padding: 14,
    backgroundColor: "rgba(13, 20, 36, 0.80)",
    borderWidth: 1,
    overflow: "hidden",
  },
  shimmer: {
    position: "absolute",
    top: 0,
    left: 0,
    width: 120,
    height: "100%",
    opacity: 0.04,
    borderRadius: radius.md,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  icon: {
    fontSize: 28,
  },
  textCol: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.3,
  },
  desc: {
    color: palette.textSecondary,
    fontSize: 12,
    lineHeight: 17,
  },
  breatheRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.04)",
  },
  breatheDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  breatheText: {
    color: palette.muted,
    fontSize: 11,
    fontStyle: "italic",
  },
});
