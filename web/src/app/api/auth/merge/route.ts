import { NextRequest, NextResponse } from 'next/server';
import { GUEST_COOKIE_NAME, verifyGuestCookie } from '@/lib/guest-cookie';
import { findAnonymousUser } from '@/lib/anonymous';
import { AUTH_COOKIE_NAME, findUserBySessionToken } from '@/lib/local-auth';
import { mergeAnonIntoAuthed } from '@/lib/merge';

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
  const user = await findUserBySessionToken(req.cookies.get(AUTH_COOKIE_NAME)?.value);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: 'unauthorized' },
      { status: 401 },
    );
  }

  const raw = req.cookies.get(GUEST_COOKIE_NAME)?.value;
  if (!raw) {
    return NextResponse.json({ ok: true });
  }
  const verified = verifyGuestCookie(raw);
  if (!verified.ok) {
    const res = NextResponse.json({ ok: true });
    clearGuestCookie(res);
    return res;
  }

  const anon = await findAnonymousUser(verified.payload.userId);
  if (!anon) {
    const res = NextResponse.json({ ok: true });
    clearGuestCookie(res);
    return res;
  }

  const result = await mergeAnonIntoAuthed({
    anonUserId: anon.id,
    authedUserId: user.id,
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error },
      { status: 500 },
    );
  }
  const res = NextResponse.json({
    ok: true,
    mergedUserId: result.mergedUserId,
  });
  clearGuestCookie(res);
  return res;
}
