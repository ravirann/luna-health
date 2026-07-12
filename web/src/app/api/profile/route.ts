// GET /api/profile  → current user's prefs (creates a defaults row on first hit)
// PATCH /api/profile → partial update; returns the new full row
//
// Input is validated with Zod. The PATCH never accepts the `userId` field;
// ownership comes from the active local session.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ensureUser } from '@/lib/auth';
import {
  getUserPrefs,
  updateUserPrefs,
  type PrefsPatch,
} from '@/lib/prefs-server';

const Patch = z
  .object({
    name: z.string().trim().max(40).nullish(),
    vibe: z.enum(['calm', 'friendly', 'playful', 'flirty']).optional(),
    tone: z.enum(['Soft', 'Warm', 'Energetic', 'Sultry']).optional(),
    languageMode: z.enum(['english', 'hinglish', 'hindi']).optional(),
    pace: z.enum(['Slow', 'Natural', 'Brisk']).optional(),
    warmth: z.number().int().min(0).max(10).optional(),
    memoryEnabled: z.boolean().optional(),
    autoSummary: z.boolean().optional(),
    sleepNudges: z.boolean().optional(),
    onboarded: z.boolean().optional(),
  })
  .strict();

export async function GET() {
  const user = await ensureUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const prefs = await getUserPrefs(user.id);
  return NextResponse.json(prefs);
}

export async function PATCH(req: NextRequest) {
  const user = await ensureUser();
  if (!user) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  let parsed;
  try {
    parsed = Patch.parse(await req.json().catch(() => ({})));
  } catch (err) {
    return NextResponse.json(
      { error: 'invalid_body', detail: String(err) },
      { status: 400 },
    );
  }

  // Drop undefined fields so we don't overwrite existing values with null.
  const patch: PrefsPatch = {};
  if (parsed.name !== undefined) patch.name = parsed.name ?? null;
  if (parsed.vibe !== undefined) patch.vibe = parsed.vibe;
  if (parsed.tone !== undefined) patch.tone = parsed.tone;
  if (parsed.languageMode !== undefined) patch.languageMode = parsed.languageMode;
  if (parsed.pace !== undefined) patch.pace = parsed.pace;
  if (parsed.warmth !== undefined) patch.warmth = parsed.warmth;
  if (parsed.memoryEnabled !== undefined)
    patch.memoryEnabled = parsed.memoryEnabled;
  if (parsed.autoSummary !== undefined) patch.autoSummary = parsed.autoSummary;
  if (parsed.sleepNudges !== undefined) patch.sleepNudges = parsed.sleepNudges;
  if (parsed.onboarded !== undefined) patch.onboarded = parsed.onboarded;

  const next = await updateUserPrefs(user.id, patch);
  return NextResponse.json(next);
}
