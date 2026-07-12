import os
import unittest
from unittest.mock import patch

from pipecat.services.cartesia.tts import GenerationConfig
from pipecat.services.elevenlabs.tts import ElevenLabsTTSService
from pipecat.transcriptions.language import Language

from luna_bot.voice.language import CARTESIA_HINDI_HINT
from luna_bot.voice.language import DEFAULT_LANGUAGE_MODE, ENGLISH, HINDI
from luna_bot.voice import tts


class TTSConfigTests(unittest.TestCase):
    def test_supported_tts_providers_are_discoverable(self):
        self.assertEqual(
            tts.supported_tts_providers(),
            ("cartesia", "elevenlabs", "sarvam"),
        )

    def test_unknown_tts_provider_error_lists_supported_providers(self):
        with patch.dict(os.environ, {"TTS_PROVIDER": "unknown"}, clear=False):
            with self.assertRaisesRegex(
                ValueError,
                "Unknown TTS_PROVIDER='unknown'.*Supported: cartesia, elevenlabs, sarvam",
            ):
                tts.build_tts()

    def test_elevenlabs_uses_env_driven_voice_settings(self):
        env = {
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_VOICE_ID": "voice-id",
            "ELEVENLABS_MODEL": "eleven_flash_v2_5",
            "ELEVENLABS_LANGUAGE": "hi",
            "ELEVENLABS_STABILITY": "0.46",
            "ELEVENLABS_SIMILARITY_BOOST": "0.82",
            "ELEVENLABS_STYLE": "0.18",
            "ELEVENLABS_USE_SPEAKER_BOOST": "true",
            "ELEVENLABS_SPEED": "0.94",
        }
        with patch.dict(os.environ, env, clear=False):
            settings = tts.elevenlabs_settings_from_env()

        self.assertIsInstance(settings, ElevenLabsTTSService.Settings)
        self.assertEqual(settings.voice, "voice-id")
        self.assertEqual(settings.model, "eleven_flash_v2_5")
        self.assertEqual(settings.language, Language.HI)
        self.assertEqual(settings.stability, 0.46)
        self.assertEqual(settings.similarity_boost, 0.82)
        self.assertEqual(settings.style, 0.18)
        self.assertIs(settings.use_speaker_boost, True)
        self.assertEqual(settings.speed, 0.94)

    def test_elevenlabs_language_mode_overrides_language_hint(self):
        env = {
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_VOICE_ID": "voice-id",
            "ELEVENLABS_MODEL": "eleven_flash_v2_5",
            "ELEVENLABS_LANGUAGE": "hi",
        }
        with patch.dict(os.environ, env, clear=False):
            english = tts.elevenlabs_settings_from_env(ENGLISH)
            hindi = tts.elevenlabs_settings_from_env(HINDI)

        self.assertEqual(english.language, Language.EN)
        self.assertEqual(hindi.language, Language.HI)

    def test_build_tts_can_construct_elevenlabs_provider(self):
        env = {
            "TTS_PROVIDER": "elevenlabs",
            "ELEVENLABS_API_KEY": "test-key",
            "ELEVENLABS_VOICE_ID": "voice-id",
            "ELEVENLABS_MODEL": "eleven_flash_v2_5",
        }
        with patch.dict(os.environ, env, clear=False):
            service = tts.build_tts()

        self.assertIsInstance(service, ElevenLabsTTSService)

    def test_cartesia_uses_env_driven_generation_config(self):
        env = {
            "CARTESIA_API_KEY": "test-key",
            "CARTESIA_VOICE_ID": "voice-id",
            "CARTESIA_MODEL": "sonic-3",
            "CARTESIA_LANGUAGE": CARTESIA_HINDI_HINT,
            "CARTESIA_SPEED": "0.92",
            "CARTESIA_EMOTION": "sympathetic",
            "CARTESIA_VOLUME": "0.95",
        }
        with patch.dict(os.environ, env, clear=False):
            settings = tts.cartesia_settings_from_env()

        self.assertEqual(settings.voice, "voice-id")
        self.assertEqual(settings.model, "sonic-3")
        self.assertIsInstance(settings.generation_config, GenerationConfig)
        self.assertEqual(settings.generation_config.speed, 0.92)
        self.assertEqual(settings.generation_config.emotion, "sympathetic")
        self.assertEqual(settings.generation_config.volume, 0.95)

    def test_cartesia_language_mode_overrides_language_hint(self):
        env = {
            "CARTESIA_API_KEY": "test-key",
            "CARTESIA_VOICE_ID": "voice-id",
            "CARTESIA_MODEL": "sonic-3",
            "CARTESIA_LANGUAGE": CARTESIA_HINDI_HINT,
        }
        with patch.dict(os.environ, env, clear=False):
            english = tts.cartesia_settings_from_env(ENGLISH)
            hindi = tts.cartesia_settings_from_env(HINDI)

        self.assertEqual(english.language, Language.EN)
        self.assertEqual(hindi.language, Language.HI)

    def test_sarvam_settings_uses_env_driven_pace_and_temperature(self):
        env = {
            "SARVAM_API_KEY": "test-key",
            "TTS_MODEL": "bulbul:v3-beta",
            "TTS_VOICE": "priya",
            "TTS_PACE": "0.94",
            "TTS_TEMPERATURE": "0.72",
        }
        with patch.dict(os.environ, env, clear=False):
            settings = tts.sarvam_settings_from_env()

        self.assertEqual(settings.voice, "priya")
        self.assertEqual(settings.model, "bulbul:v3-beta")
        self.assertEqual(settings.pace, 0.94)
        self.assertEqual(settings.temperature, 0.72)

    def test_sarvam_language_mode_overrides_language_hint(self):
        env = {
            "SARVAM_API_KEY": "test-key",
            "TTS_MODEL": "bulbul:v3-beta",
            "TTS_VOICE": "priya",
        }
        with patch.dict(os.environ, env, clear=False):
            english = tts.sarvam_settings_from_env(ENGLISH)
            hindi = tts.sarvam_settings_from_env(HINDI)

        self.assertEqual(english.language, Language.EN_IN)
        self.assertEqual(hindi.language, Language.HI_IN)

    def test_tts_language_defaults_are_shared_constants(self):
        self.assertEqual(tts._normalize_language_mode("unknown"), DEFAULT_LANGUAGE_MODE)
        self.assertEqual(tts._normalize_language_mode(HINDI), HINDI)


if __name__ == "__main__":
    unittest.main()
