// Spec §6.2 + §16.2: the recall card always renders when (a) a
// luna_guest cookie is present and verified, and (b) the user has at
// least one prior session. The copy varies only by reflection quality.

import { eq, desc } from 'drizzle-orm';
import { getDb, schema } from '@/lib/db';

export type RecallShape =
  | { kind: 'reflection'; mood: string | null; themes: string[] }
  | { kind: 'no-reflection' };

export function copyForRecall(r: RecallShape): string {
  if (r.kind === 'no-reflection') {
    return 'You talked here before. Want to continue?';
  }
  if (r.mood) {
    const m = r.mood.trim().toLowerCase();
    const adj = m.includes('rest') ? 'restless'
      : m.includes('sad') ? 'a bit blue'
      : m.includes('anx') ? 'anxious'
      : m.includes('tired') ? 'tired'
      : 'a little off';
    return `You sounded ${adj} last time. Want to pick that up?`;
  }
  if (r.themes.length > 0) {
    const t = r.themes[0].toLowerCase();
    if (t.includes('sleep')) {
      return 'You were having trouble sleeping last time. Want to continue?';
    }
    return `Last time we talked about ${r.themes[0]}. Want to pick it up?`;
  }
  return 'You talked here before. Want to continue?';
}

export async function loadRecallSummary(userId: string): Promise<RecallShape | null> {
  const db = getDb();
  const sess = await db
    .select({ id: schema.sessions.id })
    .from(schema.sessions)
    .where(eq(schema.sessions.userId, userId))
    .limit(1);
  if (sess.length === 0) return null;

  const refs = await db
    .select({ facts: schema.reflections.facts })
    .from(schema.reflections)
    .where(eq(schema.reflections.userId, userId))
    .orderBy(desc(schema.reflections.createdAt))
    .limit(1);
  if (refs.length === 0) {
    return { kind: 'no-reflection' };
  }
  const f = refs[0].facts as { mood?: unknown; themes?: unknown } | null;
  const mood = typeof f?.mood === 'string' ? f.mood : null;
  const themes = Array.isArray(f?.themes)
    ? (f!.themes as unknown[]).filter((x): x is string => typeof x === 'string')
    : [];
  return { kind: 'reflection', mood, themes };
}
