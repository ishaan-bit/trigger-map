import { registerPushToken, unregisterPushToken } from "./api";

// Web Push subscription helper. Activates when a VAPID public key is configured
// (NEXT_PUBLIC_VAPID_PUBLIC_KEY); otherwise it no-ops gracefully so notification
// preferences still persist server-side via saveNotificationPrefs. iOS Safari
// only supports Web Push for INSTALLED PWAs (16.4+), not regular tabs.

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

export function webPushSupported() {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

export async function enableWebPush() {
  if (!webPushSupported()) return { ok: false, reason: "unsupported" };
  const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapid) return { ok: false, reason: "no_vapid" };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return { ok: false, reason: permission };

  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    const sub = existing || (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    }));
    await registerPushToken({ token: JSON.stringify(sub), platform: "web" });
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err?.message || "subscribe_failed" };
  }
}

export async function disableWebPush() {
  if (!webPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (sub) await sub.unsubscribe();
    await unregisterPushToken().catch(() => null);
  } catch {
    // best-effort
  }
}
