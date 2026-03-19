import { useEffect, useRef } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ToastAndroid, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as Notifications from "expo-notifications";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { SessionProvider } from "@/hooks/useAppSession";
import { setLastOpenedAt } from "@/services/deviceService";
import { initAnalytics } from "@/services/analyticsService";
import { initCrashMonitoring } from "@/services/crashService";
import { fetchHealth, getApiOrigin } from "@/services/api";

initCrashMonitoring();
initAnalytics();
SplashScreen.preventAutoHideAsync().catch(() => null);

async function requestNotificationPermission() {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") {
    console.warn("[NOTIF] Permission denied");
    return false;
  }
  console.info("[NOTIF] Permission granted");
  return true;
}

if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "TriggerMap",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250],
    lightColor: "#7bc9d8",
  }).catch(() => null);
}

export default function RootLayout() {
  const notificationListener = useRef(null);
  const responseListener = useRef(null);

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
          ToastAndroid.show("Offline mode, data saved locally", ToastAndroid.SHORT);
        }
      } finally {
        SplashScreen.hideAsync().catch(() => null);
      }
    }

    // Request notification permission early
    requestNotificationPermission().catch(() => null);

    validateStartup();

    // Listen for incoming notifications while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const type = notification.request.content.data?.type;
      console.info("[NOTIF] Received in foreground:", type);
    });

    // Listen for notification taps — navigate to relevant screen
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const type = response.notification.request.content.data?.type;
      console.info("[NOTIF] Tapped:", type);
    });

    return () => {
      active = false;
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}