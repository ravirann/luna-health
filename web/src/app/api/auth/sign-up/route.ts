import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findAnonymousUser } from '@/lib/anonymous';
import { setAuthCookie } from '@/lib/auth-cookie';
import { GUEST_COOKIE_NAME, verifyGuestCookie } from '@/lib/guest-cookie';
import {
  createPasswordUser,
  createSessionForUser,
} from '@/lib/local-auth';
import { mergeAnonIntoAuthed } from '@/lib/merge';

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  displayName: z.string().trim().max(80).optional(),
});

function clearGuestCookie(res: NextResponse) {
  res.cookies.set({
    name: GUEST_COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });
}

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  }

  const created = await createPasswordUser(parsed);
  if (!created.ok) {
    return NextResponse.json({ ok: false, error: created.error }, { status: 400 });
  }

  const session = await createSessionForUser(created.user.id);
  const res = NextResponse.json({ ok: true, user: created.user });
  setAuthCookie(res, session.token);

  const rawGuest = req.cookies.get(GUEST_COOKIE_NAME)?.value;
  if (!rawGuest) return res;

  const verified = verifyGuestCookie(rawGuest);
  if (!verified.ok) {
    clearGuestCookie(res);
    return res;
  }

  const anon = await findAnonymousUser(verified.payload.userId);
  if (!anon) {
    clearGuestCookie(res);
    return res;
  }

  const merged = await mergeAnonIntoAuthed({
    anonUserId: anon.id,
    authedUserId: created.user.id,
  });
  if (!merged.ok) {
    // Don't fail the sign-up: the user is authenticated, the merge can be
    // retried later. Leave the guest cookie in place so a retry path
    // (e.g. a future sign-in) can pick it up.
    console.error('sign-up: merge failed', { anonUserId: anon.id, error: merged.error });
    return res;
  }
  clearGuestCookie(res);
  return res;
}
