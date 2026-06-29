const path = require("path");
const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
  // Custom SW logic (Web Push display + click) lives in worker/index.js and is
  // appended to the generated service worker by next-pwa.
  fallbacks: { document: "/_offline" },
});

module.exports = withPWA({
  reactStrictMode: true,
  // Turbopack doesn't support Windows path aliases yet; use --webpack for builds
  turbopack: {},
  webpack(config) {
    // Resolve the shared package against the monorepo root (single source of
    // truth) rather than a stale local copy. Mirrors the mobile build.
    config.resolve.alias["@triggermap/shared"] = path.resolve(__dirname, "..", "shared");
    return config;
  },
});