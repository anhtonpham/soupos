# Soupleaf "Hotpot Pass" — System Architecture

## 1. Context & goals

We're selling a limited run of **Hotpot Passes** in a hyped "ticket drop." A pass
is a credential the holder shows in person at Soupleaf; staff verify it's a real,
paid pass belonging to that person.

The driving problem: the previous tool (Luma) **oversold** — 20 allocated, 65
sold. That's a read-modify-write race: many checkout requests each read
"sold < limit" at the same instant, all see room, all insert. The fix is to make
the check-and-claim **atomic** so two buyers can never both claim the last seat.

### Goals

1. **Never sell more than allocated. Ever.** The one hard invariant.
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
  `ticket_types` table needed).
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
| Hosting         | **Vercel** (+ Vercel Cron for hold cleanup) |
| QR              | `qrcode` (render) + browser BarcodeDetector/`html5-qrcode` (scan) |

---

## 3. Data model (events / users / orders / tickets)

The model: an **order** starts as a reservation/hold; on payment it becomes
**paid** and issues **tickets** (the QR credentials). Inventory is tracked with
**counters on the event**, guarded by `CHECK` constraints.

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

    ticket_limit   INTEGER NOT NULL,               -- the hard cap
    reserved_count INTEGER NOT NULL DEFAULT 0,     -- claimed: pending OR paid
    paid_count     INTEGER NOT NULL DEFAULT 0,     -- actually paid

    hold_minutes   INTEGER NOT NULL DEFAULT 10,
    max_per_user   INTEGER NOT NULL DEFAULT 1,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),

    CHECK (ticket_limit   >= 0),
    CHECK (reserved_count >= 0),
    CHECK (paid_count     >= 0),
    CHECK (reserved_count <= ticket_limit),   -- can't oversell holds
    CHECK (paid_count     <= reserved_count)  -- can't pay for an unheld seat
);

CREATE TABLE orders (
    id                BIGSERIAL PRIMARY KEY,
    event_id          BIGINT NOT NULL REFERENCES events(id),
    user_id           BIGINT NOT NULL REFERENCES users(id),
    quantity          INTEGER NOT NULL DEFAULT 1,
    status            TEXT NOT NULL DEFAULT 'pending',
    amount_cents      INTEGER,
    payment_intent_id TEXT,
    checkout_session_id TEXT,
    idempotency_key   TEXT UNIQUE,                 -- de-dupe double Buy clicks
    expires_at        TIMESTAMPTZ NOT NULL,        -- hold deadline
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    paid_at           TIMESTAMPTZ,
    CHECK (quantity > 0),
    CHECK (status IN ('pending','paid','failed','expired','cancelled','refunded'))
);

CREATE TABLE tickets (
    id          BIGSERIAL PRIMARY KEY,
    order_id    BIGINT NOT NULL REFERENCES orders(id),
    event_id    BIGINT NOT NULL REFERENCES events(id),
    user_id     BIGINT NOT NULL REFERENCES users(id),
    ticket_code TEXT UNIQUE NOT NULL,              -- the QR token (unguessable)
    status      TEXT NOT NULL DEFAULT 'valid',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (status IN ('valid','cancelled','refunded'))
);
```

**Counters as inventory.** `reserved_count` = pending + paid (everything claimed);
`paid_count` = paid. The event is "sold out" when `reserved_count = ticket_limit`,
even if some of those are still pending payment. The `CHECK` constraints make any
counter drift a **loud failure rather than a silent oversell**.

**Why `tickets` is included:** the "show your pass in person" feature *is* QR codes
+ check-in, the exact case where a tickets table is warranted. One paid order issues
`quantity` tickets; each `ticket_code` is the QR. No "used" status because there's
no per-visit burn — verification is read-only.

---

## 4. The core guarantee: how we make overselling impossible

### 4.1 The bug we're preventing

```
Req A: read "19 < 20" ✓      Req B: read "19 < 20" ✓   (same instant)
Req A: INSERT → 20           Req B: INSERT → 21  ← OVERSOLD
```

An app-level `if (sold < limit)` can't fix this; the gap between read and write
lets others slip in. This is what bit Luma.

### 4.2 The fix: one atomic conditional UPDATE

The lock is the database row itself — a single statement that claims a seat only
if there's room:

```sql
UPDATE events
SET reserved_count = reserved_count + $qty
WHERE id = $event_id
  AND reserved_count + $qty <= ticket_limit
RETURNING id;
```

Postgres locks the row it updates and re-checks the `WHERE` under that lock, so
concurrent claimers are serialized on it. **Row returned → reserved. No row →
sold out.** If 500 people click at once on a 20-seat event, at most 20 UPDATEs
succeed; everyone else gets no row. No app logic can race it.

### 4.3 Is "just DB locking" enough at this scale? — Yes.

It's the correct, standard approach, not a compromise:

- The claim is a **single O(1) statement** — well under a millisecond. One event
  row easily serializes hundreds of reservations/second; a 20–200 seat drop with
  a few hundred simultaneous buyers is trivially within range.
- **Single-statement** locking is especially robust on **Vercel + PlanetScale's
  connection pooler** — there's no multi-statement transaction holding a lock
  across a pooled-connection boundary; the critical section is one round trip.
- The `CHECK` constraints are a hard backstop: the database itself refuses to let
  `reserved_count` exceed `ticket_limit`.

**When you'd outgrow it** (not now): sustained thousands of writes/sec contending
on one row → move to sharded counters or a queue/"waiting room." Over-engineering
for Soupleaf today; we'll keep the seam clean.

---

## 5. Payments: synchronous fulfillment + webhook backstop

We fulfill **in the request** (instant pass, no polling) and keep the webhook only
as a safety net.

### 5.1 Primary path — Stripe Checkout, verified on the success redirect

```
1. Buy clicked → reserveSeat() (atomic UPDATE) → create pending order
2. Create Stripe Checkout Session (client_reference_id = order_id) → redirect
3. Buyer pays → Stripe redirects to /checkout/success?session_id={CHECKOUT_SESSION_ID}
4. success loader: stripe.checkout.sessions.retrieve(session_id)
        payment_status === 'paid' → markOrderPaid(order_id)   ← synchronous
5. Pass (QR) shown immediately
```

(Upgrade option: Payment Element + `paymentIntents.create({ confirm: true })` to
stay fully on-site; 3DS is a client-side step, still not a webhook.)

### 5.2 Webhook = idempotent backstop only

The one hole in a webhook-free design: buyer **pays, then closes the tab before
the redirect** — synchronous fulfillment never runs. The webhook
(`checkout.session.completed`) catches that, calling the **same** `markOrderPaid()`.
De-duped on Stripe `event.id`. If you want zero webhook, add an "I paid but don't
see my pass" recovery lookup that re-retrieves the session — but with real money
the backstop is worth its few lines.

### 5.3 `markOrderPaid()` — the safe transition (idempotent)

```
BEGIN;
  rows = UPDATE orders SET status='paid', paid_at=now(), payment_intent_id=$pi
         WHERE id=$order_id AND status='pending'
         RETURNING event_id, quantity;

  IF rows == 1:                                   -- normal: pending → paid
      UPDATE events SET paid_count = paid_count + $quantity WHERE id=$event_id;
      INSERT INTO tickets (...) -- $quantity rows, each a unique ticket_code

  ELSE:                                           -- order wasn't pending
      s = SELECT status FROM orders WHERE id=$order_id;
      IF s == 'paid':  -- already fulfilled (webhook + redirect both ran) → no-op
      ELSE:            -- expired/cancelled but payment landed late:
          -- try to re-claim a seat with the SAME atomic guard
          ok = UPDATE events SET reserved_count = reserved_count + $quantity
               WHERE id=$event_id AND reserved_count + $quantity <= ticket_limit
               RETURNING id;
          IF ok: mark paid + paid_count += qty + issue tickets
          ELSE:  mark 'refunded' + stripe.refunds.create(...)   -- never oversell
COMMIT;
```

This is the key refinement over a naive "always `paid_count += 1`": we bump
`paid_count` **only on a real `pending → paid` transition**, and the rare
expired-but-paid case either reclaims a seat or **auto-refunds** — so we never
oversell even across the payment boundary, and `paid_count <= reserved_count`
always holds.

### 5.4 Releasing holds (Vercel Cron, every minute)

Counters need a cleanup job. Aggregate per event so multiple expiries on one event
decrement correctly (a naive `UPDATE … FROM` would only subtract one):

```sql
WITH expired AS (
  UPDATE orders SET status='expired'
  WHERE status='pending' AND expires_at < now()
  RETURNING event_id, quantity),
agg AS (SELECT event_id, SUM(quantity) AS q FROM expired GROUP BY event_id)
UPDATE events e SET reserved_count = reserved_count - agg.q
FROM agg WHERE e.id = agg.event_id;
```

With synchronous fulfillment, a declined/cancelled payment can also release its
hold immediately rather than waiting for the cron.

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

- **Shared domain logic** (`src/lib/inventory.ts`): `reserveSeat`, `markOrderPaid`
  — imported by both server functions and the webhook route.

### Routes / pages

| Path                  | Type         | Purpose |
|-----------------------|--------------|---------|
| `/` or `/e/$slug`     | page         | Storefront: details, price, live "X of N left", countdown, Buy. |
| `/checkout/success`   | page         | Retrieves the session, fulfills synchronously, shows the pass. |
| `/t/$ticketCode`      | page         | Digital pass: QR + holder name + event. |
| `/staff/verify`       | page (gated) | Scan/lookup → VALID/INVALID + holder name. |
| `/admin`              | page (gated) | Live counts (limit / reserved / paid / available), buyer list, CSV. |
| `/api/stripe/webhook` | server route | Backstop → `markOrderPaid`. |
| `/api/cron/expire`    | server route | Vercel Cron → release expired holds. |

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
   ├─ inventory.ts                # reserveSeat / markOrderPaid (the locking core)
   ├─ stripe.ts, qr.ts, auth.ts
drizzle/                          # generated migrations
tests/
   ├─ concurrency.test.ts         # 65 buyers vs 20 seats → exactly 20
   ├─ holds.test.ts               # expired holds free capacity
   └─ payment-backstop.test.ts    # late payment after sold out → refund, no oversell
```

---

## 7. End-to-end flows

**Buy (happy path):**
```
Storefront ("12 of 20 left") → enter name+email → reserveSeat():
   BEGIN; upsert user; atomic UPDATE events (+1 if room) → no row? SOLD_OUT;
   INSERT order(pending, expires=now()+10m); COMMIT
→ Stripe Checkout → pay → /checkout/success retrieves session →
   markOrderPaid(): pending→paid, paid_count+1, issue ticket(s) → show QR
```

**Sold-out race:** every Buy after the 20th blocks on the event row, reads
`reserved_count = 20`, gets no row → SOLD_OUT. No Stripe session, no charge.
**65 simultaneous buyers → exactly 20 reservations.**

**Abandoned checkout:** never pays → cron expires the order, `reserved_count -= 1`,
seat is available again.

**Staff verify:** scan QR → `verifyTicket(code)` (read-only) → `valid` →
show holder name; staff confirms the person matches. No write.

---

## 8. Identity, access & security

- **Pass = bearer credential.** QR encodes an unguessable `ticket_code`, bound to
  a **holder name** so staff confirm identity. (Optional later: a photo on the pass.)
- **Admin/staff gating (v1):** `ADMIN_TOKEN` / `STAFF_TOKEN` env secrets in an
  httpOnly cookie; gated server functions check them. Clean upgrade to real auth
  later without touching the inventory core.
- **Webhook** verified via Stripe signature.
- **Abuse controls (optional for a hot drop):** per-IP rate limit on `reserveSeat`,
  `max_per_user`, optional Turnstile/hCaptcha on Buy.
- **Secrets** only in Vercel env vars; `ticket_code` treated like a password.

---

## 9. Deployment (Vercel + PlanetScale)

- **Build:** `vite.config.ts` = `tanstackStart()` + `viteReact()` + `nitro()`;
  Nitro emits Vercel Functions.
- **DB driver:** PlanetScale **pooled** `DATABASE_URL` (`sslmode=require`) with
  `postgres` (postgres.js) + `drizzle-orm/postgres-js`; small per-instance pool
  (`max: 1–2`), `prepare: false` behind the transaction pooler. The single-statement
  reservation lock works cleanly through the pooler.
- **Migrations:** Drizzle Kit (`db:generate` → `db:migrate`), applied as a deploy
  step, ideally via a PlanetScale branch → promote.
- **Cron:** Vercel Cron hits `/api/cron/expire` every minute (secured by a secret).
- **Env vars:** see `.env.example`.

---

## 10. How we prove it works (tests, real Postgres)

1. **`concurrency.test.ts`** — 20-seat event, **65 concurrent** `reserveSeat()` →
   assert **exactly 20** succeed, **45** SOLD_OUT, and `reserved_count = 20`.
   (The literal Luma scenario, proven safe.)
2. **`holds.test.ts`** — fill with short holds → new buyers SOLD_OUT → after the
   cleanup runs, seats free up.
3. **`payment-backstop.test.ts`** — hold expires, another buyer takes the last
   seat and pays, first buyer's payment lands late → `markOrderPaid` reclaims-or-
   refunds; `paid_count` never exceeds `ticket_limit`.
4. **`max-per-user`** — second active order for the same user is rejected.

---

## 11. Build milestones

1. **Scaffold:** pnpm + TanStack Start (Vite/Nitro), Drizzle, schema + first
   migration, DB client, `.env`.
2. **Inventory core + tests:** `reserveSeat` / `markOrderPaid` (atomic UPDATE +
   guarded transition); land the concurrency tests green. *(Build & prove first.)*
3. **Stripe:** Checkout session + synchronous success fulfillment + idempotent
   webhook backstop + refund path; Vercel Cron expiry.
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
