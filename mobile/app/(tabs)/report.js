import { WeeklyReportScreen } from "@/screens/WeeklyReportScreen";
import { TabErrorBoundary } from "@/components/TabErrorBoundary";

export default function ReportTab() {
  return (
    <TabErrorBoundary>
      <WeeklyReportScreen />
    </TabErrorBoundary>
  );
}