import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";
import { useEmotionalState } from "@/hooks/useEmotionalState";
import { useLanguage } from "@/i18n/LanguageContext";
import { palette, radius } from "@/utils/theme";
import { AtmosphericField } from "@/components/AtmosphericField";

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
  const insets = useSafeAreaInsets();
  const { dominantEmotion, momentCount } = useEmotionalState();
  const { t } = useLanguage();

  // Deep space base; the living aurora layers its emotional colour on top.
  const gradientColors = ["#070c18", "#05080f", "#03050b"];
  // Subtler atmosphere before there's emotional history to read.
  const fieldIntensity = momentCount > 0 ? 1 : 0.6;

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
          <Text style={styles.retryLabel}>{t("common.retry")}</Text>
        </Pressable>
      ) : null}
    </View>
  ) : (
    children
  );

  return (
    <LinearGradient colors={gradientColors} style={styles.gradient}>
      {/* Living emotional atmosphere — drifting aurora tinted by current state */}
      <AtmosphericField emotion={dominantEmotion || "neutral"} intensity={fieldIntensity} />
      <SafeAreaView style={styles.safeArea} edges={edges}>
        {scroll ? (
          <ScrollView contentContainerStyle={[styles.content, { paddingBottom: Math.max(48, insets.bottom + 16) }]} showsVerticalScrollIndicator={false}>
            {content}
          </ScrollView>
        ) : (
          <View style={[styles.content, { paddingBottom: Math.max(48, insets.bottom + 16) }]}>{content}</View>
        )}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
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
    color: palette.textSecondary,
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