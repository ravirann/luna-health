import unittest
import asyncio

from luna_bot.webrtc_compat import (
    _candidate_sdp_is_parseable,
    _is_cancelled_error,
    patch_aioice_unref_mdns,
    patch_smallwebrtc_request_model,
)


class WebRTCCompatTests(unittest.TestCase):
    def test_empty_candidate_is_not_parseable(self):
        self.assertFalse(_candidate_sdp_is_parseable(""))

    def test_short_candidate_is_not_parseable(self):
        self.assertFalse(_candidate_sdp_is_parseable("candidate:1 1 UDP"))

    def test_complete_candidate_is_parseable(self):
        self.assertTrue(
            _candidate_sdp_is_parseable(
                "candidate:1 1 UDP 2122252543 192.0.2.10 54400 typ host"
            )
        )

    def test_cancelled_error_detection(self):
        self.assertTrue(_is_cancelled_error(asyncio.CancelledError()))
        self.assertFalse(_is_cancelled_error(RuntimeError("boom")))

    def test_aioice_mdns_unref_swallows_cancelled(self):
        patch_aioice_unref_mdns()

        from aioice import ice as aioice_ice

        class FakeProtocol:
            async def close(self):
                raise asyncio.CancelledError()

        async def run_unref():
            aioice_ice._mdns.lock = asyncio.Lock()
            aioice_ice._mdns.protocol = FakeProtocol()
            subscriber = object()
            aioice_ice._mdns.subscribers = {subscriber}
            await aioice_ice.unref_mdns_protocol(subscriber)
            self.assertIsNone(aioice_ice._mdns.protocol)

        asyncio.run(run_unref())

    def test_request_model_maps_camel_case_request_data(self):
        patch_smallwebrtc_request_model()

        from pipecat.transports.smallwebrtc.request_handler import SmallWebRTCRequest

        request = SmallWebRTCRequest(
            sdp="v=0",
            type="offer",
            requestData={"assistantToken": "token", "sessionId": "session-1"},
        )

        self.assertEqual(
            request.request_data,
            {"assistantToken": "token", "sessionId": "session-1"},
        )


if __name__ == "__main__":
    unittest.main()
