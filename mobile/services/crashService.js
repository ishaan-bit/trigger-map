import * as Sentry from "@sentry/react-native";

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
}