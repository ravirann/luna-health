'use client';

import { memo, useMemo } from 'react';

export type OrbState = 'idle' | 'speaking' | 'listening';

type OrbProps = {
  size?: number;
  hue?: string;
  hue2?: string;
  state?: OrbState;
  count?: number;
};

/**
 * Breathing orb — a fibonacci-lattice particle mesh on a tilted sphere with a
 * glowing core and a soft halo. It's the signature voice metaphor of the app.
 *
 * The dot positions are derived purely from `size` and `count`, so this
 * component is `memo`-ized on those (plus the hues + state). State changes
 * during a call (idle ↔ speaking ↔ listening) only flip a class on the
 * wrapper — they DON'T rebuild the dot DOM, which is what made the vanilla
 * version flicker on every RTVI event.
 */
function OrbInner({
  size = 340,
  hue = '#60A5FA',
  hue2 = '#3B82F6',
  state = 'idle',
  count = 160,
}: OrbProps) {
  // Compute the dot positions once per (size, count) — these are stable for
  // the whole life of the component instance, so React's reconciler only
  // touches the wrapper class when state changes.
  const dots = useMemo(() => {
    const phi = Math.PI * (3 - Math.sqrt(5)); // golden angle
    const out: { x: number; y: number; opacity: number; r: number }[] = [];
    for (let i = 0; i < count; i++) {
      const ny = 1 - (i / (count - 1)) * 2;
      const r = Math.sqrt(1 - ny * ny);
      const theta = phi * i;
      const x = Math.cos(theta) * r;
      const z = Math.sin(theta) * r;
      const tiltY = 0.92;
      const tiltX = 0.38;
      const ry = ny * tiltY - z * tiltX;
      const rz = z * tiltY + ny * tiltX;
      const depth = (rz + 1) / 2;
      out.push({
        x: x * (size / 2 - 10),
        y: ry * (size / 2 - 10),
        opacity: 0.15 + depth * 0.75,
        r: 1.2 + depth * 1.6,
      });
    }
    return out;
  }, [size, count]);

  return (
    <div
      className={`orb-wrap ${state}`}
      style={
        {
          // CSS custom properties consumed by .orb-core / .orb-halo / .orb-dot.
          '--orb-size': `${size}px`,
          '--orb-hue': hue,
          '--orb-hue-2': hue2,
        } as React.CSSProperties
      }
    >
      <div className="orb-halo" />
      <div className="orb-core" />
      <div className="orb-shell">
        {dots.map((d, i) => (
          <span
            key={i}
            className="orb-dot"
            style={{
              transform: `translate(${d.x.toFixed(2)}px, ${d.y.toFixed(2)}px)`,
              opacity: d.opacity.toFixed(2),
              width: `${d.r.toFixed(2)}px`,
              height: `${d.r.toFixed(2)}px`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

export const Orb = memo(OrbInner);
