import { json, bad, handler } from './_lib/http.js';
import { clientData, staffData } from './_lib/portal.js';
import { currentClient, isStaff } from './_lib/auth.js';

// Everything the portal screen needs. A signed-in person gets only their own company, and a member only
// their own jobs; HazPack staff get every company.
export const GET = handler(async (request) => {
  if (isStaff(request)) return json(await staffData());
  const c = await currentClient(request);
  if (!c || !c.profile) return bad('Please sign in.', 401);
  return json(await clientData(c.org.id, c.profile.id));
});
