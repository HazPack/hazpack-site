// Client portal settings shared by the API, the seed script and the tests.
export const isProd = Boolean(process.env.VERCEL);
// PORTAL_DEMO=1 lets a Vercel preview run on throwaway sample data (stored in /tmp, resets often).
// Never set this on the production site.
export const DEMO = process.env.PORTAL_DEMO === '1';

export const RETENTION_MONTHS = 5;
export const FILE_TYPES = ['DGD', 'Report', 'Invoice', 'Photo', 'Other'];
export const CLIENT_FILE_TYPES = ['DGD', 'Photo', 'Other'];
export const SERVICES = ['class', 'dgd', 'pack', 'insp', 'emerg', 'consult', 'temp', 'dry'];
export const DB_VERSION = 2;
export const MAX_FILE_BYTES = 3 * 1024 * 1024; // uploads travel as base64 JSON and must stay under Vercel's 4.5 MB body limit
export const SESSION_HOURS = 8;
export const MAX_FAILS = 5;
export const LOCK_MS = 15 * 60 * 1000;

export class NotConfigured extends Error {}

export function sessionSecret() {
  if (process.env.PORTAL_SESSION_SECRET) return process.env.PORTAL_SESSION_SECRET;
  if (!isProd) return 'dev-only-secret-not-for-production';
  throw new NotConfigured('PORTAL_SESSION_SECRET is not set.');
}

// Password the HazPack team types on the staff page.
export function staffKey() {
  if (process.env.PORTAL_STAFF_KEY) return process.env.PORTAL_STAFF_KEY;
  return isProd ? null : 'dev';
}
