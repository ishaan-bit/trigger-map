import { PremiumScreen } from "@/screens/PremiumScreen";
import { TabErrorBoundary } from "@/components/TabErrorBoundary";

export default function PremiumTab() {
  return (
    <TabErrorBoundary>
      <PremiumScreen />
    </TabErrorBoundary>
  );
}