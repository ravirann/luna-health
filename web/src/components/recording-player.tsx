'use client';

import { useState } from 'react';

export function RecordingPlayer({ sessionId }: { sessionId: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/recording/${sessionId}/url`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const { url } = (await res.json()) as { url: string };
      setSrc(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'failed');
    } finally {
      setLoading(false);
    }
  }

  if (src) {
    return <audio src={src} controls preload="auto" style={{ width: '100%' }} />;
  }
  return (
    <button
      onClick={load}
      disabled={loading}
      className="btn-primary"
      style={{ padding: '8px 16px', fontSize: 13 }}
    >
      {loading ? 'One moment…' : err ? 'Try again' : 'Listen back'}
    </button>
  );
}
