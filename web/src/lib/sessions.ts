// Luna AI — session-end logic.
//
// Same code path is hit by two routes:
//   /api/session/:id/end          — user-initiated (session or guest authed)
//   /api/internal/session/:id/end — bot-initiated (HMAC-authed)
//
// Both can fire for the same session (e.g. user clicks hangup AND bot's
// on_client_disconnected webhook fires). The conditional UPDATE on
// `ended_at IS NULL` ensures only the first one finalizes the duration
// and kicks off the reflector; subsequent calls return `alreadyEnded: true`.

import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { getDb, schema } from './db';
import { reflectOnSession } from './memory';

export type EndSessionResult =
  | { ok: true; alreadyEnded: false; durationSecs: number }
  | { ok: true; alreadyEnded: true }
  | { ok: false; error: 'not_found' | 'forbidden' };

export type EndSessionInput = {
  sessionId: string;
  /** Optional duration override from the bot (which has the authoritative
   *  call clock). If absent, we compute from `started_at` to now. */
  durationSecsOverride?: number;
  /** When set, only end the session if its userId matches. Used by the
   *  user-facing endpoint to enforce ownership. The internal endpoint
   *  passes undefined because the HMAC has already authenticated the bot. */
  enforceUserId?: string;
  /** Spec §10 + §16.4 — recorded into sessions.metadata.pause_reason for analytics. */
  pauseReason?: 'idle_timeout' | 'user_left' | 'cutoff_no_signup';
};

export async function endSession(input: EndSessionInput): Promise<EndSessionResult> {
  const db = getDb();

  // Look up the session — also acts as ownership check when enforceUserId is set.
  const conditions = [eq(schema.sessions.id, input.sessionId)];
  if (input.enforceUserId) {
    conditions.push(eq(schema.sessions.userId, input.enforceUserId));
  }
  const sessRows = await db
    .select()
    .from(schema.sessions)
    .where(and(...conditions))
    .limit(1);
  const sess = sessRows[0];
  if (!sess) {
    return { ok: false, error: input.enforceUserId ? 'forbidden' : 'not_found' };
  }
  if (sess.endedAt) {
    return { ok: true, alreadyEnded: true };
  }

  const endedAt = new Date();
  const startedAt =
    sess.startedAt instanceof Date ? sess.startedAt : new Date(sess.startedAt);
  const computed = Math.max(
    0,
    Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
  );
  // Trust the bot's duration if provided; otherwise wall-clock from started_at.
  const durationSecs =
    typeof input.durationSecsOverride === 'number'
      ? Math.max(0, Math.min(input.durationSecsOverride, computed + 5))
      : computed;

  // Race-safe: only the caller that wins the ended_at-IS-NULL filter kicks
  // off the reflector. A second concurrent call will see `result = []`
  // and short-circuit with alreadyEnded.
  const newMetadata =
    input.pauseReason
      ? {
          ...((sess.metadata as Record<string, unknown> | null) ?? {}),
          pause_reason: input.pauseReason,
        }
      : (sess.metadata as Record<string, unknown> | null) ?? null;

  const updated = await db
    .update(schema.sessions)
    .set({
      endedAt,
      durationSecs,
      ...(input.pauseReason ? { metadata: newMetadata } : {}),
    })
    .where(
      and(
        eq(schema.sessions.id, sess.id),
        isNull(schema.sessions.endedAt),
      ),
    )
    .returning({ id: schema.sessions.id });

  if (updated.length === 0) {
    return { ok: true, alreadyEnded: true };
  }

  // Kick off the reflector — only for non-trivial calls.
  void (async () => {
    try {
      if (durationSecs > 20) await reflectOnSession(sess.id);
    } catch (err) {
      console.warn('reflector failed', err);
    }
  })();

  return { ok: true, alreadyEnded: false, durationSecs };
}

export const ACTIVE_SESSION_TIMEOUT_SECS = 210;

/** Spec §17.26: a user may have at most one active session. We treat
 *  "active" as any unended session still inside the budget+grace timeout
 *  window. Older orphan rows are ignored here; the watchdog/cleanup path
 *  can still close and bill them separately. */
export async function findActiveSession(
  userId: string,
): Promise<{ id: string; startedAt: Date } | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.sessions.id,
      startedAt: schema.sessions.startedAt,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, userId),
        isNull(schema.sessions.endedAt),
        gt(
          schema.sessions.startedAt,
          sql`now() - (${ACTIVE_SESSION_TIMEOUT_SECS} || ' seconds')::interval`,
        ),
      ),
    )
    .orderBy(desc(schema.sessions.startedAt))
    .limit(1);
  return rows[0] ?? null;
}

// ---------------------------------------------------------------------------
// HMAC verification for the bot → Next.js webhook (Fix 3c).
// ---------------------------------------------------------------------------

import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_TIMESTAMP_SKEW_SEC = 60;

export type VerifyHmacResult =
  | { ok: true }
  | { ok: false; error: 'no_secret' | 'missing_headers' | 'stale_timestamp' | 'bad_signature' };

export function verifyBotHmac(opts: {
  sessionId: string;
  body: string;
  timestampHeader: string | null;
  signatureHeader: string | null;
}): VerifyHmacResult {
  const secret = process.env.BOT_SHARED_SECRET;
  if (!secret) return { ok: false, error: 'no_secret' };
  if (!opts.timestampHeader || !opts.signatureHeader) {
    return { ok: false, error: 'missing_headers' };
  }
  const ts = Number(opts.timestampHeader);
  if (!Number.isFinite(ts)) return { ok: false, error: 'missing_headers' };

  // Replay protection: 60s skew window.
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > MAX_TIMESTAMP_SKEW_SEC) {
    return { ok: false, error: 'stale_timestamp' };
  }

  const msg = `${ts}.${opts.sessionId}.${opts.body}`;
  const expected = createHmac('sha256', secret)
    .update(msg)
    .digest('base64url')
    .replace(/=+$/, '');
  const provided = opts.signatureHeader.replace(/=+$/, '');
  if (expected.length !== provided.length) {
    return { ok: false, error: 'bad_signature' };
  }
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (!timingSafeEqual(a, b)) {
    return { ok: false, error: 'bad_signature' };
  }
  return { ok: true };
}
