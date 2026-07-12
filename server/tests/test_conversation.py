import os
import unittest

from pipecat.audio.vad.vad_analyzer import VADParams
from pipecat.turns.user_stop import SpeechTimeoutUserTurnStopStrategy

from luna_bot.voice.conversation import (
    build_human_vad,
    build_user_aggregator_params,
    conversation_prompt,
)
from luna_bot.voice.language import HINDI


class ConversationConfigTests(unittest.TestCase):
    def test_vad_config_uses_env_without_shortening_human_pause_window(self):
        old = {
            "VAD_CONFIDENCE": os.environ.get("VAD_CONFIDENCE"),
            "VAD_START_SECS": os.environ.get("VAD_START_SECS"),
            "VAD_STOP_SECS": os.environ.get("VAD_STOP_SECS"),
            "VAD_MIN_VOLUME": os.environ.get("VAD_MIN_VOLUME"),
        }
        try:
            os.environ["VAD_CONFIDENCE"] = "0.70"
            os.environ["VAD_START_SECS"] = "0.20"
            os.environ["VAD_STOP_SECS"] = "0.65"
            os.environ["VAD_MIN_VOLUME"] = "0.55"

            vad = build_human_vad()

            self.assertIsInstance(vad.params, VADParams)
            self.assertEqual(vad.params.confidence, 0.70)
            self.assertEqual(vad.params.start_secs, 0.20)
            self.assertEqual(vad.params.stop_secs, 0.65)
            self.assertEqual(vad.params.min_volume, 0.55)
        finally:
            for key, value in old.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_vad_defaults_are_not_overly_eager(self):
        old = {
            "AUDIO_IDLE_TIMEOUT": os.environ.get("AUDIO_IDLE_TIMEOUT"),
            "VAD_CONFIDENCE": os.environ.get("VAD_CONFIDENCE"),
            "VAD_START_SECS": os.environ.get("VAD_START_SECS"),
            "VAD_STOP_SECS": os.environ.get("VAD_STOP_SECS"),
            "VAD_MIN_VOLUME": os.environ.get("VAD_MIN_VOLUME"),
        }
        try:
            for key in old:
                os.environ.pop(key, None)

            vad = build_human_vad()

            self.assertEqual(vad.params.confidence, 0.70)
            self.assertEqual(vad.params.start_secs, 0.20)
            self.assertEqual(vad.params.stop_secs, 0.65)
            self.assertEqual(vad.params.min_volume, 0.55)

            params = build_user_aggregator_params()
            self.assertEqual(params.audio_idle_timeout, 2.0)
        finally:
            for key, value in old.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_user_aggregator_collects_stt_fragments_before_llm_turn(self):
        old = {
            "USER_SPEECH_TIMEOUT": os.environ.get("USER_SPEECH_TIMEOUT"),
            "USER_TURN_STOP_TIMEOUT": os.environ.get("USER_TURN_STOP_TIMEOUT"),
            "AUDIO_IDLE_TIMEOUT": os.environ.get("AUDIO_IDLE_TIMEOUT"),
        }
        try:
            os.environ["USER_SPEECH_TIMEOUT"] = "1.1"
            os.environ["USER_TURN_STOP_TIMEOUT"] = "8.5"
            os.environ["AUDIO_IDLE_TIMEOUT"] = "2.0"

            params = build_user_aggregator_params()

            self.assertEqual(params.user_turn_stop_timeout, 8.5)
            self.assertEqual(params.audio_idle_timeout, 2.0)
            self.assertEqual(len(params.user_turn_strategies.stop), 1)
            strategy = params.user_turn_strategies.stop[0]
            self.assertIsInstance(strategy, SpeechTimeoutUserTurnStopStrategy)
            self.assertEqual(strategy._user_speech_timeout, 1.1)
        finally:
            for key, value in old.items():
                if value is None:
                    os.environ.pop(key, None)
                else:
                    os.environ[key] = value

    def test_prompt_directs_emotional_presence_without_roleplay_claims(self):
        prompt = conversation_prompt("luna", "luna", "neutral", HINDI)

        self.assertIn("listen for the whole thought", prompt)
        self.assertIn("Do not answer every turn with a question", prompt)
        # The prompt must instruct the LLM not to verbalize punctuation
        # names — TTS would otherwise speak the literal words.
        self.assertIn("Never spell out", prompt)
        self.assertIn("full stop", prompt)
        self.assertIn("question mark", prompt)
        self.assertIn("Prefer Hindi", prompt)
        self.assertNotIn("romantic confidence coach", prompt)


if __name__ == "__main__":
    unittest.main()
