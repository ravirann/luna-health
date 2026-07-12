import asyncio
import os
import unittest

from pipecat.frames.frames import EndFrame, LLMMessagesAppendFrame, TTSSpeakFrame

from luna_bot.config import BotConfig
from luna_bot.lifecycle import CallBudget, attach_lifecycle_handlers
from luna_bot.session import VoiceSession
from luna_bot.voice.language import HINDI


class FakeTransport:
    def __init__(self):
        self.handlers = {}

    def event_handler(self, name):
        def register(fn):
            self.handlers[name] = fn
            return fn

        return register


class FakeTask:
    def __init__(self):
        self.queued = []
        self.cancelled = False

    async def queue_frames(self, frames):
        self.queued.extend(frames)

    async def cancel(self):
        self.cancelled = True


class FakeAudioBuffer:
    def __init__(self):
        self.recording_started = False
        self.sample_rate = 16000
        self.num_channels = 1

    async def start_recording(self):
        self.recording_started = True

    def merge_audio_buffers(self):
        return b""


class LifecycleOpenerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncTearDown(self):
        os.environ.pop("OPENER_MODE", None)

    async def test_client_connect_queues_llm_first_turn_by_default(self):
        transport = FakeTransport()
        task = FakeTask()
        audio_buffer = FakeAudioBuffer()
        config = BotConfig(
            bot_name="luna",
            bot_gender="feminine",
            brand_name="luna",
        )
        session = VoiceSession(
            user_id="user_1",
            session_id="session_1",
            scene_id="missing-someone",
            persona_id="assistant",
            custom_seed=None,
            call_budget_secs=180,
            memory_context="MEMORY: USER NAME: Eren",
        )

        attach_lifecycle_handlers(
            transport=transport,
            task=task,
            config=config,
            session=session,
            language_mode=HINDI,
            audio_buffer=audio_buffer,
            call_budget=CallBudget(total_secs=180),
        )

        await transport.handlers["on_client_connected"](transport, object())

        self.assertTrue(audio_buffer.recording_started)
        self.assertEqual(len(task.queued), 1)
        frame = task.queued[0]
        self.assertIsInstance(frame, LLMMessagesAppendFrame)
        self.assertNotIsInstance(frame, TTSSpeakFrame)
        self.assertTrue(frame.run_llm)
        content = frame.messages[0]["content"]
        self.assertIn("Greet the user once", content)
        self.assertIn("ask about the scene", content)
        self.assertIn("their name or memory", content)
        self.assertIn("one open-ended question", content)

        await transport.handlers["on_client_disconnected"](transport, object())


class CallClockGraceTests(unittest.IsolatedAsyncioTestCase):
    """Exercises the rewritten call_clock() against a tiny budget so both
    the normal wrap-up path and the risk-grace suppression path run to
    completion in well under a second."""

    async def asyncTearDown(self):
        os.environ.pop("OPENER_MODE", None)

    async def _run_clock_to_completion(self, *, grace_active: bool) -> FakeTask:
        transport = FakeTransport()
        task = FakeTask()
        audio_buffer = FakeAudioBuffer()
        config = BotConfig(bot_name="luna", bot_gender="feminine", brand_name="luna")
        session = VoiceSession(
            user_id="user_1",
            session_id="session_1",
            scene_id=None,
            persona_id="assistant",
            custom_seed=None,
            call_budget_secs=180,
        )
        call_budget = CallBudget(total_secs=0.05)
        if grace_active:
            call_budget.grace_active = True

        attach_lifecycle_handlers(
            transport=transport,
            task=task,
            config=config,
            session=session,
            language_mode=HINDI,
            audio_buffer=audio_buffer,
            call_budget=call_budget,
        )

        await transport.handlers["on_client_connected"](transport, object())

        # Let the background call-clock task run to completion (it queues an
        # EndFrame when the — tiny — budget is exhausted).
        for _ in range(100):
            if any(isinstance(f, EndFrame) for f in task.queued):
                break
            await asyncio.sleep(0.02)

        return task

    async def test_call_clock_speaks_wrap_up_when_grace_not_active(self):
        task = await self._run_clock_to_completion(grace_active=False)
        self.assertTrue(any(isinstance(f, TTSSpeakFrame) for f in task.queued))
        self.assertTrue(any(isinstance(f, EndFrame) for f in task.queued))

    async def test_call_clock_suppresses_scripted_lines_when_grace_active(self):
        task = await self._run_clock_to_completion(grace_active=True)
        self.assertFalse(any(isinstance(f, TTSSpeakFrame) for f in task.queued))
        self.assertTrue(any(isinstance(f, EndFrame) for f in task.queued))


if __name__ == "__main__":
    unittest.main()
