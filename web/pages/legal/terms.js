const shell = {
  minHeight: "100vh",
  background: "linear-gradient(180deg, #101520 0%, #080b12 100%)",
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

export default function TermsPage() {
  return (
    <main style={shell}>
      <article style={card}>
        <p style={{ color: "#85a9ff", textTransform: "uppercase", letterSpacing: 2, fontSize: 12 }}>
          QuietDen Terms of Service
        </p>
        <h1>Terms of Service</h1>
        <p>
          QuietDen Experience is a self-reflection tool designed to help users identify emotional trigger patterns. It is not a
          medical device and does not replace professional mental health care.
        </p>
        <h2>Usage</h2>
        <ul>
          <li>You are responsible for the accuracy of the information you submit</li>
          <li>You must not misuse the service, automate abuse, or attempt unauthorized access</li>
          <li>Premium subscriptions renew according to Google Play billing terms unless cancelled</li>
        </ul>
        <h2>Accounts and subscriptions</h2>
        <ul>
          <li>Anonymous mode is available without account creation</li>
          <li>Creating an account attaches future sessions to your user identity</li>
          <li>Subscription entitlements are determined by server-side verification results</li>
        </ul>
        <h2>Liability</h2>
        <ul>
          <li>Insights are informational and may not reflect clinical advice</li>
          <li>The service is provided on an as-available basis</li>
        </ul>
        <p>Last updated: March 13, 2026.</p>
      </article>
    </main>
  );
}
