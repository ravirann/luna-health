/**
 * Dev-only reset utility. Run via:
 *   npm run dev:reset         — wipe sessions/transcripts/reflections, keep users
 *   npm run dev:nuke          — wipe EVERYTHING including users
 *
 * There's nothing to grant anymore — usage limits are operator-configured
 * (MAX_CALL_SECONDS / DAILY_LIMIT_MINUTES, see src/lib/limits.ts) rather
 * than a per-user amount, so `reset` just clears usage history.
 *
 * Reads DATABASE_URL from .env.local (via dotenv-cli in the npm script).
 */

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { sql } from 'drizzle-orm';
import { schema } from '../src/lib/db';

function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL not set — run via the npm script');
  return drizzle(neon(url), { schema });
}

async function resetSessions() {
  const db = getDb();
  await db.execute(sql`TRUNCATE transcripts, reflections, sessions CASCADE`);
  console.log('cleared sessions / transcripts / reflections');
}

async function nuke() {
  const db = getDb();
  await db.execute(sql`TRUNCATE transcripts, reflections, sessions, users CASCADE`);
  console.log('nuked. sign in again to rebootstrap.');
}

const cmd = process.argv[2];

(async () => {
  switch (cmd) {
    case 'reset':
      await resetSessions();
      break;
    case 'nuke':
      await nuke();
      break;
    default:
      console.error(
        'Usage: dev-reset.ts <reset | nuke>',
      );
      process.exit(1);
  }
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
