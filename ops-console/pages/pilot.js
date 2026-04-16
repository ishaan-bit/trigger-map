import Head from 'next/head';
import { useState } from 'react';
import { useFetch } from '../hooks/useData';
import MetricCard from '../components/MetricCard';
import TrendChart from '../components/TrendChart';
import DistributionBar from '../components/DistributionBar';
import StatusBadge from '../components/StatusBadge';

/* ── Helpers ──────────────────────────────────────────────── */

function Section({ title, subtitle, children }) {
  return (
    <div className="pilot-section">
      <div className="pilot-section-header">
        <h3>{title}</h3>
        {subtitle && <span className="pilot-section-sub">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

function GateRow({ check }) {
  const pct = check.total > 0 ? Math.round((check.value / check.total) * 100) : 0;
  const passed = pct >= check.target;
  const status = passed ? 'healthy' : pct >= check.target * 0.5 ? 'degraded' : 'critical';
  return (
    <div className="gate-row">
      <div className="gate-status">
        <StatusBadge status={status} />
      </div>
      <div className="gate-info">
        <div className="gate-label">{check.label}</div>
        <div className="gate-detail">
          {check.value} / {check.total} ({pct}%)
          <span className="gate-target">target {check.target}%</span>
        </div>
      </div>
      <div className="gate-bar-track">
        <div
          className="gate-bar-fill"
          style={{
            width: `${Math.min(pct, 100)}%`,
            background: status === 'healthy' ? 'var(--green)' : status === 'degraded' ? 'var(--yellow)' : 'var(--red)',
          }}
        />
        <div className="gate-bar-target" style={{ left: `${check.target}%` }} />
      </div>
      <div className="gate-verdict" style={{ color: passed ? 'var(--green)' : 'var(--red)' }}>
        {passed ? 'PASS' : 'MISS'}
      </div>
    </div>
  );
}

function VerdictBanner({ score, passing, total }) {
  const level = score >= 70 ? 'strong' : score >= 40 ? 'moderate' : 'weak';
  const color = level === 'strong' ? 'var(--green)' : level === 'moderate' ? 'var(--yellow)' : 'var(--red)';
  const bgColor = level === 'strong' ? 'rgba(34,197,94,0.08)' : level === 'moderate' ? 'rgba(234,179,8,0.08)' : 'rgba(239,68,68,0.08)';
  const verdict = level === 'strong' ? 'PILOT ON TRACK' : level === 'moderate' ? 'PILOT NEEDS ATTENTION' : 'PILOT AT RISK';

  return (
    <div className="verdict-banner" style={{ background: bgColor, borderLeft: `4px solid ${color}` }}>
      <div className="verdict-score" style={{ color }}>
        <div className="verdict-number">{score}%</div>
        <div className="verdict-label">Pilot Health</div>
      </div>
      <div className="verdict-detail">
        <div className="verdict-title" style={{ color }}>{verdict}</div>
        <div className="verdict-sub">{passing} of {total} validation gates passing</div>
      </div>
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────── */

export default function PilotPage() {
  const [includeAnon, setIncludeAnon] = useState(true);
  const qs = `?includeAnon=${includeAnon}`;
  const { data: pilot, loading: l1, error: e1, refetch: r1 } = useFetch(`/api/pilot/validation${qs}`);
  const { data: intel, loading: l2, error: e2, refetch: r2 } = useFetch(`/api/intelligence/kpis${qs}`);

  const loading = (l1 && !pilot) || (l2 && !intel);
  const error = e1 || e2;
  const refetch = () => { r1(); r2(); };

  const overallScore = pilot?.checks
    ? Math.round(pilot.checks.filter(c => c.total > 0 && (c.value / c.total * 100) >= c.target).length / pilot.checks.length * 100)
    : null;
  const passing = pilot?.checks?.filter(c => c.total > 0 && (c.value / c.total * 100) >= c.target).length ?? 0;
  const totalGates = pilot?.checks?.length ?? 0;

  const reportDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <Head><title>Pilot Validation Report — TriggerMap Ops</title></Head>

      {/* ── Report Header ── */}
      <div className="pilot-report-header">
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700 }}>Pilot Validation Report</h2>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
            TriggerMap — Proof of Concept Assessment
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, fontFamily: 'var(--font-mono)' }}>
            {reportDate} · 14-day analysis window
          </div>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
          {pilot && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginRight: 4 }}>
              {pilot.authenticatedUsers ?? '?'} auth · {pilot.anonymousUsers ?? '?'} anon
            </span>
          )}
          <button className="btn btn-ghost btn-sm" onClick={refetch} disabled={l1 || l2}>Refresh</button>
          <button className="btn btn-primary btn-sm" onClick={() => window.print()}>Export PDF</button>
        </div>
      </div>

      {loading && <div className="spinner">Loading pilot validation data...</div>}
      {error && <div style={{ color: 'var(--red)', padding: 16 }}>Error: {error}</div>}

      {pilot && (
        <>
          {/* ── 1. Executive Summary ── */}
          <VerdictBanner score={overallScore ?? 0} passing={passing} total={totalGates} />

          <div className="metrics-grid" style={{ marginTop: 20 }}>
            <MetricCard label="Total Users" value={pilot.totalUsers} color="var(--accent)" />
            <MetricCard label="Total Moments Logged" value={pilot.totalMoments} color="var(--green)" />
            <MetricCard label="Avg Moments / User" value={pilot.avgMoments} color="var(--cyan)" />
            <MetricCard label="Median Weekly" value={pilot.medianWeeklyMoments} color="var(--purple)" />
            {intel?.kpis && (
              <>
                <MetricCard
                  label="DAU"
                  value={intel.kpis.dau}
                  sub={`${intel.kpis.dauPercent}% of users`}
                  color="var(--green)"
                />
                <MetricCard
                  label="WAU"
                  value={intel.kpis.wau}
                  sub={`${intel.kpis.wauPercent}% of users`}
                  color="var(--cyan)"
                />
              </>
            )}
          </div>

          {/* ── 2. Retention & Engagement KPIs ── */}
          {intel?.kpis && (
            <Section title="Retention & Engagement" subtitle="Core engagement health indicators">
              <div className="metrics-grid">
                <MetricCard
                  label="D1 Retention"
                  value={`${intel.kpis.retentionD1}%`}
                  color={intel.kpis.retentionD1 >= 30 ? 'var(--green)' : intel.kpis.retentionD1 >= 15 ? 'var(--yellow)' : 'var(--red)'}
                  sub="Users active today"
                />
                <MetricCard
                  label="D7 Retention"
                  value={`${intel.kpis.retentionD7}%`}
                  color={intel.kpis.retentionD7 >= 20 ? 'var(--green)' : intel.kpis.retentionD7 >= 10 ? 'var(--yellow)' : 'var(--red)'}
                  sub="Users active 7 days ago"
                />
                <MetricCard
                  label="Avg Logging Days / Wk"
                  value={intel.kpis.avgLoggingDays}
                  color="var(--accent)"
                />
                <MetricCard
                  label="Insight Coverage"
                  value={`${intel.kpis.insightCoverage}%`}
                  sub="Users with weekly report"
                  color={intel.kpis.insightCoverage >= 40 ? 'var(--green)' : 'var(--yellow)'}
                />
              </div>

              {intel.engagementKpis && (
                <div className="metrics-grid" style={{ marginTop: 0 }}>
                  <MetricCard
                    label="Logs / Active User"
                    value={intel.engagementKpis.logsPerActiveUser}
                    color="var(--accent)"
                    sub="Weekly average"
                  />
                  <MetricCard
                    label="2nd-Log Rate"
                    value={`${intel.engagementKpis.secondLogRate}%`}
                    sub={`${intel.engagementKpis.secondLogWithin24h} users returned within 24h`}
                    color={intel.engagementKpis.secondLogRate >= 30 ? 'var(--green)' : 'var(--yellow)'}
                  />
                  <MetricCard
                    label="Silent (3d)"
                    value={intel.engagementKpis.silentUsers3d}
                    sub={`${intel.engagementKpis.silentRate}% of users`}
                    color={intel.engagementKpis.silentRate <= 30 ? 'var(--green)' : 'var(--red)'}
                  />
                </div>
              )}

              {intel.engagement && (
                <div className="panel" style={{ marginTop: 16 }}>
                  <div className="panel-header"><h3>Engagement Tiers</h3></div>
                  <div className="panel-body">
                    <DistributionBar data={{
                      [`Power Users (5+ days): ${intel.engagement.powerUsers}`]: intel.engagement.powerUsers,
                      [`Multi-Day (2-4 days): ${intel.engagement.multiDayUsers}`]: intel.engagement.multiDayUsers,
                      [`Single-Day: ${intel.engagement.singleDayUsers}`]: intel.engagement.singleDayUsers,
                      [`Dormant (0 days): ${intel.engagement.dormantUsers}`]: intel.engagement.dormantUsers,
                    }} />
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* ── 3. 14-Day Growth Trends ── */}
          {intel?.trends && intel.trends.length > 1 && (
            <Section title="14-Day Growth Trends" subtitle="User activity trajectory over the analysis window">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
                <div className="panel">
                  <div className="panel-header">
                    <h3>Daily Active Users</h3>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sampled cohort</span>
                  </div>
                  <div className="panel-body">
                    <TrendChart
                      data={intel.trends}
                      series={[{ key: 'activeUsers', label: 'DAU', color: 'var(--green)' }]}
                      height={160}
                    />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-header">
                    <h3>Log Volume</h3>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Total moments per day</span>
                  </div>
                  <div className="panel-body">
                    <TrendChart
                      data={intel.trends}
                      series={[{ key: 'logs', label: 'Logs', color: 'var(--accent)' }]}
                      height={160}
                    />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-header">
                    <h3>New Signups</h3>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>User acquisition</span>
                  </div>
                  <div className="panel-body">
                    <TrendChart
                      data={intel.trends}
                      series={[{ key: 'newUsers', label: 'New Users', color: 'var(--cyan)' }]}
                      height={160}
                    />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-header">
                    <h3>Rolling 7-Day Retention</h3>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>DAU[day] / DAU[day-7] %</span>
                  </div>
                  <div className="panel-body">
                    <TrendChart
                      data={intel.trends.filter(d => d.retention !== null)}
                      series={[{ key: 'retention', label: 'Retention %', color: 'var(--yellow)' }]}
                      height={160}
                    />
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* ── 4. Insight Engine Performance ── */}
          {intel?.insightKpis && (
            <Section title="Insight Engine Performance" subtitle="AI pipeline coverage and effectiveness">
              <div className="metrics-grid">
                <MetricCard
                  label="Insight Success Rate"
                  value={`${intel.insightKpis.insightSuccessRate}%`}
                  sub="Active users with any insight"
                  color={intel.insightKpis.insightSuccessRate >= 50 ? 'var(--green)' : 'var(--yellow)'}
                />
                <MetricCard
                  label="LLM Insights"
                  value={intel.insightKpis.llmInsightCount}
                  sub={`${intel.insightKpis.llmRatio}% of total`}
                  color="var(--cyan)"
                />
                <MetricCard
                  label="Rule-Based Insights"
                  value={intel.insightKpis.ruleInsightCount}
                  sub={`${intel.insightKpis.ruleRatio}% of total`}
                  color="var(--accent)"
                />
                <MetricCard
                  label="Insight Coverage"
                  value={`${intel.insightKpis.insightCoverage}%`}
                  sub={`${intel.insightKpis.usersWithInsight} users covered`}
                  color={intel.insightKpis.insightCoverage >= 40 ? 'var(--green)' : 'var(--yellow)'}
                />
              </div>
              {intel.insightKpis.avgInsightLatencyMs && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                  Avg insight latency: {Math.round(intel.insightKpis.avgInsightLatencyMs / 60000)} min
                </div>
              )}
            </Section>
          )}

          {/* ── 5. Feature Adoption — Validation Gates ── */}
          <Section title="Feature Adoption Gates" subtitle={`${passing}/${totalGates} gates passing — target thresholds for pilot success`}>
            <div className="panel">
              <div className="panel-body" style={{ padding: 0 }}>
                {pilot.checks.map((check, i) => (
                  <GateRow key={i} check={check} />
                ))}
              </div>
            </div>
          </Section>

          {/* ── 6. Behavioral Intelligence ── */}
          {intel?.baseline && intel.baseline.usersWithBaseline > 0 && (
            <Section title="Behavioral Intelligence" subtitle="Emerging behavioral patterns from the pilot cohort">
              <div className="metrics-grid">
                <MetricCard
                  label="Avg Baseline Score"
                  value={intel.baseline.avgBaseline ?? '—'}
                  sub={`${intel.baseline.usersWithBaseline} users scored`}
                  color="var(--accent)"
                />
                <MetricCard
                  label="Avg Drift"
                  value={intel.baseline.avgDrift ?? '—'}
                  color={intel.baseline.avgDrift > 0 ? 'var(--green)' : intel.baseline.avgDrift < -0.1 ? 'var(--red)' : 'var(--yellow)'}
                  sub={intel.baseline.avgDrift > 0 ? 'Improving' : intel.baseline.avgDrift < -0.1 ? 'Declining' : 'Stable'}
                />
                <MetricCard
                  label="Avg Stability"
                  value={intel.baseline.avgStability ?? '—'}
                  color="var(--cyan)"
                />
              </div>

              {intel.baseline.driftDistribution && (
                <div className="panel" style={{ marginTop: 16 }}>
                  <div className="panel-header"><h3>Drift Distribution</h3></div>
                  <div className="panel-body">
                    <DistributionBar data={{
                      [`Improving: ${intel.baseline.driftDistribution.improving}`]: intel.baseline.driftDistribution.improving,
                      [`Stable: ${intel.baseline.driftDistribution.stable}`]: intel.baseline.driftDistribution.stable,
                      [`Declining: ${intel.baseline.driftDistribution.declining}`]: intel.baseline.driftDistribution.declining,
                    }} />
                  </div>
                </div>
              )}

              {intel.baseline.stateOfMind && Object.keys(intel.baseline.stateOfMind).length > 0 && (
                <div className="panel" style={{ marginTop: 16 }}>
                  <div className="panel-header"><h3>State of Mind Distribution</h3></div>
                  <div className="panel-body">
                    <DistributionBar data={intel.baseline.stateOfMind} />
                  </div>
                </div>
              )}
            </Section>
          )}

          {/* ── 7. Fleet Distributions ── */}
          <Section title="Fleet-Wide Patterns" subtitle="Aggregated trigger and emotion usage across all pilot users">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div className="panel">
                <div className="panel-header"><h3>Top Triggers</h3></div>
                <div className="panel-body">
                  <DistributionBar data={
                    Object.fromEntries(Object.entries(pilot.triggerFleet || {}).slice(0, 8))
                  } />
                </div>
              </div>
              <div className="panel">
                <div className="panel-header"><h3>Top Emotions</h3></div>
                <div className="panel-body">
                  <DistributionBar data={
                    Object.fromEntries(Object.entries(pilot.emotionFleet || {}).slice(0, 8))
                  } />
                </div>
              </div>
            </div>

            {pilot.daysDistribution && (
              <div className="panel">
                <div className="panel-header"><h3>Days Active Distribution (14d window)</h3></div>
                <div className="panel-body">
                  <DistributionBar data={
                    Object.fromEntries(
                      Object.entries(pilot.daysDistribution)
                        .sort(([a], [b]) => parseInt(a) - parseInt(b))
                        .map(([days, count]) => [`${days} days`, count])
                    )
                  } />
                </div>
              </div>
            )}
          </Section>

          {/* ── 8. Invoked Behavioral Metrics ── */}
          {intel?.invokedMetrics && intel.invokedMetrics.usersWithData > 0 && (
            <Section title="Advanced Behavioral Signals" subtitle="Compound pattern detection across the pilot cohort">
              <div className="metrics-grid">
                <MetricCard
                  label="False Recovery Detected"
                  value={intel.invokedMetrics.falseRecoveryCount}
                  color={intel.invokedMetrics.falseRecoveryCount > 0 ? 'var(--orange)' : 'var(--green)'}
                  sub="Users showing false improvement"
                />
                <MetricCard
                  label="Crash Risk Detected"
                  value={intel.invokedMetrics.crashRiskCount}
                  color={intel.invokedMetrics.crashRiskCount > 0 ? 'var(--red)' : 'var(--green)'}
                  sub="Users at risk of regression"
                />
                <MetricCard
                  label="Behavioral Data Coverage"
                  value={intel.invokedMetrics.usersWithData}
                  sub="Users with invoked metrics"
                  color="var(--accent)"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, marginTop: 16 }}>
                <div className="panel">
                  <div className="panel-header"><h3>Vacuum Drift</h3></div>
                  <div className="panel-body">
                    <DistributionBar data={intel.invokedMetrics.vacuumDrift} />
                  </div>
                </div>
                <div className="panel">
                  <div className="panel-header"><h3>Masking Level</h3></div>
                  <div className="panel-body">
                    <DistributionBar data={intel.invokedMetrics.maskingLevel} />
                  </div>
                </div>
              </div>
            </Section>
          )}

          {/* ── 9. Pilot User Cohort ── */}
          <Section title="Pilot User Cohort" subtitle={`Top ${pilot.users?.length || 0} users by total moments logged`}>
            <div className="panel">
              <div className="panel-body" style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>User ID</th>
                      <th>Name</th>
                      <th>Type</th>
                      <th style={{ textAlign: 'right' }}>Moments</th>
                      <th style={{ textAlign: 'right' }}>This Wk</th>
                      <th style={{ textAlign: 'right' }}>Last Wk</th>
                      <th style={{ textAlign: 'right' }}>Active Days</th>
                      <th style={{ textAlign: 'right' }}>Triggers</th>
                      <th style={{ textAlign: 'center' }}>Report</th>
                      <th style={{ textAlign: 'center' }}>LLM</th>
                      <th style={{ textAlign: 'center' }}>Modes</th>
                      <th style={{ textAlign: 'right' }}>Feedback</th>
                      <th style={{ textAlign: 'center' }}>Premium</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pilot.users?.map((user) => (
                      <tr key={user.id}>
                        <td className="mono">{user.id}</td>
                        <td>{user.name || '—'}</td>
                        <td>
                          {user.isAnonymous
                            ? <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(148,163,184,0.15)', color: 'var(--text-muted)' }}>anon</span>
                            : <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'rgba(99,102,241,0.12)', color: 'var(--accent)' }}>auth</span>}
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono">{user.moments}</td>
                        <td style={{ textAlign: 'right' }} className="mono">{user.week1Moments}</td>
                        <td style={{ textAlign: 'right' }} className="mono">{user.week2Moments}</td>
                        <td style={{ textAlign: 'right' }}>{user.activeDays14d}d</td>
                        <td style={{ textAlign: 'right' }}>{user.uniqueTriggers}</td>
                        <td style={{ textAlign: 'center', color: user.hasReport ? 'var(--green)' : 'var(--text-muted)' }}>
                          {user.hasReport ? '✓' : '—'}
                        </td>
                        <td style={{ textAlign: 'center', color: user.hasLlm ? 'var(--green)' : 'var(--text-muted)' }}>
                          {user.hasLlm ? '✓' : '—'}
                        </td>
                        <td style={{ textAlign: 'center', color: user.hasModes ? 'var(--green)' : 'var(--text-muted)' }}>
                          {user.hasModes ? '✓' : '—'}
                        </td>
                        <td style={{ textAlign: 'right' }} className="mono">{user.feedbackCount || '—'}</td>
                        <td style={{ textAlign: 'center' }}>
                          {user.isPremium
                            ? <span style={{ color: 'var(--accent)' }}>PRO</span>
                            : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          {/* ── Footer ── */}
          <div className="pilot-footer">
            <div>Generated: {new Date(pilot.timestamp).toLocaleString()}</div>
            <div>TriggerMap Ops Console · Pilot Validation Report</div>
          </div>
        </>
      )}
    </>
  );
}
