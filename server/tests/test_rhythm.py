import unittest

from pipecat.frames.frames import LLMFullResponseEndFrame, TextFrame, TTSSpeakFrame
from pipecat.processors.frame_processor import FrameDirection

from luna_bot.voice.rhythm import (
    HumanRhythmProcessor,
    humanize_reply_text,
    pause_seconds_after,
    split_speakable_chunks,
    tts_request_text,
)


class HumanRhythmTests(unittest.TestCase):
    def test_humanize_reply_text_adds_breathing_punctuation(self):
        text = "haan samajh rahi hoon yaar bata kya hua"

        result = humanize_reply_text(text)

        self.assertEqual(result, "Haan, samajh rahi hoon yaar. Bata kya hua?")

    def test_split_speakable_chunks_keeps_short_sentence_units(self):
        text = "Haan, samajh rahi hoon. Thoda heavy lag raha hai. Bata kya hua?"

        chunks = split_speakable_chunks(text)

        self.assertEqual(
            chunks,
            [
                "Haan, samajh rahi hoon.",
                "Thoda heavy lag raha hai.",
                "Bata kya hua?",
            ],
        )

    def test_pause_seconds_after_gives_emotional_acknowledgement_more_space(self):
        # Acknowledgement openers ("Haan, ...") should pause longer than a
        # plain question — the relative ordering is what matters, not the
        # exact numbers (those are env-tunable).
        self.assertGreater(
            pause_seconds_after("Haan, samajh rahi hoon."),
            pause_seconds_after("Bata kya hua?"),
        )

    def test_pause_seconds_after_respects_env_overrides(self):
        import os

        keys = (
            "RHYTHM_PAUSE_QUESTION",
            "RHYTHM_PAUSE_ACK",
            "RHYTHM_PAUSE_ELLIPSIS",
            "RHYTHM_PAUSE_DEFAULT",
        )
        previous = {k: os.environ.get(k) for k in keys}
        try:
            os.environ["RHYTHM_PAUSE_QUESTION"] = "0.10"
            os.environ["RHYTHM_PAUSE_ACK"] = "1.20"
            self.assertAlmostEqual(pause_seconds_after("Bata kya hua?"), 0.10)
            self.assertAlmostEqual(
                pause_seconds_after("Haan, samajh rahi hoon."),
                1.20,
            )
        finally:
            for k, v in previous.items():
                if v is None:
                    os.environ.pop(k, None)
                else:
                    os.environ[k] = v

    def test_processor_buffers_streaming_llm_chunks_until_sentence_boundary(self):
        class CaptureRhythmProcessor(HumanRhythmProcessor):
            def __init__(self):
                super().__init__()
                self.frames = []

            async def push_frame(self, frame, direction=FrameDirection.DOWNSTREAM):
                self.frames.append(frame)

        async def run_processor():
            processor = CaptureRhythmProcessor()
            await processor.process_frame(TextFrame("haan samajh "), FrameDirection.DOWNSTREAM)
            await processor.process_frame(TextFrame("rahi hoon. bata "), FrameDirection.DOWNSTREAM)
            await processor.process_frame(TextFrame("kya hua"), FrameDirection.DOWNSTREAM)
            await processor.process_frame(LLMFullResponseEndFrame(), FrameDirection.DOWNSTREAM)
            return processor.frames

        import asyncio

        frames = asyncio.run(run_processor())
        spoken = [frame.text for frame in frames if isinstance(frame, TextFrame)]

        self.assertEqual(spoken, ["Haan, samajh rahi hoon.", "Bata kya hua?"])

    def test_processor_preserves_sentence_boundaries_for_downstream_text(self):
        class CaptureRhythmProcessor(HumanRhythmProcessor):
            def __init__(self):
                super().__init__()
                self.frames = []

            async def push_frame(self, frame, direction=FrameDirection.DOWNSTREAM):
                self.frames.append(frame)

        async def run_processor():
            processor = CaptureRhythmProcessor()
            await processor.process_frame(
                TTSSpeakFrame("Hello.Main luna hoon.Aapko kya bulaun?"),
                FrameDirection.DOWNSTREAM,
            )
            return processor.frames

        import asyncio

        frames = asyncio.run(run_processor())
        spoken = [frame.text for frame in frames if isinstance(frame, TTSSpeakFrame)]

        self.assertEqual(spoken, ["Hello.", "Main luna hoon.", "Aapko kya bulaun?"])

    def test_tts_request_text_removes_only_pause_punctuation(self):
        self.assertEqual(tts_request_text("Ravi."), "Ravi")
        self.assertEqual(tts_request_text("Aapko kya bulaun?"), "Aapko kya bulaun")


if __name__ == "__main__":
    unittest.main()
