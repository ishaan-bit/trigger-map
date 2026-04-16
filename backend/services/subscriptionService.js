import { google } from "googleapis";
import { pipeline, redisKey } from "./redisClient.js";

function shouldStubSubscriptionVerification() {
  return !process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON || !process.env.GOOGLE_PLAY_PACKAGE_NAME;
}

function getGoogleAuthClient() {
  if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON) {
    throw new Error("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing");
  }

  const credentials = JSON.parse(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: ["https://www.googleapis.com/auth/androidpublisher"],
  });
}

function mapSubscriptionState(subscriptionPurchase) {
  const expiryTime = Number(subscriptionPurchase.expiryTimeMillis || 0);
  const now = Date.now();
  const cancelReason = subscriptionPurchase.cancelReason;
  const paymentState = subscriptionPurchase.paymentState;

  if (cancelReason) {
    return "cancelled";
  }

  if (expiryTime && expiryTime < now) {
    return "expired";
  }

  if (paymentState === 0 || paymentState === 1) {
    return "active";
  }

  if (subscriptionPurchase.autoResumeTimeMillis) {
    return "grace_period";
  }

  return "expired";
}

export async function verifyAndStoreSubscription({ userId, subscriptionId, purchaseToken }) {
  if (shouldStubSubscriptionVerification()) {
    throw new Error("Subscription verification is not configured");
  }

  const auth = await getGoogleAuthClient();
  const androidpublisher = google.androidpublisher({ version: "v3", auth });
  const packageName = process.env.GOOGLE_PLAY_PACKAGE_NAME;

  if (!packageName) {
    throw new Error("GOOGLE_PLAY_PACKAGE_NAME missing");
  }

  const { data } = await androidpublisher.purchases.subscriptions.get({
    packageName,
    subscriptionId,
    token: purchaseToken,
  });

  const status = mapSubscriptionState(data);
  const expiresAt = data.expiryTimeMillis ? new Date(Number(data.expiryTimeMillis)).toISOString() : null;

  await pipeline([
    [
      "HSET",
      redisKey("subscription", userId),
      "status",
      status,
      "subscriptionId",
      subscriptionId,
      "purchaseToken",
      purchaseToken,
      "expiresAt",
      expiresAt || "",
      "updatedAt",
      new Date().toISOString(),
    ],
    ["EXPIRE", redisKey("subscription", userId), String(60 * 60 * 24 * 90)],
  ]);

  return {
    status,
    subscriptionId,
    expiresAt,
    autoRenewing: Boolean(data.autoRenewing),
  };
}

const PROVISIONAL_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function grantGracePeriodFallback({ userId, subscriptionId, purchaseToken }) {
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await pipeline([
    [
      "HSET",
      redisKey("subscription", userId),
      "status", "grace_period",
      "subscriptionId", subscriptionId,
      "purchaseToken", purchaseToken,
      "expiresAt", expiresAt,
      "updatedAt", new Date().toISOString(),
      "verificationPending", "true",
    ],
    ["EXPIRE", redisKey("subscription", userId), String(60 * 60 * 24 * 90)],
  ]);

  return {
    status: "grace_period",
    subscriptionId,
    expiresAt,
    autoRenewing: true,
  };
}

export async function grantProvisionalSubscription(userId) {
  const existing = await pipeline([["HGETALL", redisKey("subscription", userId)]]);
  const flat = {};
  const arr = existing[0];
  if (Array.isArray(arr)) {
    for (let i = 0; i < arr.length; i += 2) flat[arr[i]] = arr[i + 1];
  }

  if (flat.status === "active") {
    return { status: "active", subscriptionId: flat.subscriptionId, expiresAt: flat.expiresAt, provisional: false };
  }

  const expiresAt = new Date(Date.now() + PROVISIONAL_TTL_SECONDS * 1000).toISOString();

  await pipeline([
    [
      "HSET",
      redisKey("subscription", userId),
      "status", "provisional",
      "subscriptionId", "premium_monthly",
      "purchaseToken", "",
      "expiresAt", expiresAt,
      "updatedAt", new Date().toISOString(),
      "provisional", "true",
    ],
    ["EXPIRE", redisKey("subscription", userId), String(PROVISIONAL_TTL_SECONDS)],
  ]);

  return { status: "provisional", subscriptionId: "premium_monthly", expiresAt, provisional: true };
}