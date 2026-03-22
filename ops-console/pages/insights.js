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
