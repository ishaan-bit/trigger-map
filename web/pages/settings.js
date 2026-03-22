import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";

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
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`toggleSwitch ${checked ? "toggleSwitchOn" : ""}`}
        onClick={() => onChange(!checked)}
      >
        <span className="toggleThumb" />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, subscription, signOut, exportLogs, deleteAllUserData, isPremium } = useSession();
  const planLabel = isPremium ? "Premium" : user ? "Free" : "Anonymous";

  const [dailyCheckin, setDailyCheckin] = useState(false);
  const [weeklyInsights, setWeeklyInsights] = useState(false);
  const [gentleNudges, setGentleNudges] = useState(false);

  useEffect(() => {
    try {
      const prefs = JSON.parse(localStorage.getItem("tm_notification_prefs") || "{}");
      if (prefs.dailyCheckin) setDailyCheckin(true);
      if (prefs.weeklyInsights) setWeeklyInsights(true);
      if (prefs.gentleNudges) setGentleNudges(true);
    } catch {}
  }, []);

  function updateNotifPref(key, value) {
    try {
      const prefs = JSON.parse(localStorage.getItem("tm_notification_prefs") || "{}");
      prefs[key] = value;
      localStorage.setItem("tm_notification_prefs", JSON.stringify(prefs));
    } catch {}
  }

  return (
    <Layout title="Settings">
      <div className="stack">
        <div className="card cardFeature stack">
          <p className="sectionKicker">Preferences</p>
          <h2>Settings</h2>
          <p className="muted">Manage your account, notifications, and data.</p>
        </div>

        {/* Account */}
        <Section icon="👤" title="Account">
          <Row label="Status" value={user ? user.email : "Anonymous"} />
          {!user ? <p className="muted" style={{ fontSize: 13 }}>Sign in to sync your data and unlock deeper insights.</p> : null}
          <button
            className="ghostButton"
            type="button"
            onClick={user ? async () => { await signOut(); router.push("/login"); } : () => router.push("/login")}
          >
            {user ? "Sign out" : "Sign in"}
          </button>
        </Section>

        {/* Subscription */}
        <Section icon="✦" title="Subscription">
          <div className="settingsRow">
            <span className={`planBadge ${isPremium ? "planBadgePremium" : ""}`}>{planLabel}</span>
          </div>
          {isPremium ? (
            <p className="muted" style={{ fontSize: 13 }}>Personalized AI insights and detailed charts unlocked.</p>
          ) : user ? (
            <p className="muted" style={{ fontSize: 13 }}>Upgrade to Premium for AI narrative insights and advanced analytics.</p>
          ) : (
            <p className="muted" style={{ fontSize: 13 }}>Create a free account to sync, or go Premium for AI insights.</p>
          )}
          <button className="ghostButton" type="button" onClick={() => router.push("/premium")}>View plans</button>
        </Section>

        {/* Notifications */}
        <Section icon="🔔" title="Notifications">
          <Toggle
            label="Daily check-in"
            hint="A gentle evening reminder to log how your day went."
            checked={dailyCheckin}
            onChange={(v) => { setDailyCheckin(v); updateNotifPref("dailyCheckin", v); }}
          />
          <Toggle
            label="Weekly insights"
            hint="Get notified when your weekly pattern report is ready."
            checked={weeklyInsights}
            onChange={(v) => { setWeeklyInsights(v); updateNotifPref("weeklyInsights", v); }}
          />
          <Toggle
            label="Gentle nudges"
            hint="Encouraging prompts if you haven't logged in a while."
            checked={gentleNudges}
            onChange={(v) => { setGentleNudges(v); updateNotifPref("gentleNudges", v); }}
          />
        </Section>

        {/* Data */}
        <Section icon="📂" title="Data">
          <button className="ghostButton" type="button" onClick={async () => {
            try { await exportLogs(); } catch (err) { alert("Export failed: " + err.message); }
          }}>
            Export logs
          </button>
          {user ? <p className="muted" style={{ fontSize: 13 }}>Exports include all synced and local moments.</p> : null}
          <button className="ghostButton dangerButton" type="button" onClick={async () => {
            if (!confirm("Delete all data? This will permanently remove all your moments, reports, and insights. This cannot be undone.")) return;
            try {
              await deleteAllUserData();
              alert("All your data has been deleted.");
            } catch (err) {
              alert("Delete failed: " + err.message);
            }
          }}>
            Delete all data
          </button>
        </Section>

        {/* Privacy */}
        <Section icon="🔒" title="Privacy">
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>Privacy first. Your data stays yours.</p>
          <a className="ghostButton inlineButton" href="/legal/privacy" target="_blank" rel="noopener noreferrer">Privacy policy</a>
          <a className="ghostButton inlineButton" href="/legal/terms" target="_blank" rel="noopener noreferrer">Terms and conditions</a>
          <Row label="Support" value="qdenxp@gmail.com" />
        </Section>

        {/* About */}
        <Section icon="ℹ️" title="About">
          <strong style={{ fontSize: 16 }}>TriggerMap</strong>
          <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Log moments, reflect on emotional triggers, and understand weekly patterns over time.
          </p>
          <Row label="Developer" value="QuietDen (OPC) Pvt. Ltd." />
          <Row label="Website" value="qdenxp.com" />
          <p className="muted" style={{ fontSize: 11, textAlign: "center" }}>Registered December 2025, India</p>
        </Section>
      </div>
    </Layout>
  );
}
