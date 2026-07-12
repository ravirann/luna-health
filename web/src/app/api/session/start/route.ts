// POST /api/session/start
//
// Canonical response contract (spec §17.39):
//   { status: 'ok', sessionId, token, botUrl, body }
//   { status: 'soft_gate', reason: 'rate_limited' }
//   { status: 'error', error: 'rate_limited' }
//   { status: 'error', error: 'unauthorized' }
//   { status: 'error', error: 'session_conflict', sessionId }
//
// Auth resolution: local session → luna_guest cookie → on first sight,
// create-anon-user (with 24h IP rate limit) → set Set-Cookie.
//
// Usage limits are operator-configured (lib/limits.ts): MAX_CALL_SECONDS
// caps every session's length, DAILY_LIMIT_MINUTES caps total usage per
// user per IST day. Both apply to anonymous and authed callers alike —
// this is cost protection, not monetization.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createHmac } from 'node:crypto';
import { resolveCallerIdentity } from '@/lib/identity';
import { createAnonymousUser, findRecentAnonymousUserByIpHash, hashIp } from '@/lib/anonymous';
import {
  GUEST_COOKIE_NAME,
  GUEST_COOKIE_MAX_AGE_SEC,
  signGuestCookie,
} from '@/lib/guest-cookie';
import { gateForDailyLimit, maxCallSeconds } from '@/lib/limits';
import { findActiveSession } from '@/lib/sessions';
import { getDb, schema } from '@/lib/db';
import { BOT_SERVER_URL, BOT_URL } from '@/lib/env';
import { hydrateMemory, memoryToPromptFragment } from '@/lib/memory';
import { getUserPrefs, prefsToPromptFragment } from '@/lib/prefs-server';

const Body = z.object({
  preflight: z.boolean().optional(),
  sceneId: z.string().nullish(),
  personaId: z.string().nullish(),
  customSeed: z.string().max(2000).nullish(),
});

function signSessionToken(payload: object): string {
  const secret = process.env.BOT_SHARED_SECRET;
  if (!secret) throw new Error('BOT_SHARED_SECRET not set');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  const real = req.headers.get('x-real-ip');
  if (real) return real;
  return '0.0.0.0';
}

function setGuestCookie(res: NextResponse, value: string) {
  res.cookies.set({
    name: GUEST_COOKIE_NAME,
    value,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: GUEST_COOKIE_MAX_AGE_SEC,
  });
}

export async function POST(req: NextRequest) {
  // Fire-and-forget bot prewarm (preserve existing behavior).
  if (BOT_SERVER_URL) {
    fetch(BOT_SERVER_URL + '/', { method: 'GET', signal: AbortSignal.timeout(1500) }).catch(() => {});
  }

  // Validate body once up front so all error paths use the canonical shape.
  let parsed;
  try {
    parsed = Body.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: 'invalid_body', detail: String(err) },
      { status: 400 },
    );
  }

  const identity = await resolveCallerIdentity(req);

  // Determine the caller user — creating an anonymous one on first sight.
  let userId: string;
  let kind: 'authed' | 'anonymous';
  let setCookieValue: string | null = null;

  if (identity.kind === 'authed') {
    userId = identity.user.id;
    kind = 'authed';
  } else if (identity.kind === 'anonymous') {
    userId = identity.user.id;
    kind = 'anonymous';
  } else {
    if (parsed.preflight) {
      return NextResponse.json({ status: 'ok' }, { status: 200 });
    }
    const secret = process.env.GUEST_COOKIE_SECRET;
    if (!secret) {
      return NextResponse.json(
        { status: 'error', error: 'server_misconfigured' },
        { status: 500 },
      );
    }
    const ip = clientIp(req);
    const created = await createAnonymousUser({ ip, secret });
    if (!created.ok) {
      if (process.env.NODE_ENV === 'development') {
        const existing = await findRecentAnonymousUserByIpHash(hashIp(ip, secret));
        if (existing) {
          userId = existing.id;
          kind = 'anonymous';
          setCookieValue = signGuestCookie({ userId });
        } else {
          return NextResponse.json(
            { status: 'error', error: 'rate_limited' },
            { status: 429 },
          );
        }
      } else {
        return NextResponse.json(
          { status: 'error', error: 'rate_limited' },
          { status: 429 },
        );
      }
    } else {
      userId = created.user.id;
      kind = 'anonymous';
      setCookieValue = signGuestCookie({ userId });
    }
  }

  // §17.26 — concurrent-session check applies to all callers.
  const active = await findActiveSession(userId);
  if (active) {
    const res = NextResponse.json(
      { status: 'error', error: 'session_conflict', sessionId: active.id },
      { status: 409 },
    );
    if (setCookieValue) setGuestCookie(res, setCookieValue);
    return res;
  }

  // Soft-gate check — operator-configured daily usage cap. Applies the
  // same way to anonymous and authed callers (`kind` no longer changes
  // the outcome now that there's no per-identity spend limit to compare).
  const gate = await gateForDailyLimit(userId);
  if (gate !== 'ok') {
    const res = NextResponse.json(
      { status: 'soft_gate', reason: gate },
      { status: 200 },
    );
    if (setCookieValue) setGuestCookie(res, setCookieValue);
    return res;
  }

  if (parsed.preflight) {
    const res = NextResponse.json({ status: 'ok' }, { status: 200 });
    if (setCookieValue) setGuestCookie(res, setCookieValue);
    return res;
  }

  // Create the session.
  const db = getDb();
  const inserted = await db
    .insert(schema.sessions)
    .values({
      userId,
      sceneId: parsed.sceneId ?? null,
      personaId: parsed.personaId ?? 'assistant',
      customSeed: parsed.customSeed ?? null,
      metadata: { kind },
    })
    .returning({ id: schema.sessions.id });
  const sessionId = inserted[0].id;

  const callBudgetSecs = maxCallSeconds();

  const storedPrefs = await getUserPrefs(userId);
  const prefs = {
    ...storedPrefs,
    // These three toggles have no UI surface yet, so stored rows may carry
    // stale values; force-on until the dials launch.
    memoryEnabled: true,
    autoSummary: true,
    sleepNudges: true,
  };
  const prefsFragment = prefsToPromptFragment(prefs);

  let memoryContext = '';
  if (prefs.memoryEnabled) {
    try {
      const seed = parsed.customSeed || parsed.sceneId || '';
      const mem = await hydrateMemory(userId, seed);
      memoryContext = memoryToPromptFragment(mem);
    } catch (err) {
      console.warn('memory hydration failed', err);
    }
  }

  const token = signSessionToken({
    sub: userId,
    sid: sessionId,
    // Call budget, signed so the bot can't be handed a tampered value via
    // the (unsigned) client-relayed body. Integer seconds, from
    // MAX_CALL_SECONDS.
    bud: callBudgetSecs,
    exp: Math.floor(Date.now() / 1000) + 60 * 5,
  });

  const res = NextResponse.json({
    status: 'ok',
    sessionId,
    token,
    botUrl: BOT_URL,
    body: {
      assistantToken: token,
      sessionId,
      sceneId: parsed.sceneId ?? null,
      personaId: parsed.personaId ?? 'assistant',
      customSeed: parsed.customSeed ?? null,
      callBudgetSecs,
      memoryContext,
      userPrefs: {
        name: prefs.name,
        vibe: prefs.vibe,
        tone: prefs.tone,
        languageMode: prefs.languageMode,
        pace: prefs.pace,
        warmth: prefs.warmth,
        memoryEnabled: prefs.memoryEnabled,
        sleepNudges: prefs.sleepNudges,
      },
      prefsContext: prefsFragment,
    },
  });
  if (setCookieValue) setGuestCookie(res, setCookieValue);
  return res;
}
