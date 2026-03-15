const path = require("path");
const withPWA = require("next-pwa")({
  dest: "public",
  disable: process.env.NODE_ENV === "development",
  register: true,
  skipWaiting: true,
});

module.exports = withPWA({
  reactStrictMode: true,
  webpack(config) {
    config.resolve.alias["@triggermap/shared"] = path.resolve(__dirname, "shared");
    return config;
  },
});