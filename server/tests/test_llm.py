import os
import unittest
from unittest.mock import patch

from pipecat.services.openai.llm import OpenAILLMService
from pipecat.services.sarvam.llm import SarvamLLMService

from luna_bot.voice import llm


class LLMConfigTests(unittest.TestCase):
    def test_openai_provider_uses_conversation_brain_model_env(self):
        env = {
            "CONVERSATION_LLM_PROVIDER": "openai",
            "CONVERSATION_LLM_MODEL": "gpt-5-mini",
            "OPENAI_API_KEY": "test-openai-key",
        }
        with patch.dict(os.environ, env, clear=False):
            service = llm.build_llm()

        self.assertIsInstance(service, OpenAILLMService)
        self.assertEqual(service._settings.model, "gpt-5-mini")

    def test_sarvam_provider_remains_default(self):
        env = {
            "SARVAM_API_KEY": "test-sarvam-key",
        }
        with patch.dict(os.environ, env, clear=True):
            service = llm.build_llm()

        self.assertIsInstance(service, SarvamLLMService)

    def test_unknown_provider_explains_supported_values(self):
        env = {
            "CONVERSATION_LLM_PROVIDER": "unknown",
            "SARVAM_API_KEY": "test-sarvam-key",
        }
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaisesRegex(
                ValueError,
                "Unknown CONVERSATION_LLM_PROVIDER.*Supported: sarvam, openai",
            ):
                llm.build_llm()


if __name__ == "__main__":
    unittest.main()
