// Web build shim — haptics are a no-op in the browser. Metro resolves this
// `.web.js` over haptics.js so expo-haptics stays out of the web bundle.

export function tap() {}
export function emotionTap() {}
export function success() {}
export function warning() {}
export function selection() {}
