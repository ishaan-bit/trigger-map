import { Pressable, StyleSheet, Text, View } from "react-native";
import { palette, radius } from "@/utils/theme";

const EMOTION_ICONS = {
  calm: "😌",
  neutral: "😐",
  anxious: "😰",
  frustrated: "😤",
  energized: "⚡",
};

const EMOTION_TINTS = {
  calm: { bg: "rgba(94,230,160,0.08)", border: "rgba(94,230,160,0.18)", active: "rgba(94,230,160,0.20)" },
  neutral: { bg: "rgba(148,180,224,0.08)", border: "rgba(148,180,224,0.14)", active: "rgba(148,180,224,0.18)" },
  anxious: { bg: "rgba(255,179,71,0.08)", border: "rgba(255,179,71,0.18)", active: "rgba(255,179,71,0.20)" },
  frustrated: { bg: "rgba(255,107,122,0.08)", border: "rgba(255,107,122,0.18)", active: "rgba(255,107,122,0.20)" },
  energized: { bg: "rgba(86,208,224,0.08)", border: "rgba(86,208,224,0.18)", active: "rgba(86,208,224,0.20)" },
};

const EMOTION_ACCENT = {
  calm: palette.success,
  neutral: palette.muted,
  anxious: palette.warning,
  frustrated: palette.danger,
  energized: palette.accent,
};

export function EmotionChip({ label, active, onPress }) {
  const tint = EMOTION_TINTS[label] || EMOTION_TINTS.neutral;
  const accentColor = EMOTION_ACCENT[label] || palette.muted;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Select ${label} emotion`}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? tint.active : tint.bg, borderColor: active ? accentColor : tint.border },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: active ? `${accentColor}22` : "rgba(255,255,255,0.06)" }]}>
        <Text style={styles.icon}>{EMOTION_ICONS[label] || "•"}</Text>
      </View>
      <Text style={[styles.label, active && { color: accentColor }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: 52,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 18,
  },
  label: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
    textTransform: "capitalize",
  },
});