# Luna — Design System & Copy Guide

This is the source of truth for how Luna looks, feels, and speaks. It is the
distillation of every design decision and copy refinement made during
development. When in doubt, read this before adding a screen, component,
string, or color.

---

## 1. Product Intent

Luna is a voice-first companion for **calm, late-night conversations**. The
app should feel like a soft presence the user can talk to — restless,
lonely, reflective, or just wanting company.

**The app should feel like:**
- Someone is here
- The user can talk or stay quiet
- The experience is private
- Memory is gentle, not surveillance
- The user is always in control

**The app must NOT feel like:**
- A dashboard
- A therapy app
- A dating app / "AI girlfriend"
- A chatbot or assistant
- A billing meter
- A productivity tool

---

## 2. Voice & Tone

**Core register:** soft · human · calm · emotionally aware · minimal ·
slightly intimate (never explicit) · premium (never cute) · conversational
(never marketing-heavy).

**Banned vocabulary** — never write any of these:

| Banned | Reason |
| --- | --- |
| "AI girlfriend", "virtual partner" | Wrong category. We are not a dating product. |
| "bot", "assistant", "agent" | Robotic. We are a presence. |
| "journey", "unlock your potential" | SaaS marketing rot. |
| "vibe" (in copy) | Permitted only in the existing onboarding "vibe" prefs schema. Never user-facing. |
| "Get started", "Begin your journey", "Chat now", "Talk to AI" | Generic / category-wrong CTAs. |
| "She's waiting", "Don't leave her", "Your companion misses you" | Manipulative — never imply the AI misses or needs the user. |
| "Loading", "Processing", "Initializing", "Retry" | Dashboard language. Use "One moment…" / "Try again". |
| "sultry", "energetic" voice descriptors | Wrong tone for a calm product. |
| Therapy or clinical language | We are not a wellness app. See the exemption below for the one place this inverts. |

**Exemption — safety copy.** Crisis resources, non-diagnostic disclaimers,
and the `/safety` page may use plain clinical-adjacent words — "therapist,"
"crisis," "professional support" — where clarity requires it. Precision
matters more than tone in that one context. Everywhere else, the banned
list above stands with no exceptions.

**Preferred vocabulary:** *talk · listen · stay · quiet · tonight ·
whenever you want · you're in control · we can take this slowly.*

### Microcopy rules
1. Headlines are 2–7 words. Most are 2–4.
2. Prefer emotional clarity over cleverness.
3. Speak like a person, not a product. No feature explanations.
4. Copy about session or daily usage limits is calm, low-pressure, never
   manipulative — there's no monetization to soften, but the same
   restraint applies.
5. Privacy and memory copy reassures the user.
6. The app is present, not clingy. Never desperate, possessive, or dependent.
7. When the AI speaks ("I'll remember…", "I'm here"), it speaks in
   first-person singular. Never "we", never "Luna" in copy directed at the user.

---

## 3. Time-of-Day System

Time of day drives copy across multiple surfaces. Two helpers exist —
**use these, do not roll your own:**

### `lib/splash-copy.ts` — server-side, IST-anchored, 5 buckets
Used by the splash hero. Each bucket has a hand-written fallback and an
LLM-generated cached variant in the `splash_copy` table (24h TTL).

| Bucket | Hours (IST) | Fallback headline |
| --- | --- | --- |
| `morning` | 05:00–10:59 | "Morning already?" |
| `evening` | 11:00–21:59 | "Long day?" |
| `late_night` | 22:00–00:59 | "Couldn't sleep?" |
| `midnight` | 01:00–02:59 | "It's one of those nights?" |
| `predawn` | 03:00–04:59 | "Still awake…" |

Subtitle is "Talk about anything. Or just stay for the quiet." across most
buckets; predawn switches to "You don't have to be alone right now."

### `lib/time-of-day.ts` — client + server, IST, 5 buckets
Used by `/profile` (greeting prompt), session-end farewell, and recent-call
hue. Different bucket boundaries from `splash-copy.ts` because the surfaces
have different needs — keep them in sync only when intentional.

| Bucket | Hours (IST) | Profile prompt | Farewell heading |
| --- | --- | --- | --- |
| `morning` | 05–11 | "How are you feeling today?" | "I liked talking to you this morning." |
| `afternoon` | 11–16 | "How's your day going?" | "I liked talking to you today." |
| `evening` | 16–20 | "How was your day?" | "I liked talking to you tonight." |
| `night` | 20–04+ | "What's on your mind tonight?" | "I liked talking to you tonight." |
| `late_night` | (alias) | "Still here with the quiet?" | (sleep well closer) |

The session-end card has a separate `getDaypart()` (luna-conversation.tsx)
that drives the four-variant farewell + dismiss-button copy.

---

## 4. Surfaces — copy spec

### `/` — Splash
- Wordmark: brand name from `BRAND_NAME` env. Never hardcode "Luna".
- Hero: time-of-day headline (italic first word) + subtitle.
- CTA: tap-mic-orb. Caption: **"Start talking · 10 min free"**.

### `/onboarding` — two skippable steps
- Step 1: "What should I *call you*?" / "First name, nickname, anything you like."
- Step 2: "How do you want this to *feel*?" / "I'll match your mood."
  - Vibes (id : label : sub):
    - `calm` → "quiet, steady, unhurried"
    - `friendly` → "easy, open, just talking"
    - `playful` → "light, a little fun"
    - `flirty` → "warm… with a hint of mischief"
- Helper: "You can change this anytime."
- Primary CTA: "Start talking". Saving: "One moment…".

### `/call` — live conversation
- Top bar: brand + vibe label + `mm:ss · free session` (turns warn-color when ≤30s).
- State labels (`stateLabel()` in luna-conversation.tsx):
  - connecting → "getting ready…"
  - ready / idle → "I'm here"
  - listening → "listening…"
  - speaking → "speaking…"
  - ended → "session ended"
- Chips (only when transcript empty): "I had a weird day", "Can we just hang out?", "I miss someone", "Tell me a story".
- Controls: 48px circular gear · 84px radial-gradient mic · 48px circular X. **Never stretch to ovals** (see §6 known fixes).

### Session-end card (after hangup)
- Heading: time-aware "I liked talking to you {this morning|today|tonight}."
- Sub: "I'll remember this for next time, {name}." + closer ("Have a good day." / "Catch you later." / "Enjoy your evening." / "Sleep well.").
- Stats: Talked / Mood / Saved (3-up).
- Primary: "Talk again". Ghost: time-aware "Take care" / "See you" / "Goodnight".

### `/profile`
- Eyebrow (only when `lifetimeMins > 0`): "We've spent {N} minutes together".
- Greeting: "Hey, *{firstName}*." / "It's good to see you again." / time-aware prompt.
- Primary CTA: "Start talking" — full-width, the most important action on the page.
- Memory block: "*A few things* I remember…" / "You're always in control of what stays." / "Private. Just between us."
- Empty conversations: "No conversations yet." / "When you're ready, start with one small thought." / "Start talking →"

### Recent-conversation titles
- Reflection-derived when possible (`reflectionTitle()`).
- Bucket fallbacks rotate (max 5-deep window) so adjacent cards never repeat.
- Sessions <10s are hidden (misclicks). If shown: "Quick check-in".
- Duration: "less than a minute" / "1 min" / "12 min".

### Empty / loading / error — global vocabulary
| Surface | Copy |
| --- | --- |
| Loading | "One moment…" / "Getting ready…" / "Finding your voice…" |
| Voice error | "I'm having trouble hearing you." / "Check your microphone and try again." → "Try again" |
| Connection | "Something went quiet." / "Let's reconnect." → "Reconnect" |
| Rate-limited (daily cap) | Inline message, no redirect — see `rateLimited` state in `luna-conversation.tsx`. |
| No memories | "Nothing saved yet." / "I'll only remember what you allow." → "Start talking" |

---

## 5. Visual System

### Theme — dark only
The app forces dark mode (`<html class="dark">` and `[data-theme="light"] {
color-scheme: dark }` overrides any stale theme cookie). Do not add light
variants.

### Mood palettes
Four moods swap accent + glow + ink ramps via `[data-mood="..."]` on
`<html>`:
- **default (midnight blue)** — `#60A5FA` accent, `#3B82F6` glow, navy gradient
- **rose** — `#FB7185`, `#E11D7D` (legacy "luna rose")
- **purple** — `#C084FC`, `#A855F7` (current Luna default)
- **amber** — `#FBBF24`, `#F59E0B` (warm/morning variant)

When introducing a new mood, define the full token set (accent, glow,
accent-2, border-accent, ink ramp, bg-page, bg-grad). Do not partial.

### Stage layers (in z-order)
1. `.stage-bg` — layered radial gradients on near-black. `background-attachment: fixed`.
2. `.stage-glow` — fixed pinned mood-tinted top + bottom sheen, `mix-blend-mode: screen`.
3. `.stage-noise` — fixed SVG turbulence at 0.4 opacity for film grain.
4. App content at `z-index: 1`.

### Glass system
- `.glass` — primary panel: 28px blur, 150% saturate, 0.5px stroke.
- `.glass-thin` — secondary panel: 20px blur, 130% saturate.
- `.glass-slab` — hero card: 40px blur, 160% saturate, layered linear gradient with rim-light insets.
- `.glass-pill` — small chip: 14px blur, white-tinted, 11px caps.

### Typography
- Display: Instrument Serif (italic) — used for emphasis (`<em>`) in
  headlines and farewell quotes. Always italic.
- Sans: Geist — body, controls, labels.
- Captions are 11–12px, letter-spacing `0.10em`–`0.16em`, uppercase.

### Orb (`<LunaOrb>`)
- Particle cloud at 5 sizes: 140 (onboarding),
  200 (session-end), 240 (call stage), 260 (splash).
- States: `idle | processing | listening | speaking`. Drives by status, not
  user action.
- Color overridable via `color`/`glow` props for per-bucket profile cards.
- The orb is **never a tap target.** All "tap" actions go to explicit
  buttons. (See §6 fix.)

### Layout grids
- Splash, onboarding, call, session-end: `max-width: 460px`,
  `margin: 0 auto`. Mobile-first; comfortable on desktop too.
- Profile: wider layout, content-driven width.

---

## 6. Known fixes & gotchas

### Buttons must stay circular at every viewport
The original mobile rules force-stretched `.call-action` via `flex: 1`,
`min-width: 76px`, and `padding: 10px 14px` — producing oval buttons on
small screens. **Removed.** `.call-action` is now an explicit 48×48 (mic
84×84) at every width. Do not reintroduce flex-grow on it.

### Mic halo overlap with chips
The mic button is 84px with an 8px halo ring + 40px outer glow, which
extends ~26px above its centered control row. The suggestion chips above
need ≥32px bottom padding so the glow doesn't bleed into them.
- `.call-prompts { padding-bottom: 32px; }`
- `.call-actions { padding-top: 16px; }`

### "tap to talk" copy was dead
The `/call` screen auto-connects on mount, so `state.status === 'idle'`
never occurs in normal flow — the legacy `'tap to talk'` label was both
unreachable and misleading (the orb is not interactive). Replaced with
`"I'm here"` for ready/idle.

### Auth middleware must return JSON 401
Browser redirects from protected API routes break JSON parsing on the client.
The proxy middleware explicitly returns `{ error: 'unauthorized' }` JSON for
`/api/*` routes and only redirects browser page requests.

### Bot URL nullish guard
`NEXT_PUBLIC_BOT_URL=""` (empty string) bypassed `??` and produced a
SyntaxError on `.json()`. The connect path now treats empty string as
unset and surfaces an actionable error.

### IST timezone assumption
Both time-of-day helpers compute hours in `Asia/Kolkata` regardless of
server location. Do not call `new Date().getHours()` for bucketing —
always go through `bucketFor()` / `timeOfDayFromHour(currentISTHour())`.

---

## 7. Component inventory

| File | Purpose |
| --- | --- |
| `components/luna-splash.tsx` | Screen 01 — hero + CTA |
| `components/luna-conversation.tsx` | Screen 03/04/08 — call surface, end card |
| `components/luna-orb.tsx` | The particle orb (state-driven) |
| `components/transcript-list.tsx` | Live caption rendering inside `.call-transcript` |
| `components/wave-bars.tsx` | Audio level visualizer (legacy) |
| `components/warmth-rings.tsx` | Halo rings around the orb |
| `components/edge-glow.tsx` | Stage glow tint |
| `components/top-nav.tsx` | Persistent header (wordmark · balance pill · profile/sign-in) |
| `components/recording-player.tsx` | Per-session audio playback on history page |
| `components/icons.tsx` | Inline SVG icon set (mic, close, heart, cog, mute) |

When adding a new component, mirror the `luna-` naming convention only if
the component is part of the conversation surface. Generic components stay
unprefixed.

---

## 8. Adding a new surface — checklist

1. Read this file and §2 banned vocabulary before writing any string.
2. Run the time-of-day helper if the surface should adapt by hour.
3. Use existing tokens (`var(--ink)`, `var(--accent)`, `var(--glass-fill)`)
   — never hex-literal a new color.
4. Glass + orb are the two hero motifs. Reach for them before inventing.
5. Keep headlines ≤7 words.
6. Verify circular buttons stay circular at 320px width.
7. If the page auto-connects to the bot, route an `unauthorized` failure
   to `/sign-in`; a `rate_limited` failure gets an inline message, not a
   redirect (see `connect()` error codes in `hooks/use-pipecat.ts`).
8. Run `npx tsc --noEmit` from `/web` before declaring done.
