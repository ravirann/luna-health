import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { POST } from '@/app/api/session/[sessionId]/end/route';
import { GUEST_COOKIE_NAME, signGuestCookie } from '@/lib/guest-cookie';
import { getDb } from '@/lib/db';

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

describe('/api/session/[id]/end', () => {
  it.skipIf(!process.env.DATABASE_URL)('records pause_reason on metadata for anon caller', async () => {
    const { createAnonymousUser } = await import('@/lib/anonymous');
    const { schema } = await import('@/lib/db');
    const { eq } = await import('drizzle-orm');
    const u = await createAnonymousUser({
      ip: `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
      secret: process.env.GUEST_COOKIE_SECRET!,
    });
    if (!u.ok) throw new Error('setup');
    const db = getDb();
    const sess = await db
      .insert(schema.sessions)
      .values({ userId: u.user.id })
      .returning({ id: schema.sessions.id });

    const cookie = signGuestCookie({ userId: u.user.id });
    const headers = new Headers();
    headers.set('cookie', `${GUEST_COOKIE_NAME}=${cookie}`);
    headers.set('content-type', 'application/json');
    const req = new NextRequest(
      new URL(`http://localhost/api/session/${sess[0].id}/end`),
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ pause_reason: 'idle_timeout' }),
      },
    );
    const res = await POST(req, { params: Promise.resolve({ sessionId: sess[0].id }) });
    const body = await res.json();
    expect(body.ok).toBe(true);

    const after = await db
      .select({ metadata: schema.sessions.metadata })
      .from(schema.sessions)
      .where(eq(schema.sessions.id, sess[0].id));
    const md = after[0].metadata as { pause_reason?: string } | null;
    expect(md?.pause_reason).toBe('idle_timeout');
  });

  it.skipIf(!process.env.DATABASE_URL)('returns unauthorized in canonical shape when no identity', async () => {
    const req = new NextRequest(new URL(`http://localhost/api/session/00000000-0000-0000-0000-000000000000/end`), {
      method: 'POST',
      headers: new Headers({ 'content-type': 'application/json' }),
      body: '{}',
    });
    const res = await POST(req, { params: Promise.resolve({ sessionId: '00000000-0000-0000-0000-000000000000' }) });
    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.error).toBe('unauthorized');
    expect(res.status).toBe(401);
  });
});
