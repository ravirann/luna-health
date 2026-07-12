'use client';

import { memo, useEffect, useRef } from 'react';
import type { TranscriptEntry } from '@/hooks/use-pipecat';
import { getAppCopy, type AppLocale } from '@/lib/i18n';

/**
 * Append-only transcript view. We keep a `lastLength` ref so the only DOM
 * mutation per render is appending the new entries — older rows are stable.
 * Auto-scrolls to the latest line.
 */
function TranscriptListInner({
  entries,
  locale,
}: {
  entries: TranscriptEntry[];
  locale?: AppLocale;
}) {
  const copy = getAppCopy(locale).transcript;
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="live-transcript" ref={containerRef}>
        <div className="empty">—</div>
      </div>
    );
  }

  return (
    <div className="live-transcript" ref={containerRef}>
      {entries.map((e, i) => (
        <div key={`${e.ts}-${i}`} className={`tr-row tr-${e.role}`}>
          <span className="tr-speaker">
            {e.role === 'assistant' ? copy.assistantSpeaker : copy.userSpeaker}
          </span>
          <span className="tr-text">{e.text}</span>
        </div>
      ))}
    </div>
  );
}

export const TranscriptList = memo(TranscriptListInner);
