// /memory — Memory lane. Vertical timeline of every conversation,
// rendered as a soft scrollable thread rather than a card grid.
// Initial batch is server-rendered for instant first paint; the client
// component handles search + infinite scroll for older entries.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { TopNav } from '@/components/top-nav';
import { MemoryStrip } from '@/components/memory-strip';
import { MemoryLane, type LaneItem } from '@/components/memory-lane';
import { ensureUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { getUserPrefs } from '@/lib/prefs-server';
import {
  asString,
  asStringArray,
  lowerFirst,
  trimWords,
  type Facts,
} from '@/lib/session-title';
import { getAppCopy, interpolate, localeForLanguageMode, type AppCopy } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const INITIAL_LIMIT = 20;

function buildRemembered(
  reflections: { facts: unknown }[],
  copy: AppCopy['profile']['remembered'],
): string[] {
  const themes = new Set<string>();
  const moods = new Set<string>();
  let unresolved: string | null = null;
  for (const r of reflections) {
    const f = (r.facts ?? {}) as Facts;
    for (const t of asStringArray(f.themes)) themes.add(t);
    const m = asString(f.mood);
    if (m) moods.add(m);
    if (!unresolved) {
      const u = asString(f.unresolved);
      if (u) unresolved = u;
    }
  }
  const bullets: string[] = [];
  for (const t of themes) {
    if (bullets.length >= 2) break;
    bullets.push(interpolate(copy.mentioned, { topic: lowerFirst(trimWords(t, 6)) }));
  }
  if (bullets.length < 3 && unresolved) {
    bullets.push(interpolate(copy.unresolved, { topic: lowerFirst(trimWords(unresolved, 8)) }));
  }
  if (bullets.length < 3 && moods.size) {
    const m = [...moods][0];
    bullets.push(interpolate(copy.mood, { mood: lowerFirst(trimWords(m, 4)) }));
  }
  return bullets.slice(0, 3);
}

export default async function MemoryPage() {
  const user = await ensureUser();
  if (!user) redirect('/sign-in');
  const prefs = await getUserPrefs(user.id);
  const locale = localeForLanguageMode(prefs.languageMode);
  const appCopy = getAppCopy(locale);
  const copy = appCopy.memoryLane;
  const commonCopy = appCopy.common.actions;

  const db = getDb();
  const [rows, recentReflections] = await Promise.all([
    db
      .select({
        id: schema.sessions.id,
        sceneId: schema.sessions.sceneId,
        personaId: schema.sessions.personaId,
        startedAt: schema.sessions.startedAt,
        durationSecs: schema.sessions.durationSecs,
        facts: schema.reflections.facts,
        freeText: schema.reflections.freeText,
      })
      .from(schema.sessions)
      .leftJoin(
        schema.reflections,
        eq(schema.reflections.sessionId, schema.sessions.id),
      )
      .where(eq(schema.sessions.userId, user.id))
      .orderBy(desc(schema.sessions.startedAt))
      .limit(INITIAL_LIMIT + 1),
    db
      .select({ facts: schema.reflections.facts })
      .from(schema.reflections)
      .where(eq(schema.reflections.userId, user.id))
      .orderBy(desc(schema.reflections.createdAt))
      .limit(5),
  ]);

  const hasMore = rows.length > INITIAL_LIMIT;
  const trimmed = hasMore ? rows.slice(0, INITIAL_LIMIT) : rows;
  const initialItems: LaneItem[] = trimmed.map((r) => ({
    id: r.id,
    sceneId: r.sceneId ?? null,
    personaId: r.personaId ?? null,
    startedAt: (r.startedAt instanceof Date
      ? r.startedAt
      : new Date(r.startedAt as unknown as string)
    ).toISOString(),
    durationSecs: r.durationSecs,
    facts: (r.facts ?? null) as Facts | null,
    freeText: r.freeText ?? null,
  }));
  const initialCursor =
    initialItems.length > 0 ? initialItems[initialItems.length - 1].startedAt : null;

  const remembered = buildRemembered(recentReflections, appCopy.profile.remembered);
  const totalSessions = rows.length;

  return (
    <main className="screen fade-in">
      <TopNav locale={locale} />
      <section className="lane-screen">
        <header className="lane-header">
          <Link href="/profile" className="lane-header__back">{copy.back}</Link>
          <h2 className="lane-header__title">{copy.title}</h2>
          <p className="lane-header__sub">
            {copy.subcopy}
          </p>
          <p className="lane-header__whisper">
            {copy.whisper}
          </p>
        </header>

        {remembered.length > 0 && <MemoryStrip bullets={remembered} locale={locale} />}

        {totalSessions === 0 ? (
          <div className="lane-empty">
            <h3 className="lane-empty__title">{copy.emptyTitle}</h3>
            <p className="lane-empty__sub">
              {copy.emptySubcopy}
            </p>
            <Link href="/call" className="btn-primary lane-empty__cta">
              {commonCopy.startTalking}
            </Link>
          </div>
        ) : (
          <MemoryLane
            initialItems={initialItems}
            initialCursor={initialCursor}
            initialHasMore={hasMore}
            locale={locale}
          />
        )}
      </section>
    </main>
  );
}
