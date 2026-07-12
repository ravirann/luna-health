import os
import unittest
from unittest.mock import AsyncMock, patch

from luna_bot.lifecycle import CallBudget
from luna_bot.voice import safety
from luna_bot.voice.conversation import conversation_prompt
from luna_bot.voice.safety import (
    CrisisResource,
    SafetyGate,
    build_crisis_directive,
    classify_crisis_risk,
    crisis_resources,
    risk_grace_seconds,
    screen_for_risk_signals,
)


class Tier1LexiconTests(unittest.TestCase):
    def test_flags_direct_self_harm_statements(self):
        positives = [
            "I want to kill myself",
            "sometimes I just want to die",
            "I don't want to live anymore",
            "honestly I've been thinking about suicide",
            "I feel like giving up on life",
            "she said she wants to end it all",
        ]
        for text in positives:
            with self.subTest(text=text):
                self.assertTrue(screen_for_risk_signals(text))

    def test_flags_romanized_hindi_self_harm_statements(self):
        positives = [
            "main marna chahta hoon",
            "mujhe khud ko nuksan pahunchana hai",
            "zindagi khatam karna chahti hoon",
            "ab jeene ka mann nahi karta",
            "kal se aatmahatya ke baare mein soch rahi hoon",
        ]
        for text in positives:
            with self.subTest(text=text):
                self.assertTrue(screen_for_risk_signals(text))

    def test_does_not_flag_benign_phrases(self):
        negatives = [
            "just killing time before my meeting",
            "this workout is killing me lol",
            "I'm dying to see that new movie",
            "kaam khatam ho gaya, ab so jaungi",
            "how is the weather today",
            "",
            "   ",
        ]
        for text in negatives:
            with self.subTest(text=text):
                self.assertFalse(screen_for_risk_signals(text))

    def test_case_insensitive_and_word_boundary(self):
        self.assertTrue(screen_for_risk_signals("I WANT TO KILL MYSELF right now"))
        self.assertFalse(screen_for_risk_signals("killingmyself is not a real word"))


class Tier2ClassifierFailSafeTests(unittest.IsolatedAsyncioTestCase):
    async def test_clean_no_resolves_to_not_confirmed(self):
        env = {"CONVERSATION_LLM_PROVIDER": "sarvam", "SARVAM_API_KEY": "k"}
        with patch.dict(os.environ, env, clear=True):
            with patch.object(safety, "_ask_sarvam", new=AsyncMock(return_value="no")):
                self.assertFalse(await classify_crisis_risk("killing time"))

    async def test_no_with_trailing_punctuation_still_parses_clean(self):
        env = {"CONVERSATION_LLM_PROVIDER": "sarvam", "SARVAM_API_KEY": "k"}
        with patch.dict(os.environ, env, clear=True):
            with patch.object(safety, "_ask_sarvam", new=AsyncMock(return_value=" No.\n")):
                self.assertFalse(await classify_crisis_risk("killing time"))

    async def test_yes_resolves_to_confirmed(self):
        env = {"CONVERSATION_LLM_PROVIDER": "sarvam", "SARVAM_API_KEY": "k"}
        with patch.dict(os.environ, env, clear=True):
            with patch.object(safety, "_ask_sarvam", new=AsyncMock(return_value="yes")):
                self.assertTrue(await classify_crisis_risk("i want to kill myself"))

    async def test_unparseable_output_fails_safe_to_confirmed(self):
        env = {"CONVERSATION_LLM_PROVIDER": "openai", "OPENAI_API_KEY": "k"}
        with patch.dict(os.environ, env, clear=True):
            with patch.object(
                safety, "_ask_openai", new=AsyncMock(return_value="I cannot answer that.")
            ):
                self.assertTrue(await classify_crisis_risk("some flagged text"))

    async def test_http_failure_fails_safe_to_confirmed(self):
        env = {"CONVERSATION_LLM_PROVIDER": "openai", "OPENAI_API_KEY": "k"}
        with patch.dict(os.environ, env, clear=True):
            with patch.object(
                safety, "_ask_openai", new=AsyncMock(side_effect=TimeoutError("boom"))
            ):
                self.assertTrue(await classify_crisis_risk("some flagged text"))

    async def test_missing_api_key_fails_safe_to_confirmed(self):
        with patch.dict(os.environ, {"CONVERSATION_LLM_PROVIDER": "openai"}, clear=True):
            self.assertTrue(await classify_crisis_risk("some flagged text"))

    async def test_unknown_provider_fails_safe_to_confirmed(self):
        env = {"CONVERSATION_LLM_PROVIDER": "carrier-pigeon"}
        with patch.dict(os.environ, env, clear=True):
            self.assertTrue(await classify_crisis_risk("some flagged text"))


class CallBudgetGraceTests(unittest.TestCase):
    def test_extend_once_applies_a_single_time(self):
        budget = CallBudget(total_secs=180)

        self.assertTrue(budget.extend_once(300))
        self.assertEqual(budget.total_secs, 480)
        self.assertTrue(budget.grace_active)

        # One-shot: a second call is a no-op.
        self.assertFalse(budget.extend_once(300))
        self.assertEqual(budget.total_secs, 480)


class CrisisResourcesTests(unittest.TestCase):
    def test_defaults_include_tele_manas_and_findahelpline(self):
        names = [r.name for r in crisis_resources()]
        self.assertIn("Tele-MANAS", names)
        self.assertIn("Find A Helpline", names)

    def test_env_override_is_parsed(self):
        raw = "Test Line|123456|for testing"
        with patch.dict(os.environ, {"CRISIS_RESOURCES": raw}, clear=False):
            resources = crisis_resources()
        self.assertEqual(len(resources), 1)
        self.assertEqual(resources[0].name, "Test Line")
        self.assertEqual(resources[0].contact, "123456")
        self.assertEqual(resources[0].note, "for testing")

    def test_malformed_env_entry_falls_back_to_defaults(self):
        # Every entry here is missing a name or a contact, so parsing yields
        # nothing usable — crisis_resources() must fall back to the defaults
        # rather than surface an empty resource list.
        with patch.dict(os.environ, {"CRISIS_RESOURCES": "no-pipe-here;;|missing-name"}, clear=False):
            resources = crisis_resources()
        names = [r.name for r in resources]
        self.assertIn("Tele-MANAS", names)

    def test_directive_includes_configured_resources(self):
        directive = build_crisis_directive((CrisisResource("Test Line", "123456"),))
        self.assertIn("Test Line", directive)
        self.assertIn("123456", directive)


class SystemPromptSafetySectionTests(unittest.TestCase):
    def test_prompt_contains_safety_section_and_a_resource(self):
        prompt = conversation_prompt("luna", "luna", "feminine")
        self.assertIn("Safety:", prompt)
        self.assertIn("do not diagnose", prompt.lower())
        self.assertIn("14416", prompt)  # Tele-MANAS, from the default resources

    def test_prompt_uses_explicitly_passed_resources_over_env(self):
        custom = (CrisisResource("Custom Line", "000111"),)
        prompt = conversation_prompt("luna", "luna", "feminine", resources=custom)
        self.assertIn("Custom Line", prompt)
        self.assertIn("000111", prompt)


class SafetyGateEscalationTests(unittest.IsolatedAsyncioTestCase):
    """Tests SafetyGate's own orchestration logic. push_frame/create_task are
    pipecat FrameProcessor machinery that normally requires a running
    pipeline to wire up; we substitute lightweight fakes for them so these
    tests exercise SafetyGate's decisions without needing a full pipeline."""

    def _make_gate(self, *, resources=()):
        rtvi = AsyncMock()
        call_budget = CallBudget(total_secs=180)
        gate = SafetyGate(session=None, rtvi=rtvi, call_budget=call_budget, resources=resources)
        gate.push_frame = AsyncMock()
        return gate, rtvi, call_budget

    async def test_confirmed_crisis_triggers_all_three_side_effects_once(self):
        gate, rtvi, call_budget = self._make_gate(resources=(CrisisResource("Test Line", "123456"),))

        with patch.object(safety, "classify_crisis_risk", new=AsyncMock(return_value=True)):
            await gate._escalate_if_confirmed("i want to kill myself")

        # (1) one-time system directive appended to the live LLM context.
        gate.push_frame.assert_awaited_once()
        pushed_frame = gate.push_frame.call_args[0][0]
        self.assertIn("Test Line", pushed_frame.messages[0]["content"])
        self.assertIn("123456", pushed_frame.messages[0]["content"])
        self.assertFalse(pushed_frame.run_llm)

        # (2) wall-clock budget extended once by RISK_GRACE_SECONDS.
        self.assertTrue(call_budget.grace_active)
        self.assertEqual(call_budget.total_secs, 180 + risk_grace_seconds())

        # (3) RTVI server message with the exact documented payload.
        rtvi.send_server_message.assert_awaited_once_with({"kind": "risk", "level": "crisis"})

    async def test_confirmed_crisis_only_escalates_once_per_session(self):
        gate, rtvi, call_budget = self._make_gate()

        with patch.object(safety, "classify_crisis_risk", new=AsyncMock(return_value=True)):
            await gate._escalate_if_confirmed("first flagged utterance")
            await gate._escalate_if_confirmed("second flagged utterance")

        self.assertEqual(rtvi.send_server_message.await_count, 1)
        self.assertEqual(gate.push_frame.await_count, 1)
        # Budget extended once, not twice.
        self.assertEqual(call_budget.total_secs, 180 + risk_grace_seconds())

    async def test_unconfirmed_risk_triggers_no_side_effects(self):
        gate, rtvi, call_budget = self._make_gate()

        with patch.object(safety, "classify_crisis_risk", new=AsyncMock(return_value=False)):
            await gate._escalate_if_confirmed("killing time")

        gate.push_frame.assert_not_called()
        rtvi.send_server_message.assert_not_awaited()
        self.assertFalse(call_budget.grace_active)
        self.assertEqual(call_budget.total_secs, 180)

    async def test_process_frame_spawns_escalation_only_on_tier1_hit(self):
        from pipecat.frames.frames import TranscriptionFrame
        from pipecat.processors.frame_processor import FrameDirection

        gate, _rtvi, _call_budget = self._make_gate()
        spawned = []
        gate.create_task = lambda coro, name=None, context=None: spawned.append(coro)

        benign = TranscriptionFrame(text="killing time before my meeting", user_id="u", timestamp="t")
        await gate.process_frame(benign, FrameDirection.DOWNSTREAM)
        self.assertEqual(spawned, [])
        gate.push_frame.assert_awaited_once_with(benign, FrameDirection.DOWNSTREAM)

        gate.push_frame.reset_mock()
        risky = TranscriptionFrame(text="i want to kill myself", user_id="u", timestamp="t")
        await gate.process_frame(risky, FrameDirection.DOWNSTREAM)
        self.assertEqual(len(spawned), 1)
        gate.push_frame.assert_awaited_once_with(risky, FrameDirection.DOWNSTREAM)

        # The escalation coroutine itself is covered by the tests above —
        # close it here so it isn't reported as "never awaited".
        spawned[0].close()


if __name__ == "__main__":
    unittest.main()
