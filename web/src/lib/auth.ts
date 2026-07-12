// Luna AI — server-side auth helpers.
//
// Every authed API route should call ensureUser(). It reads our signed,
// opaque session cookie and returns the local `users.id` row that owns
// sessions, reflections, and prefs.

import { cookies } from 'next/headers';
import {
  AUTH_COOKIE_NAME,
  findUserBySessionToken,
  type LocalAuthUser,
} from '@/lib/local-auth';

export async function getAuthUserId(): Promise<string | null> {
  const user = await ensureUser();
  return user?.id ?? null;
}

export async function ensureUser(): Promise<LocalAuthUser | null> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE_NAME)?.value;
  return findUserBySessionToken(token);
}
