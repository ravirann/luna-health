import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { mergeAnonIntoAuthed } from '@/lib/merge';
import { createAnonymousUser } from '@/lib/anonymous';
import { getDb, schema } from '@/lib/db';

beforeAll(() => {
  process.env.GUEST_COOKIE_SECRET = 'test-secret-for-vitest-only-32bytes!!';
});

function testIp(): string {
  return `merge-test-${randomUUID()}`;
}

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

describe('mergeAnonIntoAuthed', () => {
  it.skipIf(!process.env.DATABASE_URL)('moves all FKs onto the verified local user', async () => {
    const db = getDb();
    const existing = await db
      .insert(schema.users)
      .values({
        email: `existing${Date.now()}@example.com`,
        passwordHash: 'test-hash',
        isAnonymous: false,
      })
      .returning({ id: schema.users.id });

    const anon = await createAnonymousUser({
      ip: testIp(),
      secret: process.env.GUEST_COOKIE_SECRET!,
    });
    if (!anon.ok) throw new Error('setup');
    const sess = await db
      .insert(schema.sessions)
      .values({ userId: anon.user.id })
      .returning({ id: schema.sessions.id });

    const result = await mergeAnonIntoAuthed({
      anonUserId: anon.user.id,
      authedUserId: existing[0].id,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.mergedUserId).toBe(existing[0].id);

    const movedSess = await db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sess[0].id));
    expect(movedSess[0].userId).toBe(existing[0].id);

    const anonRow = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, anon.user.id));
    expect(anonRow).toHaveLength(0);
  });

  it.skipIf(!process.env.DATABASE_URL)('user_prefs policy: authed values win, anon fills missing fields', async () => {
    const db = getDb();
    const existing = await db
      .insert(schema.users)
      .values({
        email: `pref${Date.now()}@example.com`,
        passwordHash: 'test-hash',
        isAnonymous: false,
      })
      .returning({ id: schema.users.id });
    await db.insert(schema.userPrefs).values({
      userId: existing[0].id,
      vibe: 'calm',
      tone: 'Warm',
      pace: 'Natural',
      warmth: 7,
    });
    const anon = await createAnonymousUser({
      ip: testIp(),
      secret: process.env.GUEST_COOKIE_SECRET!,
    });
    if (!anon.ok) throw new Error('setup');
    await db.insert(schema.userPrefs).values({
      userId: anon.user.id,
      name: 'Aanya',
      vibe: 'playful',
      tone: 'Sultry',
      pace: 'Brisk',
      warmth: 9,
    });

    const result = await mergeAnonIntoAuthed({
      anonUserId: anon.user.id,
      authedUserId: existing[0].id,
    });
    expect(result.ok).toBe(true);
    const final = await db
      .select()
      .from(schema.userPrefs)
      .where(eq(schema.userPrefs.userId, existing[0].id));
    expect(final[0].vibe).toBe('calm'); // authed wins
    expect(final[0].name).toBe('Aanya'); // anon filled missing field
  });
});
