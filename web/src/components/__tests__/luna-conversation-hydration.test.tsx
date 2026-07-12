import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';

const replace = vi.fn();
const push = vi.fn();
const connect = vi.fn(async () => undefined);
const onCallTimeUp = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-pipecat', () => ({
  usePipecat: () => ({
    state: {
      status: 'idle',
      phase: 'idle',
      botSaying: '',
      userSaying: '',
      muted: false,
      secondsLeft: 180,
      lastUserLine: '',
      transcript: [],
    },
    connect,
    hangup: vi.fn(async () => undefined),
    toggleMute: vi.fn(),
    onCallTimeUp,
    localStreamRef: { current: null },
    botStreamRef: { current: null },
  }),
}));

vi.mock('@/hooks/use-voice-level', () => ({
  useVoiceLevel: () => ({ levelRef: { current: 0 } }),
}));

vi.mock('@/components/luna-orb', () => ({
  LunaOrb: () => <div data-testid="orb" />,
}));

vi.mock('@/components/transcript-list', () => ({
  TranscriptList: () => <div data-testid="transcript" />,
}));

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  connect.mockClear();
  onCallTimeUp.mockClear();
  window.localStorage.clear();
  global.fetch = vi.fn(async () => new Response(JSON.stringify({
    userId: 'user-1',
    name: null,
    vibe: 'flirty',
    tone: 'Sultry',
    languageMode: 'hinglish',
    pace: 'Slow',
    warmth: 7,
    memoryEnabled: true,
    autoSummary: true,
    sleepNudges: true,
    onboardedAt: null,
    updatedAt: new Date().toISOString(),
  }))) as never;
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

import { PREFS_CACHE_KEY } from '@/lib/prefs';
import { LunaConversation } from '@/components/luna-conversation';

describe('LunaConversation hydration-safe initial render', () => {
  it('does not read cached prefs for first render text', () => {
    window.localStorage.setItem(
      PREFS_CACHE_KEY,
      JSON.stringify({ vibe: 'flirty' }),
    );

    render(<LunaConversation brandName="luna" botName="Anaya" />);

    expect(screen.getByText('luna · tumhare saath')).toBeInTheDocument();
    expect(screen.queryByText('luna · flirty')).not.toBeInTheDocument();
  });

  it('shows starter lines as examples, not fake prompt buttons', () => {
    render(<LunaConversation brandName="luna" botName="Anaya" />);

    expect(
      screen.getByText('Words mushkil lag rahe hain toh yeh bolo'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Aaj din ajeeb tha' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('"Aaj din ajeeb tha"')).toBeInTheDocument();
  });

  it('shows a calm rate-limited notice — no upsell redirect', async () => {
    connect.mockRejectedValueOnce(Object.assign(new Error('rate limited'), {
      code: 'rate_limited',
    }));

    render(<LunaConversation brandName="luna" botName="Anaya" />);

    expect(await screen.findByText('Aaj ka time ho gaya.')).toBeInTheDocument();
    expect(
      screen.getByText('Kal phir baat karte hain — main yahin hoongi.'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Home par wapas' }));

    await waitFor(() => {
      expect(push).toHaveBeenCalledWith('/');
    });
  });

  it('lets the user close a conflicting previous session and retry', async () => {
    connect
      .mockRejectedValueOnce(Object.assign(new Error('session conflict'), {
        code: 'session_conflict',
        sessionId: 'session-active',
      }))
      .mockResolvedValueOnce(undefined);

    render(<LunaConversation brandName="luna" botName="Anaya" />);

    expect(await screen.findByText('Tumhari last call abhi close ho rahi hai.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Nayi call shuru karo' }));

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/session/session-active/end', {
        method: 'POST',
      });
      expect(connect).toHaveBeenCalledTimes(2);
    });
  });
});
