import Head from 'next/head';
import { useState } from 'react';
import { useFetch } from '../hooks/useData';
import MetricCard from '../components/MetricCard';
import DistributionBar from '../components/DistributionBar';
import TrendChart from '../components/TrendChart';

export default function IntelligencePage() {
  const [includeAnon, setIncludeAnon] = useState(true);
  const { data, loading, error, refetch } = useFetch(`/api/intelligence/kpis?includeAnon=${includeAnon}`);

  return (
    <>
      <Head><title>Intelligence — TriggerMap Ops</title></Head>

      <div className="ops-page-header">
        <h2>KPIs & Product Signals</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <label style={{
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 12,
            color: includeAnon ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer', userSelect: 'none',
          }}>
            <input
              type="checkbox"
              checked={includeAnon}
              onChange={(e) => setIncludeAnon(e.target.checked)}
              style={{ accentColor: 'var(--accent)' }}
            />
            Include anonymous
          </label>
          <button className="btn btn-ghost btn-sm" onClick={refetch} disabled={loading}>Refresh</button>
        </div>
      </div>

      {loading && !data && <div className="spinner">Loading intelligence...</div>}
      {error && <div style={{ color: 'var(--red)', padding: 16 }}>Error: {error}</div>}

      {data?.kpis && (
        <>
          {/* Primary KPIs */}
          <div className="metrics-grid">
            <MetricCard
              label="DAU"
              value={data.kpis.dau}
              sub={`${data.kpis.dauPercent}% of users`}
              color="var(--green)"
            />
            <MetricCard
              label="WAU"
              value={data.kpis.wau}
              sub={`${data.kpis.wauPercent}% of users`}
              color="var(--cyan)"
            />
            <MetricCard
              label="Avg Logging Days / Week"
              value={data.kpis.avgLoggingDays}
              color="var(--accent)"
            />
            <MetricCard
              label="Insight Coverage"
              value={`${data.kpis.insightCoverage}%`}
              sub="Users with weekly report"
            />
            <MetricCard
              label="D1 Retention"
              value={`${data.kpis.retentionD1}%`}
              color={data.kpis.retentionD1 >= 30 ? 'var(--green)' : data.kpis.retentionD1 >= 15 ? 'var(--yellow)' : 'var(--red)'}
            />
            <MetricCard
              label="D7 Retention"
              value={`${data.kpis.retentionD7}%`}
              color={data.kpis.retentionD7 >= 20 ? 'var(--green)' : data.kpis.retentionD7 >= 10 ? 'var(--yellow)' : 'var(--red)'}
            />
          </div>

          {/* ── Growth Trend Charts ── */}
          {data.trends && data.trends.length > 1 && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div className="panel">
                  <div className="panel-header">
                    <h3>Daily Active Users (14d)</h3>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sampled cohort</span>
                  </div>
                  <div className="panel-body">
                    <TrendChart
                      data={data.trends}
                      series={[
                        { key: 'activeUsers', label: 'DAU', color: 'var(--green)' },
                      ]}
                      height={160}
                    />
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <h3>Log Volume (14d)</h3>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total moments per day</span>
                  </div>
                  <div className="panel-body">
                    <TrendChart
                      data={data.trends}
                      series={[
                        { key: 'logs', label: 'Logs', color: 'var(--accent)' },
                      ]}
                      height={160}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div className="panel">
                  <div className="panel-header">
                    <h3>New Signups (14d)</h3>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Users with createdAt in range</span>
                  </div>
                  <div className="panel-body">
                    <TrendChart
                      data={data.trends}
                      series={[
                        { key: 'newUsers', label: 'New Users', color: 'var(--cyan)' },
                      ]}
                      height={160}
                    />
                  </div>
                </div>

                <div className="panel">
                  <div className="panel-header">
                    <h3>Rolling 7-Day Retention (14d)</h3>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>DAU[day] / DAU[day-7] %</span>
                  </div>
                  <div className="panel-body">
                    <TrendChart
                      data={data.trends.filter((d) => d.retention !== null)}
                      series={[
                        { key: 'retention', label: 'Retention %', color: 'var(--yellow)' },
                      ]}
                      height={160}
                    />
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Insight Pipeline KPIs */}
          {data.insightKpis && (
            <div className="panel">
              <div className="panel-header">
                <h3>Insight Pipeline</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>LLM vs Rule-based breakdown</span>
              </div>
              <div className="panel-body">
                <div className="metrics-grid">
                  <MetricCard
                    label="Insight Success Rate"
                    value={`${data.insightKpis.insightSuccessRate}%`}
                    sub="Active users with any insight"
                    color={data.insightKpis.insightSuccessRate >= 50 ? 'var(--green)' : 'var(--yellow)'}
                  />
                  <MetricCard
                    label="LLM Insights"
                    value={data.insightKpis.llmInsightCount}
                    sub={`${data.insightKpis.llmRatio}% of total`}
                    color="var(--accent)"
                  />
                  <MetricCard
                    label="Rule-Based Insights"
                    value={data.insightKpis.ruleInsightCount}
                    sub={`${data.insightKpis.ruleRatio}% of total`}
                    color="var(--cyan)"
                  />
                  <MetricCard
                    label="Insight Coverage"
                    value={`${data.insightKpis.insightCoverage}%`}
                    sub={`${data.insightKpis.usersWithInsight} users`}
                  />
                  {data.insightKpis.avgInsightLatencyMs && (
                    <MetricCard
                      label="Avg Insight Latency"
                      value={data.insightKpis.avgInsightLatencyMs < 3600000
                        ? `${Math.round(data.insightKpis.avgInsightLatencyMs / 60000)}m`
                        : `${(data.insightKpis.avgInsightLatencyMs / 3600000).toFixed(1)}h`}
                      sub="Log → insight generation"
                      color={data.insightKpis.avgInsightLatencyMs < 3600000 ? 'var(--green)' : 'var(--yellow)'}
                    />
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Engagement Depth KPIs */}
          {data.engagementKpis && (
            <div className="panel">
              <div className="panel-header">
                <h3>Engagement Depth</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Behavioral quality signals</span>
              </div>
              <div className="panel-body">
                <div className="metrics-grid">
                  <MetricCard
                    label="Logs / Active User"
                    value={data.engagementKpis.logsPerActiveUser}
                    sub="This week average"
                    color="var(--accent)"
                  />
                  <MetricCard
                    label="Second Log ≤24h"
                    value={`${data.engagementKpis.secondLogRate}%`}
                    sub={`${data.engagementKpis.secondLogWithin24h} users logged 2 consecutive days`}
                    color={data.engagementKpis.secondLogRate >= 30 ? 'var(--green)' : 'var(--yellow)'}
                  />
                  <MetricCard
                    label="Silent Users (3d)"
                    value={data.engagementKpis.silentUsers3d}
                    sub={`${data.engagementKpis.silentRate}% of sampled — no logs in 3 days`}
                    color={data.engagementKpis.silentRate <= 40 ? 'var(--green)' : data.engagementKpis.silentRate <= 65 ? 'var(--yellow)' : 'var(--red)'}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Engagement Cohorts */}
          <div className="panel">
            <div className="panel-header">
              <h3>Engagement Cohorts (Last 7 Days)</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{data.kpis.sampled} users sampled</span>
            </div>
            <div className="panel-body">
              <div className="metrics-grid">
                <MetricCard
                  label="Power Users"
                  value={data.engagement?.powerUsers}
                  sub="5+ days active"
                  color="var(--green)"
                />
                <MetricCard
                  label="Multi-Day Users"
                  value={data.engagement?.multiDayUsers}
                  sub="2-4 days active"
                  color="var(--cyan)"
                />
                <MetricCard
                  label="Single-Day Users"
                  value={data.engagement?.singleDayUsers}
                  sub="1 day active"
                  color="var(--yellow)"
                />
                <MetricCard
                  label="Dormant Users"
                  value={data.engagement?.dormantUsers}
                  sub="0 days active"
                  color={data.engagement?.dormantUsers > data.kpis.sampled * 0.5 ? 'var(--red)' : 'var(--text-muted)'}
                />
              </div>

              {/* Engagement funnel visualization */}
              {data.kpis.sampled > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Engagement funnel</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, height: 32 }}>
                    {[
                      { label: 'Power', value: data.engagement?.powerUsers || 0, color: 'var(--green)' },
                      { label: 'Multi', value: data.engagement?.multiDayUsers || 0, color: 'var(--cyan)' },
                      { label: 'Single', value: data.engagement?.singleDayUsers || 0, color: 'var(--yellow)' },
                      { label: 'Dormant', value: data.engagement?.dormantUsers || 0, color: 'var(--red)' },
                    ].map((seg) => {
                      const pct = data.kpis.sampled > 0 ? (seg.value / data.kpis.sampled) * 100 : 0;
                      if (pct < 1) return null;
                      return (
                        <div
                          key={seg.label}
                          style={{
                            width: `${pct}%`,
                            height: '100%',
                            background: seg.color,
                            borderRadius: 4,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: 10,
                            fontWeight: 600,
                            color: '#000',
                            minWidth: pct > 5 ? 'auto' : 0,
                            overflow: 'hidden',
                          }}
                          title={`${seg.label}: ${seg.value} (${Math.round(pct)}%)`}
                        >
                          {pct > 10 ? `${seg.label} ${Math.round(pct)}%` : ''}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Behavioral Distributions */}
          {data.distributions && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div className="panel">
                <div className="panel-header"><h3>Trigger Distribution (7d)</h3></div>
                <div className="panel-body">
                  <DistributionBar data={data.distributions.triggers} />
                </div>
              </div>
              <div className="panel">
                <div className="panel-header"><h3>Emotion Distribution (7d)</h3></div>
                <div className="panel-body">
                  <DistributionBar data={data.distributions.emotions} />
                </div>
              </div>
            </div>
          )}

          {/* Baseline & Emotional Drift (Fleet-level) */}
          {data.baseline && data.baseline.usersWithBaseline > 0 && (
            <div className="panel">
              <div className="panel-header">
                <h3>Baseline & Emotional Drift</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>From cached weekly reports ({data.baseline.usersWithBaseline} users)</span>
              </div>
              <div className="panel-body">
                <div className="metrics-grid" style={{ marginBottom: 16 }}>
                  <MetricCard
                    label="Avg Baseline"
                    value={data.baseline.avgBaseline != null ? `${data.baseline.avgBaseline}/5` : '—'}
                    sub="Fleet emotional center"
                    color={data.baseline.avgBaseline >= 3.5 ? 'var(--green)' : data.baseline.avgBaseline >= 2.5 ? 'var(--yellow)' : 'var(--red)'}
                  />
                  <MetricCard
                    label="Avg Drift"
                    value={data.baseline.avgDrift != null ? `${data.baseline.avgDrift > 0 ? '+' : ''}${data.baseline.avgDrift}` : '—'}
                    sub="Recent vs baseline"
                    color={data.baseline.avgDrift >= 0 ? 'var(--green)' : 'var(--red)'}
                  />
                  <MetricCard
                    label="Avg Stability"
                    value={data.baseline.avgStability != null ? `${Math.round(data.baseline.avgStability * 100)}%` : '—'}
                    sub="Days near baseline"
                    color={data.baseline.avgStability >= 0.6 ? 'var(--green)' : data.baseline.avgStability >= 0.4 ? 'var(--yellow)' : 'var(--red)'}
                  />
                </div>
                {data.baseline.driftDistribution && (
                  <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                    <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 8, background: 'rgba(52,199,89,0.08)', border: '1px solid rgba(52,199,89,0.2)' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--green)' }}>{data.baseline.driftDistribution.improving}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Improving</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 8, background: 'rgba(155,176,201,0.08)', border: '1px solid rgba(155,176,201,0.2)' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-secondary)' }}>{data.baseline.driftDistribution.stable}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Stable</div>
                    </div>
                    <div style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 8, background: 'rgba(255,107,122,0.08)', border: '1px solid rgba(255,107,122,0.2)' }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--red)' }}>{data.baseline.driftDistribution.declining}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>Declining</div>
                    </div>
                  </div>
                )}
                {data.baseline.stateOfMind && Object.keys(data.baseline.stateOfMind).length > 0 && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>State of Mind Distribution</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {Object.entries(data.baseline.stateOfMind).sort(([, a], [, b]) => b - a).map(([state, count]) => (
                        <span key={state} style={{ fontSize: 12, padding: '4px 10px', borderRadius: 12, background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                          {state} <strong>({count})</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Invoked Behavioral Metrics (Fleet-level) */}
          {data.invokedMetrics && data.invokedMetrics.usersWithData > 0 && (
            <div className="panel">
              <div className="panel-header">
                <h3>Invoked Behavioral Metrics</h3>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {data.invokedMetrics.usersWithData} users with computed metrics
                </span>
              </div>
              <div className="panel-body">
                <div className="metrics-grid" style={{ marginBottom: 16 }}>
                  <MetricCard
                    label="False Recovery"
                    value={data.invokedMetrics.falseRecoveryCount}
                    sub="Users with surface recovery, deeper decline"
                    color={data.invokedMetrics.falseRecoveryCount > 0 ? 'var(--yellow)' : 'var(--green)'}
                  />
                  <MetricCard
                    label="Crash Risk"
                    value={data.invokedMetrics.crashRiskCount}
                    sub="Users on declining vacuum trajectory"
                    color={data.invokedMetrics.crashRiskCount > 0 ? 'var(--red)' : 'var(--green)'}
                  />
                </div>
                {/* Vacuum drift distribution */}
                {data.invokedMetrics.vacuumDrift && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Vacuum Drift Distribution</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {[
                        { label: 'Positive', value: data.invokedMetrics.vacuumDrift.positive, color: 'rgba(52,199,89,0.08)', border: 'rgba(52,199,89,0.2)', text: 'var(--green)' },
                        { label: 'Stable', value: data.invokedMetrics.vacuumDrift.none, color: 'rgba(155,176,201,0.08)', border: 'rgba(155,176,201,0.2)', text: 'var(--text-secondary)' },
                        { label: 'Negative', value: data.invokedMetrics.vacuumDrift.negative, color: 'rgba(255,204,0,0.08)', border: 'rgba(255,204,0,0.2)', text: 'var(--yellow)' },
                        { label: 'Strong ↓', value: data.invokedMetrics.vacuumDrift.strong_negative, color: 'rgba(255,107,122,0.08)', border: 'rgba(255,107,122,0.2)', text: 'var(--red)' },
                      ].map((seg) => (
                        <div key={seg.label} style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 8, background: seg.color, border: `1px solid ${seg.border}` }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: seg.text }}>{seg.value}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{seg.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* Masking level distribution */}
                {data.invokedMetrics.maskingLevel && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>Behavioral Masking Levels</div>
                    <div style={{ display: 'flex', gap: 12 }}>
                      {[
                        { label: 'None', value: data.invokedMetrics.maskingLevel.none, color: 'var(--green)' },
                        { label: 'Low', value: data.invokedMetrics.maskingLevel.low, color: 'var(--cyan)' },
                        { label: 'Moderate', value: data.invokedMetrics.maskingLevel.moderate, color: 'var(--yellow)' },
                        { label: 'High', value: data.invokedMetrics.maskingLevel.high, color: 'var(--red)' },
                      ].map((seg) => (
                        <div key={seg.label} style={{ flex: 1, textAlign: 'center', padding: 12, borderRadius: 8, background: 'var(--bg-tertiary)', border: '1px solid var(--border)' }}>
                          <div style={{ fontSize: 20, fontWeight: 700, color: seg.color }}>{seg.value}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{seg.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Product Health Signals */}
          <div className="panel">
            <div className="panel-header"><h3>Product Health Assessment</h3></div>
            <div className="panel-body">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Signal</th>
                    <th>Status</th>
                    <th>Value</th>
                    <th>Assessment</th>
                  </tr>
                </thead>
                <tbody>
                  <SignalRow
                    label="User Engagement"
                    value={`${data.kpis.wauPercent}% WAU`}
                    status={data.kpis.wauPercent >= 40 ? 'healthy' : data.kpis.wauPercent >= 20 ? 'degraded' : 'critical'}
                    assessment={data.kpis.wauPercent >= 40 ? 'Strong weekly engagement' : data.kpis.wauPercent >= 20 ? 'Moderate — room for improvement' : 'Low engagement — investigate'}
                  />
                  <SignalRow
                    label="Retention"
                    value={`D1: ${data.kpis.retentionD1}%, D7: ${data.kpis.retentionD7}%`}
                    status={data.kpis.retentionD7 >= 20 ? 'healthy' : data.kpis.retentionD7 >= 10 ? 'degraded' : 'critical'}
                    assessment={data.kpis.retentionD7 >= 20 ? 'Users are returning' : data.kpis.retentionD7 >= 10 ? 'Some return behavior' : 'Poor retention — core loop may be weak'}
                  />
                  <SignalRow
                    label="Insight Pipeline"
                    value={`${data.kpis.insightCoverage}% coverage`}
                    status={data.kpis.insightCoverage >= 50 ? 'healthy' : data.kpis.insightCoverage >= 25 ? 'degraded' : 'critical'}
                    assessment={data.kpis.insightCoverage >= 50 ? 'Insights reaching most users' : data.kpis.insightCoverage >= 25 ? 'Partial coverage' : 'Many users lack insights'}
                  />
                  <SignalRow
                    label="Logging Depth"
                    value={`${data.kpis.avgLoggingDays} days/week avg`}
                    status={data.kpis.avgLoggingDays >= 3 ? 'healthy' : data.kpis.avgLoggingDays >= 1.5 ? 'degraded' : 'critical'}
                    assessment={data.kpis.avgLoggingDays >= 3 ? 'Users forming logging habit' : data.kpis.avgLoggingDays >= 1.5 ? 'Sporadic usage' : 'Very low logging frequency'}
                  />
                  <SignalRow
                    label="Dormancy Risk"
                    value={`${data.engagement?.dormantUsers || 0} dormant`}
                    status={
                      data.kpis.sampled > 0 && (data.engagement?.dormantUsers || 0) / data.kpis.sampled < 0.3
                        ? 'healthy'
                        : (data.engagement?.dormantUsers || 0) / data.kpis.sampled < 0.6
                          ? 'degraded'
                          : 'critical'
                    }
                    assessment={
                      data.kpis.sampled > 0 && (data.engagement?.dormantUsers || 0) / data.kpis.sampled < 0.3
                        ? 'Low dormancy'
                        : (data.engagement?.dormantUsers || 0) / data.kpis.sampled < 0.6
                          ? 'Significant dormancy — consider re-engagement'
                          : 'High dormancy — critical churn risk'
                    }
                  />
                  {data.baseline?.usersWithBaseline > 0 && (
                    <SignalRow
                      label="Emotional Health"
                      value={`${data.baseline.avgBaseline}/5 avg baseline`}
                      status={data.baseline.avgBaseline >= 3.2 ? 'healthy' : data.baseline.avgBaseline >= 2.5 ? 'degraded' : 'critical'}
                      assessment={
                        data.baseline.avgDrift >= 0
                          ? `Fleet trending stable/positive (drift ${data.baseline.avgDrift > 0 ? '+' : ''}${data.baseline.avgDrift})`
                          : `Fleet drifting negative (${data.baseline.avgDrift}) — monitor closely`
                      }
                    />
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

function SignalRow({ label, value, status, assessment }) {
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{label}</td>
      <td>
        <span className={`status-badge ${status}`}>
          <span className="dot" />
          {status}
        </span>
      </td>
      <td className="mono">{value}</td>
      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{assessment}</td>
    </tr>
  );
}
