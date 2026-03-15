import { Pressable, StyleSheet, Text, View } from "react-native";
import { palette } from "@/utils/theme";

const EMOTION_ICONS = {
  calm: "😌",
  neutral: "😐",
  anxious: "😰",
  frustrated: "😤",
  energized: "⚡",
};

const EMOTION_TINTS = {
  calm: "rgba(136,212,152,0.14)",
  neutral: "rgba(149,166,189,0.14)",
  anxious: "rgba(240,185,106,0.14)",
  frustrated: "rgba(240,127,132,0.14)",
  energized: "rgba(123,201,216,0.14)",
};

export function EmotionChip({ label, active, onPress }) {
  const tint = EMOTION_TINTS[label] || "rgba(255,255,255,0.04)";
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${label} emotion`}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? "rgba(113,197,212,0.18)" : tint },
        active && styles.activeChip,
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{EMOTION_ICONS[label] || "•"}</Text>
      </View>
      <Text style={[styles.label, active && styles.activeLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.border,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  activeChip: {
    borderColor: palette.accent,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 18,
  },
  label: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "600",
    textTransform: "capitalize",
  },
  activeLabel: {
    color: palette.accent,
  },
});