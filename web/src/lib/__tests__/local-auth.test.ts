import { describe, it, expect, afterEach } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  createPasswordUser,
  createSessionForUser,
  findUserBySessionToken,
  hashPassword,
  normalizeEmail,
  verifyPassword,
} from '@/lib/local-auth';
import { getDb, schema } from '@/lib/db';

const testEmail = (prefix: string) =>
  `${prefix}.${Date.now()}.${Math.random().toString(16).slice(2)}@example.com`;

afterEach(async () => {
  if (!process.env.DATABASE_URL) return;
  const db = getDb();
  await db.execute(sql`
    DELETE FROM users
    WHERE email LIKE 'local-auth.%@example.com'
      AND created_at > now() - interval '5 minutes'
  `);
});

describe('local auth helpers', () => {
  it('normalizes email addresses for stable login lookup', () => {
    expect(normalizeEmail('  USER@Example.COM  ')).toBe('user@example.com');
  });

  it('hashes and verifies passwords without storing the raw password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash).not.toContain('correct horse battery staple');
    await expect(verifyPassword('correct horse battery staple', hash)).resolves.toBe(true);
    await expect(verifyPassword('wrong password', hash)).resolves.toBe(false);
  });

  it.skipIf(!process.env.DATABASE_URL)(
    'creates a separate local account instead of claiming a legacy Clerk row by email',
    async () => {
      const db = getDb();
      const email = testEmail('local-auth.legacy');
      const legacy = await db
        .insert(schema.users)
        .values({
          clerkUserId: `clerk_${Date.now()}_${Math.random()}`,
          email,
          displayName: 'Legacy Clerk User',
          isAnonymous: false,
        })
        .returning({ id: schema.users.id });

      const created = await createPasswordUser({
        email: email.toUpperCase(),
        password: 'long-enough-password',
        displayName: 'Local User',
      });

      expect(created.ok).toBe(true);
      if (!created.ok) return;
      expect(created.user.id).not.toBe(legacy[0].id);

      const rows = await db
        .select({ id: schema.users.id, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.email, normalizeEmail(email)));
      expect(rows.map((r) => r.id).sort()).toEqual(
        [legacy[0].id, created.user.id].sort(),
      );
    },
  );

  it.skipIf(!process.env.DATABASE_URL)(
    'creates an opaque session token that resolves back to the user',
    async () => {
      const created = await createPasswordUser({
        email: testEmail('local-auth.session'),
        password: 'long-enough-password',
      });
      expect(created.ok).toBe(true);
      if (!created.ok) return;

      const session = await createSessionForUser(created.user.id);
      expect(session.token).toMatch(/^[A-Za-z0-9_-]{40,}$/);

      const resolved = await findUserBySessionToken(session.token);
      expect(resolved?.id).toBe(created.user.id);
      expect(resolved?.email).toBe(created.user.email);
    },
  );
});
