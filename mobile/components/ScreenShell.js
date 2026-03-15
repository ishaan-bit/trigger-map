import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette, radius } from "@/utils/theme";

const LOADING_TIMEOUT_MS = 3000;

export function ScreenShell({
  children,
  scroll = true,
  loading = false,
  loadingTitle = "Loading",
  loadingMessage = "Fetching the latest TriggerMap data.",
  timeoutMessage = "This is taking longer than expected. Check connection and try again.",
  onRetry,
}) {
  const [showTimeout, setShowTimeout] = useState(false);

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
    <LinearGradient colors={["#080e1a", "#060a12", "#040710"]} style={styles.gradient}>
      {/* Ambient glow orbs — cinematic depth */}
      <View style={styles.glowTopRight} />
      <View style={styles.glowMidLeft} />
      <View style={styles.glowBottomCenter} />
      <SafeAreaView style={styles.safeArea}>
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
    paddingBottom: 36,
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