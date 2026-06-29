import Head from "next/head";
import { useEffect } from "react";
import { useRouter } from "next/router";
import { LanguageProvider } from "../lib/i18n";
import { SessionProvider } from "../hooks/useSession";
import { EmotionalStateProvider } from "../hooks/useEmotionalState";
import { OnboardingProvider, useOnboarding } from "../hooks/useOnboarding";
import "../styles/globals.css";

// First-run gate: send brand-new visitors to the onboarding carousel.
function OnboardingGate() {
  const router = useRouter();
  const { ready, isNotStarted } = useOnboarding();
  useEffect(() => {
    if (ready && isNotStarted && router.pathname !== "/onboarding") {
      router.replace("/onboarding");
    }
  }, [ready, isNotStarted, router]);
  return null;
}

export default function App({ Component, pageProps }) {
  return (
    <LanguageProvider>
      <SessionProvider>
        <EmotionalStateProvider>
          <OnboardingProvider>
            <OnboardingGate />
            <Head>
              <title>TriggerMap</title>
              <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
              <meta name="theme-color" content="#080e1a" />
              <meta name="description" content="Track emotional triggers, review your timeline, and get a weekly pattern report from any browser." />
              <meta name="apple-mobile-web-app-capable" content="yes" />
              <meta name="mobile-web-app-capable" content="yes" />
              <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
              <meta name="apple-mobile-web-app-title" content="TriggerMap" />
              <link rel="manifest" href="/manifest.json" />
              <link rel="icon" type="image/png" sizes="512x512" href="/icon-512.png" />
              <link rel="apple-touch-icon" href="/icon-192.png" />
            </Head>
            <Component {...pageProps} />
          </OnboardingProvider>
        </EmotionalStateProvider>
      </SessionProvider>
    </LanguageProvider>
  );
}
