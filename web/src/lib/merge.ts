// Moves an anonymous guest row into a verified local password account.
// We do not claim legacy Clerk rows by email; only the active local session
// user can receive guest-owned sessions/reflections.
//
// Atomicity: the raw Neon client's transaction([...]) sends all queries
// in a single HTTP round-trip as a real Postgres transaction.

import { neon } from '@neondatabase/serverless';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

function getNeonSql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return neon(url);
}

export type MergeInput = {
  anonUserId: string;
  authedUserId: string;
};

export type MergeResult =
  | { ok: true; mergedUserId: string }
  | { ok: false; error: 'anon_not_found' | 'tx_failed' | 'invalid_input' };

export async function mergeAnonIntoAuthed(
  input: MergeInput,
): Promise<MergeResult> {
  if (!input.anonUserId || !input.authedUserId || input.anonUserId === input.authedUserId) {
    return { ok: false, error: 'invalid_input' };
  }
  const db = getDb();

  // Verify the anon row exists.
  const anonRows = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.id, input.anonUserId))
    .limit(1);
  if (anonRows.length === 0) {
    return { ok: false, error: 'anon_not_found' };
  }

  try {
    // Move all FKs and apply prefs policy. Use the raw neon client's
    // transaction() which sends all queries
    // in a single HTTP round-trip (one real Postgres transaction).
    const neonSql = getNeonSql();
    await neonSql.transaction([
      neonSql`UPDATE sessions SET user_id = ${input.authedUserId} WHERE user_id = ${input.anonUserId}`,
      neonSql`UPDATE reflections SET user_id = ${input.authedUserId} WHERE user_id = ${input.anonUserId}`,
      // Prefs policy (§16.7): authed values win for vibe/tone/pace/warmth/booleans;
      // anon fills missing name and onboarded_at on the authed row.
      neonSql`
        INSERT INTO user_prefs (
          user_id, name, vibe, tone, pace, warmth,
          memory_enabled, auto_summary, sleep_nudges, onboarded_at
        )
        SELECT
          ${input.authedUserId}, name, vibe, tone, pace, warmth,
          memory_enabled, auto_summary, sleep_nudges, onboarded_at
        FROM user_prefs WHERE user_id = ${input.anonUserId}
        ON CONFLICT (user_id) DO UPDATE SET
          name           = COALESCE(user_prefs.name,           EXCLUDED.name),
          memory_enabled = user_prefs.memory_enabled,
          auto_summary   = user_prefs.auto_summary,
          sleep_nudges   = user_prefs.sleep_nudges,
          onboarded_at   = COALESCE(user_prefs.onboarded_at, EXCLUDED.onboarded_at)
      `,
      neonSql`DELETE FROM user_prefs WHERE user_id = ${input.anonUserId}`,
      neonSql`DELETE FROM users WHERE id = ${input.anonUserId} AND is_anonymous = true`,
    ]);
    return { ok: true, mergedUserId: input.authedUserId };
  } catch (err) {
    console.error('mergeAnonIntoAuthed failed', err);
    return { ok: false, error: 'tx_failed' };
  }
}
