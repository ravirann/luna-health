// /profile — single home for the authed user. Merges what used to live
// at /profile and /profile/history: greeting, the "what I remember for
// you" memory bullets, and the full list of past conversations. The
// dedicated history page now redirects here.

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { desc, eq, sql } from 'drizzle-orm';
import { SignOutButton } from '@/components/sign-out-button';
import { TopNav } from '@/components/top-nav';
import { PreferencesPanel } from '@/components/preferences-panel';
import { MemoryStrip } from '@/components/memory-strip';
import { ensureUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { bucketFor } from '@/lib/time-of-day';
import { getUserPrefs } from '@/lib/prefs-server';
import {
  asString,
  asStringArray,
  lowerFirst,
  SHORT_SESSION_SECS,
  trimWords,
  type Facts,
} from '@/lib/session-title';
import { getAppCopy, interpolate, localeForLanguageMode, type AppCopy } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

const RECENT_LIMIT = 50;

function profilePrompt(copy: AppCopy['profile'], bucket: ReturnType<typeof bucketFor>): string {
  if (bucket === 'late_night') return copy.prompts.lateNight;
  return copy.prompts[bucket];
}

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

// ---------- page ----------

export default async function ProfilePage() {
  const user = await ensureUser();
  if (!user) redirect('/sign-in');
  const prefs = await getUserPrefs(user.id);
  const locale = localeForLanguageMode(prefs.languageMode);
  const appCopy = getAppCopy(locale);
  const copy = appCopy.profile;
  const commonCopy = appCopy.common.actions;

  const firstName = user.displayName?.split(/\s+/)[0] || 'You';

  const db = getDb();
  const [recent, lifetimeRow, recentReflections] =
    await Promise.all([
      db
        .select({
          id: schema.sessions.id,
          sceneId: schema.sessions.sceneId,
          personaId: schema.sessions.personaId,
          startedAt: schema.sessions.startedAt,
          durationSecs: schema.sessions.durationSecs,
        })
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id))
        .orderBy(desc(schema.sessions.startedAt))
        .limit(RECENT_LIMIT),
      db
        .select({
          callCount: sql<number>`COUNT(*)`,
          totalSecs: sql<number>`COALESCE(SUM(${schema.sessions.durationSecs}), 0)`,
        })
        .from(schema.sessions)
        .where(eq(schema.sessions.userId, user.id)),
      db
        .select({
          sessionId: schema.reflections.sessionId,
          facts: schema.reflections.facts,
          createdAt: schema.reflections.createdAt,
        })
        .from(schema.reflections)
        .where(eq(schema.reflections.userId, user.id))
        .orderBy(desc(schema.reflections.createdAt))
        .limit(5),
    ]);

  const lifetime = lifetimeRow[0] ?? { callCount: 0, totalSecs: 0 };
  const lifetimeMins = Math.floor(Number(lifetime.totalSecs) / 60);
  const callCount = Number(lifetime.callCount);
  const remembered = buildRemembered(recentReflections, copy.remembered);
  // Hide blink-of-an-eye sessions (<10s) — they're almost always misclicks
  // and clutter the "what we've shared" feeling we want this list to give.
  const visibleSessions = recent.filter(
    (s) => (s.durationSecs ?? 0) >= SHORT_SESSION_SECS,
  );
  const userEmail = user.email;
  const userFullName = user.displayName || user.email || firstName;

  return (
    <main className="screen fade-in">
      <TopNav locale={locale} />

      <section className="profile-screen">
        {/* Metadata line — small, uppercase, low-opacity. Sits just under the
            top nav so it never competes with the greeting below. */}
        {lifetimeMins > 0 && (
          <div className="profile-eyebrow profile-eyebrow--top">
            <span>{interpolate(copy.lifetimeTogether, { minutes: lifetimeMins })}</span>
          </div>
        )}

        {/* Greeting — emotional anchor, largest text in this section.
            Fade-in on load to feel like someone arriving. */}
        <header className="profile-greet">
          <h2 className="profile-h">
            {copy.greetingPrefix} <em>{firstName}</em>.
          </h2>
          <p className="profile-h-sub">{copy.greetingSubcopy}</p>
          <p className="profile-h-prompt">{profilePrompt(copy, bucketFor())}</p>
        </header>

        {/* Primary CTA — full-width, the most important action on the page. */}
        <div className="profile-cta-row">
          <Link href="/call" className="btn-primary profile-cta">
            {commonCopy.startTalking}
          </Link>
        </div>

        {/* Memory section — what Luna gently remembers. Sits above history
            so emotional continuity reads first, logs second. */}
        {remembered.length > 0 && (
          <div className="profile-section--major">
            <MemoryStrip bullets={remembered} locale={locale} />
          </div>
        )}

        {/* Memory lane link — soft entry into the full timeline. */}
        <Link href="/memory" className="profile-lane-link profile-section--major">
          <div className="profile-lane-link__body">
            <span className="profile-lane-link__eyebrow">{copy.memoryLane.eyebrow}</span>
            <span className="profile-lane-link__title">
              {visibleSessions.length === 0
                ? copy.memoryLane.none
                : visibleSessions.length === 1
                  ? copy.memoryLane.one
                  : interpolate(copy.memoryLane.many, { count: visibleSessions.length })}
            </span>
            <span className="profile-lane-link__sub">
              {visibleSessions.length === 0
                ? copy.memoryLane.emptySubcopy
                : copy.memoryLane.hasItemsSubcopy}
            </span>
          </div>
          <span className="profile-lane-link__chev" aria-hidden>→</span>
        </Link>

        {/* Preferences — release-safe controls only. Voice/personality/memory
            behavior knobs are hidden and pinned to launch defaults. */}
        <details className="profile-prefs profile-section--major">
          <summary className="profile-prefs__summary">
            <span className="num-index">{copy.preferences.title}</span>
            <span className="profile-prefs__hint">{copy.preferences.hint}</span>
            <span className="profile-prefs__chev" aria-hidden>›</span>
          </summary>
          <div className="profile-prefs__body">
            <PreferencesPanel />
          </div>
        </details>

        {/* Inline account section — visible without opening a menu. */}
        <div className="profile-account-block">
          <div className="profile-account-head">
            <span className="num-index">{copy.account.title}</span>
            {callCount > 0 && (
              <span className="profile-account-meta">
                {interpolate(copy.account.conversationsSoFar, {
                  count: callCount,
                  plural: callCount === 1 ? '' : 's',
                })}
              </span>
            )}
          </div>
          <div className="profile-account-row">
            <div className="profile-account-avatar" aria-hidden>
              {userFullName.slice(0, 1).toUpperCase()}
            </div>
            <div className="profile-account-id">
              <div className="profile-account-name">{userFullName}</div>
              {userEmail && (
                <div className="profile-account-email">{userEmail}</div>
              )}
            </div>
            <SignOutButton className="profile-account-signout" />
          </div>
        </div>

        <div className="profile-footer">
          <Link href="/safety" className="profile-footer__link">
            {appCopy.safety.linkLabel}
          </Link>
        </div>
      </section>
    </main>
  );
}
