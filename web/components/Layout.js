import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchHealth } from "../lib/api";

export function Layout({ title, children, actions = null }) {
  const [installPrompt, setInstallPrompt] = useState(null);
  const [health, setHealth] = useState({ status: "loading", message: "Checking backend" });

  useEffect(() => {
    function handlePrompt(event) {
      event.preventDefault();
      setInstallPrompt(event);
    }

    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  useEffect(() => {
    let active = true;

    fetchHealth()
      .then((payload) => {
        if (!active) {
          return;
        }

        setHealth({
          status: payload.status === "ok" ? "online" : "offline",
          message: payload.status === "ok" ? "Backend online" : "Backend degraded",
        });
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setHealth({ status: "offline", message: "Backend unavailable" });
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="shell">
      <div className="shellGlow shellGlowOne" />
      <div className="shellGlow shellGlowTwo" />
      <header className="hero">
        <div className="heroCopy">
          <p className="eyebrow">QuietDen</p>
          <h1>{title}</h1>
          <p className="lede">Log a moment, review your timeline, and open your weekly report — from any browser.</p>
          <div className="statusRow">
            <span className={`statusBadge statusBadge${health.status.charAt(0).toUpperCase()}${health.status.slice(1)}`}>
              {health.message}
            </span>
            <span className="statusHint">Private local device ID keeps logs linked until you sign in.</span>
          </div>
        </div>
        <div className="heroActions">
          {actions}
          {installPrompt ? (
            <button
              className="installButton"
              onClick={async () => {
                await installPrompt.prompt();
                setInstallPrompt(null);
              }}
            >
              Install app
            </button>
          ) : null}
        </div>
      </header>

      <nav className="nav">
        <Link href="/">Log moment</Link>
        <Link href="/timeline">Timeline</Link>
        <Link href="/report">Weekly report</Link>
        <Link href="/premium">Premium</Link>
      </nav>

      <section className="content">{children}</section>
    </main>
  );
}