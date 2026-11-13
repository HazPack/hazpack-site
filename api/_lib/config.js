// Client portal settings shared by the API, the seed script and the tests.
export const isProd = Boolean(process.env.VERCEL);
// PORTAL_DEMO=1 lets a Vercel preview run on throwaway sample data (stored in /tmp, resets often).
// Never set this on the production site.
export const DEMO = process.env.PORTAL_DEMO === '1';

// Real storage: a Supabase database table for records and a private Supabase Storage bucket for files, both reached over
// HTTPS from this server code only. Vercel's Supabase integration provides these two variables.
// Without them the portal uses local files (development only).
export const supabaseConfig = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? { url: url.replace(/\/+$/, ''), key } : null;
};
export const FILE_BUCKET = 'portal-files';

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

// Bank details printed on invoices. They live in Vercel settings, never in this public repository.
// Until the account number and both routing numbers are set, invoices tell clients to ask accounts@ for them.
export function bankDetails() {
  const v = (k) => String(process.env[k] || '').trim();
  const acct = v('PORTAL_BANK_ACCOUNT'), ach = v('PORTAL_BANK_ACH_ROUTING'), wire = v('PORTAL_BANK_WIRE_ROUTING');
  if (!acct || !ach || !wire) return null;
  return { bank: v('PORTAL_BANK_NAME') || 'Chase Bank', name: v('PORTAL_BANK_ACCOUNT_NAME') || 'HazPack Compliance Solutions LLC', acct, ach, wire };
}

// Password the HazPack team types on the staff page.
export function staffKey() {
  if (process.env.PORTAL_STAFF_KEY) return process.env.PORTAL_STAFF_KEY;
  return isProd ? null : 'dev';
}
