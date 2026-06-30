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
// Admin mutations (operate on the existing schema — no new tables/columns).
// ---------------------------------------------------------------------------

export interface UpdateEventInput {
  name?: string;
  description?: string | null;
  priceCents?: number;
  saleStartsAt?: Date;
  saleEndsAt?: Date | null;
  holdMinutes?: number;
  maxPerUser?: number;
  ticketLimit?: number;
}

export type UpdateEventResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'LIMIT_BELOW_CLAIMED'; floor?: number };

/**
 * Edits an event's config. Changing `ticketLimit` adjusts the physical seat
 * rows: growing inserts new `free` rows, shrinking deletes spare `free` rows —
 * but never below the number already sold or actively held (the floor), so the
 * oversell invariant is preserved.
 */
export async function updateEvent(
  id: number,
  patch: UpdateEventInput,
): Promise<UpdateEventResult> {
  try {
    return await db.transaction(async (tx) => {
      const [ev] = await tx.select().from(events).where(eq(events.id, id));
      if (!ev) throw new ReserveAbort('NOT_FOUND');

      if (patch.ticketLimit != null && patch.ticketLimit !== ev.ticketLimit) {
        const counts = rowsOf(
          await tx.execute(sql`
            SELECT
              count(*)::int AS total,
              count(*) FILTER (WHERE status = 'sold'
                OR (status = 'held' AND held_until > now()))::int AS claimed,
              count(*) FILTER (WHERE status = 'free'
                OR (status = 'held' AND held_until <= now()))::int AS spare
            FROM tickets WHERE event_id = ${id}
          `),
        )[0];
        const total = Number(counts?.total ?? 0);
        const claimed = Number(counts?.claimed ?? 0);
        const spare = Number(counts?.spare ?? 0);

        if (patch.ticketLimit < claimed) {
          // Can't shrink below what's already sold/held.
          throw Object.assign(new ReserveAbort('LIMIT_BELOW_CLAIMED'), { floor: claimed });
        }
        if (patch.ticketLimit > total) {
          await tx.execute(sql`
            INSERT INTO tickets (event_id, status)
            SELECT ${id}, 'free' FROM generate_series(1, ${patch.ticketLimit - total})
          `);
        } else if (patch.ticketLimit < total) {
          // Delete the right number of releasable (free/expired) rows only.
          const toRemove = Math.min(total - patch.ticketLimit, spare);
          await tx.execute(sql`
            DELETE FROM tickets WHERE id IN (
              SELECT id FROM tickets
              WHERE event_id = ${id}
                AND (status = 'free' OR (status = 'held' AND held_until <= now()))
              ORDER BY id DESC
              LIMIT ${toRemove}
            )
          `);
        }
      }

      await tx
        .update(events)
        .set({
          ...(patch.name != null ? { name: patch.name } : {}),
          ...(patch.description !== undefined ? { description: patch.description } : {}),
          ...(patch.priceCents != null ? { priceCents: patch.priceCents } : {}),
          ...(patch.saleStartsAt != null ? { saleStartsAt: patch.saleStartsAt } : {}),
          ...(patch.saleEndsAt !== undefined ? { saleEndsAt: patch.saleEndsAt } : {}),
          ...(patch.holdMinutes != null ? { holdMinutes: patch.holdMinutes } : {}),
          ...(patch.maxPerUser != null ? { maxPerUser: patch.maxPerUser } : {}),
          ...(patch.ticketLimit != null ? { ticketLimit: patch.ticketLimit } : {}),
        })
        .where(eq(events.id, id));

      return { ok: true as const };
    });
  } catch (e) {
    if (e instanceof ReserveAbort) {
      return {
        ok: false as const,
        reason: e.message as 'NOT_FOUND' | 'LIMIT_BELOW_CLAIMED',
        floor: (e as { floor?: number }).floor,
      };
    }
    throw e;
  }
}

export interface OrderRow {
  id: number;
  buyerName: string | null;
  email: string;
  ticketCode: string | null;
  status: string;
  amountCents: number | null;
  createdAt: Date;
}

/** Buyer/orders list for an event's admin drop-detail screen. */
export async function listOrders(eventId: number): Promise<OrderRow[]> {
  return rowsOf(
    await db.execute(sql`
      SELECT o.id, o.status, o.amount_cents, o.created_at,
             u.name AS buyer_name, u.email,
             t.ticket_code
      FROM orders o
      JOIN users u ON u.id = o.user_id
      LEFT JOIN tickets t ON t.order_id = o.id AND t.status = 'sold'
      WHERE o.event_id = ${eventId}
      ORDER BY o.created_at DESC
    `),
  ).map((r) => ({
    id: Number(r.id),
    buyerName: r.buyer_name ?? null,
    email: r.email,
    ticketCode: r.ticket_code ?? null,
    status: r.status,
    amountCents: r.amount_cents ?? null,
    createdAt: r.created_at,
  }));
}

/**
 * Refunds a paid order: releases its seat back to `free` (resellable) and marks
 * the order `refunded`. Returns the payment intent so the caller can issue the
 * Stripe refund. Idempotent-ish: a non-paid order is left alone.
 */
export async function refundOrder(
  orderId: number,
): Promise<{ ok: true; paymentIntentId: string | null } | { ok: false; reason: 'NOT_FOUND' | 'NOT_PAID' }> {
  return db.transaction(async (tx) => {
    const [order] = rowsOf(
      await tx.execute(sql`SELECT id, status, payment_intent_id FROM orders WHERE id = ${orderId} FOR UPDATE`),
    ) as { id: number; status: string; payment_intent_id: string | null }[];
    if (!order) return { ok: false as const, reason: 'NOT_FOUND' };
    if (order.status !== 'paid') return { ok: false as const, reason: 'NOT_PAID' };

    await tx.execute(sql`
      UPDATE tickets
      SET status = 'free', order_id = NULL, user_id = NULL, ticket_code = NULL, sold_at = NULL, held_until = NULL
      WHERE order_id = ${orderId}
    `);
    await tx.execute(sql`UPDATE orders SET status = 'refunded' WHERE id = ${orderId}`);
    return { ok: true as const, paymentIntentId: order.payment_intent_id ?? null };
  });
}

/** Cancels a pending order's hold: releases the held seat and marks it cancelled. */
export async function cancelHold(
  orderId: number,
): Promise<{ ok: true } | { ok: false; reason: 'NOT_FOUND' | 'NOT_PENDING' }> {
  return db.transaction(async (tx) => {
    const [order] = rowsOf(
      await tx.execute(sql`SELECT id, status FROM orders WHERE id = ${orderId} FOR UPDATE`),
    ) as { id: number; status: string }[];
    if (!order) return { ok: false as const, reason: 'NOT_FOUND' };
    if (order.status !== 'pending') return { ok: false as const, reason: 'NOT_PENDING' };

    await tx.execute(sql`
      UPDATE tickets
      SET status = 'free', order_id = NULL, user_id = NULL, held_until = NULL
      WHERE order_id = ${orderId} AND status = 'held'
    `);
    await tx.execute(sql`UPDATE orders SET status = 'cancelled' WHERE id = ${orderId}`);
    return { ok: true as const };
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

/** Same as getEventStatus but keyed by numeric id (admin drop-detail route). */
export async function getEventStatusById(id: number): Promise<EventStatus | null> {
  const [ev] = await db.select().from(events).where(eq(events.id, id));
  if (!ev) return null;
  return getEventStatus(ev.slug);
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
