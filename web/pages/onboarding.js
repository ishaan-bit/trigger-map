import { useState } from "react";
import { useRouter } from "next/router";
import { useOnboarding } from "../hooks/useOnboarding";
import { useI18n } from "../lib/i18n";
import { AtmosphericField } from "../components/AtmosphericField";

const SLIDES = [
  { icon: "🎯", t: "onboarding.slide1Title", b: "onboarding.slide1Body", tf: "Map what moves you", bf: "Log a moment whenever something shifts your mood — a person, a place, work, sleep. TriggerMap finds the patterns underneath." },
  { icon: "✍️", t: "onboarding.slide2Title", b: "onboarding.slide2Body", tf: "30 seconds, that's it", bf: "Pick a trigger, place how you feel on the emotion pad, add a tag or two. Done. No essays required." },
  { icon: "🧭", t: "onboarding.slide3Title", b: "onboarding.slide3Body", tf: "Two simple dials", bf: "Left↔right is unpleasant↔pleasant. Down↔up is calm↔intense. Where they meet names the feeling, live." },
  { icon: "🗓", t: "onboarding.slide4Title", b: "onboarding.slide4Body", tf: "Your timeline builds itself", bf: "Every moment lands on a timeline, grouped by day and coloured by feeling, so you can look back without effort." },
  { icon: "📊", t: "onboarding.slide5Title", b: "onboarding.slide5Body", tf: "Patterns & insights", bf: "After a few moments, your weekly read shows what's driving you, what helps, and where friction shows up." },
  { icon: "✨", t: "onboarding.slide6Title", b: "onboarding.slide6Body", tf: "Go as deep as you like", bf: "Everything core stays free, no account needed. Premium adds an AI narrative and adaptive suggestions made for you." },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { advance, skip } = useOnboarding();
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const isLast = index === SLIDES.length - 1;

  function finish() {
    advance("framing_shown");
    router.push("/");
  }
  function handleNext() {
    if (isLast) finish();
    else setIndex((i) => i + 1);
  }
  function handleSkip() {
    skip();
    router.push("/");
  }

  const slide = SLIDES[index];

  return (
    <main className="onboardingShell">
      <AtmosphericField emotion="neutral" />
      <div className="onboardingTop">
        <span className="onboardingBrand">{t("onboarding.brand", "TriggerMap")}</span>
        {!isLast ? <button type="button" className="onboardingSkip" onClick={handleSkip}>{t("onboarding.skip", "Skip")}</button> : null}
      </div>

      <div className="onboardingSlide" key={index}>
        <div className="onboardingIconWrap">
          <span className="onboardingIconGlow" />
          <span className="onboardingIcon">{slide.icon}</span>
        </div>
        <h1 className="onboardingTitle">{t(slide.t, slide.tf)}</h1>
        <p className="onboardingBody">{t(slide.b, slide.bf)}</p>
      </div>

      <div className="onboardingFooter">
        <div className="onboardingDots" role="tablist">
          {SLIDES.map((_, i) => (
            <span key={i} className={`onboardingDot${i === index ? " onboardingDotActive" : ""}`} />
          ))}
        </div>
        <button type="button" className="primaryButton" onClick={handleNext}>
          {isLast ? t("onboarding.startLogging", "Start logging") : t("onboarding.continue", "Continue")}
        </button>
      </div>
    </main>
  );
}
