import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db';

/** Wipes all tables so each test starts from a clean slate. */
export async function resetDb(): Promise<void> {
  await db.execute(sql`TRUNCATE tickets, orders, events, users RESTART IDENTITY CASCADE`);
}

/** Counts ticket rows by status for an event (raw, for assertions). */
export async function countByStatus(eventSlug: string): Promise<Record<string, number>> {
  const rows = (await db.execute(sql`
    SELECT t.status, count(*)::int AS n
    FROM tickets t JOIN events e ON e.id = t.event_id
    WHERE e.slug = ${eventSlug}
    GROUP BY t.status
  `)) as unknown as { status: string; n: number }[];
  const out: Record<string, number> = {};
  for (const r of rows) out[r.status] = Number(r.n);
  return out;
}
