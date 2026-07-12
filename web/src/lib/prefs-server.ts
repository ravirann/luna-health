// Server-side helpers for the user_prefs table.
//
// Every authed request that needs user prefs goes through one of these:
//   getUserPrefs(userId)   — read-or-create-with-defaults
//   updateUserPrefs(userId, patch) — partial update + bumps updated_at
//
// Prefs default-on-create. We never insert NULLs — Drizzle defaults handle
// it. Mood is intentionally NOT stored here; it's a local-only palette
// preference and shouldn't round-trip to the bot.

import { eq } from 'drizzle-orm';
import { getDb, schema } from './db';
import type { UserPrefs } from './db/schema';

export type PrefsPatch = Partial<
  Pick<
    UserPrefs,
    | 'name'
    | 'vibe'
    | 'tone'
    | 'languageMode'
    | 'pace'
    | 'warmth'
    | 'memoryEnabled'
    | 'autoSummary'
    | 'sleepNudges'
  >
> & { onboarded?: boolean };

/** Read the user's prefs row. Inserts a defaults row on first read so
 *  callers can rely on a non-null result. */
export async function getUserPrefs(userId: string): Promise<UserPrefs> {
  const db = getDb();
  const rows = await db
    .select()
    .from(schema.userPrefs)
    .where(eq(schema.userPrefs.userId, userId))
    .limit(1);
  if (rows.length > 0) return rows[0];

  const inserted = await db
    .insert(schema.userPrefs)
    .values({ userId })
    .onConflictDoNothing({ target: schema.userPrefs.userId })
    .returning();

  if (inserted.length > 0) return inserted[0];

  // Race — another request inserted between our read and our insert. Re-read.
  const reread = await db
    .select()
    .from(schema.userPrefs)
    .where(eq(schema.userPrefs.userId, userId))
    .limit(1);
  return reread[0];
}

/** Apply a partial patch. The `onboarded` flag is a virtual field that
 *  stamps `onboarded_at`; we only set it once (no clearing back to null). */
export async function updateUserPrefs(
  userId: string,
  patch: PrefsPatch,
): Promise<UserPrefs> {
  const db = getDb();
  // Make sure the row exists before we update.
  await getUserPrefs(userId);

  const { onboarded, ...rest } = patch;
  const update: Partial<UserPrefs> = {
    ...rest,
    updatedAt: new Date(),
  };
  if (onboarded) update.onboardedAt = new Date();

  const rows = await db
    .update(schema.userPrefs)
    .set(update)
    .where(eq(schema.userPrefs.userId, userId))
    .returning();
  return rows[0];
}

/** Compose a system-prompt fragment from the user's prefs.
 *
 *  Folded into the bot's runtime prompt. Output is deliberately short and
 *  declarative so it doesn't fight the bot's main personality. Nothing
 *  here should override identity — only style. */
export function prefsToPromptFragment(p: UserPrefs): string {
  const parts: string[] = [];

  const nameKnown = !!(p.name && p.name.trim());
  const nameLine = nameKnown
    ? `NAME_KNOWN: true\nUSER_NAME: ${p.name!.trim()}`
    : `NAME_KNOWN: false`;
  parts.push(nameLine);

  if (p.name) {
    parts.push(`The user prefers to be called "${p.name}".`);
  }

  // Vibe: feeds the conversational register.
  const vibeNote: Record<UserPrefs['vibe'], string> = {
    calm: 'Soft, slow, easy. Long pauses. No pressure.',
    friendly: 'Warm and curious. Open questions, no agenda.',
    playful: 'Cheeky, light. Light teasing welcome. Laugh together.',
    flirty: 'Warm with a bit of mischief. Slightly suggestive humor is fine when the user invites it; never crude.',
  };
  parts.push(`VIBE (${p.vibe}): ${vibeNote[p.vibe]}`);

  // Tone: hint to the LLM about word choice (not voice synth).
  const toneNote: Record<UserPrefs['tone'], string> = {
    Soft: 'Choose gentle, low-key words. Avoid exclamation. Quieter.',
    Warm: 'Choose warm, present words. Use the user\'s name occasionally.',
    Energetic: 'Choose lively, brighter words. More forward energy.',
    Sultry: 'Choose lower-pitched, slower words. Intimate cadence.',
  };
  parts.push(`TONE (${p.tone}): ${toneNote[p.tone]}`);

  // Language: controls both UI preference and bot conversational register.
  const languageMode = p.languageMode || 'hinglish';
  const languageNote: Record<UserPrefs['languageMode'], string> = {
    english: 'Prefer English. Use Hindi words only when the user uses them first.',
    hinglish: 'Prefer Hinglish: English sentence structure with natural Hindi words where they feel warmer.',
    hindi: 'Prefer Hindi. Use natural Hindi-first phrasing, with English only where it sounds more human.',
  };
  parts.push(`LANGUAGE_MODE: ${languageMode}`);
  parts.push(languageNote[languageMode]);

  // Pace.
  const paceNote: Record<UserPrefs['pace'], string> = {
    Slow: 'Speak in shorter sentences. Leave room. Let silences breathe.',
    Natural: 'Speak naturally — sometimes short, sometimes longer.',
    Brisk: 'Be more concise. Don\'t pad with affirmations.',
  };
  parts.push(`PACE (${p.pace}): ${paceNote[p.pace]}`);

  // Warmth: a 0..10 dial for emotional intimacy. Map to language.
  if (p.warmth >= 8) {
    parts.push(`WARMTH (${p.warmth}/10): very high — be openly affectionate, use endearments naturally.`);
  } else if (p.warmth >= 5) {
    parts.push(`WARMTH (${p.warmth}/10): warm but measured — affection is welcome, not constant.`);
  } else {
    parts.push(`WARMTH (${p.warmth}/10): low — keep it friendly but light on endearments.`);
  }

  if (!p.memoryEnabled) {
    parts.push('MEMORY: the user has asked you NOT to recall past sessions in this conversation. Do not reference prior calls.');
  }

  return 'USER PREFS\n' + parts.join('\n');
}
