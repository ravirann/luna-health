// POST /api/session/:sessionId/end — user-initiated end.
//
// Spec §10: identity resolution via resolveCallerIdentity (so anonymous
// users can end their own session). Optional body field pause_reason is
// persisted into sessions.metadata.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveCallerIdentity } from '@/lib/identity';
import { endSession } from '@/lib/sessions';

type Params = { sessionId: string };

const Body = z.object({
  pause_reason: z.enum(['idle_timeout', 'user_left', 'cutoff_no_signup']).optional(),
});

export async function POST(req: NextRequest, ctx: { params: Promise<Params> }) {
  const identity = await resolveCallerIdentity(req);
  if (identity.kind === 'none') {
    return NextResponse.json(
      { status: 'error', error: 'unauthorized' },
      { status: 401 },
    );
  }

  let parsed;
  try {
    parsed = Body.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return NextResponse.json(
      { status: 'error', error: 'invalid_body', detail: String(err) },
      { status: 400 },
    );
  }

  const { sessionId } = await ctx.params;
  const result = await endSession({
    sessionId,
    enforceUserId: identity.user.id,
    pauseReason: parsed.pause_reason,
  });

  if (!result.ok) {
    return NextResponse.json(
      { status: 'error', error: result.error },
      { status: result.error === 'not_found' ? 404 : 403 },
    );
  }
  return NextResponse.json(result);
}
