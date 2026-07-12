import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { findAnonymousUser } from '@/lib/anonymous';
import { setAuthCookie } from '@/lib/auth-cookie';
import { GUEST_COOKIE_NAME, verifyGuestCookie } from '@/lib/guest-cookie';
import {
  createSessionForUser,
  findUserByEmailPassword,
} from '@/lib/local-auth';
import { mergeAnonIntoAuthed } from '@/lib/merge';

const Body = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(200),
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

  const user = await findUserByEmailPassword(parsed);
  if (!user) {
    return NextResponse.json({ ok: false, error: 'invalid_credentials' }, { status: 401 });
  }

  const session = await createSessionForUser(user.id);
  const res = NextResponse.json({ ok: true, user });
  setAuthCookie(res, session.token);

  // If a guest cookie is still around (e.g. sign-up's merge failed earlier,
  // or the user signed up on another device and now signs in here with an
  // active anon identity), claim the anon row's data into this account.
  const rawGuest = req.cookies.get(GUEST_COOKIE_NAME)?.value;
  if (!rawGuest) return res;
  const verified = verifyGuestCookie(rawGuest);
  if (!verified.ok) {
    clearGuestCookie(res);
    return res;
  }
  const anon = await findAnonymousUser(verified.payload.userId);
  if (!anon || anon.id === user.id) {
    clearGuestCookie(res);
    return res;
  }
  const merged = await mergeAnonIntoAuthed({
    anonUserId: anon.id,
    authedUserId: user.id,
  });
  if (!merged.ok) {
    console.error('sign-in: merge failed', { anonUserId: anon.id, error: merged.error });
    return res;
  }
  clearGuestCookie(res);
  return res;
}
