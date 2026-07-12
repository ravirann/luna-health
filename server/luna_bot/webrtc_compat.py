"""Compatibility patches for Pipecat SmallWebRTC signaling."""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any

from fastapi import HTTPException
from loguru import logger


def _candidate_sdp_is_parseable(candidate: str | None) -> bool:
    """Return whether aiortc.candidate_from_sdp can parse this candidate line."""
    return len((candidate or "").strip().split()) >= 8


def _is_cancelled_error(exc: BaseException) -> bool:
    return isinstance(exc, asyncio.CancelledError)


def patch_smallwebrtc_ice_candidate_handler() -> None:
    """Skip malformed ICE candidates instead of returning 500 from PATCH /api/offer.

    Some browser/client stacks send end-of-candidates or malformed candidate
    patches. The Pipecat runner currently passes every candidate string directly
    to aiortc.candidate_from_sdp(), whose parser asserts on short strings. A
    malformed candidate should not kill the whole WebRTC signaling exchange.
    """
    from pipecat.transports.smallwebrtc import request_handler

    handler_cls = request_handler.SmallWebRTCRequestHandler
    if getattr(handler_cls.handle_patch_request, "_luna_patched", False):
        return

    async def handle_patch_request(self, request):
        peer_connection = self._pcs_map.get(request.pc_id)
        if not peer_connection:
            raise HTTPException(status_code=404, detail="Peer connection not found")

        for c in request.candidates:
            raw = (c.candidate or "").strip()
            if not _candidate_sdp_is_parseable(raw):
                logger.debug("luna: skipping malformed ICE candidate patch")
                continue

            try:
                candidate = request_handler.candidate_from_sdp(raw)
            except (AssertionError, IndexError, TypeError, ValueError) as exc:
                logger.debug(f"luna: skipping unparsable ICE candidate patch: {exc}")
                continue

            candidate.sdpMid = c.sdp_mid
            candidate.sdpMLineIndex = c.sdp_mline_index
            await peer_connection.add_ice_candidate(candidate)

    handle_patch_request._luna_patched = True
    handler_cls.handle_patch_request = handle_patch_request


def patch_smallwebrtc_request_model() -> None:
    """Accept camelCase requestData in FastAPI's dataclass body parser.

    The JS transport sends `requestData`, while Pipecat's Python dataclass field
    is `request_data`. The class has a `from_dict()` helper for this, but the
    FastAPI route receives the dataclass directly, so that helper is not used.
    """
    from pipecat.transports.smallwebrtc import request_handler

    original_cls = request_handler.SmallWebRTCRequest
    if getattr(original_cls, "_luna_patched", False):
        return

    @dataclass
    class SmallWebRTCRequest:
        sdp: str
        type: str
        pc_id: str | None = None
        restart_pc: bool | None = None
        request_data: Any | None = None
        requestData: Any | None = None

        def __post_init__(self):
            if self.request_data is None and self.requestData is not None:
                self.request_data = self.requestData

        @classmethod
        def from_dict(cls, data: dict):
            if "requestData" in data and "request_data" not in data:
                data["request_data"] = data["requestData"]
            return cls(**data)

    SmallWebRTCRequest._luna_patched = True
    request_handler.SmallWebRTCRequest = SmallWebRTCRequest


def patch_smallwebrtc_cancelled_close() -> None:
    """Prevent aioice mDNS close cancellation from failing renegotiation."""
    from pipecat.transports.smallwebrtc.connection import SmallWebRTCConnection

    if getattr(SmallWebRTCConnection._close, "_luna_patched", False):
        return

    async def _close(self):
        for track in self._track_map.values():
            if track:
                track.stop()
        self._track_map.clear()
        if self._pc:
            try:
                await self._pc.close()
            except asyncio.CancelledError as exc:
                if not _is_cancelled_error(exc):
                    raise
                logger.debug("luna: ignored cancelled aioice close during WebRTC cleanup")
        self._outgoing_messages_queue.clear()
        self._data_channel_enabled = True
        self._pending_app_messages.clear()
        self._track_map = {}
        self._cancel_monitoring_connecting_state()
        self._cancel_data_channel_timeout()

    _close._luna_patched = True
    SmallWebRTCConnection._close = _close


def patch_aioice_unref_mdns() -> None:
    """Swallow CancelledError raised by aioice's mDNS teardown.

    During renegotiation, aiortc.setRemoteDescription tears down the previous
    DTLSTransport, which calls aioice.ice.unref_mdns_protocol. The mDNS
    protocol close awaits an internal future that the running task may cancel
    mid-await, surfacing a CancelledError that fails the whole offer with a
    500. The mDNS subscriber count has already been decremented by the time
    the close runs, so the cleanup is safe to ignore.
    """
    from aioice import ice as aioice_ice

    if getattr(aioice_ice.unref_mdns_protocol, "_luna_patched", False):
        return

    _mdns = aioice_ice._mdns

    async def unref_mdns_protocol(subscriber: object) -> None:
        if not hasattr(_mdns, "lock"):
            return
        async with _mdns.lock:
            _mdns.subscribers.discard(subscriber)
            if _mdns.protocol and not _mdns.subscribers:
                try:
                    await _mdns.protocol.close()
                except asyncio.CancelledError:
                    logger.debug("luna: ignored cancelled aioice mdns close")
                _mdns.protocol = None

    unref_mdns_protocol._luna_patched = True
    aioice_ice.unref_mdns_protocol = unref_mdns_protocol


def patch_smallwebrtc_runner_compat() -> None:
    patch_smallwebrtc_request_model()
    patch_smallwebrtc_ice_candidate_handler()
    patch_smallwebrtc_cancelled_close()
    patch_aioice_unref_mdns()


__all__ = [
    "_candidate_sdp_is_parseable",
    "_is_cancelled_error",
    "patch_aioice_unref_mdns",
    "patch_smallwebrtc_cancelled_close",
    "patch_smallwebrtc_ice_candidate_handler",
    "patch_smallwebrtc_request_model",
    "patch_smallwebrtc_runner_compat",
]
