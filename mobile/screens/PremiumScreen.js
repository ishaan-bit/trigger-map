import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Svg, { Circle } from "react-native-svg";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { Card } from "@/components/Card";
import { Sparkline } from "@/components/graphics";
import { AppearScale, FadeInView, Pulse } from "@/components/motion";
import { useAppSession } from "@/hooks/useAppSession";
import { useLanguage } from "@/i18n/LanguageContext";
import { palette, radius } from "@/utils/theme";
import { PREMIUM_PRICE_LABEL } from "@triggermap/shared/constants/premium";
import { success as hapticSuccess } from "@/utils/haptics";

const outcomes = [
  { titleKey: "premium.outcome1Title", bodyKey: "premium.outcome1Body", exampleKey: "premium.outcome1Example" },
  { titleKey: "premium.outcome2Title", bodyKey: "premium.outcome2Body", exampleKey: "premium.outcome2Example" },
  { titleKey: "premium.outcome3Title", bodyKey: "premium.outcome3Body", exampleKey: "premium.outcome3Example" },
];

/**
 * ClarityVisual — a purely visual metaphor for "your patterns get clearer the
 * more you log": faint scattered moments (dots) with a clear trend line emerging
 * through them, sharpening toward the right. No audio, no sound — just signal
 * resolving out of noise. Illustrative (not user data) so the screen is self-contained.
 */
function ClarityVisual() {
  const W = 300;
  const H = 128;
  const dots = [
    { x: 16, y: 94, r: 3, o: 0.16 },
    { x: 38, y: 68, r: 2.5, o: 0.13 },
    { x: 56, y: 102, r: 3.5, o: 0.2 },
    { x: 84, y: 58, r: 2.5, o: 0.15 },
    { x: 102, y: 90, r: 3, o: 0.19 },
    { x: 128, y: 52, r: 2.5, o: 0.18 },
    { x: 148, y: 78, r: 3.5, o: 0.25 },
    { x: 176, y: 44, r: 3, o: 0.24 },
    { x: 198, y: 64, r: 2.5, o: 0.22 },
    { x: 224, y: 38, r: 3.5, o: 0.32 },
    { x: 248, y: 50, r: 3, o: 0.36 },
    { x: 272, y: 30, r: 3.5, o: 0.46 },
    { x: 292, y: 40, r: 4, o: 0.55 },
  ];
  const line = [0.26, 0.3, 0.27, 0.42, 0.4, 0.54, 0.58, 0.7, 0.74, 0.86, 0.93];

  return (
    <View style={styles.clarityWrap}>
      <Pulse style={styles.clarityGlow} minScale={1} maxScale={1.16} duration={3400}>
        <View style={styles.clarityGlowOrb} />
      </Pulse>
      <Svg width={W} height={H} style={styles.claritySvg} pointerEvents="none">
        {dots.map((d, i) => (
          <Circle key={i} cx={d.x} cy={d.y} r={d.r} fill={palette.accent} opacity={d.o} />
        ))}
      </Svg>
      <Sparkline data={line} width={W} height={H} color={palette.accent} strokeWidth={3} fill />
    </View>
  );
}

export function PremiumScreen() {
  const { subscribe, restoreSubscription, subscription } = useAppSession();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const isActive = subscription?.status === "active" || subscription?.status === "grace_period";

  async function handleSubscribe() {
    try {
      setBusy(true);
      await subscribe();
      hapticSuccess();
      Alert.alert(t("premium.premiumEnabled"), t("premium.insightsReady"));
    } catch (error) {
      const msg = error?.message || "Something went wrong";
      if (error?.code === "E_USER_CANCELLED" || msg.includes("cancelled")) {
        // User dismissed the purchase sheet — no alert needed
      } else if (msg.includes("not found") || msg.includes("No subscription")) {
        Alert.alert(t("premium.subscriptionUnavailable"), t("premium.subscriptionUnavailableMessage"));
      } else if (msg.includes("not completed")) {
        Alert.alert(t("premium.purchaseIncomplete"), t("premium.purchaseIncompleteMessage"));
      } else {
        Alert.alert(t("premium.subscriptionError"), msg);
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleRestore() {
    try {
      setBusy(true);
      const result = await restoreSubscription();
      if (result) {
        Alert.alert(t("premium.restored"), t("premium.restoredMessage"));
      } else {
        Alert.alert(t("premium.noSubscription"), t("premium.noSubscriptionMessage"));
      }
    } catch {
      Alert.alert(t("premium.restoreFailed"), t("premium.restoreFailedMessage"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenShell scroll edges={["top", "left", "right", "bottom"]}>
      {/* ── Hero: clarity emerging over time ── */}
      <AppearScale style={styles.hero}>
        <Text style={styles.kicker}>{t("premium.kicker")}</Text>
        <ClarityVisual />
        <Text style={styles.title}>{t("premium.title")}</Text>
        <Text style={styles.subtitle}>{t("premium.subtitle")}</Text>
      </AppearScale>

      {/* ── What deepens with Premium (outcomes, not a checklist) ── */}
      <Text style={styles.sectionHeader}>{t("premium.outcomesHeader")}</Text>
      {outcomes.map((o, i) => (
        <Card key={o.titleKey} accent={palette.accent} glow delay={80 + i * 90} style={styles.card}>
          <Text style={styles.outcomeTitle}>{t(o.titleKey)}</Text>
          <Text style={styles.outcomeBody}>{t(o.bodyKey)}</Text>
          <View style={styles.exampleRow}>
            <View style={styles.exampleDot} />
            <Text style={styles.outcomeExample}>{t(o.exampleKey)}</Text>
          </View>
        </Card>
      ))}

      {/* ── Honest preview hook ── */}
      <FadeInView delay={360}>
        <View style={styles.previewCard}>
          <Text style={styles.previewTitle}>{t("premium.previewTitle")}</Text>
          <View style={styles.previewBlur}>
            <Text style={styles.previewBlurText}>{t("premium.previewText")}</Text>
            <LinearGradient
              colors={["transparent", "transparent", "transparent", "rgba(13, 20, 36, 0.85)"]}
              locations={[0, 0.6, 0.75, 1]}
              style={styles.previewGradient}
            />
          </View>
          <Text style={styles.previewHint}>{t("premium.previewHint")}</Text>
        </View>
      </FadeInView>

      {/* ── Free-baseline reassurance: nothing is gated ── */}
      <FadeInView delay={440}>
        <View style={styles.reassureRow}>
          <Text style={styles.reassureIcon}>🔒</Text>
          <Text style={styles.reassureText}>{t("premium.baselineSafe")}</Text>
        </View>
      </FadeInView>

      {/* ── One inevitable CTA ── */}
      {!isActive ? (
        <AppearScale delay={120} style={styles.ctaWrap}>
          <View style={styles.ctaGlow}>
            <PrimaryButton
              label={busy ? t("common.pleaseWait") : t("premium.unlockCta")}
              disabled={busy}
              onPress={handleSubscribe}
            />
          </View>
          <Text style={styles.price}>{PREMIUM_PRICE_LABEL}</Text>
          <Pressable onPress={handleRestore} disabled={busy} hitSlop={10}>
            <Text style={styles.restoreLink}>{t("premium.restorePurchase")}</Text>
          </Pressable>
        </AppearScale>
      ) : (
        <View style={styles.activeCard}>
          <Text style={styles.activeIcon}>✓</Text>
          <Text style={styles.activeText}>{t("premium.activeText")}</Text>
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  /* Hero */
  hero: {
    alignItems: "center",
    gap: 8,
    marginTop: 8,
    marginBottom: 6,
  },
  kicker: {
    color: palette.accent,
    textTransform: "uppercase",
    letterSpacing: 1.6,
    fontSize: 11,
    fontWeight: "700",
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.4,
    textAlign: "center",
  },
  subtitle: {
    color: palette.muted,
    fontSize: 15,
    lineHeight: 21,
    textAlign: "center",
    maxWidth: 300,
  },

  /* Clarity visual */
  clarityWrap: {
    width: 300,
    height: 128,
    alignItems: "center",
    justifyContent: "center",
    marginVertical: 4,
  },
  claritySvg: {
    ...StyleSheet.absoluteFillObject,
  },
  clarityGlow: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
  },
  clarityGlowOrb: {
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: palette.cardGlow,
  },

  /* Section header */
  sectionHeader: {
    color: palette.textSecondary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 6,
    marginBottom: 2,
  },

  /* Outcome cards */
  card: {
    marginBottom: 2,
  },
  outcomeTitle: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.2,
  },
  outcomeBody: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 5,
  },
  exampleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: palette.glassBorder,
  },
  exampleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: palette.accent,
    marginTop: 6,
  },
  outcomeExample: {
    flex: 1,
    color: palette.accent,
    fontSize: 13,
    lineHeight: 19,
    fontStyle: "italic",
  },

  /* Preview */
  previewCard: {
    borderRadius: radius.md,
    padding: 18,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.accentMedium,
    gap: 10,
    overflow: "hidden",
  },
  previewTitle: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  previewBlur: {
    position: "relative",
    overflow: "hidden",
  },
  previewBlurText: {
    color: palette.text,
    fontSize: 14,
    lineHeight: 21,
    opacity: 0.85,
  },
  previewGradient: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: "30%",
  },
  previewHint: {
    color: palette.textSecondary,
    fontSize: 12,
    fontStyle: "italic",
  },

  /* Reassurance */
  reassureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    marginTop: 2,
  },
  reassureIcon: {
    fontSize: 13,
  },
  reassureText: {
    flex: 1,
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
  },

  /* CTA */
  ctaWrap: {
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  ctaGlow: {
    alignSelf: "stretch",
    borderRadius: radius.pill,
    shadowColor: palette.accent,
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  price: {
    color: palette.textSecondary,
    fontSize: 13,
    fontWeight: "600",
  },
  restoreLink: {
    color: palette.muted,
    fontSize: 13,
    textDecorationLine: "underline",
    paddingVertical: 4,
  },

  /* Active */
  activeCard: {
    borderRadius: radius.md,
    padding: 16,
    backgroundColor: palette.successSoft,
    borderWidth: 1,
    borderColor: palette.success,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  activeIcon: {
    color: palette.success,
    fontSize: 18,
    fontWeight: "700",
  },
  activeText: {
    color: palette.text,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
});
