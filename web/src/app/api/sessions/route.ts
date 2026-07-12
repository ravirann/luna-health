// GET /api/sessions — paginated list of the caller's sessions for the
// memory-lane timeline. Each row carries reflection facts so the client
// can render titles and one-line summaries without a second roundtrip.
//
// Cursor is the ISO timestamp of the oldest item already loaded; we
// return rows strictly older than that. Caller passes `?limit=20`.

import { NextResponse } from 'next/server';
import { and, desc, eq, lt } from 'drizzle-orm';
import { ensureUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 60;

export async function GET(req: Request) {
  const user = await ensureUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const cursorRaw = url.searchParams.get('cursor');
  const limitRaw = url.searchParams.get('limit');
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(limitRaw) || DEFAULT_LIMIT));
  const cursor = cursorRaw ? new Date(cursorRaw) : null;
  if (cursor && Number.isNaN(cursor.getTime())) {
    return NextResponse.json({ error: 'bad_cursor' }, { status: 400 });
  }

  const db = getDb();
  const where = cursor
    ? and(eq(schema.sessions.userId, user.id), lt(schema.sessions.startedAt, cursor))
    : eq(schema.sessions.userId, user.id);

  // Pull one extra row to infer hasMore without a count query.
  const rows = await db
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
    .where(where)
    .orderBy(desc(schema.sessions.startedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map((r) => ({
    id: r.id,
    sceneId: r.sceneId,
    personaId: r.personaId,
    startedAt:
      r.startedAt instanceof Date
        ? r.startedAt.toISOString()
        : new Date(r.startedAt as unknown as string).toISOString(),
    durationSecs: r.durationSecs,
    facts: r.facts ?? null,
    freeText: r.freeText ?? null,
  }));
  const nextCursor = items.length > 0 ? items[items.length - 1].startedAt : null;

  return NextResponse.json({ items, hasMore, nextCursor });
}
