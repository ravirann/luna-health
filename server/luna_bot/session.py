"""Signed voice-session token parsing."""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
from dataclasses import dataclass
from typing import Any, Optional

from loguru import logger


# ---------------------------------------------------------------------------
# Token verification
# ---------------------------------------------------------------------------

@dataclass
class VoiceSession:
    """Decoded runner body for an authenticated voice session."""

    user_id: str
    session_id: str
    scene_id: Optional[str]
    persona_id: str
    custom_seed: Optional[str]
    call_budget_secs: int
    memory_context: str = ""
    # User-tunable prefs (vibe, tone, pace, warmth, name, memory). The
    # web layer pre-renders a prompt fragment so we don't duplicate the
    # template here; we keep the raw dict around for voice-synth hints.
    prefs_context: str = ""
    user_prefs: Optional[dict] = None


def _env_truthy(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in {"1", "true", "yes", "on"}


def should_reject_missing_session(session: Optional[VoiceSession]) -> bool:
    """Return whether a missing voice-session token should reject the call."""
    if session:
        return False
    if _env_truthy("ALLOW_UNAUTHENTICATED_BOT"):
        return False
    if _env_truthy("REQUIRE_BOT_SESSION"):
        return True
    return os.getenv("ENV", "").strip().lower() == "production"


def _b64url_decode(s: str) -> bytes:
    pad = "=" * (-len(s) % 4)
    return base64.urlsafe_b64decode(s + pad)


def verify_session_token(token: str, *, secret: str) -> dict[str, Any]:
    """Verify the HMAC-signed session token minted by /api/session/start.

    Format: `<base64url(json)>.<base64url(hmac_sha256)>`

    Raises ValueError on tamper / expiry.
    """
    try:
        body_b64, sig_b64 = token.split(".", 1)
    except ValueError as e:
        raise ValueError("token: malformed") from e

    expected = hmac.new(
        secret.encode("utf-8"), body_b64.encode("utf-8"), hashlib.sha256
    ).digest()
    actual = _b64url_decode(sig_b64)
    if not hmac.compare_digest(expected, actual):
        raise ValueError("token: bad signature")

    payload = json.loads(_b64url_decode(body_b64).decode("utf-8"))

    import time

    if int(payload.get("exp", 0)) < int(time.time()):
        raise ValueError("token: expired")
    if not payload.get("sub") or not payload.get("sid"):
        raise ValueError("token: missing claims")

    return payload


DEFAULT_MAX_CALL_SECONDS = 600


def _call_budget_from_payload(payload: dict[str, Any]) -> int:
    """Extract the signed call-budget claim, falling back to a server default.

    `bud` is HMAC-verified as part of the token payload, same as sub/sid/exp.
    The request body's `callBudgetSecs` is unsigned and browser-relayed, so it
    must never be trusted for this — it is intentionally not read here at all.

    A missing or malformed `bud` (e.g. an old token minted before this claim
    existed) is not a hard failure: we log a warning and fall back to the
    server-side MAX_CALL_SECONDS env default rather than crashing the call.
    """
    bud = payload.get("bud")
    if bud is None:
        logger.warning("luna: session token missing 'bud' claim; falling back to MAX_CALL_SECONDS")
    else:
        try:
            return int(bud)
        except (TypeError, ValueError):
            logger.warning(f"luna: session token 'bud' claim not an int ({bud!r}); falling back to MAX_CALL_SECONDS")
    return int(os.getenv("MAX_CALL_SECONDS", str(DEFAULT_MAX_CALL_SECONDS)))


def session_from_runner_body(body: Any) -> Optional[VoiceSession]:
    """Validate the runner body and return a VoiceSession.

    Returns None if the body is missing or unauthenticated — the caller decides
    whether that's allowed (in dev it is; in prod we should hard-fail).
    """
    if not body or not isinstance(body, dict):
        return None
    token = body.get("assistantToken")
    if not token:
        return None
    secret = os.getenv("BOT_SHARED_SECRET")
    if not secret:
        logger.warning("BOT_SHARED_SECRET not set; ignoring token")
        return None
    payload = verify_session_token(token, secret=secret)
    return VoiceSession(
        user_id=payload["sub"],
        session_id=payload["sid"],
        scene_id=body.get("sceneId"),
        persona_id=body.get("personaId") or "assistant",
        custom_seed=body.get("customSeed"),
        call_budget_secs=_call_budget_from_payload(payload),
        memory_context=body.get("memoryContext") or "",
        prefs_context=body.get("prefsContext") or "",
        user_prefs=body.get("userPrefs") or None,
    )
