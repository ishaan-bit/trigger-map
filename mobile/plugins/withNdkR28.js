const { createRunOncePlugin, withProjectBuildGradle } = require("expo/config-plugins");

/**
 * Expo config plugin that updates the root android/build.gradle to use NDK r28.
 * NDK r28 compiles all native code with 16KB ELF alignment by default,
 * which is required for Google Play when targeting Android 15 (API 35).
 */
const NDK_VERSION = "28.0.12433566";

const withNdkR28 = (config) =>
  withProjectBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== "groovy") {
      throw new Error("withNdkR28 only supports Groovy build.gradle files");
    }

    modConfig.modResults.contents = modConfig.modResults.contents.replace(
      /ndkVersion\s*=\s*"[^"]+"/,
      `ndkVersion = "${NDK_VERSION}"`
    );

    return modConfig;
  });

module.exports = createRunOncePlugin(withNdkR28, "with-ndk-r28", "1.0.0");
