import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';

const KEY = 'sl_admin_token';

export function setAdminToken(token: string) {
  sessionStorage.setItem(KEY, token);
}

export function clearAdminToken() {
  sessionStorage.removeItem(KEY);
}

/**
 * Reads the admin token from sessionStorage (client-only). Bounces to the login
 * gate if absent. Returns `undefined` until mounted, then the token string.
 * The authoritative check is the server fn's token comparison — this is just so
 * pages don't render without a token to send.
 */
export function useAdminToken(): string | undefined {
  const navigate = useNavigate();
  const [token, setToken] = useState<string | undefined>(undefined);
  useEffect(() => {
    const t = sessionStorage.getItem(KEY);
    if (!t) void navigate({ to: '/admin/login' });
    else setToken(t);
  }, [navigate]);
  return token;
}

type NavKey = 'dashboard' | 'drops';

export function AdminShell({ active, children }: { active: NavKey; children: ReactNode }) {
  const navigate = useNavigate();
  return (
    <div className="sl-admin">
      <div className="sl-admin-wrap">
        <aside className="sl-rail">
          <div className="sl-rail-brand">
            <span className="m"><i /></span>
            <b>Soupleaf</b>
          </div>
          <nav className="sl-rail-nav">
            <Link to="/admin" className="sl-rail-link" data-active={active === 'dashboard'}>▦ Dashboard</Link>
            <Link to="/admin/events/new" className="sl-rail-link" data-active={active === 'drops'}>＋ New drop</Link>
            <button
              type="button"
              className="sl-rail-link"
              style={{ background: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }}
              onClick={() => { clearAdminToken(); void navigate({ to: '/admin/login' }); }}
            >
              ⏏ Sign out
            </button>
          </nav>
        </aside>
        <main className="sl-admin-main">{children}</main>
      </div>
    </div>
  );
}

export function Spill({ status }: { status: string }) {
  return <span className={`sl-spill ${status}`}>{status[0].toUpperCase() + status.slice(1)}</span>;
}
