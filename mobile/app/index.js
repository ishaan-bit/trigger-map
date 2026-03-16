import { Redirect } from "expo-router";
import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { useAppSession } from "@/hooks/useAppSession";

export default function IndexRoute() {
  const { ready, onboardingComplete } = useAppSession();
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 500,
      useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  if (!ready) {
    return (
      <View style={styles.container}>
        <Animated.Image
          source={require("@/assets/splash.png")}
          style={[styles.image, { opacity: fadeAnim }]}
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