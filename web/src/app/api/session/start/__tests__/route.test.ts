import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { sql } from 'drizzle-orm';
import { POST } from '@/app/api/session/start/route';
import { GUEST_COOKIE_NAME, signGuestCookie } from '@/lib/guest-cookie';
import { getDb } from '@/lib/db';

beforeAll(() => {
  process.env.GUEST_COOKIE_SECRET = 'test-secret-for-vitest-only-32bytes!!';
  process.env.BOT_SHARED_SECRET ??= 'bot-shared-secret-for-tests';
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

const testRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
let ipCounter = 0;

function uniqueIp(): string {
  ipCounter += 1;
  return `test-ip-${testRunId}-${ipCounter}`;
}

function makeReq(opts: { ip?: string; cookie?: string; body?: unknown } = {}): NextRequest {
  const headers = new Headers();
  headers.set('content-type', 'application/json');
  if (opts.ip) headers.set('x-forwarded-for', opts.ip);
  if (opts.cookie) headers.set('cookie', `${GUEST_COOKIE_NAME}=${opts.cookie}`);
  return new NextRequest(new URL('http://localhost/api/session/start'), {
    method: 'POST',
    headers,
    body: JSON.stringify(opts.body ?? {}),
  });
}

/** Decode the base64url.sig token body without re-verifying the HMAC —
 *  these tests only care about the claim shape, not signature validity
 *  (that's exercised indirectly by the bot's own verification). */
function decodeTokenPayload(token: string): Record<string, unknown> {
  const [body] = token.split('.');
  return JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
}

describe('/api/session/start canonical contract (§17.39)', () => {
  it('first-time preflight returns ok without allocating a session or guest cookie', async () => {
    const res = await POST(makeReq({ body: { preflight: true } }));
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie') ?? '').not.toMatch(/luna_guest=/);
  });

  it.skipIf(!process.env.DATABASE_URL)('first-time visitor → status:ok + Set-Cookie luna_guest', async () => {
    const res = await POST(makeReq({ ip: uniqueIp() }));
    const body = await res.json();
    expect(body.status).toBe('ok');
    expect(typeof body.token).toBe('string');
    expect(body.sessionId).toBeTruthy();
    const setCookie = res.headers.get('set-cookie') ?? '';
    expect(setCookie).toMatch(/luna_guest=/);
    expect(setCookie).toMatch(/HttpOnly/i);
  });

  it.skipIf(!process.env.DATABASE_URL)('signs an integer `bud` claim (from MAX_CALL_SECONDS) into the token', async () => {
    const originalMax = process.env.MAX_CALL_SECONDS;
    process.env.MAX_CALL_SECONDS = '123';
    try {
      const res = await POST(makeReq({ ip: uniqueIp() }));
      const body = await res.json();
      expect(body.status).toBe('ok');
      const payload = decodeTokenPayload(body.token as string);
      expect(payload.bud).toBe(123);
      expect(Number.isInteger(payload.bud)).toBe(true);
      expect(payload.sub).toBeTruthy();
      expect(payload.sid).toBe(body.sessionId);
      // callBudgetSecs still rides in the (unsigned) body too, for the bot
      // to keep reading during the transition — but `bud` is the signed
      // source of truth.
      expect(body.body.callBudgetSecs).toBe(123);
    } finally {
      if (originalMax === undefined) delete process.env.MAX_CALL_SECONDS;
      else process.env.MAX_CALL_SECONDS = originalMax;
    }
  });

  it.skipIf(!process.env.DATABASE_URL)('rate-limited second anon signup from same IP → status:error error:rate_limited', async () => {
    const ip = uniqueIp();
    await POST(makeReq({ ip }));
    const res2 = await POST(makeReq({ ip }));
    const body = await res2.json();
    expect(body.status).toBe('error');
    expect(body.error).toBe('rate_limited');
    expect(res2.status).toBe(429);
  });

  it.skipIf(!process.env.DATABASE_URL)('dev reuses the recent anonymous user when the same IP is rate-limited', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    try {
      const { createAnonymousUser } = await import('@/lib/anonymous');
      const ip = uniqueIp();
      const created = await createAnonymousUser({
        ip,
        secret: process.env.GUEST_COOKIE_SECRET!,
      });
      if (!created.ok) throw new Error('setup');

      const res = await POST(makeReq({ ip }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.status).toBe('ok');
      const setCookie = res.headers.get('set-cookie') ?? '';
      expect(setCookie).toMatch(/luna_guest=/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it.skipIf(!process.env.DATABASE_URL)('daily usage cap reached → status:soft_gate reason:rate_limited', async () => {
    const { createAnonymousUser } = await import('@/lib/anonymous');
    const { schema } = await import('@/lib/db');
    const created = await createAnonymousUser({
      ip: uniqueIp(),
      secret: process.env.GUEST_COOKIE_SECRET!,
    });
    if (!created.ok) throw new Error('setup');
    const db = getDb();
    // A finished session from earlier today already exceeds a 1-minute cap.
    await db.insert(schema.sessions).values({
      userId: created.user.id,
      startedAt: new Date(),
      endedAt: new Date(),
      durationSecs: 90,
    });
    const originalLimit = process.env.DAILY_LIMIT_MINUTES;
    process.env.DAILY_LIMIT_MINUTES = '1';
    try {
      const cookie = signGuestCookie({ userId: created.user.id });
      const res = await POST(makeReq({ cookie }));
      const body = await res.json();
      expect(body.status).toBe('soft_gate');
      expect(body.reason).toBe('rate_limited');
      expect(res.status).toBe(200);
    } finally {
      if (originalLimit === undefined) delete process.env.DAILY_LIMIT_MINUTES;
      else process.env.DAILY_LIMIT_MINUTES = originalLimit;
    }
  });

  it.skipIf(!process.env.DATABASE_URL)('DAILY_LIMIT_MINUTES=0 disables the daily cap', async () => {
    const { createAnonymousUser } = await import('@/lib/anonymous');
    const { schema } = await import('@/lib/db');
    const created = await createAnonymousUser({
      ip: uniqueIp(),
      secret: process.env.GUEST_COOKIE_SECRET!,
    });
    if (!created.ok) throw new Error('setup');
    const db = getDb();
    await db.insert(schema.sessions).values({
      userId: created.user.id,
      startedAt: new Date(),
      endedAt: new Date(),
      durationSecs: 10_000,
    });
    const originalLimit = process.env.DAILY_LIMIT_MINUTES;
    process.env.DAILY_LIMIT_MINUTES = '0';
    try {
      const cookie = signGuestCookie({ userId: created.user.id });
      const res = await POST(makeReq({ cookie }));
      const body = await res.json();
      expect(body.status).toBe('ok');
    } finally {
      if (originalLimit === undefined) delete process.env.DAILY_LIMIT_MINUTES;
      else process.env.DAILY_LIMIT_MINUTES = originalLimit;
    }
  });

  it.skipIf(!process.env.DATABASE_URL)('concurrent active session → status:error error:session_conflict', async () => {
    const { createAnonymousUser } = await import('@/lib/anonymous');
    const { schema } = await import('@/lib/db');
    const created = await createAnonymousUser({
      ip: uniqueIp(),
      secret: process.env.GUEST_COOKIE_SECRET!,
    });
    if (!created.ok) throw new Error('setup');
    const db = getDb();
    const live = await db
      .insert(schema.sessions)
      .values({ userId: created.user.id })
      .returning({ id: schema.sessions.id });
    const cookie = signGuestCookie({ userId: created.user.id });
    const res = await POST(makeReq({ cookie }));
    const body = await res.json();
    expect(body.status).toBe('error');
    expect(body.error).toBe('session_conflict');
    expect(body.sessionId).toBe(live[0].id);
    expect(res.status).toBe(409);
  });
});
