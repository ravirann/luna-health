"""Postgres persistence and transcript pipeline taps."""

from __future__ import annotations

import asyncio
import base64
import hmac
import hashlib
import json
import os
import time
from typing import Optional

import aiohttp
import asyncpg
from loguru import logger
from pipecat.frames.frames import Frame, TranscriptionFrame, TTSTextFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor


_pool: Optional[asyncpg.Pool] = None


async def get_pg_pool() -> Optional[asyncpg.Pool]:
    """Lazy-initialize a process-wide asyncpg pool. Returns None if no DB."""
    global _pool
    if _pool is not None:
        return _pool
    url = os.getenv("DATABASE_URL")
    if not url:
        logger.warning("DATABASE_URL not set; bot will not persist transcripts")
        return None
    # Neon / managed Postgres uses TLS. asyncpg reads sslmode from the DSN.
    _pool = await asyncpg.create_pool(dsn=url, min_size=1, max_size=4)
    return _pool


async def write_transcript(session_id: str, role: str, text: str) -> None:
    pool = await get_pg_pool()
    if not pool:
        return
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "INSERT INTO transcripts (session_id, role, text) VALUES ($1, $2, $3)",
                session_id,
                role,
                text,
            )
    except Exception:
        logger.exception("luna: write_transcript failed")


async def update_session_audio(session_id: str, audio_url: str) -> None:
    """Record the R2 URL of the saved audio for this session."""
    pool = await get_pg_pool()
    if not pool:
        return
    try:
        async with pool.acquire() as conn:
            await conn.execute(
                "UPDATE sessions SET audio_url = $1 WHERE id = $2",
                audio_url,
                session_id,
            )
    except Exception:
        logger.exception("luna: update_session_audio failed")


async def notify_session_end(session_id: str, duration_secs: int) -> None:
    """POST to /api/internal/session/{id}/end with HMAC auth.

    Fires from the bot's disconnect handler so the wallet is debited even if
    the browser tab closes. The web endpoint is idempotent.
    """
    next_url = os.getenv("NEXT_APP_URL")
    secret = os.getenv("BOT_SHARED_SECRET")
    if not next_url or not secret:
        return

    body = json.dumps({"durationSecs": int(duration_secs)})
    ts = str(int(time.time()))
    msg = f"{ts}.{session_id}.{body}"
    sig = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), msg.encode("utf-8"), hashlib.sha256).digest()
    ).decode("ascii").rstrip("=")

    url = f"{next_url.rstrip('/')}/api/internal/session/{session_id}/end"
    headers = {
        "Content-Type": "application/json",
        "X-Assistant-Timestamp": ts,
        "X-Assistant-Signature": sig,
    }

    try:
        timeout = aiohttp.ClientTimeout(total=5)
        async with aiohttp.ClientSession(timeout=timeout) as http:
            async with http.post(url, data=body, headers=headers) as resp:
                if resp.status >= 400:
                    text = await resp.text()
                    logger.warning(
                        f"notify_session_end: HTTP {resp.status} for {session_id}: {text[:200]}"
                    )
                else:
                    logger.info(
                        f"notify_session_end: posted ({duration_secs}s) for {session_id}"
                    )
    except Exception:
        logger.exception("notify_session_end: request failed")


class TranscriptDBWriter(FrameProcessor):
    """Tap-only FrameProcessor that writes final transcript text to Postgres."""

    def __init__(self, session_id: Optional[str]):
        super().__init__()
        self._session_id = session_id

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)
        sid = self._session_id
        if sid:
            text = getattr(frame, "text", None)
            if isinstance(frame, TranscriptionFrame) and text:
                asyncio.create_task(write_transcript(sid, "user", text.strip()))
            elif isinstance(frame, TTSTextFrame) and text:
                asyncio.create_task(write_transcript(sid, "assistant", text.strip()))
        await self.push_frame(frame, direction)
