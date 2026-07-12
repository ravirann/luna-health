import { describe, expect, it } from 'vitest';
import {
  appCopy,
  type AppCopy,
  defaultLocale,
  getAppCopy,
  interpolate,
  localeForLanguageMode,
  supportedLocales,
} from '@/lib/i18n';

function flattenCopy(value: AppCopy | readonly unknown[] | object | string): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => flattenCopy(item as object | string));
  return Object.values(value).flatMap((item) => flattenCopy(item as object | string));
}

describe('app i18n copy catalog', () => {
  it('exposes English as the default editable app copy catalog', () => {
    expect(defaultLocale).toBe('en');
    expect(appCopy.en.rateLimit.headline).toBe('That’s today’s limit.');
    expect(appCopy.en.onboarding.nameTitle).toContain('call you');
  });

  it('keeps locale catalogs available with translated headline copy', () => {
    expect(supportedLocales).toEqual(['en', 'hinglish', 'hi']);
    expect(getAppCopy('hinglish').common.actions.startTalking).toBe('Talk shuru karo');
    expect(getAppCopy('hi').common.actions.startTalking).toBe('बात शुरू करें');
    expect(getAppCopy('hinglish').rateLimit.headline).not.toBe(
      appCopy.en.rateLimit.headline,
    );
    expect(getAppCopy('hi').rateLimit.headline).not.toBe(
      appCopy.en.rateLimit.headline,
    );
  });

  it('maps saved conversation language modes to app locales', () => {
    expect(localeForLanguageMode('english')).toBe('en');
    expect(localeForLanguageMode('hinglish')).toBe('hinglish');
    expect(localeForLanguageMode('hindi')).toBe('hi');
    expect(localeForLanguageMode(undefined)).toBe('en');
  });

  it('falls back to English for unknown locale input', () => {
    expect(getAppCopy('fr').common.actions.maybeLater).toBe(
      appCopy.en.common.actions.maybeLater,
    );
  });

  it('interpolates named values in catalog strings', () => {
    expect(
      interpolate(appCopy.en.profile.lifetimeTogether, {
        minutes: 12,
      }),
    ).toBe('We’ve spent 12 minutes together');
  });

  it('keeps Hinglish and Hindi copy natural without awkward half-translations', () => {
    const hinglishCopy = flattenCopy(appCopy.hinglish).join('\n');
    const hindiCopy = flattenCopy(appCopy.hi).join('\n');

    expect(hinglishCopy).not.toMatch(/achha laga (is morning|today|tonight)/);
    expect(hinglishCopy).not.toContain('Connection quiet ho gaya');
    expect(hinglishCopy).not.toContain('Is week pehle');
    expect(hindiCopy).not.toContain('Connection शांत हो गया');
    expect(hindiCopy).not.toContain('कुछ शांत हो गया');
    expect(hindiCopy).not.toContain('Clear summary');
  });
});
