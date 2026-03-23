import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";
import { Platform } from "react-native";

let initialized = false;

export function initCrashMonitoring() {
  if (initialized || !process.env.EXPO_PUBLIC_SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
    tracesSampleRate: __DEV__ ? 1 : 0.1,
  });

  initialized = true;
}

export function captureMobileError(error, context) {
  console.error(error, context);
  if (initialized) {
    Sentry.captureException(error, { extra: context });
  }
  // Always attempt to report to our own backend for ops console visibility
  reportCrashToBackend(error, context).catch(() => {});
}

async function reportCrashToBackend(error, context) {
  try {
    const extra = Constants.expoConfig?.extra || {};
    const apiUrl = (process.env.EXPO_PUBLIC_API_URL || extra.apiUrl || "").replace(/\/$/, "");
    if (!apiUrl) return;

    const body = {
      message: error?.message || String(error),
      stack: error?.stack || null,
      componentStack: context?.errorInfo?.componentStack || null,
      appVersion: Constants.expoConfig?.version || null,
      platform: Platform.OS,
      screen: context?.screen || null,
      extra: context?.extra || null,
    };

    await fetch(`${apiUrl}/api/crash-report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Silently fail — crash reporter must never throw
  }
}