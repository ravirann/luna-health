"""Pipecat runner entrypoint wiring."""

from __future__ import annotations

from loguru import logger
from pipecat.runner.types import RunnerArguments
from pipecat.transports.base_transport import TransportParams
from pipecat.transports.smallwebrtc.transport import SmallWebRTCTransport

from luna_bot.config import BotConfig
from luna_bot.pipeline import run_bot
from luna_bot.session import session_from_runner_body, should_reject_missing_session
from luna_bot.voice.conversation import build_human_vad


async def bot(runner_args: RunnerArguments):
    body = getattr(runner_args, "body", None)
    session = session_from_runner_body(body)
    if session:
        logger.info(
            f"luna: bot() entry — authed user={session.user_id} "
            f"session={session.session_id} scene={session.scene_id}"
        )
    else:
        logger.info("luna: bot() entry — anonymous (no session token)")
        if should_reject_missing_session(session):
            raise PermissionError("missing or invalid voice session token")

    transport = SmallWebRTCTransport(
        params=TransportParams(
            audio_in_enabled=True,
            audio_out_enabled=True,
            vad_analyzer=build_human_vad(),
        ),
        webrtc_connection=runner_args.webrtc_connection,
    )
    try:
        await run_bot(transport, BotConfig(), session)
    except Exception as exc:
        logger.exception(f"luna: bot() crashed: {exc}")
        raise
