import base64
import hashlib
import hmac
import json
import os
import time
import unittest
from unittest.mock import patch

from luna_bot.session import should_reject_missing_session, session_from_runner_body


def signed_token(payload: dict, secret: str) -> str:
    body = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    sig = base64.urlsafe_b64encode(
        hmac.new(secret.encode(), body.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    return f"{body}.{sig}"


class RuntimeContractTests(unittest.TestCase):
    def test_session_from_runner_body_uses_assistant_token_contract(self):
        secret = "test-bot-secret"
        token = signed_token(
            {
                "sub": "user_123",
                "sid": "session_123",
                "exp": int(time.time()) + 300,
                "bud": 120,
            },
            secret,
        )

        with patch.dict(os.environ, {"BOT_SHARED_SECRET": secret}, clear=False):
            session = session_from_runner_body(
                {
                    "assistantToken": token,
                    "sceneId": "late-night",
                    "personaId": "assistant",
                    "customSeed": "need to talk",
                }
            )

        self.assertIsNotNone(session)
        self.assertEqual(session.user_id, "user_123")
        self.assertEqual(session.session_id, "session_123")
        self.assertEqual(session.persona_id, "assistant")
        self.assertEqual(session.call_budget_secs, 120)

    def test_session_from_runner_body_ignores_legacy_token_key(self):
        with patch.dict(os.environ, {"BOT_SHARED_SECRET": "secret"}, clear=False):
            session = session_from_runner_body({"legacyToken": "not-used"})

        self.assertIsNone(session)

    def test_call_budget_comes_from_signed_token_not_request_body(self):
        """callBudgetSecs in the raw body is unsigned/browser-relayed and must
        never be trusted — even when it disagrees with the signed `bud` claim."""
        secret = "test-bot-secret"
        token = signed_token(
            {
                "sub": "user_123",
                "sid": "session_123",
                "exp": int(time.time()) + 300,
                "bud": 90,
            },
            secret,
        )

        with patch.dict(os.environ, {"BOT_SHARED_SECRET": secret}, clear=False):
            session = session_from_runner_body(
                {
                    "assistantToken": token,
                    # Tampered/legacy field — must be fully ignored.
                    "callBudgetSecs": 999999,
                }
            )

        self.assertIsNotNone(session)
        self.assertEqual(session.call_budget_secs, 90)

    def test_missing_bud_claim_falls_back_to_max_call_seconds_env(self):
        secret = "test-bot-secret"
        token = signed_token(
            {
                "sub": "user_123",
                "sid": "session_123",
                "exp": int(time.time()) + 300,
                # No "bud" — simulates an old/malformed token.
            },
            secret,
        )

        with patch.dict(
            os.environ,
            {"BOT_SHARED_SECRET": secret, "MAX_CALL_SECONDS": "222"},
            clear=False,
        ):
            session = session_from_runner_body({"assistantToken": token})

        self.assertIsNotNone(session)
        self.assertEqual(session.call_budget_secs, 222)

    def test_missing_bud_claim_falls_back_to_default_600_without_env(self):
        secret = "test-bot-secret"
        token = signed_token(
            {"sub": "user_123", "sid": "session_123", "exp": int(time.time()) + 300},
            secret,
        )

        with patch.dict(os.environ, {"BOT_SHARED_SECRET": secret}, clear=True):
            session = session_from_runner_body({"assistantToken": token})

        self.assertIsNotNone(session)
        self.assertEqual(session.call_budget_secs, 600)

    def test_non_integer_bud_claim_falls_back_instead_of_crashing(self):
        secret = "test-bot-secret"
        token = signed_token(
            {
                "sub": "user_123",
                "sid": "session_123",
                "exp": int(time.time()) + 300,
                "bud": "not-a-number",
            },
            secret,
        )

        with patch.dict(
            os.environ,
            {"BOT_SHARED_SECRET": secret, "MAX_CALL_SECONDS": "333"},
            clear=False,
        ):
            session = session_from_runner_body({"assistantToken": token})

        self.assertIsNotNone(session)
        self.assertEqual(session.call_budget_secs, 333)

    def test_production_rejects_missing_session_by_default(self):
        with patch.dict(os.environ, {"ENV": "production"}, clear=True):
            self.assertTrue(should_reject_missing_session(None))

    def test_development_allows_missing_session(self):
        with patch.dict(os.environ, {"ENV": "local"}, clear=True):
            self.assertFalse(should_reject_missing_session(None))


if __name__ == "__main__":
    unittest.main()
