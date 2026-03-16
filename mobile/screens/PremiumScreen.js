import { useState } from "react";
import { Alert, Image, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppSession } from "@/hooks/useAppSession";
import { palette, radius } from "@/utils/theme";
import { PREMIUM_PRICE_LABEL } from "@triggermap/shared/constants/premium";

const tiers = [
  {
    icon: "👤",
    name: "Anonymous",
    description: "No sign-up needed",
    features: [
      "Log triggers + emotions",
      "On-device timeline",
      "Basic weekly charts",
    ],
    highlight: false,
  },
  {
    icon: "🔓",
    name: "Free account",
    description: "Sign in to unlock",
    features: [
      "Everything in Anonymous",
      "Cloud backup + sync",
      "Weekly pattern observations",
      "First AI insight report free",
      "Edit & delete moments",
      "Export your data",
    ],
    highlight: false,
  },
  {
    icon: "✦",
    name: "Premium",
    description: PREMIUM_PRICE_LABEL,
    features: [
      "Everything in Free",
      "Weekly AI-written reflections",
      "Multi-week trend tracking",
      "Priority support",
    ],
    highlight: true,
  },
];

export function PremiumScreen() {
  const router = useRouter();
  const { subscribe, restoreSubscription, subscription, user } = useAppSession();
  const [busy, setBusy] = useState(false);
  const isActive = subscription?.status === "active" || subscription?.status === "grace_period";

  return (
    <ScreenShell scroll>
      <View style={styles.hero}>
        <Image
          source={require("@/assets/premium-pattern.png")}
          style={styles.heroVisual}
          resizeMode="cover"
          accessible={false}
        />
        <View style={styles.heroOverlay}>
          <Text style={styles.kicker}>Plans</Text>
          <Text style={styles.title}>Understand{"\n"}yourself better</Text>
          <Text style={styles.subtitle}>
            Start free. Upgrade when you're ready for deeper insight.
          </Text>
        </View>
      </View>

      {tiers.map((tier) => (
        <View key={tier.name} style={[styles.tierCard, tier.highlight && styles.tierHighlight]}>
          <View style={styles.tierHeader}>
            <View style={styles.tierIconRow}>
              <Text style={styles.tierIcon}>{tier.icon}</Text>
              <View>
                <Text style={[styles.tierName, tier.highlight && styles.tierNameHighlight]}>{tier.name}</Text>
                <Text style={styles.tierDesc}>{tier.description}</Text>
              </View>
            </View>
          </View>
          {tier.features.map((f) => (
            <View key={f} style={styles.featureRow}>
              <Text style={[styles.checkmark, tier.highlight && styles.checkmarkHighlight]}>
                {tier.highlight ? "★" : "✓"}
              </Text>
              <Text style={styles.featureText}>{f}</Text>
            </View>
          ))}
        </View>
      ))}

      {!user ? (
        <PrimaryButton
          label="Create free account"
          onPress={() => router.push("/login")}
        />
      ) : !isActive ? (
        <>
          <PrimaryButton
            label={busy ? "Please wait..." : "Upgrade to Premium"}
            disabled={busy}
            onPress={async () => {
              try {
                setBusy(true);
                await subscribe();
                Alert.alert("Premium enabled", "Your subscription is active.");
              } catch (error) {
                const msg = error?.message || "Something went wrong";
                if (msg.includes("not found") || msg.includes("unavailable") || msg.includes("No subscription")) {
                  Alert.alert("Not available yet", "Premium subscriptions are not yet available in your region. Check back soon.");
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
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  tierCard: {
    borderRadius: radius.md,
    padding: 18,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
    gap: 10,
  },
  tierHighlight: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  tierHeader: {
    marginBottom: 4,
  },
  tierIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  tierIcon: {
    fontSize: 28,
  },
  tierName: {
    color: palette.text,
    fontSize: 17,
    fontWeight: "700",
  },
  tierNameHighlight: {
    color: palette.accent,
  },
  tierDesc: {
    color: palette.muted,
    fontSize: 13,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingLeft: 4,
  },
  checkmark: {
    color: palette.success,
    fontSize: 13,
    width: 18,
    textAlign: "center",
  },
  checkmarkHighlight: {
    color: palette.accent,
  },
  featureText: {
    color: palette.text,
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
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