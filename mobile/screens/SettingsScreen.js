import { Alert, Image, Linking, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppSession } from "@/hooks/useAppSession";
import { getWebBaseUrl } from "@/services/api";
import { palette } from "@/utils/theme";

function Section({ icon, title, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionTitleRow}>
        {icon ? <Text style={styles.sectionIcon}>{icon}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const { exportLogs, deleteAllUserData, reminderEnabled, signOut, subscription, toggleReminder, user } = useAppSession();
  const baseUrl = getWebBaseUrl();

  const isPremium = subscription?.status === "active" || subscription?.status === "grace_period";

  return (
    <ScreenShell scroll>
      <Image source={require("@/assets/timeline-empty.png")} style={styles.bgImage} resizeMode="cover" accessible={false} />

      <View style={styles.header}>
        <Text style={styles.kicker}>Preferences</Text>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Manage your account, notifications, and data.</Text>
      </View>

      <Section icon="👤" title="Account">
        <Text style={styles.rowText}>{user ? user.email : "Anonymous"}</Text>
        <PrimaryButton label={user ? "Sign out" : "Sign in"} onPress={user ? signOut : () => router.push("/login")} secondary />
      </Section>

      <Section icon="✦" title="Subscription">
        <View style={styles.subscriptionRow}>
          <View style={[styles.statusBadge, isPremium && styles.statusBadgePremium]}>
            <Text style={[styles.statusText, isPremium && styles.statusTextPremium]}>
              {isPremium ? "Premium" : "Free"}
            </Text>
          </View>
        </View>
        <PrimaryButton label="Manage subscription" onPress={() => router.push("/(tabs)/premium")} secondary />
      </Section>

      <Section icon="🔔" title="Notifications">
        <View style={styles.switchRow}>
          <Text style={styles.rowText}>Weekly report reminder</Text>
          <Switch
            onValueChange={async (value) => {
              try {
                await toggleReminder(value);
              } catch (error) {
                Alert.alert("Reminder error", error.message);
              }
            }}
            value={reminderEnabled}
            trackColor={{ false: "rgba(255,255,255,0.08)", true: "rgba(123,201,216,0.35)" }}
            thumbColor={reminderEnabled ? palette.accent : palette.muted}
          />
        </View>
      </Section>

      <Section icon="📂" title="Data">
        <PrimaryButton
          label="Export logs"
          onPress={async () => {
            try {
              await exportLogs();
            } catch (error) {
              Alert.alert("Export failed", error.message);
            }
          }}
          secondary
        />
        {user ? (
          <PrimaryButton
            label="Delete all data"
            onPress={() => {
              Alert.alert(
                "Delete all data?",
                "This will permanently remove all your moments, reports, and insights. This cannot be undone.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Delete everything",
                    style: "destructive",
                    onPress: async () => {
                      try {
                        await deleteAllUserData();
                        Alert.alert("Done", "All your data has been deleted. You have been signed out.");
                      } catch (error) {
                        Alert.alert("Delete failed", error.message);
                      }
                    },
                  },
                ]
              );
            }}
            secondary
          />
        ) : null}
      </Section>

      <Section icon="📄" title="Legal">
        <PrimaryButton label="Privacy policy" onPress={() => Linking.openURL(`${baseUrl}/legal/privacy`)} secondary />
        <PrimaryButton label="Terms and conditions" onPress={() => Linking.openURL(`${baseUrl}/legal/terms`)} secondary />
      </Section>

      <View style={styles.footer}>
        <Text style={styles.footerText}>TriggerMap v{Constants.expoConfig?.version || "1.0.0"}</Text>
        <Text style={styles.footerMuted}>Built with care for your well-being</Text>
      </View>
    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  bgImage: {
    position: "absolute",
    top: 0,
    left: -24,
    right: -24,
    bottom: 0,
    width: undefined,
    height: undefined,
    opacity: 0.04,
  },
  header: {
    gap: 4,
    marginTop: 12,
    marginBottom: 8,
  },
  kicker: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  title: {
    color: palette.text,
    fontSize: 26,
    fontWeight: "700",
  },
  subtitle: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  section: {
    gap: 10,
    padding: 16,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.04)",
    borderWidth: 1,
    borderColor: palette.border,
  },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  sectionIcon: {
    fontSize: 14,
  },
  sectionTitle: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },
  rowText: {
    color: palette.text,
    fontSize: 16,
  },
  subscriptionRow: {
    flexDirection: "row",
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  statusBadgePremium: {
    backgroundColor: "rgba(123,201,216,0.15)",
  },
  statusText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  statusTextPremium: {
    color: palette.accent,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  footer: {
    alignItems: "center",
    gap: 4,
    paddingTop: 8,
    paddingBottom: 16,
    opacity: 0.5,
  },
  footerText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "600",
  },
  footerMuted: {
    color: palette.muted,
    fontSize: 11,
  },
});