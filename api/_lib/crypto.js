import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto';
import { sessionSecret } from './config.js';

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// Passwords and PINs are stored only as salted scrypt hashes.
export function hashSecret(plain) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(plain), salt, 32);
  return `s1$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function verifySecret(plain, stored) {
  try {
    const [v, salt, hex] = String(stored).split('$');
    if (v !== 's1') return false;
    const got = scryptSync(String(plain), Buffer.from(salt, 'hex'), 32);
    const want = Buffer.from(hex, 'hex');
    return got.length === want.length && timingSafeEqual(got, want);
  } catch {
    return false;
  }
}

// Checked against when a company ID does not exist, so a wrong ID takes as long as a wrong password.
export const DUMMY_HASH = hashSecret('not-a-real-password');

const mac = (body) => createHmac('sha256', sessionSecret()).update(body).digest('base64url');

export function sign(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${mac(body)}`;
}

export function unsign(token) {
  const [body, tag] = String(token).split('.');
  if (!body || !tag || !safeEqual(tag, mac(body))) return null;
  try { return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')); } catch { return null; }
}
