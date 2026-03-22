import { formatNumber } from '../lib/utils';

export default function MetricCard({ label, value, delta, deltaLabel, sub, color }) {
  const deltaClass = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
  const valueColor = color || 'var(--text-primary)';

  return (
    <div className="metric-card">
      <div className="label">{label}</div>
      <div className="value" style={{ color: valueColor }}>
        {typeof value === 'number' ? formatNumber(value) : value}
      </div>
      {(delta !== undefined && delta !== null) && (
        <div className={`delta ${deltaClass}`}>
          {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'}{' '}
          {Math.abs(delta)}%{deltaLabel ? ` ${deltaLabel}` : ''}
        </div>
      )}
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}
