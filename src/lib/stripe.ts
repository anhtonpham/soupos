import Stripe from 'stripe';

/**
 * 'stripe' takes real card payments via Stripe Checkout.
 * 'free' skips payment entirely (passes are claimed, not charged) so the app
 * runs end-to-end with no Stripe account. Defaults based on whether a key is set.
 */
export const PAYMENTS_MODE: 'stripe' | 'free' =
  (process.env.PAYMENTS_MODE as 'stripe' | 'free' | undefined) ??
  (process.env.STRIPE_SECRET_KEY ? 'stripe' : 'free');

export const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3000';

let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set (PAYMENTS_MODE=stripe requires it)');
  if (!_stripe) _stripe = new Stripe(key);
  return _stripe;
}
