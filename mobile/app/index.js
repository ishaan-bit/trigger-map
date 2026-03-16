import { Redirect } from "expo-router";
import { Image, StyleSheet, View } from "react-native";
import { useAppSession } from "@/hooks/useAppSession";

export default function IndexRoute() {
  const { ready, onboardingComplete } = useAppSession();

  if (!ready) {
    return (
      <View style={styles.container}>
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