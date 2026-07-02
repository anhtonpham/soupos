# Claude Design prompt — Soupleaf Hotpot Pass diagrams

Copy-paste the prompt below into Claude Design (claude.ai/design) to get a
polished, presentation-grade version of the two diagrams. Everything in it is
verified against the shipped code on `main`; nothing needs re-checking.

---

## PROMPT (copy from here)

Create two presentation-quality diagrams for **Soupleaf Hotpot Pass**, a
Ticketmaster-style limited ticket-drop system. Audience: a potential customer
(restaurant owner) who was burned by a tool that oversold — they allocated 20
passes and it sold 65. The diagrams must be beautiful but technically exact.

**Brand:** warm food-brand feel, light sage background `#eef3ec`, ink
`#16240f`, brand green `#3e9b3f` (dark `#2f7d2a`), amber accent `#a9772a` for
"held/pending", muted red `#b3402f` only for failure states. Headings in
Quicksand (rounded, friendly), body in Figtree, code/labels in Space Mono.
White cards, 16px radius, hairline `#dfe8d8` borders, soft green-tinted
shadows. Status pills: FREE = light green, HELD = light amber, SOLD = dark
ink with green text.

---

### Diagram 1 — "How the system fits together" (layered architecture, 16:9)

Four horizontal layers connected by labeled arrows, top to bottom. Add small
numbered chips ①–⑧ tracing one buyer's purchase across the layers.

**Layer 1 · Actors & external services** — five cards:
- 🧑 Buyer (browses drops, buys, shows QR in store) ① clicks Buy
- 🧾 Staff (phone scanner at counter; camera QR scan → VALID + holder name; read-only)
- 🛠 Admin (creates/edits drops, live counts, refunds; ADMIN_TOKEN)
- 💳 Stripe (hosted checkout; ⑤ redirects buyer back; ⑦ signed webhook backstop) — mark as external
- ⏰ Vercel Cron (optional janitor hitting /api/cron/expire; label: "never needed for correctness") — external

**Layer 2 · Application — TanStack Start on Vercel** — three cards:
- Buyer pages (SSR): `/` drop grid with live counts; `/e/$slug` countdown +
  availability bar, polls every 5s, buy form; `/checkout/success` ⑥ fulfills
  synchronously in its loader and reveals the pass; `/t/$code` digital QR pass
- Staff & admin consoles: `/staff/verify` camera scanner (BarcodeDetector);
  `/admin` stats/revenue/CSV; `/admin/events/new · edit` per-drop config
  (limit, price, sale window, hold minutes, max per person)
- Server routes (raw HTTP, highlight amber): `POST /api/stripe/webhook`
  (raw body + Stripe signature verify → same fulfillment function, idempotent);
  `GET /api/cron/expire` (Bearer secret)

Below them a thin full-width band: **Typed RPC layer (createServerFn + zod)**
listing: startCheckout ②, confirmCheckout, listEvents, getEventStatus,
getPass, verifyTicket (STAFF_TOKEN), admin create/update/refund/cancel
(ADMIN_TOKEN).

**Layer 3 · Domain engine (src/lib)** — three cards, first one highlighted green:
- `inventory.ts` — THE engine, sole owner of every inventory decision:
  reserveSeat ③ (atomic seat claim, FOR UPDATE SKIP LOCKED), markOrderPaid
  (idempotent pending→paid; honor hold → else re-claim → else refund),
  createEvent/updateEvent (mints exactly ticket_limit seat rows; resize can
  only touch FREE rows), refundOrder/cancelHold (seat back to free),
  verifyTicket + getEventStatus (read-only; counts derived from rows)
- `payments.ts` — Stripe adapter: createCheckoutSession ④
  (client_reference_id = orderId), confirmCheckoutSession (server-side
  retrieve, require payment_status='paid'), handleWebhookEvent; no-capacity
  edge → automatic refund
- `codes.ts / db client` — 128-bit unguessable QR codes; Drizzle ORM over
  postgres.js, pooled, prepare:false (PlanetScale pooler-safe)

**Layer 4 · Data — PlanetScale Postgres, single source of truth** — four
table cards: users (email unique, name shown to staff) · events (ticket_limit,
price, sale window, hold_minutes, max_per_user) · orders (status
pending/paid/expired/cancelled/refunded, expires_at, payment_intent_id) ·
**tickets ★ highlighted** (status FREE/HELD/SOLD pills, held_until,
ticket_code unique, index on (event_id, status)) — caption: "inventory is
physical rows, not a number".

**Footer band, dark ink:** "THE INVARIANT — sold + held ≤ ticket_limit,
always, physically. A 21st sale would need a 21st row; one never exists." ⑧
Next to it a green-tinted card: "Proven in CI: 65 concurrent buyers vs 20
seats → exactly 20 succeed (concurrency.test.ts); expired holds self-release
(holds.test.ts); late payment after sellout auto-refunds
(payment-backstop.test.ts)."

Arrow labels between layers: "HTTPS · SSR + typed RPC", "plain function calls
— same process", "SQL over TLS · every claim in one ACID transaction". Stripe
gets its own vertical lane on the right connecting Layer 1 ↔ payments.ts and
the webhook route.

---

### Diagram 2 — "Why overselling is physically impossible" (vertical story, scrollable page or tall poster)

Open with a scoreboard of three cards: red "20 → 65 · what the last tool
sold" · dark green "65 → 20 · this system under the same stampede (automated
test)" · dark green "1,000 → 20 · a 1,000-buyer stampede resolves in ~1 second
on a single small database — still exactly 20".

**Panel 0 · The bug we designed out (red header):** two side-by-side request
lanes racing a shared counter: both read "19 < 20 ✓" at t₁, both insert at
t₂, second one flagged "21 ✗ OVERSOLD". Caption: the check and the write are
separate steps; under load, dozens of requests fit in the gap.

**Panel 1 · Capacity is physical rows:** a 10×2 grid of seat chips S1–S20
(mix of SOLD dark / HELD amber / FREE green) plus a dashed ghost chip labeled
"seat #21 — does not exist". Caption: creating a drop mints exactly
ticket_limit rows (INSERT … generate_series); selling only flips a row's
status; no code path creates a row afterward — even admin resize only
adds/removes FREE rows.

**Panel 2 · The claim is one indivisible operation:** vertical flowchart —
BEGIN (sale window? per-person limit?) → create pending order (rolls back if
claim fails) → dark code block with the actual SQL:

```
UPDATE tickets SET status='held', order_id=…, held_until=now()+hold
WHERE id = (SELECT id FROM tickets
            WHERE event_id=$drop
              AND (status='free' OR (status='held' AND held_until<now()))
            ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1)
RETURNING id;  -- row back = yours · no row = sold out
```

→ two branch cards: green "✓ row returned → seat HELD, COMMIT, off to
Stripe" / red "✗ no row → ROLLBACK, order evaporates, nobody charged, clean
'Sold out'".

**Panel 3 · 65 buyers in the same second:** left a crowd split into two
bands (buyers 1–20, buyers 21–65), arrows fanning into the seat grid; right
two outcome cards: "20 × seat HELD — each locked a different row, zero
collisions (SKIP LOCKED skips rows mid-claim)" and "45 × SOLD_OUT — instant
honest answer; not a failed payment, not a refund days later".

**Panel 3½ · Scale — thousands of clicks at once:** headline "Losing is
cheap — that's the trick to handling a mob." Three cards:
green "MEASURED — 1,000 concurrent buys → exactly 20 seats in ~1 s (~900
req/s) on one small Postgres pool (tests/concurrency.test.ts); production
PlanetScale only raises the ceiling" · green "WHY IT KEEPS SCALING — a claim
is ~2–3 ms of DB work; a sold-out answer is a sub-millisecond index scan;
SKIP LOCKED means nobody queues behind a lock; only the ≤ ticket_limit
winners ever touch Stripe; PlanetScale's pooler fans thousands of app
connections into a few dozen backend ones; Vercel scales app instances
horizontally" · amber "THE HONEST CEILING — at six-figure same-second
traffic you'd add an edge waiting-room in front; the engine wouldn't change,
and overload only ever degrades to slow/sold-out, never to seat #21".

**Panel 4 · Holds release themselves:** four-stage lifecycle FREE → HELD
(10–15 min, buyer on Stripe) → SOLD (QR issued) with alternate exit "hold
expires → row is claimable by the next buyer by definition — expiry lives in
the claim query's WHERE clause, not in a cron job". Note: refunds flip the
seat back to FREE (QR wiped), instantly resellable.

**Panel 5 · Money can never mint a seat:** gate card "lock the order row →
success-redirect and webhook are serialized", then three case cards:
A (green, normal 99%): pending + still held → SOLD + QR, second confirmation
is a no-op · B (amber, slow payer): hold expired, seat gone → re-claim a
different free seat with the same guarded query · C (red, sold out
meanwhile): automatic Stripe refund — "the one thing that never happens is
creating seat #21".

**Closing dark band:** "Not a promise — a property tested on every change:
65 truly concurrent buyers vs 20 seats must yield exactly 20, or the build
fails." Invariant sentence: "sold + held ≤ ticket_limit isn't a rule the code
enforces — it's a fact of how the data is shaped."

Keep all SQL, function names, file names, and route paths exactly as given —
they are real. Prefer clarity over density; generous whitespace; every panel
readable from 2 m away on a projector.

## (end of prompt)
