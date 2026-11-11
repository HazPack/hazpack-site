import { json, bad, readJson, handler } from './_lib/http.js';
import { staffData, staffAction } from './_lib/portal.js';
import { isStaff } from './_lib/auth.js';

// GET: every company (same data as portal-state). POST: { action, ...fields } for everything staff can change.
export const GET = handler(async (request) => {
  if (!isStaff(request)) return bad('Please sign in.', 401);
  return json(await staffData());
});

export const POST = handler(async (request) => {
  if (!isStaff(request)) return bad('Please sign in.', 401);
  const body = await readJson(request);
  if (!body) return bad('Invalid request.');
  const res = await staffAction(String(body.action || ''), body);
  if (res.error) return json({ error: res.error, conflict: Boolean(res.conflict) }, res.conflict ? 409 : 400);
  return json(res);
});
