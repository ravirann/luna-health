// Shared helpers for deriving a soft, human session title from reflection
// facts. Used by /profile (recent grid) and /profile/history/[id]
// (detail header) so both surfaces speak the same language.

import { bucketFor } from '@/lib/time-of-day';
import type { Bucket } from '@/lib/time-of-day';

export const SHORT_SESSION_SECS = 10;

export type Facts = {
  themes?: unknown;
  mood?: unknown;
  unresolved?: unknown;
  mentioned_people?: unknown;
};

export const BUCKET_FALLBACKS: Record<Bucket, string[]> = {
  morning: [
    'A quiet check-in',
    'Easing into the day',
    'Morning thoughts',
    'A gentle start',
    'Waking up slow',
    'Just talking for a bit',
  ],
  afternoon: [
    'A quick catch-up',
    'A small pause',
    'A midday breath',
    'Stealing a moment',
    'A quiet check-in',
    'Just talking for a bit',
  ],
  evening: [
    'Winding down',
    'Trying to settle',
    'Ending the day',
    'Slowing down',
    'A quiet evening',
    'Letting go of the day',
  ],
  night: [
    'Late night thoughts',
    'Mind wouldn’t settle',
    'Still thinking',
    'Couldn’t switch off',
    'A restless night',
    'Quiet hours',
  ],
  late_night: [
    'Couldn’t sleep',
    'A restless night',
    'Mind wouldn’t settle',
    'Still up',
    'Late night thoughts',
    'Quiet hours',
  ],
};

export function asStringArray(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
}

export function asString(v: unknown): string | null {
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null;
}

export function trimWords(s: string, max = 6): string {
  const words = s.split(/\s+/).slice(0, max).join(' ');
  return words.replace(/[.!?,;:]+$/g, '');
}

export function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export function reflectionTitle(
  facts: Facts | null,
  sceneId: string | null,
  durationSecs: number | null,
): string | null {
  if (durationSecs !== null && durationSecs > 0 && durationSecs < SHORT_SESSION_SECS) {
    return 'Quick check-in';
  }
  if (facts) {
    const themes = asStringArray(facts.themes);
    if (themes.length) return `Talking about ${lowerFirst(trimWords(themes[0], 4))}`;
    const unresolved = asString(facts.unresolved);
    if (unresolved) return trimWords(unresolved, 6);
    const mood = asString(facts.mood);
    if (mood) return `Feeling ${lowerFirst(trimWords(mood, 3))}`;
  }
  if (sceneId) {
    return sceneId
      .split('-')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');
  }
  return null;
}

export function pickFallbackTitle(bucket: Bucket, recentTitles: Set<string>): string {
  const pool = BUCKET_FALLBACKS[bucket];
  for (const opt of pool) {
    if (!recentTitles.has(opt)) return opt;
  }
  return pool[0];
}

// Soft "X minutes together" — used in places that want a warm framing,
// not a stopwatch. Returns empty string for null/zero so callers can
// hide the line entirely.
export function fmtTogether(secs: number | null): string {
  if (!secs || secs <= 0) return '';
  if (secs < 60) return `${secs} seconds together`;
  const m = Math.round(secs / 60);
  return m === 1 ? '1 minute together' : `${m} minutes together`;
}

// One-line summary for timeline rows. Returns null when nothing
// meaningful is available — caller should omit the line entirely.
export function buildLineSummary(
  facts: Facts | null,
  freeText: string | null,
): string | null {
  if (facts) {
    const themes = asStringArray(facts.themes);
    const mood = asString(facts.mood);
    if (themes.length) {
      return `Talked about ${lowerFirst(trimWords(themes[0], 8))}.`;
    }
    if (mood) {
      return `You were feeling ${lowerFirst(trimWords(mood, 4))}.`;
    }
  }
  if (freeText && freeText.trim().length > 0) {
    const firstSentence = freeText.split(/(?<=[.!?])\s+/)[0] ?? freeText;
    return trimWords(firstSentence.trim(), 16) + (firstSentence.length > 100 ? '…' : '');
  }
  return null;
}

// Title for a session detail page — uses reflection if present, else a
// time-bucket fallback. Single-call site so we don't need title rotation.
export function detailTitle(
  facts: Facts | null,
  sceneId: string | null,
  durationSecs: number | null,
  startedAt: Date,
): string {
  return (
    reflectionTitle(facts, sceneId, durationSecs) ??
    pickFallbackTitle(bucketFor(startedAt), new Set())
  );
}
