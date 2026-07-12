// /safety — public, unauthenticated safety + data-handling disclosure.
//
// Not gated: proxy.ts only protects `sessionOnlyProtected` (/profile,
// /api/recording) and `guestOrSessionProtected` (/call, /api/session)
// paths — this route matches neither, so it falls through untouched.
//
// Deliberately a plain static server component: no ensureUser(), no DB
// read, no cookies(). This page's whole job is to stay reachable — from a
// mid-call banner, a signed-out visitor, or a shared link — so it must not
// depend on anything that could be degraded (auth, the database) to render.
// Copy is in lib/i18n.ts under `safety` (English only here by design — see
// the report for why); resources are shared verbatim with the in-call
// banner in components/luna-conversation.tsx.

import Link from 'next/link';
import { readBrandFromEnv } from '@/lib/brand';
import { getAppCopy, interpolate } from '@/lib/i18n';

export default function SafetyPage() {
  const brand = readBrandFromEnv();
  const copy = getAppCopy().safety;
  const page = copy.page;
  const withBrand = (template: string) =>
    interpolate(template, { brandName: brand.brandName });

  return (
    <main className="screen fade-in">
      <section className="safety-screen">
        <Link href="/" className="safety-screen__back">
          {page.back}
        </Link>
        <h1 className="safety-screen__title">{page.title}</h1>

        <div className="safety-section">
          <h2 className="safety-section__heading">{page.whatHeading}</h2>
          <p className="safety-section__body">{withBrand(page.whatBody)}</p>
          <h2 className="safety-section__heading">{page.whatNotHeading}</h2>
          <p className="safety-section__body">{withBrand(page.whatNotBody)}</p>
        </div>

        <div className="safety-section">
          <h2 className="safety-section__heading">{page.supportHeading}</h2>
          <p className="safety-section__body">{page.supportIntro}</p>
          <ul className="safety-resource-list">
            {copy.resources.map((resource) => (
              <li
                key={resource.id}
                className={`safety-resource ${
                  resource.id === 'tele-manas' ? 'safety-resource--primary' : ''
                }`}
              >
                <span className="safety-resource__name">{resource.name}</span>
                <span className="safety-resource__phones">
                  {resource.phones.map((phone) => (
                    <a
                      key={phone.href}
                      className="safety-resource__phone"
                      href={phone.href}
                      {...(phone.href.startsWith('http')
                        ? { target: '_blank', rel: 'noopener noreferrer' }
                        : {})}
                    >
                      {phone.display}
                    </a>
                  ))}
                </span>
                <span className="safety-resource__detail">{resource.detail}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="safety-section">
          <h2 className="safety-section__heading">{page.dataHeading}</h2>
          <p className="safety-section__body">{page.dataIntro}</p>
          <ul className="safety-data-list">
            {page.dataBullets.map((bullet) => (
              <li key={bullet.label}>
                <strong>{bullet.label}:</strong> {withBrand(bullet.body)}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}
