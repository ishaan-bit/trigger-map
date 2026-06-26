import { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { palette, radius } from "@/utils/theme";
import { tap } from "@/utils/haptics";
import { useLanguage } from "@/i18n/LanguageContext";
import { TRIGGER_COLORS } from "@/utils/designSystem";

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

export function TriggerTile({ label, onPress }) {
  const color = TRIGGER_COLORS[label] || palette.accent;
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const { t } = useLanguage();
  const displayLabel = t("triggers." + label) || label;

  function handlePressIn() {
    tap();
    Animated.spring(scaleAnim, { toValue: 0.93, friction: 5, tension: 140, useNativeDriver: true }).start();
  }
  function handlePressOut() {
    Animated.spring(scaleAnim, { toValue: 1, friction: 4, tension: 80, useNativeDriver: true }).start();
  }

  return (
    <Animated.View style={[styles.tileWrap, { transform: [{ scale: scaleAnim }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={displayLabel}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[styles.tile, { borderColor: color + "4d", shadowColor: color }]}
      >
        {/* Depth fill: trigger colour glass fading into deep space. */}
        <LinearGradient
          colors={[color + "29", color + "10", "rgba(9, 14, 26, 0.55)"]}
          locations={[0, 0.55, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[styles.topHighlight, { backgroundColor: color + "5e" }]} pointerEvents="none" />

        <View style={styles.iconArea}>
          {/* Soft luminous halo — plain Views (no SVG layer → no Android black box). */}
          <View style={[styles.halo, { backgroundColor: color + "1f" }]} pointerEvents="none" />
          <View style={[styles.haloInner, { backgroundColor: color + "2e" }]} pointerEvents="none" />
          <View style={[styles.iconDisc, { borderColor: color + "73", shadowColor: color }]}>
            <Text style={styles.icon}>{TRIGGER_ICONS[label] || "📌"}</Text>
          </View>
        </View>
        <Text style={styles.label}>{displayLabel}</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  tileWrap: { width: "100%" },
  tile: {
    aspectRatio: 1.05,
    borderRadius: radius.lg,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
    backgroundColor: "rgba(11, 17, 30, 0.5)",
    gap: 9,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.26,
    shadowRadius: 14,
    elevation: 4,
  },
  topHighlight: {
    position: "absolute",
    top: 0,
    left: radius.lg,
    right: radius.lg,
    height: 1,
  },
  iconArea: { width: 56, height: 56, alignItems: "center", justifyContent: "center" },
  halo: {
    position: "absolute",
    width: 56,
    height: 56,
    borderRadius: 28,
    opacity: 0.9,
  },
  haloInner: {
    position: "absolute",
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  iconDisc: {
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(8, 13, 24, 0.55)",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 9,
  },
  icon: { fontSize: 24 },
  label: {
    color: "#f3f7fc",
    fontSize: 13,
    fontWeight: "700",
    textTransform: "capitalize",
    textAlign: "center",
    letterSpacing: 0.3,
  },
});
