import Head from 'next/head';
import { useFetch } from '../hooks/useData';
import MetricCard from '../components/MetricCard';
import StatusBadge from '../components/StatusBadge';
import BarChart from '../components/BarChart';

export default function DashboardPage() {
  const { data: overview, loading: loadingOverview, error: errorOverview, refetch: refetchOverview } = useFetch('/api/metrics/overview');
  const { data: health, loading: loadingHealth } = useFetch('/api/diagnostics/health');

  const isLoading = loadingOverview || loadingHealth;

  return (
    <>
      <Head><title>Dashboard — TriggerMap Ops</title></Head>

      <div className="ops-page-header">
        <h2>System Overview</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {overview && <span className="timestamp">Updated: {new Date(overview.timestamp).toLocaleTimeString()}</span>}
          <button className="btn btn-ghost btn-sm" onClick={refetchOverview} disabled={isLoading}>
            Refresh
          </button>
        </div>
      </div>

      {/* System Health */}
      {health && (
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="panel-header">
            <h3>System Health</h3>
          </div>
          <div className="panel-body" style={{ display: 'flex', gap: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Redis</span>
              <StatusBadge status={health.systems?.redis?.status || 'critical'} />
              {health.systems?.redis?.latencyMs >= 0 && (
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                  {health.systems.redis.latencyMs}ms
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Backend API</span>
              <StatusBadge status={health.systems?.backend?.status || 'critical'} />
            </div>
          </div>
        </div>
      )}

      {isLoading && !overview && <div className="spinner">Loading dashboard...</div>}
      {errorOverview && <div style={{ color: 'var(--red)', padding: 16 }}>Error: {errorOverview}</div>}

      {/* Core Metrics */}
      {overview && (
        <>
          <div className="metrics-grid">
            <MetricCard
              label="Total Users"
              value={overview.users?.total}
              sub={`${overview.users?.sampled} sampled`}
            />
            <MetricCard
              label="Active Today"
              value={overview.users?.activeToday}
              delta={overview.users?.activeYesterday > 0
                ? Math.round(((overview.users.activeToday - overview.users.activeYesterday) / overview.users.activeYesterday) * 100)
                : null}
              deltaLabel="vs yesterday"
              color={overview.users?.activeToday > 0 ? 'var(--green)' : 'var(--text-muted)'}
            />
            <MetricCard
              label="Authenticated"
              value={overview.users?.authenticated}
              color="var(--cyan)"
            />
            <MetricCard
              label="Anonymous"
              value={overview.users?.anonymous}
              color="var(--text-muted)"
            />
            <MetricCard
              label="Moments Today"
              value={overview.moments?.today}
              delta={overview.moments?.deltaPercent}
              deltaLabel="vs yesterday"
            />
            <MetricCard
              label="Total Moments"
              value={overview.moments?.total}
            />
            <MetricCard
              label="Redis Keys"
              value={overview.totalKeys}
            />
          </div>

          {/* Weekly Trend */}
          {overview.weeklyTrend && overview.weeklyTrend.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <h3>7-Day Activity Trend</h3>
              </div>
              <div className="panel-body">
                <div style={{ display: 'flex', gap: 32 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Moments per day</div>
                    <BarChart
                      data={overview.weeklyTrend.map((d) => ({
                        ...d,
                        shortDate: d.date.slice(5),
                      }))}
                      labelKey="shortDate"
                      valueKey="moments"
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Active users per day</div>
                    <BarChart
                      data={overview.weeklyTrend.map((d) => ({
                        ...d,
                        shortDate: d.date.slice(5),
                      }))}
                      labelKey="shortDate"
                      valueKey="activeUsers"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Anomalies */}
      {health?.anomalies && health.anomalies.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h3>Anomalies & Warnings</h3>
            <span style={{ fontSize: 12, color: 'var(--yellow)' }}>{health.anomalies.length} detected</span>
          </div>
          <div className="panel-body">
            {health.anomalies.map((a, i) => (
              <div key={i} className={`anomaly-item ${a.type === 'activity_decline' ? 'critical' : ''}`}>
                <div className="type">{a.type.replace(/_/g, ' ')}</div>
                <div className="message">{a.message}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Quality */}
      {health?.dataQuality && (
        <div className="panel">
          <div className="panel-header">
            <h3>Data Quality</h3>
          </div>
          <div className="panel-body">
            <div className="metrics-grid">
              <MetricCard label="Empty Moment Lists" value={health.dataQuality.emptyMomentLists} color={health.dataQuality.emptyMomentLists > 5 ? 'var(--yellow)' : 'var(--text-primary)'} />
              <MetricCard label="High Volume Users" value={health.dataQuality.highVolumeUsers} color={health.dataQuality.highVolumeUsers > 0 ? 'var(--orange)' : 'var(--text-primary)'} />
              <MetricCard label="Zero Activity Today" value={health.dataQuality.zeroTodayActivity} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
