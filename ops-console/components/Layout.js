import Link from 'next/link';
import { useRouter } from 'next/router';
import { useAuth } from '../hooks/useData';

const NAV = [
  {
    group: 'Overview',
    items: [
      { label: 'Dashboard', href: '/', icon: '◉' },
    ],
  },
  {
    group: 'Operations',
    items: [
      { label: 'Control Panel', href: '/control', icon: '⚡' },
      { label: 'Diagnostics', href: '/diagnostics', icon: '⚙' },
    ],
  },
  {
    group: 'Intelligence',
    items: [
      { label: 'KPIs & Signals', href: '/intelligence', icon: '◆' },
      { label: 'Users', href: '/users', icon: '●' },
      { label: 'Insights', href: '/insights', icon: '✦' },
    ],
  },
];

export default function Layout({ children }) {
  const router = useRouter();
  const { logout } = useAuth();

  return (
    <div className="ops-layout">
      <nav className="ops-sidebar">
        <div className="ops-sidebar-header">
          <h1>TriggerMap</h1>
          <div className="subtitle">Ops Console</div>
        </div>
        {NAV.map((group) => (
          <div key={group.group} className="ops-nav-group">
            <div className="ops-nav-group-label">{group.group}</div>
            {group.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`ops-nav-item ${router.pathname === item.href ? 'active' : ''}`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </Link>
            ))}
          </div>
        ))}
        <div className="ops-nav-group" style={{ marginTop: 'auto', paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <button
            onClick={logout}
            className="ops-nav-item"
            style={{ border: 'none', background: 'none', width: '100%', textAlign: 'left', font: 'inherit' }}
          >
            <span>⏻</span>
            <span>Logout</span>
          </button>
        </div>
      </nav>
      <main className="ops-main">
        {children}
      </main>
    </div>
  );
}
