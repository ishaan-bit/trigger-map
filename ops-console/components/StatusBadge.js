export default function StatusBadge({ status }) {
  const cls = status === 'healthy' ? 'healthy' : status === 'degraded' ? 'degraded' : 'critical';
  return (
    <span className={`status-badge ${cls}`}>
      <span className="dot" />
      {status}
    </span>
  );
}
