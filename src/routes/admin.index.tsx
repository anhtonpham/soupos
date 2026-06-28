import { useState, type CSSProperties } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { adminOverviewFn } from '../server/admin';

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
});

type Row = {
  slug: string; name: string; priceCents: number;
  ticketLimit: number; sold: number; held: number; available: number; revenueCents: number;
};

function AdminDashboard() {
  const overview = useServerFn(adminOverviewFn);
  const [adminToken, setAdminToken] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setError(null);
    const res = await overview({ data: { adminToken } });
    if (!res.authorized) return setError('Wrong admin token.');
    setRows(res.events);
  }

  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: 24 }}>
      <h1>Admin dashboard</h1>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input style={input} placeholder="Admin token" value={adminToken} onChange={(e) => setAdminToken(e.target.value)} />
        <button style={primary} onClick={load}>Load</button>
      </div>
      {error && <p style={{ color: '#b91c1c' }}>{error}</p>}
      {rows && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Drop', 'Sold', 'Held', 'Available', 'Limit', 'Revenue'].map((h) => <th key={h} style={th}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.slug}>
                <td style={td}>{r.name}</td>
                <td style={td}>{r.sold}</td>
                <td style={td}>{r.held}</td>
                <td style={td}>{r.available}</td>
                <td style={td}>{r.ticketLimit}</td>
                <td style={td}>${(r.revenueCents / 100).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ color: '#78716c', fontSize: 13, marginTop: 16 }}>
        Stub: a full build adds create/edit-drop forms, the buyer list, CSV export, and refunds.
      </p>
    </main>
  );
}

const input: CSSProperties = { flex: 1, padding: '10px 12px', border: '1px solid #d6d3d1', borderRadius: 8, fontSize: 16 };
const primary: CSSProperties = { background: '#1c1917', color: '#fff', padding: '10px 16px', border: 0, borderRadius: 8, fontWeight: 700, cursor: 'pointer' };
const th: CSSProperties = { textAlign: 'left', borderBottom: '2px solid #e7e5e4', padding: 8 };
const td: CSSProperties = { borderBottom: '1px solid #f0efee', padding: 8 };
