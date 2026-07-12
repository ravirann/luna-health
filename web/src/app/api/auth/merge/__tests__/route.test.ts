import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { eq, sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

beforeAll(() => {
  process.env.GUEST_COOKIE_SECRET = 'test-secret-for-vitest-only-32bytes!!';
});

afterEach(async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  await db.execute(sql`
    DELETE FROM users
    WHERE (is_anonymous = true OR email LIKE 'merge-route.%@example.com')
      AND created_at > now() - interval '5 minutes'
  `);
});

const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let ipCounter = 0;

function uniqueIp(): string {
  ipCounter += 1;
  return `merge-test-ip-${testRunId}-${ipCounter}`;
}

import { POST } from '@/app/api/auth/merge/route';
import { GUEST_COOKIE_NAME, signGuestCookie } from '@/lib/guest-cookie';
import { createAnonymousUser } from '@/lib/anonymous';
import { AUTH_COOKIE_NAME, createPasswordUser, createSessionForUser } from '@/lib/local-auth';

describe('POST /api/auth/merge', () => {
  it.skipIf(!process.env.DATABASE_URL)('returns ok + mergedUserId and clears luna_guest', async () => {
    const a = await createAnonymousUser({
      ip: uniqueIp(),
      secret: process.env.GUEST_COOKIE_SECRET!,
    });
    if (!a.ok) throw new Error('setup');
    const cookie = signGuestCookie({ userId: a.user.id });
    const local = await createPasswordUser({
      email: `merge-route.${Date.now()}.${Math.random()}@example.com`,
      password: 'long-enough-password',
    });
    if (!local.ok) throw new Error('local setup');
    const session = await createSessionForUser(local.user.id);
    const headers = new Headers();
    headers.set('cookie', `${GUEST_COOKIE_NAME}=${cookie}; ${AUTH_COOKIE_NAME}=${session.token}`);
    headers.set('content-type', 'application/json');
    const res = await POST(
      new NextRequest(new URL('http://localhost/api/auth/merge'), {
        method: 'POST',
        headers,
        body: '{}',
      }),
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mergedUserId).toBe(local.user.id);
    expect(res.headers.get('set-cookie') ?? '').toMatch(/luna_guest=;/);
    const moved = await getDb()
      .select({ id: schema.users.id })
      .from(schema.users)
      .where(eq(schema.users.id, a.user.id));
    expect(moved).toHaveLength(0);
  });

  it.skipIf(!process.env.DATABASE_URL)('no-op success when no luna_guest cookie present', async () => {
    const local = await createPasswordUser({
      email: `merge-route.${Date.now()}.${Math.random()}@example.com`,
      password: 'long-enough-password',
    });
    if (!local.ok) throw new Error('local setup');
    const session = await createSessionForUser(local.user.id);
    const res = await POST(
      new NextRequest(new URL('http://localhost/api/auth/merge'), {
        method: 'POST',
        headers: new Headers({
          'content-type': 'application/json',
          cookie: `${AUTH_COOKIE_NAME}=${session.token}`,
        }),
        body: '{}',
      }),
    );
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.mergedUserId).toBeUndefined();
  });
});
