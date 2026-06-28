import { createFileRoute, Link } from '@tanstack/react-router';
import { listEventsFn } from '../server/events';

export const Route = createFileRoute('/')({
  loader: () => listEventsFn(),
  component: EventsList,
});

function money(cents: number, currency: string) {
  return cents === 0 ? 'Free' : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function EventsList() {
  const events = Route.useLoaderData();

  return (
    <main style={{ maxWidth: 900, margin: '0 auto', padding: 24 }}>
      <h1>Hotpot Pass Drops</h1>
      {events.length === 0 && <p>No drops yet. Seed one with <code>pnpm seed</code>.</p>}
      <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
        {events.map((e) => {
          const now = Date.now();
          const onSale = new Date(e.saleStartsAt).getTime() <= now;
          const soldOut = e.available <= 0;
          const pill = soldOut ? 'Sold out' : onSale ? '● On sale' : '◷ Upcoming';
          return (
            <div key={e.slug} style={card}>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{e.name}</div>
              <div style={{ color: '#78716c' }}>{money(e.priceCents, e.currency)} · {e.maxPerUser}/person</div>
              <div style={{ margin: '8px 0', fontWeight: 600 }}>{pill}</div>
              <div style={{ color: '#78716c', fontSize: 14 }}>
                {onSale ? `${e.available} of ${e.ticketLimit} left` : `opens ${new Date(e.saleStartsAt).toLocaleString()}`}
              </div>
              <Link to="/e/$slug" params={{ slug: e.slug }} style={{ ...button, marginTop: 12, display: 'inline-block' }}>
                {soldOut ? 'View' : 'Buy →'}
              </Link>
            </div>
          );
        })}
      </div>
    </main>
  );
}

const card: React.CSSProperties = { border: '1px solid #e7e5e4', borderRadius: 12, padding: 16, background: '#fff' };
const button: React.CSSProperties = {
  background: '#b91c1c', color: '#fff', padding: '8px 16px', borderRadius: 8, textDecoration: 'none', fontWeight: 600,
};
