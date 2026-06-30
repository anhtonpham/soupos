import { useEffect, useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { adminEventDetailFn, updateEventFn } from '../server/admin';
import { AdminShell, Spill, useAdminToken } from '../components/admin';

export const Route = createFileRoute('/admin/events/$id/edit')({
  component: EditDrop,
});

/** Date → "YYYY-MM-DDTHH:mm" in local time for a datetime-local input. */
function toLocalInput(d: string | Date | null): string {
  if (!d) return '';
  const dt = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function statusOf(starts: number, ends: number | null, available: number): string {
  const now = Date.now();
  if (now < starts) return 'upcoming';
  if (ends != null && now > ends) return 'ended';
  return available <= 0 ? 'soldout' : 'onsale';
}

function EditDrop() {
  const token = useAdminToken();
  const { id } = Route.useParams();
  const eventId = Number(id);
  const navigate = useNavigate();
  const detailFn = useServerFn(adminEventDetailFn);
  const update = useServerFn(updateEventFn);

  const [loaded, setLoaded] = useState(false);
  const [floor, setFloor] = useState(0); // sold + held: limit can't go below this
  const [status, setStatus] = useState('onsale');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [limit, setLimit] = useState('');
  const [maxPerUser, setMaxPerUser] = useState('');
  const [holdMinutes, setHoldMinutes] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) return;
    void detailFn({ data: { adminToken: token, id: eventId } }).then((res) => {
      if (!res.authorized || !res.found) return;
      const e = res.event;
      setName(e.name);
      setDescription(e.description ?? '');
      setPrice((e.priceCents / 100).toString());
      setLimit(String(res.counts.ticketLimit));
      setMaxPerUser(String(e.maxPerUser));
      setHoldMinutes(String(e.holdMinutes));
      setStartsAt(toLocalInput(e.saleStartsAt));
      setEndsAt(toLocalInput(e.saleEndsAt));
      setFloor(res.counts.sold + res.counts.held);
      setStatus(statusOf(new Date(e.saleStartsAt).getTime(), e.saleEndsAt ? new Date(e.saleEndsAt).getTime() : null, res.counts.available));
      setLoaded(true);
    });
  }, [token, eventId, detailFn]);

  async function save() {
    if (!token) return;
    setError(null);
    setBusy(true);
    const res = await update({
      data: {
        adminToken: token,
        id: eventId,
        patch: {
          name: name.trim(),
          description: description.trim(),
          priceDollars: Number(price) || 0,
          ticketLimit: Number(limit) || 0,
          maxPerUser: Number(maxPerUser) || 1,
          holdMinutes: Number(holdMinutes) || 1,
          saleStartsAt: startsAt || undefined,
          saleEndsAt: endsAt || null,
        },
      },
    });
    setBusy(false);
    if (!res.authorized) return setError('Session expired — sign in again.');
    if (!res.ok) {
      setError(res.reason === 'LIMIT_BELOW_CLAIMED'
        ? `Can't lower the ticket limit below ${res.floor} (already sold + held).`
        : 'Could not save changes.');
      return;
    }
    void navigate({ to: '/admin/events/$id', params: { id } });
  }

  return (
    <AdminShell active="drops">
      <Link to="/admin/events/$id" params={{ id }} className="sl-admin-back">← Back to drop</Link>
      <div className="sl-admin-head">
        <div>
          <h1>Edit drop</h1>
          <div className="sub">Change settings before it sells out.</div>
        </div>
        <Spill status={status} />
      </div>

      {floor > 0 && (
        <div className="sl-banner warn">
          <span>⚠</span>
          <div>{floor} passes are already sold or held. Lowering the ticket limit below <b>{floor}</b> isn’t allowed.</div>
        </div>
      )}

      <div className="sl-form-card">
        <div className="sl-row2">
          <div className="sl-field"><label className="sl-label">Drop name</label><input className="sl-input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="sl-field"><label className="sl-label">Price (USD)</label><input className="sl-input" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
        </div>
        <div className="sl-field" style={{ marginTop: 14 }}>
          <label className="sl-label">Description</label>
          <textarea className="sl-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="sl-row3" style={{ marginTop: 14 }}>
          <div className="sl-field"><label className="sl-label">Limit (N)</label><input className="sl-input" type="number" min={floor} value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
          <div className="sl-field"><label className="sl-label">Max/user</label><input className="sl-input" type="number" min="1" value={maxPerUser} onChange={(e) => setMaxPerUser(e.target.value)} /></div>
          <div className="sl-field"><label className="sl-label">Hold min</label><input className="sl-input" type="number" min="1" value={holdMinutes} onChange={(e) => setHoldMinutes(e.target.value)} /></div>
        </div>
        <div className="sl-row2" style={{ marginTop: 14 }}>
          <div className="sl-field"><label className="sl-label">Sale starts</label><input className="sl-input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
          <div className="sl-field"><label className="sl-label">Sale ends</label><input className="sl-input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
        </div>
      </div>

      {error && <p className="sl-err">{error}</p>}

      <div style={{ display: 'flex', gap: 11, marginTop: 18 }}>
        <button className="sl-button sl-button-primary" style={{ flex: 1 }} disabled={busy || !loaded} onClick={save}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        <Link to="/admin/events/$id" params={{ id }} className="sl-button sl-button-ghost" style={{ width: 'auto', padding: '14px 18px' }}>Discard</Link>
      </div>
    </AdminShell>
  );
}
