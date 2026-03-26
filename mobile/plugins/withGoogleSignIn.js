/**
 * Wrapper that loads the @react-native-google-signin/google-signin config plugin
 * via a direct file path, bypassing the package.json "exports" field.
 *
 * The upstream package's exports map only defines "./app.plugin.js" but Expo
 * resolves config plugins via the extensionless "./app.plugin" subpath, which
 * causes ERR_PACKAGE_PATH_NOT_EXPORTED on Node 20+ / Linux CI.
 */
const path = require("path");
const pluginPath = path.resolve(
  __dirname,
  "..",
  "node_modules",
  "@react-native-google-signin",
  "google-signin",
  "plugin",
  "build",
  "withGoogleSignIn"
);
const plugin = require(pluginPath);
module.exports = plugin.default || plugin;
