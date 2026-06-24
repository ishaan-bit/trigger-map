// Web build shim. posthog-react-native is native-only and can break the web
// bundle, so analytics are a no-op on web (the screenshot/preview build). Metro
// resolves this `.web.js` over analyticsService.js automatically.

export function initAnalytics() {
  return null;
}

export function trackEvent() {}
