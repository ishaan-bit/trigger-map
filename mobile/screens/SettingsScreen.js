import { Alert, Animated, Easing, Linking, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useState, useEffect, useRef } from "react";
import { ScreenShell } from "@/components/ScreenShell";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useAppSession } from "@/hooks/useAppSession";
import { useLanguage } from "@/i18n/LanguageContext";
import { getWebBaseUrl } from "@/services/api";
import { palette, radius } from "@/utils/theme";
import { selection, warning, tap } from "@/utils/haptics";
import { STAGGER_DELAY } from "@/utils/designSystem";

/** Stagger-in wrapper */
function StaggerIn({ index, children, style }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 500,
      delay: index * STAGGER_DELAY,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [anim, index]);
  const opacity = anim;
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return <Animated.View style={[style, { opacity, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

function Section({ icon, title, children, index }) {
  return (
    <StaggerIn index={index} style={styles.section}>
      <View style={styles.sectionTitleRow}>
        {icon ? <Text style={styles.sectionIcon}>{icon}</Text> : null}
        <Text style={styles.sectionTitle}>{title}</Text>
      </View>
      {children}
    </StaggerIn>
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
  const { t, lang, setLang } = useLanguage();
  const baseUrl = getWebBaseUrl();
  const [permissionStatus, setPermissionStatus] = useState("undetermined");
  const glowAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Notifications.getPermissionsAsync().then(({ status }) => setPermissionStatus(status));
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, { toValue: 1, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
        Animated.timing(glowAnim, { toValue: 0, duration: 3000, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
      ])
    ).start();
  }, [glowAnim]);

  const notificationsBlocked = permissionStatus === "denied";

  const isPremium = subscription?.status === "active" || subscription?.status === "grace_period";
  const planLabel = isPremium ? t("settings.premium") : user ? t("settings.free") : t("settings.anonymous");

  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.02, 0.05] });

  return (
    <ScreenShell scroll edges={["top", "left", "right", "bottom"]}>
      <Animated.View style={[styles.glowOrb, { opacity: glowOpacity }]} />

      <StaggerIn index={0}>
        <View style={styles.header}>
          <Text style={styles.kicker}>{t("settings.kicker")}</Text>
          <Text style={styles.title}>{t("settings.title")}</Text>
          <Text style={styles.subtitle}>{t("settings.subtitle")}</Text>
        </View>
      </StaggerIn>

      {/* ── Account ── */}
      <Section icon="👤" title={t("settings.account")} index={1}>
        <Row label={t("settings.status")} value={user ? user.email : t("settings.anonymous")} />
        {!user && (
          <Text style={styles.hintText}>{t("settings.signInHint")}</Text>
        )}
        <PrimaryButton
          label={user ? t("settings.signOut") : t("settings.signIn")}
          onPress={user ? async () => {
            tap();
            try {
              await signOut();
              router.replace("/login");
            } catch {
              Alert.alert(t("login.signOutFailed"), t("common.retry"));
            }
          } : () => { tap(); router.push("/login"); }}
          secondary
        />
      </Section>

      {/* ── Subscription ── */}
      <Section icon="✦" title={t("settings.subscription")} index={2}>
        <View style={styles.planRow}>
          <View style={[styles.planBadge, isPremium && styles.planBadgePremium]}>
            <Text style={[styles.planBadgeText, isPremium && styles.planBadgeTextPremium]}>{planLabel}</Text>
          </View>
        </View>
        {isPremium ? (
          <Text style={styles.hintText}>{t("settings.premiumHint")}</Text>
        ) : user ? (
          <Text style={styles.hintText}>{t("settings.upgradeHint")}</Text>
        ) : (
          <Text style={styles.hintText}>{t("settings.anonPremiumHint")}</Text>
        )}
        <PrimaryButton label={t("settings.viewPlans")} onPress={() => router.push("/(tabs)/premium")} secondary />
      </Section>

      {/* ── Notifications ── */}
      {/* ── Language ── */}
      <Section icon="🌐" title={t("settings.language")} index={3}>
        <Text style={styles.hintText}>{t("settings.languageHint")}</Text>
        <View style={styles.langRow}>
          <Pressable
            style={[styles.langOption, lang === "en" && styles.langOptionActive]}
            onPress={() => { selection(); setLang("en"); }}
            accessibilityRole="button"
          >
            <Text style={[styles.langLabel, lang === "en" && styles.langLabelActive]}>English</Text>
          </Pressable>
          <Pressable
            style={[styles.langOption, lang === "hi" && styles.langOptionActive]}
            onPress={() => { selection(); setLang("hi"); }}
            accessibilityRole="button"
          >
            <Text style={[styles.langLabel, lang === "hi" && styles.langLabelActive]}>हिन्दी</Text>
          </Pressable>
        </View>
      </Section>

      {/* ── Notifications ── */}
      <Section icon="🔔" title={t("settings.notifications")} index={4}>
        {notificationsBlocked ? (
          <View style={styles.permissionNotice}>
            <Text style={styles.permissionNoticeText}>
              {t("settings.notificationsBlocked")}
            </Text>
            <PrimaryButton label={t("settings.openSettings")} onPress={() => Linking.openSettings()} secondary />
          </View>
        ) : (
          <>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.rowLabel}>{t("settings.dailyCheckIn")}</Text>
                <Text style={styles.switchHint}>{t("settings.dailyCheckInHint")}</Text>
              </View>
              <Switch
                onValueChange={async (value) => {
                  selection();
                  try { await toggleReflection(value); } catch (error) { Alert.alert(t("settings.reminderError"), error.message); }
                }}
                value={reflectionEnabled}
                trackColor={{ false: palette.glass, true: palette.accentGlow }}
                thumbColor={reflectionEnabled ? palette.accent : palette.muted}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.rowLabel}>{t("settings.weeklyInsights")}</Text>
                <Text style={styles.switchHint}>{t("settings.weeklyInsightsHint")}</Text>
              </View>
              <Switch
                onValueChange={async (value) => {
                  selection();
                  try { await toggleReminder(value); } catch (error) { Alert.alert(t("settings.reminderError"), error.message); }
                }}
                value={reminderEnabled}
                trackColor={{ false: palette.glass, true: palette.accentGlow }}
                thumbColor={reminderEnabled ? palette.accent : palette.muted}
              />
            </View>
            <View style={styles.switchRow}>
              <View style={styles.switchLabel}>
                <Text style={styles.rowLabel}>{t("settings.gentleNudges")}</Text>
                <Text style={styles.switchHint}>{t("settings.gentleNudgesHint")}</Text>
              </View>
              <Switch
                onValueChange={async (value) => {
                  selection();
                  try { await toggleNudges(value); } catch (error) { Alert.alert(t("settings.reminderError"), error.message); }
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
      <Section icon="📂" title={t("settings.data")} index={5}>
        <PrimaryButton
          label={t("settings.exportLogs")}
          onPress={async () => {
            try {
              await exportLogs();
            } catch (error) {
              Alert.alert(t("settings.exportFailed"), error.message);
            }
          }}
          secondary
        />
        {user && (
          <Text style={styles.hintText}>{t("settings.exportHint")}</Text>
        )}
        <PrimaryButton
          label={t("settings.deleteAll")}
          onPress={() => {
            warning();
            Alert.alert(
              t("settings.deleteConfirmTitle"),
              t("settings.deleteConfirmMessage"),
              [
                { text: t("common.cancel"), style: "cancel" },
                {
                  text: t("settings.deleteEverything"),
                  style: "destructive",
                  onPress: async () => {
                    try {
                      await deleteAllUserData();
                      Alert.alert(t("common.done"), t("settings.deleteDone"));
                    } catch (error) {
                      Alert.alert(t("settings.deleteFailed"), error.message);
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
      <Section icon="🔒" title={t("settings.privacy")} index={6}>
        <Text style={styles.hintText}>{t("settings.privacyHint")}</Text>
        <PrimaryButton label={t("settings.privacyPolicy")} onPress={() => Linking.openURL(`${baseUrl}/legal/privacy`)} secondary />
        <PrimaryButton label={t("settings.terms")} onPress={() => Linking.openURL(`${baseUrl}/legal/terms`)} secondary />
        <Row label={t("settings.support")} value="qdenxp@gmail.com" />
      </Section>

      {/* ── About ── */}
      <Section icon="ℹ️" title={t("settings.about")} index={7}>
        <Text style={styles.aboutName}>{t("settings.aboutName")}</Text>
        <Text style={styles.aboutBody}>
          {t("settings.aboutBody")}
        </Text>
        <View style={styles.aboutMeta}>
          <Row label={t("settings.version")} value={`v${Constants.expoConfig?.version || "1.0.0"}`} />
          <Row label={t("settings.developer")} value="QuietDen (OPC) Pvt. Ltd." />
          <Row label={t("settings.website")} value="qdenxp.com" />
        </View>
        <Text style={styles.aboutFooter}>{t("settings.aboutFooter")}</Text>
      </Section>

    </ScreenShell>
  );
}

const styles = StyleSheet.create({
  glowOrb: {
    position: "absolute",
    top: -40,
    alignSelf: "center",
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: palette.accent,
  },
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
    color: palette.textSecondary,
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
    color: palette.textSecondary,
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
    color: palette.textSecondary,
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
    color: palette.textSecondary,
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
    color: palette.textSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  aboutMeta: {
    gap: 4,
    marginTop: 4,
  },
  aboutFooter: {
    color: palette.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  langRow: {
    flexDirection: "row",
    gap: 10,
  },
  langOption: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: palette.glassBorder,
    alignItems: "center",
  },
  langOptionActive: {
    borderColor: palette.accent,
    backgroundColor: palette.accentSoft,
  },
  langLabel: {
    color: palette.textSecondary,
    fontSize: 15,
    fontWeight: "600",
  },
  langLabelActive: {
    color: palette.accent,
  },
});