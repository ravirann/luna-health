// GET /api/recording/:sessionId/url
//
// Returns a short-lived presigned R2 URL for the call recording. Auth-gated;
// only the session's owner can fetch their own audio.

import { NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { ensureUser } from '@/lib/auth';
import { getDb, schema } from '@/lib/db';
import { presignR2GetUrl } from '@/lib/r2';

type Params = { sessionId: string };

export async function GET(_req: Request, ctx: { params: Promise<Params> }) {
  const user = await ensureUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { sessionId } = await ctx.params;
  const db = getDb();
  const rows = await db
    .select({ audioUrl: schema.sessions.audioUrl })
    .from(schema.sessions)
    .where(and(eq(schema.sessions.id, sessionId), eq(schema.sessions.userId, user.id)))
    .limit(1);
  const audioUrl = rows[0]?.audioUrl;
  if (!audioUrl) return NextResponse.json({ error: 'no_recording' }, { status: 404 });

  const presigned = presignR2GetUrl(audioUrl, 300);
  if (!presigned) {
    return NextResponse.json({ error: 'r2_not_configured' }, { status: 503 });
  }
  return NextResponse.json({ url: presigned });
}
