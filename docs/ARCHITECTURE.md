# Soupleaf "Hotpot Pass" — System Architecture

## 1. Context & goals

We're selling a limited run of **Hotpot Passes** in a hyped "ticket drop." A pass
is a credential the holder shows in person at Soupleaf; staff verify it's a real,
paid pass belonging to that person.

The driving problem: the previous tool (Luma) **oversold** — 20 allocated, 65
sold. That is almost always a *read-modify-write race condition*: many checkout
requests each read "sold < limit" at the same moment, all see room, and all
insert. The fix is to make the check-and-claim **atomic** so two buyers can never
both claim the last seat.

### Goals

1. **Never sell more than allocated. Ever.** This is the one hard invariant.
2. **Seamless for the buyer:** drop page → countdown → buy → pay → instant digital
   pass with a QR code.
3. **Seamless for staff:** open a page, scan/lookup the customer's pass, see
   VALID + the holder's name to confirm identity. No daily limits, no counters —
   just authenticity verification.
4. **Simple to operate and cheap to run** at this scale (tens to low hundreds of
   passes per drop).

### Explicit non-goals (per current scope)

- **No per-day / per-use redemption tracking.** A scan is a read-only
  authenticity check, not a "burn." (Easy to add later if needed.)
- No reserved seating, tiers, or transfers/resale in v1.
- No full user-account system in v1 — buyers identify by email; admin/staff use
  shared-secret access.

---

## 2. Tech stack

| Concern            | Choice                                  | Why |
|--------------------|-----------------------------------------|-----|
| Package manager    | **pnpm**                                | Requested; fast, strict. |
| Framework          | **TanStack Start** (React, Vite, Nitro) | Requested. Type-safe routing, `createServerFn` RPC, server routes for the webhook, SSR. |
| ORM                | **Drizzle ORM** (`pg-core`)             | Requested. Typed schema, SQL-first — easy to express the exact locking query. |
| Database           | **PlanetScale Postgres**                | Requested. Standard Postgres → `SELECT … FOR UPDATE` row locking works as-is. |
| Payments           | **Stripe Checkout** + webhooks          | Hosted card UI, Apple/Google Pay, receipts, refunds out of the box. |
| Hosting            | **Vercel** (TanStack Start + Nitro)     | Requested. Server functions/routes run as Vercel Functions. |
| QR                 | `qrcode` (render) + `html5-qrcode`/BarcodeDetector (scan) | Generate pass QR server-side; scan in the staff browser. |

---

## 3. The core guarantee: how we make overselling impossible

Everything else is plumbing. This section is the point of the project.

### 3.1 The bug we're preventing

```
Request A: SELECT count(*) … → 19   (room! 19 < 20)
Request B: SELECT count(*) … → 19   (room! 19 < 20)   ← read at the same instant
Request A: INSERT pass                → now 20
Request B: INSERT pass                → now 21   ← OVERSOLD
```

Application-level checks (`if (sold < limit)`) don't fix this, because the gap
between *read* and *insert* lets other requests slip in. This is what bit Luma.

### 3.2 The fix: serialize claims with a row lock

We take a **row-level lock on the drop** for the duration of each reservation, so
the *count-check-insert* runs as one indivisible step. Postgres makes concurrent
claimers wait their turn on that single row:

```ts
// inside db.transaction(...)   — one DB connection, one transaction
await tx.execute(sql`
  SELECT id FROM drops WHERE slug = ${slug} FOR UPDATE
`); // ← any other reservation for THIS drop now blocks here until we COMMIT

const [{ active }] = await tx.execute(sql`
  SELECT count(*)::int AS active
  FROM passes
  WHERE drop_id = ${dropId}
    AND (status = 'paid'
         OR (status = 'reserved' AND hold_expires_at > now()))
`);

if (active >= totalAllocated) {
  // no room → return SOLD_OUT, transaction rolls back
} else {
  await tx.insert(passes).values({ ...reservedHold });
}
// COMMIT releases the lock; the next waiting claimer proceeds
```

Because claimers are serialized on the drop row, two buyers can **never** both
pass the `active < totalAllocated` check for the same seat. The invariant holds
no matter how many requests arrive simultaneously.

### 3.3 Is "just database locking" really enough at this scale? — Yes.

You asked whether relying on DB locking is acceptable. For this use case it's not
just acceptable, it's the **correct, standard** approach:

- The locked section is a couple of indexed queries + one insert — **well under a
  millisecond** per reservation. One drop row can comfortably serialize hundreds
  of reservations/second. A 20–200 pass drop with a few hundred people hammering
  "Buy" is trivially within that envelope.
- It's **provably correct** and simple to reason about — no eventual-consistency
  edge cases, no custom counters to keep in sync.
- The lock scope is **per drop row**, so different drops never contend with each
  other.

**The one rule:** the lock only protects you *inside a transaction on a single
connection*. Drizzle's `db.transaction()` guarantees that. On Vercel + PlanetScale
we use PlanetScale's **pooled** connection string; a transaction borrows one
backend connection for its whole duration, so `FOR UPDATE` behaves exactly as
intended. (We keep the per-instance pool small and let PlanetScale's pooler fan
in — see §9.)

**When you'd outgrow it** (not now): sustained thousands of writes/sec contending
on a *single* row. The upgrade path is well-trodden — atomic counter column,
sharded counters, or a queue/"waiting room" — but for Soupleaf's scale that would
be over-engineering. We'll note the seam so it's easy to revisit.

### 3.4 Why we still "hold" inventory during checkout (recommended)

Stripe Checkout takes the buyer 30–120 seconds. Two ways to handle a seat during
that window:

- **A. Reserve-with-hold (recommended).** On "Buy", atomically claim a
  `reserved` pass with `hold_expires_at = now() + 30 min`, *then* send them to
  Stripe. The webhook flips it to `paid`. Counts stay accurate; nobody pays for a
  seat that's already gone.
- **B. No hold (simplest, but bad for a drop).** Let everyone into Stripe, only
  check capacity at the webhook, and **refund** whoever didn't make the cut. For
  a 20-seat hyped drop this means potentially *charging and refunding ~180
  people* — a support nightmare and a flood of Stripe fees. It re-creates Luma-
  style chaos, just in refund form.

We recommend **A**. The cost is one extra column (`hold_expires_at`) and a status
enum — minimal complexity for a much better experience.

**Holds expire lazily — no cron needed.** Expiry isn't a job; it's just a `WHERE`
clause. The capacity query only counts `paid` rows plus `reserved` rows whose
hold hasn't passed. An abandoned cart simply stops counting after 30 minutes.
(An optional nightly Vercel Cron can mark stale `reserved` rows `expired` purely
for tidy reporting — not required for correctness.)

### 3.5 The webhook is the final backstop

Even with holds, confirm capacity again at payment time (same row lock). Normal
case: the hold is still valid → mark `paid`. Rare edge (hold expired, payment
landed late): if there's still room, honor it; if not, **auto-refund** and tell
the buyer. This guarantees the invariant *across the payment boundary*, not just
at reservation time. Confirmation is **idempotent** (Stripe retries webhooks):
re-processing an already-`paid` pass is a no-op, and we de-dupe on Stripe's event
id.

---

## 4. Data model (Drizzle, Postgres)

`src/lib/db/schema.ts`

```ts
export const passStatus = pgEnum('pass_status',
  ['reserved', 'paid', 'expired', 'cancelled', 'refunded']);

export const drops = pgTable('drops', {
  id:             uuid('id').primaryKey().defaultRandom(),
  slug:           text('slug').notNull().unique(),          // e.g. "summer-2026"
  name:           text('name').notNull(),
  description:    text('description'),
  totalAllocated: integer('total_allocated').notNull(),     // the hard cap
  priceCents:     integer('price_cents').notNull().default(0),
  currency:       text('currency').notNull().default('usd'),
  saleStartsAt:   timestamp('sale_starts_at', { withTimezone: true }).notNull(),
  saleEndsAt:     timestamp('sale_ends_at',   { withTimezone: true }),
  holdMinutes:    integer('hold_minutes').notNull().default(30),
  maxPerEmail:    integer('max_per_email').notNull().default(1),
  createdAt:      timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const passes = pgTable('passes', {
  id:                  uuid('id').primaryKey().defaultRandom(),
  dropId:              uuid('drop_id').notNull().references(() => drops.id, { onDelete: 'cascade' }),
  status:              passStatus('status').notNull().default('reserved'),
  holderName:          text('holder_name').notNull(),       // identity shown to staff
  holderEmail:         text('holder_email').notNull(),
  qrToken:             text('qr_token').unique(),           // issued on payment
  holdExpiresAt:       timestamp('hold_expires_at', { withTimezone: true }),
  stripeSessionId:     text('stripe_session_id').unique(),
  stripePaymentIntent: text('stripe_payment_intent'),
  amountPaidCents:     integer('amount_paid_cents'),
  createdAt:           timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt:              timestamp('paid_at',    { withTimezone: true }),
}, (t) => ({
  dropStatusIdx: index('passes_drop_status_idx').on(t.dropId, t.status),
  dropEmailIdx:  index('passes_drop_email_idx').on(t.dropId, t.holderEmail),
}));

// Idempotency / audit for Stripe webhook retries.
export const webhookEvents = pgTable('webhook_events', {
  id:         text('id').primaryKey(),       // Stripe event id
  type:       text('type').notNull(),
  receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
});
```

**A "pass" is the unit of inventory.** Active inventory =
`status='paid' OR (status='reserved' AND hold_expires_at > now())`. There is no
separate counter to drift out of sync — the rows *are* the count.

---

## 5. Application architecture (TanStack Start)

### 5.1 Where logic lives

- **Server functions (`createServerFn`)** — same-origin, type-safe RPC called
  from route loaders and components. Used for: `reservePass`, `getDropStatus`,
  `getPass`, `verifyPass`, admin queries. Input validated with **zod** via the
  server-function validator.
- **Server routes (`createFileRoute(...).server.handlers`)** — real HTTP
  endpoints for *external* callers. Used for the **Stripe webhook**, which needs
  the **raw request body** for signature verification:

  ```ts
  // src/routes/api/stripe/webhook.ts
  export const Route = createFileRoute('/api/stripe/webhook')({
    server: {
      handlers: {
        POST: async ({ request }) => {
          const raw = await request.text();                 // raw body, unparsed
          const sig = request.headers.get('stripe-signature')!;
          const event = stripe.webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
          await handleStripeEvent(event);                   // → confirmPass (idempotent)
          return new Response('ok');
        },
      },
    },
  });
  ```

- **Shared domain logic** (`src/lib/inventory.ts`) — `reservePass`,
  `confirmPass`, `verifyPass`. Plain functions imported by both server functions
  and the webhook route (server functions can't be called *from* server routes,
  so the real logic lives in shared utilities).

### 5.2 Routes / pages

| Path                       | Type           | Purpose |
|----------------------------|----------------|---------|
| `/` or `/drops/$slug`      | page           | Storefront: pass details, price, live "X of N left", countdown to `saleStartsAt`, Buy button. |
| `/checkout/success`        | page           | Post-Stripe landing; polls until webhook marks the pass `paid`, then shows the pass. |
| `/checkout/cancel`         | page           | Buyer backed out; hold expires on its own. |
| `/p/$qrToken`              | page           | The buyer's digital pass: big QR, holder name, drop name. (Add-to-wallet later.) |
| `/staff/verify`            | page (gated)   | Staff scanner: scan/lookup → VALID/INVALID + holder name to match the person. |
| `/admin`                   | page (gated)   | Live dashboard: allocated / paid / active holds / available, buyer list, revenue, export CSV. |
| `/api/stripe/webhook`      | server route   | Stripe → `confirmPass`. |

### 5.3 Suggested project structure

```
soupleaf-pass/
├─ vite.config.ts            # tanstackStart() + viteReact() + nitro() (Vercel)
├─ drizzle.config.ts
├─ app.config / tsconfig.json
├─ src/
│  ├─ routes/
│  │  ├─ __root.tsx
│  │  ├─ index.tsx                  # storefront
│  │  ├─ drops.$slug.tsx
│  │  ├─ checkout.success.tsx
│  │  ├─ p.$qrToken.tsx             # digital pass
│  │  ├─ staff.verify.tsx
│  │  ├─ admin.index.tsx
│  │  └─ api/stripe/webhook.ts      # server route
│  ├─ server/
│  │  ├─ reserve.ts                 # createServerFn: reservePass + Stripe Checkout session
│  │  ├─ drop.ts                    # createServerFn: getDropStatus
│  │  ├─ verify.ts                  # createServerFn: verifyPass (read-only)
│  │  └─ admin.ts                   # createServerFn: dashboard queries (gated)
│  ├─ lib/
│  │  ├─ db/{index.ts,schema.ts}    # drizzle client + schema
│  │  ├─ inventory.ts               # reservePass / confirmPass (the locking core)
│  │  ├─ stripe.ts                  # Stripe client + checkout/refund helpers
│  │  ├─ qr.ts                      # token generation + QR rendering
│  │  └─ auth.ts                    # admin/staff shared-secret gate
│  └─ styles/…
├─ drizzle/                          # generated migrations
└─ tests/
   ├─ concurrency.test.ts            # 65 concurrent buyers vs 20 seats → exactly 20
   ├─ holds.test.ts                  # expired holds free capacity
   └─ webhook-backstop.test.ts       # late payment after seat gone → auto-refund, no oversell
```

---

## 6. End-to-end flows

### 6.1 Buying a pass (happy path)

```
Buyer → Storefront: sees "12 of 20 left", clicks Buy, enters name + email
  → reservePass() server fn:
       db.transaction:
         LOCK drop row (FOR UPDATE)
         enforce sale window + max_per_email
         count active passes; if full → SOLD_OUT
         INSERT pass(status=reserved, hold_expires_at=now()+30m)
       create Stripe Checkout Session (metadata: passId)
       return checkout URL
  → Buyer redirected to Stripe, pays
  → Stripe → POST /api/stripe/webhook (checkout.session.completed)
       verify signature; de-dupe on event id
       confirmPass(passId): LOCK drop row, re-check capacity,
         set status=paid, issue qr_token, clear hold
  → /checkout/success polls getPass(passId) until paid → shows QR pass
```

### 6.2 Sold-out / race

Every "Buy" that arrives after the 20th claim blocks on the drop row lock, then
reads `active = 20` and gets `SOLD_OUT`. No Stripe session is created; nobody is
charged. **65 simultaneous buyers → exactly 20 reservations.**

### 6.3 Abandoned checkout

Buyer never pays. Hold lapses after 30 min (lazy — just stops counting). Seat is
available again automatically.

### 6.4 In-person verification (staff)

```
Staff opens /staff/verify (entered STAFF_TOKEN once, stored in cookie)
  → scans customer's QR (or types the short code)
  → verifyPass(qrToken) server fn (read-only):
       found + status=paid  → VALID  (show holder name, drop, purchase date)
       not found / not paid → INVALID
  → staff confirms the name matches the person (ID / face). Done. No write.
```

---

## 7. Payments (Stripe) details

- **Stripe Checkout Sessions** (hosted) — least PCI burden, supports wallets,
  emails receipts. `mode: 'payment'`, `client_reference_id = passId`,
  `metadata.passId`, `success_url`/`cancel_url` to our pages,
  `expires_at` ≈ aligned to the hold window.
- **Webhook** `checkout.session.completed` → `confirmPass`. Also handle
  `checkout.session.expired` → mark the reserved pass `expired` (optional;
  lazy expiry already covers correctness).
- **Idempotency:** insert the Stripe `event.id` into `webhook_events`; if it's
  already there, skip. `confirmPass` is itself idempotent.
- **Refund backstop:** if `confirmPass` finds no capacity (rare late-payment
  edge), call Stripe refund and set status `refunded`.
- **Test mode now, live later:** build against `sk_test_…`; flip env vars to live
  keys at go-time. Local webhook testing via the Stripe CLI (`stripe listen
  --forward-to localhost:3000/api/stripe/webhook`).

---

## 8. Identity, access & security

- **Pass = bearer credential.** The QR encodes an unguessable random
  `qr_token`. Verification binds it to a **holder name** so staff confirm the
  person matches. (Optional later: a selfie/photo on the pass, or name-on-ID
  check, to harden against someone forwarding their QR.)
- **Admin/staff gating (v1, deliberately simple):** `ADMIN_TOKEN` / `STAFF_TOKEN`
  env secrets entered once and kept in an httpOnly cookie; server functions for
  those areas check it. Clean upgrade path to real auth (Better-Auth/Clerk) later
  without touching the inventory core.
- **Webhook** verified via Stripe signature — never trust an unsigned POST.
- **Abuse controls (optional for a hot drop):** per-IP rate limiting on
  `reservePass`, `max_per_email`, and optionally a Turnstile/hCaptcha on the Buy
  button to blunt scripted grabbing.
- **Secrets** only in Vercel env vars; never shipped to the client. `qr_token`
  values are capabilities — treat like passwords (TLS only, not logged).

---

## 9. Deployment (Vercel + PlanetScale)

- **Vercel build:** `vite.config.ts` uses `tanstackStart()`, `viteReact()`, and
  `nitro()`; Nitro emits Vercel Functions automatically. Fluid Compute on by
  default.
- **Connections:** use PlanetScale's **pooled** `DATABASE_URL`
  (`sslmode=require`). Driver: `postgres` (postgres.js) + `drizzle-orm/postgres-js`,
  with a **small per-instance pool** (`max: 1–2`) and `prepare: false` if behind
  the transaction pooler — PlanetScale's pooler fans many serverless instances
  into the database. Transactions (and thus `FOR UPDATE`) work normally.
- **Migrations:** authored with Drizzle Kit (`db:generate`), applied with
  `db:migrate` as a deploy step (CI or a one-off), ideally through a PlanetScale
  branch → promote workflow so schema changes are reviewed before prod.
- **Env vars** (see `.env.example`): `DATABASE_URL`, `STRIPE_SECRET_KEY`,
  `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, `APP_BASE_URL`,
  `ADMIN_TOKEN`, `STAFF_TOKEN`.

---

## 10. How we prove it works (tests)

The anti-oversell core ships with automated tests run against a real Postgres:

1. **`concurrency.test.ts`** — seed a 20-seat drop, fire **65 concurrent**
   `reservePass()` calls. Assert **exactly 20** succeed, **45** get `SOLD_OUT`,
   and the DB active count is **20**. (This is the literal Luma scenario, proven
   safe.)
2. **`holds.test.ts`** — fill the drop with short holds; assert new buyers get
   `SOLD_OUT`, then after holds lapse the seats free up.
3. **`webhook-backstop.test.ts`** — a hold expires, another buyer takes the last
   seat and pays; the first buyer's payment lands late → `confirmPass` returns
   `NO_CAPACITY`, triggers a refund, and the paid count stays at the cap.
4. **`max-per-email`** — second active pass for the same email is rejected.

CI runs these on every push; locally `pnpm test` against a dev Postgres.

---

## 11. Build milestones

1. **Scaffold:** pnpm + TanStack Start + Vite/Nitro, Drizzle, schema + first
   migration, DB client, `.env`.
2. **Inventory core + tests:** `reservePass` / `confirmPass` with row locking;
   land the concurrency tests green. *(This is the critical piece — build and
   prove it first.)*
3. **Stripe:** Checkout session creation + webhook route + idempotency + refund
   backstop.
4. **Buyer UX:** storefront with live counts + countdown, success page polling,
   digital QR pass page.
5. **Staff verify:** scanner page + `verifyPass`.
6. **Admin dashboard:** live counts, buyer list, CSV export, gating.
7. **Deploy:** Vercel + PlanetScale, live Stripe keys, smoke test the full drop.

---

## 12. Decisions to confirm before building

1. **Holds (§3.4):** recommend **A (reserve-with-hold)**. Confirm, or pick B.
2. **Identity strength (§8):** name-only on the pass for v1, or add an optional
   **photo** to the pass for stronger in-person identity matching?
3. **Per-email limit:** default **1 pass per email** — correct, or allow more?
4. **Drop config:** allocation (20?), price, and the on-sale date/time for the
   first real drop.
