import { Pressable, StyleSheet, Text, View } from "react-native";
import { palette } from "@/utils/theme";

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
  other: "📌",
};

export function TriggerTile({ label, onPress }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Log ${label} trigger`}
      onPress={onPress}
      style={({ pressed }) => [styles.tile, pressed && styles.pressed]}
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
    aspectRatio: 0.88,
    borderRadius: 22,
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
    gap: 8,
  },
  pressed: {
    backgroundColor: palette.cardGlow,
    borderColor: "rgba(123,201,216,0.28)",
    transform: [{ scale: 0.96 }],
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.06)",
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 24,
  },
  label: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "capitalize",
    textAlign: "center",
    letterSpacing: 0.2,
  },
});