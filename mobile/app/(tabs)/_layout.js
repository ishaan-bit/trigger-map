import { Tabs } from "expo-router";
import { createTabOptions } from "@/navigation/tabOptions";

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="log" options={createTabOptions("flash-outline", "Log")} />
      <Tabs.Screen name="timeline" options={createTabOptions("time-outline", "Timeline")} />
      <Tabs.Screen name="report" options={createTabOptions("sparkles-outline", "Report")} />
      <Tabs.Screen name="premium" options={createTabOptions("diamond-outline", "Premium")} />
      <Tabs.Screen name="settings" options={createTabOptions("settings-outline", "Settings")} />
    </Tabs>
  );
}