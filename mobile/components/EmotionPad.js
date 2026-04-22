import { useCallback, useEffect, useMemo, useRef } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from "react-native-reanimated";
import { LinearGradient } from "expo-linear-gradient";
import * as Haptics from "expo-haptics";
import { palette, radius } from "@/utils/theme";

const CURSOR_SIZE = 40;
const CURSOR_HALF = CURSOR_SIZE / 2;
const HIT_SLOP = 24; // invisible touch padding around pad
const CENTER_MAGNETIC_RADIUS = 0.08; // snap threshold near center
const SPRING_CURSOR = { damping: 28, stiffness: 400, mass: 0.8 };
const TRAIL_SIZE = 6;
const TRAIL_OPACITIES = [0.22, 0.15, 0.10, 0.06, 0.03];

/**
 * Generate a human-readable intensity-qualified summary from coords.
 * e.g. "calm and steady", "slightly anxious", "highly energized"
 */
function humanSummary(valence, arousal, t) {
  const mag = Math.sqrt(valence * valence + arousal * arousal);
  if (mag < 0.12) return t("emotion.summaryNeutral") || "Centered and steady";

  // Determine intensity prefix
  let prefix = "";
  if (mag > 0.7) prefix = t("emotion.intensityHigh") || "Very ";
  else if (mag > 0.4) prefix = "";
  else prefix = t("emotion.intensityLow") || "Slightly ";

  // Determine core feel
  const v = valence;
  const a = arousal;
  if (v > 0.15 && a > 0.15)   return prefix + (t("emotion.summaryEnergized") || "energized");
  if (v > 0.15 && a < -0.15)  return prefix + (t("emotion.summaryCalm") || "calm");
  if (v > 0.15)               return prefix + (t("emotion.summaryContent") || "good");
  if (v < -0.15 && a > 0.15)  return prefix + (t("emotion.summaryAnxious") || "anxious");
  if (v < -0.15 && a < -0.15) return prefix + (t("emotion.summaryLow") || "low");
  if (v < -0.15)              return prefix + (t("emotion.summaryOff") || "off");
  if (a > 0.15)               return prefix + (t("emotion.summaryAlert") || "alert");
  if (a < -0.15)              return prefix + (t("emotion.summaryFlat") || "flat");
  return t("emotion.summaryNeutral") || "Centered and steady";
}

export function EmotionPad({ value, onChange, accentColor, derivedLabel, regionLabel, t }) {
  const padSize = useSharedValue(280);
  const cursorX = useSharedValue(140);
  const cursorY = useSharedValue(140);
  const isDragging = useSharedValue(0);
  const prevQuadrant = useSharedValue(-1);
  const cursorPop = useSharedValue(1);

  // Trail positions (5 past cursor locations)
  const t0x = useSharedValue(140); const t0y = useSharedValue(140);
  const t1x = useSharedValue(140); const t1y = useSharedValue(140);
  const t2x = useSharedValue(140); const t2y = useSharedValue(140);
  const t3x = useSharedValue(140); const t3y = useSharedValue(140);
  const t4x = useSharedValue(140); const t4y = useSharedValue(140);

  // Axis crossing flash
  const axisFlashH = useSharedValue(0);
  const axisFlashV = useSharedValue(0);
  const prevSideH = useSharedValue(-1);
  const prevSideV = useSharedValue(-1);

  // Label animation
  const labelScale = useSharedValue(1);
  const prevLabelRef = useRef(derivedLabel);
  // Once user has touched the pad, the gesture worklet is the source of truth
  // for the cursor position. JS-state→cursor sync would race with finishing
  // gestures and cause the cursor to spring back along the drag path.
  const userTouchedRef = useRef(false);

  useEffect(() => {
    if (prevLabelRef.current !== derivedLabel) {
      prevLabelRef.current = derivedLabel;
      labelScale.value = 0.88;
      labelScale.value = withSpring(1, { damping: 14, stiffness: 220 });
    }
  }, [derivedLabel]);

  // Sync cursor to external value ONLY before the user has touched the pad
  // (e.g. initial mount, or programmatic reset). After the first touch, the
  // gesture worklet drives the cursor directly — re-syncing from JS state
  // would cause the cursor to spring back along the drag path on release.
  useEffect(() => {
    if (userTouchedRef.current) return;
    if (isDragging.value) return;
    const x = ((value.valence + 1) / 2) * padSize.value;
    const y = ((1 - (value.arousal + 1) / 2)) * padSize.value;
    cursorX.value = withSpring(x, SPRING_CURSOR);
    cursorY.value = withSpring(y, SPRING_CURSOR);
  }, [value.valence, value.arousal]);

  const markTouched = useCallback(() => {
    userTouchedRef.current = true;
  }, []);

  const fireHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => null);
  }, []);

  const emitChange = useCallback((valence, arousal) => {
    // Soft magnetic pull toward center
    let v = valence;
    let a = arousal;
    const mag = Math.sqrt(v * v + a * a);
    if (mag < CENTER_MAGNETIC_RADIUS) {
      v = 0;
      a = 0;
    }
    v = Math.round(v * 100) / 100;
    a = Math.round(a * 100) / 100;
    const intensity = Math.min(1, Math.round(Math.sqrt(v * v + a * a) * 100) / 100);
    onChange(v, a, intensity);
  }, [onChange]);

  // Determine quadrant index: 0=TL, 1=TR, 2=BL, 3=BR
  function quadrantIndex(x, y, size) {
    "worklet";
    const half = size / 2;
    if (x < half && y < half) return 0;
    if (x >= half && y < half) return 1;
    if (x < half && y >= half) return 2;
    return 3;
  }

  function shiftTrail(x, y) {
    "worklet";
    t4x.value = t3x.value; t4y.value = t3y.value;
    t3x.value = t2x.value; t3y.value = t2y.value;
    t2x.value = t1x.value; t2y.value = t1y.value;
    t1x.value = t0x.value; t1y.value = t0y.value;
    t0x.value = x; t0y.value = y;
  }

  function checkAxisCross(x, y, s) {
    "worklet";
    const half = s / 2;
    const sH = y < half ? 0 : 1;
    const sV = x < half ? 0 : 1;
    if (prevSideH.value >= 0 && sH !== prevSideH.value) {
      axisFlashH.value = 1;
      axisFlashH.value = withTiming(0, { duration: 400 });
    }
    if (prevSideV.value >= 0 && sV !== prevSideV.value) {
      axisFlashV.value = 1;
      axisFlashV.value = withTiming(0, { duration: 400 });
    }
    prevSideH.value = sH;
    prevSideV.value = sV;
  }

  const gesture = Gesture.Pan()
    .minDistance(0)
    .hitSlop({ top: HIT_SLOP, bottom: HIT_SLOP, left: HIT_SLOP, right: HIT_SLOP })
    .onBegin((e) => {
      "worklet";
      const s = padSize.value;
      const x = Math.max(0, Math.min(s, e.x));
      const y = Math.max(0, Math.min(s, e.y));
      cursorX.value = x;
      cursorY.value = y;
      isDragging.value = withTiming(1, { duration: 80 });
      cursorPop.value = 1;
      prevQuadrant.value = quadrantIndex(x, y, s);
      // Init trail to tap point
      t0x.value = x; t0y.value = y;
      t1x.value = x; t1y.value = y;
      t2x.value = x; t2y.value = y;
      t3x.value = x; t3y.value = y;
      t4x.value = x; t4y.value = y;
      prevSideH.value = y < s / 2 ? 0 : 1;
      prevSideV.value = x < s / 2 ? 0 : 1;
      const valence = (x / s) * 2 - 1;
      const arousal = -((y / s) * 2 - 1);
      runOnJS(markTouched)();
      runOnJS(emitChange)(valence, arousal);
      runOnJS(fireHaptic)();
    })
    .onUpdate((e) => {
      "worklet";
      const s = padSize.value;
      const x = Math.max(0, Math.min(s, e.x));
      const y = Math.max(0, Math.min(s, e.y));
      shiftTrail(x, y);
      cursorX.value = x;
      cursorY.value = y;
      const valence = (x / s) * 2 - 1;
      const arousal = -((y / s) * 2 - 1);
      runOnJS(emitChange)(valence, arousal);
      const q = quadrantIndex(x, y, s);
      if (q !== prevQuadrant.value) {
        prevQuadrant.value = q;
        runOnJS(fireHaptic)();
      }
      checkAxisCross(x, y, s);
    })
    .onEnd(() => {
      "worklet";
      isDragging.value = withTiming(0, { duration: 200 });
      cursorPop.value = withSpring(1.2, { damping: 8, stiffness: 400 }, () => {
        cursorPop.value = withSpring(1, { damping: 12, stiffness: 200 });
      });
    })
    .onFinalize(() => {
      "worklet";
      isDragging.value = withTiming(0, { duration: 200 });
    });

  // ── Animated styles ──

  // Cursor: translate + scale on touch
  const cursorStyle = useAnimatedStyle(() => {
    const dragScale = interpolate(isDragging.value, [0, 1], [1, 1.1], Extrapolation.CLAMP);
    return {
      transform: [
        { translateX: cursorX.value - CURSOR_HALF },
        { translateY: cursorY.value - CURSOR_HALF },
        { scale: dragScale * cursorPop.value },
      ],
    };
  });

  // Glow: tighter, intensity-driven
  const cursorGlowStyle = useAnimatedStyle(() => {
    const s = padSize.value;
    const half = s / 2;
    const dx = (cursorX.value - half) / half;
    const dy = (cursorY.value - half) / half;
    const mag = Math.min(1, Math.sqrt(dx * dx + dy * dy));
    const glowScale = interpolate(mag, [0, 0.3, 1], [0.5, 0.85, 1.4], Extrapolation.CLAMP);
    const baseOpacity = interpolate(mag, [0, 0.2, 0.6, 1], [0.04, 0.09, 0.18, 0.3], Extrapolation.CLAMP);
    const dragBoost = interpolate(isDragging.value, [0, 1], [0, 0.06], Extrapolation.CLAMP);
    return {
      opacity: baseOpacity + dragBoost,
      transform: [
        { translateX: cursorX.value - CURSOR_SIZE * 1.5 },
        { translateY: cursorY.value - CURSOR_SIZE * 1.5 },
        { scale: glowScale },
      ],
    };
  });

  // Center dot: subtle pulsing indicator for neutral zone
  const centerDotStyle = useAnimatedStyle(() => {
    const s = padSize.value;
    const half = s / 2;
    const dx = (cursorX.value - half) / half;
    const dy = (cursorY.value - half) / half;
    const mag = Math.sqrt(dx * dx + dy * dy);
    // Visible when cursor is near center, fades as it moves away
    const opacity = interpolate(mag, [0, 0.15, 0.35], [0.35, 0.15, 0], Extrapolation.CLAMP);
    return { opacity };
  });

  // Quadrant label opacity: brighten the one the cursor is in
  const qOpacity = (qIdx) =>
    useAnimatedStyle(() => {
      const s = padSize.value;
      const q = quadrantIndex(cursorX.value, cursorY.value, s);
      const active = q === qIdx ? 1 : 0;
      const opacity = interpolate(active, [0, 1], [0.2, 0.55], Extrapolation.CLAMP);
      return { opacity };
    });

  const qTLStyle = qOpacity(0);
  const qTRStyle = qOpacity(1);
  const qBLStyle = qOpacity(2);
  const qBRStyle = qOpacity(3);

  // Crosshair opacity fades when cursor is at center
  const crosshairHStyle = useAnimatedStyle(() => {
    const s = padSize.value;
    const half = s / 2;
    const dy = Math.abs(cursorY.value - half) / half;
    const opacity = interpolate(dy, [0, 0.1, 0.5], [0.02, 0.04, 0.08], Extrapolation.CLAMP);
    return { top: cursorY.value, opacity };
  });
  const crosshairVStyle = useAnimatedStyle(() => {
    const s = padSize.value;
    const half = s / 2;
    const dx = Math.abs(cursorX.value - half) / half;
    const opacity = interpolate(dx, [0, 0.1, 0.5], [0.02, 0.04, 0.08], Extrapolation.CLAMP);
    return { left: cursorX.value, opacity };
  });

  // Axis flash styles
  const gridHFlashStyle = useAnimatedStyle(() => ({
    opacity: axisFlashH.value * 0.45,
  }));
  const gridVFlashStyle = useAnimatedStyle(() => ({
    opacity: axisFlashV.value * 0.45,
  }));

  // Trail dot styles
  const trailStyle = (tx, ty, alpha) =>
    useAnimatedStyle(() => ({
      opacity: isDragging.value * alpha,
      transform: [
        { translateX: tx.value - TRAIL_SIZE / 2 },
        { translateY: ty.value - TRAIL_SIZE / 2 },
      ],
    }));
  const ts0 = trailStyle(t0x, t0y, TRAIL_OPACITIES[0]);
  const ts1 = trailStyle(t1x, t1y, TRAIL_OPACITIES[1]);
  const ts2 = trailStyle(t2x, t2y, TRAIL_OPACITIES[2]);
  const ts3 = trailStyle(t3x, t3y, TRAIL_OPACITIES[3]);
  const ts4 = trailStyle(t4x, t4y, TRAIL_OPACITIES[4]);

  // Label animated style
  const labelAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: labelScale.value }],
    opacity: interpolate(labelScale.value, [0.88, 1], [0.5, 1], Extrapolation.CLAMP),
  }));

  const labelLive = derivedLabel || "neutral";
  const summary = useMemo(
    () => humanSummary(value.valence, value.arousal, t),
    [value.valence, value.arousal, t]
  );

  return (
    <View style={styles.container}>
      {/* Animated live state label */}
      <Animated.View style={labelAnimStyle}>
        <Text style={[styles.liveLabel, { color: accentColor }]}>{labelLive}</Text>
      </Animated.View>
      <Text style={styles.liveSummary}>{summary}</Text>

      {/* The 2D Pad */}
      <View style={styles.padOuter}>
        {/* Axis anchors — intuitive words, not "Very high/low" */}
        <Text style={[styles.axisAnchor, styles.anchorTop]}>{t("emotion.anchorIntense") || "Intense"}</Text>
        <Text style={[styles.axisAnchor, styles.anchorBottom]}>{t("emotion.anchorCalm") || "Calm"}</Text>
        <Text style={[styles.axisAnchor, styles.anchorLeft]}>{t("emotion.anchorUnpleasant") || "Unpleasant"}</Text>
        <Text style={[styles.axisAnchor, styles.anchorRight]}>{t("emotion.anchorPleasant") || "Pleasant"}</Text>

        <GestureDetector gesture={gesture}>
          <Animated.View
            style={styles.pad}
            onLayout={(e) => {
              const w = e.nativeEvent.layout.width;
              padSize.value = w;
              const x = ((value.valence + 1) / 2) * w;
              const y = ((1 - (value.arousal + 1) / 2)) * w;
              cursorX.value = x;
              cursorY.value = y;
            }}
          >
            {/* Background gradient — four emotional quadrants */}
            <LinearGradient
              colors={[
                "rgba(255, 107, 122, 0.18)",
                "rgba(86, 208, 224, 0.18)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { top: 0, height: "50%" }]}
            />
            <LinearGradient
              colors={[
                "rgba(167, 139, 250, 0.18)",
                "rgba(94, 230, 160, 0.18)",
              ]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[StyleSheet.absoluteFill, { top: "50%", height: "50%" }]}
            />

            {/* Vignette — surface depth */}
            <LinearGradient
              colors={["rgba(6,10,18,0.32)", "transparent", "transparent", "rgba(6,10,18,0.32)"]}
              locations={[0, 0.12, 0.88, 1]}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <LinearGradient
              colors={["rgba(6,10,18,0.22)", "transparent", "transparent", "rgba(6,10,18,0.22)"]}
              locations={[0, 0.12, 0.88, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />

            {/* Grid lines — center cross */}
            <View style={styles.gridH} />
            <View style={styles.gridV} />

            {/* Axis crossing flash */}
            <Animated.View style={[styles.gridHFlash, gridHFlashStyle]} />
            <Animated.View style={[styles.gridVFlash, gridVFlashStyle]} />

            {/* Center neutral indicator */}
            <Animated.View style={[styles.centerDot, centerDotStyle]} />

            {/* Quadrant emotion hints — opacity varies with proximity */}
            <Animated.Text style={[styles.quadrantHint, styles.qTopLeft, qTLStyle]}>
              {t("emotion.qAnxious") || "anxious"}
            </Animated.Text>
            <Animated.Text style={[styles.quadrantHint, styles.qTopRight, qTRStyle]}>
              {t("emotion.qEnergized") || "energized"}
            </Animated.Text>
            <Animated.Text style={[styles.quadrantHint, styles.qBottomLeft, qBLStyle]}>
              {t("emotion.qLow") || "low"}
            </Animated.Text>
            <Animated.Text style={[styles.quadrantHint, styles.qBottomRight, qBRStyle]}>
              {t("emotion.qCalm") || "calm"}
            </Animated.Text>

            {/* Dynamic crosshairs (subtle) */}
            <Animated.View style={[styles.crosshairH, crosshairHStyle]} />
            <Animated.View style={[styles.crosshairV, crosshairVStyle]} />

            {/* Trajectory trail */}
            <Animated.View style={[styles.trailDot, { backgroundColor: accentColor }, ts4]} />
            <Animated.View style={[styles.trailDot, { backgroundColor: accentColor }, ts3]} />
            <Animated.View style={[styles.trailDot, { backgroundColor: accentColor }, ts2]} />
            <Animated.View style={[styles.trailDot, { backgroundColor: accentColor }, ts1]} />
            <Animated.View style={[styles.trailDot, { backgroundColor: accentColor }, ts0]} />

            {/* Cursor glow — grows with intensity */}
            <Animated.View style={[styles.cursorGlow, { backgroundColor: accentColor }, cursorGlowStyle]} />

            {/* Cursor */}
            <Animated.View style={[styles.cursor, { borderColor: accentColor }, cursorStyle]}>
              <View style={[styles.cursorCore, { backgroundColor: accentColor }]} />
            </Animated.View>
          </Animated.View>
        </GestureDetector>
      </View>
    </View>
  );
}

const GLOW_SIZE = CURSOR_SIZE * 3;

const styles = StyleSheet.create({
  container: {
    marginTop: 18,
    padding: 18,
    borderRadius: radius.lg,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    gap: 8,
  },
  // ── Live label ──
  liveLabel: {
    fontSize: 28,
    lineHeight: 32,
    fontWeight: "800",
    textTransform: "capitalize",
  },
  liveSummary: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    marginBottom: 2,
  },
  // ── Pad container ──
  padOuter: {
    position: "relative",
    paddingTop: 20,
    paddingBottom: 20,
    paddingHorizontal: 2,
  },
  pad: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "rgba(6, 10, 18, 0.55)",
    borderWidth: 1,
    borderColor: "rgba(148, 180, 224, 0.10)",
  },
  // ── Grid ──
  gridH: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148, 180, 224, 0.15)",
  },
  gridV: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148, 180, 224, 0.15)",
  },
  gridHFlash: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: "rgba(148, 180, 224, 0.5)",
    marginTop: -1,
  },
  gridVFlash: {
    position: "absolute",
    left: "50%",
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: "rgba(148, 180, 224, 0.5)",
    marginLeft: -1,
  },
  // ── Center neutral dot ──
  centerDot: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 8,
    height: 8,
    marginTop: -4,
    marginLeft: -4,
    borderRadius: 4,
    backgroundColor: "rgba(184, 200, 216, 0.4)",
  },
  // ── Crosshairs ──
  crosshairH: {
    position: "absolute",
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148, 180, 224, 0.08)",
  },
  crosshairV: {
    position: "absolute",
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: "rgba(148, 180, 224, 0.08)",
  },
  // ── Quadrant hints ──
  quadrantHint: {
    position: "absolute",
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: "600",
    textTransform: "lowercase",
    letterSpacing: 0.3,
  },
  qTopLeft: { top: 14, left: 14 },
  qTopRight: { top: 14, right: 14 },
  qBottomLeft: { bottom: 14, left: 14 },
  qBottomRight: { bottom: 14, right: 14 },
  // ── Cursor ──
  cursorGlow: {
    position: "absolute",
    width: GLOW_SIZE,
    height: GLOW_SIZE,
    borderRadius: GLOW_SIZE / 2,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 12,
    elevation: 10,
  },
  cursorCore: {
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  // ── Trail dots ──
  trailDot: {
    position: "absolute",
    width: TRAIL_SIZE,
    height: TRAIL_SIZE,
    borderRadius: TRAIL_SIZE / 2,
  },
  // ── Axis anchors ──
  axisAnchor: {
    position: "absolute",
    color: palette.muted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
  anchorTop: {
    top: 2,
    left: 0,
    right: 0,
    textAlign: "center",
  },
  anchorBottom: {
    bottom: 2,
    left: 0,
    right: 0,
    textAlign: "center",
  },
  anchorLeft: {
    top: "50%",
    left: -2,
    transform: [{ rotate: "-90deg" }, { translateX: -24 }],
  },
  anchorRight: {
    top: "50%",
    right: -2,
    transform: [{ rotate: "90deg" }, { translateX: 24 }],
  },
});
