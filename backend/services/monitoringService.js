import * as Sentry from "@sentry/node";

let initialized = false;

function initIfNeeded() {
  if (initialized || !process.env.SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1,
  });

  initialized = true;
}

export function captureServerError(error, context = {}) {
  initIfNeeded();
  console.error("[QuietDen]", error, context);

  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error, { extra: context });
  }
}