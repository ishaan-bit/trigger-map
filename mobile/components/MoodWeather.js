import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { palette, radius } from "@/utils/theme";

const WEATHER_MAP = {
  calm: { icon: "☀️", label: "Clear skies", color: palette.success, desc: "Mostly calm — your recent moments feel settled." },
  neutral: { icon: "🌤️", label: "Partly clear", color: palette.muted, desc: "A steady mix — nothing pulling too hard in any direction." },
  anxious: { icon: "🌧️", label: "Overcast", color: palette.warning, desc: "Some tension building — anxiety has shown up a few times." },
  frustrated: { icon: "⛈️", label: "Turbulent", color: palette.danger, desc: "Frustration running high — something is grinding." },
  energized: { icon: "⚡", label: "Electric", color: palette.accent, desc: "High energy — you're riding a wave right now." },
  mixed: { icon: "🌦️", label: "Changeable", color: palette.purple, desc: "Emotions shifting — your inner weather is restless today." },
  quiet: { icon: "🌙", label: "Still night", color: palette.muted, desc: "Not much data yet today — log a moment to see your forecast." },
};

/**
 * Compute the dominant "weather" from recent moments.
 */
function computeWeather(moments) {
  if (!moments?.length) return WEATHER_MAP.quiet;

  const now = Date.now();
  const recent = moments.filter(
    (m) => now - new Date(m.timestamp).getTime() < 24 * 60 * 60 * 1000
  );

  if (recent.length === 0) return WEATHER_MAP.quiet;

  const counts = {};
  for (const m of recent) {
    counts[m.emotion] = (counts[m.emotion] || 0) + 1;
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const top = sorted[0];
  const second = sorted[1];

  // If nearly tied, it's "mixed"
  if (second && top[1] - second[1] <= 1 && sorted.length >= 3) {
    return WEATHER_MAP.mixed;
  }

  return WEATHER_MAP[top[0]] || WEATHER_MAP.neutral;
}

/**
 * Emotional weather ribbon — shows the user's current inner forecast.
 * Appears on TimelineScreen and TriggerSelectionScreen.
 */
export function MoodWeather({ moments }) {
  const weather = computeWeather(moments);
  const shimmerAnim = useRef(new Animated.Value(0)).current;

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

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-200, 200],
  });

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
});
