import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  listEvents,
  getEventStatus,
  getEventStatusById,
  listOrders,
  createEvent,
  updateEvent,
  refundOrder,
  cancelHold,
} from '../lib/inventory';
import { PAYMENTS_MODE, getStripe } from '../lib/stripe';

function authed(token: string): boolean {
  return token === (process.env.ADMIN_TOKEN ?? 'change-me-admin');
}

/** Admin-gated dashboard data: every event with live sold/held/available counts. */
export const adminOverviewFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ adminToken: z.string() }).parse(d))
  .handler(async ({ data }) => {
    if (!authed(data.adminToken)) return { authorized: false as const };
    const events = await listEvents();
    const rows = await Promise.all(
      events.map(async (e) => {
        const s = await getEventStatus(e.slug);
        return {
          id: e.id,
          slug: e.slug,
          name: e.name,
          priceCents: e.priceCents,
          currency: e.currency,
          saleStartsAt: e.saleStartsAt,
          saleEndsAt: e.saleEndsAt,
          ticketLimit: s?.ticketLimit ?? e.ticketLimit,
          sold: s?.sold ?? 0,
          held: s?.held ?? 0,
          available: s?.available ?? 0,
          revenueCents: (s?.sold ?? 0) * e.priceCents,
        };
      }),
    );
    return { authorized: true as const, events: rows };
  });

/** Drop detail: live counts + the buyer/orders list for one event. */
export const adminEventDetailFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ adminToken: z.string(), id: z.number() }).parse(d))
  .handler(async ({ data }) => {
    if (!authed(data.adminToken)) return { authorized: false as const };
    const status = await getEventStatusById(data.id);
    if (!status) return { authorized: true as const, found: false as const };
    const orders = await listOrders(data.id);
    return {
      authorized: true as const,
      found: true as const,
      event: status.event,
      counts: {
        ticketLimit: status.ticketLimit,
        sold: status.sold,
        held: status.held,
        available: status.available,
        revenueCents: status.sold * status.event.priceCents,
      },
      orders,
    };
  });

const eventConfig = z.object({
  name: z.string().trim().min(1),
  slug: z
    .string()
    .trim()
    .min(1)
    .regex(/^[a-z0-9-]+$/, 'lowercase letters, numbers and dashes only'),
  description: z.string().trim().optional(),
  priceDollars: z.number().min(0),
  ticketLimit: z.number().int().min(0),
  holdMinutes: z.number().int().min(1),
  maxPerUser: z.number().int().min(1),
  saleStartsAt: z.string(), // ISO from the form's datetime-local
  saleEndsAt: z.string().optional(),
});

export const createEventFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ adminToken: z.string(), config: eventConfig }).parse(d))
  .handler(async ({ data }) => {
    if (!authed(data.adminToken)) return { authorized: false as const };
    const c = data.config;
    try {
      const ev = await createEvent({
        slug: c.slug,
        name: c.name,
        description: c.description ?? null,
        saleStartsAt: new Date(c.saleStartsAt),
        saleEndsAt: c.saleEndsAt ? new Date(c.saleEndsAt) : null,
        priceCents: Math.round(c.priceDollars * 100),
        ticketLimit: c.ticketLimit,
        holdMinutes: c.holdMinutes,
        maxPerUser: c.maxPerUser,
      });
      return { authorized: true as const, ok: true as const, id: ev.id };
    } catch (e) {
      return { authorized: true as const, ok: false as const, error: (e as Error).message };
    }
  });

export const updateEventFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        adminToken: z.string(),
        id: z.number(),
        patch: z.object({
          name: z.string().trim().min(1).optional(),
          description: z.string().trim().optional(),
          priceDollars: z.number().min(0).optional(),
          ticketLimit: z.number().int().min(0).optional(),
          holdMinutes: z.number().int().min(1).optional(),
          maxPerUser: z.number().int().min(1).optional(),
          saleStartsAt: z.string().optional(),
          saleEndsAt: z.string().nullable().optional(),
        }),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    if (!authed(data.adminToken)) return { authorized: false as const };
    const p = data.patch;
    const res = await updateEvent(data.id, {
      name: p.name,
      description: p.description,
      priceCents: p.priceDollars != null ? Math.round(p.priceDollars * 100) : undefined,
      ticketLimit: p.ticketLimit,
      holdMinutes: p.holdMinutes,
      maxPerUser: p.maxPerUser,
      saleStartsAt: p.saleStartsAt ? new Date(p.saleStartsAt) : undefined,
      saleEndsAt: p.saleEndsAt === undefined ? undefined : p.saleEndsAt ? new Date(p.saleEndsAt) : null,
    });
    return { authorized: true as const, ...res };
  });

export const refundOrderFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ adminToken: z.string(), orderId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    if (!authed(data.adminToken)) return { authorized: false as const };
    const res = await refundOrder(data.orderId);
    if (res.ok && res.paymentIntentId && PAYMENTS_MODE === 'stripe') {
      await getStripe().refunds.create({ payment_intent: res.paymentIntentId }).catch(() => {});
    }
    return { authorized: true as const, ...res };
  });

export const cancelHoldFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ adminToken: z.string(), orderId: z.number() }).parse(d))
  .handler(async ({ data }) => {
    if (!authed(data.adminToken)) return { authorized: false as const };
    return { authorized: true as const, ...(await cancelHold(data.orderId)) };
  });
