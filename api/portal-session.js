import { json, bad, readJson, handler } from './_lib/http.js';
import { selectProfile } from './_lib/portal.js';
import { readSession, setSession, clearSession } from './_lib/session.js';
import { currentClient, isStaff } from './_lib/auth.js';

// GET: who is signed in. POST: pick a profile with its PIN. PATCH: go back to the profile picker. DELETE: sign out.
export const GET = handler(async (request) => {
  const c = await currentClient(request);
  return json({
    staff: isStaff(request),
    client: c && {
      org: { name: c.org.name, demo: Boolean(c.org.demo) },
      profile: c.profile && { id: c.profile.id, name: c.profile.name },
      profiles: c.profile ? undefined : c.org.reps.map(({ id, name, title }) => ({ id, name, title })),
    },
  });
});

export const POST = handler(async (request) => {
  const s = readSession(request);
  if (!s || s.role !== 'client') return bad('Please sign in again.', 401);
  const body = await readJson(request);
  if (!body) return bad('Invalid request.');
  const r = await selectProfile(s.orgId, String(body.profileId || ''), body.pin);
  if (r.error === 'locked') return bad('Too many attempts for this profile. Please try again in 15 minutes.', 429);
  if (r.error) return bad('That PIN is incorrect.', 401);
  return json({ ok: true, profile: { id: r.profile.id, name: r.profile.name } }, 200,
    [['set-cookie', setSession(request, { role: 'client', orgId: r.org.id, profileId: r.profile.id })]]);
});

export const PATCH = handler(async (request) => {
  const s = readSession(request);
  if (!s || s.role !== 'client') return bad('Please sign in again.', 401);
  if (!(await readJson(request))) return bad('Invalid request.');
  return json({ ok: true }, 200, [['set-cookie', setSession(request, { role: 'client', orgId: s.orgId })]]);
});

export const DELETE = handler(async (request) => {
  if (!(await readJson(request))) return bad('Invalid request.');
  return json({ ok: true }, 200, [['set-cookie', clearSession(request)]]);
});
