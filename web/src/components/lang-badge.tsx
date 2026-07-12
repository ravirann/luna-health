import type { LanguageMode } from '@/lib/prefs';
import { getAppCopy, localeForLanguageMode } from '@/lib/i18n';

export function LangBadge({
  languageMode = 'hinglish',
}: {
  languageMode?: LanguageMode;
}) {
  const labels = getAppCopy(localeForLanguageMode(languageMode)).preferences.languages;
  return (
    <div className="lang-badge">
      <span className="dot" /> {labels[languageMode] ?? labels.hinglish}
    </div>
  );
}
