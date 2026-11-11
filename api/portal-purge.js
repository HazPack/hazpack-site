import { json, bad, handler } from './_lib/http.js';
import { purgeExpired } from './_lib/portal.js';
import { safeEqual } from './_lib/crypto.js';
import { isProd } from './_lib/config.js';

// Daily clean-up of records older than 5 months. Vercel's cron sends "Authorization: Bearer $CRON_SECRET".
export const GET = handler(async (request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret && isProd) return bad('Not configured.', 503);
  if (secret && !safeEqual(request.headers.get('authorization') || '', `Bearer ${secret}`)) return bad('Unauthorized.', 401);
  return json({ ok: true, ...(await purgeExpired()) });
});
