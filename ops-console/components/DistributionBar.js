const COLORS = [
  'var(--accent)',
  'var(--green)',
  'var(--cyan)',
  'var(--yellow)',
  'var(--orange)',
  'var(--red)',
];

export default function DistributionBar({ data, label }) {
  if (!data || Object.keys(data).length === 0) return null;

  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...entries.map((e) => e[1]), 1);

  return (
    <div>
      {label && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{label}</div>}
      {entries.map(([key, val], i) => (
        <div key={key} className="dist-row">
          <div className="dist-label">{key}</div>
          <div className="dist-bar-track">
            <div
              className="dist-bar-fill"
              style={{
                width: `${(val / max) * 100}%`,
                background: COLORS[i % COLORS.length],
              }}
            />
          </div>
          <div className="dist-value">{val}</div>
        </div>
      ))}
    </div>
  );
}
