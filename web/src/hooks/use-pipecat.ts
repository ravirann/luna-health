'use client';

import { useCallback, useEffect, useReducer, useRef } from 'react';
import { PipecatClient, RTVIEvent } from '@pipecat-ai/client-js';
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport';

import { BOT_OFFER_PATH } from '@/lib/env';

export type ConnectOptions = {
  sceneId?: string | null;
  personaId?: string | null;
  customSeed?: string | null;
};

export function classifyMicError(err: { name?: string } | null | undefined): 'mic_denied' | 'mic_blocked' | null {
  if (!err) return null;
  if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') return 'mic_denied';
  if (err.name === 'NotFoundError' || err.name === 'OverconstrainedError') return 'mic_blocked';
  return null;
}

type SessionStartResponse = {
  sessionId: string;
  botUrl: string;
  body: Record<string, unknown>;
};

type SessionStartErrorCode =
  | 'unauthorized'
  | 'rate_limited'
  | 'session_conflict';

type SessionStartErrorBody = {
  status?: string;
  error?: string;
  reason?: string;
  sessionId?: string;
};

export type PipecatStatus =
  | 'idle'
  | 'connecting'
  | 'ready'
  | 'speaking'
  | 'listening'
  | 'ended';

export type ConversationPhase =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'user-speaking'
  | 'assistant-thinking'
  | 'assistant-speaking'
  | 'ended';

export type TranscriptEntry = {
  role: 'assistant' | 'you';
  text: string;
  ts: number;
};

export type RiskLevel = 'crisis';

export type PipecatState = {
  status: PipecatStatus;
  phase: ConversationPhase;
  botSaying: string;
  userSaying: string;
  muted: boolean;
  secondsLeft: number;
  lastUserLine: string;
  transcript: TranscriptEntry[];
  // Set once the bot's real-time crisis-detection sends a risk signal over
  // the RTVI server-message channel (see the ServerMessage handler in
  // connect() below). Sticky for the rest of the call — cleared only by
  // 'reset' (i.e. a fresh connect()) — since the bot doesn't send an
  // "all clear" follow-up.
  riskAlert: RiskLevel | null;
};

type Action =
  | { type: 'status'; status: PipecatStatus }
  | { type: 'phase'; phase: ConversationPhase }
  | { type: 'bot-output'; text: string }
  | { type: 'user-transcript'; text: string; final: boolean }
  | { type: 'tick' }
  | { type: 'mute'; muted: boolean }
  | { type: 'budget'; seconds: number }
  | { type: 'risk-alert'; level: RiskLevel }
  | { type: 'reset' };

const initial: PipecatState = {
  status: 'idle',
  phase: 'idle',
  botSaying: '',
  userSaying: '',
  muted: false,
  // Set from the server's callBudgetSecs (derived from MAX_CALL_SECONDS)
  // once /api/session/start responds — see the 'budget' action below.
  secondsLeft: 0,
  lastUserLine: '',
  transcript: [],
  riskAlert: null,
};

function appendTranscript(
  log: TranscriptEntry[],
  role: TranscriptEntry['role'],
  text: string,
): TranscriptEntry[] {
  if (!text) return log;
  const last = log[log.length - 1];
  if (last && last.role === role && last.text === text) return log;
  const next = [...log, { role, text, ts: Date.now() }];
  return next.length > 200 ? next.slice(next.length - 200) : next;
}

function reducer(state: PipecatState, action: Action): PipecatState {
  switch (action.type) {
    case 'status':
      return { ...state, status: action.status };
    case 'phase':
      return { ...state, phase: action.phase };
    case 'bot-output':
      return {
        ...state,
        botSaying: action.text,
        transcript: appendTranscript(state.transcript, 'assistant', action.text),
      };
    case 'user-transcript':
      return {
        ...state,
        userSaying: action.text,
        lastUserLine: action.final ? action.text : state.lastUserLine,
        transcript: action.final
          ? appendTranscript(state.transcript, 'you', action.text)
          : state.transcript,
      };
    case 'tick':
      return { ...state, secondsLeft: Math.max(0, state.secondsLeft - 1) };
    case 'mute':
      return { ...state, muted: action.muted };
    case 'budget':
      return { ...state, secondsLeft: Math.max(0, action.seconds) };
    case 'risk-alert':
      return { ...state, riskAlert: action.level };
    case 'reset':
      return initial;
    default:
      return state;
  }
}

async function readSessionStartBody(res: Response): Promise<SessionStartErrorBody | null> {
  try {
    return (await res.clone().json()) as SessionStartErrorBody;
  } catch {
    return null;
  }
}

function throwSessionStartError(
  code: SessionStartErrorCode,
  details: { sessionId?: string } = {},
): never {
  const err = new Error(code) as Error & {
    code?: string;
    sessionId?: string;
  };
  err.code = code;
  if (details.sessionId) err.sessionId = details.sessionId;
  throw err;
}

/**
 * Wraps the pipecat client + SmallWebRTC transport behind a `connect()` /
 * `hangup()` API. State is reduced from RTVI events.
 */
export function usePipecat() {
  const [state, dispatch] = useReducer(reducer, initial);
  const clientRef = useRef<PipecatClient | null>(null);
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onCallTimeUpRef = useRef<(() => void) | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const endRequestedRef = useRef<boolean>(false);
  // Exposed so the call page can wire visualizers (VoiceOrb, EdgeGlow) to
  // the actual mic stream and bot audio without re-rendering on every frame.
  const localStreamRef = useRef<MediaStream | null>(null);
  const botStreamRef = useRef<MediaStream | null>(null);

  const stopCallClock = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current);
      callTimerRef.current = null;
    }
  }, []);

  const startCallClock = useCallback(() => {
    stopCallClock();
    callTimerRef.current = setInterval(() => {
      dispatch({ type: 'tick' });
    }, 1000);
  }, [stopCallClock]);

  const endCurrentSession = useCallback((opts: { keepalive?: boolean } = {}) => {
    const sid = sessionIdRef.current;
    if (!sid || endRequestedRef.current) return;
    endRequestedRef.current = true;
    fetch(`/api/session/${sid}/end`, {
      method: 'POST',
      ...(opts.keepalive ? { keepalive: true } : {}),
    }).catch(() => {
      /* idempotent on the server, the bot's webhook is the backup */
    });
    sessionIdRef.current = null;
  }, []);

  const connect = useCallback(async (opts: ConnectOptions = {}) => {
    if (clientRef.current && clientRef.current.state !== 'disconnected') {
      return;
    }

    // Pre-flight mic permission check. If denied, throw a typed error so the
    // UI can surface a recovery card without hitting the server at all.
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop our pre-flight tracks; Pipecat will request its own.
      stream.getTracks().forEach((t) => t.stop());
    } catch (err) {
      const code = classifyMicError(err as { name?: string });
      if (code) {
        const e = new Error('mic permission rejected') as Error & { code: string };
        e.code = code;
        dispatch({ type: 'status', status: 'idle' });
        dispatch({ type: 'phase', phase: 'idle' });
        throw e;
      }
      throw err;
    }

    // Allocate a session server-side. This:
    //   - asserts the user is authenticated (401 if not)
    //   - enforces the operator's usage limits (soft_gate/rate_limited if over)
    //   - records the session and returns the bot URL + signed body to send.
    // Reset the once-per-session end-fire latch. New connect = new session.
    endRequestedRef.current = false;
    dispatch({ type: 'status', status: 'connecting' });
    dispatch({ type: 'phase', phase: 'connecting' });
    let session: SessionStartResponse;
    try {
      const res = await fetch('/api/session/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sceneId: opts.sceneId ?? null,
          personaId: opts.personaId ?? null,
          customSeed: opts.customSeed ?? null,
        }),
      });
      if (res.status === 401) {
        dispatch({ type: 'status', status: 'idle' });
        dispatch({ type: 'phase', phase: 'idle' });
        throwSessionStartError('unauthorized');
      }
      if (!res.ok) {
        const body = await readSessionStartBody(res);
        const code = body?.error;
        if (
          code === 'rate_limited' ||
          code === 'session_conflict' ||
          code === 'unauthorized'
        ) {
          dispatch({ type: 'status', status: 'idle' });
          dispatch({ type: 'phase', phase: 'idle' });
          throwSessionStartError(code, { sessionId: body?.sessionId });
        }
        const detail = await res.text().catch(() => '');
        throw new Error(`session/start failed (${res.status}): ${detail}`);
      }
      session = (await res.json()) as SessionStartResponse;
      if ((session as SessionStartErrorBody).status === 'soft_gate') {
        const reason = (session as SessionStartErrorBody).reason;
        if (reason === 'rate_limited') {
          dispatch({ type: 'status', status: 'idle' });
          dispatch({ type: 'phase', phase: 'idle' });
          throwSessionStartError(reason);
        }
      }
      sessionIdRef.current = session.sessionId;
      // Seed the local countdown from the server's real per-session budget
      // (MAX_CALL_SECONDS) rather than a hardcoded constant, so the
      // low-time UI warning lines up with what the bot actually enforces
      // via the signed token's `bud` claim.
      const budgetSecs = Number(
        (session.body as { callBudgetSecs?: unknown } | undefined)?.callBudgetSecs,
      );
      if (Number.isFinite(budgetSecs)) {
        dispatch({ type: 'budget', seconds: budgetSecs });
      }
    } catch (err) {
      dispatch({ type: 'status', status: 'idle' });
      dispatch({ type: 'phase', phase: 'idle' });
      throw err;
    }

    const client = new PipecatClient({
      transport: new SmallWebRTCTransport(),
      enableMic: true,
      enableCam: false,
    });
    clientRef.current = client;

    // Single source of truth for the call ending: every transport-state
    // change is checked against `disconnected`, which fires both when the
    // user hangs up AND when the bot pushes `EndFrame` (call-budget reached).
    // We POST to /end exactly once per session — `endRequestedRef` guards
    // against double-fire when both hangup() and the bot end the call.
    client.on(RTVIEvent.TransportStateChanged, (s: string) => {
      dispatch({ type: 'status', status: (s as PipecatStatus) ?? 'idle' });
      if (s === 'disconnected' || s === 'error') {
        dispatch({ type: 'phase', phase: 'idle' });
        endCurrentSession();
      }
    });

    client.on(RTVIEvent.TrackStarted, (track, participant) => {
      if (track.kind !== 'audio') return;
      const ms = new MediaStream([track]);
      if (participant?.local) {
        localStreamRef.current = ms;
      } else {
        botStreamRef.current = ms;
        const el = document.getElementById('assistant-audio') as HTMLAudioElement | null;
        if (el) el.srcObject = ms;
      }
    });

    client.on(RTVIEvent.BotReady, () => {
      dispatch({ type: 'status', status: 'ready' });
      dispatch({ type: 'phase', phase: 'listening' });
    });
    client.on(RTVIEvent.BotLlmStarted, () => {
      dispatch({ type: 'phase', phase: 'assistant-thinking' });
    });
    client.on(RTVIEvent.BotStartedSpeaking, () => {
      dispatch({ type: 'status', status: 'speaking' });
      dispatch({ type: 'phase', phase: 'assistant-speaking' });
    });
    client.on(RTVIEvent.BotStoppedSpeaking, () => {
      dispatch({ type: 'status', status: 'listening' });
      dispatch({ type: 'phase', phase: 'listening' });
    });
    client.on(RTVIEvent.UserStartedSpeaking, () => {
      dispatch({ type: 'status', status: 'listening' });
      dispatch({ type: 'phase', phase: 'user-speaking' });
    });
    client.on(RTVIEvent.UserStoppedSpeaking, () => {
      dispatch({ type: 'phase', phase: 'assistant-thinking' });
    });

    client.on(RTVIEvent.BotOutput, (data) => {
      // Sentence-aggregated chunks are the right granularity for the caption.
      if (data?.aggregated_by === 'sentence' && data.text) {
        dispatch({ type: 'bot-output', text: data.text.trim() });
      }
    });
    client.on(RTVIEvent.UserTranscript, (data) => {
      if (!data?.text) return;
      dispatch({
        type: 'user-transcript',
        text: data.text.trim(),
        final: !!data.final,
      });
    });

    // Crisis-detection signal from the bot: exactly
    //   { label: 'rtvi-ai', type: 'server-message', data: { kind: 'risk', level: 'crisis' } }
    // The client-js SDK already unwraps `.data` before invoking this
    // callback (see RTVIClient's SERVER_MESSAGE handling), so `data` here
    // IS the bot's `{ kind, level }` payload, not the outer envelope.
    // Tolerant on purpose: react to any `kind === 'risk'` regardless of
    // `level` (today only 'crisis' exists) so a future bot-side level
    // doesn't silently no-op here. Never logged/persisted — the alert
    // only ever lives in this in-memory state.
    client.on(RTVIEvent.ServerMessage, (data: unknown) => {
      const payload = data as { kind?: unknown; level?: unknown } | null | undefined;
      if (payload?.kind === 'risk') {
        dispatch({ type: 'risk-alert', level: 'crisis' });
      }
    });

    client.on(RTVIEvent.Error, (err) => {
      console.error('assistant pipecat error:', err);
    });

    if (!session.botUrl) {
      dispatch({ type: 'status', status: 'idle' });
      throw new Error(
        'bot URL missing — set NEXT_PUBLIC_BOT_URL to the running pipecat bot',
      );
    }

    try {
      // SmallWebRTCTransport @ 1.10.0+ uses `webrtcRequestParams` (was
      // `webrtcUrl` + `body` in the older API; both still log a deprecation
      // warning and `body` is silently dropped). The transport sends
      // `requestData` to the bot's /api/offer as `request_data` in the
      // offer payload, which lands in pipecat's runner_args.body.
      await client.connect({
        webrtcRequestParams: {
          endpoint: session.botUrl + BOT_OFFER_PATH,
          requestData: session.body,
        },
      });
      startCallClock();
    } catch (err) {
      // The transport JSON.parses the /api/offer response without checking
      // status — a down bot or wrong URL surfaces here as a SyntaxError.
      // Translate it so the user sees what's actually wrong.
      if (err instanceof SyntaxError) {
        const wrapped = new Error(
          `bot offer at ${session.botUrl}${BOT_OFFER_PATH} returned non-JSON — is the pipecat bot running?`,
        );
        console.error('assistant connect failed:', wrapped, err);
        dispatch({ type: 'status', status: 'idle' });
        dispatch({ type: 'phase', phase: 'idle' });
        throw wrapped;
      }
      console.error('assistant connect failed:', err);
      dispatch({ type: 'status', status: 'idle' });
      dispatch({ type: 'phase', phase: 'idle' });
      throw err;
    }
  }, [endCurrentSession, startCallClock]);

  const hangup = useCallback(async () => {
    stopCallClock();
    // Fire /end FIRST, before disconnect. Disconnecting will trigger the
    // TransportStateChanged handler too, but the `endRequestedRef` guard
    // makes that a no-op when we've already hit it from here.
    endCurrentSession();
    const c = clientRef.current;
    if (c) {
      try {
        await c.disconnect();
      } catch {
        /* noop */
      }
    }
    clientRef.current = null;
    localStreamRef.current = null;
    botStreamRef.current = null;
    dispatch({ type: 'reset' });
  }, [endCurrentSession, stopCallClock]);

  const toggleMute = useCallback(() => {
    const c = clientRef.current;
    const next = !state.muted;
    dispatch({ type: 'mute', muted: next });
    if (c) c.enableMic(!next);
  }, [state.muted]);

  // Notify the consumer when the local call-time countdown hits zero, so
  // it can wrap the call up gracefully. Consumer registers the side-effect
  // via `onCallTimeUp`.
  //
  // Exception: while a risk alert is active, the bot has already extended
  // the call budget server-side (signed into a fresh `bud` claim) — but it
  // doesn't tell the client the new number, so our local countdown is
  // stale. Don't let a stale local timer hang up a call the bot just
  // extended; let the bot's own EndFrame (caught generically by the
  // TransportStateChanged 'disconnected' handler above) end it instead.
  useEffect(() => {
    if (state.secondsLeft === 0 && state.status !== 'idle') {
      stopCallClock();
      if (!state.riskAlert) {
        onCallTimeUpRef.current?.();
      }
    }
  }, [state.secondsLeft, state.status, state.riskAlert, stopCallClock]);

  // Cleanup on unmount.
  useEffect(() => {
    return () => {
      stopCallClock();
      endCurrentSession({ keepalive: true });
      const c = clientRef.current;
      if (c) c.disconnect().catch(() => {});
    };
  }, [endCurrentSession, stopCallClock]);

  const onCallTimeUp = useCallback((fn: () => void) => {
    onCallTimeUpRef.current = fn;
  }, []);

  return {
    state,
    connect,
    hangup,
    toggleMute,
    onCallTimeUp,
    localStreamRef,
    botStreamRef,
  };
}
