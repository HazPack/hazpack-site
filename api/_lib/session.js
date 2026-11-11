import { sign, unsign } from './crypto.js';
import { SESSION_HOURS, isProd } from './config.js';

const NAME = 'hp_portal';

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

const secure = (request) => isProd || request.headers.get('x-forwarded-proto') === 'https';

export function readSession(request) {
  const raw = parseCookies(request.headers.get('cookie'))[NAME];
  if (!raw) return null;
  const s = unsign(raw);
  return s && s.exp > Date.now() ? s : null;
}

// Stateless signed cookie. HttpOnly keeps it away from page scripts.
export function setSession(request, payload) {
  const value = sign({ ...payload, exp: Date.now() + SESSION_HOURS * 3600 * 1000 });
  return `${NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_HOURS * 3600}${secure(request) ? '; Secure' : ''}`;
}

export const clearSession = (request) =>
  `${NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure(request) ? '; Secure' : ''}`;
