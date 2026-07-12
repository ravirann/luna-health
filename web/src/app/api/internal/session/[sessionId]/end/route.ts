// POST /api/internal/session/:sessionId/end — bot-initiated end.
//
// Authed via HMAC-SHA256 over `<timestamp>.<sessionId>.<body>` with the
// BOT_SHARED_SECRET. The bot fires this from on_client_disconnected so
// duration finalization + reflector kick-off always happen, even if the
// user closed their browser tab before the frontend could call /end.
//
// NOT covered by browser auth (proxy.ts does NOT match
// /api/internal/*). The HMAC check is the only authentication.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { endSession, verifyBotHmac } from '@/lib/sessions';

const Body = z.object({
  durationSecs: z.number().int().min(0).max(60 * 60 * 4).optional(),
});

type Params = { sessionId: string };

export async function POST(req: NextRequest, ctx: { params: Promise<Params> }) {
  const { sessionId } = await ctx.params;
  const raw = await req.text();

  const verified = verifyBotHmac({
    sessionId,
    body: raw,
    timestampHeader: req.headers.get('x-assistant-timestamp'),
    signatureHeader: req.headers.get('x-assistant-signature'),
  });
  if (!verified.ok) {
    return NextResponse.json({ error: verified.error }, { status: 401 });
  }

  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(raw ? JSON.parse(raw) : {});
  } catch (err) {
    return NextResponse.json({ error: 'invalid_body', detail: String(err) }, { status: 400 });
  }

  // No `enforceUserId` — HMAC has authenticated the bot, not a user.
  const result = await endSession({
    sessionId,
    durationSecsOverride: parsed.durationSecs,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 404 });
  }
  return NextResponse.json(result);
}
