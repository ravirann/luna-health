// Luna AI — lightweight auth proxy.
//
// We don't fully verify the cookie's HMAC here (that costs a secret read
// and the route handlers re-verify anyway). We only check for *presence*
// — the route handler resolves identity authoritatively via
// resolveCallerIdentity().

import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE_NAME } from '@/lib/auth-constants';
import { GUEST_COOKIE_NAME } from '@/lib/guest-constants';

const sessionOnlyProtected = [
  '/profile(.*)',
  '/api/recording/(.*)',
] as const;

const guestOrSessionProtected = [
  '/call(.*)',
  '/api/session/(.*)',
] as const;

function matches(pathname: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => {
    const prefix = pattern.replace('(.*)', '');
    return pathname === prefix || pathname.startsWith(prefix);
  });
}

export default function proxy(req: NextRequest) {
  if (req.nextUrl.pathname === '/settings') {
    return NextResponse.redirect(new URL('/profile', req.url));
  }

  const pathname = req.nextUrl.pathname;
  const isApiRoute = pathname.startsWith('/api/');
  const hasSessionCookie = !!req.cookies.get(AUTH_COOKIE_NAME)?.value;

  if (matches(pathname, sessionOnlyProtected)) {
    if (!hasSessionCookie) {
      if (isApiRoute) {
        return NextResponse.json({ status: 'error', error: 'unauthorized' }, { status: 401 });
      }
      return NextResponse.redirect(new URL('/sign-in', req.url));
    }
    return;
  }

  if (matches(pathname, guestOrSessionProtected)) {
    if (hasSessionCookie) return;
    const hasGuestCookie = !!req.cookies.get(GUEST_COOKIE_NAME)?.value;
    if (hasGuestCookie) return;
    // For /api/session/start specifically, an unauthenticated request
    // with no guest cookie is allowed through — the route handler
    // creates the anonymous user and sets the cookie. Other /api/session
    // sub-routes require an existing identity.
    if (req.nextUrl.pathname === '/api/session/start') return;
    if (isApiRoute) {
      return NextResponse.json({ status: 'error', error: 'unauthorized' }, { status: 401 });
    }
    // For /call, we let it through and the page renders the call surface
    // for guests. The /api/session/start call from inside it is what
    // actually creates the anon identity.
    return;
  }
}

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
