// Brand + bot identity, sourced from env so you can experiment without
// touching code. Read at module-load and used by:
//   - layout metadata (page title)
//   - top-nav wordmark
//   - splash wordmark + greeting context
//   - conversation top bar
//   - splash-copy LLM cache key
//   - bot system prompt (server/luna_bot/config.py reads its own env mirror)
//
// Defaults are brand-only. Override by setting BRAND_NAME / BOT_NAME /
// BOT_GENDER / TAGLINE — the SAME env names work on the Python bot side,
// see server/luna_bot/config.py BotConfig.

export type Gender = 'feminine' | 'masculine' | 'neutral';

function pickGender(raw: string | undefined): Gender {
  if (raw === 'masculine' || raw === 'male' || raw === 'm') return 'masculine';
  if (raw === 'neutral' || raw === 'enby' || raw === 'nb') return 'neutral';
  return 'feminine';
}

function pickFirst(...values: (string | undefined)[]): string | undefined {
  for (const v of values) {
    const t = (v ?? '').trim();
    if (t) return t;
  }
  return undefined;
}

export type BrandConfig = {
  /** Lowercase brand wordmark, e.g. "luna". */
  brandName: string;
  /** Human-readable bot name. Falls back to brandName when BOT_NAME is unset. */
  botName: string;
  /** Pronoun/grammar register for the bot. Drives the bot's prompt + UI copy. */
  botGender: Gender;
  /** Tagline used in <title> / SEO description. */
  tagline: string;
};

/** Read on the server. The same env names (BRAND_NAME / BOT_NAME /
 *  BOT_GENDER / TAGLINE) work identically here and in server/luna_bot/config.py — keep
 *  it that way when adding new identity fields. */
export function readBrandFromEnv(): BrandConfig {
  const brandName =
    pickFirst(process.env.BRAND_NAME, process.env.NEXT_PUBLIC_BRAND_NAME) ??
    'luna';
  const botName =
    pickFirst(process.env.BOT_NAME, process.env.NEXT_PUBLIC_BOT_NAME) ??
    brandName;
  const botGender = pickGender(pickFirst(process.env.BOT_GENDER));
  const tagline =
    pickFirst(process.env.TAGLINE) ?? 'someone’s here to listen';
  return { brandName, botName, botGender, tagline };
}
