import Head from 'next/head';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

const LLM_MODELS = ['phi3', 'gemma3', 'gemma4', 'mistral', 'llama3', 'llama2', 'gemma', 'qwen2'];

const LLM_STYLES = [
  { id: 'default',      label: 'Default (System Voice)' },
  { id: 'dostoevsky',   label: '🔥 Dostoevsky' },
  { id: 'camus',        label: '🪨 Camus' },
  { id: 'pessoa',       label: '🌫 Pessoa' },
  { id: 'krishnamurti', label: '🧘 Krishnamurti' },
  { id: 'vivekananda',  label: '🔱 Vivekananda' },
  { id: 'fleabag',      label: '🎭 Fleabag' },
  { id: 'seinfeld',     label: '😂 Seinfeld / Curb' },
  { id: 'carlin',       label: '🔥 George Carlin' },
  { id: 'sloss',        label: '🎤 Daniel Sloss' },
  { id: 'kenny',        label: '🇮🇳 Kenny Sebastian' },
  { id: 'virdas',       label: '🇮🇳 Vir Das' },
];

const PROCESS_ROWS = [
  {
    id: 'insights',
    label: 'LLM Insights',
    hasMaxWords: true,
    hasMinMoments: true,
    hasPremium: true,
    hasNonPremium: true,
    hasTimeSinceLastRun: true,
    hasLoggedMoment: true,
    hasMarkedFeedback: false,
    defaults: {
      enabled: true, model: 'phi3', maxWords: 100, minMoments: 5,
      premium: true, nonPremium: false, timeSinceLastRun: 6, loggedMoment: 'all',
    },
  },
  {
    id: 'actions',
    label: 'LLM Actions',
    hasMaxWords: false,
    hasMinMoments: true,
    hasPremium: true,
    hasNonPremium: true,
    hasTimeSinceLastRun: true,
    hasLoggedMoment: false,
    hasMarkedFeedback: true,
    markedFeedbackOnly: true,
    defaults: {
      enabled: true, model: 'phi3', minMoments: 3,
      premium: true, nonPremium: true, timeSinceLastRun: 3,
      hasMarked: true,
    },
  },
  {
    id: 'move',
    label: 'Move',
    hasMaxWords: false,
    hasMinMoments: true,
    hasPremium: true,
    hasNonPremium: false,
    hasTimeSinceLastRun: true,
    hasLoggedMoment: false,
    hasMarkedFeedback: true,
    hasMinMarked: true,
    defaults: {
      enabled: true, model: 'phi3', minMoments: 3,
      premium: true, hasMarked: true, minMarked: 1, timeSinceLastRun: 3,
    },
  },
  {
    id: 'fuel',
    label: 'Fuel',
    hasMaxWords: false,
    hasMinMoments: true,
    hasPremium: true,
    hasNonPremium: false,
    hasTimeSinceLastRun: true,
    hasLoggedMoment: false,
    hasMarkedFeedback: true,
    hasMinMarked: true,
    defaults: {
      enabled: true, model: 'phi3', minMoments: 3,
      premium: true, hasMarked: true, minMarked: 1, timeSinceLastRun: 3,
    },
  },
  {
    id: 'perspective',
    label: 'Perspective',
    hasMaxWords: true,
    hasMinMoments: true,
    hasPremium: true,
    hasNonPremium: false,
    hasTimeSinceLastRun: true,
    hasLoggedMoment: true,
    hasMarkedFeedback: false,
    defaults: {
      enabled: true, model: 'phi3', maxWords: 100, minMoments: 5,
      premium: true, timeSinceLastRun: 6, loggedMoment: 'all',
    },
  },
];

function formatDuration(ms) {
  if (!ms) return '';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.round((ms % 60000) / 1000)}s`;
}

function formatMinutes(m) {
  if (m < 1) return '< 1 min';
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function timeAgo(isoStr) {
  if (!isoStr) return 'never';
  const ms = Date.now() - new Date(isoStr).getTime();
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor(ms / 3600000);
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  return 'just now';
}

// ── Filtering logic ──

function daysSince(isoStr) {
  if (!isoStr) return Infinity;
  return (Date.now() - new Date(isoStr).getTime()) / 86400000;
}

function filterUsersForRow(row, config, users) {
  const c = config[row.id] || row.defaults;
  if (!c.enabled) return [];

  return users.filter((u) => {
    // Min moments — use weekly aggregate count (last 7 days) to match backend exactly.
    // Exception: insights has a "silent user" path where users with 0 weekly moments
    // but sufficient lifetime moments (≥3) are still processed.
    const weekly = u.weeklyMomentCount || 0;
    const lifetime = u.momentCount || 0;
    const minMoments = c.minMoments || 1;

    if (row.id === 'insights') {
      // Insights backend: isSilent = weeklyTotal==0 && lifetimeTotal>=3 → bypasses minMoments
      const couldBeSilent = weekly === 0 && lifetime >= 3;
      if (!couldBeSilent && weekly < minMoments) return false;
    } else {
      if (weekly < minMoments) return false;
    }

    // Premium filter
    if (row.hasPremium && c.premium && !row.hasNonPremium) {
      // Premium only (no non-premium option)
      if (!u.isPremium) return false;
    } else if (row.hasPremium && row.hasNonPremium) {
      // Both toggles available
      if (c.premium && !c.nonPremium && !u.isPremium) return false;
      if (!c.premium && c.nonPremium && u.isPremium) return false;
      if (!c.premium && !c.nonPremium) return false;
    }

    // Time since last run
    if (row.hasTimeSinceLastRun && c.timeSinceLastRun != null) {
      const lastRunKey = {
        insights: 'lastLlmInsightAt',
        actions: 'lastLlmActionsAt',
        move: 'lastMoveAt',
        fuel: 'lastFuelAt',
        perspective: 'lastPerspectiveAt',
      }[row.id];
      if (lastRunKey) {
        const daysSinceRun = daysSince(u[lastRunKey]);
        if (daysSinceRun < c.timeSinceLastRun) return false;
      }
    }

    // Logged moment filter
    if (row.hasLoggedMoment && c.loggedMoment && c.loggedMoment !== 'all') {
      const lastRunKey = {
        insights: 'lastLlmInsightAt',
        perspective: 'lastPerspectiveAt',
      }[row.id];
      const lastRunAt = u[lastRunKey];
      const hasLoggedSince = lastRunAt
        ? u.lastMomentAt && new Date(u.lastMomentAt) > new Date(lastRunAt)
        : u.lastMomentAt != null;
      if (c.loggedMoment === 'yes' && !hasLoggedSince) return false;
      if (c.loggedMoment === 'no' && hasLoggedSince) return false;
    }

    // Marked feedback filter (actions)
    if (row.hasMarkedFeedback && row.markedFeedbackOnly) {
      if (u.actionFeedbackCount < 1) return false;
    }

    // Marked feedback filter (move/fuel with min count)
    if (row.hasMarkedFeedback && row.hasMinMarked && c.hasMarked) {
      const fbKey = { move: 'moveFeedbackCount', fuel: 'fuelFeedbackCount' }[row.id];
      if (fbKey && u[fbKey] < (c.minMarked || 1)) return false;
    }

    return true;
  });
}

function buildPairs(config, users) {
  const pairs = [];
  let pairIndex = 0;

  for (const row of PROCESS_ROWS) {
    const c = config[row.id];
    if (!c || !c.enabled) continue;

    const eligible = filterUsersForRow(row, config, users);
    for (const user of eligible) {
      pairs.push({
        id: `pair-${pairIndex++}`,
        ownerId: user.ownerId,
        userName: user.name || user.email || user.ownerId.slice(0, 8),
        process: row.id,
      });
    }
  }

  return pairs;
}

// ── Sub-components ──

function StatusDot({ color }) {
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0,
    }} />
  );
}

function HistoryEntry({ batch }) {
  const [expanded, setExpanded] = useState(false);
  const hasPairs = batch.pairs && batch.pairs.length > 0;

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12,
      overflow: 'hidden',
    }}>
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 14px',
          cursor: hasPairs ? 'pointer' : 'default',
        }}
        onClick={() => hasPairs && setExpanded(!expanded)}
      >
        {hasPairs && (
          <span style={{ fontSize: 10, color: 'var(--text-muted)', width: 12, textAlign: 'center' }}>
            {expanded ? '▾' : '▸'}
          </span>
        )}
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
          {new Date(batch.startedAt).toLocaleString()}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>{batch.totalPairs} pairs</span>
        <span style={{ color: 'var(--green)' }}>{batch.completedCount} done</span>
        {batch.failedCount > 0 && <span style={{ color: 'var(--red)' }}>{batch.failedCount} failed</span>}
        {batch.incompleteCount > 0 && <span style={{ color: 'var(--yellow)' }}>{batch.incompleteCount} incomplete</span>}
        <span style={{ color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {formatDuration(batch.totalDurationMs)}
        </span>
      </div>
      {expanded && hasPairs && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <th style={thStyle}>User</th>
                <th style={thStyle}>Process</th>
                <th style={thStyle}>Status</th>
                <th style={thStyle}>Duration</th>
                <th style={thStyle}>Time</th>
              </tr>
            </thead>
            <tbody>
              {batch.pairs.map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={tdStyle}><code style={{ fontSize: 10 }}>{p.ownerId?.slice(0, 8)}</code></td>
                  <td style={tdStyle}>{p.process}</td>
                  <td style={tdStyle}>
                    <span style={{
                      color: p.status === 'completed' ? 'var(--green)' : p.status === 'failed' ? 'var(--red)' : p.status === 'skipped' ? 'var(--yellow)' : 'var(--yellow)',
                    }}>
                      {p.status}
                    </span>
                    {p.error && <span style={{ color: 'var(--red)', marginLeft: 6 }} title={p.error}>— {p.error}</span>}
                  </td>
                  <td style={tdStyle}>{formatDuration(p.durationMs)}</td>
                  <td style={tdStyle}>
                    {p.completedAt ? new Date(p.completedAt).toLocaleTimeString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PairTable({ pairs, title, color, selectable, selected, onToggle, onToggleAll, onRunSelected, onRunAll, onRunSingle, running }) {
  if (!pairs.length) return null;

  const allSelected = pairs.length > 0 && pairs.every(p => selected.has(p.id));
  const someSelected = pairs.some(p => selected.has(p.id));

  return (
    <div style={{ marginTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
        <StatusDot color={color} />
        <span style={{ fontWeight: 600, fontSize: 14 }}>{title}</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>({pairs.length})</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {someSelected && (
            <button className="btn btn-sm" onClick={onRunSelected} disabled={running}
              style={{ fontSize: 11, padding: '4px 12px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
              Run Selected ({pairs.filter(p => selected.has(p.id)).length})
            </button>
          )}
          <button className="btn btn-sm" onClick={onRunAll} disabled={running}
            style={{ fontSize: 11, padding: '4px 12px', background: 'rgba(255,255,255,0.08)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>
            Run All {title}
          </button>
        </div>
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto', borderRadius: 8, border: '1px solid var(--border)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
              {selectable && (
                <th style={{ padding: '8px 10px', textAlign: 'left', width: 36 }}>
                  <input type="checkbox" checked={allSelected} onChange={onToggleAll} />
                </th>
              )}
              <th style={thStyle}>User</th>
              <th style={thStyle}>Process</th>
              <th style={thStyle}>{title === 'Completed' ? 'Duration' : 'Reason'}</th>
              <th style={thStyle}>Time</th>
              <th style={{ ...thStyle, width: 60 }}></th>
            </tr>
          </thead>
          <tbody>
            {pairs.map((p) => (
              <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                {selectable && (
                  <td style={tdStyle}>
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => onToggle(p.id)} />
                  </td>
                )}
                <td style={tdStyle}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{p.userName || p.ownerId.slice(0, 8)}</span>
                </td>
                <td style={tdStyle}>
                  <ProcessBadge process={p.process} />
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {p.error
                    ? <span style={{ color: 'var(--red)' }} title={p.error}>{p.error}</span>
                    : p.durationMs ? formatDuration(p.durationMs) : '—'}
                </td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)' }}>
                  {p.completedAt ? new Date(p.completedAt).toLocaleTimeString() : '—'}
                </td>
                <td style={tdStyle}>
                  {onRunSingle && (
                    <button onClick={() => onRunSingle(p)} disabled={running}
                      style={{ fontSize: 10, padding: '2px 8px', background: 'rgba(255,255,255,0.06)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: 4, cursor: 'pointer' }}>
                      Run
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const thStyle = { padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 };
const tdStyle = { padding: '6px 10px' };

function ProcessBadge({ process }) {
  const colors = {
    insights: '#6366f1',
    actions: '#f59e0b',
    move: '#22c55e',
    fuel: '#ef4444',
    perspective: '#06b6d4',
  };
  return (
    <span style={{
      display: 'inline-block', fontSize: 10, fontWeight: 600, padding: '2px 8px',
      borderRadius: 8, background: `${colors[process] || '#666'}20`,
      color: colors[process] || '#888', textTransform: 'uppercase', letterSpacing: 0.3,
    }}>
      {process}
    </span>
  );
}

// ── Main Page ──

export default function LlmPage() {
  const [config, setConfig] = useState(() => {
    const defaults = {};
    for (const row of PROCESS_ROWS) {
      defaults[row.id] = { ...row.defaults };
    }
    if (typeof window !== 'undefined') {
      try {
        const saved = JSON.parse(localStorage.getItem('ops_llm_config'));
        if (saved) {
          for (const id of Object.keys(defaults)) {
            if (saved[id]) defaults[id] = { ...defaults[id], ...saved[id] };
          }
        }
      } catch {}
    }
    return defaults;
  });

  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [pairs, setPairs] = useState([]);
  const [estimate, setEstimate] = useState(null);
  const [maxRuntime, setMaxRuntime] = useState(60);
  const [style, setStyle] = useState(() => {
    if (typeof window !== 'undefined') {
      try { return localStorage.getItem('ops_llm_style') || 'default'; } catch {}
    }
    return 'default';
  });
  const [batchStatus, setBatchStatus] = useState(null);
  const [running, setRunning] = useState(false);
  const [workerOnline, setWorkerOnline] = useState(null);
  const [completedSelected, setCompletedSelected] = useState(new Set());
  const [incompleteSelected, setIncompleteSelected] = useState(new Set());
  const pollerRef = useRef(null);

  // Persist config + style
  useEffect(() => {
    try { localStorage.setItem('ops_llm_config', JSON.stringify(config)); } catch {}
  }, [config]);
  useEffect(() => {
    try { localStorage.setItem('ops_llm_style', style); } catch {}
  }, [style]);

  // Check worker on mount
  useEffect(() => {
    fetch('/api/control/worker-health')
      .then(r => r.json())
      .then(d => setWorkerOnline(d.ok))
      .catch(() => setWorkerOnline(false));
  }, []);

  // Reset config to defaults (clear localStorage overrides)
  const resetDefaults = useCallback(() => {
    const defaults = {};
    for (const row of PROCESS_ROWS) {
      defaults[row.id] = { ...row.defaults };
    }
    localStorage.removeItem('ops_llm_config');
    setConfig(defaults);
  }, []);

  // Fetch users
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res = await fetch(`/api/llm/eligible?t=${Date.now()}`, { cache: 'no-store' });
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  // Recompute pairs when config or users change
  useEffect(() => {
    if (users.length > 0) {
      const newPairs = buildPairs(config, users);
      setPairs(newPairs);
    }
  }, [config, users]);

  // Local estimate (no need to call worker — we compute client-side)
  useEffect(() => {
    if (pairs.length > 0) {
      const MODEL_TIMES = { phi3: 35, gemma3: 45, gemma4: 60, mistral: 50, llama3: 55, llama2: 50, gemma: 40, qwen2: 45 };
      let totalSeconds = 0;
      for (const pair of pairs) {
        const rc = config[pair.process] || {};
        const model = rc.model || 'phi3';
        const baseTime = MODEL_TIMES[model] || 45;
        if (pair.process === 'insights' || pair.process === 'perspective') {
          totalSeconds += Math.round(baseTime * Math.max(0.8, (rc.maxWords || 100) / 100));
        } else {
          totalSeconds += baseTime;
        }
      }
      totalSeconds += pairs.length * 2;
      setEstimate({ totalPairs: pairs.length, estimatedSeconds: totalSeconds, estimatedMinutes: Math.ceil(totalSeconds / 60) });
    } else {
      setEstimate(null);
    }
  }, [pairs, config]);

  // Per-row user counts
  const rowCounts = useMemo(() => {
    const counts = {};
    for (const row of PROCESS_ROWS) {
      counts[row.id] = filterUsersForRow(row, config, users).length;
    }
    return counts;
  }, [config, users]);

  // Update a config field
  const updateConfig = useCallback((rowId, field, value) => {
    setConfig(prev => ({
      ...prev,
      [rowId]: { ...prev[rowId], [field]: value },
    }));
  }, []);

  // Poll batch status
  const startPolling = useCallback(() => {
    if (pollerRef.current) return;
    pollerRef.current = setInterval(async () => {
      try {
        const res = await fetch('/api/llm/status');
        const data = await res.json();
        setBatchStatus(data);
        if (data.status === 'done' || data.status === 'error' || data.status === 'idle') {
          setRunning(false);
          clearInterval(pollerRef.current);
          pollerRef.current = null;
          // Re-fetch eligible users so counts reflect completed work
          fetchUsers();
        }
      } catch {}
    }, 3000);
  }, [fetchUsers]);

  useEffect(() => {
    // Check if there's already a running batch on load
    fetch('/api/llm/status')
      .then(r => r.json())
      .then(data => {
        setBatchStatus(data);
        if (data.status === 'running') {
          setRunning(true);
          startPolling();
        }
      })
      .catch(() => {});
    return () => { if (pollerRef.current) clearInterval(pollerRef.current); };
  }, [startPolling]);

  // Run batch
  const handleRun = useCallback(async () => {
    if (!pairs.length || running) return;
    setRunning(true);
    setCompletedSelected(new Set());
    setIncompleteSelected(new Set());
    try {
      const res = await fetch('/api/llm/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairs, config: { ...config, _style: style }, maxRuntimeMinutes: maxRuntime }),
      });
      const data = await res.json();
      if (data.ok || res.status === 202) {
        startPolling();
      } else {
        setRunning(false);
        alert(data.error || 'Failed to start batch');
      }
    } catch (err) {
      setRunning(false);
      alert(err.message);
    }
  }, [pairs, config, maxRuntime, running, startPolling]);

  // Cancel batch
  const handleCancel = useCallback(async () => {
    try {
      await fetch('/api/llm/status', { method: 'DELETE' });
    } catch {}
  }, []);

  // Re-run helpers
  const handleRerun = useCallback(async (pairIds) => {
    if (!pairIds.length || running) return;
    setRunning(true);
    try {
      const res = await fetch('/api/llm/rerun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pairIds, maxRuntimeMinutes: maxRuntime }),
      });
      const data = await res.json();
      if (data.ok || res.status === 202) {
        startPolling();
      } else {
        setRunning(false);
        alert(data.error || 'Failed to start re-run');
      }
    } catch (err) {
      setRunning(false);
      alert(err.message);
    }
  }, [running, maxRuntime, startPolling]);

  const completedPairs = batchStatus?.completed || [];
  const incompletePairs = [...(batchStatus?.failed || []), ...(batchStatus?.incomplete || [])];

  return (
    <>
      <Head><title>LLM | TriggerMap Ops</title></Head>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>LLM Batch Runner</h2>
          <button
            onClick={() => { resetDefaults(); fetchUsers(); }}
            disabled={running}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 600, cursor: running ? 'not-allowed' : 'pointer',
              background: 'rgba(99,102,241,0.10)', color: 'var(--text)', border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: 6, opacity: running ? 0.5 : 1,
            }}
          >
            Reset Defaults &amp; Refresh
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 24 }}>
          Configure nightly LLM processing — each row filters users independently, creating user-process pairs.
        </p>

        {/* Worker status */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px', marginBottom: 20,
          background: workerOnline ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
          border: `1px solid ${workerOnline ? 'rgba(34,197,94,0.25)' : 'rgba(239,68,68,0.25)'}`,
          borderRadius: 8, fontSize: 13,
        }}>
          <StatusDot color={workerOnline ? 'var(--green)' : workerOnline === false ? 'var(--red)' : '#666'} />
          <span style={{ fontWeight: 600 }}>Local Worker</span>
          <span style={{ color: 'var(--text-muted)' }}>
            {workerOnline ? 'Online' : workerOnline === false ? 'Offline' : 'Checking...'}
          </span>
        </div>

        {/* Voice / Style selector — prominent, above config table */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', marginBottom: 20,
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap' }}>🎙 Voice</span>
          <select
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            style={{
              flex: 1, maxWidth: 260, padding: '6px 10px', fontSize: 13,
              background: 'var(--bg-primary)', color: 'var(--text-primary)',
              border: '1px solid var(--border)', borderRadius: 6,
            }}
          >
            {LLM_STYLES.map((s) => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            Applies to all LLM processes in this batch
          </span>
        </div>

        {/* Config table */}
        <div style={{ overflowX: 'auto', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-card)', marginBottom: 24 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border)' }}>
                <th style={thStyle}>Process</th>
                <th style={thStyle}>On</th>
                <th style={thStyle}>Model</th>
                <th style={thStyle}>Max Words</th>
                <th style={thStyle}>Min Moments</th>
                <th style={thStyle}>Premium</th>
                <th style={thStyle}>Non-Prem</th>
                <th style={thStyle}>Days Since Run</th>
                <th style={thStyle}>Logged?</th>
                <th style={thStyle}>Has Marked</th>
                <th style={thStyle}>Min Marked</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Users</th>
              </tr>
            </thead>
            <tbody>
              {PROCESS_ROWS.map((row) => {
                const c = config[row.id];
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', opacity: c.enabled ? 1 : 0.4 }}>
                    <td style={{ ...tdStyle, fontWeight: 600, whiteSpace: 'nowrap' }}>
                      <ProcessBadge process={row.id} />
                    </td>
                    <td style={tdStyle}>
                      <input type="checkbox" checked={c.enabled} onChange={(e) => updateConfig(row.id, 'enabled', e.target.checked)} />
                    </td>
                    <td style={tdStyle}>
                      <select value={c.model || 'phi3'} onChange={(e) => updateConfig(row.id, 'model', e.target.value)}
                        style={selectStyle} disabled={!c.enabled}>
                        {LLM_MODELS.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td style={tdStyle}>
                      {row.hasMaxWords ? (
                        <input type="number" min={50} max={500} step={25} value={c.maxWords || 100}
                          onChange={(e) => updateConfig(row.id, 'maxWords', parseInt(e.target.value, 10) || 100)}
                          style={inputStyle} disabled={!c.enabled} />
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      {row.hasMinMoments ? (
                        <input type="number" min={1} max={50} value={c.minMoments || 1}
                          onChange={(e) => updateConfig(row.id, 'minMoments', Math.max(1, parseInt(e.target.value, 10) || 1))}
                          style={inputStyle} disabled={!c.enabled} />
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      {row.hasPremium ? (
                        <input type="checkbox" checked={c.premium !== false}
                          onChange={(e) => updateConfig(row.id, 'premium', e.target.checked)}
                          disabled={!c.enabled} />
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      {row.hasNonPremium ? (
                        <input type="checkbox" checked={!!c.nonPremium}
                          onChange={(e) => updateConfig(row.id, 'nonPremium', e.target.checked)}
                          disabled={!c.enabled} />
                      ) : <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>n/a</span>}
                    </td>
                    <td style={tdStyle}>
                      {row.hasTimeSinceLastRun ? (
                        <input type="number" min={0} max={30} value={c.timeSinceLastRun ?? 6}
                          onChange={(e) => updateConfig(row.id, 'timeSinceLastRun', parseInt(e.target.value, 10) || 0)}
                          style={inputStyle} disabled={!c.enabled} />
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      {row.hasLoggedMoment ? (
                        <select value={c.loggedMoment || 'all'} onChange={(e) => updateConfig(row.id, 'loggedMoment', e.target.value)}
                          style={selectStyle} disabled={!c.enabled}>
                          <option value="all">All</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                        </select>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      {row.hasMarkedFeedback ? (
                        row.markedFeedbackOnly ? (
                          <input type="checkbox" checked={true} disabled title="Required for actions" />
                        ) : (
                          <select value={c.hasMarked ? 'yes' : 'no'}
                            onChange={(e) => updateConfig(row.id, 'hasMarked', e.target.value === 'yes')}
                            style={selectStyle} disabled={!c.enabled}>
                            <option value="yes">Yes</option>
                            <option value="no">No</option>
                          </select>
                        )
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={tdStyle}>
                      {row.hasMinMarked ? (
                        <input type="number" min={1} max={20} value={c.minMarked || 1}
                          onChange={(e) => updateConfig(row.id, 'minMarked', Math.max(1, parseInt(e.target.value, 10) || 1))}
                          style={inputStyle} disabled={!c.enabled || !c.hasMarked} />
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      <span style={{ color: c.enabled ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {c.enabled ? (usersLoading ? '...' : rowCounts[row.id] || 0) : '—'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Estimate + Run controls */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 16, padding: '16px 20px',
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 24,
          flexWrap: 'wrap',
        }}>
          {/* Pairs summary */}
          <div style={{ flex: 1, minWidth: 200 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Total Pairs
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
              {pairs.length}
            </div>
            {estimate && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Est. {formatMinutes(estimate.estimatedMinutes)}
              </div>
            )}
          </div>

          {/* Per-process breakdown */}
          <div style={{ display: 'flex', gap: 16, flex: 2 }}>
            {PROCESS_ROWS.map(row => (
              <div key={row.id} style={{ textAlign: 'center' }}>
                <ProcessBadge process={row.id} />
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {config[row.id]?.enabled ? rowCounts[row.id] || 0 : 0}
                </div>
              </div>
            ))}
          </div>

          {/* Max runtime input */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Max Runtime (min)
            </div>
            <input type="number" min={1} max={480} value={maxRuntime}
              onChange={(e) => setMaxRuntime(Math.max(1, parseInt(e.target.value, 10) || 60))}
              style={{ ...inputStyle, width: 80, fontSize: 16, fontWeight: 600, textAlign: 'center' }} />
          </div>

          {/* Run / Cancel button */}
          <div>
            {running ? (
              <button onClick={handleCancel}
                style={{ padding: '10px 24px', fontSize: 13, fontWeight: 600, background: 'var(--red)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                Cancel Batch
              </button>
            ) : (
              <button onClick={handleRun} disabled={!pairs.length || !workerOnline}
                style={{
                  padding: '10px 24px', fontSize: 13, fontWeight: 600, border: 'none', borderRadius: 8, cursor: 'pointer',
                  background: pairs.length && workerOnline ? 'var(--accent)' : 'var(--border)',
                  color: pairs.length && workerOnline ? '#fff' : 'var(--text-muted)',
                }}>
                Run Batch
              </button>
            )}
          </div>
        </div>

        {/* Running progress */}
        {running && batchStatus && batchStatus.status === 'running' && (
          <div style={{
            padding: '16px 20px', background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)',
            borderRadius: 10, marginBottom: 24,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 600 }}>Running...</span>
              <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>
                {batchStatus.progress}
              </span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
                Elapsed: {formatDuration(batchStatus.elapsed)}
              </span>
            </div>
            {/* Progress bar */}
            <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 6, overflow: 'hidden' }}>
              <div style={{
                height: '100%', borderRadius: 4, transition: 'width 0.5s',
                background: 'var(--accent)',
                width: `${((batchStatus.completedCount + batchStatus.failedCount) / batchStatus.totalPairs) * 100}%`,
              }} />
            </div>
            {batchStatus.running && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                Current: <span style={{ color: 'var(--text-secondary)' }}>{batchStatus.running.ownerId.slice(0, 8)}</span>
                {' / '}
                <ProcessBadge process={batchStatus.running.process} />
              </div>
            )}
          </div>
        )}

        {/* Results: Completed */}
        <PairTable
          pairs={completedPairs}
          title="Completed"
          color="var(--green)"
          selectable
          selected={completedSelected}
          onToggle={(id) => setCompletedSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
          onToggleAll={() => setCompletedSelected(prev => prev.size === completedPairs.length ? new Set() : new Set(completedPairs.map(p => p.id)))}
          onRunSelected={() => handleRerun([...completedSelected])}
          onRunAll={() => handleRerun(completedPairs.map(p => p.id))}
          onRunSingle={(p) => handleRerun([p.id])}
          running={running}
        />

        {/* Results: Incomplete / Failed */}
        <PairTable
          pairs={incompletePairs}
          title="Incomplete / Failed"
          color="var(--red)"
          selectable
          selected={incompleteSelected}
          onToggle={(id) => setIncompleteSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
          onToggleAll={() => setIncompleteSelected(prev => prev.size === incompletePairs.length ? new Set() : new Set(incompletePairs.map(p => p.id)))}
          onRunSelected={() => handleRerun([...incompleteSelected])}
          onRunAll={() => handleRerun(incompletePairs.map(p => p.id))}
          onRunSingle={(p) => handleRerun([p.id])}
          running={running}
        />

        {/* Batch history */}
        {batchStatus?.history?.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Batch History (last 3 days)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {batchStatus.history.map((h) => (
                <HistoryEntry key={h.id} batch={h} />
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

const inputStyle = {
  width: 60, padding: '4px 6px', fontSize: 12,
  background: 'var(--bg-primary)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 4,
  fontFamily: 'var(--font-mono)',
};

const selectStyle = {
  padding: '4px 6px', fontSize: 11,
  background: 'var(--bg-primary)', color: 'var(--text-primary)',
  border: '1px solid var(--border)', borderRadius: 4,
};
