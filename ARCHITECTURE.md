# ARCHITECTURE.md

This is a decision log, not a tutorial. It exists so a contributor coming in
cold can understand *why* the code is shaped the way it is — including the
parts that are still rough — without doing archaeology through git history.
For "how do I run this," see `SETUP.md`. For "what is this product," see
`README.md`.

## 1. Cost protection replaced the credits/paywall system

Luna started as a metered product: a credits ledger, a paywall, a payment
provider. The open-source cut removed all of that — there is no billing
anywhere in this repo. What replaced it is deliberately simple:

- `MAX_CALL_SECONDS` — a hard per-session call length, enforced server-side.
- `DAILY_LIMIT_MINUTES` — a per-user, per-IST-calendar-day usage cap, summed
  live from the `sessions` table (`web/src/lib/limits.ts`). `0` disables it.
- A per-IP throttle on *anonymous user creation* — on first sight, a new
  anonymous user is minted only if `users.ip_hash` (indexed at
  `users_ip_hash_idx` on `(ip_hash, created_at)`) hasn't already been used
  recently (`web/src/lib/anonymous.ts`; a 24h window per
  `/api/session/start`'s own comment). This is separate from the daily-minutes
  cap — it stops one visitor from minting unlimited anonymous identities,
  not from using up their minutes.

Both usage limits apply identically to anonymous and signed-in callers —
there's no differential treatment to "pay past" a cap, because there's
nothing to pay with. This is cost/abuse protection for whoever is running
the API keys, not a monetization lever. `POST /api/session/start` returns
`{status: 'soft_gate', reason: 'rate_limited'}` when a caller is over the
daily cap; the client shows an inline message rather than redirecting
anywhere — there's no `/paywall` route left to redirect to.

## 2. The call budget is a signed claim, not a client-supplied number

`/api/session/start` computes `MAX_CALL_SECONDS` server-side and signs it
into the HMAC session token as a `bud` claim, alongside `sub` (user), `sid`
(session id), and `exp`. The bot verifies the token's signature
(`server/luna_bot/session.py`, `verify_session_token`) and reads the call
budget from the verified `bud` claim (`_call_budget_from_payload`) — never
from the request body's `callBudgetSecs`, which is unsigned and relayed
straight through the browser. That field exists only for client-side UI
(the countdown display); it is never trusted for the enforced budget. A
token minted before the `bud` claim existed — or missing one for any other
reason — falls back to the bot's own `MAX_CALL_SECONDS` env default, with a
warning logged, rather than crashing the call.

## 3. Memory: transcripts → reflection → embedding → recall

Nothing in the Python bot reads memory back from Postgres —
`server/luna_bot/persistence/db.py` only ever writes (`write_transcript`,
`update_session_audio`) or makes an outbound HTTP callback
(`notify_session_end`). The entire memory pipeline lives in `web/`:

1. **Reflect** — at session end, `reflectOnSession()`
   (`web/src/lib/memory.ts`) sends the transcript to a chat LLM (Sarvam
   `sarvam-30b` by default) and asks for exactly `{facts: {...}, free_text:
   "..."}`.
2. **Embed (best-effort)** — the free-text reflection is embedded and
   stored on the same row for later vector recall. The embed call is
   wrapped in try/catch: if it fails, the reflection is still saved with
   its facts and free text intact, just without a vector — memory degrades
   to recency/keyword recall rather than disappearing. See the provider
   matrix below for what actually generates that embedding — it isn't what
   the function name suggests.
3. **Recall** — at the *next* session start, `hydrateMemory()` combines
   (a) facts merged across the last 5 reflections, (b) the last 3
   reflections' free text verbatim, and (c) the top-3 pgvector matches
   against the current scene/custom seed. The composite is sent to the bot
   as `memoryContext` and prepended to the system prompt. A separate,
   simpler `loadRecallSummary()` in `web/src/lib/recall.ts` does a plain,
   non-vector read of just the latest reflection's mood/themes for the
   splash-page copy — don't confuse the two when tracing a memory bug.

## 4. Safety architecture

Two-tier detector, entirely in `server/luna_bot/voice/safety.py`:

- **Tier 1** — a synchronous, local, phrase-level lexical screen over every
  final transcription (`screen_for_risk_signals`). Deliberately high-recall:
  phrase matches like "kill myself," not bare words like "kill," so idiom
  ("killing time") doesn't trip it, but real signal does. A hit never does
  anything user-visible by itself — it only queues tier 2.
- **Tier 2** — one HTTP call to the already-configured conversation LLM
  provider (Sarvam or OpenAI, whichever `CONVERSATION_LLM_PROVIDER` is set
  to) asking a strict yes/no classification. **Fail-safe by design**:
  anything other than a clean "no" — HTTP error, timeout, missing key,
  unparseable output, ambiguous wording — resolves to "yes, treat as
  crisis." A false positive here costs one extra classification call; a
  false negative costs a missed crisis signal. That tradeoff is deliberate.

On a confirmed crisis (once per call — `SafetyGate` tracks a `_confirmed`
flag so this cannot re-trigger), three things happen:

1. A one-time system directive is appended to the live LLM context with the
   configured crisis resources, instructing the model to stay calm, not
   diagnose, not roleplay a clinician, and gently point the user to a real
   person right now.
2. The call's wall-clock budget is extended once via
   `CallBudget.extend_once` (`RISK_GRACE_SECONDS`, default 300s) — a
   one-shot allowance, not renewable. While grace is active, the scripted
   warn/wrap-up lines in `call_clock()` (`server/luna_bot/lifecycle.py`)
   are suppressed, so the bot doesn't announce a countdown or hang up
   mid-crisis; the call still ends at the (now-extended) deadline.
3. An RTVI server message — `{"kind": "risk", "level": "crisis"}` — is sent
   to the client, which the call surface uses to show a crisis banner.

**Privacy decision**: the flagged text and the classifier's verdict are
never logged or persisted anywhere. The only trace is a single non-content
log line ("risk grace activated for session `<id>`") when grace activates —
enough to know it happened, nothing about what was said. This was a
deliberate call: crisis-adjacent speech is, on the whole, the most
sensitive text the system ever handles, and the answer here is to not
retain it at all, rather than retain-and-protect it.

## 5. One collapsed initial migration

`web/drizzle/` has exactly one migration — `0000_initial.sql` — instead of
the incremental history the app actually went through internally
(including tables for the payment/credits system that no longer exist). A
self-hoster running `npm run db:push` gets today's schema in one shot, not
a replay of a product pivot they have no context for and don't need.

## 6. Provider matrix and the couplings that come with it

| Concern | Provider(s) | Configurable? |
| --- | --- | --- |
| STT | Sarvam only (`server/luna_bot/pipeline.py` constructs `SarvamSTTService` directly) | No — hardcoded, no `STT_PROVIDER` switch |
| Conversation LLM | Sarvam or OpenAI | Yes — `CONVERSATION_LLM_PROVIDER` |
| Safety tier-2 classifier | Same provider as the conversation LLM | Indirectly, via `CONVERSATION_LLM_PROVIDER` |
| TTS | Sarvam, Cartesia, or ElevenLabs | Yes — `TTS_PROVIDER` |
| Reflector (memory facts) | Sarvam chat | No |
| Memory embeddings | OpenAI `text-embedding-3-small` only | No — requires `OPENAI_API_KEY` regardless of every other provider choice |

Two known hard couplings, both real limitations and open contribution
opportunities:

- **STT is Sarvam-only.** Unlike TTS, there's no factory or provider switch
  — self-hosting without a Sarvam key means no speech recognition at all,
  full stop.
- **Embeddings are OpenAI-only**, via a function still named `sarvamEmbed()`
  in `web/src/lib/sarvam.ts`. Sarvam removed their embeddings API in late
  2025; the call was repointed at OpenAI without renaming the function.
  It's a real gotcha for anyone grepping for where embeddings come from. A
  self-hoster without `OPENAI_API_KEY` still gets working memory (facts and
  free text persist), just without vector recall.

## 7. Other known gaps (honest, not hidden)

- **`/onboarding` is unreachable from the normal flow.** The page exists
  and works if you navigate to it directly, but nothing links to it — the
  splash page routes signed-in users straight to `/call`, no onboarding
  gate. A test documents this explicitly (`luna-splash.test.tsx`: "routes
  signed-in users to /call (no /onboarding gate)").
- **"Forget this memory" in profile is client-only.** `memory-strip.tsx`
  stores forgotten/edited memory IDs in `localStorage`
  (`luna:forgotten-memories`, `luna:edited-memories`) and hides them on
  that device only. The underlying reflection row in Postgres is
  untouched. This is disclosed in-product (see the `/safety` page copy),
  not silently misleading — but "forget" is a display filter today, not a
  delete, until server-side overrides (e.g. a `user_memory_overrides`
  table) land.
- **`CALL_WARN_SECONDS` is dead config.** `BotConfig.warn_seconds` reads it
  from the environment (`server/luna_bot/config.py`), but `call_clock()`
  in `server/luna_bot/lifecycle.py` computes its warn boundary as a
  hardcoded `total_secs - 30` and never reads `config.warn_seconds` at
  all. Setting the env var currently does nothing; either wire it in or
  remove it.
- **No self-serve account deletion.** A single session can be deleted
  (`DELETE /api/session/:sessionId`, which cascades to its transcripts and
  reflections), but there's no "delete my whole account" endpoint yet.
  This is disclosed on `/safety`, not silently absent.
