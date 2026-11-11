import { json, bad, readJson, handler } from './_lib/http.js';
import { staffLogin } from './_lib/portal.js';
import { staffKey } from './_lib/config.js';
import { safeEqual } from './_lib/crypto.js';
import { setSession } from './_lib/session.js';

// HazPack staff sign in with PORTAL_STAFF_KEY (set in Vercel). Locally the key is "dev".
export const POST = handler(async (request) => {
  const body = await readJson(request);
  if (!body) return bad('Invalid request.');
  const expected = staffKey();
  if (!expected) return bad('Staff access is not set up yet.', 503);
  const r = await staffLogin(() => safeEqual(String(body.key ?? ''), expected));
  if (r.error === 'locked') return bad('Too many attempts. Please try again in 15 minutes.', 429);
  if (r.error) return bad('That key did not work.', 401);
  return json({ ok: true }, 200, [['set-cookie', setSession(request, { role: 'staff' })]]);
});
