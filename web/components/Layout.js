import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import { fetchHealth } from "../lib/api";
import { useEmotionalState } from "../hooks/useEmotionalState";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { InstallModalIOS } from "./InstallModalIOS";
import { AtmosphericField } from "./AtmosphericField";
import { useI18n } from "../lib/i18n";

// Ionicons-outline equivalents, hand-rolled as inline SVG so they tint with the
// live emotion color.
const ICONS = {
  log: "M13 2 4 14h6l-1 8 9-12h-6z", // flash
  timeline: null, // clock drawn below
  insights: "M12 3l1.9 4.6L19 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9z", // sparkle
  premium: "M6 3h12l4 6-10 12L2 9z", // diamond
  settings: null, // gear drawn below
};

function TabIcon({ name, color }) {
  const common = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  if (name === "log") return <svg {...common}><path d="M13 2 4 14h6l-1 8 9-12h-6z" /></svg>;
  if (name === "timeline") return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
  if (name === "insights") return <svg {...common}><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z" /><path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z" /></svg>;
  if (name === "premium") return <svg {...common}><path d="M6 3h12l3.5 5.5L12 21 2.5 8.5z" /><path d="M2.5 8.5h19M9 3l3 5.5L15 3" /></svg>;
  return <svg {...common}><circle cx="12" cy="12" r="3.2" /><path d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V22a2 2 0 0 1-4 0v-.2A1.6 1.6 0 0 0 7 20.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 4 14H3.8a2 2 0 0 1 0-4H4a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 10 4.6V4a2 2 0 0 1 4 0v.2A1.6 1.6 0 0 0 17 5.7l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.4 2.7" /></svg>;
}

const TABS = [
  { key: "log", href: "/", labelFallback: "Log" },
  { key: "timeline", href: "/timeline", labelFallback: "Timeline" },
  { key: "insights", href: "/report", labelFallback: "Insights" },
  { key: "premium", href: "/premium", labelFallback: "Premium" },
  { key: "settings", href: "/settings", labelFallback: "Settings" },
];

function activeKeyForPath(pathname) {
  if (pathname === "/") return "log";
  if (pathname.startsWith("/timeline")) return "timeline";
  if (pathname.startsWith("/report")) return "insights";
  if (pathname.startsWith("/premium")) return "premium";
  if (pathname.startsWith("/settings")) return "settings";
  return "";
}

export function Layout({ title, children, actions = null, emotion }) {
  const router = useRouter();
  const { emotionColor } = useEmotionalState();
  const { t } = useI18n();
  const { canInstall, isStandalone, triggerInstall, showIOSModal, setShowIOSModal } = usePWAInstall();
  const [health, setHealth] = useState("loading");
  const active = activeKeyForPath(router.pathname);

  useEffect(() => {
    let live = true;
    fetchHealth()
      .then((p) => live && setHealth(p.status === "ok" ? "online" : "offline"))
      .catch(() => live && setHealth("offline"));
    return () => { live = false; };
  }, []);

  return (
    <main className="shell">
      <AtmosphericField emotion={emotion} />

      <header className="appBar">
        <Link href="/" className="appBrand">
          <span className="appBrandDot" data-health={health} />
          TriggerMap
        </Link>
        <div className="appBarActions">
          {actions}
          {canInstall && !isStandalone ? (
            <button className="installButton" onClick={triggerInstall} type="button">Install</button>
          ) : null}
        </div>
      </header>

      <InstallModalIOS open={showIOSModal} onClose={() => setShowIOSModal(false)} />

      <section className="content contentTabbed">{children}</section>

      <nav className="tabBar" aria-label="Primary">
        {TABS.map((tab) => {
          const isActive = active === tab.key;
          const color = isActive ? emotionColor : "rgba(184, 200, 216, 0.62)";
          return (
            <Link
              key={tab.key}
              href={tab.href}
              className={`tabItem${isActive ? " tabItemActive" : ""}`}
              aria-current={isActive ? "page" : undefined}
              style={isActive ? { "--tab-active": emotionColor } : undefined}
            >
              <TabIcon name={tab.key} color={color} />
              <span className="tabLabel" style={{ color }}>{t(`tabs.${tab.key}`, tab.labelFallback)}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
