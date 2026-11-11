import { json, bad, readJson, handler } from './_lib/http.js';
import { clientLogin } from './_lib/portal.js';
import { setSession } from './_lib/session.js';

// Step 1 of client sign-in: company ID and password. Profile and PIN come next (portal-session.js).
export const POST = handler(async (request) => {
  const body = await readJson(request);
  if (!body) return bad('Invalid request.');
  const r = await clientLogin(body.slug, body.password);
  if (r.error === 'locked') return bad('Too many attempts. Please try again in 15 minutes.', 429);
  if (r.error) return bad('The company ID or password is incorrect.', 401);
  return json(
    { ok: true, org: { name: r.org.name }, profiles: r.org.profiles.map(({ id, name }) => ({ id, name })) },
    200,
    [['set-cookie', setSession(request, { role: 'client', orgId: r.org.id })]],
  );
});
