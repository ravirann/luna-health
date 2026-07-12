"""TTS provider factory.

Switch the active provider via TTS_PROVIDER. Adding a new provider means adding
one builder function, registering it in `TTS_PROVIDERS`, and documenting its env
vars in .env.example. The bot's pipeline never knows which one is in use.

Cost reality (₹/min spoken, ~150 words/min × 5 chars/word at typical 50/50
turn-taking → ~375 chars/min):

  Sarvam bulbul v3-beta   ~₹0.60/min   default; Indian voices, Hinglish
  Cartesia sonic-2/3      ~₹0.62/min   broader voice library, more emotive
"""

from __future__ import annotations

import os

from loguru import logger

from pipecat.services.cartesia.tts import CartesiaTTSService
from pipecat.services.cartesia.tts import GenerationConfig
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.services.sarvam.tts import SarvamTTSService
from pipecat.services.tts_service import TTSService
from pipecat.transcriptions.language import Language

from luna_bot.voice.language import CARTESIA_HINDI_HINT
from luna_bot.voice.language import DEFAULT_LANGUAGE_MODE, ENGLISH, HINDI
from luna_bot.voice.language import normalize_language_mode
from luna_bot.voice.rhythm import tts_request_text


# ---------------------------------------------------------------------------
# Sarvam — bulbul v2 / v3-beta. Same logic that used to live in bot.py.
# ---------------------------------------------------------------------------

def _build_sarvam(language_mode: str) -> TTSService:
    api_key = _require("SARVAM_API_KEY")
    return SarvamTTSService(
        api_key=api_key,
        settings=sarvam_settings_from_env(language_mode),
    )


def sarvam_settings_from_env(
    language_mode: str = DEFAULT_LANGUAGE_MODE,
) -> SarvamTTSService.Settings:
    voice = os.getenv("TTS_VOICE", "manisha")
    model = os.getenv("TTS_MODEL", "bulbul:v2")
    is_v3 = model.startswith("bulbul:v3")

    kwargs: dict = {
        "voice": voice,
        "model": model,
        "language": _sarvam_language(language_mode),
        "pace": float(os.getenv("TTS_PACE", "0.96")),
    }
    if is_v3:
        # v3 doesn't accept pitch / loudness. `temperature` ∈ (0.01, 1.0].
        # 0.68 keeps warmth without making the voice too unstable.
        kwargs["temperature"] = float(os.getenv("TTS_TEMPERATURE", "0.68"))
    else:
        kwargs["enable_preprocessing"] = True
        kwargs["pitch"] = float(os.getenv("TTS_PITCH", "0.0"))
        kwargs["loudness"] = float(os.getenv("TTS_LOUDNESS", "1.1"))

    return SarvamTTSService.Settings(**kwargs)


# ---------------------------------------------------------------------------
# Cartesia — Sonic. Pick a voice ID from https://play.cartesia.ai/voices
# (filter the library by language=English-India / Hindi for Indian voices).
# ---------------------------------------------------------------------------

def _build_cartesia(language_mode: str) -> TTSService:
    api_key = _require("CARTESIA_API_KEY")
    return CartesiaTTSService(
        api_key=api_key,
        settings=cartesia_settings_from_env(language_mode),
    )


def cartesia_settings_from_env(
    language_mode: str = DEFAULT_LANGUAGE_MODE,
) -> CartesiaTTSService.Settings:
    voice_id = _require("CARTESIA_VOICE_ID")
    model = os.getenv("CARTESIA_MODEL", "sonic-3")

    # Cartesia language hints affect prosody. For Hinglish content the
    # multilingual codes do better than plain "en"; the safe defaults are
    # `en` for English-heavy and `hi` for Hindi-heavy. Override via env.
    language = _cartesia_language(language_mode)
    generation_config = GenerationConfig(
        speed=float(os.getenv("CARTESIA_SPEED", "0.94")),
        emotion=os.getenv("CARTESIA_EMOTION", "sympathetic"),
        volume=float(os.getenv("CARTESIA_VOLUME", "1.0")),
    )

    return CartesiaTTSService.Settings(
        voice=voice_id,
        model=model,
        language=language,
        generation_config=generation_config,
    )


# ---------------------------------------------------------------------------
# ElevenLabs — streaming WebSocket TTS. Pick a voice ID from VoiceLab/library.
# Use `eleven_flash_v2_5` for lower latency, or override the model via env.
# ---------------------------------------------------------------------------

def _build_elevenlabs(language_mode: str) -> TTSService:
    api_key = _require("ELEVENLABS_API_KEY")
    return ElevenLabsTTSService(
        api_key=api_key,
        settings=elevenlabs_settings_from_env(language_mode),
    )


def elevenlabs_settings_from_env(
    language_mode: str = DEFAULT_LANGUAGE_MODE,
) -> ElevenLabsTTSService.Settings:
    voice_id = _require("ELEVENLABS_VOICE_ID")
    return ElevenLabsTTSService.Settings(
        voice=voice_id,
        model=os.getenv("ELEVENLABS_MODEL", "eleven_flash_v2_5"),
        language=_elevenlabs_language(language_mode),
        stability=float(os.getenv("ELEVENLABS_STABILITY", "0.45")),
        similarity_boost=float(os.getenv("ELEVENLABS_SIMILARITY_BOOST", "0.80")),
        style=float(os.getenv("ELEVENLABS_STYLE", "0.20")),
        use_speaker_boost=_env_bool("ELEVENLABS_USE_SPEAKER_BOOST", True),
        speed=float(os.getenv("ELEVENLABS_SPEED", "0.94")),
    )


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------

TTS_PROVIDERS = {
    "cartesia": _build_cartesia,
    "elevenlabs": _build_elevenlabs,
    "sarvam": _build_sarvam,
}


def supported_tts_providers() -> tuple[str, ...]:
    return tuple(sorted(TTS_PROVIDERS))


def build_tts(language_mode: str = DEFAULT_LANGUAGE_MODE) -> TTSService:
    """Construct a TTS service from env. Raises if required keys are missing."""
    provider = os.getenv("TTS_PROVIDER", "sarvam").strip().lower()
    logger.info(f"luna: TTS provider = {provider}")

    try:
        service = TTS_PROVIDERS[provider](language_mode)
    except KeyError:
        supported = ", ".join(supported_tts_providers())
        raise ValueError(
            f"Unknown TTS_PROVIDER='{provider}'. Supported: {supported}."
        ) from None

    return _with_pause_punctuation_transform(service)


def _require(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise ValueError(
            f"{name} is required but not set. Check server/.env."
        )
    return v


def _with_pause_punctuation_transform(service: TTSService) -> TTSService:
    async def transform(text: str, _aggregation_type) -> str:
        return tts_request_text(text)

    service.add_text_transformer(transform)
    return service


def _normalize_language_mode(language_mode: str) -> str:
    return normalize_language_mode(language_mode)


def _sarvam_language(language_mode: str) -> Language:
    mode = _normalize_language_mode(language_mode)
    if mode == HINDI:
        return Language.HI_IN
    return Language.EN_IN


def _cartesia_language(language_mode: str) -> Language:
    mode = _normalize_language_mode(language_mode)
    if mode == ENGLISH:
        return Language.EN
    if mode == HINDI:
        return Language.HI

    lang_str = os.getenv("CARTESIA_LANGUAGE", CARTESIA_HINDI_HINT).strip().lower()
    return Language.HI if lang_str.startswith(CARTESIA_HINDI_HINT) else Language.EN


def _elevenlabs_language(language_mode: str) -> Language:
    mode = _normalize_language_mode(language_mode)
    if mode == ENGLISH:
        return Language.EN
    if mode == HINDI:
        return Language.HI

    lang_str = os.getenv("ELEVENLABS_LANGUAGE", "hi").strip().lower()
    return Language.HI if lang_str.startswith("hi") else Language.EN


def _env_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}
