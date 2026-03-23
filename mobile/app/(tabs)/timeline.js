import { TimelineScreen } from "@/screens/TimelineScreen";
import { TabErrorBoundary } from "@/components/TabErrorBoundary";

export default function TimelineTab() {
  return (
    <TabErrorBoundary>
      <TimelineScreen />
    </TabErrorBoundary>
  );
}