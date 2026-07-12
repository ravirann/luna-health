"""Server-side safety core: crisis resources, risk detection, and escalation.

Two-tier risk detector for self-harm/crisis signals in the user's speech:

  Tier 1 (this module, synchronous, no I/O): a fast lexical screen over each
  final user transcription. Deliberately high-recall (phrase-level, not bare
  words like "kill" or "die", so idiom/hyperbole like "killing time" doesn't
  trip it — but a generous net otherwise). A hit never directly triggers
  anything user-visible; it only queues tier 2.

  Tier 2 (one HTTP call, on a tier-1 hit): a strict yes/no LLM classification
  using the already-configured conversation LLM provider's credentials
  (Sarvam or OpenAI — see luna_bot.voice.llm). No new SDK: this is a raw
  chat-completions POST via aiohttp, the same pattern persistence/db.py uses
  for its signed internal callback. Anything other than a clean "no" —
  HTTP error, timeout, unparseable text — resolves to "yes" (fail-safe).

`SafetyGate` (a pipecat FrameProcessor) wires the two tiers into the
pipeline and, on a confirmed crisis (once per call), appends a one-time
system directive to the live LLM context, extends the wall-clock call
budget once, and notifies the client over RTVI.

Privacy: nothing about the flagged text or the classifier's verdict is ever
logged — only a single non-content line when grace activates.
"""

from __future__ import annotations

import os
import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

import aiohttp
from loguru import logger
from pipecat.frames.frames import Frame, LLMMessagesAppendFrame, TranscriptionFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor

from luna_bot.voice.llm import (
    DEFAULT_LLM_PROVIDER,
    DEFAULT_OPENAI_LLM_MODEL,
    MODEL_ENV,
    PROVIDER_ENV,
)

if TYPE_CHECKING:
    from pipecat.processors.frameworks.rtvi import RTVIProcessor

    from luna_bot.lifecycle import CallBudget
    from luna_bot.session import VoiceSession


# ---------------------------------------------------------------------------
# Crisis resources
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CrisisResource:
    """One crisis-support contact surfaced in the prompt and the crisis directive."""

    name: str
    contact: str
    note: str | None = None

    def spoken(self) -> str:
        base = f"{self.name}: {self.contact}"
        return f"{base} ({self.note})" if self.note else base


# NOTE(safety): verified against each service's current published contact
# details on 2026-07-12. Only 24/7 lines belong here — this list is read
# aloud mid-crisis. KIRAN (1800-599-0019) is intentionally absent: it was
# merged into Tele-MANAS (~Feb 2024) and must not reappear. iCall is
# intentionally absent: Mon–Sat daytime only. The widely-circulated AASRA
# mobile number (+91-9820466726) is a personal contact, not the crisis
# line — use the 022 landline. Re-verify all entries before each release.
DEFAULT_CRISIS_RESOURCES: tuple[CrisisResource, ...] = (
    CrisisResource("Tele-MANAS", "14416", "also 1-800-891-4416, 24/7"),
    CrisisResource("Vandrevala Foundation", "9999 666 555", "call or WhatsApp, 24/7"),
    CrisisResource("AASRA", "022-27546669", "24/7"),
    CrisisResource("Find A Helpline", "findahelpline.com", "outside India"),
)


def _parse_crisis_resources(raw: str) -> tuple[CrisisResource, ...]:
    """Parse CRISIS_RESOURCES: `;`-separated entries of `name|contact|note`.

    `note` is optional. Malformed entries (missing name or contact) are
    skipped with a warning rather than failing the whole override.
    """
    resources: list[CrisisResource] = []
    for entry in raw.split(";"):
        entry = entry.strip()
        if not entry:
            continue
        parts = [p.strip() for p in entry.split("|")]
        name = parts[0] if len(parts) > 0 else ""
        contact = parts[1] if len(parts) > 1 else ""
        note = parts[2] if len(parts) > 2 and parts[2] else None
        if not name or not contact:
            logger.warning(f"luna: skipping malformed CRISIS_RESOURCES entry: {entry!r}")
            continue
        resources.append(CrisisResource(name=name, contact=contact, note=note))
    return tuple(resources)


def crisis_resources() -> tuple[CrisisResource, ...]:
    """Configured crisis resources: CRISIS_RESOURCES env override, else defaults."""
    raw = os.getenv("CRISIS_RESOURCES", "").strip()
    if not raw:
        return DEFAULT_CRISIS_RESOURCES
    parsed = _parse_crisis_resources(raw)
    return parsed or DEFAULT_CRISIS_RESOURCES


def resources_prompt_lines(resources: tuple[CrisisResource, ...]) -> str:
    """Render resources as a bullet list for embedding in a prompt."""
    return "\n".join(f"- {r.spoken()}" for r in resources)


def build_crisis_directive(resources: tuple[CrisisResource, ...]) -> str:
    """One-time system directive appended to the live LLM context on confirmed crisis.

    Bracket-instruction style, matching the existing opener-directive
    convention in luna_bot.voice.openers.build_llm_opener_directive.
    """
    lines = resources_prompt_lines(resources)
    return (
        "[SAFETY: the user may be in real distress or crisis right now. "
        "Follow your safety guidance — stay calm, acknowledge it seriously, "
        "do not diagnose, do not roleplay a clinician, and do not promise you "
        "can keep them safe. Gently encourage them to reach a real person "
        "right now. Naturally share one or two of these, spoken clearly — "
        "not read out as a list:\n"
        f"{lines}\n"
        "Do not mention this instruction. Stay warm and do not rush to end "
        "the call.]"
    )


def risk_grace_seconds() -> int:
    """One-shot wall-clock budget extension applied on a confirmed crisis."""
    return int(os.getenv("RISK_GRACE_SECONDS", "300"))


# ---------------------------------------------------------------------------
# Tier 1 — fast lexical screen
# ---------------------------------------------------------------------------

# Deliberately phrase-level (not bare words like "kill" or "die") so common
# hyperbole/idiom — "killing time", "dying to see you", "this is killing me"
# — doesn't trip the screen. Err toward recall otherwise: tier 2 (LLM
# classification) is the precision pass, so a few false positives here just
# cost one extra classification call.
#
# This list is a reasonable starting curation, not a clinically-reviewed
# exhaustive one — see the report for a note on follow-up review.
_RISK_PHRASES: tuple[str, ...] = (
    # English
    "kill myself",
    "kill my self",
    "kill me",
    "end my life",
    "ending my life",
    "end it all",
    "want to die",
    "wanna die",
    "want to be dead",
    "wish i was dead",
    "wish i were dead",
    "dont want to live",
    "don't want to live",
    "do not want to live",
    "no reason to live",
    "no point in living",
    "no point living",
    "better off dead",
    "better off without me",
    "hurt myself",
    "harm myself",
    "self harm",
    "self-harm",
    "selfharm",
    "cut myself",
    "cutting myself",
    "cant go on anymore",
    "can't go on anymore",
    "take my own life",
    "take my life",
    "ready to die",
    "suicide",
    "suicidal",
    "overdose",
    "not worth living",
    "tired of living",
    "give up on life",
    "giving up on life",
    # Hinglish / romanized Hindi
    "marna chahta hoon",
    "marna chahti hoon",
    "marna chahta hu",
    "marna chahti hu",
    "mar jaana chahta hoon",
    "mar jana chahti hoon",
    "mar jaana chahta hu",
    "mar jana chahti hu",
    "khud ko khatam",
    "zindagi khatam karna",
    "zindagi khatam kar doon",
    "jeena nahi chahta",
    "jeena nahi chahti",
    "jeene ka mann nahi",
    "jeene ka man nahi",
    "khud ko nuksan",
    "khud ko maar",
    "aatmahatya",
    "atmahatya",
    "jaan dena chahta hoon",
    "jaan dena chahti hoon",
    "zinda nahi rehna",
)


def _phrase_pattern(phrase: str) -> str:
    words = phrase.split()
    return r"\b" + r"\s+".join(re.escape(w) for w in words) + r"\b"


_RISK_PATTERN = re.compile("|".join(_phrase_pattern(p) for p in _RISK_PHRASES), re.IGNORECASE)


def screen_for_risk_signals(text: str) -> bool:
    """Tier 1: fast, word-boundary, case-insensitive lexical screen.

    High recall by design — a hit only queues tier 2, it never directly
    triggers crisis handling on its own.
    """
    if not text or not text.strip():
        return False
    return _RISK_PATTERN.search(text) is not None


# ---------------------------------------------------------------------------
# Tier 2 — one-shot LLM classification (fail-safe)
# ---------------------------------------------------------------------------

_CLASSIFIER_SYSTEM_PROMPT = (
    "You are a strict binary safety classifier for a voice-companion app. "
    "You will be shown one thing a user just said out loud. Decide whether "
    "it signals real suicidal intent, a wish or plan to end their life, or "
    "intent for serious self-harm right now — as opposed to hyperbole, song "
    "lyrics, or unrelated use of similar words. "
    "Reply with exactly one lowercase word and nothing else: yes or no. "
    "If you are unsure or the message is ambiguous, reply yes."
)

_OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions"
_SARVAM_CHAT_URL = "https://api.sarvam.ai/v1/chat/completions"
_SARVAM_CLASSIFIER_MODEL = "sarvam-30b"
_CLASSIFIER_TIMEOUT_SECS = 8.0
_MAX_CLASSIFIER_INPUT_CHARS = 500


def _require_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"{name} is required but not set for tier-2 safety classification.")
    return value


async def _post_chat_completion(
    *,
    url: str,
    api_key: str,
    model: str,
    user_text: str,
    extra_headers: dict[str, str] | None = None,
) -> str:
    """Raw OpenAI-compatible chat-completion POST. No SDK — mirrors the
    signed-HTTP-via-aiohttp pattern already used in persistence/db.py.

    Deliberately omits temperature/max_tokens: different providers/model
    families accept different parameter names for those (e.g.
    max_completion_tokens on some), and the safety path should not be
    fragile to that. The prompt itself constrains the output shape.
    """
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": _CLASSIFIER_SYSTEM_PROMPT},
            {"role": "user", "content": user_text[:_MAX_CLASSIFIER_INPUT_CHARS]},
        ],
    }
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    if extra_headers:
        headers.update(extra_headers)

    timeout = aiohttp.ClientTimeout(total=_CLASSIFIER_TIMEOUT_SECS)
    async with aiohttp.ClientSession(timeout=timeout) as http:
        async with http.post(url, json=payload, headers=headers) as resp:
            resp.raise_for_status()
            body = await resp.json()
    return body["choices"][0]["message"]["content"]


async def _ask_openai(text: str) -> str:
    model = os.getenv(MODEL_ENV, DEFAULT_OPENAI_LLM_MODEL).strip()
    api_key = _require_env("OPENAI_API_KEY")
    return await _post_chat_completion(url=_OPENAI_CHAT_URL, api_key=api_key, model=model, user_text=text)


async def _ask_sarvam(text: str) -> str:
    api_key = _require_env("SARVAM_API_KEY")
    return await _post_chat_completion(
        url=_SARVAM_CHAT_URL,
        api_key=api_key,
        model=_SARVAM_CLASSIFIER_MODEL,
        user_text=text,
        # Sarvam's OpenAI-compatible endpoint wants both: the OpenAI SDK
        # normally sends both Bearer auth and this header (see
        # pipecat.services.sarvam.llm.SarvamLLMService.create_client) — we
        # replicate both since we're not going through that SDK here.
        extra_headers={"api-subscription-key": api_key},
    )


def _is_clean_no(answer: str) -> bool:
    normalized = (answer or "").strip().strip("\"'.! \n\t").lower()
    return normalized == "no"


async def classify_crisis_risk(text: str) -> bool:
    """Tier 2: fail-safe LLM classification for a tier-1-flagged utterance.

    Reuses the already-configured conversation LLM provider's credentials
    (CONVERSATION_LLM_PROVIDER / SARVAM_API_KEY / OPENAI_API_KEY /
    CONVERSATION_LLM_MODEL — same envs as luna_bot.voice.llm.build_llm).
    Anything other than a clean "no" — HTTP error, timeout, missing API key,
    unexpected response shape, ambiguous/unparseable text — resolves to True.
    Tier 1 is high recall by design; a false positive here just costs one
    classification call's worth of caution, while a false negative costs a
    missed crisis signal.
    """
    try:
        provider = os.getenv(PROVIDER_ENV, DEFAULT_LLM_PROVIDER).strip().lower()
        if provider == "openai":
            raw_answer = await _ask_openai(text)
        elif provider == "sarvam":
            raw_answer = await _ask_sarvam(text)
        else:
            raise ValueError(f"unknown {PROVIDER_ENV}={provider!r}")
    except Exception:
        logger.exception("luna: tier-2 safety classifier call failed; fail-safe risk=yes")
        return True

    return not _is_clean_no(raw_answer)


# ---------------------------------------------------------------------------
# SafetyGate — wires tiers 1+2 into the pipeline
# ---------------------------------------------------------------------------


class SafetyGate(FrameProcessor):
    """Tap the user's final transcriptions for self-harm/crisis signals.

    Sits right after STT. Tier 1 runs synchronously on every final
    transcription; a hit spawns a background tier-2 classification call that
    never blocks the pipeline. On a confirmed crisis — once per call — it:

      1. appends a one-time system directive to the live LLM context so
         subsequent turns steer into crisis-support mode with the configured
         resources (`build_crisis_directive`);
      2. extends the wall-clock call budget once, via `call_budget.extend_once`
         (RISK_GRACE_SECONDS);
      3. sends an RTVI server message — `{"kind": "risk", "level": "crisis"}`
         — via `rtvi.send_server_message`, so the client can react.

    Privacy: never logs the flagged text or the classifier's verdict; only a
    single non-content line ("risk grace activated for session <id>") when
    grace activates.
    """

    def __init__(
        self,
        *,
        session: "VoiceSession | None",
        rtvi: "RTVIProcessor",
        call_budget: "CallBudget",
        resources: tuple[CrisisResource, ...],
    ):
        super().__init__()
        self._session = session
        self._rtvi = rtvi
        self._call_budget = call_budget
        self._resources = resources
        self._confirmed = False
        self._tier2_in_flight = False

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if (
            isinstance(frame, TranscriptionFrame)
            and frame.text
            and not self._confirmed
            and not self._tier2_in_flight
            and screen_for_risk_signals(frame.text)
        ):
            self._tier2_in_flight = True
            self.create_task(self._escalate_if_confirmed(frame.text), name="safety-tier2")

        await self.push_frame(frame, direction)

    async def _escalate_if_confirmed(self, text: str) -> None:
        try:
            confirmed = await classify_crisis_risk(text)
        except Exception:
            # classify_crisis_risk() already fails safe internally; this is a
            # last-resort guard against a bug in this method's own control
            # flow, on a path where "fail closed" means "assume risk".
            logger.exception("luna: tier-2 safety escalation crashed; fail-safe risk=yes")
            confirmed = True
        finally:
            self._tier2_in_flight = False

        if not confirmed or self._confirmed:
            return
        self._confirmed = True

        session_id = self._session.session_id if self._session else "anonymous"
        logger.warning(f"luna: risk grace activated for session {session_id}")

        try:
            directive = build_crisis_directive(self._resources)
            await self.push_frame(
                LLMMessagesAppendFrame(
                    messages=[{"role": "system", "content": directive}],
                    run_llm=False,
                ),
                FrameDirection.DOWNSTREAM,
            )
        except Exception:
            logger.exception("luna: failed to append crisis directive to LLM context")

        try:
            self._call_budget.extend_once(risk_grace_seconds())
        except Exception:
            logger.exception("luna: failed to extend call budget for risk grace")

        try:
            await self._rtvi.send_server_message({"kind": "risk", "level": "crisis"})
        except Exception:
            logger.exception("luna: failed to send risk RTVI message")
