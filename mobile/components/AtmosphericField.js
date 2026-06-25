/**
 * AtmosphericField — the living emotional atmosphere behind every screen.
 * ──────────────────────────────────────────────────────────────────────
 * The app's core metaphor is the emotional field (valence/arousal). Instead of
 * a flat tinted gradient, the background is a slow, cinematic aurora: a few large
 * soft-edged colour blobs that drift, breathe and rotate on the native thread,
 * their hue driven by the user's current emotional state. A radial vignette
 * deepens the edges so foreground glass reads with real depth.
 *
 * Soft edges come from SVG radial gradients (no blur lib available); motion is
 * pure transform/opacity on Reanimated, so it stays at 60fps and costs nothing
 * on the JS thread. Everything is pointerEvents="none" — it never intercepts touch.
 */
import { useEffect, useMemo } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Svg, { Defs, RadialGradient, Stop, Rect, Circle } from "react-native-svg";
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from "react-native-reanimated";

// Aurora hue triads per dominant emotion — [primary, secondary, deep].
const AURORA = {
  calm:       ["#5ee6a0", "#56d0e0", "#2e93a8"],
  neutral:    ["#56d0e0", "#a78bfa", "#2e93a8"],
  anxious:    ["#ffb347", "#e0a356", "#a78bfa"],
  frustrated: ["#ff6b7a", "#a78bfa", "#56d0e0"],
  energized:  ["#a78bfa", "#56d0e0", "#5ee6a0"],
};

const EASE = Easing.inOut(Easing.ease);

/* One soft, drifting aurora blob (static SVG glow inside an animated container). */
function Blob({ id, size, color, opacity, startX, startY, driftX, driftY, duration, delay, scaleTo }) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.value = withDelay(delay, withRepeat(withTiming(1, { duration, easing: EASE }), -1, true));
    return () => cancelAnimation(t);
  }, [t, duration, delay]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity * (0.62 + 0.38 * t.value),
    transform: [
      { translateX: startX + driftX * t.value },
      { translateY: startY + driftY * t.value },
      { scale: 1 + (scaleTo - 1) * t.value },
    ],
  }));

  return (
    <Reanimated.View style={[styles.blob, { width: size, height: size }, animatedStyle]} pointerEvents="none">
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={id} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={color} stopOpacity="1" />
            <Stop offset="0.65" stopColor={color} stopOpacity="0.45" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={size / 2} fill={`url(#${id})`} />
      </Svg>
    </Reanimated.View>
  );
}

export function AtmosphericField({ emotion = "neutral", intensity = 1 }) {
  const { width, height } = useWindowDimensions();
  const hues = AURORA[emotion] || AURORA.neutral;

  const blobs = useMemo(
    () => [
      { id: "af-a", size: width * 1.05, color: hues[0], opacity: 0.18 * intensity, startX: -width * 0.30, startY: -height * 0.08, driftX: width * 0.14, driftY: height * 0.07, duration: 26000, delay: 0, scaleTo: 1.18 },
      { id: "af-b", size: width * 0.85, color: hues[1], opacity: 0.15 * intensity, startX: width * 0.48, startY: height * 0.10, driftX: -width * 0.12, driftY: height * 0.06, duration: 33000, delay: 1400, scaleTo: 1.22 },
      { id: "af-c", size: width * 1.15, color: hues[2], opacity: 0.13 * intensity, startX: width * 0.02, startY: height * 0.56, driftX: width * 0.10, driftY: -height * 0.07, duration: 39000, delay: 700, scaleTo: 1.12 },
      { id: "af-d", size: width * 0.62, color: hues[0], opacity: 0.12 * intensity, startX: width * 0.52, startY: height * 0.70, driftX: -width * 0.14, driftY: height * 0.05, duration: 30000, delay: 2100, scaleTo: 1.28 },
    ],
    [width, height, hues, intensity]
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {blobs.map((b) => (
        <Blob key={b.id} {...b} />
      ))}
      {/* Vignette — deepen edges & bottom so foreground glass has depth. */}
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" pointerEvents="none">
        <Defs>
          <RadialGradient id="af-vignette" cx="50%" cy="34%" r="78%">
            <Stop offset="0.5" stopColor="#04060e" stopOpacity="0" />
            <Stop offset="1" stopColor="#03050b" stopOpacity="0.82" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#af-vignette)" />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  blob: { position: "absolute", left: 0, top: 0 },
});

export default AtmosphericField;
