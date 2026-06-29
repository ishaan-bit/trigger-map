import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { GuideModal } from "../components/GuideModal";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../lib/i18n";
import { saveNotificationPrefs } from "../lib/api";

const APP_VERSION = "1.0.17";

function Section({ icon, title, children }) {
  return (
    <div className="settingsSection">
      <div className="settingsSectionTitle">
        {icon ? <span className="settingsSectionIcon">{icon}</span> : null}
        <span className="sectionKicker">{title}</span>
      </div>
      {children}
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="settingsRow">
      <span>{label}</span>
      <span className="muted">{value}</span>
    </div>
  );
}

function Toggle({ label, hint, checked, onChange }) {
  return (
    <div className="settingsSwitchRow">
      <div className="settingsSwitchLabel">
        <span className="settingsSwitchTitle">{label}</span>
        {hint ? <span className="settingsSwitchHint">{hint}</span> : null}
      </div>
      <button type="button" role="switch" aria-checked={checked} className={`toggleSwitch ${checked ? "toggleSwitchOn" : ""}`} onClick={() => onChange(!checked)}>
        <span className="toggleThumb" />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { subscription, exportLogs, deleteAllUserData, isPremium } = useSession();
  const { t, lang, setLang } = useI18n();
  const planLabel = isPremium ? t("settings.premium", "Premium") : t("settings.free", "Free");

  const [dailyCheckin, setDailyCheckin] = useState(false);
  const [weeklyInsights, setWeeklyInsights] = useState(false);
  const [gentleNudges, setGentleNudges] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [notifBlocked, setNotifBlocked] = useState(false);

  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem("tm_notification_prefs") || "{}");
      setDailyCheckin(!!prefs.dailyCheckin);
      setWeeklyInsights(!!prefs.weeklyInsights);
      setGentleNudges(!!prefs.gentleNudges);
    } catch {}
    if (typeof Notification !== "undefined" && Notification.permission === "denied") setNotifBlocked(true);
  }, []);

  async function setPref(key, value, next) {
    // Persist locally for instant UI, then sync to backend keyed by deviceId so
    // push-cron honors the opt-out. Request permission when enabling.
    try {
      const prefs = JSON.parse(localStorage.getItem("tm_notification_prefs") || "{}");
      prefs[key] = value;
      localStorage.setItem("tm_notification_prefs", JSON.stringify(prefs));
    } catch {}

    if (value && typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        const perm = await Notification.requestPermission();
        if (perm === "denied") setNotifBlocked(true);
      } catch {}
    }
    // Map UI toggles → backend prefs (daily/weekly/nudge).
    saveNotificationPrefs({ daily: next.dailyCheckin, weekly: next.weeklyInsights, nudge: next.gentleNudges }).catch(() => null);
  }

  return (
    <Layout title={t("tabs.settings", "Settings")}>
      <div className="stack">
        <div className="card cardFeature stack">
          <p className="sectionKicker">{t("settings.kicker", "Preferences")}</p>
          <h2>{t("tabs.settings", "Settings")}</h2>
          <p className="muted">{t("settings.subtitle", "Manage your language, notifications, and data.")}</p>
        </div>

        {/* Identity */}
        <Section icon="👤" title={t("settings.yourData", "Your data")}>
          <Row label={t("settings.identity", "Identity")} value={t("settings.thisDevice", "This device")} />
          <p className="muted" style={{ fontSize: 13 }}>{t("settings.identityBody", "No account or sign-in needed. A private device ID keeps your logs linked on this device.")}</p>
        </Section>

        {/* Language */}
        <Section icon="🌐" title={t("settings.language", "Language")}>
          <div className="langToggleRow">
            <button type="button" className={`langPill${lang === "en" ? " langPillActive" : ""}`} onClick={() => setLang("en")}>English</button>
            <button type="button" className={`langPill${lang === "hi" ? " langPillActive" : ""}`} onClick={() => setLang("hi")}>हिन्दी</button>
          </div>
        </Section>

        {/* Subscription */}
        <Section icon="✦" title={t("settings.subscription", "Subscription")}>
          <div className="settingsRow">
            <span className={`planBadge ${isPremium ? "planBadgePremium" : ""}`}>{planLabel}</span>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>
            {isPremium ? t("settings.premiumBody", "Personalized AI insights and detailed charts unlocked.") : t("settings.freeBody", "Go Premium for AI narrative insights and deeper pattern intelligence.")}
          </p>
          <button className="ghostButton" type="button" onClick={() => router.push("/premium")}>{t("settings.viewPlans", "View plans")}</button>
        </Section>

        {/* Notifications */}
        <Section icon="🔔" title={t("settings.notifications", "Notifications")}>
          <Toggle label={t("settings.dailyCheckin", "Daily check-in")} hint={t("settings.dailyCheckinHint", "A gentle evening reminder to log how your day went.")}
            checked={dailyCheckin}
            onChange={(v) => { setDailyCheckin(v); setPref("dailyCheckin", v, { dailyCheckin: v, weeklyInsights, gentleNudges }); }} />
          <Toggle label={t("settings.weeklyInsights", "Weekly insights")} hint={t("settings.weeklyInsightsHint", "Get notified when your weekly pattern report is ready.")}
            checked={weeklyInsights}
            onChange={(v) => { setWeeklyInsights(v); setPref("weeklyInsights", v, { dailyCheckin, weeklyInsights: v, gentleNudges }); }} />
          <Toggle label={t("settings.gentleNudges", "Gentle nudges")} hint={t("settings.gentleNudgesHint", "Encouraging prompts if you haven't logged in a while.")}
            checked={gentleNudges}
            onChange={(v) => { setGentleNudges(v); setPref("gentleNudges", v, { dailyCheckin, weeklyInsights, gentleNudges: v }); }} />
          {notifBlocked ? (
            <p className="muted" style={{ fontSize: 12 }}>{t("settings.notifBlocked", "Notifications are blocked in your browser settings. Enable them for this site to receive reminders.")}</p>
          ) : (
            <p className="muted" style={{ fontSize: 12 }}>{t("settings.notifNote", "On iPhone, install TriggerMap to your Home Screen first to receive notifications.")}</p>
          )}
        </Section>

        {/* Data */}
        <Section icon="📂" title={t("settings.data", "Data")}>
          <button className="ghostButton" type="button" onClick={async () => {
            try { await exportLogs(); } catch (err) { alert(`${t("settings.exportFailed", "Export failed")}: ${err.message}`); }
          }}>{t("settings.exportLogs", "Export logs")}</button>
          <p className="muted" style={{ fontSize: 13 }}>{t("settings.exportBody", "Exports include all your logged moments.")}</p>
          <button className="ghostButton dangerButton" type="button" onClick={async () => {
            if (!confirm(t("settings.deleteConfirm", "Delete all data? This will permanently remove all your moments, reports, and insights. This cannot be undone."))) return;
            try { await deleteAllUserData(); alert(t("settings.deleteDone", "All your data has been deleted.")); }
            catch (err) { alert(`${t("settings.deleteFailed", "Delete failed")}: ${err.message}`); }
          }}>{t("settings.deleteAll", "Delete all data")}</button>
        </Section>

        {/* Privacy */}
        <Section icon="🔒" title={t("settings.privacy", "Privacy")}>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{t("settings.privacyBody", "Privacy first. Your data stays yours.")}</p>
          <a className="ghostButton inlineButton" href="/legal/privacy" target="_blank" rel="noopener noreferrer">{t("settings.privacyPolicy", "Privacy policy")}</a>
          <a className="ghostButton inlineButton" href="/legal/terms" target="_blank" rel="noopener noreferrer">{t("settings.terms", "Terms and conditions")}</a>
          <Row label={t("settings.support", "Support")} value="qdenxp@gmail.com" />
        </Section>

        {/* About */}
        <Section icon="ℹ️" title={t("settings.about", "About")}>
          <strong style={{ fontSize: 16 }}>TriggerMap</strong>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>{t("settings.aboutBody", "Log moments, reflect on emotional triggers, and understand weekly patterns over time.")}</p>
          <button className="ghostButton inlineButton" type="button" onClick={() => setShowGuide(true)}>{t("settings.howToUse", "How to use TriggerMap")}</button>
          <Row label={t("settings.version", "Version")} value={`v${APP_VERSION}`} />
          <Row label={t("settings.developer", "Developer")} value="QuietDen (OPC) Pvt. Ltd." />
          <Row label={t("settings.website", "Website")} value="qdenxp.com" />
        </Section>
      </div>

      <GuideModal visible={showGuide} onClose={() => setShowGuide(false)} />
    </Layout>
  );
}
