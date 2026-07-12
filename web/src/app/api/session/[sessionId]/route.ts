// DELETE /api/session/:sessionId — user removes a single conversation
// from their history. Cascades to transcripts + reflections via FK.
// Audio in R2 is left alone for now (orphaned blob, low cost) — a
// follow-up can sweep on a cron.

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { ensureUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';

type Params = { sessionId: string };

export async function DELETE(_req: Request, ctx: { params: Promise<Params> }) {
  const user = await ensureUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { sessionId } = await ctx.params;
  const db = getDb();
  const result = await db
    .delete(schema.sessions)
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, user.id)))
    .returning({ id: schema.sessions.id });

  if (result.length === 0) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
