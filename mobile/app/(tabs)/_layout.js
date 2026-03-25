import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { createTabOptions } from "@/navigation/tabOptions";
import { useEmotionalState } from "@/hooks/useEmotionalState";
import { useLanguage } from "@/i18n/LanguageContext";
import { tap } from "@/utils/haptics";

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { emotionColor } = useEmotionalState();
  const { t } = useLanguage();
  const tabOptions = (icon, label) => createTabOptions(icon, label, insets.bottom, emotionColor);

  return (
    <Tabs screenOptions={{ lazy: true }} screenListeners={{ tabPress: () => tap() }}>
      <Tabs.Screen name="log" options={tabOptions("flash-outline", t("tabs.log"))} />
      <Tabs.Screen name="timeline" options={tabOptions("time-outline", t("tabs.timeline"))} />
      <Tabs.Screen name="report" options={tabOptions("sparkles-outline", t("tabs.insights"))} />
      <Tabs.Screen name="premium" options={tabOptions("diamond-outline", t("tabs.premium"))} />
      <Tabs.Screen name="settings" options={tabOptions("settings-outline", t("tabs.settings"))} />
    </Tabs>
  );
}