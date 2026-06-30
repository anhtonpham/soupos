import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createFileRoute, Link, useRouter } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { getEventStatusFn } from '../server/events';
import { startCheckout } from '../server/checkout';

export const Route = createFileRoute('/e/$slug')({
  loader: ({ params }) => getEventStatusFn({ data: { slug: params.slug } }),
  component: EventPage,
});

const REASONS: Record<string, string> = {
  SOLD_OUT: 'Sorry — this drop just sold out.',
  NOT_ON_SALE: 'This drop isn’t on sale yet.',
  SALE_ENDED: 'This drop has ended.',
  USER_LIMIT: 'You’ve already reserved a pass with that email.',
  NOT_FOUND: 'Drop not found.',
};

type State = 'upcoming' | 'onsale' | 'soldout' | 'ended';

function money(cents: number, currency: string) {
  return cents === 0
    ? 'Free'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

/** Ticks `now` every second so countdowns stay live on the client. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** "02:14:55" style countdown; falls back to "2d 04h" when far out. */
function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00';
  const totalH = Math.floor(ms / 3_600_000);
  if (totalH >= 24) {
    const d = Math.floor(totalH / 24);
    return `${d}d ${String(totalH % 24).padStart(2, '0')}h`;
  }
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map((n) => String(n).padStart(2, '0')).join(':');
}

function fmtWhen(d: Date) {
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
}

function EventPage() {
  const status = Route.useLoaderData();
  const { slug } = Route.useParams();
  const router = useRouter();
  const checkout = useServerFn(startCheckout);
  const now = useNow(true);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const starts = status ? new Date(status.event.saleStartsAt).getTime() : 0;
  const ends = status?.event.saleEndsAt ? new Date(status.event.saleEndsAt).getTime() : null;

  let state: State = 'onsale';
  if (status) {
    if (now < starts) state = 'upcoming';
    else if (ends != null && now > ends) state = 'ended';
    else if (status.available <= 0) state = 'soldout';
  }

  // Poll live availability every 5s while the drop is on sale.
  const invalidate = useRef(router.invalidate);
  invalidate.current = router.invalidate;
  useEffect(() => {
    if (state !== 'onsale') return;
    const t = setInterval(() => void invalidate.current(), 5000);
    return () => clearInterval(t);
  }, [state]);

  if (!status) {
    return (
      <main className="sl-ev">
        <Link to="/" className="sl-back">← All drops</Link>
        <div className="sl-card-panel"><h2 style={{ margin: 0 }}>Drop not found</h2></div>
      </main>
    );
  }

  const { event, available, ticketLimit } = status;
  const pctClaimed = ticketLimit > 0 ? Math.round(((ticketLimit - available) / ticketLimit) * 100) : 0;

  async function buy(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await checkout({ data: { eventSlug: slug, email, name: name || undefined } });
      if (res.ok) window.location.assign(res.redirectUrl);
      else {
        setError(REASONS[res.reason] ?? res.reason);
        void router.invalidate();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const pill =
    state === 'onsale' ? (
      <span className="sl-pill-hero"><i className="sl-dot-hero" />ON SALE NOW</span>
    ) : state === 'upcoming' ? (
      <span className="sl-pill-hero is-soon">UPCOMING</span>
    ) : state === 'soldout' ? (
      <span className="sl-pill-hero is-out">SOLD OUT</span>
    ) : (
      <span className="sl-pill-hero is-out">ENDED</span>
    );

  return (
    <main className="sl-ev">
      <Link to="/" className="sl-back">← All drops</Link>

      <section className="sl-ev-hero">
        {pill}
        <h1>{event.name}</h1>
        {event.description && <p>{event.description}</p>}

        <div className="sl-ev-stats">
          {state === 'upcoming' ? (
            <div>
              <div className="sl-ev-count" style={{ textAlign: 'left' }}>
                <div className="k">OPENS IN</div>
                <div className="v">{fmtCountdown(starts - now)}</div>
              </div>
              <div style={{ color: '#8fae85', fontSize: 13, marginTop: 8 }}>{fmtWhen(new Date(starts))}</div>
            </div>
          ) : (
            <>
              <div>
                <div className="sl-ev-left-big">
                  <b>{Math.max(0, available)}</b>
                  <span>/ {ticketLimit} left</span>
                </div>
                <div className="sl-ev-bar">
                  <i className={state === 'onsale' ? undefined : 'is-out'} style={{ width: `${pctClaimed}%` }} />
                </div>
              </div>
              {state === 'onsale' && ends != null && (
                <div className="sl-ev-count">
                  <div className="k">SALE CLOSES IN</div>
                  <div className="v">{fmtCountdown(ends - now)}</div>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {state === 'onsale' && (
        <form className="sl-card-panel" onSubmit={buy}>
          <div className="sl-card-panel-head">
            <h2>Reserve your pass</h2>
            <div className="sl-price">
              {money(event.priceCents, event.currency)} <small>· {event.maxPerUser} per person</small>
            </div>
          </div>
          <div className="sl-row2">
            <div className="sl-field">
              <label className="sl-label" htmlFor="buyer-name">Full name</label>
              <input id="buyer-name" className="sl-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Jamie Chen" required />
            </div>
            <div className="sl-field">
              <label className="sl-label" htmlFor="buyer-email">Email</label>
              <input id="buyer-email" className="sl-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jamie@email.com" required />
            </div>
          </div>
          <button className="sl-button sl-button-primary" style={{ marginTop: 16 }} disabled={busy} type="submit">
            {busy ? 'Reserving…' : `Buy Hotpot Pass →`}
          </button>
          <div className="sl-secure">
            🔒 Secure checkout via Stripe · seat held {event.holdMinutes} min · name must match photo ID
          </div>
          {error && <p className="sl-err" style={{ textAlign: 'center' }}>{error}</p>}
        </form>
      )}

      {state === 'upcoming' && (
        <div className="sl-card-panel" style={{ textAlign: 'center' }}>
          <div className="sl-ended-note">Sales haven’t opened yet</div>
          <div className="sl-muted-note">This drop opens {fmtWhen(new Date(starts))}. Check back then to grab a pass.</div>
          <Link to="/" className="sl-button sl-button-ghost" style={{ marginTop: 18 }}>See all drops</Link>
        </div>
      )}

      {state === 'soldout' && (
        <div className="sl-card-panel" style={{ textAlign: 'center' }}>
          <div className="sl-ended-note">This drop is sold out</div>
          <div className="sl-muted-note">Every pass for this drop has been claimed. Follow along for the next seasonal drop.</div>
          <Link to="/" className="sl-button sl-button-ghost" style={{ marginTop: 18 }}>See all drops</Link>
        </div>
      )}

      {state === 'ended' && (
        <div className="sl-card-panel" style={{ textAlign: 'center' }}>
          <div className="sl-ended-note">This drop has closed</div>
          <div className="sl-muted-note">
            Sales ended {ends != null ? fmtWhen(new Date(ends)) : ''}. Follow for the next seasonal drop.
          </div>
          <Link to="/" className="sl-button sl-button-ghost" style={{ marginTop: 18 }}>See all drops</Link>
        </div>
      )}

      {event.description && (
        <Accordion title="What’s included" defaultOpen>
          {event.description}
        </Accordion>
      )}
    </main>
  );
}

function Accordion({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="sl-acc">
      <div className="sl-acc-item">
        <button type="button" className="sl-acc-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          <span>{title}</span>
          <span style={{ color: '#9aa595' }}>{open ? '－' : '＋'}</span>
        </button>
        {open && <div className="sl-acc-body">{children}</div>}
      </div>
    </div>
  );
}
