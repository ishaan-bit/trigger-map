import { PostHog } from "posthog-node";

let client;

function getClient() {
  if (!process.env.POSTHOG_KEY) {
    return null;
  }

  if (!client) {
    client = new PostHog(process.env.POSTHOG_KEY, {
      host: process.env.POSTHOG_HOST || "https://app.posthog.com",
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return client;
}

export async function trackServerEvent(event, distinctId, properties = {}) {
  const posthog = getClient();
  if (!posthog) {
    return;
  }

  await posthog.capture({
    event,
    distinctId,
    properties,
  });
}