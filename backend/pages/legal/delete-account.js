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

const step = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 12,
  padding: "16px 20px",
  marginBottom: 12,
};

const rows = [
  ["Account profile (email, name, provider)", "Deleted", "Immediate"],
  ["All logged moments and notes", "Deleted", "Immediate"],
  ["Weekly reports and AI insights", "Deleted", "Immediate"],
  ["Session tokens", "Revoked and deleted", "Immediate"],
  ["Daily aggregate data", "Deleted", "Immediate"],
  ["Push notification tokens", "Deleted", "Immediate"],
  ["Anonymous device identity", "Deleted", "Immediate"],
  ["Subscription purchase token", "Deleted from our records*", "Immediate"],
  ["Crash logs (Sentry)", "Retained up to 90 days", "Per Sentry retention policy"],
  ["Analytics events (PostHog)", "Retained up to 1 year", "Per PostHog retention policy"],
];

export default function DeleteAccountPage() {
  return (
    <main style={shell}>
      <article style={card}>
        <p style={{ color: "#85a9ff", textTransform: "uppercase", letterSpacing: 2, fontSize: 12 }}>
          QuietDen — Account &amp; Data Deletion
        </p>
        <h1 style={{ marginTop: 8 }}>Delete Your Account and Data</h1>
        <p style={{ color: "#afbdd1" }}>
          You can delete your QuietDen account and all associated data directly inside the app at any
          time, or by contacting our support team. Both paths are described below.
        </p>

        <h2>Option 1 — Delete from inside the app (instant)</h2>
        <div style={step}>
          <strong>1.</strong> Open the <strong>QuietDen</strong> app on your Android device.
        </div>
        <div style={step}>
          <strong>2.</strong> Tap the <strong>Profile</strong> icon in the bottom navigation bar.
        </div>
        <div style={step}>
          <strong>3.</strong> Scroll to the bottom of the Settings screen and tap{" "}
          <strong>&quot;Delete Account&quot;</strong>.
        </div>
        <div style={step}>
          <strong>4.</strong> Confirm the deletion when prompted. Your account and all stored data
          are deleted immediately.
        </div>

        <h2>Option 2 — Request deletion by email</h2>
        <p style={{ color: "#afbdd1" }}>
          If you cannot access the app, email us at{" "}
          <a href="mailto:support@triggermap.app" style={{ color: "#85a9ff" }}>
            support@triggermap.app
          </a>{" "}
          with the subject line <strong>&quot;Account Deletion Request&quot;</strong> and include the
          email address associated with your account (or your anonymous device ID if you never signed
          up). We will process your request within <strong>7 days</strong>.
        </p>

        <h2>What gets deleted</h2>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 14,
            color: "#d0dcf0",
            marginBottom: 8,
          }}
        >
          <thead>
            <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
              <th style={{ textAlign: "left", padding: "8px 4px" }}>Data type</th>
              <th style={{ textAlign: "left", padding: "8px 4px" }}>Action</th>
              <th style={{ textAlign: "left", padding: "8px 4px" }}>Timing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([type, action, timing]) => {
              const isDeleted = action === "Deleted" || action.startsWith("Revoked");
              return (
                <tr key={type} style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                  <td style={{ padding: "8px 4px" }}>{type}</td>
                  <td
                    style={{
                      padding: "8px 4px",
                      color: isDeleted ? "#34c759" : "#ff9f0a",
                      fontWeight: 500,
                    }}
                  >
                    {action}
                  </td>
                  <td style={{ padding: "8px 4px", color: "#7a93b8", fontSize: 13 }}>{timing}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p style={{ color: "#7a93b8", fontSize: 13 }}>
          * Purchase tokens are stored only for subscription verification purposes. Deleting your
          account removes them from our systems. Google Play purchase history is managed by Google
          and is not affected by this deletion.
        </p>

        <h2>Anonymous users</h2>
        <p style={{ color: "#afbdd1" }}>
          If you used QuietDen without creating an account, your data is stored against an anonymous
          device ID. To delete it, use the <strong>&quot;Clear All Data&quot;</strong> option in the
          app Settings screen, or email us with your device ID (visible in Settings &rarr; About).
        </p>

        <h2>Contact</h2>
        <p style={{ color: "#afbdd1" }}>
          Privacy and deletion enquiries:{" "}
          <a href="mailto:support@triggermap.app" style={{ color: "#85a9ff" }}>
            support@triggermap.app
          </a>
        </p>
        <p style={{ color: "#4a5d7a", fontSize: 13 }}>Last updated: April 20, 2026.</p>
      </article>
    </main>
  );
}
