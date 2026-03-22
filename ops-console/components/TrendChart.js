// Multi-series trend chart using SVG polyline — no external deps.
// data: [{ label: 'Mar 10', users: 5, logs: 12, dau: 3 }, ...]
// series: [{ key: 'users', label: 'Users', color: 'var(--green)' }, ...]

export default function TrendChart({ data, series, height = 180, showDots = true }) {
  if (!data || data.length < 2 || !series?.length) return null;

  const pad = { top: 20, right: 12, bottom: 28, left: 40 };
  const W = 520;
  const H = height;
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;

  // Compute global max across all series
  let globalMax = 1;
  for (const s of series) {
    for (const d of data) {
      const v = d[s.key] ?? 0;
      if (v > globalMax) globalMax = v;
    }
  }
  // Round max up for nicer grid
  globalMax = niceMax(globalMax);

  const xStep = plotW / (data.length - 1);

  function toX(i) { return pad.left + i * xStep; }
  function toY(v) { return pad.top + plotH - (v / globalMax) * plotH; }

  // Y-axis grid lines (4 lines)
  const gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(globalMax * f));

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', maxWidth: W, height: 'auto' }}>
        {/* Grid lines */}
        {gridLines.map((v, i) => (
          <g key={i}>
            <line
              x1={pad.left} y1={toY(v)} x2={W - pad.right} y2={toY(v)}
              stroke="var(--border)" strokeWidth={0.5} strokeDasharray={i === 0 ? 'none' : '4,3'}
            />
            <text x={pad.left - 6} y={toY(v) + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)">
              {v}
            </text>
          </g>
        ))}

        {/* Series lines */}
        {series.map((s) => {
          const points = data.map((d, i) => `${toX(i)},${toY(d[s.key] ?? 0)}`).join(' ');
          return (
            <g key={s.key}>
              <polyline
                points={points}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {showDots && data.map((d, i) => (
                <circle
                  key={i}
                  cx={toX(i)} cy={toY(d[s.key] ?? 0)}
                  r={3}
                  fill={s.color}
                  stroke="var(--bg-surface)"
                  strokeWidth={1.5}
                >
                  <title>{`${s.label}: ${d[s.key] ?? 0}`}</title>
                </circle>
              ))}
            </g>
          );
        })}

        {/* X-axis labels — show every Nth to avoid clutter */}
        {data.map((d, i) => {
          const show = data.length <= 8 || i % Math.ceil(data.length / 7) === 0 || i === data.length - 1;
          if (!show) return null;
          return (
            <text key={i} x={toX(i)} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text-muted)">
              {d.label}
            </text>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 4 }}>
        {series.map((s) => (
          <div key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11 }}>
            <span style={{ width: 10, height: 3, background: s.color, borderRadius: 2, display: 'inline-block' }} />
            <span style={{ color: 'var(--text-muted)' }}>{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function niceMax(v) {
  if (v <= 5) return Math.max(v, 5);
  const magnitude = Math.pow(10, Math.floor(Math.log10(v)));
  const normalized = v / magnitude;
  if (normalized <= 1.5) return Math.ceil(1.5 * magnitude);
  if (normalized <= 3) return Math.ceil(3 * magnitude);
  if (normalized <= 5) return Math.ceil(5 * magnitude);
  return Math.ceil(10 * magnitude);
}
