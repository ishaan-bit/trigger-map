import { useCallback, useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import { palette, radius } from "@/utils/theme";

const CURSOR_SIZE = 36;
const CURSOR_HALF = CURSOR_SIZE / 2;

// ── Quadrant label positions ──
const QUADRANT_LABELS = [
  { key: "tl", valence: "negative", arousal: "high" },   // top-left: anxious/angry
  { key: "tr", valence: "positive", arousal: "high" },   // top-right: energized/excited
  { key: "bl", valence: "negative", arousal: "low" },    // bottom-left: low/sad
  { key: "br", valence: "positive", arousal: "low" },    // bottom-right: calm/peaceful
];

export function EmotionPad({ value, onChange, accentColor, derivedLabel, regionLabel, t }) {
  const padWidth = useSharedValue(280);
  const padHeight = useSharedValue(280);
  const cursorX = useSharedValue(140);
  const cursorY = useSharedValue(140);
  const isDragging = useSharedValue(0);

  // Sync cursor to external value when not dragging
  useEffect(() => {
    if (isDragging.value) return;
    const x = ((value.valence + 1) / 2) * padWidth.value;
    const y = ((1 - (value.arousal + 1) / 2)) * padHeight.value;
    cursorX.value = withSpring(x, { damping: 20, stiffness: 300 });
    cursorY.value = withSpring(y, { damping: 20, stiffness: 300 });
  }, [value.valence, value.arousal]);

  const emitChange = useCallback((valence, arousal) => {
    const v = Math.round(valence * 100) / 100;
    const a = Math.round(arousal * 100) / 100;
    const intensity = Math.min(1, Math.round(Math.sqrt(v * v + a * a) * 100) / 100);
    onChange(v, a, intensity);
  }, [onChange]);

  const gesture = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      "worklet";
      const x = Math.max(0, Math.min(padWidth.value, e.x));
      const y = Math.max(0, Math.min(padHeight.value, e.y));
      cursorX.value = x;
      cursorY.value = y;
      isDragging.value = 1;
      const valence = (x / padWidth.value) * 2 - 1;
      const arousal = -((y / padHeight.value) * 2 - 1);
      runOnJS(emitChange)(valence, arousal);
    })
    .onUpdate((e) => {
      "worklet";
      const x = Math.max(0, Math.min(padWidth.value, e.x));
      const y = Math.max(0, Math.min(padHeight.value, e.y));
      cursorX.value = x;
      cursorY.value = y;
      const valence = (x / padWidth.value) * 2 - 1;
      const arousal = -((y / padHeight.value) * 2 - 1);
      runOnJS(emitChange)(valence, arousal);
    })
    .onEnd(() => {
      "worklet";
      isDragging.value = 0;
    })
    .onFinalize(() => {
      "worklet";
      isDragging.value = 0;
    });

  const cursorStyle = useAnimatedStyle(() => {
    const scale = interpolate(isDragging.value, [0, 1], [1, 1.25], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: cursorX.value - CURSOR_HALF },
        { translateY: cursorY.value - CURSOR_HALF },
        { scale },
      ],
    };
  });

  const cursorGlowStyle = useAnimatedStyle(() => {
    const scale = interpolate(isDragging.value, [0, 1], [1, 1.6], Extrapolation.CLAMP);
    const opacity = interpolate(isDragging.value, [0, 1], [0.15, 0.35], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [
        { translateX: cursorX.value - CURSOR_SIZE },
        { translateY: cursorY.value - CURSOR_SIZE },
        { scale },
      ],
    };
  });

  const crosshairHStyle = useAnimatedStyle(() => ({
    top: cursorY.value,
  }));
  const crosshairVStyle = useAnimatedStyle(() => ({
    left: cursorX.value,
  }));

  const labelLive = derivedLabel || "neutral";
  const regionLive = regionLabel || "";

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text style={styles.eyebrow}>{t("emotion.liveRead")}</Text>
        <Text style={[styles.regionBadge, { color: accentColor }]}>{regionLive}</Text>
      </View>
      <Text style={[styles.liveLabel, { color: accentColor }]}>{labelLive}</Text>

      {/* The 2D Pad */}
      <View style={styles.padOuter}>
        {/* Axis labels */}
        <Text style={[styles.axisLabel, styles.axisTop]}>{t("emotion.axisEnergyRight")}</Text>
        <Text style={[styles.axisLabel, styles.axisBottom]}>{t("emotion.axisEnergyLeft")}</Text>
        <Text style={[styles.axisLabel, styles.axisLeft]}>{t("emotion.axisFeelLeft")}</Text>
        <Text style={[styles.axisLabel, styles.axisRight]}>{t("emotion.axisFeelRight")}</Text>

        <GestureDetector gesture={gesture}>
          <Animated.View
            style={styles.pad}
            onLayout={(e) => {
              padWidth.value = e.nativeEvent.layout.width;
              padHeight.value = e.nativeEvent.layout.height;
              // Set initial cursor from current value
              const x = ((value.valence + 1) / 2) * e.nativeEvent.layout.width;
              const y = ((1 - (value.arousal + 1) / 2)) * e.nativeEvent.layout.height;
              cursorX.value = x;
              cursorY.value = y;
            }}
          >
            {/* Background gradient — four emotional quadrants */}
            <LinearGradient
              colors={[
                "rgba(255, 107, 122, 0.22)",  // top-left: anxious (red)
                "rgba(86, 208, 224, 0.22)",    // top-right: energized (cyan)
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { top: 0, height: "50%" }]}
            />
            <LinearGradient
              colors={[
                "rgba(167, 139, 250, 0.22)",   // bottom-left: low (purple)
                "rgba(94, 230, 160, 0.22)",    // bottom-right: calm (green)
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { top: "50%", height: "50%" }]}
            />

            {/* Grid lines — center cross */}
            <View style={styles.gridH} />
            <View style={styles.gridV} />

            {/* Subtle quadrant emotion hints */}
            <Text style={[styles.quadrantHint, styles.qTopLeft]}>{t("emotion.qAnxious") || "anxious"}</Text>
            <Text style={[styles.quadrantHint, styles.qTopRight]}>{t("emotion.qEnergized") || "energized"}</Text>
            <Text style={[styles.quadrantHint, styles.qBottomLeft]}>{t("emotion.qLow") || "low"}</Text>
            <Text style={[styles.quadrantHint, styles.qBottomRight]}>{t("emotion.qCalm") || "calm"}</Text>

            {/* Dynamic crosshairs following cursor */}
            <Animated.View style={[styles.crosshairH, crosshairHStyle]} />
            <Animated.View style={[styles.crosshairV, crosshairVStyle]} />

            {/* Cursor glow */}
            <Animated.View style={[styles.cursorGlow, { backgroundColor: accentColor }, cursorGlowStyle]} />

            {/* Cursor */}
            <Animated.View style={[styles.cursor, { borderColor: accentColor }, cursorStyle]}>
              <View style={[styles.cursorCore, { backgroundColor: accentColor }]} />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>

      {/* Coordinate readout */}
      <View style={styles.coordRow}>
        <Text style={styles.coordText}>
          {t("emotion.axisFeelQuestion").replace("?", "")}: {value.valence > 0 ? "+" : ""}{value.valence.toFixed(2)}
        </Text>
        <Text style={styles.coordDot}>·</Text>
        <Text style={styles.coordText}>
          {t("emotion.axisEnergyQuestion").replace("?", "")}: {value.arousal > 0 ? "+" : ""}{value.arousal.toFixed(2)}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    gap: 10,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  eyebrow: {
    color: palette.textSecondary,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  regionBadge: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  liveLabel: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: "800",
    textTransform: "capitalize",
    marginBottom: 4,
  },
  padOuter: {
    position: "relative",
    paddingTop: 22,
    paddingBottom: 22,
    paddingLeft: 4,
    paddingRight: 4,
  },
  pad: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "rgba(6, 10, 18, 0.6)",
    borderWidth: 1,
    borderColor: "rgba(148, 180, 224, 0.12)",
  },
  // ── Grid ──
  gridH: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(148, 180, 224, 0.12)",
  },
  gridV: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(148, 180, 224, 0.12)",
  },
  // ── Crosshairs (follow cursor) ──
  crosshairH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(148, 180, 224, 0.06)",
  },
  crosshairV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: "rgba(148, 180, 224, 0.06)",
  },
  // ── Quadrant hints ──
  quadrantHint: {
    position: "absolute",
    color: "rgba(184, 200, 216, 0.30)",
    fontSize: 11,
    fontWeight: "600",
    textTransform: "lowercase",
  },
  qTopLeft: { top: 10, left: 10 },
  qTopRight: { top: 10, right: 10 },
  qBottomLeft: { bottom: 10, left: 10 },
  qBottomRight: { bottom: 10, right: 10 },
  // ── Cursor ──
  cursorGlow: {
    position: "absolute",
    width: CURSOR_SIZE * 2,
    height: CURSOR_SIZE * 2,
    borderRadius: CURSOR_SIZE,
  },
  cursor: {
    position: "absolute",
    width: CURSOR_SIZE,
    height: CURSOR_SIZE,
    borderRadius: CURSOR_SIZE / 2,
    backgroundColor: palette.surface,
    borderWidth: 2.5,
    alignItems: "center",
    justifyContent: "center",
    // Shadow for depth
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  cursorCore: {
    width: 14,
    height: 14,
    borderRadius: 7,
  },
  // ── Axis labels ──
  axisLabel: {
    position: "absolute",
    color: palette.muted,
    fontSize: 11,
    fontWeight: "600",
  },
  axisTop: {
    top: 2,
    alignSelf: "center",
    left: 0,
    right: 0,
    textAlign: "center",
  },
  axisBottom: {
    bottom: 2,
    left: 0,
    right: 0,
    textAlign: "center",
  },
  axisLeft: {
    top: "50%",
    left: -2,
    transform: [{ rotate: "-90deg" }, { translateX: -20 }],
  },
  axisRight: {
    top: "50%",
    right: -2,
    transform: [{ rotate: "90deg" }, { translateX: 20 }],
  },
  // ── Coordinate readout ──
  coordRow: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    marginTop: 2,
  },
  coordText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  coordDot: {
    color: palette.muted,
    fontSize: 12,
  },
});
