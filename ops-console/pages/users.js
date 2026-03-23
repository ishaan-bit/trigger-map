import Head from 'next/head';
import { useState } from 'react';
import { useFetch } from '../hooks/useData';
import MetricCard from '../components/MetricCard';
import { formatDateTime } from '../lib/utils';

function ConfirmModal({ title, message, danger, onConfirm, onCancel, children }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, maxWidth: 440, width: '100%' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 16 }}>{title}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 16px' }}>{message}</p>
        {children}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'} btn-sm`} onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

function CreateUserModal({ onClose, onCreated }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const submit = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/users/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'create-user', email, password, name: name || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      onCreated(data);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)',
    borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, maxWidth: 440, width: '100%' }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 16 }}>Create Email User</h3>
        {err && <div style={{ color: 'var(--red)', fontSize: 12, marginBottom: 12 }}>{err}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Email</label>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={inputStyle} placeholder="user@example.com" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Password (min 8 chars)</label>
            <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} style={inputStyle} placeholder="••••••••" />
          </div>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Name (optional)</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} placeholder="Display name" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={submit} disabled={busy || !email || password.length < 8}>
            {busy ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

function UserActionsCell({ user, onAction }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={{ position: 'relative' }}>
      <button
        className="btn btn-ghost btn-sm"
        onClick={() => setOpen(!open)}
        style={{ fontSize: 16, lineHeight: 1, padding: '2px 8px' }}
      >
        ⋯
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 99 }} onClick={() => setOpen(false)} />
          <div style={{
            position: 'absolute', right: 0, top: '100%', background: 'var(--bg-secondary)',
            border: '1px solid var(--border)', borderRadius: 8, padding: 4, zIndex: 100,
            minWidth: 180, boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
          }}>
            {user.hasPassword && (
              <ActionMenuItem label="Reset Password" onClick={() => { setOpen(false); onAction('reset-password', user); }} />
            )}
            <ActionMenuItem
              label={user.subscription === 'active' || user.subscription === 'grace_period' ? 'Remove Premium' : 'Grant Premium'}
              onClick={() => { setOpen(false); onAction('set-subscription', user); }}
            />
            <ActionMenuItem label="Clear All Data" color="var(--yellow)" onClick={() => { setOpen(false); onAction('clear-data', user); }} />
            <ActionMenuItem label="Delete Account" color="var(--red)" onClick={() => { setOpen(false); onAction('delete-account', user); }} />
          </div>
        </>
      )}
    </div>
  );
}

function ActionMenuItem({ label, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', background: 'none',
        border: 'none', color: color || 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
        borderRadius: 4,
      }}
      onMouseEnter={(e) => e.target.style.background = 'var(--bg-primary)'}
      onMouseLeave={(e) => e.target.style.background = 'none'}
    >
      {label}
    </button>
  );
}

export default function UsersPage() {
  const { data, loading, error, refetch } = useFetch('/api/metrics/users');
  const [modal, setModal] = useState(null); // { type, user, ... }
  const [showCreate, setShowCreate] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [toast, setToast] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const showToast = (msg, isError) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 3000);
  };

  const runAction = async (action, params) => {
    setActionBusy(true);
    try {
      const res = await fetch('/api/users/manage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...params }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      showToast(`${action} completed`);
      setModal(null);
      setNewPassword('');
      refetch();
    } catch (e) {
      showToast(e.message, true);
    } finally {
      setActionBusy(false);
    }
  };

  const handleAction = (type, user) => {
    if (type === 'reset-password') {
      setNewPassword('');
      setModal({ type, user });
    } else if (type === 'set-subscription') {
      const isPremium = user.subscription === 'active' || user.subscription === 'grace_period';
      setModal({ type, user, newSub: isPremium ? 'none' : 'active' });
    } else if (type === 'clear-data') {
      setModal({ type, user });
    } else if (type === 'delete-account') {
      setModal({ type, user });
    }
  };

  const confirmAction = () => {
    if (!modal) return;
    if (modal.type === 'reset-password') {
      runAction('reset-password', { ownerId: modal.user.ownerId, password: newPassword });
    } else if (modal.type === 'set-subscription') {
      runAction('set-subscription', { ownerId: modal.user.ownerId, subscription: modal.newSub });
    } else if (modal.type === 'clear-data') {
      runAction('clear-data', { ownerId: modal.user.ownerId });
    } else if (modal.type === 'delete-account') {
      runAction('delete-account', { ownerId: modal.user.ownerId });
    }
  };

  const modalTitle = {
    'reset-password': 'Reset Password',
    'set-subscription': modal?.newSub === 'active' ? 'Grant Premium' : 'Remove Premium',
    'clear-data': 'Clear All User Data',
    'delete-account': 'Delete Account',
  };

  const modalMessage = {
    'reset-password': `Set a new password for ${modal?.user?.email || modal?.user?.ownerId}.`,
    'set-subscription': modal?.newSub === 'active'
      ? `Grant premium access to ${modal?.user?.email || modal?.user?.ownerId}. Expires in 1 year.`
      : `Remove premium access from ${modal?.user?.email || modal?.user?.ownerId}. They will revert to the free tier.`,

    'clear-data': `This will delete all moments, reports, and insights for ${modal?.user?.email || modal?.user?.ownerId}. The account itself will remain.`,
    'delete-account': `This will permanently delete the account and ALL data for ${modal?.user?.email || modal?.user?.ownerId}. This cannot be undone.`,
  };

  return (
    <>
      <Head><title>Users — TriggerMap Ops</title></Head>

      <div className="ops-page-header">
        <h2>User Registry</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" onClick={() => setShowCreate(true)}>+ Create User</button>
          <button className="btn btn-ghost btn-sm" onClick={refetch} disabled={loading}>Refresh</button>
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', top: 16, right: 16, zIndex: 2000, padding: '10px 20px',
          background: toast.isError ? 'var(--red)' : 'var(--green)', color: '#fff',
          borderRadius: 8, fontSize: 13, fontWeight: 600, boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toast.msg}
        </div>
      )}

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
                      <th>Password</th>
                      <th>Tier</th>
                      <th>Moments</th>
                      <th>Today</th>
                      <th>Created</th>
                      <th style={{ width: 50 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.ownerId}>
                        <td className="mono" style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis' }} title={u.ownerId}>{u.ownerId.slice(0, 8)}…</td>
                        <td>{u.name || '—'}</td>
                        <td className="mono" style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {u.email || <span style={{ color: 'var(--text-muted)' }}>—</span>}
                        </td>
                        <td>
                          <span className={`status-badge ${u.provider === 'google' ? 'healthy' : u.provider === 'email' ? 'degraded' : 'critical'}`}>
                            <span className="dot" />
                            {u.provider || 'anon'}
                          </span>
                        </td>
                        <td>
                          {u.hasPassword ? (
                            <span style={{ fontSize: 11, color: 'var(--green)' }}>●  Set</span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {u.subscription === 'active' || u.subscription === 'grace_period' ? (
                            <span className="status-badge healthy"><span className="dot" />Premium</span>
                          ) : (
                            <span className="status-badge critical"><span className="dot" />Regular</span>
                          )}
                        </td>
                        <td className="mono">{u.momentCount}</td>
                        <td className="mono" style={{ color: u.todayMoments > 0 ? 'var(--green)' : 'var(--text-muted)' }}>
                          {u.todayMoments}
                        </td>
                        <td className="mono">{formatDateTime(u.createdAt)}</td>
                        <td>
                          <UserActionsCell user={u} onAction={handleAction} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create User Modal */}
      {showCreate && (
        <CreateUserModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); showToast('User created'); refetch(); }}
        />
      )}

      {/* Action Confirmation Modals */}
      {modal && (
        <ConfirmModal
          title={modalTitle[modal.type]}
          message={modalMessage[modal.type]}
          danger={modal.type === 'delete-account' || modal.type === 'clear-data'}
          onConfirm={confirmAction}
          onCancel={() => { setModal(null); setNewPassword(''); }}
        >
          {modal.type === 'reset-password' && (
            <div style={{ marginTop: 8 }}>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>New Password (min 8 chars)</label>
              <input
                type="text"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{
                  width: '100%', padding: '8px 10px', background: 'var(--bg-primary)', border: '1px solid var(--border)',
                  borderRadius: 6, color: 'var(--text-primary)', fontSize: 13, fontFamily: 'var(--font-mono)',
                }}
                placeholder="New password"
                autoFocus
              />
              {newPassword && newPassword.length < 8 && (
                <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 4 }}>Must be at least 8 characters</div>
              )}
            </div>
          )}
        </ConfirmModal>
      )}
    </>
  );
}
