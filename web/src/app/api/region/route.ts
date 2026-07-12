// GET /api/region
//
// Returns the visitor's two-letter ISO country code from upstream geo
// headers, for any region-aware display copy. Returns `null` when no
// header is set.
//
// Header priority:
//   1. cf-ipcountry        — Cloudflare in front of the origin
//   2. x-vercel-ip-country — Vercel edge
//   3. x-country-code      — generic (in case Caddy / nginx is wired up)

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const HEADER_CANDIDATES = [
  'cf-ipcountry',
  'x-vercel-ip-country',
  'x-country-code',
] as const;

export async function GET(req: NextRequest) {
  for (const header of HEADER_CANDIDATES) {
    const raw = req.headers.get(header);
    if (!raw) continue;
    const code = raw.trim().toUpperCase();
    // Some providers emit "XX" or "T1" for Tor / unknown — treat as null.
    if (/^[A-Z]{2}$/.test(code) && code !== 'XX' && code !== 'T1') {
      return NextResponse.json({ region: code });
    }
  }
  return NextResponse.json({ region: null });
}
