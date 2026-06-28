import 'dotenv/config';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { db, client } from '../src/lib/db';

await migrate(db, { migrationsFolder: './drizzle' });
console.log('✓ migrations applied');
await client.end();
