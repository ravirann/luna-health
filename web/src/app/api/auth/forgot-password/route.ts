import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { readBrandFromEnv } from '@/lib/brand';
import { buildPasswordResetEmail, sendEmail } from '@/lib/email';
import {
  createPasswordResetToken,
  findUserIdByEmail,
} from '@/lib/local-auth';

const Body = z.object({
  email: z.string().email().max(254),
});

function getAppUrl(req: NextRequest): string {
  const explicit = (process.env.NEXT_PUBLIC_APP_URL || '').trim();
  if (explicit) return explicit.replace(/\/$/, '');
  return new URL('/', req.url).origin;
}

export async function POST(req: NextRequest) {
  let parsed: z.infer<typeof Body>;
  try {
    parsed = Body.parse(await req.json().catch(() => ({})));
  } catch {
    // Don't reveal anything, even shape errors.
    return NextResponse.json({ ok: true });
  }

  const userId = await findUserIdByEmail(parsed.email);
  if (!userId) {
    // Pretend everything's fine — no user enumeration.
    return NextResponse.json({ ok: true });
  }

  const { token } = await createPasswordResetToken(userId);
  const resetUrl = `${getAppUrl(req)}/reset-password?token=${encodeURIComponent(token)}`;
  const brand = readBrandFromEnv();
  const message = buildPasswordResetEmail({
    brandName: brand.brandName,
    resetUrl,
  });
  await sendEmail({
    to: parsed.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
  });

  return NextResponse.json({ ok: true });
}
