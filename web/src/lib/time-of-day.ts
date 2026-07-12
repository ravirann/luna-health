// Luna AI — time-of-day helper used by both /profile cards and the
// landing page hero. Single source of truth: change a bucket here and
// every consumer follows.
//
// All bucketing is computed in IST (Asia/Kolkata) regardless of the
// server's TZ, so a Vercel container in a US region still labels evenings
// correctly for an Indian user.

const IST_TZ = 'Asia/Kolkata';

export type Bucket =
  | 'morning'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'late_night';

export function bucketFor(d: Date = new Date()): Bucket {
  const h = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: IST_TZ,
      hour: '2-digit',
      hour12: false,
    }).format(d),
  );
  if (h >= 5 && h < 11) return 'morning';
  if (h >= 11 && h < 16) return 'afternoon';
  if (h >= 16 && h < 20) return 'evening';
  if (h >= 20) return 'night';
  return 'late_night';
}

/** Returns the UTC instant of the most recent IST midnight (00:00
 *  Asia/Kolkata) at or before `d`. Used to bound "today" queries — e.g.
 *  the daily usage cap in lib/limits.ts — consistently with the rest of
 *  the IST bucketing in this file, instead of `new Date().getHours()`
 *  (which follows the server's TZ, not the user's). IST has no DST and a
 *  fixed +05:30 offset, so this is a plain, cheap Intl format + reparse. */
export function istDayStart(d: Date = new Date()): Date {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const y = parts.find((p) => p.type === 'year')!.value;
  const m = parts.find((p) => p.type === 'month')!.value;
  const day = parts.find((p) => p.type === 'day')!.value;
  return new Date(`${y}-${m}-${day}T00:00:00+05:30`);
}

/** Hue mapping shared with /profile cards so the page's mood is consistent. */
export const BUCKET_HUE: Record<Bucket, { hue: string; hue2: string }> = {
  morning:    { hue: '#F0C2A8', hue2: '#D89CB3' },  // peach → rose
  afternoon:  { hue: '#B39BE8', hue2: '#7A6FD6' },  // wisteria → iris (Luna default)
  evening:    { hue: '#D89CB3', hue2: '#7A6FD6' },  // rose → iris
  night:      { hue: '#7A6FD6', hue2: '#3A3268' },  // iris → deep
  late_night: { hue: '#9DCFE8', hue2: '#7A6FD6' },  // mist → iris
};

/** Landing-page hero copy, chosen per bucket. Keep these short — the H1
 *  carries the entire emotional weight; chrome around it stays the same. */
export type LandingHero = {
  /** Eyebrow above the H1. */
  eyebrow: string;
  /** First half of the H1 — leads, not emphasised. */
  greeting: string;
  /** Second half — italic-emphasised, the line that sticks. */
  emphasis: string;
  /** Sub-line under the H1 — Hindi-leaning question to the user. */
  followup: string;
  /** Lede paragraph below the H1. */
  lede: string;
};

export const LANDING_HERO: Record<Bucket, LandingHero> = {
  morning: {
    eyebrow: '01 / Subah ka saath',
    greeting: 'Subah ho gayi.',
    emphasis: 'Main yahin hoon.',
    followup: 'Tum kaisi ho?',
    lede:
      'No sign-up. Mic ready. Luna starts talking the moment you land — ' +
      'Hinglish, unhurried, judgment-free. First three minutes are on us.',
  },
  afternoon: {
    eyebrow: '01 / A voice in the middle of your day',
    greeting: 'Hey.',
    emphasis: 'Bata na.',
    followup: 'Dopahar kaisi ja rahi hai?',
    lede:
      'No sign-up. Mic ready. Take a five-minute break and just talk — ' +
      'Hinglish, unhurried, judgment-free. First three minutes are on us.',
  },
  evening: {
    eyebrow: '01 / A voice on the other end',
    greeting: 'Hey.',
    emphasis: 'I\u2019m here.',
    followup: 'Aaj ki shaam kaisi rahi?',
    lede:
      'No sign-up. Mic ready. Luna starts talking the moment you land — ' +
      'Hinglish, unhurried, judgment-free. First three minutes are on us.',
  },
  night: {
    eyebrow: '01 / Raat ka saath',
    greeting: 'Hey.',
    emphasis: 'Main jaag rahi hoon.',
    followup: 'Tum kaisi feel kar rahi ho?',
    lede:
      'Din khatam. Luna is on the line, no rush, no judgment. ' +
      'First three minutes are on us.',
  },
  late_night: {
    eyebrow: '01 / Aakhri pehar',
    greeting: 'Hey.',
    emphasis: 'Late, na?',
    followup: 'Main bhi yahan hoon. Bolo.',
    lede:
      'Aadhi raat ka saath. No sign-up, no hurry, no judgment — ' +
      'just a voice on the other end. First three minutes are on us.',
  },
};
