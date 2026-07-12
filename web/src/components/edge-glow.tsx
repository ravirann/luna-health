'use client';

// EdgeGlow — Apple-Intelligence-style screen-edge glow.
//
// A fixed-position layer that renders an animated angular (conic) gradient,
// blurred heavily, masked to the viewport edges so the center stays fully
// transparent. Two CSS custom properties drive the visual: --glow-angle
// (rotation) and --glow-opacity (intensity). Both are written by a RAF
// loop so we can ride the voice-level ref smoothly without React re-renders.
//
// State map:
//   idle       — barely-there ring, slow drift
//   listening  — opacity tracks user mic level; rotation slow
//   speaking   — opacity tracks bot output level; rotation moderate
//   processing — full opacity, fast rotation (the "thinking" cadence)

import { useEffect, useRef, type MutableRefObject } from 'react';

export type EdgeGlowState = 'idle' | 'listening' | 'speaking' | 'processing';

type Props = {
  state: EdgeGlowState;
  levelRef?: MutableRefObject<number>;
  hue?: string;
  hue2?: string;
};

export function EdgeGlow({
  state,
  levelRef,
  hue = '#60A5FA',
  hue2 = '#3B82F6',
}: Props) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Mirror state into a ref so the RAF tick reads the latest value.
  const stateRef = useRef<EdgeGlowState>(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let raf = 0;
    let angle = 0;
    let opacity = 0;
    let speed = 0;

    const tick = () => {
      const s = stateRef.current;
      const lvl = levelRef?.current ?? 0;

      const targetOpacity =
        s === 'processing' ? 0.95 :
        s === 'speaking'   ? 0.55 + lvl * 0.40 :
        s === 'listening'  ? 0.32 + lvl * 0.62 :
                             0.16;
      const targetSpeed =
        s === 'processing' ? 0.85 :
        s === 'speaking'   ? 0.18 + lvl * 0.10 :
        s === 'listening'  ? 0.10 + lvl * 0.30 :
                             0.04;

      opacity += (targetOpacity - opacity) * 0.07;
      speed += (targetSpeed - speed) * 0.05;
      angle = (angle + speed) % 360;

      el.style.setProperty('--glow-angle', `${angle.toFixed(2)}deg`);
      el.style.setProperty('--glow-opacity', opacity.toFixed(3));

      if (!reduced) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  return (
    <div
      ref={wrapRef}
      className={`edge-glow state-${state}`}
      aria-hidden="true"
      style={
        {
          ['--glow-hue-a' as string]: hue,
          ['--glow-hue-b' as string]: hue2,
        } as React.CSSProperties
      }
    >
      <div className="edge-glow-conic" />
      <div className="edge-glow-rim" />
    </div>
  );
}
