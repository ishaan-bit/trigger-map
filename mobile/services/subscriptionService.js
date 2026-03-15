import { endConnection, finishTransaction, initConnection, requestSubscription } from "react-native-iap";
import { verifySubscription } from "./api";

const SUBSCRIPTION_SKU = "triggermap_premium_monthly";

export async function startSubscriptionFlow(token) {
  if (!token) {
    throw new Error("Please sign in before starting a subscription");
  }

  await initConnection();

  try {
    const purchase = await requestSubscription({
      sku: SUBSCRIPTION_SKU,
    });
    const purchaseToken = Array.isArray(purchase) ? purchase[0]?.purchaseToken : purchase.purchaseToken;

    if (!purchaseToken) {
      throw new Error("Purchase token missing");
    }

    const response = await verifySubscription(
      {
        subscriptionId: SUBSCRIPTION_SKU,
        purchaseToken,
      },
      token
    );

    await finishTransaction({ purchase: Array.isArray(purchase) ? purchase[0] : purchase, isConsumable: false });
    return response.subscription;
  } finally {
    endConnection();
  }
}