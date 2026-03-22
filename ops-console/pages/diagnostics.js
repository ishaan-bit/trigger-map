import Head from 'next/head';
import { useFetch } from '../hooks/useData';
import MetricCard from '../components/MetricCard';
import StatusBadge from '../components/StatusBadge';
import DistributionBar from '../components/DistributionBar';
import BarChart from '../components/BarChart';

export default function DiagnosticsPage() {
  const { data: health, loading: loadingHealth, refetch: refetchHealth } = useFetch('/api/diagnostics/health');
  const { data: activity, loading: loadingActivity } = useFetch('/api/diagnostics/activity');

  const isLoading = loadingHealth || loadingActivity;

  return (
    <>
      <Head><title>Diagnostics — TriggerMap Ops</title></Head>

      <div className="ops-page-header">
        <h2>Diagnostics</h2>
        <button className="btn btn-ghost btn-sm" onClick={refetchHealth} disabled={isLoading}>
          Refresh
        </button>
      </div>

      {isLoading && !health && <div className="spinner">Running diagnostics...</div>}

      {/* System Status */}
      {health && (
        <div className="panel">
          <div className="panel-header">
            <h3>System Status</h3>
          </div>
          <div className="panel-body">
            <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Redis</div>
                <StatusBadge status={health.systems?.redis?.status || 'critical'} />
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 4 }}>
                  Latency: {health.systems?.redis?.latencyMs >= 0 ? `${health.systems.redis.latencyMs}ms` : 'N/A'}
                </div>
                {health.systems?.redis?.error && (
                  <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{health.systems.redis.error}</div>
                )}
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Backend API</div>
                <StatusBadge status={health.systems?.backend?.status || 'critical'} />
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 4 }}>
                  HTTP {health.systems?.backend?.statusCode || '—'}
                </div>
                {health.systems?.backend?.error && (
                  <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{health.systems.backend.error}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Anomalies */}
      {health?.anomalies && health.anomalies.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h3>Anomalies</h3>
            <span style={{ fontSize: 12, color: 'var(--yellow)' }}>{health.anomalies.length} detected</span>
          </div>
          <div className="panel-body">
            {health.anomalies.map((a, i) => (
              <div key={i} className={`anomaly-item ${a.type === 'activity_decline' ? 'critical' : ''}`}>
                <div className="type">{a.type.replace(/_/g, ' ')}</div>
                <div className="message">{a.message}</div>
                {a.ownerId && <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 2 }}>Owner: {a.ownerId}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {health?.anomalies && health.anomalies.length === 0 && (
        <div className="panel">
          <div className="panel-body" style={{ color: 'var(--green)', textAlign: 'center', padding: 24 }}>
            No anomalies detected
          </div>
        </div>
      )}

      {/* Data Quality */}
      {health?.dataQuality && (
        <div className="panel">
          <div className="panel-header"><h3>Data Quality</h3></div>
          <div className="panel-body">
            <div className="metrics-grid">
              <MetricCard label="Empty Moment Lists" value={health.dataQuality.emptyMomentLists} />
              <MetricCard label="High Volume Users" value={health.dataQuality.highVolumeUsers} />
              <MetricCard label="Zero Today Activity" value={health.dataQuality.zeroTodayActivity} />
            </div>
          </div>
        </div>
      )}

      {/* Behavioral Distributions */}
      {activity && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div className="panel">
              <div className="panel-header"><h3>Trigger Distribution (Recent)</h3></div>
              <div className="panel-body">
                <DistributionBar data={activity.triggerDistribution} />
              </div>
            </div>
            <div className="panel">
              <div className="panel-header"><h3>Emotion Distribution (Recent)</h3></div>
              <div className="panel-body">
                <DistributionBar data={activity.emotionDistribution} />
              </div>
            </div>
          </div>

          {/* Logging Hour Distribution */}
          {activity.hourDistribution && Object.keys(activity.hourDistribution).length > 0 && (
            <div className="panel">
              <div className="panel-header"><h3>Logging Time Distribution (UTC)</h3></div>
              <div className="panel-body">
                <BarChart
                  data={Array.from({ length: 24 }, (_, h) => ({
                    hour: String(h).padStart(2, '0'),
                    count: activity.hourDistribution[h] || 0,
                  }))}
                  labelKey="hour"
                  valueKey="count"
                  maxHeight={60}
                />
              </div>
            </div>
          )}

          {/* Recent Activity Feed */}
          {activity.recentActivity && activity.recentActivity.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <h3>Recent Activity Feed</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Last {activity.recentActivity.length} moments</span>
              </div>
              <div className="panel-body" style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Owner</th>
                      <th>Trigger</th>
                      <th>Emotion</th>
                      <th>Note</th>
                      <th>Tags</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activity.recentActivity.slice(0, 50).map((m, i) => (
                      <tr key={i}>
                        <td className="mono">{m.timestamp ? new Date(m.timestamp).toLocaleString() : '—'}</td>
                        <td className="mono" style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.ownerId?.slice(0, 8)}...</td>
                        <td>{m.trigger || '—'}</td>
                        <td>{m.emotion || '—'}</td>
                        <td>{m.hasNote ? '✓' : '—'}</td>
                        <td>{m.hasTags ? '✓' : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* 7-Day Trend */}
      {health?.weeklyTrend && health.weeklyTrend.length > 0 && (
        <div className="panel">
          <div className="panel-header"><h3>7-Day Moment Trend</h3></div>
          <div className="panel-body">
            <BarChart
              data={health.weeklyTrend.map((d) => ({
                label: d.date.slice(5),
                total: d.total,
              }))}
              labelKey="label"
              valueKey="total"
            />
          </div>
        </div>
      )}
    </>
  );
}
