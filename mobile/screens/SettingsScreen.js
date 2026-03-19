import { Alert, Linking, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useState, useEffect } from "react";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppSession } from "@/hooks/useAppSession";
import { getWebBaseUrl } from "@/services/api";
import { palette, radius } from "@/utils/theme";

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

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

export function SettingsScreen() {
  const router = useRouter();
  const {
    exportLogs, deleteAllUserData, reminderEnabled, reflectionEnabled, nudgesEnabled,
    signOut, subscription, toggleReminder, toggleReflection, toggleNudges, user,
  } = useAppSession();
  const baseUrl = getWebBaseUrl();
  const [permissionStatus, setPermissionStatus] = useState("undetermined");

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => setPermissionStatus(status));
  }, []);

  const notificationsBlocked = permissionStatus === "denied";

  const isPremium = subscription?.status === "active" || subscription?.status === "grace_period";
  const planLabel = isPremium ? "Premium" : user ? "Free" : "Anonymous";

  return (
    <ScreenShell scroll edges={["top", "left", "right"]}>

      <View style={styles.header}>
        <Text style={styles.kicker}>Preferences</Text>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>Manage your account, notifications, and data.</Text>
      </View>

      {/* ── Account ── */}
      <Section icon="👤" title="Account">
        <Row label="Status" value={user ? user.email : "Anonymous"} />
        {!user && (
          <Text style={styles.hintText}>Sign in to sync your data and unlock deeper insights.</Text>
        )}
        <PrimaryButton
          label={user ? "Sign out" : "Sign in"}
          onPress={user ? async () => {
            try {
              await signOut();
              router.replace("/login");
            } catch {
              Alert.alert("Sign out failed", "Please try again.");
            }
          } : () => router.push("/login")}
          secondary
        />
      </Section>

      {/* ── Subscription ── */}
      <Section icon="✦" title="Subscription">
        <View style={styles.planRow}>
          <View style={[styles.planBadge, isPremium && styles.planBadgePremium]}>
            <Text style={[styles.planBadgeText, isPremium && styles.planBadgeTextPremium]}>{planLabel}</Text>
          </View>
        </View>
        {isPremium ? (
          <Text style={styles.hintText}>Personalized AI insights and detailed charts unlocked.</Text>
        ) : user ? (
          <Text style={styles.hintText}>Upgrade to Premium for AI narrative insights and advanced analytics.</Text>
        ) : (
          <Text style={styles.hintText}>Create a free account to sync, or go Premium for AI insights.</Text>
        )}
        <PrimaryButton label="View plans" onPress={() => router.push("/(tabs)/premium")} secondary />
      </Section>

      {/* ── Notifications ── */}
      <Section icon="🔔" title="Notifications">
        {notificationsBlocked ? (
          <View style={styles.permissionNotice}>
            <Text style={styles.permissionNoticeText}>
              Notifications are turned off. Enable them in your device settings to receive reminders.
            </Text>
            <PrimaryButton label="Open settings" onPress={() => Linking.openSettings()} secondary />
          </View>
        ) : (
          <>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.rowLabel}>Daily check-in</Text>
                <Text style={styles.switchHint}>A gentle evening reminder to log how your day went.</Text>
              </View>
              <Switch
                onValueChange={async (value) => {
                  try { await toggleReflection(value); } catch (error) { Alert.alert("Reminder error", error.message); }
                }}
                value={reflectionEnabled}
                trackColor={{ false: palette.glass, true: palette.accentGlow }}
                thumbColor={reflectionEnabled ? palette.accent : palette.muted}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.rowLabel}>Weekly insights</Text>
                <Text style={styles.switchHint}>Get notified when your weekly pattern report is ready.</Text>
              </View>
              <Switch
                onValueChange={async (value) => {
                  try { await toggleReminder(value); } catch (error) { Alert.alert("Reminder error", error.message); }
                }}
                value={reminderEnabled}
                trackColor={{ false: palette.glass, true: palette.accentGlow }}
                thumbColor={reminderEnabled ? palette.accent : palette.muted}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.rowLabel}>Gentle nudges</Text>
                <Text style={styles.switchHint}>A quiet prompt if you haven't logged in a few days.</Text>
              </View>
              <Switch
                onValueChange={async (value) => {
                  try { await toggleNudges(value); } catch (error) { Alert.alert("Reminder error", error.message); }
                }}
                value={nudgesEnabled}
                trackColor={{ false: palette.glass, true: palette.accentGlow }}
                thumbColor={nudgesEnabled ? palette.accent : palette.muted}
              />
            </View>
          </>
        )}
      </Section>

      {/* ── Data ── */}
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
        {user && (
          <Text style={styles.hintText}>Exports include all synced and local moments.</Text>
        )}
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
                      Alert.alert("Done", "All your data has been deleted.");
                    } catch (error) {
                      Alert.alert("Delete failed", error.message);
                    }
                  },
                },
              ]
            );
          }}
          danger
        />
      </Section>

      {/* ── Privacy ── */}
      <Section icon="🔒" title="Privacy">
        <Text style={styles.hintText}>Privacy first — your data stays yours.</Text>
        <PrimaryButton label="Privacy policy" onPress={() => Linking.openURL(`${baseUrl}/legal/privacy`)} secondary />
        <PrimaryButton label="Terms and conditions" onPress={() => Linking.openURL(`${baseUrl}/legal/terms`)} secondary />
        <Row label="Support" value="qdenxp@gmail.com" />
      </Section>

      {/* ── About ── */}
      <Section icon="ℹ️" title="About">
        <Text style={styles.aboutName}>TriggerMap</Text>
        <Text style={styles.aboutBody}>
          Log moments, reflect on emotional triggers, and understand weekly patterns over time.
        </Text>
        <View style={styles.aboutMeta}>
          <Row label="Version" value={`v${Constants.expoConfig?.version || "1.0.0"}`} />
          <Row label="Developer" value="QuietDen (OPC) Pvt. Ltd." />
          <Row label="Website" value="qdenxp.com" />
        </View>
        <Text style={styles.aboutFooter}>Registered December 2025, India</Text>
      </Section>

    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: 6,
    marginTop: 10,
    marginBottom: 4,
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
    lineHeight: 32,
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
    borderRadius: radius.md,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 28,
  },
  rowLabel: {
    color: palette.text,
    fontSize: 14,
    fontWeight: "500",
  },
  rowValue: {
    color: palette.textSecondary,
    fontSize: 14,
    flexShrink: 1,
    textAlign: "right",
  },
  hintText: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  planRow: {
    flexDirection: "row",
  },
  planBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radius.pill,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.glassBorder,
  },
  planBadgePremium: {
    backgroundColor: palette.accentSoft,
    borderColor: palette.accentMedium,
  },
  planBadgeText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  planBadgeTextPremium: {
    color: palette.accent,
  },
  switchRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  switchLabel: {
    flex: 1,
    gap: 2,
  },
  switchHint: {
    color: palette.muted,
    fontSize: 12,
    lineHeight: 16,
  },
  permissionNotice: {
    gap: 10,
    padding: 12,
    borderRadius: radius.sm,
    backgroundColor: palette.warningSoft,
    borderWidth: 1,
    borderColor: palette.warning + "33",
  },
  permissionNoticeText: {
    color: palette.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  aboutName: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "700",
  },
  aboutBody: {
    color: palette.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  aboutMeta: {
    gap: 4,
    marginTop: 4,
  },
  aboutFooter: {
    color: palette.muted,
    fontSize: 12,
    marginTop: 4,
  },
});