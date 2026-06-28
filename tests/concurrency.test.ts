import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { client } from '../src/lib/db';
import { createEvent, reserveSeat, getEventStatus } from '../src/lib/inventory';
import { resetDb, countByStatus } from './helpers';

after(async () => {
  await client.end({ timeout: 5 }).catch(() => {});
});

test('never oversells: 65 concurrent buyers vs 20 seats → exactly 20', async () => {
  await resetDb();
  await createEvent({
    slug: 'drop',
    name: 'Hotpot Pass',
    saleStartsAt: new Date(Date.now() - 60_000),
    ticketLimit: 20,
    holdMinutes: 30,
    maxPerUser: 1,
    priceCents: 2500,
  });

  const N = 65;
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      reserveSeat({ eventSlug: 'drop', email: `buyer${i}@example.com`, name: `Buyer ${i}` }),
    ),
  );

  const succeeded = results.filter((r) => r.ok).length;
  const soldOut = results.filter((r) => !r.ok && r.reason === 'SOLD_OUT').length;

  // This is the literal Luma scenario — proven safe.
  assert.equal(succeeded, 20, `expected exactly 20 reservations, got ${succeeded}`);
  assert.equal(soldOut, 45, `expected 45 sold-out, got ${soldOut}`);

  // The database itself must agree: exactly 20 seats held, 0 available.
  const status = await getEventStatus('drop');
  assert.equal(status!.held, 20);
  assert.equal(status!.available, 0);

  const counts = await countByStatus('drop');
  assert.equal(counts.held, 20);
  assert.equal(counts.free ?? 0, 0);
});

test('per-user limit: a second active reservation by the same email is rejected', async () => {
  await resetDb();
  await createEvent({
    slug: 'limit',
    name: 'Limit Test',
    saleStartsAt: new Date(Date.now() - 60_000),
    ticketLimit: 10,
    maxPerUser: 1,
  });

  const first = await reserveSeat({ eventSlug: 'limit', email: 'dup@example.com' });
  const second = await reserveSeat({ eventSlug: 'limit', email: 'dup@example.com' });

  assert.equal(first.ok, true);
  assert.equal(second.ok, false);
  assert.equal(second.ok === false && second.reason, 'USER_LIMIT');
});
