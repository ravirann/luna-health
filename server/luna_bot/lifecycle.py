"""Client connection lifecycle handlers for a voice session."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field

from loguru import logger
from pipecat.frames.frames import EndFrame, LLMMessagesAppendFrame, TTSSpeakFrame
from pipecat.pipeline.task import PipelineTask
from pipecat.processors.audio.audio_buffer_processor import AudioBufferProcessor
from pipecat.transports.base_transport import BaseTransport

from luna_bot.config import BotConfig
from luna_bot.persistence.audio import upload_session_audio
from luna_bot.persistence.db import notify_session_end, update_session_audio
from luna_bot.session import VoiceSession
from luna_bot.voice.openers import build_llm_opener_directive, opener_mode, pick_opener


_CLOCK_TICK_SECS = 1.0


@dataclass
class CallBudget:
    """Mutable wall-clock call budget, shared with the safety detector.

    `call_clock()` (below) polls `total_secs`/`grace_active` once per tick,
    so a call to `extend_once()` from a concurrently running task — the
    safety detector (`luna_bot.voice.safety.SafetyGate`), on a confirmed
    crisis — is picked up on the next tick without needing to interrupt an
    in-progress sleep.
    """

    total_secs: float
    grace_active: bool = False
    _grace_used: bool = field(default=False, repr=False, compare=False)

    def extend_once(self, extra_secs: float) -> bool:
        """Extend the budget by extra_secs, exactly once per call.

        Returns False (no-op) if a grace extension was already applied —
        this is a one-shot allowance, not a per-message one.
        """
        if self._grace_used:
            return False
        self._grace_used = True
        self.grace_active = True
        self.total_secs += extra_secs
        return True


def attach_lifecycle_handlers(
    *,
    transport: BaseTransport,
    task: PipelineTask,
    config: BotConfig,
    session: VoiceSession | None,
    language_mode: str,
    audio_buffer: AudioBufferProcessor,
    call_budget: CallBudget,
) -> None:
    """Attach Pipecat transport callbacks for connect, disconnect, and budget."""
    trial_task: asyncio.Task | None = None
    session_start_ts: float | None = None
    is_trial_length = call_budget.total_secs <= 240

    async def call_clock() -> None:
        """Soft warning + hard end based on the call's wall-clock budget.

        Polls `call_budget` once per tick (rather than sleeping the whole
        remaining duration in one shot) so a one-shot grace extension is
        folded in on the next tick with no need to interrupt an in-progress
        sleep. While `call_budget.grace_active` is set, the scripted
        warn/wrap-up lines are suppressed — the call still ends at the (now
        extended) deadline, just without the bot announcing a hangup
        mid-crisis.
        """
        loop = asyncio.get_running_loop()
        start = loop.time()
        warned = False
        try:
            while True:
                elapsed = loop.time() - start
                remaining = call_budget.total_secs - elapsed
                if remaining <= 0:
                    break

                warn_boundary = max(0.0, call_budget.total_secs - 30)
                if not warned and elapsed >= warn_boundary:
                    warned = True
                    logger.info("luna: budget soft-warning")
                    if not call_budget.grace_active:
                        if is_trial_length:
                            msg = (
                                "Suno na — humare paas thoda aur, bas ek minute hai. "
                                "Bata rahi hoon, taaki saath mein decide karein."
                            )
                        else:
                            msg = (
                                "Hey — humare paas ek minute aur hai. "
                                "Anything you want to land before we wrap?"
                            )
                        await task.queue_frames([TTSSpeakFrame(msg)])
                    continue

                await asyncio.sleep(min(_CLOCK_TICK_SECS, remaining))

            logger.info("luna: call budget reached, wrapping")
            if not call_budget.grace_active:
                if is_trial_length:
                    wrap = (
                        "Hamare teen minute ho gaye. Main yahin hoon jab tum "
                        "wapas aao — phir baat karenge."
                    )
                else:
                    wrap = (
                        "Hum yahin rok dete hain abhi. Jab bhi wapas aana ho — "
                        "main hoon."
                    )
                await task.queue_frames([TTSSpeakFrame(wrap), EndFrame()])
            else:
                await task.queue_frames([EndFrame()])
        except asyncio.CancelledError:
            pass

    @transport.event_handler("on_client_connected")
    async def on_client_connected(_transport, _client):
        nonlocal trial_task, session_start_ts
        logger.info(
            f"luna: on_client_connected fired — budget={call_budget.total_secs:.0f}s "
            f"(trial-length={is_trial_length})"
        )
        session_start_ts = asyncio.get_running_loop().time()

        try:
            await audio_buffer.start_recording()
        except Exception:
            logger.exception("luna: failed to start audio recording")

        try:
            if opener_mode() == "llm":
                seed_directive = build_llm_opener_directive(
                    session=session,
                    language_mode=language_mode,
                    bot_gender=config.bot_gender,
                )
                await task.queue_frames(
                    [
                        LLMMessagesAppendFrame(
                            messages=[{"role": "user", "content": seed_directive}],
                            run_llm=True,
                        )
                    ]
                )
                logger.info("luna: opener — llm mode, queued LLM trigger")
            else:
                opener = pick_opener(session, language_mode=language_mode)
                logger.info(f"luna: opener — template mode: {opener!r}")
                await task.queue_frames([TTSSpeakFrame(opener)])
        except Exception as exc:
            logger.exception(f"luna: failed to queue opener: {exc}")
        trial_task = asyncio.create_task(call_clock())

    @transport.event_handler("on_client_disconnected")
    async def on_client_disconnected(_transport, _client):
        logger.info("luna: client disconnected")
        if trial_task and not trial_task.done():
            trial_task.cancel()

        duration_secs = 0
        if session_start_ts is not None:
            duration_secs = int(asyncio.get_running_loop().time() - session_start_ts)

        if session:
            await _flush_session_side_effects(
                session=session,
                audio_buffer=audio_buffer,
                duration_secs=duration_secs,
            )

        await task.cancel()


async def _flush_session_side_effects(
    *,
    session: VoiceSession,
    audio_buffer: AudioBufferProcessor,
    duration_secs: int,
) -> None:
    try:
        pcm = audio_buffer.merge_audio_buffers()
        sample_rate = audio_buffer.sample_rate or 16000
        loop = asyncio.get_running_loop()
        uri = await loop.run_in_executor(
            None,
            lambda: upload_session_audio(
                session_id=session.session_id,
                pcm=pcm,
                sample_rate=sample_rate,
                num_channels=audio_buffer.num_channels,
            ),
        )
        if uri:
            await update_session_audio(session.session_id, uri)
    except Exception:
        logger.exception("luna: failed to capture/upload audio")

    try:
        await notify_session_end(session.session_id, duration_secs)
    except Exception:
        logger.exception("luna: notify_session_end failed")
