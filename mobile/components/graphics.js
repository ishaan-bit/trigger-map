/**
 * Graphics primitives
 * ───────────────────
 * Lightweight, animated SVG data-viz used across the report / progress / log
 * screens. All animate on mount so numbers and charts feel alive instead of
 * snapping into place. Built on react-native-svg + RN Animated.
 */
import { useEffect, useMemo } from "react";
import { Animated, Easing, View, StyleSheet } from "react-native";
import Svg, { Circle, Path, Line, Defs, LinearGradient as SvgGradient, Stop, Rect } from "react-native-svg";
import { palette, motion } from "@/utils/theme";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);

/* ──────────────────────────────────────────────────────────────────────────
 * ProgressRing — animated circular gauge. `progress` is 0..1.
 * Optional children render centered (e.g. a value + label).
 * ────────────────────────────────────────────────────────────────────────── */
export function ProgressRing({
  progress = 0,
  size = 120,
  strokeWidth = 10,
  color = palette.accent,
  trackColor = "rgba(148,180,224,0.14)",
  duration = motion.duration.slow,
  children,
  style,
}) {
  const clamped = Math.max(0, Math.min(1, progress));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const anim = useMemo(() => new Animated.Value(0), []);

  useEffect(() => {
    const animation = Animated.timing(anim, {
      toValue: clamped,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    animation.start();
    return () => animation.stop();
  }, [clamped, duration, anim]);

  const strokeDashoffset = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [circumference, 0],
  });

  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          // start at 12 o'clock
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      {children ? <View style={{ alignItems: "center" }}>{children}</View> : null}
    </View>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Gauge — 270° arc gauge with a value pointer. `value` 0..1.
 * ────────────────────────────────────────────────────────────────────────── */
export function Gauge({ value = 0, size = 140, strokeWidth = 12, color = palette.accent, trackColor = "rgba(148,180,224,0.14)", children, style }) {
  const clamped = Math.max(0, Math.min(1, value));
  const radius = (size - strokeWidth) / 2;
  const startAngle = 135; // bottom-left
  const sweep = 270;
  const cx = size / 2;
  const cy = size / 2;

  const polar = (angleDeg) => {
    const a = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  };
  const arcPath = (fromDeg, toDeg) => {
    const from = polar(fromDeg);
    const to = polar(toDeg);
    const large = toDeg - fromDeg > 180 ? 1 : 0;
    return `M ${from.x} ${from.y} A ${radius} ${radius} 0 ${large} 1 ${to.x} ${to.y}`;
  };

  const anim = useMemo(() => new Animated.Value(0), []);
  const arcLength = (2 * Math.PI * radius * sweep) / 360;
  useEffect(() => {
    const animation = Animated.timing(anim, { toValue: clamped, duration: motion.duration.slow, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    animation.start();
    return () => animation.stop();
  }, [clamped, anim]);
  const dashoffset = anim.interpolate({ inputRange: [0, 1], outputRange: [arcLength, 0] });

  return (
    <View style={[{ width: size, height: size, alignItems: "center", justifyContent: "center" }, style]}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Path d={arcPath(startAngle, startAngle + sweep)} stroke={trackColor} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
        <AnimatedPath
          d={arcPath(startAngle, startAngle + sweep)}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={arcLength}
          strokeDashoffset={dashoffset}
        />
      </Svg>
      {children ? <View style={{ alignItems: "center" }}>{children}</View> : null}
    </View>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Sparkline — smooth line chart with gradient fill. Draws on over time.
 * `data` is an array of numbers (or {value} objects).
 * ────────────────────────────────────────────────────────────────────────── */
export function Sparkline({
  data = [],
  width = 280,
  height = 64,
  color = palette.accent,
  fill = true,
  strokeWidth = 2.5,
  style,
}) {
  const values = data.map((d) => (typeof d === "number" ? d : Number(d?.value ?? 0)));
  const { linePath, areaPath } = useMemo(() => {
    if (values.length < 2) return { linePath: "", areaPath: "" };
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const pad = strokeWidth + 2;
    const w = width - pad * 2;
    const h = height - pad * 2;
    const pts = values.map((v, i) => ({
      x: pad + (i / (values.length - 1)) * w,
      y: pad + (1 - (v - min) / range) * h,
    }));
    // Catmull-Rom → cubic bezier smoothing
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
    }
    const area = `${d} L ${pts[pts.length - 1].x} ${height} L ${pts[0].x} ${height} Z`;
    return { linePath: d, areaPath: area };
  }, [values, width, height, strokeWidth]);

  const dash = useMemo(() => new Animated.Value(0), []);
  const PATH_LEN = width * 2; // generous upper bound for draw-on
  useEffect(() => {
    dash.setValue(0);
    const a = Animated.timing(dash, { toValue: 1, duration: motion.duration.slow, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [linePath, dash]);
  const dashoffset = dash.interpolate({ inputRange: [0, 1], outputRange: [PATH_LEN, 0] });

  if (!linePath) return <View style={[{ width, height }, style]} />;

  const gid = `spark-${color.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <View style={style}>
      <Svg width={width} height={height}>
        <Defs>
          <SvgGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={color} stopOpacity="0" />
          </SvgGradient>
        </Defs>
        {fill ? <Path d={areaPath} fill={`url(#${gid})`} /> : null}
        <AnimatedPath
          d={linePath}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={PATH_LEN}
          strokeDashoffset={dashoffset}
        />
      </Svg>
    </View>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * MiniBars — compact animated vertical bar chart.
 * `data`: [{ value, color?, label? }] or numbers.
 * ────────────────────────────────────────────────────────────────────────── */
export function MiniBars({ data = [], width = 280, height = 80, gap = 6, color = palette.accent, style }) {
  const items = data.map((d) => (typeof d === "number" ? { value: d } : d));
  const max = Math.max(1, ...items.map((d) => Number(d.value || 0)));
  const barW = items.length ? (width - gap * (items.length - 1)) / items.length : 0;
  const anim = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    anim.setValue(0);
    const a = Animated.timing(anim, { toValue: 1, duration: motion.duration.slow, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [data, anim]);

  return (
    <View style={style}>
      <Svg width={width} height={height}>
        {items.map((d, i) => {
          const full = (Number(d.value || 0) / max) * (height - 4);
          const h = anim.interpolate({ inputRange: [0, 1], outputRange: [0, full] });
          const x = i * (barW + gap);
          const y = Animated.subtract(height, h);
          return (
            <AnimatedRect
              key={i}
              x={x}
              y={y}
              width={barW}
              height={h}
              rx={Math.min(barW / 2, 4)}
              fill={d.color || color}
              opacity={0.9}
            />
          );
        })}
      </Svg>
    </View>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * AnimatedBar — single horizontal progress/meter bar. `progress` 0..1.
 * ────────────────────────────────────────────────────────────────────────── */
export function AnimatedBar({ progress = 0, color = palette.accent, trackColor = "rgba(148,180,224,0.12)", height = 8, markerAt = null, style }) {
  const clamped = Math.max(0, Math.min(1, progress));
  const anim = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    const a = Animated.timing(anim, { toValue: clamped, duration: motion.duration.slow, easing: Easing.out(Easing.cubic), useNativeDriver: false });
    a.start();
    return () => a.stop();
  }, [clamped, anim]);
  const widthInterpolate = anim.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
  return (
    <View style={[{ height, borderRadius: height / 2, backgroundColor: trackColor, overflow: "hidden", justifyContent: "center" }, style]}>
      <Animated.View style={{ height, width: widthInterpolate, backgroundColor: color, borderRadius: height / 2 }} />
      {markerAt !== null ? (
        <View style={{ position: "absolute", left: `${Math.max(0, Math.min(1, markerAt)) * 100}%`, width: 2, height: height + 6, top: -3, backgroundColor: palette.text, opacity: 0.5 }} />
      ) : null}
    </View>
  );
}

export { Svg, Line };
