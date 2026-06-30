import { useState } from 'react';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { createEventFn } from '../server/admin';
import { AdminShell, useAdminToken } from '../components/admin';

export const Route = createFileRoute('/admin/events/new')({
  component: NewDrop,
});

function slugify(s: string) {
  return s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function NewDrop() {
  const token = useAdminToken();
  const navigate = useNavigate();
  const create = useServerFn(createEventFn);

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('70');
  const [limit, setLimit] = useState('20');
  const [maxPerUser, setMaxPerUser] = useState('1');
  const [holdMinutes, setHoldMinutes] = useState('10');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const effectiveSlug = slugTouched ? slug : slugify(name);

  async function submit() {
    if (!token) return;
    setError(null);
    if (!name.trim() || !effectiveSlug || !startsAt) {
      setError('Name, slug and sale start are required.');
      return;
    }
    setBusy(true);
    const res = await create({
      data: {
        adminToken: token,
        config: {
          name: name.trim(),
          slug: effectiveSlug,
          description: description.trim() || undefined,
          priceDollars: Number(price) || 0,
          ticketLimit: Number(limit) || 0,
          holdMinutes: Number(holdMinutes) || 10,
          maxPerUser: Number(maxPerUser) || 1,
          saleStartsAt: startsAt,
          saleEndsAt: endsAt || undefined,
        },
      },
    });
    setBusy(false);
    if (!res.authorized) return setError('Session expired — sign in again.');
    if (!res.ok) return setError(res.error ?? 'Could not create the drop (slug may already exist).');
    void navigate({ to: '/admin/events/$id', params: { id: String(res.id) } });
  }

  return (
    <AdminShell active="drops">
      <Link to="/admin" className="sl-admin-back">← Drops</Link>
      <div className="sl-admin-head">
        <div>
          <h1>New drop</h1>
          <div className="sub">Configure the pass. Saving generates its {limit || 0} ticket rows.</div>
        </div>
      </div>

      <div className="sl-form-card">
        <div className="k">DETAILS</div>
        <div className="sl-form-grid">
          <div className="sl-field">
            <label className="sl-label">Drop name</label>
            <input className="sl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Summer Hotpot Pass" />
          </div>
          <div className="sl-row2">
            <div className="sl-field">
              <label className="sl-label">Slug</label>
              <input className="sl-input" value={effectiveSlug} onChange={(e) => { setSlugTouched(true); setSlug(slugify(e.target.value)); }} placeholder="summer-hotpot" style={{ fontFamily: "'Space Mono',monospace" }} />
            </div>
            <div className="sl-field">
              <label className="sl-label">Price (USD)</label>
              <input className="sl-input" type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="sl-field">
            <label className="sl-label">Description (optional)</label>
            <textarea className="sl-input" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Unlimited free hotpot, all summer long." />
          </div>
        </div>
      </div>

      <div className="sl-form-card">
        <div className="k">INVENTORY & LIMITS</div>
        <div className="sl-row3">
          <div className="sl-field"><label className="sl-label">Ticket limit (N)</label><input className="sl-input" type="number" min="0" value={limit} onChange={(e) => setLimit(e.target.value)} /></div>
          <div className="sl-field"><label className="sl-label">Max per user</label><input className="sl-input" type="number" min="1" value={maxPerUser} onChange={(e) => setMaxPerUser(e.target.value)} /></div>
          <div className="sl-field"><label className="sl-label">Hold minutes</label><input className="sl-input" type="number" min="1" value={holdMinutes} onChange={(e) => setHoldMinutes(e.target.value)} /></div>
        </div>
      </div>

      <div className="sl-form-card">
        <div className="k">SALE WINDOW</div>
        <div className="sl-row2">
          <div className="sl-field"><label className="sl-label">Sale starts</label><input className="sl-input" type="datetime-local" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} /></div>
          <div className="sl-field"><label className="sl-label">Sale ends (optional)</label><input className="sl-input" type="datetime-local" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} /></div>
        </div>
      </div>

      {error && <p className="sl-err">{error}</p>}

      <div style={{ display: 'flex', gap: 11, marginTop: 18 }}>
        <button className="sl-button sl-button-primary" style={{ flex: 1 }} disabled={busy} onClick={submit}>
          {busy ? 'Creating…' : `Create drop & generate ${limit || 0} tickets`}
        </button>
        <Link to="/admin" className="sl-button sl-button-ghost" style={{ width: 'auto', padding: '14px 18px' }}>Cancel</Link>
      </div>
    </AdminShell>
  );
}
