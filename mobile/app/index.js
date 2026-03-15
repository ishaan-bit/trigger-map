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
        loadingMessage="Loading your device session and health checks."
        timeoutMessage="Still preparing TriggerMap. Check connection if this keeps happening."
      />
    );
  }

  return <Redirect href={onboardingComplete ? "/(tabs)/log" : "/onboarding"} />;
}