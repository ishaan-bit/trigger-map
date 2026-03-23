import Head from 'next/head';
import { useState, useMemo } from 'react';
import { useFetch } from '../hooks/useData';
import { formatDateTime, timeAgo } from '../lib/utils';

export default function PushPage() {
  const { data, loading, refetch } = useFetch('/api/metrics/users');

  // Compose fields
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  // Selection
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');

  // Send state
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState(null);

  const users = data?.users || [];

  const filtered = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((u) =>
      (u.ownerId && u.ownerId.toLowerCase().includes(q)) ||
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.name && u.name.toLowerCase().includes(q))
    );
  }, [users, search]);

  const toggleUser = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (filtered.length === 0) return;
    const allSelected = filtered.every((u) => selected.has(u.ownerId));
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((u) => next.delete(u.ownerId));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((u) => next.add(u.ownerId));
        return next;
      });
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  const handleSend = async () => {
    if (!title.trim() || !body.trim()) {
      showToast('Title and body are required', 'error');
      return;
    }
    if (selected.size === 0) {
      showToast('Select at least one user', 'error');
      return;
    }

    setSending(true);
    try {
      const res = await fetch('/api/push/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: Array.from(selected),
          title: title.trim(),
          body: body.trim(),
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Send failed');

      const parts = [`Targeted ${result.targeted} user(s)`];
      if (result.sent > 0) parts.push(`${result.sent} delivered`);
      if (result.skipped > 0) parts.push(`${result.skipped} skipped (no token)`);
      showToast(parts.join(' · '));

      if (result.note) {
        setTimeout(() => showToast(result.note, 'info'), 500);
      }
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSending(false);
    }
  };

  const inputStyle = {
    width: '100%', padding: '8px 10px', background: 'var(--bg-primary)',
    border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)',
    fontSize: 13, fontFamily: 'inherit',
  };

  const allFilteredSelected = filtered.length > 0 && filtered.every((u) => selected.has(u.ownerId));

  return (
    <>
      <Head><title>Push Notifications — TriggerMap Ops</title></Head>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, right: 20, zIndex: 2000,
          padding: '10px 16px', borderRadius: 8, fontSize: 13, fontWeight: 500, maxWidth: 400,
          background: toast.type === 'error' ? 'var(--red)' : toast.type === 'info' ? 'var(--blue, #3b82f6)' : 'var(--green)',
          color: '#fff', boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {toast.msg}
        </div>
      )}

      <div className="ops-page-header">
        <h2>Push Notifications</h2>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selected.size} user(s) selected</span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
        {/* Left: Compose + Preview */}
        <div>
          <div className="panel">
            <div className="panel-header"><h3>Compose</h3></div>
            <div className="panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Title</label>
                <input
                  type="text" value={title} onChange={(e) => setTitle(e.target.value)}
                  style={inputStyle} placeholder="Notification title" maxLength={100}
                />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4 }}>Body</label>
                <textarea
                  value={body} onChange={(e) => setBody(e.target.value)}
                  style={{ ...inputStyle, minHeight: 80, resize: 'vertical', fontFamily: 'inherit' }}
                  placeholder="Notification body" maxLength={500}
                />
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right' }}>
                {body.length}/500
              </div>
            </div>
          </div>

          {/* Preview */}
          {(title.trim() || body.trim()) && (
            <div className="panel" style={{ marginTop: 16 }}>
              <div className="panel-header"><h3>Preview</h3></div>
              <div className="panel-body">
                <div style={{
                  background: 'var(--bg-primary)', borderRadius: 12, padding: 14,
                  border: '1px solid var(--border)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: 'var(--blue, #3b82f6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: '#fff' }}>T</div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>TriggerMap · now</span>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{title || 'Title'}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{body || 'Body text'}</div>
                </div>
              </div>
            </div>
          )}

          {/* Send */}
          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-primary"
              style={{ width: '100%', padding: '10px 0', fontSize: 14 }}
              disabled={sending || !title.trim() || !body.trim() || selected.size === 0}
              onClick={handleSend}
            >
              {sending ? 'Sending...' : `Send to ${selected.size} user(s)`}
            </button>
            {selected.size === 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'center', marginTop: 6 }}>
                Select users from the panel on the right
              </div>
            )}
          </div>
        </div>

        {/* Right: User Selection */}
        <div className="panel">
          <div className="panel-header" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3>Users</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {loading ? 'Loading...' : `${filtered.length} shown · ${users.length} total`}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="text" placeholder="Search by email, userId, or name..."
                value={search} onChange={(e) => setSearch(e.target.value)}
                style={{ ...inputStyle, flex: 1 }}
              />
              <button className="btn btn-ghost btn-sm" onClick={refetch} disabled={loading} style={{ whiteSpace: 'nowrap' }}>
                ↻
              </button>
            </div>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {/* Select all header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
              borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)',
            }}>
              <input
                type="checkbox"
                checked={allFilteredSelected}
                onChange={toggleAll}
                style={{ accentColor: 'var(--blue, #3b82f6)' }}
              />
              <span style={{ cursor: 'pointer' }} onClick={toggleAll}>
                {allFilteredSelected ? 'Deselect all' : `Select all ${filtered.length}`}
              </span>
              {selected.size > 0 && (
                <button
                  className="btn btn-ghost btn-sm"
                  style={{ marginLeft: 'auto', fontSize: 11 }}
                  onClick={() => setSelected(new Set())}
                >
                  Clear ({selected.size})
                </button>
              )}
            </div>

            {/* User list */}
            <div style={{ maxHeight: 480, overflowY: 'auto' }}>
              {filtered.length === 0 && !loading && (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  {search ? 'No users match search' : 'No users found'}
                </div>
              )}
              {filtered.map((u) => (
                <label
                  key={u.ownerId}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px',
                    borderBottom: '1px solid var(--border)', cursor: 'pointer',
                    background: selected.has(u.ownerId) ? 'rgba(59,130,246,0.06)' : 'transparent',
                    transition: 'background 0.15s',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(u.ownerId)}
                    onChange={() => toggleUser(u.ownerId)}
                    style={{ accentColor: 'var(--blue, #3b82f6)', flexShrink: 0 }}
                  />
                  {/* Green/gray online dot */}
                  <span style={{
                    width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                    background: u.hasDevices ? '#34c759' : '#6b7280',
                    boxShadow: u.hasDevices ? '0 0 6px rgba(52,199,89,0.5)' : 'none',
                  }} title={u.hasDevices ? 'Reachable — has push token' : 'Unreachable — signed out'} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                      <span style={{ fontWeight: 500 }}>
                        {u.email || `anon_${u.ownerId.slice(0, 8)}`}
                      </span>
                      {u.isAnonymous && (
                        <span style={{
                          fontSize: 10, padding: '1px 5px', borderRadius: 4,
                          background: 'rgba(107,114,128,0.15)', color: 'var(--text-muted)',
                        }}>anon</span>
                      )}
                      {u.subscription === 'active' && (
                        <span style={{
                          fontSize: 10, padding: '1px 5px', borderRadius: 4,
                          background: 'rgba(52,199,89,0.15)', color: 'var(--green)',
                        }}>premium</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {u.ownerId.slice(0, 16)}...
                      {u.name ? ` · ${u.name}` : ''}
                      {u.momentCount > 0 ? ` · ${u.momentCount} moments` : ''}
                      {u.createdAt ? ` · ${timeAgo(u.createdAt)}` : ''}
                    </div>
                    {/* Device meta row */}
                    {u.hasDevices && u.devices?.length > 0 ? (
                      <div style={{ display: 'flex', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                        {u.devices.map((d, idx) => (
                          <span key={idx} style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: 'rgba(52,199,89,0.1)', color: 'var(--green)',
                            display: 'inline-flex', alignItems: 'center', gap: 4,
                          }}>
                            <span>{d.platform === 'ios' ? '🍎' : d.platform === 'android' ? '🤖' : '💻'}</span>
                            <span style={{ fontWeight: 600, textTransform: 'capitalize' }}>{d.platform}</span>
                            <span style={{ color: 'var(--text-muted)' }}>({d.deviceId}…)</span>
                            {d.updatedAt && (
                              <span style={{ color: 'var(--text-muted)' }}>· {timeAgo(d.updatedAt)}</span>
                            )}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3, fontStyle: 'italic' }}>
                        No device — signed out or app not opened
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
