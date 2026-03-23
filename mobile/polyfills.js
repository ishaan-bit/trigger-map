/**
 * Polyfill for WeakRef — required by @react-navigation/bottom-tabs v7
 * on Hermes engines that don't expose WeakRef as a global.
 */
if (typeof globalThis.WeakRef === "undefined") {
  globalThis.WeakRef = class WeakRef {
    constructor(target) {
      this._target = target;
    }
    deref() {
      return this._target;
    }
  };
}
