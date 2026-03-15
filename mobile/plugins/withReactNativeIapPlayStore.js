const { createRunOncePlugin, withAppBuildGradle } = require("expo/config-plugins");

function addPlayStoreMissingDimensionStrategy(contents) {
  if (contents.includes("missingDimensionStrategy 'store', 'play'")) {
    return contents;
  }

  if (!contents.includes("defaultConfig {")) {
    throw new Error("Unable to find defaultConfig block in android/app/build.gradle");
  }

  return contents.replace(
    "defaultConfig {",
    "defaultConfig {\n        missingDimensionStrategy 'store', 'play'"
  );
}

const withReactNativeIapPlayStore = (config) =>
  withAppBuildGradle(config, (modConfig) => {
    if (modConfig.modResults.language !== "groovy") {
      throw new Error("withReactNativeIapPlayStore only supports Groovy build.gradle files");
    }

    modConfig.modResults.contents = addPlayStoreMissingDimensionStrategy(modConfig.modResults.contents);
    return modConfig;
  });

module.exports = createRunOncePlugin(
  withReactNativeIapPlayStore,
  "with-react-native-iap-play-store",
  "1.0.0"
);