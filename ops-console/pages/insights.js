import Head from 'next/head';
import { useFetch } from '../hooks/useData';
import MetricCard from '../components/MetricCard';
import { formatDateTime } from '../lib/utils';

export default function InsightsPage() {
  const { data, loading, error, refetch } = useFetch('/api/metrics/insights');

  return (
    <>
      <Head><title>Insights — TriggerMap Ops</title></Head>

      <div className="ops-page-header">
        <h2>Insight Pipeline</h2>
        <button className="btn btn-ghost btn-sm" onClick={refetch} disabled={loading}>Refresh</button>
      </div>

      {loading && !data && <div className="spinner">Loading insight metrics...</div>}
      {error && <div style={{ color: 'var(--red)', padding: 16 }}>Error: {error}</div>}

      {data && (
        <>
          <div className="metrics-grid">
            <MetricCard label="Rule-Based Insights" value={data.summary?.ruleBasedInsights} color="var(--cyan)" />
            <MetricCard label="LLM Insights" value={data.summary?.llmInsights} color="var(--accent)" />
            <MetricCard label="Active Free Passes" value={data.summary?.activeFreePass} color="var(--yellow)" />
            <MetricCard
              label="Rule Coverage"
              value={`${data.summary?.coveragePercent}%`}
              sub={`of ${data.summary?.sampled} sampled users`}
            />
            <MetricCard
              label="LLM Coverage"
              value={`${data.summary?.llmCoveragePercent}%`}
            />
          </div>

          {/* Action Engine Metrics */}
          {data.actionEngine && (
            <div className="panel">
              <div className="panel-header"><h3>Action Engine (HiTL)</h3></div>
              <div className="panel-body">
                <div className="metrics-grid">
                  <MetricCard label="Users with Actions" value={data.actionEngine.usersWithActions} color="var(--cyan, #06b6d4)" />
                  <MetricCard label="Actions Generated" value={data.actionEngine.totalActionsGenerated} color="var(--blue)" />
                  <MetricCard label="Feedback Entries" value={data.actionEngine.totalFeedbackEntries} color="var(--accent)" />
                  <MetricCard
                    label="Tried"
                    value={data.actionEngine.triedCount}
                    sub={data.actionEngine.totalFeedbackEntries > 0 ? `${data.actionEngine.triedPercent}%` : undefined}
                    color="var(--green)"
                  />
                  <MetricCard
                    label="Skipped"
                    value={data.actionEngine.skippedCount}
                    sub={data.actionEngine.totalFeedbackEntries > 0 ? `${100 - data.actionEngine.triedPercent}%` : undefined}
                    color="var(--yellow)"
                  />
                </div>
                {data.actionEngine.actionTypeBreakdown && Object.keys(data.actionEngine.actionTypeBreakdown).length > 0 && (
                  <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Action Types</div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                      {Object.entries(data.actionEngine.actionTypeBreakdown)
                        .sort((a, b) => b[1] - a[1])
                        .map(([type, count]) => (
                          <span key={type} style={{
                            fontSize: 12,
                            padding: '3px 10px',
                            borderRadius: 12,
                            background: 'var(--bg-tertiary)',
                            color: 'var(--text-secondary)',
                            fontFamily: 'var(--font-mono)',
                          }}>
                            {type.replace(/_/g, ' ')}: <span style={{ fontWeight: 600 }}>{count}</span>
                          </span>
                        ))
                      }
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Model usage breakdown */}
          {data.insightModels && Object.keys(data.insightModels).length > 0 && (
            <div className="panel">
              <div className="panel-header"><h3>Model Usage</h3></div>
              <div className="panel-body">
                <div className="metrics-grid">
                  {Object.entries(data.insightModels)
                    .sort((a, b) => b[1] - a[1])
                    .map(([model, count]) => (
                      <MetricCard key={model} label={model} value={count} />
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* Recent insights */}
          {data.recentInsights && data.recentInsights.length > 0 && (
            <div className="panel">
              <div className="panel-header">
                <h3>Recent Insight Generations</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.recentInsights.length} shown</span>
              </div>
              <div className="panel-body" style={{ maxHeight: 500, overflowY: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Generated At</th>
                      <th>Owner</th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Type</th>
                      <th>Model</th>
                      <th>Confidence / Sections</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentInsights.map((ins, i) => (
                      <tr key={i}>
                        <td className="mono">{formatDateTime(ins.generatedAt)}</td>
                        <td className="mono" style={{ maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ins.ownerId?.slice(0, 8)}...</td>
                        <td>{ins.name || '—'}</td>
                        <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{ins.email || '—'}</td>
                        <td>
                          <span className={`status-badge ${ins.type === 'llm' ? 'healthy' : 'degraded'}`}>
                            <span className="dot" />
                            {ins.type}
                          </span>
                        </td>
                        <td className="mono">{ins.model}</td>
                        <td className="mono">{ins.confidence || `${ins.sectionCount} sections`}</td>
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
