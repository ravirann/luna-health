// Luna AI — Drizzle DB connection.
//
// Uses the Neon serverless driver so it works on Vercel Edge / Node.js /
// local development without any pool tuning. For local development against
// a non-Neon Postgres (e.g. docker), set DATABASE_URL to the standard
// connection string and replace the driver below.

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from './schema';

let _db: ReturnType<typeof drizzle> | null = null;

export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Add it to .env.local for development.',
    );
  }
  const sql = neon(url);
  _db = drizzle(sql, { schema });
  return _db;
}

export { schema };
export type Db = ReturnType<typeof getDb>;
