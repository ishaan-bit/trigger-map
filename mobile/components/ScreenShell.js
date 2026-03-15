import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { palette } from "@/utils/theme";

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
    <LinearGradient colors={["#0c1420", "#070c14", "#04070d"]} style={styles.gradient}>
      <View style={styles.glowTop} />
      <View style={styles.glowBottom} />
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
  glowTop: {
    position: "absolute",
    top: -140,
    right: -60,
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(123, 201, 216, 0.06)",
  },
  glowBottom: {
    position: "absolute",
    bottom: -170,
    left: -80,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: "rgba(61, 142, 160, 0.07)",
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 32,
    gap: 16,
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
    backgroundColor: palette.cardGlow,
    borderWidth: 1,
    borderColor: palette.border,
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
    borderRadius: 24,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  placeholderCardSmall: {
    flex: 1,
    height: 120,
    borderRadius: 22,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  retryButton: {
    minHeight: 48,
    paddingHorizontal: 18,
    borderRadius: 999,
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