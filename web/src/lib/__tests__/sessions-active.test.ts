import { describe, it, expect, afterEach } from 'vitest';
import { sql } from 'drizzle-orm';
import { findActiveSession } from '@/lib/sessions';
import { getDb, schema } from '@/lib/db';

afterEach(async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  await db.execute(sql`
    DELETE FROM users
    WHERE is_anonymous = true
      AND clerk_user_id IS NULL
      AND created_at > now() - interval '5 minutes'
  `);
});

describe('findActiveSession', () => {
  it.skipIf(!process.env.DATABASE_URL)('returns the most recent live session for a user', async () => {
    const db = getDb();
    const u = await db
      .insert(schema.users)
      .values({ isAnonymous: true })
      .returning({ id: schema.users.id });
    const s = await db
      .insert(schema.sessions)
      .values({ userId: u[0].id })
      .returning({ id: schema.sessions.id });
    const found = await findActiveSession(u[0].id);
    expect(found?.id).toBe(s[0].id);
  });
  it.skipIf(!process.env.DATABASE_URL)('returns null when only ended sessions exist', async () => {
    const db = getDb();
    const u = await db
      .insert(schema.users)
      .values({ isAnonymous: true })
      .returning({ id: schema.users.id });
    await db.insert(schema.sessions).values({
      userId: u[0].id,
      endedAt: new Date(),
      durationSecs: 60,
    });
    const found = await findActiveSession(u[0].id);
    expect(found).toBeNull();
  });

  it.skipIf(!process.env.DATABASE_URL)('returns null for stale unended sessions past the timeout window', async () => {
    const db = getDb();
    const u = await db
      .insert(schema.users)
      .values({ isAnonymous: true })
      .returning({ id: schema.users.id });
    await db.insert(schema.sessions).values({
      userId: u[0].id,
      startedAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    const found = await findActiveSession(u[0].id);
    expect(found).toBeNull();
  });
});
