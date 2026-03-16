import { Redirect } from "expo-router";
import { ScreenShell } from "@/components/ScreenShell";
import { useAppSession } from "@/hooks/useAppSession";

export default function IndexRoute() {
  const { ready, onboardingComplete } = useAppSession();

  if (!ready) {
    return (
      <ScreenShell
        loading
        loadingTitle="Preparing TriggerMap"
        loadingMessage="Loading your session and running checks."
        timeoutMessage="Still loading. Check your connection if this persists."
      />
    );
  }

  return <Redirect href={onboardingComplete ? "/(tabs)/log" : "/onboarding"} />;
}