// Lightweight analytics shim. Mirrors the mobile event names so the web app can
// emit the same telemetry once a provider is wired (PostHog) in the Web Push /
// offline workstream. Until then this is a safe no-op that never throws.
export function trackEvent(name, props = {}) {
  if (typeof window === "undefined") return;
  try {
    if (window.posthog?.capture) window.posthog.capture(name, props);
  } catch {
    // analytics must never break the app
  }
}
