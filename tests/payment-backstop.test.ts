import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from 'drizzle-orm';
import { db, client } from '../src/lib/db';
import { createEvent, reserveSeat, markOrderPaid, getEventStatus } from '../src/lib/inventory';
import { resetDb } from './helpers';

after(async () => {
  await client.end({ timeout: 5 }).catch(() => {});
});

test('happy path: paying a held order issues a valid ticket', async () => {
  await resetDb();
  await createEvent({
    slug: 'pay',
    name: 'Pay Test',
    saleStartsAt: new Date(Date.now() - 60_000),
    ticketLimit: 1,
    holdMinutes: 30,
  });

  const r = await reserveSeat({ eventSlug: 'pay', email: 'a@example.com' });
  assert.equal(r.ok, true);

  const paid = await markOrderPaid({ orderId: r.ok ? r.orderId : 0, paymentIntentId: 'pi_test' });
  assert.equal(paid.ok, true);
  assert.equal(paid.ok && paid.status, 'paid');
  assert.ok(paid.ok && paid.ticketCode, 'should issue a ticket code');

  // Idempotent: confirming again (e.g. webhook after redirect) is a no-op.
  const again = await markOrderPaid({ orderId: r.ok ? r.orderId : 0 });
  assert.equal(again.ok, true);
  assert.equal(again.ok && again.status, 'already_paid');

  assert.equal((await getEventStatus('pay'))!.sold, 1);
});

test('backstop: a late payment after the seat is gone is refunded, never oversold', async () => {
  await resetDb();
  await createEvent({
    slug: 'race',
    name: 'Race Test',
    saleStartsAt: new Date(Date.now() - 60_000),
    ticketLimit: 1,
    holdMinutes: 30,
    maxPerUser: 5,
  });

  // Buyer A reserves the only seat.
  const a = await reserveSeat({ eventSlug: 'race', email: 'a@example.com' });
  assert.equal(a.ok, true);

  // A's hold expires.
  await db.execute(sql`UPDATE tickets SET held_until = now() - interval '1 minute' WHERE status = 'held'`);

  // Buyer B reclaims that seat and pays.
  const b = await reserveSeat({ eventSlug: 'race', email: 'b@example.com' });
  assert.equal(b.ok, true);
  const bPaid = await markOrderPaid({ orderId: b.ok ? b.orderId : 0 });
  assert.equal(bPaid.ok, true);

  // A's payment lands late — the seat is gone. Must refund, not oversell.
  const aPaid = await markOrderPaid({ orderId: a.ok ? a.orderId : 0 });
  assert.equal(aPaid.ok, false);
  assert.equal(aPaid.ok === false && aPaid.reason, 'NO_CAPACITY_REFUNDED');

  // Invariant: still exactly one sold ticket for a 1-seat event.
  assert.equal((await getEventStatus('race'))!.sold, 1);
});
