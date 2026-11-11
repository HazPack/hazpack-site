import { json, bad, readJson, handler } from './_lib/http.js';
import { staffOverview, staffAction } from './_lib/portal.js';
import { isStaff } from './_lib/auth.js';

// GET: companies (and one company's shipments with ?orgId=). POST: { action, ...fields } for everything staff can change.
export const GET = handler(async (request) => {
  if (!isStaff(request)) return bad('Please sign in.', 401);
  const orgId = new URL(request.url).searchParams.get('orgId');
  return json(await staffOverview(orgId));
});

export const POST = handler(async (request) => {
  if (!isStaff(request)) return bad('Please sign in.', 401);
  const body = await readJson(request);
  if (!body) return bad('Invalid request.');
  const res = await staffAction(String(body.action || ''), body);
  return res.error ? bad(res.error, 400) : json(res);
});
