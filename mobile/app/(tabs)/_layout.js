import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createTabOptions } from "@/navigation/tabOptions";
import { useEmotionalState } from "@/hooks/useEmotionalState";
import { tap } from "@/utils/haptics";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { emotionColor } = useEmotionalState();
  const tabOptions = (icon, label) => createTabOptions(icon, label, insets.bottom, emotionColor);

  return (
    <Tabs screenOptions={{ lazy: true }} screenListeners={{ tabPress: () => tap() }}>
      <Tabs.Screen name="log" options={tabOptions("flash-outline", "Log")} />
      <Tabs.Screen name="timeline" options={tabOptions("time-outline", "Timeline")} />
      <Tabs.Screen name="report" options={tabOptions("sparkles-outline", "Insights")} />
      <Tabs.Screen name="premium" options={tabOptions("diamond-outline", "Premium")} />
      <Tabs.Screen name="settings" options={tabOptions("settings-outline", "Settings")} />
    </Tabs>
  );
}