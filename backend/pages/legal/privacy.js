const shell = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #0b111a 0%, #070a11 100%)",
  color: "#eff5ff",
  fontFamily: "ui-sans-serif, system-ui, sans-serif",
  padding: "48px 20px",
};

const card = {
  maxWidth: 840,
  margin: "0 auto",
  background: "rgba(16,20,29,0.94)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 24,
  padding: 32,
  lineHeight: 1.75,
};

export default function PrivacyPolicyPage() {
  return (
    <main style={shell}>
      <article style={card}>
        <p style={{ color: "#85a9ff", textTransform: "uppercase", letterSpacing: 2, fontSize: 12 }}>
          TriggerMap Privacy Policy
        </p>
        <h1>Privacy Policy</h1>
        <p>
          TriggerMap collects trigger logs, selected emotions, optional notes, subscription status, device identifiers,
          and account details that you choose to provide. Anonymous use is supported by generating a local device ID.
        </p>
        <h2>What we collect</h2>
        <ul>
          <li>Trigger moments with timestamps, trigger, emotion, and optional note</li>
          <li>Anonymous device ID stored securely on the device</li>
          <li>Account details such as email, hashed password, or verified Google identity</li>
          <li>Subscription state and purchase validation metadata</li>
          <li>Operational analytics and crash diagnostics</li>
        </ul>
        <h2>How we use data</h2>
        <ul>
          <li>Generate timeline views and weekly pattern insights</li>
          <li>Migrate anonymous logs into an authenticated account without data loss</li>
          <li>Verify subscription entitlements and secure access to premium features</li>
          <li>Monitor reliability, abuse, and product quality</li>
        </ul>
        <h2>Data handling</h2>
        <ul>
          <li>Data is stored in Redis under application-specific keys</li>
          <li>Passwords are hashed with bcrypt before storage</li>
          <li>Session tokens are signed and validated server-side</li>
          <li>Transport is expected to run over HTTPS in production</li>
        </ul>
        <h2>Your choices</h2>
        <ul>
          <li>You can use TriggerMap anonymously by default</li>
          <li>You can create an account later and migrate anonymous data</li>
          <li>You can export your logs from the settings screen</li>
          <li>You can request account deletion through support workflows</li>
        </ul>
        <p>Last updated: March 13, 2026.</p>
      </article>
    </main>
  );
}