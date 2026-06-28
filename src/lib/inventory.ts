import { sql, eq } from 'drizzle-orm';
import { db } from './db';
import { events, users, orders } from './db/schema';
import { generateTicketCode } from './codes';

/** Normalizes a raw `db.execute()` result to a plain rows array across drivers. */
function rowsOf(res: unknown): Record<string, any>[] {
  if (Array.isArray(res)) return res as Record<string, any>[];
  if (res && typeof res === 'object' && Array.isArray((res as any).rows)) {
    return (res as any).rows;
  }
  return [];
}

/** Internal control-flow signal used to roll back a reservation transaction. */
class ReserveAbort extends Error {}

// ---------------------------------------------------------------------------
// Event creation — pre-generates exactly `ticketLimit` physical seat rows.
// Inventory IS these rows; overselling is impossible because no extra row exists.
// ---------------------------------------------------------------------------

export interface CreateEventInput {
  slug: string;
  name: string;
  description?: string | null;
  saleStartsAt: Date;
  saleEndsAt?: Date | null;
  priceCents?: number;
  currency?: string;
  ticketLimit: number;
  holdMinutes?: number;
  maxPerUser?: number;
}

export async function createEvent(input: CreateEventInput): Promise<{ id: number; slug: string }> {
  return db.transaction(async (tx) => {
    const [ev] = await tx
      .insert(events)
      .values({
        slug: input.slug,
        name: input.name,
        description: input.description ?? null,
        saleStartsAt: input.saleStartsAt,
        saleEndsAt: input.saleEndsAt ?? null,
        priceCents: input.priceCents ?? 0,
        currency: input.currency ?? 'usd',
        ticketLimit: input.ticketLimit,
        holdMinutes: input.holdMinutes ?? 10,
        maxPerUser: input.maxPerUser ?? 1,
      })
      .returning();

    // Generate the physical seats.
    await tx.execute(sql`
      INSERT INTO tickets (event_id, status)
      SELECT ${ev.id}, 'free' FROM generate_series(1, ${input.ticketLimit})
    `);

    return { id: Number(ev.id), slug: ev.slug };
  });
}

// ---------------------------------------------------------------------------
// Reservation — the core anti-oversell operation.
// ---------------------------------------------------------------------------

export type ReserveResult =
  | { ok: true; orderId: number; ticketId: number; userId: number }
  | { ok: false; reason: 'NOT_FOUND' | 'NOT_ON_SALE' | 'SALE_ENDED' | 'SOLD_OUT' | 'USER_LIMIT' };

export interface ReserveInput {
  eventSlug: string;
  email: string;
  name?: string | null;
  idempotencyKey?: string | null;
}

export async function reserveSeat(input: ReserveInput): Promise<ReserveResult> {
  const email = input.email.trim().toLowerCase();
  try {
    return await db.transaction(async (tx) => {
      const [ev] = await tx.select().from(events).where(eq(events.slug, input.eventSlug));
      if (!ev) throw new ReserveAbort('NOT_FOUND');

      const now = Date.now();
      if (ev.saleStartsAt && now < ev.saleStartsAt.getTime()) throw new ReserveAbort('NOT_ON_SALE');
      if (ev.saleEndsAt && now > ev.saleEndsAt.getTime()) throw new ReserveAbort('SALE_ENDED');

      // Upsert the buyer.
      await tx.insert(users).values({ email, name: input.name ?? null }).onConflictDoNothing({ target: users.email });
      const [user] = await tx.select().from(users).where(eq(users.email, email));

      // Per-user limit: count this user's currently-active seats for this event.
      const activeForUser = Number(
        rowsOf(
          await tx.execute(sql`
            SELECT count(*)::int AS n FROM tickets
            WHERE event_id = ${ev.id} AND user_id = ${user.id}
              AND (status = 'sold' OR (status = 'held' AND held_until > now()))
          `),
        )[0]?.n ?? 0,
      );
      if (activeForUser >= ev.maxPerUser) throw new ReserveAbort('USER_LIMIT');

      const holdUntil = new Date(now + ev.holdMinutes * 60_000);

      // Pending order (rolls back automatically if the seat claim fails).
      const [order] = await tx
        .insert(orders)
        .values({
          eventId: ev.id,
          userId: user.id,
          quantity: 1,
          status: 'pending',
          amountCents: ev.priceCents,
          expiresAt: holdUntil,
          idempotencyKey: input.idempotencyKey ?? null,
        })
        .returning();

      // Claim exactly one available seat. SKIP LOCKED lets concurrent buyers each
      // grab a DIFFERENT free row without blocking; when none are free, no row
      // returns → sold out. A 21st sale is impossible: only `ticketLimit` rows exist.
      const claimed = rowsOf(
        await tx.execute(sql`
          UPDATE tickets
          SET status = 'held', order_id = ${order.id}, user_id = ${user.id},
              held_until = ${holdUntil.toISOString()}::timestamptz
          WHERE id = (
            SELECT id FROM tickets
            WHERE event_id = ${ev.id}
              AND (status = 'free' OR (status = 'held' AND held_until < now()))
            ORDER BY id
            FOR UPDATE SKIP LOCKED
            LIMIT 1
          )
          RETURNING id
        `),
      );
      if (claimed.length === 0) throw new ReserveAbort('SOLD_OUT');

      return {
        ok: true as const,
        orderId: Number(order.id),
        ticketId: Number(claimed[0].id),
        userId: Number(user.id),
      };
    });
  } catch (e) {
    if (e instanceof ReserveAbort) {
      return {
        ok: false as const,
        reason: e.message as 'NOT_FOUND' | 'NOT_ON_SALE' | 'SALE_ENDED' | 'SOLD_OUT' | 'USER_LIMIT',
      };
    }
    throw e;
  }
}

// ---------------------------------------------------------------------------
// Payment confirmation — idempotent, and a hard backstop against overselling.
// ---------------------------------------------------------------------------

export type PaidResult =
  | { ok: true; status: 'paid' | 'paid_reclaimed' | 'already_paid'; ticketCode: string | null }
  | { ok: false; reason: 'NOT_FOUND' | 'NO_CAPACITY_REFUNDED' };

export interface MarkPaidInput {
  orderId: number;
  paymentIntentId?: string | null;
}

export async function markOrderPaid(input: MarkPaidInput): Promise<PaidResult> {
  return db.transaction(async (tx) => {
    // Lock the order row so concurrent confirmations (redirect + webhook) serialize.
    const [order] = rowsOf(
      await tx.execute(sql`
        SELECT id, event_id, user_id, status FROM orders WHERE id = ${input.orderId} FOR UPDATE
      `),
    ) as { id: number; event_id: number; user_id: number; status: string }[];

    if (!order) return { ok: false as const, reason: 'NOT_FOUND' };

    if (order.status === 'paid') {
      const existing = rowsOf(
        await tx.execute(sql`
          SELECT ticket_code FROM tickets WHERE order_id = ${input.orderId} AND status = 'sold' LIMIT 1
        `),
      )[0];
      return { ok: true as const, status: 'already_paid', ticketCode: existing?.ticket_code ?? null };
    }

    const code = generateTicketCode();

    // 1) Honor the seat this order is still holding, if it hasn't been reclaimed.
    const sold = rowsOf(
      await tx.execute(sql`
        UPDATE tickets
        SET status = 'sold', ticket_code = ${code}, sold_at = now(), held_until = NULL
        WHERE id = (
          SELECT id FROM tickets WHERE order_id = ${input.orderId} AND status = 'held' ORDER BY id LIMIT 1
        )
        RETURNING id
      `),
    );
    if (sold.length >= 1) {
      await tx.execute(sql`
        UPDATE orders SET status = 'paid', paid_at = now(), payment_intent_id = ${input.paymentIntentId ?? null}
        WHERE id = ${input.orderId}
      `);
      return { ok: true as const, status: 'paid', ticketCode: code };
    }

    // 2) The held seat was reclaimed (hold expired + taken). Try to grab a fresh one.
    const reclaimed = rowsOf(
      await tx.execute(sql`
        UPDATE tickets
        SET status = 'sold', ticket_code = ${code}, sold_at = now(), held_until = NULL,
            order_id = ${input.orderId}, user_id = ${order.user_id}
        WHERE id = (
          SELECT id FROM tickets
          WHERE event_id = ${order.event_id}
            AND (status = 'free' OR (status = 'held' AND held_until < now()))
          ORDER BY id
          FOR UPDATE SKIP LOCKED
          LIMIT 1
        )
        RETURNING id
      `),
    );
    if (reclaimed.length >= 1) {
      await tx.execute(sql`
        UPDATE orders SET status = 'paid', paid_at = now(), payment_intent_id = ${input.paymentIntentId ?? null}
        WHERE id = ${input.orderId}
      `);
      return { ok: true as const, status: 'paid_reclaimed', ticketCode: code };
    }

    // 3) No seat available at all → refund. We never manufacture an extra seat.
    await tx.execute(sql`UPDATE orders SET status = 'refunded' WHERE id = ${input.orderId}`);
    return { ok: false as const, reason: 'NO_CAPACITY_REFUNDED' };
  });
}

// ---------------------------------------------------------------------------
// Read-only helpers used by pages / server functions.
// ---------------------------------------------------------------------------

export type VerifyResult =
  | { valid: true; holderName: string | null; eventName: string; soldAt: Date | null }
  | { valid: false; reason: 'NOT_FOUND' | 'NOT_VALID' };

export async function verifyTicket(ticketCode: string): Promise<VerifyResult> {
  const row = rowsOf(
    await db.execute(sql`
      SELECT t.status, t.sold_at, u.name AS holder_name, e.name AS event_name
      FROM tickets t
      JOIN events e ON e.id = t.event_id
      LEFT JOIN users u ON u.id = t.user_id
      WHERE t.ticket_code = ${ticketCode}
    `),
  )[0];
  if (!row) return { valid: false, reason: 'NOT_FOUND' };
  if (row.status !== 'sold') return { valid: false, reason: 'NOT_VALID' };
  return { valid: true, holderName: row.holder_name ?? null, eventName: row.event_name, soldAt: row.sold_at ?? null };
}

export interface EventStatus {
  event: typeof events.$inferSelect;
  ticketLimit: number;
  sold: number;
  held: number;
  available: number;
}

export async function getEventStatus(slug: string): Promise<EventStatus | null> {
  const [ev] = await db.select().from(events).where(eq(events.slug, slug));
  if (!ev) return null;
  const counts = rowsOf(
    await db.execute(sql`
      SELECT
        count(*) FILTER (WHERE status = 'sold')::int AS sold,
        count(*) FILTER (WHERE status = 'held' AND held_until > now())::int AS held,
        count(*) FILTER (WHERE status = 'free' OR (status = 'held' AND held_until <= now()))::int AS available
      FROM tickets WHERE event_id = ${ev.id}
    `),
  )[0];
  return {
    event: ev,
    ticketLimit: ev.ticketLimit,
    sold: Number(counts?.sold ?? 0),
    held: Number(counts?.held ?? 0),
    available: Number(counts?.available ?? 0),
  };
}

export async function listEvents(): Promise<(typeof events.$inferSelect)[]> {
  return db.select().from(events).orderBy(events.saleStartsAt);
}

/**
 * Optional janitor (Vercel Cron): resets long-expired holds to `free` and marks
 * their orders `expired`. Not required for correctness — the claim query already
 * treats expired holds as available — purely for tidy reporting.
 */
export async function releaseExpiredHolds(): Promise<{ released: number }> {
  const res = rowsOf(
    await db.execute(sql`
      WITH freed AS (
        UPDATE tickets SET status = 'free', order_id = NULL, user_id = NULL, held_until = NULL
        WHERE status = 'held' AND held_until < now()
        RETURNING order_id
      )
      UPDATE orders SET status = 'expired'
      WHERE id IN (SELECT order_id FROM freed WHERE order_id IS NOT NULL) AND status = 'pending'
      RETURNING id
    `),
  );
  return { released: res.length };
}
