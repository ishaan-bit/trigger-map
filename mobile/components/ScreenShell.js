import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEmotionalState } from "@/hooks/useEmotionalState";
import { palette, radius } from "@/utils/theme";
import { EMOTION_STYLES } from "@/utils/designSystem";

const LOADING_TIMEOUT_MS = 3000;

export function ScreenShell({
  children,
  scroll = true,
  loading = false,
  loadingTitle = "Loading",
  loadingMessage = "Loading your latest data.",
  timeoutMessage = "This is taking longer than expected. Check connection and try again.",
  onRetry,
  edges,
}) {
  const [showTimeout, setShowTimeout] = useState(false);
  const { glowColor, glowDeepColor, dominantEmotion } = useEmotionalState();
  const breathAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathAnim, { toValue: 1, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(breathAnim, { toValue: 0, duration: 4000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    ).start();
  }, [breathAnim]);

  const breathScale = breathAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const breathOpacity = breathAnim.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] });

  // Living gradient — tinted by emotional state
  const emotionTint = EMOTION_STYLES[dominantEmotion]?.glow || "rgba(86, 208, 224, 0.04)";
  const gradientColors = ["#080e1a", emotionTint, "#040710"];

  useEffect(() => {
    if (!loading) {
      setShowTimeout(false);
      return undefined;
    }

    const timeout = setTimeout(() => setShowTimeout(true), LOADING_TIMEOUT_MS);
    return () => clearTimeout(timeout);
  }, [loading]);

  const content = loading ? (
    <View style={styles.loaderWrap}>
      <View style={styles.loaderOrb}>
        <ActivityIndicator color={palette.accent} size="large" />
      </View>
      <Text style={styles.loaderTitle}>{loadingTitle}</Text>
      <Text style={styles.loaderBody}>{showTimeout ? timeoutMessage : loadingMessage}</Text>
      <View style={styles.placeholderStack}>
        <View style={styles.placeholderCardLarge} />
        <View style={styles.placeholderRow}>
          <View style={styles.placeholderCardSmall} />
          <View style={styles.placeholderCardSmall} />
        </View>
      </View>
      {showTimeout && onRetry ? (
        <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      ) : null}
    </View>
  ) : (
    children
  );

  return (
    <LinearGradient colors={gradientColors} style={styles.gradient}>
      {/* Ambient glow orbs — tinted by emotional state, breathing */}
      <Animated.View style={[styles.glowTopRight, { backgroundColor: glowColor, transform: [{ scale: breathScale }], opacity: breathOpacity }]} />
      <Animated.View style={[styles.glowMidLeft, { backgroundColor: glowDeepColor, transform: [{ scale: breathScale }], opacity: breathOpacity }]} />
      <Animated.View style={[styles.glowBottomCenter, { backgroundColor: glowDeepColor, transform: [{ scale: breathScale }], opacity: breathOpacity }]} />
      <SafeAreaView style={styles.safeArea} edges={edges}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {content}
          </ScrollView>
        ) : (
          <View style={styles.content}>{content}</View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  glowTopRight: {
    position: "absolute",
    top: -100,
    right: -80,
    width: 320,
    height: 320,
    borderRadius: 160,
    backgroundColor: "rgba(86, 208, 224, 0.05)",
  },
  glowMidLeft: {
    position: "absolute",
    top: "35%",
    left: -120,
    width: 260,
    height: 260,
    borderRadius: 130,
    backgroundColor: "rgba(167, 139, 250, 0.04)",
  },
  glowBottomCenter: {
    position: "absolute",
    bottom: -140,
    alignSelf: "center",
    width: 400,
    height: 400,
    borderRadius: 200,
    backgroundColor: "rgba(46, 147, 168, 0.06)",
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 48,
    gap: 20,
  },
  loaderWrap: {
    flex: 1,
    minHeight: 320,
    justifyContent: "center",
    alignItems: "center",
    gap: 14,
  },
  loaderOrb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accentSoft,
    borderWidth: 1,
    borderColor: palette.glassBorder,
  },
  loaderTitle: {
    color: palette.text,
    fontSize: 24,
    fontWeight: "700",
  },
  loaderBody: {
    maxWidth: 280,
    color: palette.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
  },
  placeholderStack: {
    width: "100%",
    gap: 12,
    marginTop: 6,
  },
  placeholderRow: {
    flexDirection: "row",
    gap: 12,
  },
  placeholderCardLarge: {
    width: "100%",
    height: 96,
    borderRadius: radius.lg,
    backgroundColor: palette.cardGlow,
    borderWidth: 1,
    borderColor: palette.glassBorder,
  },
  placeholderCardSmall: {
    flex: 1,
    height: 120,
    borderRadius: radius.md,
    backgroundColor: palette.cardGlow,
    borderWidth: 1,
    borderColor: palette.glassBorder,
  },
  retryButton: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: palette.accentStrong,
  },
  retryLabel: {
    color: palette.text,
    fontSize: 15,
    fontWeight: "700",
  },
});