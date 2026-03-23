import Head from 'next/head';
import { useState, useEffect, useCallback } from 'react';
import ConfirmAction from '../components/ConfirmAction';

const LLM_MODELS = ['phi3', 'mistral', 'llama3', 'llama2', 'gemma', 'qwen2'];

const JOBS = [
  {
    id: 'generateWeeklyReports',
    label: 'Generate Weekly Reports',
    description: 'Batch generate rule-based weekly insights, action cards, deltas, and change highlights for all users. Skips users with recent reports unless Force is checked.',
    danger: false,
    hasUserPicker: true,
    source: 'backend',
    params: [
      { key: 'force', label: 'Force (ignore 7-day window)', type: 'checkbox', default: false },
    ],
  },
  {
    id: 'generateLlmInsights',
    label: 'Generate LLM Insights',
    description: 'Generate premium LLM-based narratives for all eligible signed-in users. Signals now include deltas, action feedback, and change highlights.',
    danger: false,
    usesLlm: true,
    hasUserPicker: true,
    source: 'local',
    params: [
      { key: 'force', label: 'Force (ignore cooldown)', type: 'checkbox', default: true },
      { key: 'minMoments', label: 'Min moments', type: 'number', default: 5 },
      { key: 'maxWords', label: 'Max words (total)', type: 'number', default: 150 },
    ],
  },
  {
    id: 'generateFreePass',
    label: 'Generate Free Pass + LLM Insights',
    description: 'Bulk LLM insight generation + 48h free-pass grant for all eligible users. Includes enhanced signals (deltas, actions, highlights).',
    danger: true,
    usesLlm: true,
    hasUserPicker: true,
    source: 'local',
    params: [
      { key: 'force', label: 'Force (ignore cooldown)', type: 'checkbox', default: true },
      { key: 'minMoments', label: 'Min moments', type: 'number', default: 5 },
      { key: 'maxWords', label: 'Max words (total)', type: 'number', default: 150 },
    ],
  },
];

const CACHE_ACTIONS = [
  {
    id: 'weekly_report',
    label: 'Clear Weekly Reports Cache',
    description: 'Remove all cached rule-based weekly reports. Next request will regenerate.',
  },
  {
    id: 'llm_insight',
    label: 'Clear LLM Insights Cache',
    description: 'Remove all cached LLM insights. Next generation cycle will recreate.',
  },
  {
    id: 'llm_free_pass',
    label: 'Clear Free Pass Tokens',
    description: 'Remove all active free-pass tokens.',
  },
  {
    id: 'action_feedback',
    label: 'Clear Action Feedback',
    description: 'Remove all stored HiTL action feedback (tried/skipped responses). Users will see fresh action cards.',
  },
];

const QUICK_ACTIONS = [
  {
    id: 'ping-redis',
    label: 'Ping Redis',
    description: 'Test Redis connectivity and measure latency.',
    action: 'ping',
    target: 'redis',
    noConfirm: true,
  },
  {
    id: 'ping-backend',
    label: 'Ping Backend',
    description: 'Hit /api/health on the main backend to verify it responds.',
    action: 'ping',
    target: 'backend',
    noConfirm: true,
  },
  {
    id: 'ping-worker',
    label: 'Ping Local Worker',
    description: 'Check if the local worker process is running.',
    action: 'ping',
    target: 'local-worker',
    noConfirm: true,
  },
  {
    id: 'count-owners',
    label: 'Count Owners',
    description: 'Count total unique owner IDs in the triggermap:owners set.',
    action: 'count-owners',
    target: 'owners',
    noConfirm: true,
  },
];

function SourceBadge({ source }) {
  const isLocal = source === 'local';
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 4,
      fontSize: 10,
      fontWeight: 600,
      padding: '2px 8px',
      borderRadius: 10,
      background: isLocal ? 'rgba(139, 92, 246, 0.15)' : 'rgba(59, 130, 246, 0.15)',
      color: isLocal ? '#a78bfa' : '#60a5fa',
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'currentColor' }} />
      {isLocal ? 'Local' : 'Backend'}
    </span>
  );
}

function WorkerStatus({ status }) {
  const isOnline = status === 'online';
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '8px 16px',
      background: isOnline ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
      border: `1px solid ${isOnline ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
      borderRadius: 8,
      fontSize: 13,
    }}>
      <span style={{
        width: 8, height: 8, borderRadius: '50%',
        background: isOnline ? 'var(--green)' : 'var(--red)',
        boxShadow: isOnline ? '0 0 6px var(--green)' : '0 0 6px var(--red)',
      }} />
      <span style={{ fontWeight: 600 }}>Local Worker</span>
      <span style={{ color: 'var(--text-muted)' }}>
        {status === 'online' ? 'Online' : status === 'offline' ? 'Offline' : 'Checking...'}
      </span>
      {!isOnline && status !== 'checking' && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
          LLM jobs will fail — start the worker with: cd local-worker && npm start
        </span>
      )}
    </div>
  );
}

function formatDuration(ms) {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function summarizeJobResult(result) {
  if (!Array.isArray(result)) return null;
  let generated = 0, skipped = 0, errored = 0, totalActions = 0, withDeltas = 0;
  const skipReasons = {};
  for (const r of result) {
    if (r.skipped) {
      skipped++;
      const reason = r.reason || 'unknown';
      skipReasons[reason] = (skipReasons[reason] || 0) + 1;
    } else if (r.error) {
      errored++;
    } else {
      generated++;
      if (r.report?.actionsCount) totalActions += r.report.actionsCount;
      if (r.report?.hasDeltaData) withDeltas++;
    }
  }
  return { total: result.length, generated, skipped, errored, skipReasons, totalActions, withDeltas };
}

function RunLogEntry({ entry, defaultOpen }) {
  const [expanded, setExpanded] = useState(defaultOpen);
  const [showRaw, setShowRaw] = useState(false);

  const { timestamp, action, target, ok, data, status } = entry;
  const source = data?.source || 'backend';
  const duration = data?.durationMs || data?.result?.durationMs;
  const jobResult = data?.result;
  const stdout = data?.result?.stdout || data?.stdout;
  const stderr = data?.result?.stderr || data?.stderr;
  const summary = summarizeJobResult(jobResult);
  const isJob = action === 'run-job';
  const errorMsg = data?.error || (!ok && data?.message) || null;

  return (
    <div style={{
      border: `1px solid ${ok ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.3)'}`,
      borderRadius: 8,
      overflow: 'hidden',
      background: ok ? 'rgba(34,197,94,0.03)' : 'rgba(239,68,68,0.03)',
    }}>
      {/* Header bar — always visible */}
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          cursor: 'pointer', userSelect: 'none',
        }}
      >
        <span style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: ok ? 'var(--green)' : 'var(--red)',
          boxShadow: ok ? '0 0 6px var(--green)' : '0 0 6px var(--red)',
        }} />
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {JOBS.find(j => j.id === target)?.label || target}
        </span>
        <SourceBadge source={source === 'local-worker' ? 'local' : 'backend'} />
        {duration && (
          <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
            {formatDuration(duration)}
          </span>
        )}
        {summary && (
          <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto', display: 'flex', gap: 10 }}>
            {summary.generated > 0 && <span style={{ color: 'var(--green)' }}>{summary.generated} generated</span>}
            {summary.skipped > 0 && <span>{summary.skipped} skipped</span>}
            {summary.errored > 0 && <span style={{ color: 'var(--red)' }}>{summary.errored} errored</span>}
            {summary.totalActions > 0 && <span style={{ color: '#a78bfa' }}>{summary.totalActions} actions</span>}
            {summary.withDeltas > 0 && <span style={{ color: '#60a5fa' }}>{summary.withDeltas} Δ</span>}
          </span>
        )}
        {!summary && !ok && (
          <span style={{ fontSize: 11, color: 'var(--red)', marginLeft: 'auto' }}>
            {errorMsg?.slice(0, 80) || `HTTP ${status}`}
          </span>
        )}
        {!summary && ok && !isJob && (
          <span style={{ fontSize: 11, color: 'var(--green)', marginLeft: 'auto' }}>OK</span>
        )}
        <span style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
          {new Date(timestamp).toLocaleTimeString()}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-muted)', transition: 'transform 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
          &#9654;
        </span>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 14px' }}>
          {/* Error message */}
          {errorMsg && (
            <div style={{
              padding: '8px 12px', borderRadius: 6, marginBottom: 12,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
              fontSize: 12, color: 'var(--red)', fontFamily: 'var(--font-mono)',
            }}>
              {errorMsg}
            </div>
          )}

          {/* Per-user results table for batch jobs */}
          {isJob && Array.isArray(jobResult) && jobResult.length > 0 && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Per-User Results ({jobResult.length})
              </div>
              <div style={{ maxHeight: 320, overflowY: 'auto', borderRadius: 6, border: '1px solid var(--border)' }}>
                <table className="data-table" style={{ margin: 0 }}>
                  <thead>
                    <tr>
                      <th style={{ fontSize: 11 }}>Owner ID</th>
                      <th style={{ fontSize: 11 }}>Status</th>
                      <th style={{ fontSize: 11 }}>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobResult.map((r, i) => {
                      const isSkipped = r.skipped;
                      const isErr = !!r.error;
                      const generated = !isSkipped && !isErr;
                      return (
                        <tr key={i}>
                          <td className="mono" style={{ fontSize: 11 }}>
                            {r.ownerId ? `${r.ownerId.slice(0, 8)}...` : '—'}
                          </td>
                          <td>
                            <span style={{
                              display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '1px 7px',
                              borderRadius: 8,
                              background: generated ? 'rgba(34,197,94,0.12)' : isErr ? 'rgba(239,68,68,0.12)' : 'rgba(148,163,184,0.12)',
                              color: generated ? 'var(--green)' : isErr ? 'var(--red)' : 'var(--text-muted)',
                            }}>
                              {generated ? 'GENERATED' : isErr ? 'ERROR' : 'SKIPPED'}
                            </span>
                          </td>
                          <td style={{ fontSize: 11, color: 'var(--text-muted)', maxWidth: 320 }}>
                            {isSkipped && (r.reason || '').replace(/-/g, ' ')}
                            {isErr && (r.error || r.message || 'unknown error')}
                            {generated && r.report && (
                              <span>
                                <span style={{ color: 'var(--accent)' }}>{r.report.confidence}</span>
                                {r.report.actionsCount > 0 && (
                                  <span style={{ color: 'var(--green)', marginLeft: 6 }}>
                                    {r.report.actionsCount} actions
                                  </span>
                                )}
                                {r.report.hasDeltaData && (
                                  <span style={{ color: '#a78bfa', marginLeft: 6 }}>Δ</span>
                                )}
                                {r.report.topRecurrence && (
                                  <span style={{ color: '#facc15', marginLeft: 6 }} title="Top recurrence">↻ {r.report.topRecurrence}</span>
                                )}
                                {(r.report.positiveStreakDays || r.report.negativeStreakDays) && (
                                  <span style={{ color: r.report.negativeStreakDays ? '#f87171' : '#34d399', marginLeft: 6 }}>
                                    {r.report.negativeStreakDays ? `${r.report.negativeStreakDays}d↓` : `${r.report.positiveStreakDays}d↑`}
                                  </span>
                                )}
                                {r.report.summary && ` — ${r.report.summary.slice(0, 60)}${r.report.summary.length > 60 ? '...' : ''}`}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* Skip reason breakdown */}
              {summary && Object.keys(summary.skipReasons).length > 0 && (
                <div style={{ display: 'flex', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                  {Object.entries(summary.skipReasons).map(([reason, count]) => (
                    <span key={reason} style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      <span style={{ fontWeight: 600 }}>{count}×</span> {reason.replace(/-/g, ' ')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Ping / quick action results */}
          {!isJob && ok && data && typeof data === 'object' && (
            <div style={{ marginBottom: 12 }}>
              {data.latencyMs !== undefined && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Latency: <span className="mono">{data.latencyMs}ms</span>
                </div>
              )}
              {data.count !== undefined && (
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Count: <span className="mono">{data.count}</span>
                </div>
              )}
            </div>
          )}

          {/* Stdout for local worker jobs */}
          {stdout && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>STDOUT</div>
              <pre style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--green)',
                background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 240, overflowY: 'auto', margin: 0,
              }}>
                {stdout}
              </pre>
            </div>
          )}

          {/* Stderr */}
          {stderr && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 4 }}>STDERR</div>
              <pre style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--red)',
                background: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 160, overflowY: 'auto', margin: 0,
              }}>
                {stderr}
              </pre>
            </div>
          )}

          {/* Raw JSON toggle */}
          <div>
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: 11, padding: '2px 10px' }}
              onClick={() => setShowRaw(!showRaw)}
            >
              {showRaw ? 'Hide' : 'Show'} Raw JSON
            </button>
            {showRaw && (
              <pre style={{
                fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)',
                background: 'rgba(0,0,0,0.2)', padding: 12, borderRadius: 6, marginTop: 8,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 280, overflowY: 'auto', margin: '8px 0 0',
              }}>
                {JSON.stringify(data, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ControlPage() {
  const [confirm, setConfirm] = useState(null);
  const [results, setResults] = useState([]);
  const [running, setRunning] = useState(null);
  const [workerStatus, setWorkerStatus] = useState('checking');
  const [workerInfo, setWorkerInfo] = useState(null);
  const [jobParams, setJobParams] = useState(() => {
    const defaults = {};
    for (const job of JOBS) {
      if (job.params) {
        defaults[job.id] = {};
        for (const p of job.params) {
          if (p.default !== undefined) defaults[job.id][p.key] = p.default;
        }
      }
      if (job.usesLlm) {
        defaults[job.id] = { ...(defaults[job.id] || {}), llmModel: 'phi3' };
      }
    }
    if (typeof window !== 'undefined') {
      try {
        const saved = JSON.parse(localStorage.getItem('ops_jobParams'));
        if (saved && typeof saved === 'object') {
          for (const jobId of Object.keys(defaults)) {
            if (saved[jobId]) defaults[jobId] = { ...defaults[jobId], ...saved[jobId] };
          }
        }
      } catch {}
    }
    return defaults;
  });
  const [modelStatus, setModelStatus] = useState([]);
  const [pullingModel, setPullingModel] = useState(null);
  const [eligibleUsers, setEligibleUsers] = useState({}); // { [jobId]: [] }
  const [eligibleLoading, setEligibleLoading] = useState({});
  const [selectedUsers, setSelectedUsers] = useState({}); // { [jobId]: Set<ownerId> }
  const [userPickerOpen, setUserPickerOpen] = useState({}); // { [jobId]: bool }
  const [pushTitle, setPushTitle] = useState('TriggerMap');
  const [pushBody, setPushBody] = useState('');
  const [pushSending, setPushSending] = useState(false);
  const [backfillWeeks, setBackfillWeeks] = useState(3);
  const [backfillRunning, setBackfillRunning] = useState(false);

  // Persist jobParams to localStorage
  useEffect(() => {
    try { localStorage.setItem('ops_jobParams', JSON.stringify(jobParams)); } catch {}
  }, [jobParams]);

  // Fetch eligible users for a job based on minMoments
  const fetchEligibleUsers = useCallback(async (jobId) => {
    const min = jobParams[jobId]?.minMoments || 1;
    setEligibleLoading((p) => ({ ...p, [jobId]: true }));
    try {
      const res = await fetch(`/api/control/eligible-users?minMoments=${min}`);
      const data = await res.json();
      const users = data.users || [];
      setEligibleUsers((p) => ({ ...p, [jobId]: users }));
      // Default: all selected
      setSelectedUsers((p) => ({
        ...p,
        [jobId]: new Set(users.map((u) => u.ownerId)),
      }));
    } catch {
      setEligibleUsers((p) => ({ ...p, [jobId]: [] }));
    } finally {
      setEligibleLoading((p) => ({ ...p, [jobId]: false }));
    }
  }, [jobParams]);

  // Poll worker health
  const checkWorker = useCallback(async () => {
    try {
      const res = await fetch('/api/control/worker-health');
      const data = await res.json();
      setWorkerStatus(data.ok ? 'online' : 'offline');
      setWorkerInfo(data.ok ? data.data : null);
    } catch {
      setWorkerStatus('offline');
      setWorkerInfo(null);
    }
  }, []);

  useEffect(() => {
    checkWorker();
    const interval = setInterval(checkWorker, 15000);
    return () => clearInterval(interval);
  }, [checkWorker]);

  // Fetch model availability from Ollama via worker
  const fetchModels = useCallback(async () => {
    try {
      const res = await fetch('/api/control/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'list-models', target: 'models' }),
      });
      const data = await res.json();
      if (data.ok !== false && data.data?.models) {
        setModelStatus(data.data.models);
      } else if (Array.isArray(data.models)) {
        setModelStatus(data.models);
      }
    } catch {}
  }, []);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Refresh models when worker comes online
  useEffect(() => {
    if (workerStatus === 'online') fetchModels();
  }, [workerStatus, fetchModels]);

  const pullModelAction = async (model) => {
    setPullingModel(model);
    try {
      const res = await fetch('/api/control/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'pull-model', target: model }),
      });
      const data = await res.json();
      setResults((prev) => [
        { timestamp: new Date().toISOString(), action: 'pull-model', target: model, ok: res.ok, data, status: res.status },
        ...prev,
      ].slice(0, 50));
    } catch (err) {
      setResults((prev) => [
        { timestamp: new Date().toISOString(), action: 'pull-model', target: model, ok: false, data: { error: err.message }, status: 0 },
        ...prev,
      ].slice(0, 50));
    } finally {
      setPullingModel(null);
      fetchModels();
    }
  };

  const executeAction = async (action, target, params) => {
    setRunning(target);
    const timestamp = new Date().toISOString();
    try {
      const res = await fetch('/api/control/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, target, params }),
      });
      const data = await res.json();
      setResults((prev) => [
        { timestamp, action, target, ok: res.ok, data, status: res.status },
        ...prev,
      ].slice(0, 50));
      // After job run, refresh worker status (active jobs may have changed)
      if (action === 'run-job' || action === 'cancel-job') checkWorker();
    } catch (err) {
      setResults((prev) => [
        { timestamp, action, target, ok: false, data: { error: err.message }, status: 0 },
        ...prev,
      ].slice(0, 50));
    } finally {
      setRunning(null);
      setConfirm(null);
    }
  };

  const updateParam = (jobId, key, value) => {
    setJobParams((prev) => ({
      ...prev,
      [jobId]: { ...(prev[jobId] || {}), [key]: value },
    }));
  };

  const getJobParams = (job) => {
    const p = { ...(jobParams[job.id] || {}) };
    // If user picker was opened for this job, include selected ownerIds
    const sel = selectedUsers[job.id];
    const all = eligibleUsers[job.id];
    if (sel && all && sel.size > 0 && sel.size < all.length) {
      p.ownerIds = [...sel];
    }
    return p;
  };

  const hasActiveWorkerJob = (jobName) => {
    return workerInfo?.activeJobs?.[jobName];
  };

  return (
    <>
      <Head><title>Control Panel — TriggerMap Ops</title></Head>

      <div className="ops-page-header">
        <h2>Control Panel</h2>
        <span className="timestamp">All destructive actions require confirmation</span>
      </div>

      {/* Worker Status Banner */}
      <WorkerStatus status={workerStatus} />

      {/* Quick Actions */}
      <div className="panel" style={{ marginTop: 16 }}>
        <div className="panel-header">
          <h3>Quick Actions</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Safe, read-only checks</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          {QUICK_ACTIONS.map((qa) => (
            <button
              key={qa.id}
              className="btn btn-ghost btn-sm"
              disabled={running === qa.target}
              onClick={() => executeAction(qa.action, qa.target)}
              title={qa.description}
            >
              {running === qa.target ? '...' : qa.label}
            </button>
          ))}
        </div>
      </div>

      {/* LLM Models */}
      <div className="panel">
        <div className="panel-header">
          <h3>LLM Models</h3>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {modelStatus.filter(m => m.ready).length}/{modelStatus.length} ready
            </span>
            <button className="btn btn-ghost btn-sm" onClick={fetchModels} disabled={workerStatus !== 'online'}>
              Refresh
            </button>
          </div>
        </div>
        <div className="panel-body">
          {workerStatus !== 'online' ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Worker offline — cannot check models</div>
          ) : modelStatus.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading model status…</div>
          ) : (
            modelStatus.map((m) => (
              <div key={m.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.ready ? 'var(--green)' : 'var(--red)', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 600 }}>{m.name}</span>
                  {m.ready && m.installedAs && m.installedAs !== m.name && (
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>({m.installedAs})</span>
                  )}
                </div>
                {m.ready ? (
                  <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 600 }}>Ready</span>
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    style={{ fontSize: 11, padding: '2px 12px' }}
                    disabled={pullingModel !== null}
                    onClick={() => pullModelAction(m.name)}
                  >
                    {pullingModel === m.name ? 'Pulling…' : 'Pull'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Job Triggers */}
      <div className="panel">
        <div className="panel-header">
          <h3>Jobs</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Run backend or local LLM jobs</span>
        </div>
        <div className="panel-body">
          {JOBS.map((job) => {
            const isLocalJob = job.source === 'local';
            const workerDown = isLocalJob && workerStatus !== 'online';
            const alreadyRunning = isLocalJob && hasActiveWorkerJob(job.id);

            return (
              <div key={job.id} style={{ marginBottom: 20, paddingBottom: 20, borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, marginRight: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{job.label}</span>
                      <SourceBadge source={job.source} />
                      {alreadyRunning && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--yellow)', background: 'rgba(234, 179, 8, 0.12)', padding: '2px 8px', borderRadius: 10 }}>
                          RUNNING
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', maxWidth: 600 }}>{job.description}</div>
                    {workerDown && (
                      <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>
                        Local worker is offline — this job cannot run
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 16, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
                      {job.usesLlm && (
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                          <span style={{ fontWeight: 600, color: 'var(--accent)' }}>LLM Model</span>
                          <select
                            value={jobParams[job.id]?.llmModel || 'phi3'}
                            onChange={(e) => updateParam(job.id, 'llmModel', e.target.value)}
                            style={{
                              padding: '3px 8px',
                              background: 'var(--bg-primary)',
                              border: '1px solid var(--border)',
                              borderRadius: 4,
                              color: 'var(--text-primary)',
                              fontSize: 12,
                              fontFamily: 'var(--font-mono)',
                            }}
                          >
                            {LLM_MODELS.map((m) => {
                              const ms = modelStatus.find(s => s.name === m);
                              const prefix = modelStatus.length > 0 ? (ms?.ready ? '✓ ' : '↓ ') : '';
                              return <option key={m} value={m}>{prefix}{m}</option>;
                            })}
                          </select>
                        </label>
                      )}
                      {job.params && job.params.map((p) => (
                        <label key={p.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                          {p.type === 'checkbox' ? (
                            <input
                              type="checkbox"
                              checked={jobParams[job.id]?.[p.key] ?? p.default ?? false}
                              onChange={(e) => updateParam(job.id, p.key, e.target.checked)}
                              style={{ width: 14, height: 14 }}
                            />
                          ) : (
                            <input
                              type="number"
                              value={jobParams[job.id]?.[p.key] ?? p.default ?? ''}
                              onChange={(e) => updateParam(job.id, p.key, parseInt(e.target.value, 10) || 0)}
                              style={{ width: 60, padding: '2px 6px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
                            />
                          )}
                          {p.label}
                        </label>
                      ))}
                    </div>
                    {/* User picker */}
                    {job.hasUserPicker && (
                      <div style={{ marginTop: 10 }}>
                        <button
                          type="button"
                          style={{
                            background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer',
                            fontSize: 12, fontWeight: 600, padding: 0, textDecoration: 'underline',
                          }}
                          onClick={() => {
                            const open = !userPickerOpen[job.id];
                            setUserPickerOpen((p) => ({ ...p, [job.id]: open }));
                            if (open && !eligibleUsers[job.id]) fetchEligibleUsers(job.id);
                          }}
                        >
                          {userPickerOpen[job.id] ? '▾ Hide user selection' : '▸ Select users…'}
                          {selectedUsers[job.id] && eligibleUsers[job.id] && (
                            <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: 6 }}>
                              ({selectedUsers[job.id].size}/{eligibleUsers[job.id].length} selected)
                            </span>
                          )}
                        </button>
                        {userPickerOpen[job.id] && (
                          <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 6, padding: 10, background: 'var(--bg-primary)', maxHeight: 220, overflowY: 'auto' }}>
                            {eligibleLoading[job.id] ? (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading eligible users…</div>
                            ) : (eligibleUsers[job.id] && eligibleUsers[job.id].length > 0) ? (
                              <>
                                <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    style={{ fontSize: 11, padding: '2px 8px' }}
                                    onClick={() => setSelectedUsers((p) => ({
                                      ...p,
                                      [job.id]: new Set(eligibleUsers[job.id].map((u) => u.ownerId)),
                                    }))}
                                  >Select All</button>
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    style={{ fontSize: 11, padding: '2px 8px' }}
                                    onClick={() => setSelectedUsers((p) => ({ ...p, [job.id]: new Set() }))}
                                  >Deselect All</button>
                                  <button
                                    type="button"
                                    className="btn btn-sm"
                                    style={{ fontSize: 11, padding: '2px 8px' }}
                                    onClick={() => fetchEligibleUsers(job.id)}
                                  >Refresh</button>
                                </div>
                                {eligibleUsers[job.id].map((u) => {
                                  const sel = selectedUsers[job.id] || new Set();
                                  return (
                                    <label key={u.ownerId} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '3px 0', cursor: 'pointer' }}>
                                      <input
                                        type="checkbox"
                                        checked={sel.has(u.ownerId)}
                                        onChange={() => {
                                          setSelectedUsers((prev) => {
                                            const next = new Set(prev[job.id] || []);
                                            if (next.has(u.ownerId)) next.delete(u.ownerId);
                                            else next.add(u.ownerId);
                                            return { ...prev, [job.id]: next };
                                          });
                                        }}
                                        style={{ width: 14, height: 14 }}
                                      />
                                      <span style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', minWidth: 60 }}>
                                        {u.ownerId.slice(0, 8)}
                                      </span>
                                      <span style={{ color: 'var(--text-secondary)' }}>
                                        {u.name || u.email || '(anonymous)'}
                                      </span>
                                      <span style={{ color: 'var(--text-muted)', marginLeft: 'auto', whiteSpace: 'nowrap' }}>
                                        {u.momentCount} moments
                                      </span>
                                    </label>
                                  );
                                })}
                              </>
                            ) : (
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>No eligible users found for this threshold.</div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    {alreadyRunning && (
                      <button
                        className="btn btn-danger btn-sm"
                        disabled={running === `cancel-${job.id}`}
                        onClick={() => {
                          setRunning(`cancel-${job.id}`);
                          executeAction('cancel-job', job.id);
                        }}
                      >
                        Cancel
                      </button>
                    )}
                    <button
                      className={`btn ${job.danger ? 'btn-danger' : 'btn-primary'} btn-sm`}
                      disabled={running === job.id || workerDown || alreadyRunning}
                      onClick={() => setConfirm({ action: 'run-job', target: job.id, label: job.label, danger: job.danger, params: getJobParams(job), source: job.source })}
                    >
                      {running === job.id ? 'Running...' : 'Run'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cache Actions */}
      <div className="panel">
        <div className="panel-header">
          <h3>Cache Operations</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Clear cached data (runs on backend)</span>
        </div>
        <div className="panel-body">
          {CACHE_ACTIONS.map((cache) => (
            <div key={cache.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{cache.label}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{cache.description}</div>
              </div>
              <button
                className="btn btn-danger btn-sm"
                disabled={running === cache.id}
                onClick={() => setConfirm({ action: 'clear-cache', target: cache.id, label: cache.label, danger: true })}
              >
                {running === cache.id ? 'Clearing...' : 'Clear'}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Push Notifications */}
      <div className="panel">
        <div className="panel-header">
          <h3>Send Test Notification</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Expo push via registered tokens</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <input
              type="text"
              value={pushTitle}
              onChange={(e) => setPushTitle(e.target.value)}
              placeholder="Notification title"
              style={{ flex: 1, fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)' }}
            />
          </div>
          <textarea
            value={pushBody}
            onChange={(e) => setPushBody(e.target.value)}
            placeholder="Notification body text..."
            rows={2}
            style={{ fontSize: 13, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-input)', color: 'var(--text)', resize: 'vertical' }}
          />
          {/* User picker: reuse the existing eligible users infrastructure */}
          {!userPickerOpen['push'] ? (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => {
              setUserPickerOpen(p => ({ ...p, push: true }));
              if (!eligibleUsers['push']?.length) fetchEligibleUsers('push');
            }}>
              Select users...
            </button>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Recipients</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => {
                    const all = (eligibleUsers['push'] || []).map(u => u.ownerId);
                    setSelectedUsers(p => ({ ...p, push: new Set(all) }));
                  }}>All</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => setSelectedUsers(p => ({ ...p, push: new Set() }))}>None</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => setUserPickerOpen(p => ({ ...p, push: false }))}>Close</button>
                </div>
              </div>
              {eligibleLoading['push'] ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading users...</div> : (
                (eligibleUsers['push'] || []).map(u => (
                  <label key={u.ownerId} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, padding: '2px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedUsers['push']?.has(u.ownerId) || false} onChange={() => {
                      setSelectedUsers(p => {
                        const s = new Set(p['push'] || []);
                        s.has(u.ownerId) ? s.delete(u.ownerId) : s.add(u.ownerId);
                        return { ...p, push: s };
                      });
                    }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{u.ownerId.slice(0, 8)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{u.email || ''} — {u.moments} moments</span>
                  </label>
                ))
              )}
            </div>
          )}
          <button
            className="btn btn-primary btn-sm"
            disabled={pushSending || !pushTitle.trim() || !pushBody.trim()}
            style={{ alignSelf: 'flex-start' }}
            onClick={async () => {
              const sel = selectedUsers['push'];
              const all = (eligibleUsers['push'] || []).map(u => u.ownerId);
              const userIds = sel && sel.size > 0 ? [...sel] : all;
              if (!userIds.length) { alert('No users selected'); return; }
              setPushSending(true);
              const ts = new Date().toISOString();
              try {
                const res = await fetch('/api/push/send', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ userIds, title: pushTitle.trim(), body: pushBody.trim() }),
                });
                const data = await res.json();
                setResults(prev => [{ timestamp: ts, action: 'send-push', target: `${userIds.length} users`, ok: res.ok, data, status: res.status }, ...prev].slice(0, 50));
              } catch (err) {
                setResults(prev => [{ timestamp: ts, action: 'send-push', target: 'push', ok: false, data: { error: err.message }, status: 0 }, ...prev].slice(0, 50));
              } finally {
                setPushSending(false);
              }
            }}
          >
            {pushSending ? 'Sending...' : 'Send Notification'}
          </button>
        </div>
      </div>

      {/* Demo Data Backfill */}
      <div className="panel">
        <div className="panel-header">
          <h3>Backfill Demo Data</h3>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Seed curated moments for demos</span>
        </div>
        <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            Generates curated demo moments (work stress, exercise recovery, social energy, travel resets) going back N weeks.
            Each week uses a different narrative arc. Data is written directly to Redis aggregates.
          </div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
              <span style={{ fontWeight: 600 }}>Weeks</span>
              <input
                type="number"
                min={1}
                max={8}
                value={backfillWeeks}
                onChange={(e) => setBackfillWeeks(Math.max(1, Math.min(8, parseInt(e.target.value, 10) || 1)))}
                style={{ width: 50, padding: '3px 6px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 4, color: 'var(--text-primary)', fontSize: 12, fontFamily: 'var(--font-mono)' }}
              />
            </label>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              ~{backfillWeeks * 13} moments across {backfillWeeks * 6}-{backfillWeeks * 7} days
            </span>
          </div>
          {/* User picker */}
          {!userPickerOpen['backfill'] ? (
            <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => {
              setUserPickerOpen(p => ({ ...p, backfill: true }));
              if (!eligibleUsers['backfill']?.length) {
                // Fetch all users (minMoments=0 to include even empty accounts)
                (async () => {
                  setEligibleLoading(p => ({ ...p, backfill: true }));
                  try {
                    const res = await fetch('/api/control/eligible-users?minMoments=0');
                    const data = await res.json();
                    const users = data.users || [];
                    setEligibleUsers(p => ({ ...p, backfill: users }));
                    setSelectedUsers(p => ({ ...p, backfill: new Set() }));
                  } catch {
                    setEligibleUsers(p => ({ ...p, backfill: [] }));
                  } finally {
                    setEligibleLoading(p => ({ ...p, backfill: false }));
                  }
                })();
              }
            }}>
              Select accounts...
            </button>
          ) : (
            <div style={{ background: 'rgba(0,0,0,0.15)', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 600 }}>Accounts to backfill</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => {
                    const all = (eligibleUsers['backfill'] || []).map(u => u.ownerId);
                    setSelectedUsers(p => ({ ...p, backfill: new Set(all) }));
                  }}>All</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => setSelectedUsers(p => ({ ...p, backfill: new Set() }))}>None</button>
                  <button className="btn btn-ghost btn-sm" style={{ fontSize: 11, padding: '1px 8px' }} onClick={() => setUserPickerOpen(p => ({ ...p, backfill: false }))}>Close</button>
                </div>
              </div>
              {eligibleLoading['backfill'] ? <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Loading accounts...</div> : (
                (eligibleUsers['backfill'] || []).map(u => (
                  <label key={u.ownerId} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, padding: '2px 0', cursor: 'pointer' }}>
                    <input type="checkbox" checked={selectedUsers['backfill']?.has(u.ownerId) || false} onChange={() => {
                      setSelectedUsers(p => {
                        const s = new Set(p['backfill'] || []);
                        s.has(u.ownerId) ? s.delete(u.ownerId) : s.add(u.ownerId);
                        return { ...p, backfill: s };
                      });
                    }} />
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{u.ownerId.slice(0, 8)}</span>
                    <span style={{ color: 'var(--text-muted)' }}>{u.name || u.email || '(anonymous)'} - {u.momentCount} moments</span>
                  </label>
                ))
              )}
            </div>
          )}
          <button
            className="btn btn-primary btn-sm"
            disabled={backfillRunning || !(selectedUsers['backfill']?.size > 0)}
            style={{ alignSelf: 'flex-start' }}
            onClick={async () => {
              const sel = selectedUsers['backfill'];
              if (!sel || sel.size === 0) { alert('Select at least one account'); return; }
              setBackfillRunning(true);
              const ts = new Date().toISOString();
              try {
                const res = await fetch('/api/control/backfill-demo', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ownerIds: [...sel], weeks: backfillWeeks }),
                });
                const data = await res.json();
                setResults(prev => [{
                  timestamp: ts,
                  action: 'backfill-demo',
                  target: `${sel.size} accounts x ${backfillWeeks}w`,
                  ok: res.ok,
                  data,
                  status: res.status,
                }, ...prev].slice(0, 50));
              } catch (err) {
                setResults(prev => [{
                  timestamp: ts,
                  action: 'backfill-demo',
                  target: 'backfill',
                  ok: false,
                  data: { error: err.message },
                  status: 0,
                }, ...prev].slice(0, 50));
              } finally {
                setBackfillRunning(false);
              }
            }}
          >
            {backfillRunning ? 'Backfilling...' : `Backfill ${backfillWeeks} week${backfillWeeks > 1 ? 's' : ''}`}
          </button>
        </div>
      </div>

      {/* Run Log */}
      {results.length > 0 && (
        <div className="panel">
          <div className="panel-header">
            <h3>Run Log</h3>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{results.length} entries</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setResults([])}>Clear</button>
            </div>
          </div>
          <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map((r, i) => (
              <RunLogEntry key={`${r.timestamp}-${i}`} entry={r} defaultOpen={i === 0} />
            ))}
          </div>
        </div>
      )}

      {/* Confirmation Dialog */}
      {confirm && (
        <ConfirmAction
          title={`Confirm: ${confirm.label}`}
          description={
            confirm.params?.llmModel
              ? `This will execute "${confirm.action}" on "${confirm.target}" using model "${confirm.params.llmModel}" via ${confirm.source === 'local' ? 'local worker' : 'backend'}. Are you sure?`
              : `This will execute "${confirm.action}" on "${confirm.target}" via ${confirm.source || 'backend'}. Are you sure?`
          }
          danger={confirm.danger}
          onCancel={() => setConfirm(null)}
          onConfirm={() => executeAction(confirm.action, confirm.target, confirm.params)}
        />
      )}
    </>
  );
}
