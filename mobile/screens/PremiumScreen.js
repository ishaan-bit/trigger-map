import { useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppSession } from "@/hooks/useAppSession";
import { useLanguage } from "@/i18n/LanguageContext";
import { palette, radius } from "@/utils/theme";
import { PREMIUM_PRICE_LABEL } from "@triggermap/shared/constants/premium";
import { success as hapticSuccess } from "@/utils/haptics";

const transformationKeys = [
  { beforeKey: "premium.transform1Before", afterKey: "premium.transform1After", icon: "🔍" },
  { beforeKey: "premium.transform2Before", afterKey: "premium.transform2After", icon: "🌿" },
  { beforeKey: "premium.transform3Before", afterKey: "premium.transform3After", icon: "✦" },
];

const premiumFeatureKeys = [
  { icon: "🧠", key: "premium.feature1" },
  { icon: "📈", key: "premium.feature2" },
  { icon: "🔥", key: "premium.feature3" },
  { icon: "💬", key: "premium.feature4" },
];

export function PremiumScreen() {
  const router = useRouter();
  const { subscribe, restoreSubscription, subscription, user } = useAppSession();
  const { t } = useLanguage();
  const [busy, setBusy] = useState(false);
  const isActive = subscription?.status === "active" || subscription?.status === "grace_period";

  return (
    <ScreenShell scroll edges={["top", "left", "right", "bottom"]}>
      <View style={styles.hero}>
        <Image
          source={require("@/assets/premium-pattern.png")}
          style={styles.heroVisual}
          resizeMode="cover"
          accessible={false}
        />
        <View style={styles.heroOverlay}>
          <Text style={styles.kicker}>{t("premium.kicker")}</Text>
          <Text style={styles.title}>{t("premium.title")}</Text>
          <Text style={styles.subtitle}>
            {t("premium.subtitle")}
          </Text>
        </View>
      </View>

      {/* BEFORE → AFTER transformations */}
      <View style={styles.transformSection}>
        <Text style={styles.transformHeader}>{t("premium.transformHeader")}</Text>
        {transformationKeys.map((tk) => (
          <View key={tk.beforeKey} style={styles.transformCard}>
            <View style={styles.transformRow}>
              <Text style={styles.transformLabel}>{t("premium.before")}</Text>
              <Text style={styles.transformBefore}>"{t(tk.beforeKey)}"</Text>
            </View>
            <View style={styles.transformArrow}>
              <Text style={styles.transformArrowIcon}>{tk.icon}</Text>
              <View style={styles.transformArrowLine} />
            </View>
            <View style={styles.transformRow}>
              <Text style={[styles.transformLabel, styles.transformLabelAfter]}>{t("premium.after")}</Text>
              <Text style={styles.transformAfter}>"{t(tk.afterKey)}"</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Blurred insight preview */}
      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>{t("premium.previewTitle")}</Text>
        <View style={styles.previewBlur}>
          <Text style={styles.previewBlurText}>
            {t("premium.previewText")}
          </Text>
          <LinearGradient
            colors={["transparent", "transparent", "transparent", "rgba(13, 20, 36, 0.85)"]}
            locations={[0, 0.6, 0.75, 1]}
            style={styles.previewGradient}
          />
        </View>
        <Text style={styles.previewHint}>{t("premium.previewHint")}</Text>
      </View>

      {/* Feature list */}
      <View style={styles.featureCard}>
        <Text style={styles.featureCardTitle}>{t("premium.featureCardTitle")}</Text>
        <Text style={styles.featureCardPrice}>{PREMIUM_PRICE_LABEL}</Text>
        {premiumFeatureKeys.map((f) => (
          <View key={f.key} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{f.icon}</Text>
            <Text style={styles.featureText}>{t(f.key)}</Text>
          </View>
        ))}
      </View>

      {!user ? (
        <PrimaryButton
          label={t("premium.createFreeAccount")}
          onPress={() => router.push("/login")}
        />
      ) : !isActive ? (
        <>
          <PrimaryButton
            label={busy ? t("common.pleaseWait") : t("premium.unlockPatterns")}
            disabled={busy}
            onPress={async () => {
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
                  Alert.alert(
                    t("premium.subscriptionUnavailable"),
                    t("premium.subscriptionUnavailableMessage")
                  );
                } else if (msg.includes("not completed")) {
                  Alert.alert(t("premium.purchaseIncomplete"), t("premium.purchaseIncompleteMessage"));
                } else {
                  Alert.alert(t("premium.subscriptionError"), msg);
                }
              } finally {
                setBusy(false);
              }
            }}
          />
          <PrimaryButton
            label={t("premium.restorePurchase")}
            secondary
            disabled={busy}
            onPress={async () => {
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
            }}
          />
        </>
      ) : null}

      {isActive && (
        <View style={styles.activeCard}>
          <Text style={styles.activeIcon}>✓</Text>
          <Text style={styles.activeText}>{t("premium.activeText")}</Text>
        </View>
      )}
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  hero: {
    marginTop: 8,
    marginHorizontal: -20,
    borderRadius: 0,
    overflow: "hidden",
    height: 200,
    position: "relative",
  },
  heroVisual: {
    width: "100%",
    height: "100%",
    opacity: 0.35,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "flex-end",
    paddingHorizontal: 24,
    paddingBottom: 20,
    gap: 6,
  },
  kicker: {
    color: palette.accent,
    textTransform: "uppercase",
    letterSpacing: 1.4,
    fontSize: 11,
    fontWeight: "700",
  },
  title: {
    color: palette.text,
    fontSize: 28,
    fontWeight: "700",
    lineHeight: 34,
  },
  subtitle: {
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },

  /* Transformation section */
  transformSection: {
    gap: 12,
  },
  transformHeader: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700",
  },
  transformCard: {
    borderRadius: radius.md,
    padding: 16,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    gap: 10,
  },
  transformRow: {
    gap: 4,
  },
  transformLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
    color: palette.textSecondary,
  },
  transformLabelAfter: {
    color: palette.accent,
  },
  transformBefore: {
    color: palette.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    fontStyle: "italic",
  },
  transformAfter: {
    color: palette.text,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  transformArrow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 2,
  },
  transformArrowIcon: {
    fontSize: 16,
  },
  transformArrowLine: {
    flex: 1,
    height: 1,
    backgroundColor: palette.glassBorder,
  },

  /* Blurred preview */
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

  /* Feature card */
  featureCard: {
    borderRadius: radius.md,
    padding: 18,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.accentMedium,
    gap: 12,
  },
  featureCardTitle: {
    color: palette.accent,
    fontSize: 16,
    fontWeight: "700",
  },
  featureCardPrice: {
    color: palette.textSecondary,
    fontSize: 13,
    marginTop: -6,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 4,
  },
  featureIcon: {
    fontSize: 16,
    width: 22,
    textAlign: "center",
  },
  featureText: {
    color: palette.text,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },

  /* Active state */
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