import os
import unittest

from luna_bot.voice.openers import opener_mode


class OpenerModeTests(unittest.TestCase):
    def test_opener_mode_defaults_to_llm_first_turn(self):
        old = os.environ.get("OPENER_MODE")
        try:
            os.environ.pop("OPENER_MODE", None)

            self.assertEqual(opener_mode(), "llm")
        finally:
            if old is None:
                os.environ.pop("OPENER_MODE", None)
            else:
                os.environ["OPENER_MODE"] = old

    def test_invalid_opener_mode_falls_back_to_llm(self):
        old = os.environ.get("OPENER_MODE")
        try:
            os.environ["OPENER_MODE"] = "robot"

            self.assertEqual(opener_mode(), "llm")
        finally:
            if old is None:
                os.environ.pop("OPENER_MODE", None)
            else:
                os.environ["OPENER_MODE"] = old


if __name__ == "__main__":
    unittest.main()
