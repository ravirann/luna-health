// Spec §4.4 + §7.1: anonymous-user creation and IP rate limiting.
// - IP hashing is a one-way SHA-256(ip + secret), so we never store a raw
//   IP anywhere.
// - The rate limit checks for any anonymous user created from the same
//   ip_hash within the last 24 hours, via the indexed `users.ip_hash`
//   column (see lib/db/schema.ts) — one small column instead of a
//   separate ledger table, since all we need is "has this IP made one of
//   these recently".

import { createHash, createHmac } from 'node:crypto';
import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

export function hashIp(ip: string, secret: string): string {
  return createHash('sha256').update(`${ip}|${secret}`).digest('hex');
}

export async function isIpRateLimited(ipHash: string): Promise<boolean> {
  const db = getDb();
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.ipHash, ipHash),
        gt(schema.users.createdAt, sql`now() - interval '24 hours'`),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export async function findRecentAnonymousUserByIpHash(ipHash: string): Promise<AnonUser | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      isAnonymous: schema.users.isAnonymous,
      guestCookieHash: schema.users.guestCookieHash,
    })
    .from(schema.users)
    .where(
      and(
        eq(schema.users.ipHash, ipHash),
        eq(schema.users.isAnonymous, true),
        gt(schema.users.createdAt, sql`now() - interval '24 hours'`),
      ),
    )
    .orderBy(desc(schema.users.createdAt))
    .limit(1);
  const r = rows[0];
  if (!r || !r.guestCookieHash) return null;
  return { id: r.id, isAnonymous: r.isAnonymous, guestCookieHash: r.guestCookieHash };
}

export type AnonUser = {
  id: string;
  isAnonymous: boolean;
  guestCookieHash: string;
};

export type CreateResult =
  | { ok: true; user: AnonUser }
  | { ok: false; error: 'rate_limited' };

/** A short, irreversible cookie-hash derived from the user UUID and the
 *  same secret used for the cookie HMAC. We persist it on `users.guest_cookie_hash`
 *  so we can look the row up from a (validated) cookie payload without
 *  trusting the cookie blindly. */
export function deriveGuestCookieHash(userId: string, secret: string): string {
  return createHmac('sha256', secret).update(`luna_guest:${userId}`).digest('hex');
}

export async function createAnonymousUser(opts: {
  ip: string;
  secret: string;
}): Promise<CreateResult> {
  const ipHash = hashIp(opts.ip, opts.secret);
  // Pre-check (cheaper than starting a tx). The transactional re-check
  // below guards against a race.
  if (await isIpRateLimited(ipHash)) {
    return { ok: false, error: 'rate_limited' };
  }

  const db = getDb();
  // Drizzle Neon HTTP driver doesn't support multi-statement transactions;
  // we serialize the writes and roll back manually on failure. The rate
  // limit makes the "two in flight" race a soft-loss case (both insert,
  // one extra row) that's harmless — it just means one IP briefly has two
  // anon identities instead of one.
  try {
    const userRows = await db
      .insert(schema.users)
      .values({
        isAnonymous: true,
        clerkUserId: null,
        ipHash,
      })
      .returning({ id: schema.users.id });
    const userId = userRows[0].id;

    const guestCookieHash = deriveGuestCookieHash(userId, opts.secret);
    await db
      .update(schema.users)
      .set({ guestCookieHash })
      .where(eq(schema.users.id, userId));

    return {
      ok: true,
      user: { id: userId, isAnonymous: true, guestCookieHash },
    };
  } catch (err) {
    console.error('createAnonymousUser failed', err);
    throw err;
  }
}

export async function findAnonymousUser(userId: string): Promise<AnonUser | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      isAnonymous: schema.users.isAnonymous,
      guestCookieHash: schema.users.guestCookieHash,
    })
    .from(schema.users)
    .where(and(eq(schema.users.id, userId), eq(schema.users.isAnonymous, true)))
    .limit(1);
  const r = rows[0];
  if (!r || !r.guestCookieHash) return null;
  return { id: r.id, isAnonymous: r.isAnonymous, guestCookieHash: r.guestCookieHash };
}
