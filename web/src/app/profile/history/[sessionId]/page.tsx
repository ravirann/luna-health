// Single-session detail — a gentle memory of a past conversation, not
// a transcript viewer. Soft title from reflection, "X minutes together"
// metadata, summary + key-moment sections above the conversation, and
// a delete action at the bottom.

import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { and, eq } from 'drizzle-orm';
import { TopNav } from '@/components/top-nav';
import { RecordingPlayer } from '@/components/recording-player';
import { SessionActions } from '@/components/session-actions';
import { ensureUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { getUserPrefs } from '@/lib/prefs-server';
import {
  asString,
  asStringArray,
  detailTitle,
  fmtTogether,
  lowerFirst,
  trimWords,
  type Facts,
} from '@/lib/session-title';
import { getAppCopy, interpolate, localeForLanguageMode, type AppCopy } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

type Params = { sessionId: string };

function buildSummary(
  facts: Facts | null,
  freeText: string | null,
  durationSecs: number | null,
  copy: AppCopy['sessionDetail']['summary'],
): string {
  if (freeText && freeText.trim().length > 0) {
    return trimWords(freeText.trim(), 38);
  }
  if (facts) {
    const themes = asStringArray(facts.themes);
    const mood = asString(facts.mood);
    if (themes.length && mood) {
      return interpolate(copy.themeAndMood, {
        theme: lowerFirst(trimWords(themes[0], 6)),
        mood: lowerFirst(trimWords(mood, 3)),
      });
    }
    if (themes.length) {
      return interpolate(copy.theme, {
        theme: lowerFirst(trimWords(themes[0], 8)),
      });
    }
    if (mood) {
      return interpolate(copy.mood, {
        mood: lowerFirst(trimWords(mood, 4)),
      });
    }
  }
  if (durationSecs !== null && durationSecs > 0 && durationSecs < 60) {
    return copy.short;
  }
  return copy.empty;
}

function buildKeyMoment(
  facts: Facts | null,
  copy: AppCopy['sessionDetail']['keyMoment'],
): string | null {
  if (!facts) return null;
  const unresolved = asString(facts.unresolved);
  if (unresolved) {
    return interpolate(copy.unresolved, {
      topic: lowerFirst(trimWords(unresolved, 14)),
    });
  }
  const people = asStringArray(facts.mentioned_people);
  if (people.length) {
    return interpolate(copy.person, {
      person: lowerFirst(trimWords(people[0], 6)),
    });
  }
  return null;
}

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { sessionId } = await params;
  const user = await ensureUser();
  if (!user) redirect('/sign-in');
  const prefs = await getUserPrefs(user.id);
  const locale = localeForLanguageMode(prefs.languageMode);
  const copy = getAppCopy(locale).sessionDetail;

  const db = getDb();
  const sessRows = await db
    .select()
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, user.id)))
    .limit(1);
  const sess = sessRows[0];
  if (!sess) notFound();

  const lines = await db
    .select({
      role: schema.transcripts.role,
      text: schema.transcripts.text,
      ts: schema.transcripts.ts,
    })
    .from(schema.transcripts)
    .where(eq(schema.transcripts.sessionId, sessionId))
    .orderBy(schema.transcripts.ts);

  const reflRows = await db
    .select({
      facts: schema.reflections.facts,
      freeText: schema.reflections.freeText,
    })
    .from(schema.reflections)
    .where(eq(schema.reflections.sessionId, sessionId))
    .limit(1);
  const reflection = reflRows[0] ?? null;

  const facts = (reflection?.facts ?? null) as Facts | null;
  const startedAt =
    sess.startedAt instanceof Date ? sess.startedAt : new Date(sess.startedAt);
  const title = detailTitle(facts, sess.sceneId ?? null, sess.durationSecs, startedAt);
  const togetherLine = fmtTogether(sess.durationSecs);
  const summary = buildSummary(
    facts,
    reflection?.freeText ?? null,
    sess.durationSecs,
    copy.summary,
  );
  const keyMoment = buildKeyMoment(facts, copy.keyMoment);

  return (
    <main className="screen fade-in">
      <TopNav locale={locale} />
      <section className="session-detail">
        <header className="session-detail__head">
          <Link href="/profile" className="session-detail__back">
            {copy.back}
          </Link>
          <h2 className="session-detail__title">{title}</h2>
          {togetherLine && (
            <p className="session-detail__meta">{togetherLine}</p>
          )}
        </header>

        <section className="session-detail__section">
          <h3 className="session-detail__section-label">{copy.summaryTitle}</h3>
          <p className="session-detail__prose">{summary}</p>
        </section>

        {keyMoment && (
          <section className="session-detail__section">
            <h3 className="session-detail__section-label">
              {copy.keyMomentTitle}
            </h3>
            <p className="session-detail__prose">{keyMoment}</p>
          </section>
        )}

        {sess.audioUrl && (
          <section className="session-detail__section">
            <h3 className="session-detail__section-label">{copy.recordingTitle}</h3>
            <RecordingPlayer sessionId={sess.id} />
          </section>
        )}

        <section className="session-detail__section">
          <h3 className="session-detail__section-label">{copy.conversationTitle}</h3>
          {lines.length === 0 ? (
            <p className="session-detail__prose session-detail__prose--quiet">
              {copy.noTranscript}
            </p>
          ) : (
            <div className="session-detail__transcript">
              {lines.map((l, i) => (
                <div
                  key={i}
                  className={`tr-row tr-${l.role === 'user' ? 'you' : 'assistant'}`}
                >
                  <span className="tr-speaker">
                    {l.role === 'user' ? copy.transcriptUser : copy.transcriptAssistant}
                  </span>
                  <span className="tr-text">{l.text}</span>
                </div>
              ))}
            </div>
          )}
          <p className="session-detail__privacy">
            {copy.privacy}
          </p>
        </section>

        <SessionActions sessionId={sess.id} locale={locale} />
      </section>
    </main>
  );
}
