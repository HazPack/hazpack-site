import { readSession } from './session.js';
import { getClient } from './portal.js';

// The signed-in company (and profile, if one has been picked), re-checked against the data on every request
// so removing a company or profile signs it out right away.
export async function currentClient(request) {
  const s = readSession(request);
  if (!s || s.role !== 'client') return null;
  return getClient(s.orgId, s.profileId);
}

export const isStaff = (request) => readSession(request)?.role === 'staff';
