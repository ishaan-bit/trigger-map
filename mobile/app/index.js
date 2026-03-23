import { Redirect } from "expo-router";
import { useCallback } from "react";
import { Image, StyleSheet, View } from "react-native";
import * as SplashScreen from "expo-splash-screen";
import { useAppSession } from "@/hooks/useAppSession";

export default function IndexRoute() {
  const { ready, onboardingComplete } = useAppSession();

  const onLayout = useCallback(() => {
    // Hide the native splash as soon as the JS splash image is laid out
    SplashScreen.hideAsync().catch(() => null);
  }, []);

  if (!ready) {
    return (
      <View style={styles.container} onLayout={onLayout}>
        <Image
          source={require("@/assets/splash.png")}
          style={styles.image}
          resizeMode="cover"
        />
      </View>
    );
  }

  return <Redirect href={onboardingComplete ? "/(tabs)/log" : "/onboarding"} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#060a12",
  },
  image: {
    width: "100%",
    height: "100%",
  },
});