// Public env exposure for the client. NEXT_PUBLIC_* values are baked at build
// time. Keep secrets out of this file.

// `??` alone leaves `""` through, which would make the WebRTC offer hit the
// Next.js origin and 404 to an HTML page. Treat empty strings as unset.
// In production, do not silently fall back to localhost; fail at the call
// setup boundary so release misconfiguration is obvious.
export const BOT_URL =
  (process.env.BOT_PUBLIC_URL || '').trim() ||
  (process.env.NEXT_PUBLIC_BOT_URL || '').trim() ||
  (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:7860');
export const BOT_SERVER_URL = (process.env.BOT_INTERNAL_URL || '').trim() || BOT_URL;
export const BOT_OFFER_PATH = '/api/offer';
