import {
  endConnection,
  finishTransaction,
  getAvailablePurchases,
  getSubscriptions,
  initConnection,
  requestSubscription,
} from "react-native-iap";
import { verifySubscription } from "./api";

const SUBSCRIPTION_SKU = "triggermap_premium_monthly";

/**
 * Query Google Play for available subscription offers.
 * Returns the first available offer token, or throws if none found.
 */
async function getOfferToken() {
  const subscriptions = await getSubscriptions({ skus: [SUBSCRIPTION_SKU] });
  const sub = subscriptions?.[0];
  if (!sub) {
    throw new Error("Subscription product not found on Google Play. Please try again later.");
  }

  const offers = sub.subscriptionOfferDetails;
  if (!offers || !offers.length) {
    throw new Error("No subscription plans available. Please try again later.");
  }

  return { offerToken: offers[0].offerToken, pricingPhases: offers[0].pricingPhases };
}

export async function startSubscriptionFlow(token) {
  if (!token) {
    throw new Error("Please sign in before starting a subscription");
  }

  await initConnection();

  try {
    const { offerToken } = await getOfferToken();

    const purchase = await requestSubscription({
      sku: SUBSCRIPTION_SKU,
      subscriptionOffers: [{ sku: SUBSCRIPTION_SKU, offerToken }],
    });
    const resolved = Array.isArray(purchase) ? purchase[0] : purchase;
    const purchaseToken = resolved?.purchaseToken;

    if (!purchaseToken) {
      throw new Error("Purchase token missing");
    }

    const response = await verifySubscription(
      { subscriptionId: SUBSCRIPTION_SKU, purchaseToken },
      token
    );

    await finishTransaction({ purchase: resolved, isConsumable: false });
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

  await initConnection();

  try {
    const purchases = await getAvailablePurchases();
    const sub = purchases?.find((p) => p.productId === SUBSCRIPTION_SKU);
    if (!sub?.purchaseToken) return null;

    const response = await verifySubscription(
      { subscriptionId: SUBSCRIPTION_SKU, purchaseToken: sub.purchaseToken },
      token
    );

    await finishTransaction({ purchase: sub, isConsumable: false });
    return response.subscription;
  } catch {
    return null;
  } finally {
    endConnection();
  }
}