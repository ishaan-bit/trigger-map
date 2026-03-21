import { useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppSession } from "@/hooks/useAppSession";
import { palette, radius } from "@/utils/theme";
import { PREMIUM_PRICE_LABEL } from "@triggermap/shared/constants/premium";
import { success as hapticSuccess } from "@/utils/haptics";

const transformations = [
  {
    before: "I keep feeling anxious but don't know why",
    after: "Social situations are your #1 anxiety trigger — especially in groups",
    icon: "🔍",
  },
  {
    before: "All my days feel the same",
    after: "Exercise on Tue/Thu consistently brings your calmest moments",
    icon: "🌿",
  },
  {
    before: "I log moments but nothing happens",
    after: "Weekly personalized insights show exactly what's driving your patterns",
    icon: "✦",
  },
];

const premiumFeatures = [
  { icon: "🧠", text: "Weekly personalized reflections" },
  { icon: "📈", text: "Multi-week trend tracking" },
  { icon: "🔥", text: "Friction zone analysis" },
  { icon: "💬", text: "Priority support" },
];

export function PremiumScreen() {
  const router = useRouter();
  const { subscribe, restoreSubscription, subscription, user } = useAppSession();
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
          <Text style={styles.kicker}>Premium</Text>
          <Text style={styles.title}>Unlock your{"\n"}patterns</Text>
          <Text style={styles.subtitle}>
            Turn raw moments into understanding — see what's really going on.
          </Text>
        </View>
      </View>

      {/* BEFORE → AFTER transformations */}
      <View style={styles.transformSection}>
        <Text style={styles.transformHeader}>What changes with Premium</Text>
        {transformations.map((t) => (
          <View key={t.before} style={styles.transformCard}>
            <View style={styles.transformRow}>
              <Text style={styles.transformLabel}>BEFORE</Text>
              <Text style={styles.transformBefore}>"{t.before}"</Text>
            </View>
            <View style={styles.transformArrow}>
              <Text style={styles.transformArrowIcon}>{t.icon}</Text>
              <View style={styles.transformArrowLine} />
            </View>
            <View style={styles.transformRow}>
              <Text style={[styles.transformLabel, styles.transformLabelAfter]}>AFTER</Text>
              <Text style={styles.transformAfter}>"{t.after}"</Text>
            </View>
          </View>
        ))}
      </View>

      {/* Blurred insight preview */}
      <View style={styles.previewCard}>
        <Text style={styles.previewTitle}>Your insight preview</Text>
        <View style={styles.previewBlur}>
          <Text style={styles.previewBlurText}>
            {"When work comes up, you tend to feel anxious — particularly around meetings and deadlines. This pattern appeared 4 times this week..."}
          </Text>
          <LinearGradient
            colors={["transparent", "transparent", "transparent", "rgba(13, 20, 36, 0.85)"]}
            locations={[0, 0.6, 0.75, 1]}
            style={styles.previewGradient}
          />
        </View>
        <Text style={styles.previewHint}>Upgrade to read your full personalized insight</Text>
      </View>

      {/* Feature list */}
      <View style={styles.featureCard}>
        <Text style={styles.featureCardTitle}>Everything in Premium</Text>
        <Text style={styles.featureCardPrice}>{PREMIUM_PRICE_LABEL}</Text>
        {premiumFeatures.map((f) => (
          <View key={f.text} style={styles.featureRow}>
            <Text style={styles.featureIcon}>{f.icon}</Text>
            <Text style={styles.featureText}>{f.text}</Text>
          </View>
        ))}
      </View>

      {!user ? (
        <PrimaryButton
          label="Create free account"
          onPress={() => router.push("/login")}
        />
      ) : !isActive ? (
        <>
          <PrimaryButton
            label={busy ? "Please wait..." : "Unlock your patterns"}
            disabled={busy}
            onPress={async () => {
              try {
                setBusy(true);
                await subscribe();
                hapticSuccess();
                Alert.alert("Premium enabled", "Your weekly insights are ready to view.");
              } catch (error) {
                const msg = error?.message || "Something went wrong";
                if (error?.code === "E_USER_CANCELLED" || msg.includes("cancelled")) {
                  // User dismissed the purchase sheet — no alert needed
                } else if (msg.includes("not found") || msg.includes("No subscription")) {
                  Alert.alert(
                    "Subscription unavailable",
                    "We couldn't find the subscription product on Google Play. Make sure your app is up to date and try again in a few minutes."
                  );
                } else if (msg.includes("not completed")) {
                  Alert.alert("Purchase incomplete", "The purchase was not completed. No charge was made.");
                } else {
                  Alert.alert("Subscription error", msg);
                }
              } finally {
                setBusy(false);
              }
            }}
          />
          <PrimaryButton
            label="Restore purchase"
            secondary
            disabled={busy}
            onPress={async () => {
              try {
                setBusy(true);
                const result = await restoreSubscription();
                if (result) {
                  Alert.alert("Restored", "Your premium subscription has been restored.");
                } else {
                  Alert.alert("No subscription found", "We couldn't find an active subscription for this account.");
                }
              } catch {
                Alert.alert("Restore failed", "Something went wrong. Please try again.");
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
          <Text style={styles.activeText}>Premium is active. Thank you for supporting TriggerMap.</Text>
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