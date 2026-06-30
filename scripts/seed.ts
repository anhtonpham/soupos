import 'dotenv/config';
import { sql, eq } from 'drizzle-orm';
import { client, db } from '../src/lib/db';
import { events } from '../src/lib/db/schema';
import { createEvent, getEventStatus, type CreateEventInput } from '../src/lib/inventory';

// A few demo drops that exercise every storefront state in the design:
// on sale, upcoming, and sold out. Edit freely — every value is per-event.
const DAY = 86_400_000;
const now = Date.now();

const drops: CreateEventInput[] = [
  {
    slug: process.env.SEED_SLUG ?? 'soupleaf-hotpot-pass',
    name: 'Soupleaf Hotpot Pass — Summer Drop',
    description: 'Unlimited free hotpot, all summer long. Show your pass in person at Soupleaf.',
    saleStartsAt: new Date(), // on sale immediately
    priceCents: 2500, // $25
    ticketLimit: 20,
    holdMinutes: 15,
    maxPerUser: 1,
  },
  {
    slug: 'fall-drop',
    name: 'Fall Drop',
    description: 'The next batch of Hotpot Passes. Sale opens soon.',
    saleStartsAt: new Date(now + 14 * DAY), // upcoming
    priceCents: 3000, // $30
    ticketLimit: 20,
    holdMinutes: 15,
    maxPerUser: 1,
  },
  {
    slug: 'spring-members-drop',
    name: 'Spring Members Drop',
    description: 'A members-only run — every pass has been claimed.',
    saleStartsAt: new Date(now - 30 * DAY), // sale open, but inventory is gone -> SOLD OUT
    priceCents: 2500, // $25
    ticketLimit: 20,
    holdMinutes: 15,
    maxPerUser: 1,
  },
];

async function seed(input: CreateEventInput) {
  try {
    await createEvent(input);
    console.log(`✓ seeded "${input.slug}"`);
  } catch (e) {
    console.log(`• "${input.slug}" may already exist: ${(e as Error).message}`);
  }
}

for (const drop of drops) {
  await seed(drop);
}

// Mark the spring drop fully claimed so it renders as SOLD OUT in the storefront.
const [spring] = await db.select().from(events).where(eq(events.slug, 'spring-members-drop'));
if (spring) {
  await db.execute(sql`
    UPDATE tickets SET status = 'sold', sold_at = now()
    WHERE event_id = ${spring.id} AND status <> 'sold'
  `);
}

for (const drop of drops) {
  console.log(await getEventStatus(drop.slug));
}

await client.end();
