/**
 * Motion primitives
 * ─────────────────
 * A small, dependency-light set of reusable animated building blocks so every
 * screen moves with the same rhythm (see `motion` tokens in utils/theme).
 *
 * Built on react-native-reanimated (already configured via babel plugin) for
 * 60fps native-driven transitions, with a couple of RN Animated helpers where
 * a JS-readable value is needed (number count-up).
 */
import { useEffect, useRef, useState, useMemo, Children } from "react";
import { Animated as RNAnimated, Easing as RNEasing, Pressable, View } from "react-native";
import Reanimated, {
  Easing,
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  withSpring,
  withRepeat,
  withSequence,
  cancelAnimation,
} from "react-native-reanimated";
import { motion } from "@/utils/theme";
import { selection } from "@/utils/haptics";

const EASE_OUT = Easing.out(Easing.cubic);

/* ──────────────────────────────────────────────────────────────────────────
 * FadeInView — entrance fade + rise. Drop-in replacement for <View>.
 * ────────────────────────────────────────────────────────────────────────── */
export function FadeInView({
  children,
  delay = 0,
  duration = motion.duration.base,
  offset = 16,
  from = "bottom",
  style,
  ...rest
}) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(delay, withTiming(1, { duration, easing: EASE_OUT }));
    return () => cancelAnimation(progress);
  }, [delay, duration, progress]);

  const animatedStyle = useAnimatedStyle(() => {
    const axis = from === "left" || from === "right" ? "translateX" : "translateY";
    const sign = from === "top" || from === "left" ? -1 : 1;
    return {
      opacity: progress.value,
      transform: [{ [axis]: (1 - progress.value) * offset * sign }],
    };
  });

  return (
    <Reanimated.View style={[style, animatedStyle]} {...rest}>
      {children}
    </Reanimated.View>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Stagger — fades its direct children in one after another. Wrap a list/column.
 * ────────────────────────────────────────────────────────────────────────── */
export function Stagger({ children, delay = 0, step = motion.stagger, style, ...rest }) {
  const items = Children.toArray(children);
  return (
    <View style={style} {...rest}>
      {items.map((child, i) => (
        <FadeInView key={i} delay={delay + i * step}>
          {child}
        </FadeInView>
      ))}
    </View>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * PressableScale — tactile button: springs down on press, back on release.
 * Adds a subtle selection haptic by default.
 * ────────────────────────────────────────────────────────────────────────── */
export function PressableScale({
  children,
  onPress,
  scaleTo = motion.press.scale,
  haptic = true,
  disabled = false,
  style,
  ...rest
}) {
  // RN Animated (not reanimated) so the press spring lives off the JS
  // immutability constraints and stays driver-native for transforms.
  const scale = useMemo(() => new RNAnimated.Value(1), []);
  const springTo = (to) =>
    RNAnimated.spring(scale, { toValue: to, useNativeDriver: true, speed: 40, bounciness: 6 }).start();

  return (
    <Pressable
      onPressIn={() => springTo(scaleTo)}
      onPressOut={() => springTo(1)}
      onPress={(e) => { if (haptic) selection(); onPress?.(e); }}
      disabled={disabled}
      style={style}
      {...rest}
    >
      <RNAnimated.View style={{ transform: [{ scale }] }}>{children}</RNAnimated.View>
    </Pressable>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Pulse — gentle infinite breathing scale/opacity. For glows, live badges.
 * ────────────────────────────────────────────────────────────────────────── */
export function Pulse({ children, minScale = 1, maxScale = 1.08, duration = 1800, style }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(v);
  }, [duration, v]);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: minScale + (maxScale - minScale) * v.value }],
    opacity: 0.6 + 0.4 * v.value,
  }));
  return <Reanimated.View style={[style, animatedStyle]}>{children}</Reanimated.View>;
}

/* ──────────────────────────────────────────────────────────────────────────
 * Shimmer — looping highlight sweep, for skeleton/placeholder loading states.
 * ────────────────────────────────────────────────────────────────────────── */
export function Shimmer({ style }) {
  const v = useSharedValue(0.3);
  useEffect(() => {
    v.value = withRepeat(withTiming(0.7, { duration: 900, easing: Easing.inOut(Easing.ease) }), -1, true);
    return () => cancelAnimation(v);
  }, [v]);
  const animatedStyle = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Reanimated.View style={[style, animatedStyle]} />;
}

/* ──────────────────────────────────────────────────────────────────────────
 * useCountUp — animates a number from a previous value to the target.
 * Returns the formatted string to render. JS-driven (RN Animated) so the value
 * can be read on the JS thread for <Text>.
 * ────────────────────────────────────────────────────────────────────────── */
export function useCountUp(value, { duration = motion.duration.count, decimals = 0 } = {}) {
  const target = Number.isFinite(value) ? value : 0;
  const anim = useMemo(() => new RNAnimated.Value(0), []);
  const [display, setDisplay] = useState(target);
  const first = useRef(true);

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setDisplay(v));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    if (first.current) {
      // Animate up from zero on first mount for a lively entrance.
      first.current = false;
      anim.setValue(0);
    }
    const animation = RNAnimated.timing(anim, {
      toValue: target,
      duration,
      easing: RNEasing.out(RNEasing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [target, duration, anim]);

  return decimals > 0 ? display.toFixed(decimals) : String(Math.round(display));
}

/* ──────────────────────────────────────────────────────────────────────────
 * CountUpText — convenience <Text> that counts up to `value`.
 * ────────────────────────────────────────────────────────────────────────── */
export function CountUpText({ value, decimals = 0, duration, style, prefix = "", suffix = "", ...rest }) {
  const text = useCountUp(value, { decimals, duration });
  return (
    <Reanimated.Text style={style} {...rest}>
      {prefix}
      {text}
      {suffix}
    </Reanimated.Text>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * AppearScale — pop-in entrance (scale + fade). Good for hero stats / orbs.
 * ────────────────────────────────────────────────────────────────────────── */
export function AppearScale({ children, delay = 0, style, ...rest }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withDelay(delay, withSpring(1, motion.spring.bouncy));
    return () => cancelAnimation(progress);
  }, [delay, progress]);
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.8 + 0.2 * progress.value }],
  }));
  return (
    <Reanimated.View style={[style, animatedStyle]} {...rest}>
      {children}
    </Reanimated.View>
  );
}

export { Reanimated, withTiming, withSpring, withSequence, useSharedValue, useAnimatedStyle, Easing };
