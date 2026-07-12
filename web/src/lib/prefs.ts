// Luna client-side preferences.
//
// Source of truth is the server (user_prefs table behind /api/profile).
// We mirror the response in localStorage so the next page paint can show
// the user's settings without an extra round-trip — but localStorage is
// a cache, not the home of the data. Mood is the one exception: it
// affects only the UI palette so it lives entirely in localStorage and
// is read by the boot script in layout.tsx before paint.

export type Mood = 'blue' | 'rose' | 'purple' | 'amber';
export type Vibe = 'calm' | 'friendly' | 'playful' | 'flirty';
export type Tone = 'Soft' | 'Warm' | 'Energetic' | 'Sultry';
export type Pace = 'Slow' | 'Natural' | 'Brisk';
export type LanguageMode = 'english' | 'hinglish' | 'hindi';

/** Mirror of the server's user_prefs row (minus row metadata). */
export type LunaServerPrefs = {
  name: string | null;
  vibe: Vibe;
  tone: Tone;
  languageMode: LanguageMode;
  pace: Pace;
  warmth: number;
  memoryEnabled: boolean;
  autoSummary: boolean;
  sleepNudges: boolean;
  onboardedAt: string | null;
};

export const DEFAULT_PREFS: LunaServerPrefs = {
  name: null,
  vibe: 'calm',
  tone: 'Warm',
  languageMode: 'hinglish',
  pace: 'Slow',
  warmth: 7,
  memoryEnabled: true,
  autoSummary: true,
  sleepNudges: true,
  onboardedAt: null,
};

export const PREFS_CACHE_KEY = 'luna:prefs';
export const MOOD_KEY = 'luna:mood';

// ─── localStorage cache ────────────────────────────────────────────────
function readCachedPrefs(): LunaServerPrefs | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFS_CACHE_KEY);
    if (!raw) return null;
    return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    return null;
  }
}

function writeCachedPrefs(p: LunaServerPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(PREFS_CACHE_KEY, JSON.stringify(p));
  } catch {
    /* localStorage full or disabled */
  }
}

// ─── Server round-trip ────────────────────────────────────────────────
type ApiRow = LunaServerPrefs & { userId: string; updatedAt: string };

function strip(row: ApiRow): LunaServerPrefs {
  return {
    name: row.name ?? null,
    vibe: row.vibe,
    tone: row.tone,
    languageMode: row.languageMode,
    pace: row.pace,
    warmth: row.warmth,
    memoryEnabled: row.memoryEnabled,
    autoSummary: row.autoSummary,
    sleepNudges: row.sleepNudges,
    onboardedAt: row.onboardedAt ?? null,
  };
}

/** Optimistic read: returns the cached row immediately if present, then
 *  refreshes from /api/profile and calls the second callback when the
 *  server confirms (or differs). */
export async function fetchPrefs(): Promise<LunaServerPrefs> {
  const res = await fetch('/api/profile', { cache: 'no-store' });
  if (res.status === 401) {
    // Not signed in — fall back to cache + defaults so the UI still works.
    return readCachedPrefs() ?? DEFAULT_PREFS;
  }
  if (!res.ok) {
    throw new Error(`profile fetch failed: ${res.status}`);
  }
  const row = (await res.json()) as ApiRow;
  const next = strip(row);
  writeCachedPrefs(next);
  return next;
}

export type PrefsPatch = Partial<
  Omit<LunaServerPrefs, 'onboardedAt'>
> & { onboarded?: boolean };

/** Persist a partial patch. Returns the updated row from the server. */
export async function savePrefs(patch: PrefsPatch): Promise<LunaServerPrefs> {
  const res = await fetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(`profile save failed: ${res.status}`);
  }
  const row = (await res.json()) as ApiRow;
  const next = strip(row);
  writeCachedPrefs(next);
  return next;
}

/** Synchronous read of the localStorage cache. Useful for SSR-safe initial
 *  state — pair with `fetchPrefs()` in a useEffect to refresh from server. */
export function readCachedPrefsOrDefault(): LunaServerPrefs {
  return readCachedPrefs() ?? DEFAULT_PREFS;
}

// ─── Mood (UI-only, local) ────────────────────────────────────────────
export function readMood(): Mood {
  if (typeof window === 'undefined') return 'blue';
  try {
    const m = window.localStorage.getItem(MOOD_KEY);
    if (m === 'blue' || m === 'rose' || m === 'purple' || m === 'amber') {
      return m;
    }
  } catch {
    /* ignore */
  }
  return 'blue';
}

export function writeMood(mood: Mood): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(MOOD_KEY, mood);
  } catch {
    /* ignore */
  }
  applyMood(mood);
}

/** Mirror the chosen mood onto <html data-mood>. Safe before hydration. */
export function applyMood(mood: Mood): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-mood', mood);
}
