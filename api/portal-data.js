import { json, bad, handler } from './_lib/http.js';
import { clientData } from './_lib/portal.js';
import { currentClient } from './_lib/auth.js';
import { STATUSES, RETENTION_MONTHS } from './_lib/config.js';

// The signed-in profile's company, and only that company, sees its shipments and files.
export const GET = handler(async (request) => {
  const c = await currentClient(request);
  if (!c || !c.profile) return bad('Please sign in.', 401);
  return json({
    org: { name: c.org.name, demo: Boolean(c.org.demo) },
    profile: { name: c.profile.name },
    statuses: STATUSES,
    retentionMonths: RETENTION_MONTHS,
    shipments: await clientData(c.org.id),
  });
});
