import { SettingsScreen } from "@/screens/SettingsScreen";
import { TabErrorBoundary } from "@/components/TabErrorBoundary";

export default function SettingsTab() {
  return (
    <TabErrorBoundary>
      <SettingsScreen />
    </TabErrorBoundary>
  );
}