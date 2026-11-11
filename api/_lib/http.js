import { NotConfigured } from './config.js';

// extra = [['set-cookie', '...'], ...]
export function json(obj, status = 200, extra = []) {
  const headers = new Headers({ 'content-type': 'application/json', 'cache-control': 'no-store' });
  for (const [k, v] of extra) headers.append(k, v);
  return new Response(JSON.stringify(obj), { status, headers });
}

// Reads a JSON body for state-changing requests. Refuses cross-site requests and non-JSON posts,
// which, together with SameSite=Lax cookies, blocks cross-site request forgery.
export async function readJson(request) {
  const site = request.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') return null;
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || new URL(request.url).host;
      if (new URL(origin).host !== host) return null;
    } catch { return null; }
  }
  if (!String(request.headers.get('content-type') || '').includes('application/json')) return null;
  try { return await request.json(); } catch { return null; }
}

export const bad = (message, status = 400) => json({ error: message }, status);

export function handler(fn) {
  return async (request) => {
    try {
      return await fn(request);
    } catch (e) {
      if (e instanceof NotConfigured) return bad('The client portal is not set up yet.', 503);
      console.error('portal error', e?.message || e);
      return bad('Something went wrong. Please try again.', 500);
    }
  };
}
