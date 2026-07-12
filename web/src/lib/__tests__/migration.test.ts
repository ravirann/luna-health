import { describe, it, expect } from 'vitest';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

describe('migrations applied', () => {
  it.skipIf(!process.env.DATABASE_URL)('users has identity fields + ip_hash; auth_sessions exists; user_prefs has language_mode', async () => {
    const db = getDb();
    const userCols = await db.execute(sql`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
        AND column_name IN ('is_anonymous','guest_cookie_hash','clerk_user_id','password_hash','ip_hash')
    `);
    const rows = (userCols as unknown as { rows: Array<{ column_name: string; is_nullable: string }> }).rows;
    const byName = Object.fromEntries(rows.map((r) => [r.column_name, r.is_nullable]));
    expect(byName.is_anonymous).toBeDefined();
    expect(byName.guest_cookie_hash).toBeDefined();
    expect(byName.clerk_user_id).toBe('YES');
    expect(byName.password_hash).toBe('YES');
    expect(byName.ip_hash).toBe('YES');

    // These columns/tables are gone — usage limits are operator-configured
    // (lib/limits.ts) rather than tracked as a per-user amount.
    const trialUsedAt = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'users' AND column_name = 'trial_used_at'
    `);
    expect((trialUsedAt as unknown as { rows: unknown[] }).rows).toHaveLength(0);

    const credits = await db.execute(sql`
      SELECT to_regclass('public.credits') AS exists
    `);
    expect((credits as unknown as { rows: Array<{ exists: string | null }> }).rows[0].exists).toBeNull();

    const trialGrants = await db.execute(sql`
      SELECT to_regclass('public.trial_grants') AS exists
    `);
    expect((trialGrants as unknown as { rows: Array<{ exists: string | null }> }).rows[0].exists).toBeNull();

    const authSessions = await db.execute(sql`
      SELECT to_regclass('public.auth_sessions') AS exists
    `);
    const authRows = (authSessions as unknown as { rows: Array<{ exists: string | null }> }).rows;
    expect(authRows[0].exists).toBe('auth_sessions');

    const prefCols = await db.execute(sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'user_prefs'
        AND column_name = 'language_mode'
    `);
    const prefRows = (prefCols as unknown as { rows: Array<{ column_name: string }> }).rows;
    expect(prefRows[0].column_name).toBe('language_mode');
  });
});
