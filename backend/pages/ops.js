import { useState, useEffect, useCallback } from "react";

const palette = {
  bg: "#0a0f18",
  glass: "rgba(18, 22, 32, 0.92)",
  border: "rgba(255,255,255,0.08)",
  text: "#f4f7fb",
  muted: "#6a7a94",
  accent: "#8fb2ff",
  success: "#5ee6a0",
  warning: "#f5c542",
  danger: "#ff6b6b",
  purple: "#b78aff",
};

function BarGroup({ label, value, max, color }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: palette.muted, marginBottom: 2 }}>
        <span>{label}</span>
        <span style={{ color: palette.text, fontWeight: 600 }}>{typeof value === "number" ? value.toFixed(1) : value}</span>
      </div>
      <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 4, height: 14, overflow: "hidden" }}>
        <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.5s ease" }} />
      </div>
    </div>
  );
}

function MetricCard({ title, metrics, color }) {
  if (!metrics) return null;
  return (
    <div style={{ background: palette.glass, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 18, flex: 1, minWidth: 260 }}>
      <h3 style={{ margin: "0 0 12px", fontSize: 15, color, letterSpacing: 1 }}>{title}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
        <Stat label="Users" value={metrics.userCount} />
        <Stat label="Avg score" value={metrics.avgScore?.toFixed(2)} />
        <Stat label="Avg stability" value={metrics.avgStability != null ? `${Math.round(metrics.avgStability * 100)}%` : "—"} />
        <Stat label="Avg volatility" value={metrics.avgVolatility?.toFixed(2)} />
        <Stat label="Improving" value={metrics.improvingCount} />
        <Stat label="Declining" value={metrics.decliningCount} />
        <Stat label="Avg weeks" value={metrics.avgWeeksTracked?.toFixed(1)} />
        <Stat label="Avg moments" value={metrics.avgMoments?.toFixed(0)} />
      </div>
      {metrics.directionBreakdown ? (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, color: palette.muted, marginBottom: 6 }}>Direction breakdown</div>
          <BarGroup label="Improving" value={metrics.directionBreakdown.improving || 0} max={metrics.userCount} color={palette.success} />
          <BarGroup label="Stable" value={metrics.directionBreakdown.stable || 0} max={metrics.userCount} color={palette.accent} />
          <BarGroup label="Declining" value={metrics.directionBreakdown.declining || 0} max={metrics.userCount} color={palette.danger} />
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <div style={{ color: palette.muted, fontSize: 11 }}>{label}</div>
      <div style={{ color: palette.text, fontSize: 16, fontWeight: 700 }}>{value ?? "—"}</div>
    </div>
  );
}

function UserTable({ summaries }) {
  if (!summaries?.length) return null;
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, color: palette.text }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${palette.border}` }}>
            {["Owner", "Premium", "Moments", "Progress", "Direction", "Weeks"].map(h => (
              <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: palette.muted, fontWeight: 500, fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {summaries.map((u, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${palette.border}` }}>
              <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 12 }}>{u.ownerId}</td>
              <td style={{ padding: "6px 10px" }}>{u.isPremium ? "✓" : "—"}</td>
              <td style={{ padding: "6px 10px" }}>{u.totalMoments}</td>
              <td style={{ padding: "6px 10px" }}>{u.hasProgress ? "✓" : "—"}</td>
              <td style={{ padding: "6px 10px", color: u.direction === "improving" ? palette.success : u.direction === "declining" ? palette.danger : palette.muted }}>
                {u.direction || "—"}
              </td>
              <td style={{ padding: "6px 10px" }}>{u.weeksTracked}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function OpsConsole() {
  const [apiKey, setApiKey] = useState("");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchMetrics = useCallback(async () => {
    if (!apiKey) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/internal/control/pilot-metrics", {
        headers: { "x-internal-key": apiKey },
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [apiKey]);

  return (
    <main style={{ minHeight: "100vh", background: `radial-gradient(circle at top, #27344a 0%, ${palette.bg} 55%, #06090f 100%)`, color: palette.text, padding: "32px 20px", fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, marginBottom: 4 }}>TriggerMap Ops Console</h1>
        <p style={{ color: palette.muted, fontSize: 13, marginBottom: 20 }}>Pilot validation dashboard</p>

        {/* Auth */}
        <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
          <input
            type="password"
            placeholder="Internal API key"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1px solid ${palette.border}`, background: "rgba(18,22,32,0.8)", color: palette.text, fontSize: 14, outline: "none" }}
          />
          <button
            onClick={fetchMetrics}
            disabled={loading || !apiKey}
            style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: palette.accent, color: "#0a0f18", fontWeight: 700, fontSize: 14, cursor: "pointer", opacity: loading ? 0.5 : 1 }}
          >
            {loading ? "Loading…" : "Fetch"}
          </button>
        </div>

        {error ? <div style={{ background: "rgba(255,100,100,0.15)", border: `1px solid ${palette.danger}40`, borderRadius: 10, padding: "12px 16px", color: palette.danger, fontSize: 13, marginBottom: 16 }}>{error}</div> : null}

        {data ? (
          <>
            <p style={{ color: palette.muted, fontSize: 11, marginBottom: 16 }}>Computed: {data.computedAt}</p>

            {/* Cohort comparison */}
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
              <MetricCard title="All Users" metrics={data.overall} color={palette.accent} />
              <MetricCard title="Free" metrics={data.free} color={palette.muted} />
              <MetricCard title="Premium" metrics={data.premium} color={palette.success} />
            </div>

            {/* Score comparison bar */}
            {data.overall && data.free && data.premium ? (
              <div style={{ background: palette.glass, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 18, marginBottom: 24 }}>
                <h3 style={{ margin: "0 0 14px", fontSize: 14, color: palette.accent }}>Score Comparison</h3>
                <BarGroup label="All — Avg Score" value={data.overall.avgScore || 0} max={5} color={palette.accent} />
                <BarGroup label="Free — Avg Score" value={data.free.avgScore || 0} max={5} color={palette.muted} />
                <BarGroup label="Premium — Avg Score" value={data.premium.avgScore || 0} max={5} color={palette.success} />
                <div style={{ height: 12 }} />
                <BarGroup label="All — Avg Stability" value={(data.overall.avgStability || 0) * 100} max={100} color={palette.accent} />
                <BarGroup label="Free — Avg Stability" value={(data.free.avgStability || 0) * 100} max={100} color={palette.muted} />
                <BarGroup label="Premium — Avg Stability" value={(data.premium.avgStability || 0) * 100} max={100} color={palette.success} />
              </div>
            ) : null}

            {/* User table */}
            <div style={{ background: palette.glass, border: `1px solid ${palette.border}`, borderRadius: 14, padding: 18 }}>
              <h3 style={{ margin: "0 0 12px", fontSize: 14, color: palette.accent }}>User Summaries</h3>
              <UserTable summaries={data.userSummaries} />
            </div>
          </>
        ) : null}
      </div>
    </main>
  );
}
