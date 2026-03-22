export default function BarChart({ data, labelKey, valueKey, maxHeight = 80 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map((d) => d[valueKey] || 0), 1);

  return (
    <div className="bar-chart" style={{ height: maxHeight }}>
      {data.map((d, i) => {
        const val = d[valueKey] || 0;
        const height = Math.max((val / max) * maxHeight * 0.85, 2);
        return (
          <div key={i} className="bar-item">
            <div className="bar" style={{ height }} title={String(val)} />
            <div className="bar-label">{d[labelKey]}</div>
          </div>
        );
      })}
    </div>
  );
}
