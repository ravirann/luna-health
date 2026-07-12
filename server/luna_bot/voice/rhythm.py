"""Human speech rhythm processing for bot replies."""

from __future__ import annotations

import asyncio
import os
import re

from pipecat.frames.frames import Frame, InterruptionFrame, LLMFullResponseEndFrame, StartFrame, TextFrame, TTSSpeakFrame
from pipecat.processors.frame_processor import FrameDirection, FrameProcessor


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        return float(raw)
    except ValueError:
        return default


ACK_STARTERS = (
    "haan",
    "i hear",
    "i get",
    "that sounds",
    "samajh",
    "main samajh",
    "no need",
    "theek hai",
)


def humanize_reply_text(text: str) -> str:
    """Add minimal punctuation that helps TTS sound less rushed."""

    cleaned = re.sub(r"\s+", " ", text.strip())
    if not cleaned:
        return cleaned

    cleaned = re.sub(r"([.!?…])(?=[^\W\d_])", r"\1 ", cleaned)
    cleaned = _capitalize_first(cleaned)
    cleaned = re.sub(r"^(Haan|Han|Hmm)\s+", r"\1, ", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(yaar)\s+(bata)\b", r"\1. \2", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\b(hoon|hu|hai|tha|thi|the|heavy)\s+(bata)\b", r"\1. \2", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(
        r"([.!?…]\s+)([a-z])",
        lambda match: match.group(1) + match.group(2).upper(),
        cleaned,
    )

    if not re.search(r"[.!?…]$", cleaned):
        question_starters = ("bata", "kya", "kaise", "kahan", "kab", "who", "what", "how", "why")
        tail = cleaned.split(".")[-1].strip().lower()
        cleaned += "?" if tail.startswith(question_starters) else "."

    return cleaned


def split_speakable_chunks(text: str) -> list[str]:
    """Split reply text into sentence-like chunks for separate TTS pacing."""

    normalized = humanize_reply_text(text)
    if not normalized:
        return []
    parts = re.findall(r"[^.!?…]+[.!?…]+|[^.!?…]+$", normalized)
    return [part.strip() for part in parts if part.strip()]


def pause_seconds_after(chunk: str) -> float:
    """Return the small pause to leave after a spoken chunk.

    Tunable via env so you can change the cadence without redeploying:
      RHYTHM_PAUSE_QUESTION   (default 0.45) — after a "?"
      RHYTHM_PAUSE_ACK        (default 0.70) — after an acknowledgement opener
      RHYTHM_PAUSE_ELLIPSIS   (default 0.85) — after a "…" (tender / unfinished)
      RHYTHM_PAUSE_DEFAULT    (default 0.55) — after any other sentence-ender
    """

    lowered = chunk.strip().lower()
    if not lowered:
        return 0.0
    if lowered.endswith("?"):
        return _env_float("RHYTHM_PAUSE_QUESTION", 0.45)
    if any(lowered.startswith(starter) for starter in ACK_STARTERS):
        return _env_float("RHYTHM_PAUSE_ACK", 0.70)
    if lowered.endswith("…"):
        return _env_float("RHYTHM_PAUSE_ELLIPSIS", 0.85)
    return _env_float("RHYTHM_PAUSE_DEFAULT", 0.55)


class HumanRhythmProcessor(FrameProcessor):
    """Break LLM text into speakable chunks and leave small real pauses."""

    def __init__(self):
        super().__init__()
        self._text_buffer = ""

    async def process_frame(self, frame: Frame, direction: FrameDirection):
        await super().process_frame(frame, direction)

        if isinstance(frame, (StartFrame, InterruptionFrame)):
            self._text_buffer = ""
            await self.push_frame(frame, direction)
            return

        if isinstance(frame, TextFrame):
            self._text_buffer += frame.text
            await self._flush_complete_text_chunks(direction, getattr(frame, "append_to_context", True))
            return

        if isinstance(frame, LLMFullResponseEndFrame):
            await self._flush_text_buffer(direction, append_to_context=True)
            await self.push_frame(frame, direction)
            return

        if isinstance(frame, TTSSpeakFrame):
            chunks = split_speakable_chunks(frame.text)
            if not chunks:
                return
            for index, chunk in enumerate(chunks):
                await self.push_frame(
                    TTSSpeakFrame(chunk, append_to_context=frame.append_to_context),
                    direction,
                )
                if index < len(chunks) - 1:
                    await asyncio.sleep(pause_seconds_after(chunk))
            return

        await self.push_frame(frame, direction)

    async def _flush_complete_text_chunks(self, direction: FrameDirection, append_to_context: bool):
        while True:
            match = re.search(r"[.!?…](?:\s+|$)", self._text_buffer)
            if not match:
                return
            chunk = self._text_buffer[: match.end()].strip()
            self._text_buffer = self._text_buffer[match.end() :]
            await self._push_spoken_text(chunk, direction, append_to_context)

    async def _flush_text_buffer(self, direction: FrameDirection, append_to_context: bool):
        chunk = self._text_buffer.strip()
        self._text_buffer = ""
        if chunk:
            await self._push_spoken_text(chunk, direction, append_to_context)

    async def _push_spoken_text(self, text: str, direction: FrameDirection, append_to_context: bool):
        chunks = split_speakable_chunks(text)
        for index, chunk in enumerate(chunks):
            out = TextFrame(chunk)
            out.includes_inter_frame_spaces = True
            out.append_to_context = append_to_context
            await self.push_frame(out, direction)
            if index < len(chunks) - 1:
                await asyncio.sleep(pause_seconds_after(chunk))


def tts_request_text(chunk: str) -> str:
    """Return provider-facing text, without punctuation used only for pauses."""

    return re.sub(r"\s*[.!?…]+\s*$", "", chunk.strip())


def _capitalize_first(text: str) -> str:
    return text[:1].upper() + text[1:] if text else text
