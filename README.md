# Luna

Luna is an open-source, self-hostable voice companion for calm, late-night
conversations — built with a mental-health-aware safety design.

You talk, out loud, over a real-time voice call in the browser. Luna
listens and responds, and — if you let it — remembers threads from one
conversation to the next.

> ## What Luna is not
>
> Luna is not therapy, not medical care, and not equipped to handle a
> medical or psychiatric emergency. It's software that talks with you — not
> a clinician, not a crisis service, and not a replacement for either.
>
> If you or someone you're talking to is in immediate danger, contact local
> emergency services. If it's not an emergency but you need to talk to
> someone now:
>
> - **Tele-MANAS** — 14416 (also 1-800-891-4416, 24/7)
> - **Vandrevala Foundation** — 9999 666 555 (call or WhatsApp, 24/7)
> - **AASRA** — 022-27546669 (24/7)
> - Outside India: [findahelpline.com](https://findahelpline.com)

## Features

- **Voice-first, real-time conversation** over WebRTC — low-latency,
  interruptible, turn-taking speech, not a chat box read aloud.
- **Conversational memory across sessions.** Each call's transcript becomes
  an AI-written reflection, embedded and recalled by pgvector similarity
  the next time you call, so the conversation can pick up old threads
  instead of starting cold every time.
- **Session recordings, optional.** If you configure a storage bucket,
  calls are recorded and playable back from your call history. Skip the
  bucket and recording is simply off.
- **A few conversation personas and moods**, plus preset scenes to start a
  conversation from — or write your own.
- **Hindi, Hinglish (romanized Hindi mixed with English), and English**,
  handled by the same voice pipeline.

## Architecture

```
browser  --HTTPS (auth, start/end session)-->  Next.js web  -->  Postgres
browser  --WebRTC (live audio)-->  Pipecat bot (Python)
Pipecat bot  --transcripts + session-end callback-->  Next.js web
Next.js web  --reflection loop (facts + embedding)-->  Postgres
```

The web app owns auth, session limits, and memory; the bot owns the live
audio pipeline and talks to Postgres only to write transcripts and notify
the web app when a call ends. See **ARCHITECTURE.md** for the reasoning
behind this split and a list of known rough edges.

## Quickstart

You need two processes running (web + bot) and a Postgres database with
the `vector` extension.

```bash
git clone https://github.com/ravirann/luna-health.git luna
cd luna

# 1. Postgres with pgvector — quickest via Docker:
docker run -d --name luna-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=luna -e POSTGRES_DB=luna \
  pgvector/pgvector:pg16
# (or a free Neon project — https://neon.tech — pgvector is preinstalled)

# 2. Web app
cd web
cp .env.example .env.local     # fill in the keys below
npm install
npm run db:migrate             # runs migrations: tables, pgvector extension, indexes
npm run dev                    # http://localhost:3000

# 3. Bot — separate terminal
cd server
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # fill in the keys below
python bot.py                  # http://localhost:7860
```

Both processes must be running for a call to work. If the browser shows
"Failed to send ICE candidate: NetworkError," the bot isn't running —
start it before debugging the web side.

**Keys you'll need:**

Required:
- `SARVAM_API_KEY` — speech-to-text (no alternative is wired in), plus the
  default conversation LLM/TTS and the memory reflector.
  [sarvam.ai](https://www.sarvam.ai/)
- `DATABASE_URL` — any Postgres with the `vector` extension. A free Neon
  project works out of the box.
- `OPENAI_API_KEY` — memory embeddings (pgvector recall). Reflection still
  works without it, but recall degrades to the most recent reflections
  only, with no similarity search — see `web/src/lib/memory.ts` for the
  exact fallback. Also usable as the conversation LLM instead of Sarvam.

Optional:
- `ELEVENLABS_API_KEY` or `CARTESIA_API_KEY` — alternate TTS voices.
- Cloudflare R2 (or any S3-compatible bucket) — call recordings.
- `RESEND_API_KEY` — password-reset email.

## Configuration

Every environment variable — what reads it, which process needs it, and
what's required vs. optional — is documented in **SETUP.md**. Start from
`web/.env.example` and `server/.env.example`; both are annotated inline.

## Safety

Luna runs a two-tier crisis detector inside the voice pipeline
(`server/luna_bot/voice/safety.py`):

- A fast, local, lexical screen flags phrases associated with self-harm or
  suicidal intent in what the user says.
- A flagged utterance gets one classification call to confirm it — and
  fails safe: an error, a timeout, or anything ambiguous is treated as a
  confirmed crisis rather than dismissed.
- On a confirmed crisis, the bot shifts into a calmer register, speaks
  crisis resources aloud, shows them on screen (see `/safety` in the
  running app), and grants a one-time extension to the call's time budget
  so the conversation isn't cut off mid-crisis.
- The flagged text and the classifier's decision are never stored or
  logged anywhere — only that a crisis response happened, never what was
  said.

**This is a starting point, not a guarantee.** The detector is a lexical
screen plus one LLM call; it will miss things. And nothing in the
Apache-2.0 license stops a fork from deleting `safety.py` entirely — a
license can't mandate keeping a safety feature in a derivative work. The
mitigation here isn't technical, it's social: the detection logic is small
and readable on purpose, specifically so it's easy to audit, and this is a
public repository, not a black box. If you run a fork, please keep the
safety module intact — or, if you replace it, hold your replacement to at
least the same bar. If you find a gap in it, please report it privately
(see **SECURITY.md**) rather than opening a public issue.

## Data handling

Full detail lives on the in-app `/safety` page (source: `web/src/app/safety/page.tsx`
and the `safety` copy block in `web/src/lib/i18n.ts`). Summary:

- Transcripts and reflections live in your own Postgres — whoever runs the
  deployment controls that data, same as any self-hosted app.
- Call recordings are optional and land in your own bucket if you
  configure one; they are never public.
- There's no self-serve "delete my account" flow yet. A single
  conversation can be deleted, which cascades to its transcript and
  reflection; a full-account wipe isn't built. See **ARCHITECTURE.md** for
  the current state of memory and deletion gaps.

## Project status

Early and actively developed. Expect rough edges — **ARCHITECTURE.md**
keeps an honest list of known gaps rather than hiding them. Issues and
pull requests are welcome.

## Contributing

See **CONTRIBUTING.md** for local setup and pull-request expectations,
**CODE_OF_CONDUCT.md** for community standards, and **SECURITY.md** to
report a vulnerability privately.

## License

Apache License 2.0 — see **LICENSE**.
