import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchHealth } from "../lib/api";
import { useSession } from "../hooks/useSession";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { InstallModalIOS } from "./InstallModalIOS";

export function Layout({ title, children, actions = null }) {
  const { user, isSignedIn } = useSession();
  const { canInstall, isStandalone, triggerInstall, showIOSModal, setShowIOSModal } = usePWAInstall();
  const [health, setHealth] = useState({ status: "loading", message: "Checking backend" });

  useEffect(() => {
    let active = true;

    fetchHealth()
      .then((payload) => {
        if (!active) return;
        setHealth({
          status: payload.status === "ok" ? "online" : "offline",
          message: payload.status === "ok" ? "Backend online" : "Backend degraded",
        });
      })
      .catch(() => {
        if (!active) return;
        setHealth({ status: "offline", message: "Backend unavailable" });
      });

    return () => { active = false; };
  }, []);

  return (
    <main className="shell">
      <div className="shellGlow shellGlowOne" />
      <div className="shellGlow shellGlowTwo" />
      <div className="shellGlow shellGlowThree" />
      <header className="hero">
        <div className="heroCopy">
          <p className="eyebrow">TriggerMap</p>
          <h1>{title}</h1>
          <p className="lede">Log a moment, review your timeline, and open your weekly report. From any browser.</p>
          <div className="statusRow">
            <span className={`statusBadge statusBadge${health.status.charAt(0).toUpperCase()}${health.status.slice(1)}`}>
              {health.message}
            </span>
            {isSignedIn ? (
              <span className="statusHint">Signed in as {user.email}</span>
            ) : (
              <span className="statusHint">Private local device ID keeps logs linked until you sign in.</span>
            )}
          </div>
        </div>
        <div className="heroActions">
          {actions}
          {canInstall && !isStandalone ? (
            <button className="installButton" onClick={triggerInstall}>
              Install app
            </button>
          ) : null}
        </div>
      </header>

      <InstallModalIOS open={showIOSModal} onClose={() => setShowIOSModal(false)} />

      <nav className="nav">
        <Link href="/">Log moment</Link>
        <Link href="/timeline">Timeline</Link>
        <Link href="/report">Weekly report</Link>
        <Link href="/settings">Settings</Link>
        {!isSignedIn ? <Link href="/login" className="navLoginLink">Sign in</Link> : null}
      </nav>

      <section className="content">{children}</section>
    </main>
  );
}