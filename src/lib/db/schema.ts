import {
  pgTable,
  bigserial,
  bigint,
  text,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const events = pgTable('events', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  saleStartsAt: timestamp('sale_starts_at', { withTimezone: true }).notNull(),
  saleEndsAt: timestamp('sale_ends_at', { withTimezone: true }),
  priceCents: integer('price_cents').notNull().default(0),
  currency: text('currency').notNull().default('usd'),
  // Number of physical ticket rows generated for this event. This is the
  // inventory cap — overselling is impossible because only this many rows exist.
  ticketLimit: integer('ticket_limit').notNull(),
  holdMinutes: integer('hold_minutes').notNull().default(10),
  maxPerUser: integer('max_per_user').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable('orders', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  eventId: bigint('event_id', { mode: 'number' }).notNull().references(() => events.id),
  userId: bigint('user_id', { mode: 'number' }).notNull().references(() => users.id),
  quantity: integer('quantity').notNull().default(1),
  // pending | paid | failed | expired | cancelled | refunded
  status: text('status').notNull().default('pending'),
  amountCents: integer('amount_cents'),
  paymentIntentId: text('payment_intent_id'),
  checkoutSessionId: text('checkout_session_id'),
  idempotencyKey: text('idempotency_key').unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
});

export const tickets = pgTable(
  'tickets',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    eventId: bigint('event_id', { mode: 'number' }).notNull().references(() => events.id),
    orderId: bigint('order_id', { mode: 'number' }).references(() => orders.id),
    userId: bigint('user_id', { mode: 'number' }).references(() => users.id),
    // The QR token, assigned when the seat is sold. Unguessable bearer credential.
    ticketCode: text('ticket_code').unique(),
    // free | held | sold | cancelled | refunded
    status: text('status').notNull().default('free'),
    heldUntil: timestamp('held_until', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    soldAt: timestamp('sold_at', { withTimezone: true }),
  },
  (t) => ({
    eventStatusIdx: index('tickets_event_status_idx').on(t.eventId, t.status),
  }),
);

export type User = typeof users.$inferSelect;
export type Event = typeof events.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type Ticket = typeof tickets.$inferSelect;
