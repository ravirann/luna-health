"""Environment-backed bot configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass


DEFAULT_BRAND_NAME = os.getenv("BRAND_NAME", "luna")


@dataclass
class BotConfig:
    # Fallback call budget — used only when there's no signed `bud` claim to
    # trust (no session token at all, e.g. anonymous/dev mode, or an old
    # token minted before the claim existed). The real per-call budget comes
    # from the HMAC-signed session token; see luna_bot.session.
    max_call_seconds: int = int(os.getenv("MAX_CALL_SECONDS", "600"))
    warn_seconds: int = int(os.getenv("CALL_WARN_SECONDS", "150"))
    stt_model: str = os.getenv("STT_MODEL", "saaras:v3")
    # TTS provider + voice are read from env inside voice.tts.build_tts().
    # Brand + bot identity are env-driven so the same image can be redeployed
    # under a different name without editing the prompt.
    bot_name: str = os.getenv("BOT_NAME", DEFAULT_BRAND_NAME)
    bot_gender: str = os.getenv("BOT_GENDER", "feminine")
    brand_name: str = DEFAULT_BRAND_NAME
