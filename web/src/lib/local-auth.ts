import {
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';
import { and, eq, gt, isNotNull, sql } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';
import {
  AUTH_COOKIE_MAX_AGE_SEC,
  AUTH_COOKIE_NAME,
} from '@/lib/auth-constants';

const scrypt = promisify(scryptCb);

const PASSWORD_PREFIX = 'scrypt';
const PASSWORD_KEYLEN = 64;
const SESSION_TOKEN_BYTES = 32;
const SESSION_MAX_AGE_MS = AUTH_COOKIE_MAX_AGE_SEC * 1000;
const PASSWORD_RESET_TOKEN_BYTES = 32;
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes

export { AUTH_COOKIE_NAME, AUTH_COOKIE_MAX_AGE_SEC };

export type LocalAuthUser = {
  id: string;
  email: string | null;
  displayName: string | null;
};

export type CreatePasswordUserResult =
  | { ok: true; user: LocalAuthUser }
  | { ok: false; error: 'email_taken' | 'invalid_input' };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('base64url');
  const derived = (await scrypt(password, salt, PASSWORD_KEYLEN)) as Buffer;
  return `${PASSWORD_PREFIX}$${salt}$${derived.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [prefix, salt, digest] = stored.split('$');
  if (prefix !== PASSWORD_PREFIX || !salt || !digest) return false;
  const expected = Buffer.from(digest, 'base64url');
  const actual = (await scrypt(password, salt, expected.length)) as Buffer;
  if (actual.length !== expected.length) return false;
  return timingSafeEqual(actual, expected);
}

export async function createPasswordUser(input: {
  email: string;
  password: string;
  displayName?: string | null;
}): Promise<CreatePasswordUserResult> {
  const email = normalizeEmail(input.email);
  if (!email || input.password.length < 8) {
    return { ok: false, error: 'invalid_input' };
  }

  const db = getDb();
  const existingLocal = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), isNotNull(schema.users.passwordHash)))
    .limit(1);
  if (existingLocal.length > 0) {
    return { ok: false, error: 'email_taken' };
  }

  const passwordHash = await hashPassword(input.password);
  try {
    const inserted = await db
      .insert(schema.users)
      .values({
        email,
        passwordHash,
        displayName: input.displayName?.trim() || null,
        isAnonymous: false,
      })
      .returning({
        id: schema.users.id,
        email: schema.users.email,
        displayName: schema.users.displayName,
      });

    return { ok: true, user: inserted[0] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('users_local_email_unique_idx')) {
      return { ok: false, error: 'email_taken' };
    }
    throw err;
  }
}

export async function findUserByEmailPassword(input: {
  email: string;
  password: string;
}): Promise<LocalAuthUser | null> {
  const email = normalizeEmail(input.email);
  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
      passwordHash: schema.users.passwordHash,
    })
    .from(schema.users)
    .where(and(eq(schema.users.email, email), isNotNull(schema.users.passwordHash)))
    .limit(1);
  const row = rows[0];
  if (!row?.passwordHash) return null;
  const ok = await verifyPassword(input.password, row.passwordHash);
  if (!ok) return null;
  return { id: row.id, email: row.email, displayName: row.displayName };
}

export async function createSessionForUser(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
  const db = getDb();
  await db.insert(schema.authSessions).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export async function findUserBySessionToken(token: string | undefined | null): Promise<LocalAuthUser | null> {
  if (!token) return null;
  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      displayName: schema.users.displayName,
    })
    .from(schema.authSessions)
    .innerJoin(schema.users, eq(schema.authSessions.userId, schema.users.id))
    .where(
      and(
        eq(schema.authSessions.tokenHash, hashSessionToken(token)),
        gt(schema.authSessions.expiresAt, sql`now()`),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function deleteSessionToken(token: string | undefined | null): Promise<void> {
  if (!token) return;
  const db = getDb();
  await db
    .delete(schema.authSessions)
    .where(eq(schema.authSessions.tokenHash, hashSessionToken(token)));
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const db = getDb();
  const rows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(and(eq(schema.users.email, normalized), isNotNull(schema.users.passwordHash)))
    .limit(1);
  return rows[0]?.id ?? null;
}

export async function createPasswordResetToken(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomBytes(PASSWORD_RESET_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS);
  const db = getDb();
  await db.insert(schema.passwordResetTokens).values({
    userId,
    tokenHash: hashSessionToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export type ConsumePasswordResetTokenResult =
  | { ok: true; userId: string }
  | { ok: false; error: 'invalid_token' | 'expired' | 'already_used' };

export async function consumePasswordResetToken(
  token: string,
): Promise<ConsumePasswordResetTokenResult> {
  if (!token) return { ok: false, error: 'invalid_token' };
  const db = getDb();
  const tokenHash = hashSessionToken(token);
  const rows = await db
    .select({
      id: schema.passwordResetTokens.id,
      userId: schema.passwordResetTokens.userId,
      expiresAt: schema.passwordResetTokens.expiresAt,
      usedAt: schema.passwordResetTokens.usedAt,
    })
    .from(schema.passwordResetTokens)
    .where(eq(schema.passwordResetTokens.tokenHash, tokenHash))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, error: 'invalid_token' };
  if (row.usedAt) return { ok: false, error: 'already_used' };
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, error: 'expired' };
  }
  // Mark used; only succeed if it was still unused (defends against
  // simultaneous double-submit).
  const updated = await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(schema.passwordResetTokens.id, row.id),
        sql`${schema.passwordResetTokens.usedAt} IS NULL`,
      ),
    )
    .returning({ id: schema.passwordResetTokens.id });
  if (updated.length === 0) return { ok: false, error: 'already_used' };
  return { ok: true, userId: row.userId };
}

export async function setUserPassword(userId: string, password: string): Promise<void> {
  if (password.length < 8) throw new Error('password too short');
  const passwordHash = await hashPassword(password);
  const db = getDb();
  await db
    .update(schema.users)
    .set({ passwordHash })
    .where(eq(schema.users.id, userId));
}

export async function deleteAllSessionsForUser(userId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(schema.authSessions)
    .where(eq(schema.authSessions.userId, userId));
}
