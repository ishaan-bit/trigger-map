import { useEffect, useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { palette, radius } from "@/utils/theme";
import { emotionTap } from "@/utils/haptics";

const EMOTION_ICONS = {
  calm: "😌",
  neutral: "😐",
  anxious: "😰",
  frustrated: "😤",
  energized: "⚡",
};

const EMOTION_TINTS = {
  calm: { bg: "rgba(94,230,160,0.40)", border: "rgba(94,230,160,0.50)", active: "rgba(94,230,160,0.60)" },
  neutral: { bg: "rgba(148,180,224,0.40)", border: "rgba(148,180,224,0.48)", active: "rgba(148,180,224,0.58)" },
  anxious: { bg: "rgba(255,179,71,0.40)", border: "rgba(255,179,71,0.50)", active: "rgba(255,179,71,0.60)" },
  frustrated: { bg: "rgba(255,107,122,0.40)", border: "rgba(255,107,122,0.50)", active: "rgba(255,107,122,0.60)" },
  energized: { bg: "rgba(86,208,224,0.40)", border: "rgba(86,208,224,0.50)", active: "rgba(86,208,224,0.60)" },
};

const EMOTION_ACCENT = {
  calm: palette.success,
  neutral: "#b0c4de",
  anxious: palette.warning,
  frustrated: palette.danger,
  energized: palette.accent,
};

export function EmotionChip({ label, active, onPress }) {
  const tint = EMOTION_TINTS[label] || EMOTION_TINTS.neutral;
  const accentColor = EMOTION_ACCENT[label] || palette.muted;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (active) {
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.08, duration: 120, useNativeDriver: true }),
        Animated.spring(pulseAnim, { toValue: 1, friction: 4, tension: 120, useNativeDriver: true }),
      ]).start();
    }
  }, [active, pulseAnim]);

  return (
    <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
      <Pressable
        onPress={() => { emotionTap(label); onPress?.(); }}
        accessibilityRole="button"
        accessibilityLabel={`Select ${label} emotion`}
        style={({ pressed }) => [
          styles.chip,
          {
            backgroundColor: active ? tint.active : tint.bg,
            borderColor: active ? accentColor : tint.border,
          },
          active && { shadowColor: accentColor, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.4, shadowRadius: 10, elevation: 6 },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.iconWrap, { backgroundColor: active ? `${accentColor}33` : "rgba(255,255,255,0.08)" }]}>
          <Text style={styles.icon}>{EMOTION_ICONS[label] || "•"}</Text>
        </View>
        <Text style={[styles.label, active && { color: palette.text }]}>{label}</Text>
      </Pressable>
    </Animated.View>
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
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 18,
  },
  label: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "700",
    textTransform: "capitalize",
  },
});