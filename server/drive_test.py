"""Quick aiortc client that sends a real offer to localhost:7860/api/offer.

Used to verify the bot fires on_client_connected and starts speaking,
without needing a browser. Adds an audio track so the bot has something
to negotiate against.
"""

import asyncio
import json

import aiohttp
from aiortc import (
    RTCPeerConnection,
    RTCSessionDescription,
    MediaStreamTrack,
)
from aiortc.contrib.media import MediaBlackhole


class SilentAudioTrack(MediaStreamTrack):
    """A track that emits silent audio frames continuously."""

    kind = "audio"

    def __init__(self):
        super().__init__()
        from av import AudioFrame
        import numpy as np

        self._sample_rate = 48000
        self._samples_per_frame = 960
        self._np = np
        self._AudioFrame = AudioFrame
        self._timestamp = 0

    async def recv(self):
        await asyncio.sleep(self._samples_per_frame / self._sample_rate)
        samples = self._np.zeros(self._samples_per_frame, dtype="int16")
        frame = self._AudioFrame.from_ndarray(samples.reshape(1, -1), format="s16", layout="mono")
        frame.sample_rate = self._sample_rate
        frame.pts = self._timestamp
        frame.time_base = __import__("fractions").Fraction(1, self._sample_rate)
        self._timestamp += self._samples_per_frame
        return frame


async def main():
    pc = RTCPeerConnection()
    pc.addTrack(SilentAudioTrack())
    blackhole = MediaBlackhole()

    @pc.on("track")
    async def on_track(track):
        print(f"[client] received track kind={track.kind}")
        blackhole.addTrack(track)
        await blackhole.start()

    @pc.on("connectionstatechange")
    async def on_state():
        print(f"[client] connection state -> {pc.connectionState}")

    offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    print("[client] posting offer to /api/offer ...")

    async with aiohttp.ClientSession() as s:
        async with s.post(
            "http://localhost:7860/api/offer",
            json={"sdp": pc.localDescription.sdp, "type": pc.localDescription.type},
        ) as resp:
            print(f"[client] offer HTTP {resp.status}")
            data = await resp.json()
            print(f"[client] answer keys: {list(data.keys())}")

    await pc.setRemoteDescription(RTCSessionDescription(sdp=data["sdp"], type=data["type"]))
    print("[client] remote desc applied; staying alive 25s to observe bot logs ...")
    await asyncio.sleep(25)
    await pc.close()
    await blackhole.stop()
    print("[client] closed")


if __name__ == "__main__":
    asyncio.run(main())
