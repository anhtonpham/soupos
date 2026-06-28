# Soupleaf Hotpot Pass

A Ticketmaster-style ticket-drop system for selling a limited run of Soupleaf
**Hotpot Passes** — without overselling. Buyers purchase a pass during a timed
drop and get a digital QR pass; staff verify it in person.

The headline problem this solves: the previous tool (Luma) oversold — 20
allocated, 65 sold. Here, **overselling is impossible by construction.**

> Full design: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)

## How it can't oversell

Inventory is **physical ticket rows**, not a counter. Creating an event
pre-generates exactly `ticket_limit` rows; buying claims one with
`SELECT … FOR UPDATE SKIP LOCKED` inside a transaction. A 21st sale is impossible
because a 21st row never exists. The test suite fires **65 concurrent buyers at a
20-seat event and asserts exactly 20 succeed.**

## Stack

pnpm · TanStack Start (Vite + Nitro) · Drizzle ORM · PlanetScale Postgres ·
Stripe · Vercel.

## Local development

Requires Node 22+, pnpm, and a Postgres database.

```bash
pnpm install
cp .env.example .env          # then edit DATABASE_URL etc.

pnpm db:generate              # generate SQL migration from the Drizzle schema
pnpm db:migrate               # apply it
pnpm seed                     # create a demo "Summer Drop" (20 passes, $25)

pnpm dev                      # http://localhost:3000
```

Key pages: `/` (drops) · `/e/<slug>` (buy) · `/t/<code>` (pass) ·
`/staff/verify` · `/admin`.

## Payments

Controlled by `PAYMENTS_MODE`:

- **`free`** (default when no Stripe key) — passes are claimed, not charged. The
  whole flow runs with no Stripe account.
- **`stripe`** — real Stripe Checkout. Fulfillment is **synchronous** on the
  success redirect (instant pass, no polling); the webhook at
  `/api/stripe/webhook` is an idempotent backstop. Test webhooks locally with:

  ```bash
  stripe listen --forward-to localhost:3000/api/stripe/webhook
  ```

## Tests

```bash
pnpm test        # real-Postgres suite incl. the 65-vs-20 concurrency proof
pnpm typecheck
```

## Deployment (Vercel + PlanetScale)

1. Create a PlanetScale Postgres database; use its **pooled** connection string
   as `DATABASE_URL`.
2. Apply migrations against it: `pnpm db:migrate`.
3. Deploy to Vercel — the Nitro plugin emits the Vercel server output. Set env
   vars (see `.env.example`): `DATABASE_URL`, `APP_BASE_URL`, `STRIPE_SECRET_KEY`,
   `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `ADMIN_TOKEN`, `STAFF_TOKEN`,
   and `PAYMENTS_MODE=stripe`.
4. Add the Stripe webhook endpoint (`/api/stripe/webhook`) in the Stripe Dashboard.
5. Optional: a Vercel Cron hitting `/api/cron/expire` to tidy expired holds.

## Project layout

```
src/lib/inventory.ts   the oversell-proof engine (createEvent / reserveSeat / markOrderPaid)
src/lib/db/            Drizzle schema + client
src/lib/payments.ts    Stripe checkout / webhook / refund
src/server/            createServerFn API (reserve, events, verify, admin)
src/routes/            pages + API routes (incl. /api/stripe/webhook)
tests/                 concurrency + holds + payment-backstop
docs/ARCHITECTURE.md   full system design
```
