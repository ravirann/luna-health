// Spec §4.3 — single auth-resolution chokepoint. Order: local session →
// luna_guest cookie → none. Returns the local users.id for both
// authenticated and anonymous identities.

import type { NextRequest } from 'next/server';
import { GUEST_COOKIE_NAME, verifyGuestCookie } from '@/lib/guest-cookie';
import { findAnonymousUser, deriveGuestCookieHash } from '@/lib/anonymous';
import { AUTH_COOKIE_NAME, findUserBySessionToken } from '@/lib/local-auth';

export type Identity =
  | { kind: 'authed'; user: { id: string; email: string | null; displayName: string | null } }
  | { kind: 'anonymous'; user: { id: string; guestCookieHash: string } }
  | { kind: 'none' };

/** Read and verify the luna_guest cookie. Returns the verified payload or null. */
export function readGuestCookie(req: NextRequest): { userId: string; issuedAt: number } | null {
  const raw = req.cookies.get(GUEST_COOKIE_NAME)?.value;
  if (!raw) return null;
  const result = verifyGuestCookie(raw);
  if (!result.ok) return null;
  return result.payload;
}

export async function resolveCallerIdentity(req: NextRequest): Promise<Identity> {
  // 1) Local password session has top priority.
  const sessionToken = req.cookies.get(AUTH_COOKIE_NAME)?.value;
  const sessionUser = await findUserBySessionToken(sessionToken);
  if (sessionUser) {
    return { kind: 'authed', user: sessionUser };
  }

  // 2) Guest cookie.
  const payload = readGuestCookie(req);
  if (payload) {
    const anon = await findAnonymousUser(payload.userId);
    if (anon) {
      // Defense-in-depth: confirm the stored hash matches what we'd derive
      // from the cookie payload + secret. Catches mismatched secrets across
      // env rotations.
      const secret = process.env.GUEST_COOKIE_SECRET ?? '';
      if (secret && deriveGuestCookieHash(anon.id, secret) === anon.guestCookieHash) {
        return { kind: 'anonymous', user: { id: anon.id, guestCookieHash: anon.guestCookieHash } };
      }
    }
  }

  return { kind: 'none' };
}
