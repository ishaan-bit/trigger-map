import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createTabOptions } from "@/navigation/tabOptions";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const tabOptions = (icon, label) => createTabOptions(icon, label, insets.bottom);

  return (
    <Tabs>
      <Tabs.Screen name="log" options={tabOptions("flash-outline", "Log")} />
      <Tabs.Screen name="timeline" options={tabOptions("time-outline", "Timeline")} />
      <Tabs.Screen name="report" options={tabOptions("sparkles-outline", "Insights")} />
      <Tabs.Screen name="premium" options={tabOptions("diamond-outline", "Premium")} />
      <Tabs.Screen name="settings" options={tabOptions("settings-outline", "Settings")} />
    </Tabs>
  );
}