import { Pressable, StyleSheet, Text, View } from "react-native";
import { palette, radius } from "@/utils/theme";

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
  work: "rgba(167, 139, 250, 0.10)",
  social: "rgba(86, 208, 224, 0.10)",
  money: "rgba(255, 179, 71, 0.10)",
  family: "rgba(94, 230, 160, 0.10)",
  exercise: "rgba(86, 208, 224, 0.10)",
  health: "rgba(255, 107, 122, 0.10)",
  sleep: "rgba(167, 139, 250, 0.10)",
  partner: "rgba(255, 179, 71, 0.10)",
  alone: "rgba(94, 230, 160, 0.10)",
  travel: "rgba(86, 208, 224, 0.10)",
  other: "rgba(148, 180, 224, 0.08)",
};

export function TriggerTile({ label, onPress }) {
  const tint = TRIGGER_TINTS[label] || "rgba(148, 180, 224, 0.08)";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Log ${label} trigger`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, { backgroundColor: tint }, pressed && styles.pressed]}
    >
      <View style={styles.iconWrap}>
        <Text style={styles.icon}>{TRIGGER_ICONS[label] || "📌"}</Text>
      </View>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tile: {
    width: "30%",
    aspectRatio: 1.1,
    borderRadius: radius.lg,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: palette.glassBorder,
    gap: 6,
  },
  pressed: {
    borderColor: palette.accent,
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: palette.glass,
    alignItems: "center",
    justifyContent: "center",
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