'use client';

import { memo, useMemo } from 'react';

/**
 * Stylised audio-spectrum bars at the bottom of the call screen. Static
 * shape, animated via the `sa-wave` keyframe in CSS. We compute heights and
 * delays once so re-renders don't restart the wave phase.
 */
function WaveBarsInner({ n = 28, playing = true }: { n?: number; playing?: boolean }) {
  const bars = useMemo(() => {
    const out: { h: number; delay: number }[] = [];
    for (let i = 0; i < n; i++) {
      out.push({
        h: 20 + Math.abs(Math.sin(i * 0.9)) * 26,
        delay: (Math.sin(i * 0.7) + 1) * 0.4,
      });
    }
    return out;
  }, [n]);

  return (
    <div className="wave" aria-hidden>
      {bars.map((b, i) => (
        <i
          key={i}
          style={{
            height: `${b.h.toFixed(0)}px`,
            animationDelay: `${b.delay.toFixed(2)}s`,
            animationPlayState: playing ? 'running' : 'paused',
          }}
        />
      ))}
    </div>
  );
}

export const WaveBars = memo(WaveBarsInner);
