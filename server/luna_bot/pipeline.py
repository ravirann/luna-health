"""Pipecat pipeline assembly for a Luna voice call."""

from __future__ import annotations

import os

from loguru import logger
from pipecat.pipeline.pipeline import Pipeline
from pipecat.pipeline.runner import PipelineRunner
from pipecat.pipeline.task import PipelineParams, PipelineTask
from pipecat.processors.aggregators.llm_context import LLMContext
from pipecat.processors.aggregators.llm_response_universal import (
    LLMContextAggregatorPair,
)
from pipecat.processors.audio.audio_buffer_processor import AudioBufferProcessor
from pipecat.processors.frameworks.rtvi import RTVIObserver, RTVIProcessor
from pipecat.services.sarvam.stt import SarvamSTTService
from pipecat.transports.base_transport import BaseTransport

from luna_bot.config import BotConfig
from luna_bot.lifecycle import CallBudget, attach_lifecycle_handlers
from luna_bot.persistence.db import TranscriptDBWriter
from luna_bot.session import VoiceSession
from luna_bot.voice.conversation import (
    build_user_aggregator_params,
    conversation_prompt,
    env_bool,
)
from luna_bot.voice.language import DEFAULT_LANGUAGE_MODE, normalize_language_mode
from luna_bot.voice.llm import build_llm
from luna_bot.voice.rhythm import HumanRhythmProcessor
from luna_bot.voice.safety import CrisisResource, SafetyGate, crisis_resources
from luna_bot.voice.tts import build_tts


async def run_bot(
    transport: BaseTransport,
    config: BotConfig,
    session: VoiceSession | None,
) -> None:
    logger.info(
        "luna: run_bot entered, building pipeline (authed=%s)",
        bool(session),
    )

    _warn_if_sarvam_key_missing()

    logger.info(f"luna: init Sarvam STT model={config.stt_model}")
    stt = SarvamSTTService(
        api_key=os.environ["SARVAM_API_KEY"],
        mode="transcribe",
        settings=SarvamSTTService.Settings(
            model=config.stt_model,
            high_vad_sensitivity=env_bool("STT_HIGH_VAD_SENSITIVITY", False),
        ),
    )

    llm = build_llm()

    language_mode = _language_mode_for(session)
    logger.info(f"luna: building TTS language={language_mode}")
    tts = build_tts(language_mode)

    resources = crisis_resources()
    context = LLMContext(messages=[{
        "role": "system",
        "content": _compose_prompt(config, session, language_mode, resources),
    }])
    aggregators = LLMContextAggregatorPair(
        context,
        user_params=build_user_aggregator_params(),
    )
    user_aggregator = aggregators.user()
    assistant_aggregator = aggregators.assistant()

    @user_aggregator.event_handler("on_user_turn_started")
    async def on_user_turn_started(_aggregator, strategy):
        logger.info(f"luna: user turn started via {strategy}")

    @user_aggregator.event_handler("on_user_turn_stopped")
    async def on_user_turn_stopped(_aggregator, strategy, message):
        logger.info(
            f"luna: user turn stopped via {strategy}, "
            f"chars={len(message.content or '')}"
        )

    rtvi = RTVIProcessor()
    # The initial wall-clock budget: the signed token's `bud` claim (via
    # session.call_budget_secs — see luna_bot.session), or the server
    # fallback when there's no session at all (anonymous/dev mode). Shared,
    # mutable object: SafetyGate can extend it once on a confirmed crisis,
    # and the lifecycle call-clock reads it every tick. Constructed here
    # (composition root) so both can hold the same instance.
    call_budget = CallBudget(
        total_secs=float(session.call_budget_secs if session else config.max_call_seconds)
    )
    safety_gate = SafetyGate(
        session=session,
        rtvi=rtvi,
        call_budget=call_budget,
        resources=resources,
    )
    user_db_tap = TranscriptDBWriter(session.session_id if session else None)
    bot_db_tap = TranscriptDBWriter(session.session_id if session else None)
    audio_buffer = AudioBufferProcessor(num_channels=1, buffer_size=0)

    pipeline = Pipeline(
        [
            transport.input(),
            rtvi,
            stt,
            safety_gate,
            user_db_tap,
            user_aggregator,
            llm,
            HumanRhythmProcessor(),
            tts,
            bot_db_tap,
            transport.output(),
            audio_buffer,
            assistant_aggregator,
        ]
    )

    task = PipelineTask(
        pipeline,
        params=PipelineParams(
            enable_metrics=True,
            enable_usage_metrics=True,
            allow_interruptions=True,
        ),
        observers=[RTVIObserver(rtvi)],
    )
    attach_lifecycle_handlers(
        transport=transport,
        task=task,
        config=config,
        session=session,
        language_mode=language_mode,
        audio_buffer=audio_buffer,
        call_budget=call_budget,
    )

    logger.info("luna: pipeline built, starting runner")
    try:
        await PipelineRunner(handle_sigint=False).run(task)
    except Exception as exc:
        logger.exception(f"luna: runner failed: {exc}")
        raise
    logger.info("luna: runner exited cleanly")


def _warn_if_sarvam_key_missing() -> None:
    key = os.environ.get("SARVAM_API_KEY")
    if not key or key.startswith("your_"):
        logger.error("luna: SARVAM_API_KEY missing or placeholder; bot will not be able to speak")


def _language_mode_for(session: VoiceSession | None) -> str:
    if session and session.user_prefs:
        return normalize_language_mode(
            session.user_prefs.get("languageMode")
            or session.user_prefs.get("language_mode")
            or DEFAULT_LANGUAGE_MODE
        )
    return DEFAULT_LANGUAGE_MODE


def _compose_prompt(
    config: BotConfig,
    session: VoiceSession | None,
    language_mode: str,
    resources: tuple[CrisisResource, ...],
) -> str:
    base_prompt = conversation_prompt(
        brand_name=config.brand_name,
        bot_name=config.bot_name,
        bot_gender=config.bot_gender,
        language_mode=language_mode,
        resources=resources,
    )
    if not session:
        return base_prompt

    extras: list[str] = []
    if session.scene_id:
        extras.append(f"SCENE: the user picked the '{session.scene_id}' scene; meet them there.")
    if session.persona_id and session.persona_id != "assistant":
        extras.append(f"PERSONA: respond as if you were '{session.persona_id}'.")
    if session.custom_seed:
        seed = session.custom_seed[:400].replace("\n", " ")
        extras.append(f"USER_SEED: '{seed}' — start by acknowledging this directly.")

    composed = base_prompt
    if extras:
        composed += "\n\n" + "\n".join(extras)
    if session.prefs_context:
        composed += "\n\n" + session.prefs_context
    if session.memory_context:
        composed += "\n\n" + session.memory_context
    return composed
