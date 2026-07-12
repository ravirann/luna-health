import unittest


class PackageImportTests(unittest.TestCase):
    def test_luna_bot_public_modules_import(self):
        from luna_bot.app import bot
        from luna_bot.config import BotConfig
        from luna_bot.lifecycle import CallBudget, attach_lifecycle_handlers
        from luna_bot.pipeline import run_bot
        from luna_bot.persistence.audio import upload_session_audio
        from luna_bot.persistence.db import TranscriptDBWriter
        from luna_bot.session import VoiceSession
        from luna_bot.voice.conversation import conversation_prompt
        from luna_bot.voice.openers import pick_opener
        from luna_bot.voice.rhythm import HumanRhythmProcessor
        from luna_bot.voice.safety import (
            SafetyGate,
            classify_crisis_risk,
            crisis_resources,
            screen_for_risk_signals,
        )
        from luna_bot.voice.tts import build_tts

        self.assertTrue(callable(bot))
        self.assertEqual(BotConfig.__name__, "BotConfig")
        self.assertEqual(CallBudget.__name__, "CallBudget")
        self.assertTrue(callable(attach_lifecycle_handlers))
        self.assertTrue(callable(run_bot))
        self.assertEqual(VoiceSession.__name__, "VoiceSession")
        self.assertTrue(callable(upload_session_audio))
        self.assertEqual(TranscriptDBWriter.__name__, "TranscriptDBWriter")
        self.assertTrue(callable(conversation_prompt))
        self.assertTrue(callable(pick_opener))
        self.assertEqual(HumanRhythmProcessor.__name__, "HumanRhythmProcessor")
        self.assertEqual(SafetyGate.__name__, "SafetyGate")
        self.assertTrue(callable(classify_crisis_risk))
        self.assertTrue(callable(crisis_resources))
        self.assertTrue(callable(screen_for_risk_signals))
        self.assertTrue(callable(build_tts))


if __name__ == "__main__":
    unittest.main()
