import { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { palette, radius } from "@/utils/theme";
import { tap } from "@/utils/haptics";

const TRIGGER_ICONS = {
  work: "🏢",
  social: "👥",
  money: "💰",
  family: "🏠",
  exercise: "🏃",
  health: "💊",
  sleep: "😴",
  partner: "💛",
  alone: "🧘",
  travel: "📍",
  other: "📌",
};

const TRIGGER_TINTS = {
  work: { bg: "rgba(167, 139, 250, 0.18)", glow: "rgba(167, 139, 250, 0.30)" },
  social: { bg: "rgba(86, 208, 224, 0.18)", glow: "rgba(86, 208, 224, 0.30)" },
  money: { bg: "rgba(255, 179, 71, 0.18)", glow: "rgba(255, 179, 71, 0.30)" },
  family: { bg: "rgba(94, 230, 160, 0.18)", glow: "rgba(94, 230, 160, 0.30)" },
  exercise: { bg: "rgba(86, 208, 224, 0.18)", glow: "rgba(86, 208, 224, 0.30)" },
  health: { bg: "rgba(255, 107, 122, 0.18)", glow: "rgba(255, 107, 122, 0.30)" },
  sleep: { bg: "rgba(167, 139, 250, 0.18)", glow: "rgba(167, 139, 250, 0.30)" },
  partner: { bg: "rgba(255, 179, 71, 0.18)", glow: "rgba(255, 179, 71, 0.30)" },
  alone: { bg: "rgba(94, 230, 160, 0.18)", glow: "rgba(94, 230, 160, 0.30)" },
  travel: { bg: "rgba(86, 208, 224, 0.18)", glow: "rgba(86, 208, 224, 0.30)" },
  other: { bg: "rgba(148, 180, 224, 0.14)", glow: "rgba(148, 180, 224, 0.24)" },
};

export function TriggerTile({ label, onPress }) {
  const tint = TRIGGER_TINTS[label] || TRIGGER_TINTS.other;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  function handlePressIn() {
    tap();
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      friction: 5,
      tension: 120,
      useNativeDriver: true,
    }).start();
  }

  function handlePressOut() {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 80,
      useNativeDriver: true,
    }).start();
  }

  return (
    <Animated.View style={[styles.tileWrap, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Log ${label} trigger`}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.tile, { backgroundColor: tint.bg }]}
      >
        <View style={[styles.iconWrap, { shadowColor: tint.glow }]}>
          <Text style={styles.icon}>{TRIGGER_ICONS[label] || "📌"}</Text>
        </View>
        <Text style={styles.label}>{label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tileWrap: {
    width: "100%",
  },
  tile: {
    aspectRatio: 1.1,
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.glassBorder,
    gap: 6,
    shadowColor: "rgba(86, 208, 224, 0.15)",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 3,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "rgba(255,255,255,0.10)",
    alignItems: "center",
    justifyContent: "center",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 8,
    elevation: 2,
  },
  icon: {
    fontSize: 22,
  },
  label: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
    textAlign: "center",
    letterSpacing: 0.3,
  },
});