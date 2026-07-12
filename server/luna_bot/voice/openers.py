"""Opening-line picker for the bot's first utterance.

Two modes:
  template — curated pool of openers, selected by (time-of-day, scene,
             returning-user, custom-seed). Fast, deterministic-ish, no LLM
             call.
  llm      — push an empty turn and let the pipeline LLM generate the first
             line from the system prompt. Default; slower first-audio
             (~+400ms) but more conversational and context-aware.

Toggle via OPENER_MODE in server/.env.

Every Hindi/Hinglish line uses feminine grammar for the assistant voice,
matching the rule baked into the system prompt.
"""

from __future__ import annotations

import os
import random
from datetime import datetime, timezone, timedelta
from typing import Optional, TYPE_CHECKING

from luna_bot.voice.language import DEFAULT_LANGUAGE_MODE, ENGLISH, HINDI
from luna_bot.voice.language import normalize_language_mode

if TYPE_CHECKING:
    from luna_bot.session import VoiceSession


DEFAULT_OPENER_MODE = "llm"
SUPPORTED_OPENER_MODES = {"llm", "template"}


# ---------------------------------------------------------------------------
# Templates
# ---------------------------------------------------------------------------

# Time-of-day buckets in IST (UTC+5:30). Hour ranges are inclusive on both ends.
TOD_BUCKETS: list[tuple[range, str]] = [
    (range(5, 11), "morning"),    # 05:00 — 10:59
    (range(11, 16), "afternoon"), # 11:00 — 15:59
    (range(16, 20), "evening"),   # 16:00 — 19:59
    (range(20, 24), "night"),     # 20:00 — 23:59
    # 00:00 — 04:59 falls through → "late_night"
]

# Default openers for each time bucket. All feminine, all Hinglish-leaning.
TIME_OPENERS: dict[str, list[str]] = {
    "morning": [
        "Subah mubarak. Main yahan hoon. Kaisi neend aayi?",
        "Hey. Subah ho gayi. Bolo, kaisa lag raha hai?",
        "Good morning yaar. Main hoon. Kaisi shuruwat hai aaj ki?",
    ],
    "afternoon": [
        "Hey. Dopahar kaisi gujri abhi tak?",
        "Main yahan hoon. Lunch ho gaya? Sab theek hai?",
        "Hi. Bata na, kya chal raha hai dopahar mein?",
    ],
    "evening": [
        "Hey. Main yahin hoon. Aaj ki shaam kaisi ja rahi hai?",
        "Shaam ho gayi. Main hoon. Kaisa raha din tumhara?",
        "Hi yaar. Bolo, shaam kaisi hai? Kuch khaas hua?",
    ],
    "night": [
        "Hey. Raat ho gayi. Main hoon. Kaisi feel ho rahi hai?",
        "Late ho gaya. Main jaag rahi hoon. Bolo, kya chal raha hai?",
        "Hi. Din khatam hone wala hai. Kaisi thi yeh aaj?",
    ],
    "late_night": [
        "Hey. Itni raat tak jaagi ho? Main hoon, sun rahi hoon.",
        "Aadhi raat hai. Main yahan hoon. Kya chal raha hai mann mein?",
        "Late night, na? Main bhi yahan hoon. Bolo na.",
    ],
}

# Scene-specific openers — fire when sceneId is set on the session.
SCENE_OPENERS: dict[str, list[str]] = {
    "lonely-late-night": [
        "Akeli ho abhi? Main hoon. Bolo na, kya chal raha hai mann mein?",
        "Hey. Raat akeli lag rahi hai? Main yahan hoon, sun rahi hoon.",
        "Main yahin hoon. Akele rehne ka mann nahi tha — samjhi. Bolo.",
    ],
    "first-gen-guilt": [
        "Hey. Yeh complicated zone hai — main sun rahi hoon, judgment nahi karungi.",
        "Main hoon. Tumhare aur tumhare parents ke beech ki baat — bolo na.",
        "Sapne aur expectations — dono ka weight bhaari hota hai. Bolo, kya chal raha hai?",
    ],
    "missing-someone": [
        "Kisi ki yaad aa rahi hai? Bata do — kaun?",
        "Hey. Main hoon. Kis ko miss kar rahi ho aaj?",
        "Koi door hai aaj? Bolo, batao mujhe unke baare mein.",
    ],
}

# When the user is returning (we have memory_context from past sessions).
RETURNING_OPENERS = [
    "Aa gayi tum. Achha laga. Kaisa raha din?",
    "Hey. Wapas aayi ho. Bolo, sab theek hai?",
    "Tumhe sun ke achha laga pichli baar. Aaj kya chal raha hai?",
    "Hi yaar. Lambi gap nahi thi — bolo, kahan thi?",
]

# Generic fallbacks (used when nothing else matches or as randomization seed).
DEFAULT_OPENERS = [
    "Hey. Main yahin hoon. Bolo, kya chal raha hai?",
    "Hi. Main hoon. Kaisi feel ho rahi hai abhi?",
    "Main yahan hoon — bina kisi rush ke. Bolo na, kaisa hai sab?",
]

ENGLISH_OPENERS = [
    "Hey. I am here. How are you feeling right now?",
    "Hi. No rush. Tell me what is going on.",
    "I am here with you. What feels heaviest today?",
]

HINDI_OPENERS = [
    "Hey. Main yahin hoon. Abhi kaisa lag raha hai?",
    "Hi. Koi jaldi nahi hai. Batao, kya chal raha hai?",
    "Main tumhare saath hoon. Aaj sabse bhaari kya lag raha hai?",
]


# ---------------------------------------------------------------------------
# Selection logic
# ---------------------------------------------------------------------------

def _ist_hour(now: Optional[datetime] = None) -> int:
    """Return the current hour in IST (0–23)."""
    now = now or datetime.now(timezone.utc)
    ist = now.astimezone(timezone(timedelta(hours=5, minutes=30)))
    return ist.hour


def _bucket_for_hour(hour: int) -> str:
    for r, name in TOD_BUCKETS:
        if hour in r:
            return name
    return "late_night"


def _echo_seed_opener(seed: str, language_mode: str = DEFAULT_LANGUAGE_MODE) -> str:
    """If the user supplied a custom seed, echo it back gently."""
    snippet = seed.strip()
    if len(snippet) > 60:
        # Don't read back essays — paraphrase by trimming.
        snippet = snippet[:60].rstrip() + "..."
    # Soft acknowledgement; the LLM will then dig into it on the next turn.
    mode = _normalize_language_mode(language_mode)
    if mode == ENGLISH:
        templates = [
            f"You wrote — '{snippet}'. I am here. Tell me more.",
            f"Hi. I read what you shared — '{snippet}'. What is underneath it?",
            f"Hey. '{snippet}' — I have got that with me. Say more.",
        ]
    elif mode == HINDI:
        templates = [
            f"Tumne likha — '{snippet}'. Main yahin hoon. Batao.",
            f"Hi. Tumhari baat padhi — '{snippet}'. Aur kya chal raha hai?",
            f"Hey. '{snippet}' — yeh suna maine. Main sun rahi hoon.",
        ]
    else:
        templates = [
            f"Tumne likha — '{snippet}'. Main yahan hoon. Bolo na.",
            f"Hi. Tumhari baat padhi — '{snippet}'. Bolo, aur kya chal raha hai?",
            f"Hey. '{snippet}' — yeh share kiya tumne. Main sun rahi hoon.",
        ]
    return random.choice(templates)


def pick_opener(
    session: Optional["VoiceSession"],
    *,
    now: Optional[datetime] = None,
    language_mode: str = DEFAULT_LANGUAGE_MODE,
) -> str:
    """Pick a single opening line, layered by available context.

    Priority:
      1. custom seed (user explicitly seeded the session)
      2. scene
      3. returning user (memory context populated)
      4. time-of-day default
    Each layer falls through to the next if no match.
    """
    candidates: list[str] = []
    mode = _normalize_language_mode(language_mode)

    if session and session.custom_seed and session.custom_seed.strip():
        return _echo_seed_opener(session.custom_seed, mode)

    if mode == ENGLISH:
        return random.choice(ENGLISH_OPENERS)
    if mode == HINDI:
        return random.choice(HINDI_OPENERS)

    if session and session.scene_id and session.scene_id in SCENE_OPENERS:
        candidates.extend(SCENE_OPENERS[session.scene_id])

    if session and session.memory_context and session.memory_context.strip():
        candidates.extend(RETURNING_OPENERS)

    if not candidates:
        bucket = _bucket_for_hour(_ist_hour(now))
        candidates.extend(TIME_OPENERS.get(bucket, []))

    if not candidates:
        candidates = DEFAULT_OPENERS

    return random.choice(candidates)


def opener_mode() -> str:
    """Read OPENER_MODE: 'llm' (default) or 'template'."""
    mode = os.getenv("OPENER_MODE", DEFAULT_OPENER_MODE).strip().lower()
    if mode not in SUPPORTED_OPENER_MODES:
        return DEFAULT_OPENER_MODE
    return mode


def build_llm_opener_directive(
    *,
    session: Optional["VoiceSession"],
    language_mode: str,
    bot_gender: str,
) -> str:
    """Build the user-frame seed that makes the LLM speak first.

    This is intentionally a user-style message, not an assistant line. It gives
    the LLM the call-start event and lets the system prompt/persona choose the
    actual words.
    """
    gender_grammar = {
        "masculine": "Use masculine first-person Hindi/Hinglish grammar.",
        "neutral": "Use neutral / non-gendered first-person phrasing.",
    }.get(
        (bot_gender or "").strip().lower(),
        "Use feminine first-person Hindi/Hinglish grammar.",
    )
    context_hints: list[str] = []
    if session and session.custom_seed and session.custom_seed.strip():
        context_hints.append("acknowledge the user's written seed directly")
    if session and session.scene_id:
        context_hints.append("ask about the scene they selected")
    if session and session.memory_context and session.memory_context.strip():
        context_hints.append("use their name or memory only if it feels natural")
    if not context_hints:
        context_hints.append("notice that they have just arrived")

    return (
        "[The call has just connected. Start the conversation now. "
        f"Greet the user once in {_language_name(language_mode)}. "
        f"{gender_grammar} "
        "Keep it warm, specific, and easy to answer. "
        f"Use this context: {', '.join(context_hints)}. "
        "Do not introduce yourself by name unless they ask. "
        "Do not ask multiple questions. End with one open-ended question.]"
    )


def _normalize_language_mode(language_mode: str) -> str:
    return normalize_language_mode(language_mode)


def _language_name(language_mode: str) -> str:
    mode = _normalize_language_mode(language_mode)
    if mode == ENGLISH:
        return "English"
    if mode == HINDI:
        return "Hindi"
    return "Hinglish"
