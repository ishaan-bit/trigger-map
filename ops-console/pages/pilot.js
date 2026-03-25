import Head from 'next/head';
import { useFetch } from '../hooks/useData';
import MetricCard from '../components/MetricCard';
import BarChart from '../components/BarChart';
import StatusBadge from '../components/StatusBadge';

function ValidationCheck({ check }) {
  const pct = check.total > 0 ? Math.round((check.value / check.total) * 100) : 0;
  const status = pct >= check.target ? 'healthy' : pct >= check.target * 0.5 ? 'degraded' : 'critical';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
      <StatusBadge status={status} />
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{check.label}</div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {check.value} / {check.total} ({pct}%) — target: {check.target}%
        </div>
      </div>
      <div style={{ width: 120, height: 6, background: 'var(--bg-tertiary)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 3,
          background: status === 'healthy' ? 'var(--green)' : status === 'degraded' ? 'var(--yellow)' : 'var(--red)',
        }} />
      </div>
    </div>
  );
}

function UserRow({ user }) {
  return (
    <tr>
      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{user.id}</td>
      <td>{user.name || '—'}</td>
      <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{user.moments}</td>
      <td style={{ textAlign: 'right' }}>{user.activeDays14d}d</td>
      <td style={{ textAlign: 'right' }}>{user.uniqueTriggers}</td>
      <td style={{ textAlign: 'center' }}>{user.hasReport ? '✓' : '—'}</td>
      <td style={{ textAlign: 'center' }}>{user.hasLlm ? '✓' : '—'}</td>
      <td style={{ textAlign: 'center' }}>{user.hasModes ? '✓' : '—'}</td>
      <td style={{ textAlign: 'right' }}>{user.feedbackCount || '—'}</td>
      <td style={{ textAlign: 'center' }}>{user.isPremium ? '💎' : '—'}</td>
    </tr>
  );
}

export default function PilotPage() {
  const { data, loading, error, refetch } = useFetch('/api/pilot/validation');

  const overallScore = data?.checks
    ? Math.round(data.checks.filter(c => c.total > 0 && (c.value / c.total * 100) >= c.target).length / data.checks.length * 100)
    : null;

  return (
    <>
      <Head><title>Pilot Validation — TriggerMap Ops</title></Head>

      <div className="ops-page-header">
        <h2>Pilot Validation</h2>
        <button className="btn btn-ghost btn-sm" onClick={refetch} disabled={loading}>Refresh</button>
      </div>

      {loading && !data && <div className="spinner">Loading pilot data...</div>}
      {error && <div style={{ color: 'var(--red)', padding: 16 }}>Error: {error}</div>}

      {data && (
        <>
          {/* Summary KPIs */}
          <div className="metrics-grid">
            <MetricCard label="Total Users" value={data.totalUsers} color="var(--accent)" />
            <MetricCard label="Total Moments" value={data.totalMoments} color="var(--green)" />
            <MetricCard label="Avg Moments / User" value={data.avgMoments} color="var(--cyan)" />
            <MetricCard label="Median Weekly" value={data.medianWeeklyMoments} color="var(--purple)" />
            <MetricCard
              label="Pilot Health"
              value={overallScore != null ? `${overallScore}%` : '—'}
              color={overallScore >= 70 ? 'var(--green)' : overallScore >= 40 ? 'var(--yellow)' : 'var(--red)'}
              sub={`${data.checks.filter(c => c.total > 0 && (c.value / c.total * 100) >= c.target).length}/${data.checks.length} checks passing`}
            />
          </div>

          {/* Validation Checks */}
          <div className="panel" style={{ marginTop: 24 }}>
            <div className="panel-header"><h3>Validation Gates</h3></div>
            <div className="panel-body">
              {data.checks.map((check, i) => (
                <ValidationCheck key={i} check={check} />
              ))}
            </div>
          </div>

          {/* Fleet Distributions */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 24 }}>
            {/* Days Active Distribution */}
            <div className="panel">
              <div className="panel-header"><h3>Days Active (14d window)</h3></div>
              <div className="panel-body">
                <BarChart
                  data={Object.entries(data.daysDistribution || {}).map(([days, count]) => ({
                    label: `${days}d`,
                    value: count,
                  })).sort((a, b) => parseInt(a.label) - parseInt(b.label))}
                  color="var(--accent)"
                  height={160}
                />
              </div>
            </div>

            {/* Trigger Usage Fleet-wide */}
            <div className="panel">
              <div className="panel-header"><h3>Trigger Usage (fleet)</h3></div>
              <div className="panel-body">
                <BarChart
                  data={Object.entries(data.triggerFleet || {}).slice(0, 10).map(([trigger, count]) => ({
                    label: trigger,
                    value: count,
                  }))}
                  color="var(--cyan)"
                  height={160}
                />
              </div>
            </div>

            {/* Emotion Distribution Fleet-wide */}
            <div className="panel">
              <div className="panel-header"><h3>Emotion Distribution (fleet)</h3></div>
              <div className="panel-body">
                <BarChart
                  data={Object.entries(data.emotionFleet || {}).slice(0, 10).map(([emotion, count]) => ({
                    label: emotion,
                    value: count,
                  }))}
                  color="var(--purple)"
                  height={160}
                />
              </div>
            </div>
          </div>

          {/* User Table */}
          <div className="panel" style={{ marginTop: 24 }}>
            <div className="panel-header">
              <h3>Pilot Users (top 50 by moments)</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.users?.length || 0} users shown</span>
            </div>
            <div className="panel-body" style={{ overflowX: 'auto' }}>
              <table className="ops-table">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th style={{ textAlign: 'right' }}>Moments</th>
                    <th style={{ textAlign: 'right' }}>Active</th>
                    <th style={{ textAlign: 'right' }}>Triggers</th>
                    <th style={{ textAlign: 'center' }}>Report</th>
                    <th style={{ textAlign: 'center' }}>LLM</th>
                    <th style={{ textAlign: 'center' }}>Modes</th>
                    <th style={{ textAlign: 'right' }}>Feedback</th>
                    <th style={{ textAlign: 'center' }}>Premium</th>
                  </tr>
                </thead>
                <tbody>
                  {data.users?.map((user) => (
                    <UserRow key={user.id} user={user} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginTop: 8 }}>
            Updated: {new Date(data.timestamp).toLocaleString()}
          </div>
        </>
      )}
    </>
  );
}
