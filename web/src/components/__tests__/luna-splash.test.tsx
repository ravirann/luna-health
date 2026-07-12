import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, screen, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { LunaSplash } from '@/components/luna-splash';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));
vi.mock('@/lib/prefs', () => ({
  fetchPrefs: vi.fn(async () => ({ onboardedAt: null })),
  readCachedPrefsOrDefault: () => ({ onboardedAt: null }),
}));
// LunaOrb uses canvas which jsdom doesn't implement — mock it out.
vi.mock('@/components/luna-orb', () => ({
  LunaOrb: () => <div data-testid="orb-mock" />,
}));

beforeEach(() => {
  push.mockClear();
  // Mock fetch to return ok so handleStart falls through to router.push('/call').
  global.fetch = vi.fn(async () =>
    new Response(JSON.stringify({ status: 'ok' })),
  ) as never;
});

afterEach(() => {
  cleanup();
});

describe('LunaSplash routing', () => {
  it('routes guests directly to /call (no /sign-in)', async () => {
    render(
      <LunaSplash
        signedIn={false}
        brandName="Luna"
        headline="Hello"
        subtitle="World"
      />,
    );
    fireEvent.click(screen.getByLabelText('Start talking'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/call'));
    expect(global.fetch).toHaveBeenCalledWith(
      '/api/session/start',
      expect.objectContaining({
        body: JSON.stringify({ preflight: true }),
      }),
    );
  });

  it('routes signed-in users to /call (no /onboarding gate)', async () => {
    render(
      <LunaSplash
        signedIn={true}
        brandName="Luna"
        headline="Hello"
        subtitle="World"
      />,
    );
    fireEvent.click(screen.getByLabelText('Start talking'));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/call'));
  });
});
