'use client';

// LunaOrb — particle-cloud voice orb. Canvas-rendered Fibonacci sphere
// with state-driven amplitude and rotation. Ports the design prototype's
// orb.jsx into a typed React component bound to the Pipecat status.
//
// Visual states map onto PipecatStatus via VoiceOrbState:
//   idle       — gentle breath
//   listening  — surface lifts in time with mic
//   speaking   — bigger lumps, faster sway
//   processing — fast rotation, low amp (the "thinking" state)

import { useEffect, useRef, useState, type MutableRefObject } from 'react';

export type LunaOrbState = 'idle' | 'listening' | 'speaking' | 'processing';

type Props = {
  size?: number;
  state: LunaOrbState;
  /** Hex string. When omitted, the orb reads --accent from <html>.  */
  color?: string;
  /** Hex string. When omitted, the orb reads --glow from <html>. */
  glow?: string;
  /** Optional live audio level in [0, 1]; nudges amplitude beyond the
   *  baseline so the orb really moves with voice. */
  levelRef?: MutableRefObject<number>;
};

type Particle = {
  x: number; y: number; z: number;
  n1: number; n2: number; n3: number;
  seed: number;
};

// Used until the css-variable read resolves on the client. Matches
// the default midnight-blue palette so it doesn't flash a wrong tint.
const DEFAULT_COLOR = '#60A5FA';
const DEFAULT_GLOW = '#3B82F6';

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.substring(0, 2), 16),
    parseInt(h.substring(2, 4), 16),
    parseInt(h.substring(4, 6), 16),
  ];
}

function readVarHex(name: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  if (v.startsWith('#') && (v.length === 7 || v.length === 4)) {
    return v.length === 7 ? v : `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return fallback;
}

export function LunaOrb({
  size = 240,
  state = 'idle',
  color,
  glow,
  levelRef,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<LunaOrbState>(state);
  const tRef = useRef(0);
  const rafRef = useRef(0);

  // Resolve color/glow from props OR live CSS variables. We re-read on
  // every mood change so theme switches re-tint the particle cloud.
  const [resolved, setResolved] = useState<{ c: string; g: string }>(() => ({
    c: color ?? DEFAULT_COLOR,
    g: glow ?? DEFAULT_GLOW,
  }));
  const colorRef = useRef<string>(resolved.c);
  const glowRef = useRef<string>(resolved.g);
  useEffect(() => { colorRef.current = resolved.c; }, [resolved]);
  useEffect(() => { glowRef.current = resolved.g; }, [resolved]);

  useEffect(() => { stateRef.current = state; }, [state]);

  // After mount + on each prop change, sync from CSS vars unless the
  // caller passed explicit hex strings.
  useEffect(() => {
    const sync = () => {
      const c = color ?? readVarHex('--accent', DEFAULT_COLOR);
      const g = glow ?? readVarHex('--glow', DEFAULT_GLOW);
      setResolved((prev) => (prev.c === c && prev.g === g ? prev : { c, g }));
    };
    sync();
    // <html data-mood> changes from /settings — observe and re-sync.
    if (color || glow) return;
    const obs = new MutationObserver(sync);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-mood'],
    });
    return () => obs.disconnect();
  }, [color, glow]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const baseR = size * 0.34;

    // Pre-generate particles on a Fibonacci sphere — even surface
    // coverage, stable across renders.
    const N = 2400;
    const particles: Particle[] = [];
    for (let i = 0; i < N; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / N);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const sx = Math.sin(phi) * Math.cos(theta);
      const sy = Math.sin(phi) * Math.sin(theta);
      const sz = Math.cos(phi);
      particles.push({
        x: sx, y: sy, z: sz,
        n1: Math.sin(sx * 3.1 + sy * 2.3) * Math.cos(sz * 2.7),
        n2: Math.cos(sx * 5.2 - sz * 4.1) * Math.sin(sy * 3.9),
        n3: Math.sin(sx * 1.7 + sz * 2.1 + sy * 1.3),
        seed: i * 0.137,
      });
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let lastT = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      if (!reduced) tRef.current += dt;
      const t = tRef.current;
      const s = stateRef.current;
      const lvl = Math.max(0, Math.min(1, levelRef?.current ?? 0));

      // Amplitude per state — boosted by mic level when present.
      const amp =
        s === 'speaking'
          ? 0.18 + 0.06 * Math.sin(t * 6) + lvl * 0.10
          : s === 'listening'
            ? 0.10 + 0.05 * Math.sin(t * 3) + lvl * 0.16
            : s === 'processing'
              ? 0.06
              : 0.05;
      const rotSpeed =
        s === 'speaking' ? 0.35 :
        s === 'listening' ? 0.22 :
        s === 'processing' ? 0.45 :
        0.12;

      ctx.clearRect(0, 0, size, size);

      const ax = t * rotSpeed * 0.5;
      const ay = t * rotSpeed;
      const cosX = Math.cos(ax), sinX = Math.sin(ax);
      const cosY = Math.cos(ay), sinY = Math.sin(ay);

      const [cr, cg, cb] = parseHex(colorRef.current);
      const [gr, gg, gb] = parseHex(glowRef.current);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        const slow = p.n1 * 0.18 + p.n2 * 0.10;
        const fast =
          Math.sin(t * 1.6 + p.seed * 7 + p.n3 * 3) * 0.06 +
          Math.sin(t * 3.2 + p.n1 * 4) * 0.04;
        const wob = 1 + slow * (0.7 + amp * 2) + fast * (0.6 + amp * 4);

        const x = p.x * baseR * wob;
        const y = p.y * baseR * wob;
        const z = p.z * baseR * wob;

        const xr = x * cosY + z * sinY;
        const zr = -x * sinY + z * cosY;
        const yr = y * cosX - zr * sinX;
        const zr2 = y * sinX + zr * cosX;

        const persp = 1 / (1 - zr2 / (size * 2.0));
        const sxp = cx + xr * persp;
        const syp = cy + yr * persp;

        const depth = (zr2 + baseR) / (2 * baseR);
        const rim = 1 - Math.abs(zr2) / baseR;
        const rimGlow = Math.max(0, rim) ** 3.0;

        const a = Math.min(1, 0.15 + depth * 0.55 + rimGlow * 0.30);
        const r = 0.45 + depth * 0.55 + rimGlow * 0.2;

        const tint = 0.5 + xr / (baseR * 2.4);
        const lr = Math.round(cr * (1 - tint) + gr * tint);
        const lg = Math.round(cg * (1 - tint) + gg * tint);
        const lb = Math.round(cb * (1 - tint) + gb * tint);

        const br = Math.min(255, lr + rimGlow * 90);
        const bg = Math.min(255, lg + rimGlow * 70);
        const bb = Math.min(255, lb + rimGlow * 80);

        ctx.fillStyle = `rgba(${br | 0},${bg | 0},${bb | 0},${a})`;
        ctx.fillRect(sxp - r, syp - r, r * 2, r * 2);
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [size, levelRef]);

  return (
    <canvas
      ref={canvasRef}
      className="luna-orb"
      style={{ width: size, height: size, display: 'block' }}
      aria-hidden
    />
  );
}
