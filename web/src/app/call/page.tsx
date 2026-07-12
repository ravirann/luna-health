// /call hosts the conversation surface (screen 03).
// Auth + usage-limit gating happens server-side via /api/session/start
// when the client connects. The page renders for both guests and
// signed-in users per spec §6.3 — no pre-render redirect.

import { Suspense } from 'react';
import { LunaConversation } from '@/components/luna-conversation';
import { readBrandFromEnv } from '@/lib/brand';

export const dynamic = 'force-dynamic';

export default async function CallPage() {
  const brand = readBrandFromEnv();

  return (
    <main className="screen fade-in">
      <Suspense fallback={<section className="luna-conv" aria-busy />}>
        <LunaConversation
          brandName={brand.brandName}
          botName={brand.botName}
        />
      </Suspense>
    </main>
  );
}
