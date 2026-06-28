import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

const url =
  process.env.DATABASE_URL ?? 'postgres://postgres:postgres@127.0.0.1:5432/soupos';

// One shared client. `prepare: false` keeps us compatible with transaction-mode
// connection poolers (e.g. PlanetScale / pgBouncer) in production.
export const client = postgres(url, {
  max: Number(process.env.PG_POOL_MAX ?? 20),
  prepare: false,
});

export const db = drizzle(client, { schema });
