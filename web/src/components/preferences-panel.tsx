'use client';

// Inline Preferences panel — release-safe controls embedded inside /profile.
// Voice/personality/memory behavior knobs are pinned server-side for launch.
//
// Source of truth is the server (user_prefs). Boots from the localStorage
// cache, reconciles via /api/profile, PATCHes optimistically.
//
// Mood is the only field that stays local — it's a UI-only palette.

import { useEffect, useRef, useState } from 'react';
import {
  applyMood,
  readMood,
  writeMood,
  readCachedPrefsOrDefault,
  fetchPrefs,
  savePrefs,
  type LunaServerPrefs,
  type LanguageMode,
  type Mood,
} from '@/lib/prefs';
import { getAppCopy, localeForLanguageMode } from '@/lib/i18n';

const THEME_IDS: Mood[] = ['blue', 'rose', 'purple', 'amber'];
const LANGUAGE_IDS: LanguageMode[] = ['hinglish', 'english', 'hindi'];

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export function PreferencesPanel() {
  const [prefs, setPrefs] = useState<LunaServerPrefs>(() =>
    readCachedPrefsOrDefault(),
  );
  const [mood, setMoodState] = useState<Mood>(() => readMood());
  const [save, setSave] = useState<SaveState>('idle');
  const [hydrated, setHydrated] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appCopy = getAppCopy(localeForLanguageMode(prefs.languageMode));
  const copy = appCopy.preferences;
  const commonCopy = appCopy.common;
  const themes = THEME_IDS.map((id) => ({ id, label: copy.themes[id] }));
  const languages = LANGUAGE_IDS.map((id) => ({ id, label: copy.languages[id] }));

  useEffect(() => {
    let alive = true;
    fetchPrefs()
      .then((server) => {
        if (!alive) return;
        setPrefs(server);
        setHydrated(true);
      })
      .catch(() => {
        if (!alive) return;
        setHydrated(true);
        setSave('error');
      });
    return () => {
      alive = false;
      if (savedTimer.current) clearTimeout(savedTimer.current);
    };
  }, []);

  const update = <K extends keyof LunaServerPrefs>(
    k: K,
    v: LunaServerPrefs[K],
  ) => {
    setPrefs((prev) => ({ ...prev, [k]: v }));
    setSave('saving');
    savePrefs({ [k]: v } as Partial<LunaServerPrefs>)
      .then((server) => {
        setPrefs(server);
        setSave('saved');
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSave('idle'), 1400);
      })
      .catch(() => setSave('error'));
  };

  const setMood = (m: Mood) => {
    applyMood(m);
    writeMood(m);
    setMoodState(m);
  };

  return (
    <div className="luna-settings__body luna-settings__body--inline">
      <div className="luna-settings__inline-head">
        <span className="luna-settings__inline-sub">
          {hydrated ? copy.makeThisYours : commonCopy.status.oneMoment}
        </span>
        <span
          className={`luna-saved ${save}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {save === 'saving'
            ? commonCopy.status.saving
            : save === 'saved'
              ? commonCopy.status.saved
              : save === 'error'
                ? commonCopy.status.couldNotSave
                : ''}
        </span>
      </div>

      <SectionLabel>{copy.theme}</SectionLabel>
      <div className="luna-theme-grid">
        {themes.map((th) => (
          <button
            key={th.id}
            type="button"
            className={`luna-theme ${mood === th.id ? 'is-on' : ''}`}
            onClick={() => setMood(th.id)}
          >
            <span className={`luna-theme__sw luna-theme__sw--${th.id}`} />
            <span>{th.label}</span>
          </button>
        ))}
      </div>

      <SectionLabel top>{copy.identity}</SectionLabel>
      <div className="luna-seg">
        <div id="profile-name-label" className="luna-seg__label">{copy.name}</div>
        <input
          className="luna-input luna-input--compact"
          aria-labelledby="profile-name-label"
          placeholder={copy.namePlaceholder}
          value={prefs.name ?? ''}
          onChange={(e) => update('name', e.target.value || null)}
        />
      </div>

      <SectionLabel top>{copy.language}</SectionLabel>
      <SegmentedRow
        label={copy.conversation}
        value={prefs.languageMode}
        options={languages}
        onChange={(v) => update('languageMode', v as LanguageMode)}
      />
    </div>
  );
}

function SectionLabel({
  children,
  top,
}: {
  children: React.ReactNode;
  top?: boolean;
}) {
  return (
    <div className={`luna-settings__section ${top ? 'is-top' : ''}`}>
      {children}
    </div>
  );
}

function SegmentedRow<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="luna-seg">
      <div className="luna-seg__label">{label}</div>
      <div className="luna-seg__row">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            className={value === option.id ? 'is-on' : ''}
            onClick={() => onChange(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
