import { useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { adminOverviewFn } from '../server/admin';
import { AdminShell, Spill, useAdminToken } from '../components/admin';

export const Route = createFileRoute('/admin/')({
  component: AdminDashboard,
});

type Row = {
  id: number; slug: string; name: string; priceCents: number; currency: string;
  saleStartsAt: string | Date; saleEndsAt: string | Date | null;
  ticketLimit: number; sold: number; held: number; available: number; revenueCents: number;
};

function statusOf(r: Row): string {
  const now = Date.now();
  const starts = new Date(r.saleStartsAt).getTime();
  const ends = r.saleEndsAt ? new Date(r.saleEndsAt).getTime() : null;
  if (now < starts) return 'upcoming';
  if (ends != null && now > ends) return 'ended';
  return r.available <= 0 ? 'soldout' : 'onsale';
}

function dollars(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}

function downloadCsv(rows: Row[]) {
  const head = ['drop', 'slug', 'status', 'price', 'sold', 'held', 'available', 'limit', 'revenue'];
  const body = rows.map((r) => [
    r.name, r.slug, statusOf(r), dollars(r.priceCents), r.sold, r.held, r.available, r.ticketLimit, dollars(r.revenueCents),
  ]);
  const csv = [head, ...body].map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'soupleaf-drops.csv';
  a.click();
  URL.revokeObjectURL(url);
}

function AdminDashboard() {
  const token = useAdminToken();
  const overview = useServerFn(adminOverviewFn);
  const [rows, setRows] = useState<Row[] | null>(null);

  useEffect(() => {
    if (!token) return;
    void overview({ data: { adminToken: token } }).then((res) => {
      if (res.authorized) setRows(res.events as Row[]);
    });
  }, [token, overview]);

  const totalRevenue = rows?.reduce((s, r) => s + r.revenueCents, 0) ?? 0;
  const totalSold = rows?.reduce((s, r) => s + r.sold, 0) ?? 0;
  const totalLimit = rows?.reduce((s, r) => s + r.ticketLimit, 0) ?? 0;
  const totalHeld = rows?.reduce((s, r) => s + r.held, 0) ?? 0;
  const totalAvail = rows?.reduce((s, r) => s + r.available, 0) ?? 0;
  const cols = '2.4fr 1.1fr .8fr 1.6fr 1fr';

  return (
    <AdminShell active="dashboard">
      <div className="sl-admin-head">
        <div>
          <h1>Drops</h1>
          <div className="sub">Live across all events · refresh to update counts</div>
        </div>
        <div className="sl-admin-actions">
          <button className="sl-mini-btn" disabled={!rows} onClick={() => rows && downloadCsv(rows)}>Export CSV</button>
          <Link to="/admin/events/new" className="sl-mini-btn primary">+ New drop</Link>
        </div>
      </div>

      <div className="sl-stats">
        <div className="sl-stat"><div className="k">Revenue (paid)</div><div className="v">{dollars(totalRevenue)}</div><div className="n">{totalSold} passes sold</div></div>
        <div className="sl-stat"><div className="k">Passes sold</div><div className="v">{totalSold}</div><div className="n">of {totalLimit} total</div></div>
        <div className="sl-stat"><div className="k">Held right now</div><div className="v amber">{totalHeld}</div><div className="n">pending checkout</div></div>
        <div className="sl-stat"><div className="k">Available</div><div className="v green">{totalAvail}</div><div className="n">across all drops</div></div>
      </div>

      <div className="sl-table">
        <div className="sl-thead" style={{ gridTemplateColumns: cols }}>
          <span>DROP</span><span>STATUS</span><span>PRICE</span><span>SOLD / HELD / AVAIL</span><span>REVENUE</span>
        </div>
        {!rows ? (
          <div className="sl-trow" style={{ gridTemplateColumns: '1fr' }}>Loading…</div>
        ) : rows.length === 0 ? (
          <div className="sl-trow" style={{ gridTemplateColumns: '1fr' }}>No drops yet — create one.</div>
        ) : (
          rows.map((r) => (
            <div className="sl-trow" key={r.id} style={{ gridTemplateColumns: cols }}>
              <div>
                <Link to="/admin/events/$id" params={{ id: String(r.id) }} className="row-name">{r.name}</Link>
                <div className="sl-mono">/e/{r.slug}</div>
              </div>
              <div><Spill status={statusOf(r)} /></div>
              <div style={{ fontWeight: 600 }}>{dollars(r.priceCents)}</div>
              <div className="sl-mono" style={{ color: '#566a52' }}>{r.sold} / {r.held} / {r.available}</div>
              <div style={{ fontWeight: 700 }}>{dollars(r.revenueCents)}</div>
            </div>
          ))
        )}
      </div>
    </AdminShell>
  );
}
