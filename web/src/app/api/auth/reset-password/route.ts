import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { setAuthCookie } from '@/lib/auth-cookie';
import {
  consumePasswordResetToken,
  createSessionForUser,
  deleteAllSessionsForUser,
  setUserPassword,
} from '@/lib/local-auth';

const Body = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(8).max(200),
});

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const consumed = await consumePasswordResetToken(parsed.token);
  if (!consumed.ok) {
    return NextResponse.json({ ok: false, error: consumed.error }, { status: 400 });
  }

  await setUserPassword(consumed.userId, parsed.password);
  // Boot every other device — standard practice on password change.
  await deleteAllSessionsForUser(consumed.userId);

  // Issue a fresh session so the device that just reset stays signed in.
  const session = await createSessionForUser(consumed.userId);
  const res = NextResponse.json({ ok: true });
  setAuthCookie(res, session.token);
  return res;
}
