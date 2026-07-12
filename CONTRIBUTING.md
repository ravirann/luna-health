# Contributing to Luna

Thanks for wanting to work on Luna. This document covers local setup for
both halves of the app, how to run everything together, what we expect
from a pull request, and which parts of the codebase need extra care
before they're touched.

## Project layout

Luna is two processes that share one database:

- **`server/`** — a Python voice bot (Pipecat-based). Real-time voice
  pipeline: speech in, speech out, transcript persistence, optional audio
  upload.
- **`web/`** — a Next.js app (App Router). Onboarding, the live call
  screen, profile, and settings.

See `SETUP.md` at the repo root for the full environment-variable
reference, and `ARCHITECTURE.md` for why the code is shaped the way it is.
This document only covers the contributor workflow on top of that.

## Setting up `web/`

```bash
cd web
npm install
cp .env.example .env.local     # fill in values — see SETUP.md
npm run db:migrate             # apply migrations (incl. pgvector extension + indexes)
npm run dev                    # http://localhost:3000
```

Before requesting review on a `web/` change, run:

```bash
npx tsc --noEmit    # typecheck — required, must exit 0
npm test            # vitest unit tests
```

## Setting up `server/`

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # fill in values — see SETUP.md
python bot.py                  # http://localhost:7860
```

Before requesting review on a `server/` change, install the test
dependencies and run the suite from `server/`:

```bash
pip install -r requirements-dev.txt
pytest
```

## Running both together

The web app's call screen needs the bot process reachable at
`NEXT_PUBLIC_BOT_URL` (default `http://localhost:7860`). To exercise a
full call locally you need three things running:

1. **Bot** — `cd server && source .venv/bin/activate && python bot.py`
2. **Web** — `cd web && npm run dev`
3. **Database** — Postgres reachable via `DATABASE_URL` (Neon works
   locally too, or any Postgres with the `vector` extension), set to the
   same value in both `server/.env` and `web/.env.local`.
   `BOT_SHARED_SECRET` must also match in both files.

If the call screen fails to connect (a WebRTC/ICE error in the browser
console), the most common cause is the bot process not running — check
that before debugging further on the web side.

## Branches and pull requests

- Branch off; don't commit straight to the main branch.
- Keep pull requests small and scoped to one change. If a change bundles
  unrelated behavior with a refactor, split it into two PRs.
- `npx tsc --noEmit` must pass before requesting review. Add or update
  tests for the behavior you touched where that's practical.
- Describe what changed, why, and how you verified it — a manual call
  walkthrough, new or updated automated tests, or both.
- If your change touches safety-critical code (below), say so explicitly
  in the PR description — the template will prompt you.

## Safety-critical code

Luna has conversations with people about how they're feeling, sometimes
late at night, sometimes about difficult things. A few areas of the
codebase carry more weight than a typical change and get extra scrutiny:

- **`server/luna_bot/voice/safety.py`** — the two-tier crisis detector
  that shapes how the bot responds when someone discloses self-harm,
  suicidal ideation, or other acute risk. See `ARCHITECTURE.md` for how
  it works and why it's fail-safe by design.
- **Disclaimers and safety-related copy** — the crisis directive text in
  `safety.py`, the `/safety` page (`web/src/app/safety/page.tsx`), and
  the `safety` copy block in `web/src/lib/i18n.ts`. Crisis-resource
  contact details specifically need re-verification against each
  service's current published numbers before any change ships.
- **Memory and data-handling code** — anything touching transcripts,
  reflections, embeddings, or recordings: what's stored, for how long,
  who can read it, and how it gets deleted.

Changes in these areas are never merged as a drive-by PR, no matter how
small they look. They get a maintainer's deliberate review before merge.
If you're planning work here, open an issue first and say so — it saves
a rewritten PR later.

## UI copy

User-facing text (onboarding, error states, and what the bot itself says)
follows the project's design and copy guidelines: tone, vocabulary, and
disclaimer language are covered there (`DESIGN.md`). Read it before adding
or changing anything a user sees or hears; don't freehand it per PR.
