"""LLM provider factory for the conversation brain."""

from __future__ import annotations

import os

from loguru import logger
from pipecat.services.llm_service import LLMService
from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.sarvam.llm import SarvamLLMService


DEFAULT_LLM_PROVIDER = "sarvam"
DEFAULT_OPENAI_LLM_MODEL = "gpt-5-mini"
PROVIDER_ENV = "CONVERSATION_LLM_PROVIDER"
MODEL_ENV = "CONVERSATION_LLM_MODEL"


def build_llm() -> LLMService:
    """Construct the text LLM that decides the assistant's next reply."""
    provider = os.getenv(PROVIDER_ENV, DEFAULT_LLM_PROVIDER).strip().lower()
    logger.info(f"luna: LLM provider = {provider}")

    if provider == "sarvam":
        return _build_sarvam_llm()
    if provider == "openai":
        return _build_openai_llm()

    raise ValueError(
        f"Unknown {PROVIDER_ENV}='{provider}'. Supported: sarvam, openai."
    )


def _build_sarvam_llm() -> LLMService:
    return SarvamLLMService(api_key=_require("SARVAM_API_KEY"))


def _build_openai_llm() -> LLMService:
    model = os.getenv(MODEL_ENV, DEFAULT_OPENAI_LLM_MODEL).strip()

    settings_kwargs: dict = {"model": model}
    # Optional tuning. Higher temperature + non-zero penalties keep voice
    # replies varied across turns. max_tokens caps reply length so the bot
    # stays speakable rather than monologue-y.
    for env_name, key, caster in (
        ("LLM_TEMPERATURE", "temperature", float),
        ("LLM_PRESENCE_PENALTY", "presence_penalty", float),
        ("LLM_FREQUENCY_PENALTY", "frequency_penalty", float),
        ("LLM_TOP_P", "top_p", float),
        ("LLM_MAX_TOKENS", "max_tokens", int),
    ):
        raw = os.getenv(env_name)
        if raw is None:
            continue
        try:
            settings_kwargs[key] = caster(raw)
        except ValueError:
            logger.warning(f"{env_name} not a {caster.__name__}: {raw!r}; ignoring")

    return OpenAILLMService(
        api_key=_require("OPENAI_API_KEY"),
        settings=OpenAILLMService.Settings(**settings_kwargs),
    )


def _require(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise ValueError(f"{name} is required but not set. Check server/.env.")
    return value
