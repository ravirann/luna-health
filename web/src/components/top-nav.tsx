'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAppCopy, interpolate, type AppLocale } from '@/lib/i18n';

type TopNavProps = {
  /**
   * Brand wordmark text. Server pages should pass `readBrandFromEnv().brandName`
   * so changing BRAND_NAME env updates the wordmark live. Falls back to the
   * baked NEXT_PUBLIC_BRAND_NAME, then "luna", so client-only call sites
   * that don't have a server parent don't crash.
   */
  brandName?: string;
  locale?: AppLocale;
};

export function TopNav({
  brandName = process.env.NEXT_PUBLIC_BRAND_NAME ?? 'luna',
  locale,
}: TopNavProps = {}) {
  const copy = getAppCopy(locale).topNav;
  const pathname = usePathname();
  const [auth, setAuth] = useState<{ loaded: boolean; signedIn: boolean }>({
    loaded: false,
    signedIn: false,
  });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => res.json())
      .then((body) => {
        if (!cancelled) setAuth({ loaded: true, signedIn: !!body.user });
      })
      .catch(() => {
        if (!cancelled) setAuth({ loaded: true, signedIn: false });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/');

  return (
    <nav className="top-nav">
      <Link
        href="/"
        className="luna-mark"
        aria-label={interpolate(copy.homeLabel, { brandName })}
      >
        <span className="luna-mark__glyph" aria-hidden />
        <span className="luna-mark__word">{brandName}</span>
      </Link>
      <div className="nav-row">
        {auth.loaded && auth.signedIn && (
          <>
            <Link
              href="/profile"
              className={`nav-icon ${isActive('/profile') ? 'active' : ''}`}
              aria-label={copy.profileLabel}
              title={copy.profileLabel}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="8" r="3.6" />
                <path d="M4.5 19c1.7-3.4 4.5-5 7.5-5s5.8 1.6 7.5 5" />
              </svg>
            </Link>
          </>
        )}
        {auth.loaded && !auth.signedIn && (
          <Link href="/sign-in" className="nav-link">
            {copy.signIn}
          </Link>
        )}
      </div>
    </nav>
  );
}
