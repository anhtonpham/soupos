import 'dotenv/config';
import { client } from '../src/lib/db';
import { createEvent, getEventStatus } from '../src/lib/inventory';

// Placeholder demo drop. Edit freely — every value here is per-event configurable.
const slug = process.env.SEED_SLUG ?? 'soupleaf-hotpot-pass';

try {
  await createEvent({
    slug,
    name: 'Soupleaf Hotpot Pass — Summer Drop',
    description: 'Unlimited free hotpot. Show your pass in person at Soupleaf.',
    saleStartsAt: new Date(), // on sale immediately
    priceCents: 2500, // $25
    ticketLimit: 20,
    holdMinutes: 15,
    maxPerUser: 1,
  });
  console.log(`✓ seeded event "${slug}"`);
} catch (e) {
  console.log(`event "${slug}" may already exist:`, (e as Error).message);
}

console.log(await getEventStatus(slug));
await client.end();
