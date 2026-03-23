import Head from 'next/head';
import { useState } from 'react';
import { useFetch } from '../hooks/useData';
import MetricCard from '../components/MetricCard';
import StatusBadge from '../components/StatusBadge';
import DistributionBar from '../components/DistributionBar';
import BarChart from '../components/BarChart';
import { timeAgo } from '../lib/utils';

function SeverityDot({ severity }) {
  const color = severity === 'critical' ? 'var(--red)' : severity === 'warn' ? 'var(--yellow)' : 'var(--blue)';
  return <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, marginRight: 8, flexShrink: 0 }} />;
}

function EnvCheck({ name, ok }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontFamily: 'var(--font-mono)', padding: '3px 0' }}>
      <span style={{ color: ok ? 'var(--green)' : 'var(--red)' }}>{ok ? '✓' : '✗'}</span>
      <span style={{ color: ok ? 'var(--text-secondary)' : 'var(--red)' }}>{name}</span>
    </div>
  );
}

function CoverageBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span>{label}</span>
        <span className="mono">{count}/{total} ({pct}%)</span>
      </div>
      <div style={{ background: 'var(--bg-tertiary)', borderRadius: 4, height: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color || 'var(--blue)', borderRadius: 4, transition: 'width 0.3s' }} />
      </div>
    </div>
  );
}

function CrashLogEntry({ log, defaultOpen }) {
  const [expanded, setExpanded] = useState(defaultOpen);

  return (
    <div style={{
      border: '1px solid rgba(239, 68, 68, 0.2)',
      borderRadius: 8,
      overflow: 'hidden',
      background: 'rgba(239, 68, 68, 0.03)',
      marginBottom: 8,
    }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: 'var(--red)', boxShadow: '0 0 6px var(--red)',
        }} />
        <span style={{ fontWeight: 600, fontSize: 13, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {log.message}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {log.platform && (
            <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 8, background: 'rgba(99, 102, 241, 0.12)', color: '#818cf8', textTransform: 'uppercase' }}>
              {log.platform}
            </span>
          )}
          {log.appVersion && (
            <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
              v{log.appVersion}
            </span>
          )}
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {log.timestamp ? timeAgo(log.timestamp) : '—'}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
            &#9654;
          </span>
        </div>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px' }}>
          {log.screen && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
              <span style={{ fontWeight: 600 }}>Screen:</span> {log.screen}
            </div>
          )}
          {log.deviceId && (
            <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginBottom: 8 }}>
              Device: {log.deviceId.slice(0, 12)}...
            </div>
          )}
          {log.stack && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Stack Trace</div>
              <pre style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--red)',
                background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 240, overflowY: 'auto', margin: 0,
              }}>
                {log.stack}
              </pre>
            </div>
          )}
          {log.componentStack && (
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Component Stack</div>
              <pre style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--yellow)',
                background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflowY: 'auto', margin: 0,
              }}>
                {log.componentStack}
              </pre>
            </div>
          )}
          {log.extra && (
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>Extra Context</div>
              <pre style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
                background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 120, overflowY: 'auto', margin: 0,
              }}>
                {log.extra}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DiagnosticsPage() {
  const { data: health, loading: loadingHealth, refetch: refetchHealth } = useFetch('/api/diagnostics/health');
  const { data: activity, loading: loadingActivity } = useFetch('/api/diagnostics/activity');
  const { data: crashData, loading: loadingCrash, refetch: refetchCrash } = useFetch('/api/diagnostics/crash-logs');

  const isLoading = loadingHealth || loadingActivity;

  const overallStatus = health ? (
    health.systems?.redis?.status === 'healthy' &&
    health.systems?.backend?.status === 'healthy'
      ? (health.systems?.worker?.status === 'healthy' ? 'All Systems Operational' : 'Core Systems Operational')
      : 'Issues Detected'
  ) : null;

  return (
    <>
      <Head><title>Diagnostics — TriggerMap Ops</title></Head>

      <div className="ops-page-header">
        <h2>Diagnostics</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {health?.checkedAt && (
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              Checked {timeAgo(health.checkedAt)} · {health.durationMs}ms
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={refetchHealth} disabled={isLoading}>
            {isLoading ? 'Running...' : 'Refresh'}
          </button>
        </div>
      </div>

      {isLoading && !health && <div className="spinner">Running diagnostics...</div>}

      {/* Overall Status Banner */}
      {overallStatus && (
        <div style={{
          padding: '12px 20px',
          borderRadius: 8,
          marginBottom: 24,
          background: overallStatus === 'All Systems Operational' ? 'rgba(52,199,89,0.1)' : overallStatus === 'Core Systems Operational' ? 'rgba(255,204,0,0.1)' : 'rgba(255,59,48,0.1)',
          border: `1px solid ${overallStatus === 'All Systems Operational' ? 'var(--green)' : overallStatus === 'Core Systems Operational' ? 'var(--yellow)' : 'var(--red)'}`,
          color: overallStatus === 'All Systems Operational' ? 'var(--green)' : overallStatus === 'Core Systems Operational' ? 'var(--yellow)' : 'var(--red)',
          fontWeight: 600,
          fontSize: 14,
          textAlign: 'center',
        }}>
          {overallStatus === 'All Systems Operational' ? '● ' : overallStatus === 'Core Systems Operational' ? '◐ ' : '○ '}
          {overallStatus}
        </div>
      )}

      {/* System Status */}
      {health && (
        <div className="panel">
          <div className="panel-header">
            <h3>System Status</h3>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>4 services</span>
          </div>
          <div className="panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
              {/* Redis */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Redis</div>
                <StatusBadge status={health.systems?.redis?.status || 'critical'} />
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 4 }}>
                  Latency: {health.systems?.redis?.latencyMs >= 0 ? `${health.systems.redis.latencyMs}ms` : 'N/A'}
                </div>
                {health.redis?.totalKeys != null && (
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 2 }}>
                    Keys: {health.redis.totalKeys.toLocaleString()}
                  </div>
                )}
                {health.systems?.redis?.error && (
                  <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{health.systems.redis.error}</div>
                )}
              </div>

              {/* Backend */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Backend API</div>
                <StatusBadge status={health.systems?.backend?.status || 'critical'} />
                <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 4 }}>
                  HTTP {health.systems?.backend?.statusCode || '—'}
                </div>
                {health.systems?.backend?.envReport && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                    {Object.entries(health.systems.backend.envReport).filter(([,v]) => !v).map(([k]) => (
                      <div key={k} style={{ color: 'var(--yellow)' }}>⚠ {k.replace('Configured', '')}</div>
                    ))}
                  </div>
                )}
                {health.systems?.backend?.error && (
                  <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 4 }}>{health.systems.backend.error}</div>
                )}
              </div>

              {/* Worker */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Local Worker</div>
                <StatusBadge status={health.systems?.worker?.status || 'offline'} />
                {health.systems?.worker?.uptime != null && (
                  <div style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 4 }}>
                    Uptime: {formatUptime(health.systems.worker.uptime)}
                  </div>
                )}
                {health.systems?.worker?.activeJobs?.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--yellow)', marginTop: 4 }}>
                    {health.systems.worker.activeJobs.length} job(s) running
                  </div>
                )}
              </div>

              {/* Ollama */}
              <div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Ollama LLM</div>
                <StatusBadge status={health.systems?.ollama?.status || 'offline'} />
                {health.systems?.ollama?.models?.length > 0 && (
                  <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.5 }}>
                    {health.systems.ollama.models.map((m, i) => (
                      <div key={i}>{m}</div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Environment Config */}
      {health?.environment && (
        <div className="panel">
          <div className="panel-header">
            <h3>Environment Config</h3>
            {health.environment.missing.length > 0 ? (
              <span style={{ fontSize: 12, color: 'var(--red)' }}>{health.environment.missing.length} missing</span>
            ) : (
              <span style={{ fontSize: 12, color: 'var(--green)' }}>All set</span>
            )}
          </div>
          <div className="panel-body">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0 24px' }}>
              {Object.entries(health.environment.checks).map(([name, ok]) => (
                <EnvCheck key={name} name={name} ok={ok} />
              ))}
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
              <div key={i} style={{
                display: 'flex', alignItems: 'flex-start', padding: '8px 0',
                borderBottom: i < health.anomalies.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <SeverityDot severity={a.severity} />
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 2 }}>
                    <span style={{
                      fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                      color: a.severity === 'critical' ? 'var(--red)' : a.severity === 'warn' ? 'var(--yellow)' : 'var(--blue)',
                    }}>
                      {a.type.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <div style={{ fontSize: 13 }}>{a.message}</div>
                  {a.ownerId && (
                    <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', marginTop: 2 }}>
                      Owner: {a.ownerId}
                    </div>
                  )}
                </div>
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

      {/* Coverage & Data Quality */}
      {health && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          {/* Coverage Stats */}
          <div className="panel">
            <div className="panel-header">
              <h3>Coverage</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {health.totalUsers} users ({health.sampleSize} sampled)
              </span>
            </div>
            <div className="panel-body">
              <CoverageBar
                label="LLM Insights"
                count={health.coverage?.llmInsights?.hasInsight || 0}
                total={health.sampleSize}
                color="var(--blue)"
              />
              <CoverageBar
                label="Weekly Reports"
                count={health.coverage?.weeklyReports?.hasReport || 0}
                total={health.sampleSize}
                color="var(--purple, #a855f7)"
              />
              <CoverageBar
                label="Premium Subscriptions"
                count={health.coverage?.subscriptions?.premium || 0}
                total={health.sampleSize}
                color="var(--green)"
              />
              <CoverageBar
                label="Action Feedback (HiTL)"
                count={health.coverage?.actionFeedback?.usersWithFeedback || 0}
                total={health.sampleSize}
                color="var(--cyan, #06b6d4)"
              />
              {(health.coverage?.llmInsights?.staleInsight > 0 || health.coverage?.weeklyReports?.staleReport > 0) && (
                <div style={{ fontSize: 12, color: 'var(--yellow)', marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  {health.coverage.llmInsights.staleInsight > 0 && (
                    <div>⚠ {health.coverage.llmInsights.staleInsight} stale insight(s) (&gt;8 days)</div>
                  )}
                  {health.coverage.weeklyReports.staleReport > 0 && (
                    <div>⚠ {health.coverage.weeklyReports.staleReport} stale report(s) (&gt;8 days)</div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Data Quality */}
          <div className="panel">
            <div className="panel-header"><h3>Data Quality</h3></div>
            <div className="panel-body">
              <div className="metrics-grid">
                <MetricCard label="Empty Moment Lists" value={health.dataQuality?.emptyMomentLists} color={health.dataQuality?.emptyMomentLists > 0 ? 'var(--yellow)' : undefined} />
                <MetricCard label="High Volume Users" value={health.dataQuality?.highVolumeUsers} color={health.dataQuality?.highVolumeUsers > 0 ? 'var(--red)' : undefined} />
                <MetricCard label="Zero Today Activity" value={health.dataQuality?.zeroTodayActivity} />
              </div>
              {/* Subscription breakdown */}
              {health.coverage?.subscriptions && (
                <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Subscription Breakdown</div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                    <span><span style={{ color: 'var(--green)' }}>●</span> Premium: {health.coverage.subscriptions.premium}</span>
                    <span><span style={{ color: 'var(--text-muted)' }}>●</span> None: {health.coverage.subscriptions.none}</span>
                    {health.coverage.subscriptions.expired > 0 && (
                      <span><span style={{ color: 'var(--red)' }}>●</span> Expired: {health.coverage.subscriptions.expired}</span>
                    )}
                    {health.coverage.subscriptions.gracePeriod > 0 && (
                      <span><span style={{ color: 'var(--yellow)' }}>●</span> Grace: {health.coverage.subscriptions.gracePeriod}</span>
                    )}
                    {health.coverage.subscriptions.cancelled > 0 && (
                      <span><span style={{ color: 'var(--red)' }}>●</span> Cancelled: {health.coverage.subscriptions.cancelled}</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Crash Logs */}
      {crashData && (
        <div className="panel">
          <div className="panel-header">
            <h3>Crash Logs</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {crashData.total > 0 && (
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--red)' }}>
                  {crashData.total} report{crashData.total !== 1 ? 's' : ''}
                </span>
              )}
              <button className="btn btn-ghost btn-sm" onClick={refetchCrash} disabled={loadingCrash}>
                {loadingCrash ? '...' : 'Refresh'}
              </button>
            </div>
          </div>
          <div className="panel-body">
            {(!crashData.logs || crashData.logs.length === 0) ? (
              <div style={{ color: 'var(--green)', textAlign: 'center', padding: 16 }}>
                No crash reports
              </div>
            ) : (
              <div style={{ maxHeight: 500, overflowY: 'auto' }}>
                {crashData.logs.map((log, i) => (
                  <CrashLogEntry key={i} log={log} defaultOpen={i === 0} />
                ))}
              </div>
            )}
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
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Last {Math.min(activity.recentActivity.length, 50)} moments</span>
              </div>
              <div className="panel-body" style={{ maxHeight: 400, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Owner</th>
                      <th>Name</th>
                      <th>Email</th>
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
                        <td>{m.name || '—'}</td>
                        <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email || '—'}</td>
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

function formatUptime(seconds) {
  if (!seconds || seconds < 0) return 'N/A';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
  return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h`;
}
