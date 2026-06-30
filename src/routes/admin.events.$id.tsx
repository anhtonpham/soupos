import { useCallback, useEffect, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { adminEventDetailFn, refundOrderFn, cancelHoldFn } from '../server/admin';
import { AdminShell, Spill, useAdminToken } from '../components/admin';

export const Route = createFileRoute('/admin/events/$id')({
  component: DropDetail,
});

type Detail = Extract<Awaited<ReturnType<typeof adminEventDetailFn>>, { found: true }>;
type Order = Detail['orders'][number];

function dollars(cents: number | null) {
  return cents == null ? '—' : `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function downloadCsv(name: string, orders: Order[]) {
  const head = ['buyer', 'email', 'code', 'status', 'amount', 'created'];
  const body = orders.map((o) => [
    o.buyerName ?? '', o.email, o.ticketCode ?? '', o.status, dollars(o.amountCents), new Date(o.createdAt).toISOString(),
  ]);
  const csv = [head, ...body].map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-orders.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function DropDetail() {
  const token = useAdminToken();
  const { id } = Route.useParams();
  const eventId = Number(id);
  const detailFn = useServerFn(adminEventDetailFn);
  const refundFn = useServerFn(refundOrderFn);
  const cancelFn = useServerFn(cancelHoldFn);

  const [data, setData] = useState<Detail | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const reload = useCallback(async () => {
    if (!token) return;
    const res = await detailFn({ data: { adminToken: token, id: eventId } });
    if (res.authorized && res.found) setData(res);
    else if (res.authorized) setNotFound(true);
  }, [token, eventId, detailFn]);

  useEffect(() => { void reload(); }, [reload]);

  async function refund(orderId: number) {
    if (!token) return;
    setBusyId(orderId);
    await refundFn({ data: { adminToken: token, orderId } });
    await reload();
    setBusyId(null);
  }
  async function cancel(orderId: number) {
    if (!token) return;
    setBusyId(orderId);
    await cancelFn({ data: { adminToken: token, orderId } });
    await reload();
    setBusyId(null);
  }

  if (notFound) {
    return (
      <AdminShell active="drops">
        <Link to="/admin" className="sl-admin-back">← Drops</Link>
        <div className="sl-form-card">Drop not found.</div>
      </AdminShell>
    );
  }

  const cols = '1.4fr 2fr 1.1fr 1fr 1.5fr';

  return (
    <AdminShell active="drops">
      <Link to="/admin" className="sl-admin-back">← Drops</Link>

      <div className="sl-admin-head">
        <div>
          <h1>{data?.event.name ?? 'Loading…'}</h1>
          <div className="sub sl-mono" style={{ color: '#9aa595' }}>
            {data ? `/e/${data.event.slug} · ${dollars(data.event.priceCents)} · hold ${data.event.holdMinutes} min · max ${data.event.maxPerUser}/user` : ''}
          </div>
        </div>
        <div className="sl-admin-actions">
          <button className="sl-mini-btn" disabled={!data} onClick={() => data && downloadCsv(data.event.slug, data.orders)}>Export CSV</button>
          {data && <Link to="/admin/events/$id/edit" params={{ id }} className="sl-mini-btn">Edit drop</Link>}
        </div>
      </div>

      {data && (
        <>
          <div className="sl-stats">
            <div className="sl-stat"><div className="k">Sold / paid</div><div className="v green">{data.counts.sold}</div></div>
            <div className="sl-stat"><div className="k">Held (pending)</div><div className="v amber">{data.counts.held}</div></div>
            <div className="sl-stat"><div className="k">Available</div><div className="v">{data.counts.available}</div></div>
            <div className="sl-stat"><div className="k">Revenue</div><div className="v">{dollars(data.counts.revenueCents)}</div></div>
          </div>

          <h2 style={{ fontFamily: "'Quicksand',sans-serif", fontSize: 16, margin: '24px 0 12px' }}>
            Orders <span style={{ color: '#9aa595', fontWeight: 500, fontSize: 14 }}>· {data.orders.length}</span>
          </h2>

          <div className="sl-table">
            <div className="sl-thead" style={{ gridTemplateColumns: cols }}>
              <span>BUYER</span><span>EMAIL</span><span>CODE</span><span>STATUS</span><span style={{ textAlign: 'right' }}>ACTIONS</span>
            </div>
            {data.orders.length === 0 ? (
              <div className="sl-trow" style={{ gridTemplateColumns: '1fr' }}>No orders yet.</div>
            ) : (
              data.orders.map((o) => (
                <div className="sl-trow" key={o.id} style={{ gridTemplateColumns: cols }}>
                  <span style={{ fontWeight: 600 }}>{o.buyerName ?? '—'}</span>
                  <span style={{ color: '#7c8a78' }}>{o.email}</span>
                  <span className="sl-mono" style={{ color: '#3a4a36' }}>{o.ticketCode ? o.ticketCode.slice(0, 6) : '—'}</span>
                  <span><Spill status={o.status} /></span>
                  <span className="sl-order-actions">
                    {o.status === 'paid' && (
                      <button className="danger" disabled={busyId === o.id} onClick={() => refund(o.id)}>
                        {busyId === o.id ? '…' : 'Refund'}
                      </button>
                    )}
                    {o.status === 'pending' && (
                      <button disabled={busyId === o.id} onClick={() => cancel(o.id)}>
                        {busyId === o.id ? '…' : 'Cancel hold'}
                      </button>
                    )}
                    {o.status !== 'paid' && o.status !== 'pending' && (
                      <span style={{ color: '#9aa595', fontSize: 12 }}>{o.status === 'refunded' ? 'seat released' : '—'}</span>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </AdminShell>
  );
}
