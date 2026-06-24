// Web build shim. react-native-iap is a native TurboModule and crashes the web
// bundle on import, so Metro resolves this `.web.js` instead. The Premium screen
// still renders fully on web (for design review / screenshots); only the actual
// purchase + restore flows are unavailable here.

export async function startSubscriptionFlow() {
  throw new Error("Subscriptions are not available on web");
}

export async function restoreSubscriptionFlow() {
  return null;
}
