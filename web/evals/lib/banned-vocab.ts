// Encoded banned vocabulary from DESIGN.md §2 (the source of truth).
//
// This is the cheapest, most reliable kind of eval: a rule you can express in
// code. Any user-facing generated copy is graded against it — zero tolerance.
// If you edit DESIGN.md §2, edit this list to match.

export type BannedRule = {
  /** Case-insensitive matcher. Word boundaries are used for common words so
   *  "agent" matches "agent" but not "agentic" (and not e.g. "both" for bot). */
  pattern: RegExp;
  /** Short label shown in eval output. */
  label: string;
  /** Why it's banned — mirrors the DESIGN.md reason column. */
  reason: string;
};

// Apostrophes vary (' vs ’) in generated copy, so phrases allow either.
const APOS = "['’]";

export const BANNED_RULES: BannedRule[] = [
  { pattern: /\bAI girlfriend\b/i, label: 'AI girlfriend', reason: 'Wrong category — not a dating product.' },
  { pattern: /\bvirtual partner\b/i, label: 'virtual partner', reason: 'Wrong category — not a dating product.' },
  { pattern: /\bbot\b/i, label: 'bot', reason: 'Robotic — we are a presence.' },
  { pattern: /\bassistant\b/i, label: 'assistant', reason: 'Robotic — we are a presence.' },
  { pattern: /\bagent\b/i, label: 'agent', reason: 'Robotic — we are a presence.' },
  { pattern: /\bjourney\b/i, label: 'journey', reason: 'SaaS marketing rot.' },
  { pattern: /\bunlock your potential\b/i, label: 'unlock your potential', reason: 'SaaS marketing rot.' },
  { pattern: /\bvibe\b/i, label: 'vibe', reason: 'Permitted only in the prefs schema, never user-facing.' },
  { pattern: /\bget started\b/i, label: 'Get started', reason: 'Generic / category-wrong CTA.' },
  { pattern: new RegExp(`\\bbegin your journey\\b`, 'i'), label: 'Begin your journey', reason: 'Generic / category-wrong CTA.' },
  { pattern: /\bchat now\b/i, label: 'Chat now', reason: 'Generic / category-wrong CTA.' },
  { pattern: /\btalk to AI\b/i, label: 'Talk to AI', reason: 'Generic / category-wrong CTA.' },
  { pattern: new RegExp(`\\bshe${APOS}s waiting\\b`, 'i'), label: "She's waiting", reason: 'Manipulative — implies dependency or loss; banned everywhere in user-facing copy.' },
  { pattern: new RegExp(`\\bdon${APOS}t leave her\\b`, 'i'), label: "Don't leave her", reason: 'Manipulative — implies dependency or loss; banned everywhere in user-facing copy.' },
  { pattern: /\bcompanion misses you\b/i, label: 'companion misses you', reason: 'Manipulative — implies dependency or loss; banned everywhere in user-facing copy.' },
  { pattern: /\bloading\b/i, label: 'Loading', reason: 'Dashboard language. Use "One moment…".' },
  { pattern: /\bprocessing\b/i, label: 'Processing', reason: 'Dashboard language. Use "One moment…".' },
  { pattern: /\binitializing\b/i, label: 'Initializing', reason: 'Dashboard language. Use "One moment…".' },
  { pattern: /\bretry\b/i, label: 'Retry', reason: 'Dashboard language. Use "Try again".' },
  { pattern: /\bsultry\b/i, label: 'sultry', reason: 'Wrong tone for a calm product.' },
  { pattern: /\benergetic\b/i, label: 'energetic', reason: 'Wrong tone for a calm product.' },
  // Therapy / clinical language (heuristic — extend as you find leaks).
  { pattern: /\b(therapy|therapist|clinical|diagnos\w+|mental health|wellness)\b/i, label: 'clinical language', reason: 'We are not a wellness/therapy app.' },
];

/** Return the labels of every banned rule the text trips. Empty = clean. */
export function findBannedPhrases(text: string): string[] {
  const hits: string[] = [];
  for (const rule of BANNED_RULES) {
    if (rule.pattern.test(text)) hits.push(rule.label);
  }
  return hits;
}
