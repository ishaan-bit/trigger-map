const sectionStyle = {
  background: "rgba(18, 22, 32, 0.92)",
  border: "1px solid rgba(255,255,255,0.08)",
  borderRadius: 20,
  padding: 24,
};

export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        background: "radial-gradient(circle at top, #27344a 0%, #0a0f18 55%, #06090f 100%)",
        color: "#f4f7fb",
        padding: "48px 24px",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: 860, margin: "0 auto", display: "grid", gap: 20 }}>
        <section style={sectionStyle}>
          <p style={{ color: "#8fb2ff", letterSpacing: 2, textTransform: "uppercase", fontSize: 12 }}>
            TriggerMap Backend
          </p>
          <h1 style={{ fontSize: 42, margin: "12px 0" }}>Discover what triggers your emotions.</h1>
          <p style={{ color: "#afbdd1", maxWidth: 640, lineHeight: 1.6 }}>
            This Next.js service exposes production-oriented Redis-backed APIs for anonymous logging, account
            migration, subscriptions, weekly reports, analytics, and legal pages.
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={{ marginTop: 0 }}>API routes</h2>
          <ul style={{ lineHeight: 1.8, color: "#d7dfeb" }}>
            <li>POST /api/logMoment</li>
            <li>GET /api/timeline</li>
            <li>GET /api/weeklyReport</li>
            <li>POST /api/login</li>
            <li>POST /api/register</li>
            <li>GET /api/me</li>
            <li>GET /api/export</li>
            <li>POST /api/subscription/verify</li>
          </ul>
        </section>
      </div>
    </main>
  );
}