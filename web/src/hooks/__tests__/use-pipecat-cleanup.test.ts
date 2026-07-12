import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

const disconnect = vi.fn(async () => undefined);
const connectClient = vi.fn(async () => undefined);
const on = vi.fn();
const eventHandlers = new Map<string, (...args: never[]) => void>();

vi.mock('@pipecat-ai/client-js', () => ({
  RTVIEvent: {
    TransportStateChanged: 'TransportStateChanged',
    TrackStarted: 'TrackStarted',
    BotReady: 'BotReady',
    BotStartedSpeaking: 'BotStartedSpeaking',
    BotStoppedSpeaking: 'BotStoppedSpeaking',
    UserStartedSpeaking: 'UserStartedSpeaking',
    UserStoppedSpeaking: 'UserStoppedSpeaking',
    BotLlmStarted: 'BotLlmStarted',
    BotOutput: 'BotOutput',
    UserTranscript: 'UserTranscript',
    Error: 'Error',
  },
  PipecatClient: class {
    state = 'connected';
    connect = connectClient;
    disconnect = disconnect;
    on = on;
    enableMic = vi.fn();
  },
}));

vi.mock('@pipecat-ai/small-webrtc-transport', () => ({
  SmallWebRTCTransport: class {},
}));

beforeEach(() => {
  disconnect.mockClear();
  connectClient.mockClear();
  on.mockClear();
  eventHandlers.clear();
  on.mockImplementation((event: string, handler: (...args: never[]) => void) => {
    eventHandlers.set(event, handler);
  });
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {
      getUserMedia: vi.fn(async () => ({
        getTracks: () => [{ stop: vi.fn() }],
      })),
    },
  });
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === '/api/session/start') {
      return new Response(JSON.stringify({
        status: 'ok',
        sessionId: 'session-1',
        botUrl: 'http://bot.local',
        body: {},
      }));
    }
    return new Response(JSON.stringify({ ok: true }));
  }) as never;
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { usePipecat } from '@/hooks/use-pipecat';

describe('usePipecat cleanup', () => {
  it('ends an allocated session when the hook unmounts', async () => {
    const { result, unmount } = renderHook(() => usePipecat());

    await act(async () => {
      await result.current.connect();
    });
    unmount();

    expect(global.fetch).toHaveBeenCalledWith('/api/session/session-1/end', {
      keepalive: true,
      method: 'POST',
    });
  });

  it('throws a typed rate_limited error for the canonical session/start response', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/session/start') {
        return new Response(JSON.stringify({
          status: 'error',
          error: 'rate_limited',
        }), { status: 429 });
      }
      return new Response(JSON.stringify({ ok: true }));
    }) as never;

    const { result } = renderHook(() => usePipecat());

    await expect(result.current.connect()).rejects.toMatchObject({
      code: 'rate_limited',
    });
  });

  it('includes the active session id on typed session_conflict errors', async () => {
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/session/start') {
        return new Response(JSON.stringify({
          status: 'error',
          error: 'session_conflict',
          sessionId: 'session-active',
        }), { status: 409 });
      }
      return new Response(JSON.stringify({ ok: true }));
    }) as never;

    const { result } = renderHook(() => usePipecat());

    await expect(result.current.connect()).rejects.toMatchObject({
      code: 'session_conflict',
      sessionId: 'session-active',
    });
  });

  it('tracks user, thinking, and assistant speaking phases separately', async () => {
    const { result } = renderHook(() => usePipecat());

    await act(async () => {
      await result.current.connect();
    });

    act(() => {
      eventHandlers.get('UserStartedSpeaking')?.();
    });
    expect(result.current.state.phase).toBe('user-speaking');

    act(() => {
      eventHandlers.get('UserStoppedSpeaking')?.();
    });
    expect(result.current.state.phase).toBe('assistant-thinking');

    act(() => {
      eventHandlers.get('BotStartedSpeaking')?.();
    });
    expect(result.current.state.phase).toBe('assistant-speaking');

    act(() => {
      eventHandlers.get('BotStoppedSpeaking')?.();
    });
    expect(result.current.state.phase).toBe('listening');
  });
});
