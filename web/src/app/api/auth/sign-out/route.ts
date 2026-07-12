import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { clearAuthCookie } from '@/lib/auth-cookie';
import { AUTH_COOKIE_NAME, deleteSessionToken } from '@/lib/local-auth';

export async function POST() {
  const store = await cookies();
  await deleteSessionToken(store.get(AUTH_COOKIE_NAME)?.value);
  const res = NextResponse.json({ ok: true });
  clearAuthCookie(res);
  return res;
}
