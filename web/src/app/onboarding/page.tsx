'use client';

// Luna onboarding — screen 02. One short step, skippable:
// name + language → /call. PATCHes /api/profile so the bot reads it on the
// next session/start. We only navigate forward once the server confirms;
// the localStorage cache mirrors the server's response so /call paints
// instantly with the right name/language even before the next fetch.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LunaOrb } from '@/components/luna-orb';
import { savePrefs, type LanguageMode } from '@/lib/prefs';
import { getAppCopy, localeForLanguageMode } from '@/lib/i18n';

const LANGUAGE_IDS: LanguageMode[] = ['hinglish', 'english', 'hindi'];

export default function OnboardingPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [languageMode, setLanguageMode] = useState<LanguageMode>('hinglish');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const appCopy = getAppCopy(localeForLanguageMode(languageMode));
  const copy = appCopy.onboarding;
  const commonCopy = appCopy.common;
  const safetyCopy = appCopy.safety;
  const languages = LANGUAGE_IDS.map((id) => {
    const language = copy.languages.find((item) => item.id === id);
    return language ?? getAppCopy().onboarding.languages.find((item) => item.id === id)!;
  });

  const finish = async (skip = false) => {
    setBusy(true);
    setError(null);
    try {
      await savePrefs({
        name: skip ? null : name.trim() || null,
        vibe: 'calm',
        languageMode,
        onboarded: true,
      });
      router.push('/call');
    } catch (err) {
      console.error('onboarding save failed', err);
      setError(copy.saveError);
      setBusy(false);
    }
  };

  return (
    <main className="screen fade-in">
      <section className="luna-onboard">
        <div className="luna-onboard__progress" aria-hidden>
          <span className="is-on" />
        </div>

        <div className="luna-onboard__orb">
          <LunaOrb size={140} state="idle" />
        </div>

        <h2 id="onboarding-name-title" className="luna-onboard__h">
          {copy.nameTitlePrefix} <em>{copy.nameTitleEmphasis}</em>?
        </h2>
        <p id="onboarding-name-help" className="luna-onboard__sub">
          {copy.nameHelp}
        </p>
        <input
          className="luna-input"
          aria-labelledby="onboarding-name-title"
          aria-describedby="onboarding-name-help"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={copy.namePlaceholder}
        />
        <div className="luna-vibe-grid luna-vibe-grid--tight">
          {languages.map((language) => (
            <button
              key={language.id}
              type="button"
              className={`luna-vibe ${languageMode === language.id ? 'is-on' : ''}`}
              onClick={() => setLanguageMode(language.id)}
            >
              <span className="luna-vibe__label">{language.label}</span>
              <span className="luna-vibe__sub">{language.sub}</span>
            </button>
          ))}
        </div>
        {error && <p className="luna-onboard__error">{error}</p>}
        <div className="luna-onboard__spacer" />
        <p className="luna-onboard__helper">{copy.helper}</p>
        <div className="luna-onboard__row">
          <button
            type="button"
            className="luna-btn-ghost luna-btn-ghost--compact"
            onClick={() => void finish(true)}
          disabled={busy}
        >
            {commonCopy.actions.skip}
          </button>
          <button
            type="button"
            className="luna-btn-primary luna-onboard__primary"
            disabled={!name.trim() || busy}
            onClick={() => void finish()}
          >
            {busy ? commonCopy.status.oneMoment : commonCopy.actions.startTalking}
          </button>
        </div>
        <p className="luna-onboard__safety-note">
          {copy.safetyNote}{' '}
          <Link href="/safety" className="luna-onboard__safety-link" target="_blank" rel="noopener noreferrer">
            {safetyCopy.linkLabel}
          </Link>
        </p>
      </section>
    </main>
  );
}
