'use client';

// Luna splash — screen 01.
//
// Renders the wordmark, "tryvelira.app" tagline, the idle particle orb,
// the headline, and the big magenta CTA. Tap routing logic:
//   all users → preflight /api/session/start first. On soft_gate (the
//   operator's daily usage cap or IP throttle), show a calm inline
//   message instead of navigating. On ok or error, navigate to /call.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { LunaOrb } from '@/components/luna-orb';
import { MicIcon, ProfileIcon } from '@/components/icons';
import { FocusDialog } from '@/components/focus-dialog';
import { RecallCard } from '@/components/recall-card';
import { getAppCopy } from '@/lib/i18n';

type Props = {
  signedIn: boolean;
  brandName: string;
  /** Server-resolved headline (LLM or static). Falls back to a default if
   *  the LLM call fails. */
  headline: string;
  /** Server-resolved subtitle. */
  subtitle: string;
  /** Optional recall copy — shown above the mic CTA for returning guests. */
  recallCopy?: string | null;
};

export function LunaSplash({ signedIn, brandName, headline, subtitle, recallCopy }: Props) {
  const copy = getAppCopy().splash;
  const safetyCopy = getAppCopy().safety;
  const router = useRouter();
  const [rateLimited, setRateLimited] = useState(false);

  const handleStart = async () => {
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preflight: true }),
      });
      const body = await res.json();
      if (body.status === 'soft_gate') {
        setRateLimited(true);
        return;
      }
      router.push('/call');
    } catch {
      router.push('/call');
    }
  };

  return (
    <>
      {/* Brand mark — pinned to viewport top-left, mirrors the profile
          icon at top-right. Acts as a quiet nav anchor, not a centerpiece. */}
      <span className="splash-brand luna-mark" aria-hidden>
        <span className="luna-mark__glyph" />
        <span className="luna-mark__word">{brandName}</span>
      </span>

      {signedIn && (
        <Link
          href="/profile"
          className="splash-profile icon-btn"
          aria-label={copy.profileLabel}
          title={copy.profileLabel}
        >
          <ProfileIcon />
        </Link>
      )}

      <section className="luna-splash" aria-label={brandName}>
        {/* Hero — orb + dynamic headline (LLM-generated, time-of-day aware) */}
        <div className="luna-splash__hero">
          <LunaOrb size={260} state="idle" />
          <div className="luna-splash__copy">
            <h1 className="luna-splash__h">{renderHeadline(headline)}</h1>
            <p className="luna-splash__tag">{subtitle}</p>
          </div>
        </div>

        {/* Recall card — only shown for returning guests with a prior session */}
        {recallCopy && <RecallCard copy={recallCopy} />}

        {/* CTA — mic button + two whispered helper lines below.
            "Tap to talk" removes interaction ambiguity; the privacy line
            answers the unspoken hesitation right before the user speaks. */}
        <div className="luna-cta">
          <button
            type="button"
            className="luna-cta__btn"
            aria-label={copy.startTalkingLabel}
            onClick={handleStart}
          >
            <MicIcon />
          </button>
          <div className="luna-cta__hint">
            <span className="luna-cta__hint-line">{copy.tapToTalk}</span>
            <span className="luna-cta__privacy">{copy.privacy}</span>
          </div>
          {/* Quiet third line in the same whispered-hint block as the two
              above — deliberately NOT a fixed/floating footer. A fixed
              overlay here collides with this exact hint block on short
              viewports (verified: it visually overlapped "Tap to talk" at
              375x667). Living inside .luna-cta lets it inherit the
              block's existing centering/spacing instead of fighting it. */}
          <Link href="/safety" className="splash-safety-link">
            {safetyCopy.linkLabel}
          </Link>
        </div>
      </section>

      {rateLimited && (
        <RateLimitedOverlay onDismiss={() => setRateLimited(false)} />
      )}
    </>
  );
}

/** Calm, no-pressure notice for the operator's usage limits (daily cap or
 *  IP throttle) — there's nothing to buy, so this is a single dismiss,
 *  not a two-button upsell. */
function RateLimitedOverlay({ onDismiss }: { onDismiss: () => void }) {
  const copy = getAppCopy().rateLimit;
  const okay = getAppCopy().common.actions.okay;
  const okayRef = useRef<HTMLButtonElement | null>(null);

  return (
    <FocusDialog
      className="soft-gate-overlay"
      labelledBy="soft-gate-headline"
      initialFocusRef={okayRef}
      onEscape={onDismiss}
    >
      <div className="soft-gate-overlay__backdrop" />
      <div className="soft-gate-overlay__card">
        <h2 id="soft-gate-headline" className="soft-gate-overlay__headline">
          {copy.headline}
        </h2>
        <p className="soft-gate-overlay__sub">{copy.subtext}</p>
        <button
          ref={okayRef}
          type="button"
          className="luna-btn-primary soft-gate-overlay__primary"
          onClick={onDismiss}
        >
          {okay}
        </button>
      </div>
    </FocusDialog>
  );
}

/** Italicise the first word of the headline so it lands like the design's
 *  "*Someone's* here to listen." treatment, regardless of what the LLM
 *  produced. We split on the first whitespace; if the headline is one
 *  word it just renders italic in full. */
function renderHeadline(text: string) {
  const trimmed = text.trim();
  const idx = trimmed.indexOf(' ');
  if (idx === -1) return <em>{trimmed}</em>;
  const head = trimmed.slice(0, idx);
  const tail = trimmed.slice(idx);
  return (
    <>
      <em>{head}</em>
      {tail}
    </>
  );
}
