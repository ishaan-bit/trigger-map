/**
 * Card — the app's standard elevated glass surface.
 * Optional gradient sheen, accent edge, press interaction, and entrance fade.
 */
import { StyleSheet, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { palette, radius, spacing, shadow } from "@/utils/theme";
import { FadeInView, PressableScale } from "@/components/motion";

export function Card({
  children,
  accent,            // optional accent color for a left edge + glow
  onPress,
  delay = 0,
  animate = true,
  padding = spacing.md,
  glow = false,
  style,
  contentStyle,
}) {
  const inner = (
    <View
      style={[
        styles.card,
        { padding },
        accent ? { borderColor: accent + "33" } : null,
        glow && accent ? shadow.glow(accent) : null,
        contentStyle,
      ]}
    >
      <LinearGradient
        colors={[
          accent ? accent + "14" : "rgba(255,255,255,0.05)",
          "rgba(255,255,255,0.01)",
        ]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {accent ? <View style={[styles.edge, { backgroundColor: accent }]} /> : null}
      {children}
    </View>
  );

  const body = onPress ? (
    <PressableScale onPress={onPress} style={style}>
      {inner}
    </PressableScale>
  ) : (
    <View style={style}>{inner}</View>
  );

  return animate ? <FadeInView delay={delay}>{body}</FadeInView> : body;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    overflow: "hidden",
    position: "relative",
  },
  edge: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: radius.lg,
    borderBottomLeftRadius: radius.lg,
  },
});
