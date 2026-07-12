import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { randomInt } from 'node:crypto';
import { NextRequest } from 'next/server';
import { resolveCallerIdentity, readGuestCookie } from '@/lib/identity';
import { signGuestCookie, GUEST_COOKIE_NAME } from '@/lib/guest-cookie';
import { createAnonymousUser } from '@/lib/anonymous';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

// Use a random IP in the 203.0.113.0/24 documentation range so each test run
// avoids colliding with the 24h IP rate-limit left by a previous run.
const TEST_IP = `203.0.113.${randomInt(1, 254)}`;

beforeAll(() => {
  process.env.GUEST_COOKIE_SECRET = 'test-secret-for-vitest-only-32bytes!!';
});

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

function buildReq(cookieValue?: string): NextRequest {
  const headers = new Headers();
  if (cookieValue) headers.set('cookie', `${GUEST_COOKIE_NAME}=${cookieValue}`);
  return new NextRequest(new URL('http://localhost/api/session/start'), { headers });
}

describe('readGuestCookie', () => {
  it('returns null when missing', () => {
    expect(readGuestCookie(buildReq())).toBeNull();
  });
  it('returns the verified payload when present and valid', () => {
    const raw = signGuestCookie({ userId: '00000000-0000-0000-0000-000000000099' });
    const out = readGuestCookie(buildReq(raw));
    expect(out?.userId).toBe('00000000-0000-0000-0000-000000000099');
  });
  it('returns null when signature is bad', () => {
    expect(readGuestCookie(buildReq('garbage.signature'))).toBeNull();
  });
});

describe('resolveCallerIdentity', () => {
  it("returns kind='none' for a vanilla request", async () => {
    const out = await resolveCallerIdentity(buildReq());
    expect(out.kind).toBe('none');
  });

  it.skipIf(!process.env.DATABASE_URL)("returns kind='anonymous' for a valid guest cookie", async () => {
    const created = await createAnonymousUser({
      ip: TEST_IP,
      secret: process.env.GUEST_COOKIE_SECRET!,
    });
    if (!created.ok) throw new Error('setup');
    const raw = signGuestCookie({ userId: created.user.id });
    const out = await resolveCallerIdentity(buildReq(raw));
    expect(out.kind).toBe('anonymous');
    if (out.kind === 'anonymous') expect(out.user.id).toBe(created.user.id);
  });
});
