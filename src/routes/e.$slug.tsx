import { useState, type FormEvent, type CSSProperties } from 'react';
import { createFileRoute, useRouter } from '@tanstack/react-router';
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

function money(cents: number, currency: string) {
  return cents === 0 ? 'Free' : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function EventPage() {
  const status = Route.useLoaderData();
  const { slug } = Route.useParams();
  const router = useRouter();
  const checkout = useServerFn(startCheckout);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!status) {
    return <main style={{ padding: 24 }}><h1>Drop not found</h1></main>;
  }

  const { event, available, ticketLimit } = status;
  const now = Date.now();
  const onSale =
    new Date(event.saleStartsAt).getTime() <= now &&
    (!event.saleEndsAt || new Date(event.saleEndsAt).getTime() >= now);
  const soldOut = available <= 0;

  async function buy(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await checkout({ data: { eventSlug: slug, email, name: name || undefined } });
      if (res.ok) {
        window.location.assign(res.redirectUrl);
      } else {
        setError(REASONS[res.reason] ?? res.reason);
        void router.invalidate(); // refresh the live count
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 560, margin: '0 auto', padding: 24 }}>
      <h1 style={{ marginBottom: 4 }}>{event.name}</h1>
      <p style={{ color: '#78716c', marginTop: 0 }}>{event.description}</p>

      <div style={{ fontSize: 18, fontWeight: 600 }}>
        {money(event.priceCents, event.currency)} · {event.maxPerUser} per person
      </div>

      <div style={{ margin: '12px 0', fontWeight: 700 }}>
        {soldOut ? 'Sold out' : onSale ? `● On sale · ${available} of ${ticketLimit} left` : `◷ Opens ${new Date(event.saleStartsAt).toLocaleString()}`}
      </div>

      {onSale && !soldOut ? (
        <form onSubmit={buy} style={{ display: 'grid', gap: 10, maxWidth: 360 }}>
          <input style={input} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
          <input style={input} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button style={primary} disabled={busy} type="submit">
            {busy ? 'Reserving…' : 'Buy Hotpot Pass →'}
          </button>
        </form>
      ) : (
        <p>{soldOut ? 'All passes for this drop are gone.' : 'Come back when the drop opens.'}</p>
      )}

      {error && <p style={{ color: '#b91c1c', marginTop: 12 }}>{error}</p>}
    </main>
  );
}

const input: CSSProperties = { padding: '10px 12px', border: '1px solid #d6d3d1', borderRadius: 8, fontSize: 16 };
const primary: CSSProperties = { background: '#b91c1c', color: '#fff', padding: '12px 16px', border: 0, borderRadius: 8, fontSize: 16, fontWeight: 700, cursor: 'pointer' };
