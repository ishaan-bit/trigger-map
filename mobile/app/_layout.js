import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ToastAndroid } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SplashScreen from "expo-splash-screen";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { SessionProvider } from "@/hooks/useAppSession";
import { setLastOpenedAt } from "@/services/deviceService";
import { initAnalytics } from "@/services/analyticsService";
import { initCrashMonitoring } from "@/services/crashService";
import { fetchHealth, getApiOrigin } from "@/services/api";

initCrashMonitoring();
initAnalytics();
SplashScreen.preventAutoHideAsync().catch(() => null);

export default function RootLayout() {
  useEffect(() => {
    let active = true;

    async function validateStartup() {
      try {
        await setLastOpenedAt();
        const apiOrigin = getApiOrigin();
        console.info(`[QuietDen] API origin: ${apiOrigin}`);
        const health = await fetchHealth();
        if (active) {
          console.info("QuietDen backend reachable");
          console.info("QuietDen: health checked", health);
        }
      } catch (error) {
        if (active) {
          console.warn(`[QuietDen] Startup validation failed: ${error.message}`);
          ToastAndroid.show("Offline mode — data saved locally", ToastAndroid.SHORT);
        }
      } finally {
        // Hide splash after startup validation completes
        SplashScreen.hideAsync().catch(() => null);
      }
    }

    validateStartup();

    return () => {
      active = false;
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AppErrorBoundary>
        <SessionProvider>
          <StatusBar style="light" />
          <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" />
            <Stack.Screen name="login" />
            <Stack.Screen name="emotion" options={{ presentation: "card" }} />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </SessionProvider>
      </AppErrorBoundary>
    </GestureHandlerRootView>
  );
}