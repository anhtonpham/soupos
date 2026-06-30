import { useState } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { adminOverviewFn } from '../server/admin';
import { setAdminToken } from '../components/admin';

export const Route = createFileRoute('/admin/login')({
  component: AdminLogin,
});

function AdminLogin() {
  const navigate = useNavigate();
  const overview = useServerFn(adminOverviewFn);
  const [token, setToken] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function signIn() {
    if (!token.trim()) return;
    setBusy(true);
    setError(null);
    // Validate the token by making the first gated call.
    const res = await overview({ data: { adminToken: token.trim() } });
    setBusy(false);
    if (!res.authorized) {
      setError('That admin token wasn’t accepted.');
      return;
    }
    setAdminToken(token.trim());
    void navigate({ to: '/admin' });
  }

  return (
    <main style={{ padding: '8px 20px' }}>
      <div className="sl-gate">
        <div className="ic">🔑</div>
        <h1>Soupleaf Admin</h1>
        <p>Enter the admin token to manage drops, orders and refunds.</p>
        <div style={{ marginTop: 22 }}>
          <input
            className="sl-input"
            type="password"
            placeholder="Admin token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && signIn()}
          />
        </div>
        <button className="sl-button sl-button-primary" style={{ marginTop: 16, background: '#5bbf4f', color: '#0f1d09' }} disabled={busy} onClick={signIn}>
          {busy ? 'Checking…' : 'Sign in →'}
        </button>
        {error && <p className="sl-err">{error}</p>}
        <div className="sl-gate-note">STORED ON THIS DEVICE FOR THIS SESSION</div>
      </div>
    </main>
  );
}
