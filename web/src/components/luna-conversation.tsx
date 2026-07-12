'use client';

// Luna conversation surface — screen 03, with an inline Session End
// card (screen 08).
//
// On mount this auto-connects via usePipecat. The Pipecat hook drives:
//   status      → 'connecting' | 'ready' | 'speaking' | 'listening' | 'ended'
//   secondsLeft → local call-time countdown, seeded from the server's
//                 per-session budget (MAX_CALL_SECONDS)
//   transcript  → entries to render
//
// Routing rules:
//   * status === 'idle' && session-ended ref set → show SessionEndCard
//   * onCallTimeUp → wrap the call up gracefully (no paid extension exists;
//     MAX_CALL_SECONDS is a hard operator limit the bot enforces
//     server-side via the signed token's `bud` claim)

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LunaOrb, type LunaOrbState } from '@/components/luna-orb';
import { TranscriptList } from '@/components/transcript-list';
import {
  MicIcon,
  MuteIcon,
  CloseIcon,
} from '@/components/icons';
import {
  usePipecat,
  type ConversationPhase,
  type PipecatStatus,
} from '@/hooks/use-pipecat';
import { useVoiceLevel, type VoiceSource } from '@/hooks/use-voice-level';
import { DEFAULT_PREFS, fetchPrefs } from '@/lib/prefs';
import { getAppCopy, interpolate, localeForLanguageMode } from '@/lib/i18n';

function phaseToVisual(phase: ConversationPhase): LunaOrbState {
  if (phase === 'connecting' || phase === 'assistant-thinking') {
    return 'processing';
  }
  if (phase === 'assistant-speaking') return 'speaking';
  if (phase === 'user-speaking' || phase === 'listening') return 'listening';
  return 'idle';
}

function phaseLabel(
  phase: ConversationPhase,
  status: PipecatStatus,
  ended: boolean,
  locale?: ReturnType<typeof localeForLanguageMode>,
): string {
  const copy = getAppCopy(locale).conversation.state;
  if (ended) return copy.ended;
  if (phase === 'assistant-speaking') return copy.assistantSpeaking;
  if (phase === 'user-speaking') return copy.userSpeaking;
  if (phase === 'assistant-thinking') return copy.thinking;
  if (phase === 'listening') return copy.listening;
  if (phase === 'connecting' || status === 'connecting') return copy.connecting;
  if (status === 'ready') return copy.ready;
  return copy.idle;
}

// Time-of-day buckets drive the SessionEndCard farewell copy so a midday
// rehearsal doesn't sign off with "Sleep well."
type Daypart = 'morning' | 'afternoon' | 'evening' | 'late-night';

function getDaypart(d: Date = new Date()): Daypart {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  if (h >= 17 && h < 22) return 'evening';
  return 'late-night';
}

type Props = {
  brandName: string;
  botName: string;
};

type ConnectError = Error & {
  code?: string;
  sessionId?: string;
};

export function LunaConversation({ brandName, botName }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const {
    state,
    connect,
    hangup,
    toggleMute,
    onCallTimeUp,
    localStreamRef,
    botStreamRef,
  } = usePipecat();

  // Mic permission error surfaces a recovery card instead of failing silently.
  const [micError, setMicError] = useState<null | 'mic_denied' | 'mic_blocked'>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [conflictSessionId, setConflictSessionId] = useState<string | null>(null);

  // The safety banner itself is dismissible, but a small "Support" chip
  // stays for the rest of the call so the resources are always one tap
  // away again — see luna-conversation.tsx §SafetyBanner below.
  const [riskBannerDismissed, setRiskBannerDismissed] = useState(false);

  // Session-ended (after hangup) is its own UI mode, not a Pipecat status.
  const [ended, setEnded] = useState(false);
  const [endStats, setEndStats] = useState<{ duration: string }>(
    () => ({ duration: '0:00' }),
  );
  const startedAtRef = useRef<number>(0);

  // Keep the first render deterministic across SSR and hydration. Browser
  // cache/server prefs reconcile after hydration via the effect below.
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);
  const locale = localeForLanguageMode(prefs.languageMode);
  const copy = getAppCopy(locale).conversation;
  const safetyCopy = getAppCopy(locale).safety;
  useEffect(() => {
    fetchPrefs().then(setPrefs).catch(() => {});
  }, []);

  // Audio analyser plumbing (mic vs bot stream, by status).
  const [source, setSource] = useState<VoiceSource>(null);
  useEffect(() => {
    if (state.phase === 'user-speaking') {
      setSource(localStreamRef.current);
    } else if (state.phase === 'assistant-speaking') {
      setSource(botStreamRef.current);
    } else {
      setSource(null);
    }
  }, [state.phase, localStreamRef, botStreamRef]);
  const { levelRef } = useVoiceLevel({
    source,
    active:
      state.phase === 'assistant-speaking' ||
      state.phase === 'user-speaking',
  });

  // Auto-connect on mount. ?scene=X is honored if present.
  const connectedRef = useRef(false);
  useEffect(() => {
    if (connectedRef.current) return;
    connectedRef.current = true;
    const sceneId = searchParams.get('scene');
    const customSeed =
      typeof window !== 'undefined'
        ? sessionStorage.getItem('luna:custom-seed')
        : null;
    startedAtRef.current = Date.now();
    connect({ sceneId, customSeed }).catch(
      (err: ConnectError) => {
        if (err?.code === 'mic_denied' || err?.code === 'mic_blocked') {
          setMicError(err.code);
          return;
        }
        if (err?.code === 'rate_limited') {
          setRateLimited(true);
        } else if (err?.code === 'session_conflict' && err.sessionId) {
          setConflictSessionId(err.sessionId);
        } else if (err?.code === 'unauthorized') router.replace('/sign-in');
        else console.error('connect failed', err);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const inCall = state.status !== 'idle';
  const visual = phaseToVisual(state.phase);

  const mm = String(Math.floor(Math.max(0, state.secondsLeft) / 60)).padStart(
    2,
    '0',
  );
  const ss = String(Math.max(0, state.secondsLeft) % 60).padStart(2, '0');
  // Generic "your call is winding down" cue on the timer text — just a
  // low-time affordance while the call is live, not tied to any spend limit.
  const lowTimeWarning = state.secondsLeft <= 30 && state.secondsLeft > 0;

  const handleHangup = async () => {
    const elapsedSec = Math.max(
      0,
      Math.floor((Date.now() - startedAtRef.current) / 1000),
    );
    const m = Math.floor(elapsedSec / 60);
    setEndStats({ duration: m > 0 ? `${m} min` : `${elapsedSec}s` });
    await hangup();
    setEnded(true);
  };

  // Local call-time countdown hit zero — wrap the call up gracefully.
  // There's no paid extension anymore; MAX_CALL_SECONDS is a hard operator
  // limit the bot itself enforces via the signed token's `bud` claim, so
  // this is just the client following suit.
  useEffect(() => {
    onCallTimeUp(() => {
      void handleHangup();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCallTimeUp]);

  const handleTalkAgain = () => {
    setEnded(false);
    connectedRef.current = false;
    startedAtRef.current = Date.now();
    connect({}).catch((err: ConnectError) => {
      if (err?.code === 'mic_denied' || err?.code === 'mic_blocked') {
        setMicError(err.code);
        return;
      }
      if (err?.code === 'rate_limited') {
        setRateLimited(true);
      } else if (err?.code === 'session_conflict' && err.sessionId) {
        setConflictSessionId(err.sessionId);
      } else if (err?.code === 'unauthorized') router.replace('/sign-in');
    });
  };

  const handleConflictRetry = async () => {
    const sid = conflictSessionId;
    if (!sid) return;
    await fetch(`/api/session/${sid}/end`, { method: 'POST' }).catch(() => {});
    setConflictSessionId(null);
    connectedRef.current = false;
    startedAtRef.current = Date.now();
    connect({}).catch((err: ConnectError) => {
      if (err?.code === 'session_conflict' && err.sessionId) {
        setConflictSessionId(err.sessionId);
      } else if (err?.code === 'rate_limited') {
        setRateLimited(true);
      } else if (err?.code === 'unauthorized') router.replace('/sign-in');
      else if (err?.code === 'mic_denied' || err?.code === 'mic_blocked') {
        setMicError(err.code);
      } else {
        console.error('connect failed', err);
      }
    });
  };

  if (rateLimited) {
    return (
      <section className="luna-conv luna-conv--mic-error" aria-live="polite">
        <p className="luna-conv__mic-headline">{copy.rateLimited.headline}</p>
        <p className="luna-conv__mic-headline">{copy.rateLimited.subtext}</p>
        <button
          type="button"
          className="luna-btn-primary"
          onClick={() => router.push('/')}
        >
          {getAppCopy(locale).common.actions.backToHome}
        </button>
      </section>
    );
  }

  if (conflictSessionId) {
    return (
      <section className="luna-conv luna-conv--mic-error" aria-live="polite">
        <p className="luna-conv__mic-headline">{copy.conflict.headline}</p>
        <button
          type="button"
          className="luna-btn-primary"
          onClick={handleConflictRetry}
        >
          {copy.conflict.primary}
        </button>
        <button
          type="button"
          className="luna-btn-ghost"
          onClick={() => router.push('/')}
        >
          {copy.conflict.secondary}
        </button>
      </section>
    );
  }

  if (micError) {
    const headline =
      micError === 'mic_denied'
        ? copy.micError.deniedHeadline
        : copy.micError.blockedHeadline;
    const cta = micError === 'mic_denied'
      ? getAppCopy().common.actions.tryAgain
      : copy.micError.enableMic;
    return (
      <section className="luna-conv luna-conv--mic-error" aria-live="polite">
        <p className="luna-conv__mic-headline">{headline}</p>
        <button
          type="button"
          className="luna-btn-primary"
          onClick={() => {
            setMicError(null);
            connectedRef.current = false;
            connect({}).catch((err: Error & { code?: string }) => {
              if (err?.code === 'mic_denied' || err?.code === 'mic_blocked') {
                setMicError(err.code);
              }
            });
          }}
        >
          {cta}
        </button>
      </section>
    );
  }

  if (ended) {
    return (
      <SessionEndCard
        duration={endStats.duration}
        name={prefs.name}
        botName={botName}
        onAgain={handleTalkAgain}
        onBye={() => router.push('/')}
        locale={locale}
      />
    );
  }

  return (
    <section className="luna-conv" aria-label={copy.ariaLabel}>
      {/* Top bar: just the centered title + timer. End-call lives in the
          bottom action bar; the topbar stays calm during a session. */}
      <div className="luna-topbar">
        <div className="luna-topbar__center">
          <div className="luna-topbar__title">
            {brandName} · {copy.titleSuffix}
          </div>
          <div
            className={`luna-topbar__time ${lowTimeWarning ? 'is-warn' : ''}`}
            aria-live="polite"
          >
            {mm}:{ss} · {copy.freeSession}
          </div>
        </div>
      </div>

      {/* Safety banner — appears the moment the bot's real-time crisis
          detection sends a risk signal (see hooks/use-pipecat.ts). Calm,
          dismissible, never blocking: the conversation keeps going
          underneath it. Once dismissed, a small "Support" chip keeps the
          resources one tap away for the rest of this call. */}
      {state.riskAlert && !riskBannerDismissed && (
        <SafetyBanner
          locale={locale}
          onDismiss={() => setRiskBannerDismissed(true)}
        />
      )}
      {state.riskAlert && riskBannerDismissed && (
        <div className="safety-chip-row">
          <button
            type="button"
            className="glass-pill safety-chip"
            onClick={() => setRiskBannerDismissed(false)}
          >
            {safetyCopy.chipLabel}
          </button>
        </div>
      )}

      {/* Orb + state label */}
      <div className="call-stage" data-phase={state.phase}>
        <div className="call-stage__orb-wrap">
          <LunaOrb size={240} state={visual} levelRef={levelRef} />
        </div>
        <span
          className={`call-state-label ${
            state.phase !== 'idle' && state.status !== 'ready'
              ? 'is-active'
              : ''
          }`}
          data-phase={state.phase}
        >
          <span className="dot" />
          {phaseLabel(state.phase, state.status, false, locale)}
        </span>
      </div>

      {/* Transcript with masked fade */}
      <div className="call-transcript">
        <TranscriptList entries={state.transcript} locale={locale} />
      </div>

      {/* Starter lines — examples only. The voice conversation still begins
          when the user speaks, so these must not look like submit buttons. */}
      {state.transcript.length === 0 && (
        <div className="call-prompts" aria-label={copy.starterLinesLabel}>
          <span className="call-prompts__intro">
            {copy.starterIntro}
          </span>
          {copy.suggested.map((s) => (
            <span
              key={s}
              className="call-prompt"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Bottom controls — kept minimal during a call: just mic + end. */}
      <div className="call-actions">
        <button
          type="button"
          className={`call-action call-action--mic ${
            inCall ? 'is-live' : ''
          } ${
            state.phase === 'user-speaking' ? 'is-user-speaking' : ''
          }`}
          aria-label={state.muted ? copy.unmute : copy.mute}
          onClick={toggleMute}
        >
          {state.muted ? <MuteIcon muted /> : <MicIcon />}
        </button>
        <button
          type="button"
          className="call-action call-action--end"
          aria-label={copy.endCall}
          onClick={handleHangup}
        >
          <CloseIcon />
        </button>
      </div>

    </section>
  );
}

// ─── Safety banner (risk-alert panel) ──────────────────────────────────
// Triggered by state.riskAlert (see hooks/use-pipecat.ts). A calm, dismissible
// panel — never a modal — so the call keeps running underneath it. Resource
// copy is shared with the /safety page via lib/i18n.ts `safety.resources`.
function SafetyBanner({
  locale,
  onDismiss,
}: {
  locale: ReturnType<typeof localeForLanguageMode>;
  onDismiss: () => void;
}) {
  const copy = getAppCopy(locale).safety;
  return (
    <div className="safety-banner" role="status" aria-live="polite">
      <button
        type="button"
        className="safety-banner__dismiss"
        aria-label={copy.dismiss}
        onClick={onDismiss}
      >
        <CloseIcon />
      </button>
      <p className="safety-banner__lede">{copy.bannerLede}</p>
      <ul className="safety-banner__list">
        {copy.resources.map((resource) => (
          <li
            key={resource.id}
            className={`safety-banner__resource ${
              resource.id === 'tele-manas' ? 'safety-banner__resource--primary' : ''
            }`}
          >
            <span className="safety-banner__name">{resource.name}</span>
            <span className="safety-banner__phones">
              {resource.phones.map((phone) => (
                <a
                  key={phone.href}
                  className="safety-banner__phone"
                  href={phone.href}
                  {...(phone.href.startsWith('http')
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                >
                  {phone.display}
                </a>
              ))}
            </span>
            <span className="safety-banner__detail">{resource.detail}</span>
          </li>
        ))}
      </ul>
      <a
        className="safety-banner__more"
        href="/safety"
        target="_blank"
        rel="noopener noreferrer"
      >
        {copy.linkLabel}
      </a>
    </div>
  );
}

// ─── Session End ────────────────────────────────────────────────────────
function SessionEndCard({
  duration,
  name,
  botName,
  onAgain,
  onBye,
  locale,
}: {
  duration: string;
  name: string | null;
  botName: string;
  onAgain: () => void;
  onBye: () => void;
  locale: ReturnType<typeof localeForLanguageMode>;
}) {
  const appCopy = getAppCopy(locale);
  const copy = appCopy.conversation.sessionEnd;
  const daypart = getDaypart();
  const farewell =
    daypart === 'late-night'
      ? copy.farewell.lateNight
      : copy.farewell[daypart];
  return (
    <section
      className="luna-end"
      aria-label={interpolate(copy.ariaLabel, { botName })}
    >
      <LunaOrb size={200} state="idle" />
      <div className="luna-end__copy">
        <h2 className="luna-end__h">
          {farewell.heading[0]}
          <br />
          {farewell.heading[1]}
        </h2>
        <p className="luna-end__sub">
          {interpolate(copy.rememberName, {
            remember: farewell.remember,
            name: name || copy.defaultName,
          })}
          <br />
          {farewell.closer}
        </p>
      </div>
      <div className="luna-end__stats">
        <Stat label={copy.stats.talked} value={duration} />
        <Stat label={copy.stats.private} value={copy.stats.privateValue} />
        <Stat label={copy.stats.memory} value={copy.stats.memoryValue} />
      </div>
      <div className="luna-end__spacer" />
      <button
        type="button"
        className="luna-btn-primary luna-end__again"
        onClick={onAgain}
      >
        {appCopy.common.actions.talkAgain}
      </button>
      <button
        type="button"
        className="luna-btn-ghost luna-end__bye"
        onClick={onBye}
      >
        {farewell.bye}
      </button>
    </section>
  );
}

function Stat({
  label,
  value,
  italic,
}: {
  label: string;
  value: string;
  italic?: boolean;
}) {
  return (
    <div className="luna-end__stat">
      <div
        className={`luna-end__stat-v ${italic ? 'is-italic' : ''}`}
        style={italic ? { fontFamily: 'var(--font-display)' } : undefined}
      >
        {value}
      </div>
      <div className="luna-end__stat-l">{label}</div>
    </div>
  );
}
