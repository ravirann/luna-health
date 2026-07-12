'use client';

import { memo } from 'react';

/**
 * Soft concentric rings behind the orb. Almost-invisible by design;
 * reinforces the warmth metaphor without adding visual noise.
 */
function WarmthRingsInner({ radius = 220 }: { radius?: number }) {
  return (
    <svg
      className="warmth-rings"
      viewBox={`-${radius} -${radius} ${radius * 2} ${radius * 2}`}
      style={{ overflow: 'visible' }}
      aria-hidden
    >
      <circle className="rw-outer" r={radius * 0.95} />
      <circle r={radius * 0.8} />
      <circle r={radius * 0.65} />
      <circle r={radius * 0.5} />
    </svg>
  );
}

export const WarmthRings = memo(WarmthRingsInner);
