import { json, bad, readJson, handler } from './_lib/http.js';
import { clientAction } from './_lib/portal.js';
import { currentClient } from './_lib/auth.js';

// POST { action, ...fields }: the things a signed-in company person can do (request a job, message, upload,
// answer a quote, manage their team). Each action checks what that person is allowed to do.
export const POST = handler(async (request) => {
  const c = await currentClient(request);
  if (!c || !c.profile) return bad('Please sign in.', 401);
  const body = await readJson(request);
  if (!body) return bad('Invalid request.');
  const res = await clientAction(c.org.id, c.profile.id, String(body.action || ''), body);
  return res.error ? bad(res.error, 400) : json(res);
});
