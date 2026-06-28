import { useMemo, useState } from 'react';
import { createFileRoute, Link } from '@tanstack/react-router';
import { listEventsFn } from '../server/events';

export const Route = createFileRoute('/')({
  loader: () => listEventsFn(),
  component: EventsList,
});

type EventRow = Awaited<ReturnType<typeof listEventsFn>>[number];
type Status = 'onsale' | 'upcoming' | 'soldout' | 'ended';
type Filter = 'all' | 'onsale' | 'upcoming' | 'past';

function money(cents: number, currency: string) {
  return cents === 0
    ? 'Free'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(cents / 100);
}

function statusOf(e: EventRow, now: number): Status {
  const starts = new Date(e.saleStartsAt).getTime();
  const ends = e.saleEndsAt ? new Date(e.saleEndsAt).getTime() : null;
  if (now < starts) return 'upcoming';
  if (ends != null && now > ends) return 'ended';
  return e.available <= 0 ? 'soldout' : 'onsale';
}

function formatWhen(d: Date) {
  const day = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${day} · ${time}`;
}

/** Short "opens in" badge, e.g. "◷ 2d 4h" or "◷ 5h". */
function countdown(target: number, now: number): string | null {
  const ms = target - now;
  if (ms <= 0) return null;
  const h = Math.floor(ms / 3_600_000);
  const days = Math.floor(h / 24);
  const hours = h % 24;
  if (days > 0) return `◷ ${days}d ${hours}h`;
  if (h > 0) return `◷ ${h}h`;
  return `◷ ${Math.max(1, Math.floor(ms / 60_000))}m`;
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All drops' },
  { key: 'onsale', label: 'On sale' },
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'past', label: 'Past' },
];

function matchesFilter(status: Status, filter: Filter) {
  if (filter === 'all') return true;
  if (filter === 'onsale') return status === 'onsale';
  if (filter === 'upcoming') return status === 'upcoming';
  return status === 'soldout' || status === 'ended';
}

function EventsList() {
  const events = Route.useLoaderData();
  const [filter, setFilter] = useState<Filter>('all');

  // Stable "now" for this render so status + countdowns are consistent.
  const now = useMemo(() => Date.now(), []);
  const visible = events.filter((e) => matchesFilter(statusOf(e, now), filter));

  return (
    <main className="sl-wrap">
      <section className="sl-hero">
        <div className="sl-eyebrow">HOTPOT PASS DROPS</div>
        <h1 className="sl-title">Grab a seat at the table.</h1>
        <p className="sl-sub">
          Limited passes drop here all season. One per person — when they&rsquo;re gone, they&rsquo;re gone.
        </p>
      </section>

      <div className="sl-filters" role="tablist" aria-label="Filter drops">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            role="tab"
            aria-selected={filter === f.key}
            data-active={filter === f.key}
            className="sl-filter"
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {events.length === 0 ? (
        <div className="sl-empty">
          No drops yet. Seed one with <code>pnpm seed</code>.
        </div>
      ) : visible.length === 0 ? (
        <div className="sl-empty">No {FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} right now.</div>
      ) : (
        <div className="sl-grid">
          {visible.map((e) => (
            <EventCard key={e.slug} event={e} status={statusOf(e, now)} now={now} />
          ))}
        </div>
      )}

      <footer className="sl-foot">
        <span className="mono">© SOUPLEAF HOT POT · AUSTIN TX</span>
        <span>Powered by the Hotpot Pass</span>
      </footer>
    </main>
  );
}

function Thumb({ badge }: { badge?: string | null }) {
  return (
    <div className="sl-thumb">
      <span className="sl-thumb-mark">
        <i />
      </span>
      {badge && <span className="sl-thumb-badge">{badge}</span>}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  if (status === 'onsale') {
    return (
      <span className="sl-pill sl-pill-onsale">
        <span className="sl-dot" />
        ON SALE
      </span>
    );
  }
  if (status === 'upcoming') {
    return (
      <span className="sl-pill sl-pill-soon">
        <span className="sl-dot-soon" />
        SOON
      </span>
    );
  }
  return <span className="sl-pill sl-pill-out">{status === 'soldout' ? 'SOLD OUT' : 'ENDED'}</span>;
}

function EventCard({ event: e, status, now }: { event: EventRow; status: Status; now: number }) {
  const pctClaimed = e.ticketLimit > 0 ? Math.round((e.sold / e.ticketLimit) * 100) : 0;
  const isOut = status === 'soldout' || status === 'ended';
  const opensAt = new Date(e.saleStartsAt);
  const badge = status === 'upcoming' ? countdown(opensAt.getTime(), now) : null;

  return (
    <article className={`sl-card${isOut ? ' is-dim' : ''}`}>
      <Thumb badge={badge} />
      <div className="sl-card-body">
        <div className="sl-card-head">
          <span className="sl-card-name">{e.name}</span>
          <StatusPill status={status} />
        </div>
        <div className="sl-card-meta">
          {money(e.priceCents, e.currency)} · {e.maxPerUser} per person
        </div>

        {status === 'upcoming' ? (
          <div className="sl-opens">
            <div className="sl-opens-label">Opens</div>
            <div className="sl-opens-when">{formatWhen(opensAt)}</div>
          </div>
        ) : (
          <>
            <div className="sl-progress-row">
              <span className="sl-progress-left">
                {e.available} of {e.ticketLimit} left
              </span>
              <span className="sl-progress-pct">{pctClaimed}%</span>
            </div>
            <div className="sl-progress">
              <i className={isOut ? 'is-out' : undefined} style={{ width: `${pctClaimed}%` }} />
            </div>
          </>
        )}

        <div className="sl-card-cta">
          <CardButton event={e} status={status} />
        </div>
      </div>
    </article>
  );
}

function CardButton({ event: e, status }: { event: EventRow; status: Status }) {
  if (status === 'onsale') {
    return (
      <Link to="/e/$slug" params={{ slug: e.slug }} className="sl-btn sl-btn-buy">
        Buy →
      </Link>
    );
  }
  if (status === 'upcoming') {
    return (
      <Link to="/e/$slug" params={{ slug: e.slug }} className="sl-btn sl-btn-notify">
        Notify me
      </Link>
    );
  }
  return <span className="sl-btn sl-btn-soldout">{status === 'soldout' ? 'Sold out' : 'Ended'}</span>;
}
