// Luna AI — operator-configured usage limits.
//
// There is no per-user spendable amount here; instead two independent,
// operator-configured caps apply to every caller (anonymous AND authed
// alike) — this is cost/abuse protection, not monetization:
//
//   - MAX_CALL_SECONDS   — the hard per-session call budget. Computed once
//     per /api/session/start call and signed into the bot's session token
//     (the `bud` claim) so it can't be tampered with client-side.
//   - DAILY_LIMIT_MINUTES — a per-user, per-IST-calendar-day usage cap,
//     computed live from the `sessions` table. `0` disables the cap.
//
// Both are read fresh from env on every call (no caching) so an operator
// can change them without a redeploy of application state.

import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb, schema } from './db';
import { istDayStart } from './time-of-day';

const DEFAULT_MAX_CALL_SECONDS = 600;
const DEFAULT_DAILY_LIMIT_MINUTES = 15;

/** The per-session call budget, in seconds. Falls back to a sane default
 *  when MAX_CALL_SECONDS is unset or not a positive number. */
export function maxCallSeconds(): number {
  const raw = Number(process.env.MAX_CALL_SECONDS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_CALL_SECONDS;
}

/** The per-user daily usage cap, in minutes. `0` explicitly disables the
 *  cap. Falls back to a sane default when unset or not a valid number. */
export function dailyLimitMinutes(): number {
  const raw = process.env.DAILY_LIMIT_MINUTES;
  if (raw === undefined || raw.trim() === '') return DEFAULT_DAILY_LIMIT_MINUTES;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DAILY_LIMIT_MINUTES;
}

/** Sum of today's (IST calendar day) `duration_secs` for this user, across
 *  ended sessions only — mirrors the simple COALESCE(SUM(...), 0) pattern
 *  already used for lifetime stats on /profile. This is an anti-abuse cap,
 *  not a billing meter, so we don't chase wall-clock time on still-open
 *  sessions here. */
export async function todaysUsageSecs(userId: string): Promise<number> {
  const db = getDb();
  const dayStart = istDayStart();
  const rows = await db
    .select({
      total: sql<number>`COALESCE(SUM(${schema.sessions.durationSecs}), 0)`,
    })
    .from(schema.sessions)
    .where(
      and(
        eq(schema.sessions.userId, userId),
        gte(schema.sessions.startedAt, dayStart),
      ),
    );
  return Number(rows[0]?.total ?? 0);
}

export type GateReason = 'ok' | 'rate_limited';

/** Soft-gate check for /api/session/start. Applies identically to
 *  anonymous and authed callers — there is no differential treatment,
 *  since neither can pay their way past it. */
export async function gateForDailyLimit(userId: string): Promise<GateReason> {
  const limitMinutes = dailyLimitMinutes();
  if (limitMinutes <= 0) return 'ok';
  const usedSecs = await todaysUsageSecs(userId);
  return usedSecs >= limitMinutes * 60 ? 'rate_limited' : 'ok';
}
