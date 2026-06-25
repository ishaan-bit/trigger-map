import { useRef } from "react";
import { Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Defs, RadialGradient, Stop, Circle } from "react-native-svg";
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

/* Soft luminous halo behind the icon, in the trigger's colour. */
function IconGlow({ color, id }) {
  return (
    <Svg width={86} height={86} style={styles.glow} pointerEvents="none">
      <Defs>
        <RadialGradient id={id} cx="50%" cy="50%" r="50%">
          <Stop offset="0" stopColor={color} stopOpacity="0.55" />
          <Stop offset="0.6" stopColor={color} stopOpacity="0.18" />
          <Stop offset="1" stopColor={color} stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Circle cx={43} cy={43} r={43} fill={`url(#${id})`} />
    </Svg>
  );
}

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
        style={[styles.tile, { borderColor: color + "59", shadowColor: color }]}
      >
        {/* Depth fill: trigger colour glass fading into deep space. */}
        <LinearGradient
          colors={[color + "2e", color + "12", "rgba(9, 14, 26, 0.65)"]}
          locations={[0, 0.5, 1]}
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={StyleSheet.absoluteFill}
          pointerEvents="none"
        />
        <View style={[styles.topHighlight, { backgroundColor: color + "66" }]} pointerEvents="none" />

        <View style={styles.iconArea}>
          <IconGlow color={color} id={`tile-${label}`} />
          <View style={[styles.iconDisc, { borderColor: color + "73", backgroundColor: color + "26" }]}>
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
    shadowOpacity: 0.28,
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
  iconArea: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  glow: { position: "absolute", top: -17, left: -17 },
  iconDisc: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
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
