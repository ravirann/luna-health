import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/prefs', () => ({
  fetchPrefs: vi.fn(async () => ({})),
  readCachedPrefsOrDefault: () => ({}),
}));
vi.mock('@/components/luna-orb', () => ({
  LunaOrb: () => <div data-testid="orb" />,
}));

beforeEach(() => {
  push.mockClear();
  global.fetch = vi.fn(async (input: RequestInfo) => {
    if (typeof input === 'string' && input.endsWith('/api/session/start')) {
      return new Response(JSON.stringify({ status: 'soft_gate', reason: 'rate_limited' }));
    }
    return new Response('{}');
  }) as never;
});
afterEach(() => cleanup());

import { LunaSplash } from '@/components/luna-splash';
import { appCopy } from '@/lib/i18n';

describe('LunaSplash soft-gate overlay', () => {
  it('shows a calm rate-limited notice over the splash on soft_gate (no nav)', async () => {
    render(
      <LunaSplash signedIn={false} brandName="Luna" headline="Hi" subtitle="now" />,
    );
    fireEvent.click(screen.getByLabelText('Start talking'));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
    expect(screen.getByText(appCopy.en.rateLimit.headline)).toBeInTheDocument();
    expect(screen.getByText(appCopy.en.rateLimit.subtext)).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('dismisses on Okay without navigating anywhere — there is nothing to buy', async () => {
    render(
      <LunaSplash signedIn={false} brandName="Luna" headline="Hi" subtitle="now" />,
    );
    fireEvent.click(screen.getByLabelText('Start talking'));
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: appCopy.en.common.actions.okay }));

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });
});
