'use client';

// useVoiceLevel — Web Audio AnalyserNode wrapped as a React hook.
//
// Apple's AVAudioEngine + tap-on-bus pattern, ported to the browser:
//   AVAudioEngine.installTap → AnalyserNode + getFloatTimeDomainData
//   inputNode (mic) ↔ MediaStream from getUserMedia / pipecat track
//   outputNode (player) ↔ HTMLAudioElement (the bot playback element)
//
// The hook writes the smoothed amplitude (0..1) into a ref so consumers
// (canvas RAF loops, edge-glow rotation) can read it every frame WITHOUT
// triggering a React re-render. That's the only way to keep 60fps with
// reactive visuals.

import { useEffect, useRef, type MutableRefObject } from 'react';

// One AudioContext per tab is the recommended pattern; reusing it lets us
// wire the same <audio> element exactly once (creating a second
// MediaElementAudioSourceNode for the same element throws InvalidStateError).
let sharedCtx: AudioContext | null = null;
const wiredElements = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const Ctor: typeof AudioContext | undefined = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedCtx) sharedCtx = new Ctor({ latencyHint: 'interactive' });
  if (sharedCtx.state === 'suspended') {
    sharedCtx.resume().catch(() => {});
  }
  return sharedCtx;
}

export type VoiceSource = MediaStream | HTMLAudioElement | null;

type Opts = {
  /** Mic stream (for "user is speaking") OR bot audio element (for "Luna is speaking"). */
  source: VoiceSource;
  /** When false, level decays to 0. Toggle with the call's status. */
  active: boolean;
  /** 0..1 — how fast level rises toward signal peaks. */
  attack?: number;
  /** 0..1 — how fast level falls. Asymmetric ADSR keeps voice transients visible. */
  release?: number;
};

export function useVoiceLevel({
  source,
  active,
  attack = 0.35,
  release = 0.06,
}: Opts): { levelRef: MutableRefObject<number> } {
  const levelRef = useRef(0);

  useEffect(() => {
    if (!source) return;
    const ctx = getCtx();
    if (!ctx) return;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.55;
    const buf = new Float32Array(analyser.fftSize);

    let teardown: () => void = () => {};

    if (source instanceof MediaStream) {
      // Mic. Do NOT connect to ctx.destination — that would echo locally.
      const node = ctx.createMediaStreamSource(source);
      node.connect(analyser);
      teardown = () => {
        try { node.disconnect(); } catch {}
        try { analyser.disconnect(); } catch {}
      };
    } else {
      // <audio> element — must remain audible, so the source node MUST be
      // wired to destination. Cache per-element because Web Audio forbids
      // a second createMediaElementSource() on the same element.
      let elNode = wiredElements.get(source);
      if (!elNode) {
        try {
          elNode = ctx.createMediaElementSource(source);
          wiredElements.set(source, elNode);
          elNode.connect(ctx.destination);
        } catch {
          // Already wired by a previous mount that didn't make it into the
          // WeakMap (HMR edge case). Bail — level stays at 0, audio still plays.
          return;
        }
      }
      elNode.connect(analyser);
      teardown = () => {
        try { analyser.disconnect(); } catch {}
        // Keep elNode wired to destination so audio keeps playing.
      };
    }

    let raf = 0;
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      // Root-mean-square gives a stable amplitude estimate. We then squash
      // it through a perceptual curve so quiet speech doesn't read as silence.
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) sumSq += buf[i] * buf[i];
      const rms = Math.sqrt(sumSq / buf.length);
      const norm = Math.min(1, Math.pow(rms * 4.5, 0.6));
      const target = active ? norm : 0;
      const k = target > levelRef.current ? attack : release;
      levelRef.current += (target - levelRef.current) * k;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      teardown();
    };
  }, [source, active, attack, release]);

  return { levelRef };
}
