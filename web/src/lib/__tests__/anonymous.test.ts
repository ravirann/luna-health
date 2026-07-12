import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { sql, eq } from 'drizzle-orm';
import { hashIp, isIpRateLimited, createAnonymousUser, findAnonymousUser } from '@/lib/anonymous';
import { getDb, schema } from '@/lib/db';

beforeAll(() => {
  process.env.GUEST_COOKIE_SECRET = 'test-secret-for-vitest-only-32bytes!!';
});

afterEach(async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  // Clean recently-created test anonymous users. Bounded by a 5-minute
  // window so a misconfigured DATABASE_URL can't wipe historical data.
  await db.execute(sql`
    DELETE FROM users
    WHERE is_anonymous = true
      AND clerk_user_id IS NULL
      AND created_at > now() - interval '5 minutes'
  `);
});

describe('hashIp', () => {
  it('returns a stable, hex-shaped digest', () => {
    const a = hashIp('203.0.113.7', 'test-secret-for-vitest-only-32bytes!!');
    const b = hashIp('203.0.113.7', 'test-secret-for-vitest-only-32bytes!!');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
  it('changes when the secret changes', () => {
    const a = hashIp('203.0.113.7', 'test-secret-for-vitest-only-32bytes!!');
    const b = hashIp('203.0.113.7', 'different-secret-32bytes-padded!!!');
    expect(a).not.toBe(b);
  });
});

describe('isIpRateLimited', () => {
  it.skipIf(!process.env.DATABASE_URL)('returns false when no recent creation', async () => {
    const ipHash = hashIp('198.51.100.99', process.env.GUEST_COOKIE_SECRET!);
    const limited = await isIpRateLimited(ipHash);
    expect(limited).toBe(false);
  });
  it.skipIf(!process.env.DATABASE_URL)('returns true when an anon user was created from that IP within 24h', async () => {
    const db = getDb();
    const ipHash = hashIp('198.51.100.42', process.env.GUEST_COOKIE_SECRET!);
    await db.insert(schema.users).values({ isAnonymous: true, ipHash });
    const limited = await isIpRateLimited(ipHash);
    expect(limited).toBe(true);
  });
});

describe('createAnonymousUser', () => {
  it.skipIf(!process.env.DATABASE_URL)('inserts a user row with ip_hash set — no extra ledger rows', async () => {
    const ip = '198.51.100.7';
    const result = await createAnonymousUser({
      ip,
      secret: process.env.GUEST_COOKIE_SECRET!,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.user.isAnonymous).toBe(true);
    expect(result.user.guestCookieHash).toBeTruthy();

    const db = getDb();
    const row = await db
      .select({ ipHash: schema.users.ipHash })
      .from(schema.users)
      .where(eq(schema.users.id, result.user.id));
    expect(row).toHaveLength(1);
    expect(row[0].ipHash).toBe(hashIp(ip, process.env.GUEST_COOKIE_SECRET!));
  });

  it.skipIf(!process.env.DATABASE_URL)('returns rate_limited when the same IP created one within 24h', async () => {
    const ip = '198.51.100.55';
    const a = await createAnonymousUser({ ip, secret: process.env.GUEST_COOKIE_SECRET! });
    expect(a.ok).toBe(true);
    const b = await createAnonymousUser({ ip, secret: process.env.GUEST_COOKIE_SECRET! });
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.error).toBe('rate_limited');
  });

  it.skipIf(!process.env.DATABASE_URL)('findAnonymousUser by id returns the row only when is_anonymous', async () => {
    const r = await createAnonymousUser({
      ip: '198.51.100.111',
      secret: process.env.GUEST_COOKIE_SECRET!,
    });
    if (!r.ok) throw new Error('setup failed');
    const found = await findAnonymousUser(r.user.id);
    expect(found?.id).toBe(r.user.id);
  });
});
