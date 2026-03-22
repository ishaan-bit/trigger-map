import Head from 'next/head';
import { useFetch } from '../hooks/useData';
import MetricCard from '../components/MetricCard';
import { formatDateTime } from '../lib/utils';

export default function UsersPage() {
  const { data, loading, error, refetch } = useFetch('/api/metrics/users');

  return (
    <>
      <Head><title>Users — TriggerMap Ops</title></Head>

      <div className="ops-page-header">
        <h2>User Registry</h2>
        <button className="btn btn-ghost btn-sm" onClick={refetch} disabled={loading}>Refresh</button>
      </div>

      {loading && !data && <div className="spinner">Loading users...</div>}
      {error && <div style={{ color: 'var(--red)', padding: 16 }}>Error: {error}</div>}

      {data && (
        <>
          <div className="metrics-grid">
            <MetricCard label="Total Users" value={data.summary?.total} />
            <MetricCard label="Google Sign-In" value={data.summary?.google} color="var(--green)" />
            <MetricCard label="Email Sign-In" value={data.summary?.email} color="var(--cyan)" />
            <MetricCard label="Anonymous" value={data.summary?.anonymous} color="var(--text-muted)" />
            <MetricCard label="Premium" value={data.summary?.premium} color="var(--accent)" />
          </div>

          {data.users && data.users.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <h3>User Table</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.users.length} shown (sorted by activity)</span>
              </div>
              <div className="panel-body" style={{ maxHeight: 600, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Owner ID</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Provider</th>
                      <th>Subscription</th>
                      <th>Total Moments</th>
                      <th>Today</th>
                      <th>Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.ownerId}>
                        <td className="mono" style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.ownerId}</td>
                        <td>{u.name || '—'}</td>
                        <td className="mono" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.email || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td>
                          <span className={`status-badge ${u.provider === 'google' ? 'healthy' : u.provider === 'email' ? 'degraded' : 'critical'}`}>
                            <span className="dot" />
                            {u.provider || 'anonymous'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${
                            u.subscription === 'active' ? 'healthy' :
                            u.subscription === 'grace_period' ? 'degraded' :
                            'critical'
                          }`}>
                            <span className="dot" />
                            {u.subscription}
                          </span>
                        </td>
                        <td className="mono">{u.momentCount}</td>
                        <td className="mono" style={{ color: u.todayMoments > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                          {u.todayMoments}
                        </td>
                        <td className="mono">{formatDateTime(u.createdAt)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}
