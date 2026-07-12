// Thin wrapper over Resend's HTTP API. Stays HTTP-direct (no SDK) so the
// dependency surface is one fetch and we can swap providers in one file.

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; error: 'not_configured' | 'send_failed' };

function getConfig(): { apiKey: string; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) return null;
  return { apiKey, from };
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const config = getConfig();
  if (!config) {
    console.error('email: RESEND_API_KEY or EMAIL_FROM not set; skipping send');
    return { ok: false, error: 'not_configured' };
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: config.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('email: send_failed', res.status, detail.slice(0, 500));
      return { ok: false, error: 'send_failed' };
    }
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: body.id ?? '' };
  } catch (err) {
    console.error('email: send_failed (network)', err);
    return { ok: false, error: 'send_failed' };
  }
}

export function buildPasswordResetEmail(args: {
  brandName: string;
  resetUrl: string;
}): { subject: string; html: string; text: string } {
  const cap = args.brandName.charAt(0).toUpperCase() + args.brandName.slice(1);
  const subject = `Reset your ${cap} password`;
  const text = [
    `Someone (hopefully you) asked to reset your ${cap} password.`,
    '',
    `Open this link to set a new one — it expires in 30 minutes:`,
    args.resetUrl,
    '',
    `If you didn't request this, you can ignore this email. Your password stays the same.`,
  ].join('\n');
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;line-height:1.55;color:#1a1430;background:#f7f4fc;padding:24px">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:14px;padding:28px 26px;box-shadow:0 8px 24px rgba(38,24,78,.08)">
    <h1 style="font-size:20px;margin:0 0 14px;color:#26184e">Reset your ${cap} password</h1>
    <p style="margin:0 0 16px">Someone (hopefully you) asked to reset the password for this ${cap} account.</p>
    <p style="margin:0 0 22px">
      <a href="${args.resetUrl}" style="display:inline-block;background:#7f3df2;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:600">Set a new password</a>
    </p>
    <p style="margin:0 0 8px;font-size:13px;color:#5d537c">This link expires in 30 minutes.</p>
    <p style="margin:0;font-size:13px;color:#5d537c">If you didn't request this, you can ignore this email — your password stays the same.</p>
  </div>
</body></html>`;
  return { subject, html, text };
}
