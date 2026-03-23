import { TriggerSelectionScreen } from "@/screens/TriggerSelectionScreen";
import { TabErrorBoundary } from "@/components/TabErrorBoundary";

export default function LogTab() {
  return (
    <TabErrorBoundary>
      <TriggerSelectionScreen />
    </TabErrorBoundary>
  );
}