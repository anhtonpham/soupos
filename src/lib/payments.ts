import { sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { db } from './db';
import { getStripe, APP_BASE_URL } from './stripe';
import { markOrderPaid } from './inventory';

/** Creates a Stripe Checkout Session for a pending order and returns its URL. */
export async function createCheckoutSession(input: {
  orderId: number;
  amountCents: number;
  currency: string;
  eventName: string;
  email: string;
}): Promise<string> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    client_reference_id: String(input.orderId),
    customer_email: input.email,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: input.currency,
          unit_amount: input.amountCents,
          product_data: { name: input.eventName },
        },
      },
    ],
    success_url: `${APP_BASE_URL}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${APP_BASE_URL}/checkout/cancel?order=${input.orderId}`,
  });
  await db.execute(sql`UPDATE orders SET checkout_session_id = ${session.id} WHERE id = ${input.orderId}`);
  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return session.url;
}

function paymentIntentId(session: Stripe.Checkout.Session): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  return typeof pi === 'string' ? pi : pi.id;
}

/**
 * Synchronous fulfillment path: called from the /checkout/success loader with the
 * session id from Stripe's redirect. Confirms payment and issues the ticket. If
 * the seat is gone (rare late-payment edge), refunds and reports it.
 */
export async function confirmCheckoutSession(
  sessionId: string,
): Promise<{ ok: true; ticketCode: string | null } | { ok: false; reason: string }> {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (session.payment_status !== 'paid') return { ok: false, reason: 'NOT_PAID' };

  const orderId = Number(session.client_reference_id);
  const pi = paymentIntentId(session);
  const result = await markOrderPaid({ orderId, paymentIntentId: pi });

  if (!result.ok) {
    if (pi) await stripe.refunds.create({ payment_intent: pi }).catch(() => {});
    return { ok: false, reason: result.reason };
  }
  return { ok: true, ticketCode: result.ticketCode };
}

/**
 * Webhook backstop: idempotent, catches payments where the buyer closed the tab
 * before the success redirect ran. Verifies the Stripe signature on the raw body.
 */
export async function handleWebhookEvent(rawBody: string, signature: string): Promise<void> {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not set');

  const event = stripe.webhooks.constructEvent(rawBody, signature, secret);

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = Number(session.client_reference_id);
    const pi = paymentIntentId(session);
    const result = await markOrderPaid({ orderId, paymentIntentId: pi });
    if (!result.ok && pi) {
      await stripe.refunds.create({ payment_intent: pi }).catch(() => {});
    }
  }
}
