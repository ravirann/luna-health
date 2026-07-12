import { describe, it, expect } from 'vitest';
import { prefsToPromptFragment } from '@/lib/prefs-server';

describe('prefsToPromptFragment', () => {
  it('emits NAME_KNOWN: false when name is null', () => {
    const out = prefsToPromptFragment({
      userId: 'u',
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
      updatedAt: new Date(),
    } as never);
    expect(out).toMatch(/NAME_KNOWN:\s*false/);
    expect(out).toMatch(/LANGUAGE_MODE:\s*hinglish/);
    expect(out).toMatch(/English sentence structure with natural Hindi words/);
  });

  it('emits NAME_KNOWN: true and the name when set', () => {
    const out = prefsToPromptFragment({
      userId: 'u',
      name: 'Aanya',
      vibe: 'flirty',
      tone: 'Sultry',
      languageMode: 'hindi',
      pace: 'Slow',
      warmth: 7,
      memoryEnabled: true,
      autoSummary: true,
      sleepNudges: true,
      onboardedAt: new Date(),
      updatedAt: new Date(),
    } as never);
    expect(out).toMatch(/NAME_KNOWN:\s*true/);
    expect(out).toMatch(/Aanya/);
    expect(out).toMatch(/Prefer Hindi/);
  });
});
