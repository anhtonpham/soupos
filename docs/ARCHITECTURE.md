# Soupleaf "Hotpot Pass" — System Architecture

## 1. Context & goals

We're selling a limited run of **Hotpot Passes** in a hyped "ticket drop." A pass
is a credential the holder shows in person at Soupleaf; staff verify it's a real,
paid pass belonging to that person.

The driving problem: the previous tool (Luma) **oversold** — 20 allocated, 65
sold. That's a read-modify-write race: many checkout requests each read
"sold < limit" at the same instant, all see room, all insert.

**Our chosen fix (correctness above all):** make the limit a *physical fact of the
data*. We pre-create exactly `ticket_limit` ticket rows per event; buying means
*claiming one of those existing rows*. A 21st sale is **structurally impossible**
because a 21st row doesn't exist — no counter to trust, no arithmetic to get wrong.

### Goals

1. **Never sell more than allocated. Ever.** The one hard invariant — enforced by
   the shape of the data, not by careful bookkeeping.
2. **Seamless for the buyer:** drop page → countdown → buy → pay → instant digital
   pass with a QR code (synchronous fulfillment, no waiting).
3. **Seamless for staff:** open a page, scan/lookup the pass, see VALID + the
   holder's name to confirm identity. No daily limits — authenticity only.
4. **Simple to operate and cheap to run** at this scale (tens to low hundreds of
   passes per drop).

### Non-goals (current scope)

- No per-day / per-use redemption tracking — a scan is a read-only authenticity
  check, not a "burn." (Easy to add later.)
- No tiers/VIP, reserved seating, or resale in v1 (single ticket type → no
  `ticket_types` table).
- No full account system — buyers identify by email; admin/staff use shared-secret
  access.

---

## 2. Tech stack

| Concern         | Choice                                   |
|-----------------|------------------------------------------|
| Package manager | **pnpm**                                 |
| Framework       | **TanStack Start** (React, Vite, Nitro)  |
| ORM             | **Drizzle ORM** (`pg-core`)              |
| Database        | **PlanetScale Postgres**                 |
| Payments        | **Stripe** (Checkout, synchronous fulfillment + webhook backstop) |
| Hosting         | **Vercel**                               |
| QR              | `qrcode` (render) + browser BarcodeDetector/`html5-qrcode` (scan) |

---

## 3. The core guarantee: overselling is impossible by construction

### 3.1 The bug we're preventing

```
Req A: read "19 < 20" ✓      Req B: read "19 < 20" ✓   (same instant)
Req A: INSERT → 20           Req B: INSERT → 21  ← OVERSOLD
```

An app-level `if (sold < limit)` can't fix this; the gap between read and write
lets others slip in. This is what bit Luma.

### 3.2 The fix: physical seat rows + `FOR UPDATE SKIP LOCKED`

**Inventory is rows, not a number.** When an event is created we generate exactly
`ticket_limit` ticket rows in status `free`. Buying claims one:

```sql
-- at event creation: make exactly ticket_limit seats
INSERT INTO tickets (event_id, status)
SELECT $event_id, 'free' FROM generate_series(1, $ticket_limit);

-- buying: atomically grab ONE available seat
UPDATE tickets
SET status = 'held', order_id = $order_id, user_id = $user_id,
    held_until = now() + ($hold_minutes || ' minutes')::interval
WHERE id = (
  SELECT id FROM tickets
  WHERE event_id = $event_id
    AND (status = 'free' OR (status = 'held' AND held_until < now()))
  ORDER BY id
  FOR UPDATE SKIP LOCKED        -- each buyer locks a DIFFERENT free seat
  LIMIT 1
)
RETURNING id;
-- row returned → reserved.   no row → genuinely sold out.
```

Why this is the strongest design for "never oversell":

1. **Structurally impossible to oversell.** Only `ticket_limit` rows exist. A claim
   only ever flips an existing row's status; nothing can create row #21. The cap is
   the shape of the data, not a rule in code.
2. **No counter → no drift, ever.** There is no `reserved_count` number to keep in
   sync across sales, refunds, expiries, and crashes. The truth is the rows.
3. **`SKIP LOCKED` = correct *and* highly concurrent.** When 500 people click at
   once, each transaction locks a *different* unlocked free seat and ignores ones
   others are mid-claiming — no collisions, no long line behind a single hot row.
   When all rows are taken, the subquery returns nothing → "sold out."
4. **Holds expire for free (no cron needed).** The claim's `WHERE` already treats
   `status='held' AND held_until < now()` as available, so an abandoned seat becomes
   claimable again automatically. (An optional janitor job can reset long-expired
   holds to `free` purely for tidy reporting — not required for correctness.)

### 3.3 Optional paranoia layer

For a formal "provably equivalent to one-at-a-time" guarantee, the claim can run at
Postgres **`SERIALIZABLE`** isolation (abort + retry on conflict). With the physical
-seat model this is *not needed* for correctness — it's just the theoretical ceiling
and stacks cleanly if ever wanted.

### 3.4 Is "just DB locking" enough at this scale? — Yes.

It's the correct, standard approach. The claim is a single indexed statement (sub-
millisecond). `SKIP LOCKED` spreads load across seat rows, so there isn't even a
single hot row to bottleneck on. A 20–200 seat drop with hundreds of simultaneous
buyers is trivially within range. **When you'd outgrow it** (not now): inventory in
the millions per event — then you'd shard. Over-engineering for Soupleaf today.

---

## 4. Data model (events / users / orders / tickets)

An **order** is the payment record + temporary hold lifecycle. A **ticket** is a
physical seat (the unit of inventory) that becomes the QR credential when sold.

```sql
CREATE TABLE users (
    id         BIGSERIAL PRIMARY KEY,
    email      TEXT UNIQUE NOT NULL,
    name       TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE events (
    id             BIGSERIAL PRIMARY KEY,
    slug           TEXT UNIQUE NOT NULL,           -- e.g. "summer-2026"
    name           TEXT NOT NULL,
    description    TEXT,
    sale_starts_at TIMESTAMPTZ NOT NULL,           -- when the drop opens
    sale_ends_at   TIMESTAMPTZ,
    price_cents    INTEGER NOT NULL DEFAULT 0,
    currency       TEXT NOT NULL DEFAULT 'usd',
    ticket_limit   INTEGER NOT NULL,               -- how many seat rows to generate
    hold_minutes   INTEGER NOT NULL DEFAULT 10,
    max_per_user   INTEGER NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (ticket_limit >= 0)
);

CREATE TABLE orders (
    id                  BIGSERIAL PRIMARY KEY,
    event_id            BIGINT NOT NULL REFERENCES events(id),
    user_id             BIGINT NOT NULL REFERENCES users(id),
    quantity            INTEGER NOT NULL DEFAULT 1,
    status              TEXT NOT NULL DEFAULT 'pending',
    amount_cents        INTEGER,
    payment_intent_id   TEXT,
    checkout_session_id TEXT,
    idempotency_key     TEXT UNIQUE,               -- de-dupe double Buy clicks
    expires_at          TIMESTAMPTZ NOT NULL,      -- matches the seats' held_until
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at             TIMESTAMPTZ,
    CHECK (quantity > 0),
    CHECK (status IN ('pending','paid','failed','expired','cancelled','refunded'))
);

CREATE TABLE tickets (
    id          BIGSERIAL PRIMARY KEY,
    event_id    BIGINT NOT NULL REFERENCES events(id),
    order_id    BIGINT REFERENCES orders(id),      -- null while 'free'
    user_id     BIGINT REFERENCES users(id),       -- set on claim
    ticket_code TEXT UNIQUE,                        -- the QR token, assigned when sold
    status      TEXT NOT NULL DEFAULT 'free',
    held_until  TIMESTAMPTZ,                        -- set while 'held'
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    sold_at     TIMESTAMPTZ,
    CHECK (status IN ('free','held','sold','cancelled','refunded'))
);
CREATE INDEX tickets_event_status_idx ON tickets (event_id, status);
```

**Inventory = ticket rows.** Lifecycle: `free → held → sold` (plus `cancelled` /
`refunded`). Availability and sold counts are *derived* read-only queries — they
never gate correctness; the atomic claim does that:

```sql
-- "X of N left" for the storefront
SELECT count(*) FROM tickets
WHERE event_id = $e AND (status='free' OR (status='held' AND held_until < now()));
```

There are no `reserved_count` / `paid_count` columns to maintain. (To resell a
refunded seat, reset its row to `free`; otherwise refunded/cancelled are terminal.)

---

## 5. Payments: synchronous fulfillment + webhook backstop

We fulfill **in the request** (instant pass, no polling) and keep the webhook only
as a safety net.

### 5.1 Primary path — Stripe Checkout, verified on the success redirect

```
1. Buy clicked → reserveSeat() claims a seat + creates a pending order
2. Create Stripe Checkout Session (client_reference_id = order_id) → redirect
3. Buyer pays → Stripe redirects to /checkout/success?session_id={CHECKOUT_SESSION_ID}
4. success loader: stripe.checkout.sessions.retrieve(session_id)
        payment_status === 'paid' → markOrderPaid(order_id)   ← synchronous
5. Pass (QR) shown immediately
```

(Upgrade option: Payment Element + `paymentIntents.create({ confirm: true })` to
stay fully on-site; 3DS is a client-side step, still not a webhook.)

### 5.2 Webhook = idempotent backstop only

The one hole in a webhook-free design: buyer **pays, then closes the tab before the
redirect** — synchronous fulfillment never runs. The webhook
(`checkout.session.completed`) catches that, calling the **same** `markOrderPaid()`,
de-duped on Stripe `event.id`.

### 5.3 `reserveSeat()` — claim + pending order (one transaction)

```
BEGIN;
  user_id  = upsert user by email;
  -- enforce max_per_user: reject if user already holds/owns an active ticket here
  order_id = INSERT orders(event_id,user_id,quantity,'pending',
                           expires_at = now()+hold, idempotency_key) RETURNING id;
  seat_id  = UPDATE tickets SET status='held', order_id, user_id,
                    held_until = now()+hold
             WHERE id = (SELECT id FROM tickets
                          WHERE event_id=$e
                            AND (status='free' OR (status='held' AND held_until<now()))
                          ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
             RETURNING id;
  IF seat_id IS NULL: ROLLBACK → SOLD_OUT        -- order insert rolls back too
COMMIT;
```
(For `quantity > 1`: claim with `LIMIT $qty` and require exactly `$qty` rows, else
roll back. v1 default is 1.)

### 5.4 `markOrderPaid()` — the safe transition (idempotent)

```
BEGIN;
  rows = UPDATE orders SET status='paid', paid_at=now(), payment_intent_id=$pi
         WHERE id=$order_id AND status='pending' RETURNING id;

  IF rows == 1:                                   -- normal: pending → paid
      UPDATE tickets SET status='sold', ticket_code=$generatedCode,
                         sold_at=now(), held_until=NULL
      WHERE order_id=$order_id AND status='held';

  ELSE:                                           -- order wasn't pending
      s = SELECT status FROM orders WHERE id=$order_id;
      IF s == 'paid':  no-op                      -- already fulfilled (idempotent)
      ELSE:            -- expired/cancelled but payment landed late:
          re = claim a fresh seat (same SKIP LOCKED query) for this order;
          IF re: mark order paid + tickets sold(+code)
          ELSE:  mark order 'refunded' + stripe.refunds.create(...)   -- never oversell
COMMIT;
```

Because the seat must already exist and be claimable, the late-payment edge can
only ever *reclaim a real free seat or refund* — it can never manufacture an extra
one. The invariant holds across the payment boundary.

### 5.5 Expiring holds

Not required for correctness — the claim query already treats expired holds as
available (lazy reclaim). An **optional** Vercel Cron can tidy up for reporting:
reset long-expired `held` seats to `free` and mark their orders `expired`.

---

## 6. Application architecture (TanStack Start)

- **Server functions (`createServerFn`)** — typed RPC from loaders/components:
  `reserveSeat`, `getEventStatus`, `getTicket`, `verifyTicket`, admin queries.
  Inputs validated with **zod**.
- **Server route** for the **Stripe webhook backstop** (needs the raw body for
  signature verification):

  ```ts
  // src/routes/api/stripe/webhook.ts
  export const Route = createFileRoute('/api/stripe/webhook')({
    server: { handlers: { POST: async ({ request }) => {
      const raw = await request.text();
      const event = stripe.webhooks.constructEvent(
        raw, request.headers.get('stripe-signature')!, WEBHOOK_SECRET);
      if (event.type === 'checkout.session.completed') {
        await markOrderPaid(Number(event.data.object.client_reference_id));
      }
      return new Response('ok');
    }}},
  });
  ```

- **Shared domain logic** (`src/lib/inventory.ts`): `reserveSeat`, `markOrderPaid`,
  `verifyTicket` — imported by both server functions and the webhook route.

### Routes / pages

| Path                  | Type         | Purpose |
|-----------------------|--------------|---------|
| `/` or `/e/$slug`     | page         | Storefront: details, price, live "X of N left", countdown, Buy. |
| `/checkout/success`   | page         | Retrieves the session, fulfills synchronously, shows the pass. |
| `/t/$ticketCode`      | page         | Digital pass: QR + holder name + event. |
| `/staff/verify`       | page (gated) | Scan/lookup → VALID/INVALID + holder name. |
| `/admin`              | page (gated) | Live counts (sold / held / free), buyer list, CSV export. |
| `/api/stripe/webhook` | server route | Backstop → `markOrderPaid`. |
| `/api/cron/expire`    | server route | Optional Vercel Cron → tidy expired holds. |

### Project structure

```
src/
├─ routes/
│  ├─ __root.tsx, index.tsx, e.$slug.tsx
│  ├─ checkout.success.tsx
│  ├─ t.$ticketCode.tsx          # digital pass
│  ├─ staff.verify.tsx, admin.index.tsx
│  └─ api/stripe/webhook.ts, api/cron/expire.ts
├─ server/                        # createServerFn wrappers (reserve, status, verify, admin)
└─ lib/
   ├─ db/{index.ts,schema.ts}     # drizzle client + schema
   ├─ inventory.ts                # reserveSeat / markOrderPaid (the SKIP LOCKED core)
   ├─ stripe.ts, qr.ts, auth.ts
drizzle/                          # generated migrations
tests/
   ├─ concurrency.test.ts         # 65 buyers vs 20 seats → exactly 20
   ├─ holds.test.ts               # expired holds reclaimable
   └─ payment-backstop.test.ts    # late payment after sold out → refund, no oversell
```

---

## 7. End-to-end flows

**Buy (happy path):**
```
Storefront ("12 of 20 left") → enter name+email → reserveSeat():
   BEGIN; upsert user; INSERT order(pending); claim a seat (SKIP LOCKED) →
   no seat? SOLD_OUT; COMMIT
→ Stripe Checkout → pay → /checkout/success retrieves session →
   markOrderPaid(): order pending→paid, ticket held→sold + ticket_code → show QR
```

**Sold-out race:** once all 20 rows are `held`/`sold`, every further claim's
subquery returns no row → SOLD_OUT. No Stripe session, no charge.
**65 simultaneous buyers → exactly 20 claims** (there are only 20 rows).

**Abandoned checkout:** never pays → the seat's `held_until` lapses → the next
buyer's claim reclaims it automatically (no cron needed).

**Staff verify:** scan QR → `verifyTicket(code)` (read-only) → `sold` →
show holder name; staff confirms the person matches. No write.

---

## 8. Identity, access & security

- **Pass = bearer credential.** QR encodes an unguessable `ticket_code`, bound to a
  **holder name** so staff confirm identity. (Optional later: a photo on the pass.)
- **Admin/staff gating (v1):** `ADMIN_TOKEN` / `STAFF_TOKEN` env secrets in an
  httpOnly cookie; gated server functions check them. Clean upgrade to real auth
  later without touching the inventory core.
- **Webhook** verified via Stripe signature; **cron** route secured by a secret.
- **Abuse controls (optional for a hot drop):** per-IP rate limit on `reserveSeat`,
  `max_per_user`, optional Turnstile/hCaptcha on Buy.
- **Secrets** only in Vercel env vars; `ticket_code` treated like a password.

---

## 9. Deployment (Vercel + PlanetScale)

- **Build:** `vite.config.ts` = `tanstackStart()` + `viteReact()` + `nitro()`;
  Nitro emits Vercel Functions.
- **DB driver:** PlanetScale **pooled** `DATABASE_URL` (`sslmode=require`) with
  `postgres` (postgres.js) + `drizzle-orm/postgres-js`; small per-instance pool
  (`max: 1–2`), `prepare: false` behind the transaction pooler. The seat-claim
  transaction works cleanly through the pooler.
- **Migrations:** Drizzle Kit (`db:generate` → `db:migrate`), applied as a deploy
  step, ideally via a PlanetScale branch → promote. Seat rows for an event are
  generated when the event is created (or via a seed/admin action).
- **Cron (optional):** Vercel Cron hits `/api/cron/expire` for tidy reporting.
- **Env vars:** see `.env.example`.

---

## 10. How we prove it works (tests, real Postgres)

1. **`concurrency.test.ts`** — create a 20-seat event (20 rows), fire **65
   concurrent** `reserveSeat()` → assert **exactly 20** succeed, **45** SOLD_OUT,
   and `count(status IN held|sold) = 20`. (The literal Luma scenario, structurally
   safe.)
2. **`holds.test.ts`** — claim all seats with short holds → new buyers SOLD_OUT →
   after `held_until` passes, the seats are reclaimable.
3. **`payment-backstop.test.ts`** — a hold lapses, another buyer takes the seat and
   pays, the first buyer's payment lands late → `markOrderPaid` reclaims-or-refunds;
   sold tickets never exceed `ticket_limit`.
4. **`max-per-user`** — second active claim for the same user is rejected.

---

## 11. Build milestones

1. **Scaffold:** pnpm + TanStack Start (Vite/Nitro), Drizzle, schema + first
   migration, DB client, `.env`.
2. **Inventory core + tests:** seat generation, `reserveSeat` (SKIP LOCKED) and
   `markOrderPaid`; land the concurrency tests green. *(Build & prove first.)*
3. **Stripe:** Checkout session + synchronous success fulfillment + idempotent
   webhook backstop + refund path.
4. **Buyer UX:** storefront (live counts + countdown), success page, QR pass.
5. **Staff verify:** scanner + `verifyTicket`.
6. **Admin dashboard:** live counts, buyer list, CSV, gating.
7. **Deploy:** Vercel + PlanetScale, live Stripe keys, smoke-test a full drop.

---

## 12. Decisions to confirm before building

1. **Payments:** Stripe Checkout + synchronous success fulfillment + webhook
   backstop (recommended), or fully on-site Payment Element?
2. **Identity strength:** name-only on the pass for v1, or add an optional **photo**?
3. **Per-user limit:** default **1 per email/user**?
4. **First drop config:** allocation (20?), price, and on-sale date/time.
