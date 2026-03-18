import {
  endConnection,
  finishTransaction,
  getAvailablePurchases,
  getSubscriptions,
  initConnection,
  requestSubscription,
} from "react-native-iap";
import { verifySubscription } from "./api";
import { PREMIUM_PRODUCT_ID } from "@triggermap/shared/constants/premium";

const SUBSCRIPTION_SKU = PREMIUM_PRODUCT_ID;
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1500;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Query Google Play for available subscription offers with retry logic.
 * The billing client sometimes needs a moment after initConnection() before
 * product queries return results.
 */
async function getOfferToken() {
  let lastError;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      console.info(`[Billing] getSubscriptions attempt ${attempt}/${MAX_RETRIES} for SKU: ${SUBSCRIPTION_SKU}`);
      const subscriptions = await getSubscriptions({ skus: [SUBSCRIPTION_SKU] });
      console.info(`[Billing] getSubscriptions returned ${subscriptions?.length ?? 0} product(s)`);

      const sub = subscriptions?.[0];
      if (!sub) {
        if (attempt < MAX_RETRIES) {
          console.info(`[Billing] No products yet, retrying in ${RETRY_DELAY_MS}ms...`);
          await delay(RETRY_DELAY_MS);
          continue;
        }
        throw new Error("Subscription product not found. Please ensure the app is up to date and try again.");
      }

      const offers = sub.subscriptionOfferDetails;
      console.info(`[Billing] Product "${sub.productId}" has ${offers?.length ?? 0} offer(s)`);

      if (!offers || !offers.length) {
        throw new Error("No subscription offers found for this product. Please try again later.");
      }

      return { offerToken: offers[0].offerToken, pricingPhases: offers[0].pricingPhases };
    } catch (err) {
      lastError = err;
      if (attempt < MAX_RETRIES && !err.message?.includes("No subscription offers")) {
        console.warn(`[Billing] Attempt ${attempt} failed: ${err.message}, retrying...`);
        await delay(RETRY_DELAY_MS);
      }
    }
  }

  throw lastError;
}

export async function startSubscriptionFlow(token) {
  if (!token) {
    throw new Error("Please sign in before starting a subscription");
  }

  console.info("[Billing] Starting subscription flow...");
  await initConnection();
  console.info("[Billing] Billing connection established");

  // Small delay after connection to let billing client stabilize
  await delay(500);

  try {
    const { offerToken } = await getOfferToken();
    console.info("[Billing] Requesting subscription with offerToken...");

    const purchase = await requestSubscription({
      sku: SUBSCRIPTION_SKU,
      subscriptionOffers: [{ sku: SUBSCRIPTION_SKU, offerToken }],
    });
    const resolved = Array.isArray(purchase) ? purchase[0] : purchase;
    const purchaseToken = resolved?.purchaseToken;

    if (!purchaseToken) {
      throw new Error("Purchase was not completed. Please try again.");
    }

    console.info("[Billing] Purchase completed, verifying with backend...");
    const response = await verifySubscription(
      { subscriptionId: SUBSCRIPTION_SKU, purchaseToken },
      token
    );

    await finishTransaction({ purchase: resolved, isConsumable: false });
    console.info("[Billing] Subscription verified and finalized");
    return response.subscription;
  } finally {
    endConnection();
  }
}

/**
 * Restore an existing subscription (e.g. after reinstall or sign-in on new device).
 * Returns the restored subscription, or null if none found.
 */
export async function restoreSubscriptionFlow(token) {
  if (!token) return null;

  console.info("[Billing] Starting restore flow...");
  await initConnection();
  await delay(500);

  try {
    const purchases = await getAvailablePurchases();
    console.info(`[Billing] Found ${purchases?.length ?? 0} existing purchase(s)`);
    const sub = purchases?.find((p) => p.productId === SUBSCRIPTION_SKU);
    if (!sub?.purchaseToken) return null;

    const response = await verifySubscription(
      { subscriptionId: SUBSCRIPTION_SKU, purchaseToken: sub.purchaseToken },
      token
    );

    await finishTransaction({ purchase: sub, isConsumable: false });
    console.info("[Billing] Subscription restored and verified");
    return response.subscription;
  } catch (err) {
    console.warn("[Billing] Restore failed:", err.message);
    return null;
  } finally {
    endConnection();
  }
}