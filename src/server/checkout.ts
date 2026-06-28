import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { reserveSeat, markOrderPaid, getEventStatus } from '../lib/inventory';
import { PAYMENTS_MODE } from '../lib/stripe';
import { createCheckoutSession, confirmCheckoutSession } from '../lib/payments';

/**
 * Reserves a seat (oversell-safe) and returns where to send the buyer:
 * - stripe mode → a Stripe Checkout URL
 * - free mode   → straight to the issued pass
 */
export const startCheckout = createServerFn({ method: 'POST' })
  .validator((d: unknown) =>
    z
      .object({
        eventSlug: z.string(),
        email: z.string().email(),
        name: z.string().trim().min(1).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const reservation = await reserveSeat({
      eventSlug: data.eventSlug,
      email: data.email,
      name: data.name ?? null,
    });
    if (!reservation.ok) {
      return { ok: false as const, reason: reservation.reason };
    }

    const status = await getEventStatus(data.eventSlug);
    if (!status) return { ok: false as const, reason: 'NOT_FOUND' as const };

    if (PAYMENTS_MODE === 'free') {
      const paid = await markOrderPaid({ orderId: reservation.orderId });
      return {
        ok: true as const,
        redirectUrl: paid.ok && paid.ticketCode ? `/t/${paid.ticketCode}` : '/checkout/cancel',
      };
    }

    const url = await createCheckoutSession({
      orderId: reservation.orderId,
      amountCents: status.event.priceCents,
      currency: status.event.currency,
      eventName: status.event.name,
      email: data.email,
    });
    return { ok: true as const, redirectUrl: url };
  });

/** Synchronous fulfillment from the success page. */
export const confirmCheckout = createServerFn({ method: 'POST' })
  .validator((d: unknown) => z.object({ sessionId: z.string() }).parse(d))
  .handler(async ({ data }) => confirmCheckoutSession(data.sessionId));
