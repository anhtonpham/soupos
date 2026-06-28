import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db, client } from '../src/lib/db';
import { createEvent, reserveSeat, getEventStatus } from '../src/lib/inventory';
import { resetDb } from './helpers';

after(async () => {
  await client.end({ timeout: 5 }).catch(() => {});
});

test('expired holds free up capacity (lazy reclaim, no cron needed)', async () => {
  await resetDb();
  await createEvent({
    slug: 'holds',
    name: 'Holds Test',
    saleStartsAt: new Date(Date.now() - 60_000),
    ticketLimit: 2,
    holdMinutes: 30,
    maxPerUser: 5,
  });

  // Fill both seats.
  assert.equal((await reserveSeat({ eventSlug: 'holds', email: 'a@example.com' })).ok, true);
  assert.equal((await reserveSeat({ eventSlug: 'holds', email: 'b@example.com' })).ok, true);

  // Sold out while holds are active.
  const c = await reserveSeat({ eventSlug: 'holds', email: 'c@example.com' });
  assert.equal(c.ok, false);
  assert.equal(c.ok === false && c.reason, 'SOLD_OUT');

  // Simulate the holds expiring.
  await db.execute(sql`UPDATE tickets SET held_until = now() - interval '1 minute' WHERE status = 'held'`);

  const statusAfterExpiry = await getEventStatus('holds');
  assert.equal(statusAfterExpiry!.available, 2, 'expired holds should count as available again');

  // A new buyer can now reclaim a seat.
  const d = await reserveSeat({ eventSlug: 'holds', email: 'd@example.com' });
  assert.equal(d.ok, true, 'expired hold should be reclaimable');
});
