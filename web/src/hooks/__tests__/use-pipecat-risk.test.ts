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
    ServerMessage: 'ServerMessage',
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
        body: { callBudgetSecs: 600 },
      }));
    }
    return new Response(JSON.stringify({ ok: true }));
  }) as never;
});

afterEach(() => {
  vi.restoreAllMocks();
});

import { usePipecat } from '@/hooks/use-pipecat';

describe('usePipecat risk-alert plumbing', () => {
  it('surfaces a crisis risk-alert from the RTVI server-message channel', async () => {
    const { result } = renderHook(() => usePipecat());

    await act(async () => {
      await result.current.connect();
    });

    expect(result.current.state.riskAlert).toBeNull();

    act(() => {
      // Exactly the bot's payload shape, already unwrapped by client-js:
      // { label: 'rtvi-ai', type: 'server-message', data: { kind: 'risk', level: 'crisis' } }
      eventHandlers.get('ServerMessage')?.({ kind: 'risk', level: 'crisis' } as never);
    });

    expect(result.current.state.riskAlert).toBe('crisis');
  });

  it('ignores unrelated server messages', async () => {
    const { result } = renderHook(() => usePipecat());

    await act(async () => {
      await result.current.connect();
    });

    act(() => {
      eventHandlers.get('ServerMessage')?.({ kind: 'something-else' } as never);
    });

    expect(result.current.state.riskAlert).toBeNull();
  });

  it('resets riskAlert on a fresh connect (new call)', async () => {
    const { result } = renderHook(() => usePipecat());

    await act(async () => {
      await result.current.connect();
    });
    act(() => {
      eventHandlers.get('ServerMessage')?.({ kind: 'risk', level: 'crisis' } as never);
    });
    expect(result.current.state.riskAlert).toBe('crisis');

    await act(async () => {
      await result.current.hangup();
    });
    expect(result.current.state.riskAlert).toBeNull();
  });

  it('does not auto-hang-up on local timer expiry while a risk alert is active', async () => {
    // Small budget so advancing the (fake) call clock to zero is cheap.
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/session/start') {
        return new Response(JSON.stringify({
          status: 'ok',
          sessionId: 'session-1',
          botUrl: 'http://bot.local',
          body: { callBudgetSecs: 2 },
        }));
      }
      return new Response(JSON.stringify({ ok: true }));
    }) as never;

    vi.useFakeTimers();
    try {
      const { result } = renderHook(() => usePipecat());
      const onTimeUp = vi.fn();
      result.current.onCallTimeUp(onTimeUp);

      await act(async () => {
        await result.current.connect();
      });
      expect(result.current.state.secondsLeft).toBe(2);

      act(() => {
        eventHandlers.get('ServerMessage')?.({ kind: 'risk', level: 'crisis' } as never);
      });

      act(() => {
        vi.advanceTimersByTime(3000);
      });

      expect(result.current.state.secondsLeft).toBe(0);
      expect(onTimeUp).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
