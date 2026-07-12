# Luna — local setup

Two processes, one database. This document is the full environment-variable
reference plus a walkthrough to get both processes talking to each other
locally. For the short version, see the README quickstart.

---

## Environment variable reference

Start from the checked-in templates:

```bash
cp -n web/.env.example web/.env.local
cp -n server/.env.example server/.env
```

Keep `web/.env.local` and `server/.env` out of git (they already are, via
`.gitignore`). Variables marked **shared** must hold the identical value in
both files.

Each process reads only its own file — `web/src` never reads `server/.env`
and `server/luna_bot` never reads `web/.env.local`. The tables below mirror
the grouping comments already in each `.env.example`.

### `web/.env.local`

| Variable | Group | Required for | Notes |
|---|---|---|---|
| `DATABASE_URL` | shared | Everything | Any Postgres with the `vector` extension. Neon's pooled connection string works out of the box. |
| `BOT_SHARED_SECRET` | shared | Session tokens | Must match `server/.env`. Generate with `openssl rand -base64 48`. |
| `OPENAI_API_KEY` | shared | Memory embeddings, splash copy | Recommended, not strictly required — see ARCHITECTURE.md §6/§7 for what degrades without it. |
| `SARVAM_API_KEY` | shared | Reflector (`sarvamChat`) | Required — no alternative reflector is wired. |
| `SARVAM_CHAT_MODEL` | shared | Reflector tuning | Optional; defaults to `sarvam-30b` (`sarvam-105b` for higher-quality reflections). |
| `BRAND_NAME` | shared | Server-side brand fallback | Defaults to `luna`. For white-labeling a deployment, not for renaming the project. |
| `BOT_NAME` | shared | Bot persona copy | Falls back to `BRAND_NAME`. |
| `BOT_GENDER` | shared | Bot persona copy | `feminine` \| `masculine` \| `neutral`. |
| `NODE_ENV` | web runtime | — | `development` locally; Next.js manages this in most other contexts. |
| `NEXT_PUBLIC_APP_URL` | web runtime | Metadata, OG URLs | `http://localhost:3000` locally. |
| `NEXT_PUBLIC_BOT_URL` | web runtime | Voice calls | URL the **browser** uses to reach the bot. `http://localhost:7860` locally. An empty string is *not* treated as unset — see Troubleshooting. |
| `NEXT_PUBLIC_BRAND_NAME` | web runtime | Visible wordmark | Defaults to `luna`. |
| `NEXT_PUBLIC_BOT_NAME` | web runtime | Visible bot name in copy | — |
| `BOT_INTERNAL_URL` | web server-side | SSR → bot prewarm | Private path (e.g. Docker-network address) in production; same as `NEXT_PUBLIC_BOT_URL` locally. |
| `BOT_PUBLIC_URL` | web server-side | — | Browser-facing bot URL when it differs from the internal one (production only). |
| `GUEST_COOKIE_SECRET` | auth | Anonymous session cookie | `openssl rand -base64 48`. |
| `MAX_CALL_SECONDS` | usage limits | Per-session call budget | Computed here and signed into the bot's session token as the `bud` claim. Default `600`. See ARCHITECTURE.md §1–2. |
| `DAILY_LIMIT_MINUTES` | usage limits | Per-user, per-IST-day cap | `0` disables it. Default `15`. Web-only — the bot doesn't need to know about it. |
| `RESEND_API_KEY` | email | Password-reset email | `re_...`, from resend.com. Needs "Sending access" only. |
| `EMAIL_FROM` | email | Password-reset email | Must be a Resend-verified sending address. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | recordings | Playback URLs | Must match `server/.env` — the bot writes recordings, the web app generates presigned playback URLs from the same bucket. |
| `R2_PUBLIC_BASE_URL` | recordings | — | Optional/reserved; presigned playback works without it. |
| `COPY_PROVIDER`, `COPY_MODEL`, `TAGLINE` | splash copy | Splash headline generation | Optional. `COPY_PROVIDER` blank auto-selects a provider from whichever key is set. |

### `server/.env`

| Variable | Group | Required for | Notes |
|---|---|---|---|
| `DATABASE_URL` | shared | Transcript writes | Without it the bot still runs calls, just skips persistence (logs a warning on startup). |
| `BOT_SHARED_SECRET` | shared | Session token verification | Must match `web/.env.local`. |
| `OPENAI_API_KEY` | shared | Conversation LLM (conditionally) | Required only when `CONVERSATION_LLM_PROVIDER=openai`. |
| `SARVAM_API_KEY` | shared | Speech-to-text (always) | Required — STT has no alternative provider wired. |
| `BRAND_NAME`, `BOT_NAME`, `BOT_GENDER` | shared | Prompt identity | Same values as `web/.env.local`. |
| `ENV` | lifecycle | Gates anonymous-session paths | `dev` \| `production`. |
| `ALLOW_UNAUTHENTICATED_BOT` | lifecycle | Dev convenience | Lets the bot accept offers with no session token at all. Leave `false` outside local dev. |
| `REQUIRE_BOT_SESSION` | lifecycle | Auth enforcement | Requires a signed session token on `/api/offer`. |
| `NEXT_APP_URL` | lifecycle | Session-end callback | Web app origin the bot calls back to, e.g. `http://localhost:3000`. |
| `MAX_CALL_SECONDS` | lifecycle | Fallback only | The enforced budget is the signed `bud` claim on the token (ARCHITECTURE.md §2); this env is only a fallback for tokens minted before that claim existed, or when there's no token at all. |
| `CALL_WARN_SECONDS` | lifecycle | Currently a no-op | Read into `BotConfig.warn_seconds` but never consulted — the actual warn boundary is hardcoded to 30 seconds before the deadline in `lifecycle.py`. Setting this does nothing today; see ARCHITECTURE.md §7. |
| `OPENER_MODE` | lifecycle | Call opener | `llm` (generated) \| `template` (curated). |
| `CONVERSATION_LLM_PROVIDER`, `CONVERSATION_LLM_MODEL` | conversation LLM | The "brain" between STT and TTS | `sarvam` or `openai`. Also selects the safety tier-2 classifier's provider. |
| `LLM_TEMPERATURE`, `LLM_PRESENCE_PENALTY`, `LLM_FREQUENCY_PENALTY`, `LLM_MAX_TOKENS` | conversation LLM | OpenAI-only tuning | Ignored under the Sarvam provider. |
| `RISK_GRACE_SECONDS` | safety | Crisis call-budget extension | One-shot, default `300`. See ARCHITECTURE.md §4. |
| `CRISIS_RESOURCES` | safety | Override the built-in crisis contacts | `;`-separated `name\|contact\|note` entries. Leave unset to use the verified defaults — re-verify against each service's current published numbers before changing, and before every release. |
| `STT_MODEL`, `STT_HIGH_VAD_SENSITIVITY` | STT | Speech recognition | Sarvam only; no provider switch exists. |
| `VAD_CONFIDENCE`, `VAD_START_SECS`, `VAD_STOP_SECS`, `VAD_MIN_VOLUME`, `USER_SPEECH_TIMEOUT`, `USER_TURN_STOP_TIMEOUT`, `AUDIO_IDLE_TIMEOUT` | turn-taking | Voice-activity-detection tuning | Defaults are reasonable; only touch these if turn-taking feels off. |
| `TTS_PROVIDER` | TTS | Voice output | `sarvam` \| `cartesia` \| `elevenlabs`. |
| `TTS_MODEL`, `TTS_VOICE`, `TTS_PACE`, `TTS_TEMPERATURE` | TTS (sarvam) | Only read when `TTS_PROVIDER=sarvam` | — |
| `CARTESIA_API_KEY`, `CARTESIA_VOICE_ID`, `CARTESIA_MODEL`, `CARTESIA_LANGUAGE`, `CARTESIA_SPEED`, `CARTESIA_EMOTION`, `CARTESIA_VOLUME` | TTS (cartesia) | Only read when `TTS_PROVIDER=cartesia` | — |
| `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`, `ELEVENLABS_MODEL`, `ELEVENLABS_LANGUAGE`, `ELEVENLABS_STABILITY`, `ELEVENLABS_SIMILARITY_BOOST`, `ELEVENLABS_STYLE`, `ELEVENLABS_USE_SPEAKER_BOOST`, `ELEVENLABS_SPEED` | TTS (elevenlabs) | Only read when `TTS_PROVIDER=elevenlabs` | Library voices may require a paid ElevenLabs plan. |
| `RHYTHM_PAUSE_DEFAULT`, `RHYTHM_PAUSE_QUESTION`, `RHYTHM_PAUSE_ACK`, `RHYTHM_PAUSE_ELLIPSIS` | speech rhythm | Inter-sentence pause tuning | Real `asyncio` sleeps between TTS chunks — hold even when the TTS engine ignores punctuation. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | recordings | Audio upload | Must match `web/.env.local`. |

---

## Local development walkthrough

### 1 · Postgres with pgvector

Pick one:

**Docker (fastest):**
```bash
docker run -d --name luna-pg -p 5432:5432 \
  -e POSTGRES_PASSWORD=luna -e POSTGRES_DB=luna \
  pgvector/pgvector:pg16
```
Your `DATABASE_URL` is `postgres://postgres:luna@localhost:5432/luna`.

**Neon (free, no card, pgvector preinstalled):**
1. Sign up at <https://console.neon.tech>.
2. New Project → name it `luna`, region closest to you.
3. Connection Details → toggle **Pooled connection** → copy the string.

Either way, save the connection string — it's `DATABASE_URL` in **both**
`web/.env.local` and `server/.env`.

### 2 · Generate the shared secrets

```bash
openssl rand -base64 48   # -> BOT_SHARED_SECRET (paste into BOTH files)
openssl rand -base64 48   # -> GUEST_COOKIE_SECRET (web/.env.local only)
```

### 3 · Web app

```bash
cd web
cp .env.example .env.local     # fill in DATABASE_URL, BOT_SHARED_SECRET,
                                # GUEST_COOKIE_SECRET, SARVAM_API_KEY at minimum
npm install
npm run db:migrate             # runs migrations: tables, vector extension, HNSW index
npm run dev                    # http://localhost:3000
```

`db:generate` regenerates SQL from `src/lib/db/schema.ts` after a schema
edit. `db:studio` opens Drizzle Studio in the browser.

### 4 · Bot

```bash
cd server
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env           # fill in DATABASE_URL, BOT_SHARED_SECRET,
                                # SARVAM_API_KEY, NEXT_APP_URL at minimum
python bot.py                  # http://localhost:7860
```

For the test suite (not needed just to run the bot):
```bash
pip install -r requirements-dev.txt
python -m pytest -q
```

### 5 · Run both together

Two terminals:

```bash
# terminal 1
cd server && source .venv/bin/activate && python bot.py

# terminal 2
cd web && npm run dev
```

Open <http://localhost:3000>, start a call, and talk. You should see live
transcription in the call UI and hear a spoken response. Check **History**
afterward to confirm the session and transcript persisted.

If any of this fails, see Troubleshooting below.

---

## Troubleshooting

**"Failed to send ICE candidate: NetworkError" in the browser console** —
the bot isn't running. Start `server/bot.py` before debugging the web
side; this is the single most common cause of a broken `/call` screen.

**`NEXT_PUBLIC_BOT_URL=""` (set but empty) behaves like it's unset in some
places and not others** — an empty string is falsy for most JS checks but
still *set* for `??` (nullish coalescing), so `NEXT_PUBLIC_BOT_URL ?? fallback`
does **not** fall back to a default when the variable is present but empty.
The connect path treats empty string as unset explicitly; if you hit a
`.json()` `SyntaxError` on connect, check this first.

**`server_misconfigured` when starting a call** — `GUEST_COOKIE_SECRET` is
missing in `web/.env.local`. Set it and restart the web dev server.

**Bot returns 500 on `/api/offer`** — check the `server/` log. Most common
causes: missing `SARVAM_API_KEY`, or an STT model name that doesn't match
what Sarvam currently serves (`STT_MODEL`).

**`rate_limited` when starting a call** — the caller (anonymous or
signed-in) is over `DAILY_LIMIT_MINUTES` for the current IST day. To keep
testing, temporarily raise `DAILY_LIMIT_MINUTES` in `web/.env.local` and
restart the web dev server, or wait for the IST day to roll over.

**Audio plays but no transcripts show up** — check the `server/` log for
`DATABASE_URL not set; bot will not persist transcripts`. Set it in
`server/.env` and restart the bot.

**Session-end side effects don't fire (no duration recorded on
disconnect)** — verify `NEXT_APP_URL` (in `server/.env`) and
`BOT_SHARED_SECRET` (identical in both files) are set. Check the bot log
for `notify_session_end` after disconnect.
