import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import OnboardingPage from '@/app/onboarding/page';
import { PreferencesPanel } from '@/components/preferences-panel';
import { DEFAULT_PREFS } from '@/lib/prefs';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  savePrefs: vi.fn(),
  fetchPrefs: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
  usePathname: () => '/onboarding',
}));

vi.mock('@/components/luna-orb', () => ({
  LunaOrb: () => <div data-testid="orb-mock" />,
}));

vi.mock('@/lib/prefs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/prefs')>();
  return {
    ...actual,
    applyMood: vi.fn(),
    fetchPrefs: mocks.fetchPrefs,
    readCachedPrefsOrDefault: () => actual.DEFAULT_PREFS,
    readMood: () => 'blue',
    savePrefs: mocks.savePrefs,
    writeMood: vi.fn(),
  };
});

beforeEach(() => {
  mocks.push.mockClear();
  mocks.savePrefs.mockReset();
  mocks.savePrefs.mockResolvedValue(DEFAULT_PREFS);
  mocks.fetchPrefs.mockReset();
  mocks.fetchPrefs.mockResolvedValue(DEFAULT_PREFS);
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe('page accessibility semantics', () => {
  it('programmatically labels the onboarding name field', () => {
    render(<OnboardingPage />);

    expect(
      screen.getByRole('textbox', { name: /main tumhe kya bulaun/i }),
    ).toBeInTheDocument();
  });

  it('programmatically labels the profile preference name field', () => {
    render(<PreferencesPanel />);

    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument();
  });
});
