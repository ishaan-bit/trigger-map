import { useState } from "react";
import { Layout } from "../components/Layout";
import { useSession } from "../hooks/useSession";
import { useI18n } from "../lib/i18n";
import { PREMIUM_PRICE_LABEL } from "@triggermap/shared/constants/premium";

const OUTCOMES = [
  { t: "premium.outcome1Title", b: "premium.outcome1Body", e: "premium.outcome1Example", tf: "See what's actually moving you", bf: "Premium reads your week and names the patterns underneath — not just what you felt, but what set it off.", ef: "“Work spikes your tension on the days you skip a morning walk.”" },
  { t: "premium.outcome2Title", b: "premium.outcome2Body", e: "premium.outcome2Example", tf: "Catch shifts early", bf: "Early-detection signals surface drift and crash-risk before they become a hard week.", ef: "“Your bandwidth has dipped three days running — ease the load.”" },
  { t: "premium.outcome3Title", b: "premium.outcome3Body", e: "premium.outcome3Example", tf: "Moves made for you", bf: "Adaptive Move / Fuel / Perspective suggestions tuned to your patterns and what's helped before.", ef: "“A 10-minute reset that's worked for you after partner conflict.”" },
];

// Illustrative dots + rising clarity line (not user data).
function ClarityVisual() {
  const W = 300;
  const H = 128;
  const dots = [
    [16, 94, 3, 0.16], [38, 68, 2.5, 0.13], [56, 102, 3.5, 0.2], [84, 58, 2.5, 0.15],
    [102, 90, 3, 0.19], [128, 52, 2.5, 0.18], [148, 78, 3.5, 0.25], [176, 44, 3, 0.24],
    [198, 64, 2.5, 0.22], [224, 38, 3.5, 0.32], [248, 50, 3, 0.36], [272, 30, 3.5, 0.46], [292, 40, 4, 0.55],
  ];
  const line = [0.26, 0.3, 0.27, 0.42, 0.4, 0.54, 0.58, 0.7, 0.74, 0.86, 0.93];
  const path = line.map((v, i) => {
    const x = (i / (line.length - 1)) * W;
    const y = H - v * (H - 16) - 8;
    return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div className="clarityWrap">
      <div className="clarityGlowOrb" />
      <svg className="claritySvg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
        {dots.map((d, i) => <circle key={i} cx={d[0]} cy={d[1]} r={d[2]} fill="#56d0e0" opacity={d[3]} />)}
        <path d={path} fill="none" stroke="#56d0e0" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

export default function PremiumPage() {
  const { isPremium, subscription, refreshSubscription } = useSession();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");

  async function handleCheck() {
    setBusy(true);
    setStatusMsg("");
    try {
      const session = await refreshSubscription();
      const active = session?.subscription?.status === "active" || session?.subscription?.status === "grace_period";
      setStatusMsg(active ? t("premium.restored", "Premium is active on this device.") : t("premium.noSubscription", "No premium found for this device yet."));
    } catch {
      setStatusMsg(t("premium.restoreFailed", "Couldn't check right now. Try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Layout title={t("tabs.premium", "Premium")}>
      <section className="premiumHeroNew tmFade">
        <p className="sectionKicker" style={{ textAlign: "center" }}>{t("premium.kicker", "Premium")}</p>
        <ClarityVisual />
        <h2 className="premiumTitle">{t("premium.title", "Your patterns, in focus")}</h2>
        <p className="premiumSubtitle">{t("premium.subtitle", "The clearer the picture, the easier the next move. Premium turns your logs into a personalised read.")}</p>
      </section>

      <p className="premiumSectionHeader">{t("premium.outcomesHeader", "What deepens with Premium")}</p>
      {OUTCOMES.map((o, i) => (
        <article key={o.t} className="card cardAccent stack premiumOutcomeCard tmRise" style={{ animationDelay: `${80 + i * 90}ms` }}>
          <strong className="premiumOutcomeTitle">{t(o.t, o.tf)}</strong>
          <p className="premiumOutcomeBody">{t(o.b, o.bf)}</p>
          <div className="premiumExampleRow">
            <span className="premiumExampleDot" />
            <span className="premiumOutcomeExample">{t(o.e, o.ef)}</span>
          </div>
        </article>
      ))}

      <div className="previewCard tmFade">
        <p className="previewTitle">{t("premium.previewTitle", "A peek at your read")}</p>
        <div className="previewBlur">
          <p className="previewBlurText">{t("premium.previewText", "This week your steadiest hours were mornings; tension clustered around work after low-sleep nights, and the days you logged a short walk recovered fastest…")}</p>
          <div className="previewGradient" />
        </div>
        <p className="previewHint">{t("premium.previewHint", "Your full weekly narrative unlocks with Premium.")}</p>
      </div>

      <div className="reassureRow tmFade">
        <span className="reassureIcon">🔒</span>
        <span className="reassureText">{t("premium.baselineSafe", "Logging, your timeline, weekly signals and early detection stay free — forever. Premium only adds the AI narrative and adaptive modes.")}</span>
      </div>

      {isPremium ? (
        <div className="premiumActiveCard tmFade">
          <span className="premiumActiveIcon">✓</span>
          <span className="premiumActiveText">
            {t("premium.activeText", "Premium is active.")}
            {subscription?.expiresAt ? ` · renews ${new Date(subscription.expiresAt).toLocaleDateString()}` : ""}
          </span>
        </div>
      ) : (
        <div className="premiumCtaWrap tmFade">
          <div className="premiumAppNote">
            <strong>{t("premium.webPurchaseTitle", "Unlock Premium in the app")}</strong>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              {t("premium.webPurchaseBody", "Premium is purchased in the TriggerMap Android app. Once it's active on this device, it appears here automatically — no account or sign-in needed.")}
            </p>
            <span className="premiumPrice">{PREMIUM_PRICE_LABEL}</span>
          </div>
          <button className="primaryButton inlineButton" type="button" onClick={handleCheck} disabled={busy}>
            {busy ? t("common.pleaseWait", "Checking…") : t("premium.checkStatus", "Check my status")}
          </button>
          {statusMsg ? <p className="muted" style={{ fontSize: 13, textAlign: "center" }}>{statusMsg}</p> : null}
        </div>
      )}
    </Layout>
  );
}
