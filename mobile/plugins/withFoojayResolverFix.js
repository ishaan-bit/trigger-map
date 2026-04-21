/**
 * Patches the auto-generated android/settings.gradle to use
 * foojay-resolver-convention 0.8.0 instead of 0.5.0.
 *
 * foojay 0.5.0 depends on com.google.code.gson:gson:2.9.1 which Maven Central
 * has started returning 403 Forbidden for, breaking Gradle builds.
 * foojay 0.8.0 removed that dependency.
 */
const { withSettingsGradle } = require("@expo/config-plugins");

module.exports = function withFoojayResolverFix(config) {
  return withSettingsGradle(config, (mod) => {
    mod.modResults.contents = mod.modResults.contents.replace(
      /id\s*\(\s*["']org\.gradle\.toolchains\.foojay-resolver-convention["']\s*\)\s*version\s*["']0\.5\.0["']/g,
      'id("org.gradle.toolchains.foojay-resolver-convention") version "0.8.0"'
    );
    return mod;
  });
};
