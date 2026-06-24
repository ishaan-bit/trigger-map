import "../polyfills";
import { useEffect, useRef } from "react";
import { Stack, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { ToastAndroid, Platform } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import * as NavigationBar from "expo-navigation-bar";
import * as Notifications from "expo-notifications";
import { cancelScheduledByType } from "@/services/notificationService";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";
import { SessionProvider } from "@/hooks/useAppSession";
import { OnboardingProvider } from "@/hooks/useOnboarding";
import { EmotionalStateProvider } from "@/hooks/useEmotionalState";
import { LanguageProvider } from "@/i18n/LanguageContext";
import { setLastOpenedAt } from "@/services/deviceService";
import { initAnalytics } from "@/services/analyticsService";
import { initCrashMonitoring } from "@/services/crashService";
import { fetchHealth, getApiOrigin } from "@/services/api";

initCrashMonitoring();
initAnalytics();
SplashScreen.preventAutoHideAsync().catch(() => null);

if (Platform.OS === "android") {
  NavigationBar.setBackgroundColorAsync("transparent").catch(() => null);
  NavigationBar.setPositionAsync("absolute").catch(() => null);
}

if (Platform.OS === "android") {
  Notifications.setNotificationChannelAsync("default", {
    name: "TriggerMap",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250],
    lightColor: "#7bc9d8",
  }).catch(() => null);
}

function handleNotificationTap(router, type) {
  console.info("[NOTIF] Navigating for type:", type);
  switch (type) {
    case "reflection_reminder":
    case "inactivity_nudge":
      router.replace("/(tabs)/log");
      break;
    case "weekly_insight":
    case "report_ready":
    case "ai_insight_ready":
    case "pattern_alert":
      router.replace("/(tabs)/report");
      break;
    default:
      // Unknown type or custom push — just open the app
      router.replace("/(tabs)/log");
      break;
  }
}

export default function RootLayout() {
  const router = useRouter();
  const notificationListener = useRef(null);
  const responseListener = useRef(null);

  // Absolute splash failsafe: if nothing calls hideAsync within 12s (e.g. provider
  // chain hangs), force hide so the user can at least see an error rather than a frozen splash.
  useEffect(() => {
    const t = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => null);
    }, 12_000);
    return () => clearTimeout(t);
  }, []);

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
          if (Platform.OS === "android") {
            ToastAndroid.show("Offline mode, data saved locally", ToastAndroid.SHORT);
          }
        }
      }
    }

    validateStartup();

    // Notifications are native-only — skip listener setup on web (screenshot build).
    if (Platform.OS !== "web") {
    // Handle cold-start: app was killed, user tapped notification to open it.
    // Delay by 1.5s so the router is fully initialised before we navigate.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && active) {
        const type = response.notification.request.content.data?.type;
        console.info("[NOTIF] Cold-start tap:", type);
        setTimeout(() => {
          if (active) handleNotificationTap(router, type);
        }, 1500);
      }
    });

    // Listen for incoming notifications while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      const type = notification.request.content.data?.type;
      console.info("[NOTIF] Received in foreground:", type);
      // When a server push arrives, cancel any pending local notification of the same type
      // to prevent duplicates (local schedule acts as offline fallback only)
      if (type && notification.request.trigger?.type === "push") {
        cancelScheduledByType(type).catch(() => null);
      }
    });

    // Listen for notification taps — navigate to relevant screen
    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      const type = response.notification.request.content.data?.type;
      console.info("[NOTIF] Tapped:", type);
      handleNotificationTap(router, type);
    });
    }

    return () => {
      active = false;
      if (notificationListener.current) {
        Notifications.removeNotificationSubscription(notificationListener.current);
      }
      if (responseListener.current) {
        Notifications.removeNotificationSubscription(responseListener.current);
      }
    };
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppErrorBoundary>
          <LanguageProvider>
          <SessionProvider>
            <OnboardingProvider>
            <EmotionalStateProvider>
            <StatusBar style="light" translucent={Platform.OS === "android"} backgroundColor="transparent" />
            <Stack screenOptions={{ headerShown: false, animation: "fade" }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="onboarding" />
              <Stack.Screen name="emotion" options={{ presentation: "card", animation: "slide_from_right", gestureEnabled: true }} />
              <Stack.Screen name="(tabs)" />
            </Stack>
            </EmotionalStateProvider>
            </OnboardingProvider>
          </SessionProvider>
          </LanguageProvider>
        </AppErrorBoundary>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}