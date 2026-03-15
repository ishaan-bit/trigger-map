import { PostHog } from "posthog-react-native";

let client;

export function initAnalytics() {
  const apiKey = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!apiKey || client) {
    return client;
  }

  client = new PostHog(apiKey, {
    host: process.env.EXPO_PUBLIC_POSTHOG_HOST || "https://app.posthog.com",
  });

  return client;
}

export function trackEvent(event, properties = {}) {
  const instance = initAnalytics();
  if (!instance) {
    return;
  }

  instance.capture(event, properties);
}