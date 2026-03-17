import { Layout } from "../components/Layout";
import { PREMIUM_FEATURES, PREMIUM_PRICE_LABEL } from "@triggermap/shared/constants/premium";

const freeFeatures = Object.values(PREMIUM_FEATURES).filter((feature) => feature.tier === "free");
const premiumFeatures = Object.values(PREMIUM_FEATURES).filter((feature) => feature.tier === "premium");

export default function PremiumPage() {
  return (
    <Layout title="Premium">
      <section className="card stack premiumHero">
        <div className="premiumHeroGradient" aria-hidden="true" />
        <p className="sectionKicker">Premium</p>
        <h2>Unlock deeper pattern analysis.</h2>
        <p className="muted premiumHeroCopy">
          Core logging, timeline, and weekly summaries stay free. Premium adds AI-powered pattern reading and deeper suggestions.
        </p>
        <strong className="premiumPrice">{PREMIUM_PRICE_LABEL}</strong>
        <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Web payments coming soon. Subscribe via the Android app.</p>
      </section>

      <section className="gridHero premiumGrid">
        <article className="card stack">
          <div className="tierIconWrap">
            <span className="tierIcon">👤</span>
            <div>
              <p className="sectionKicker">Free tier</p>
            </div>
          </div>
          {freeFeatures.map((feature) => (
            <div className="benefitRow" key={feature.label}>
              <span className="benefitMark">✓</span>
              <span>{feature.label}</span>
            </div>
          ))}
        </article>

        <article className="card cardAccent stack">
          <div className="tierIconWrap">
            <span className="tierIcon tierIconPremium">✦</span>
            <div>
              <p className="sectionKicker">Premium</p>
            </div>
          </div>
          {premiumFeatures.map((feature) => (
            <div className="benefitRow benefitRowPremium" key={feature.label}>
              <span className="benefitMark">★</span>
              <span>{feature.label}</span>
            </div>
          ))}
        </article>
      </section>
    </Layout>
  );
}