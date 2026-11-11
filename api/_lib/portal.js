// Client portal rules. Every function that reads client data takes the company id from the signed
// session, never from the request, so one company can never ask for another company's records.
import { randomUUID } from 'node:crypto';
import { hashSecret, verifySecret, DUMMY_HASH } from './crypto.js';
import { STATUSES, FILE_KINDS, RETENTION_MONTHS, MAX_FILE_BYTES, MAX_FAILS, LOCK_MS } from './config.js';
import { withDb, readDb, putFile, getFile, delFile } from './store.js';

const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
export const normSlug = (v) => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const addMonths = (iso, n) => { const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString(); };
const fail = (error) => ({ error });

// ---- failed-attempt lockouts (work the same whether or not the company ID exists) ----
const isLocked = (db, key, now) => (db.meta.locks[key]?.until || 0) > now;
function noteFail(db, key, now) {
  const e = (db.meta.locks[key] ||= { failed: 0, until: 0 });
  e.failed += 1;
  if (e.failed >= MAX_FAILS) { e.failed = 0; e.until = now + LOCK_MS; }
  e.at = now;
  const keys = Object.keys(db.meta.locks);
  if (keys.length > 2000) for (const k of keys) if ((db.meta.locks[k].until || 0) < now && now - (db.meta.locks[k].at || 0) > LOCK_MS) delete db.meta.locks[k];
}
const noteOk = (db, key) => { delete db.meta.locks[key]; };

// ---- client sign-in ----
export function clientLogin(slug, password) {
  const s = normSlug(slug);
  const now = Date.now();
  return withDb((db) => {
    const key = `org:${s}`;
    if (isLocked(db, key, now)) return fail('locked');
    const org = db.orgs.find((o) => o.slug === s);
    const ok = verifySecret(String(password ?? ''), org ? org.passwordHash : DUMMY_HASH);
    if (!org || !ok) { noteFail(db, key, now); return fail('invalid'); }
    noteOk(db, key);
    return { org };
  });
}

export function selectProfile(orgId, profileId, pin) {
  const now = Date.now();
  return withDb((db) => {
    const org = db.orgs.find((o) => o.id === orgId);
    const profile = org?.profiles.find((p) => p.id === profileId);
    if (!org || !profile) return fail('invalid');
    const key = `pin:${org.id}:${profile.id}`;
    if (isLocked(db, key, now)) return fail('locked');
    if (!verifySecret(String(pin ?? ''), profile.pinHash)) { noteFail(db, key, now); return fail('invalid'); }
    noteOk(db, key);
    return { org, profile };
  });
}

export async function getClient(orgId, profileId) {
  const db = await readDb();
  const org = db.orgs.find((o) => o.id === orgId);
  if (!org) return null;
  const profile = profileId ? org.profiles.find((p) => p.id === profileId) || null : null;
  if (profileId && !profile) return null; // that profile was removed
  return { org, profile };
}

const pubFile = (f) => ({ id: f.id, kind: f.kind, name: f.name, type: f.type, size: f.size, createdAt: f.createdAt, expiresAt: f.expiresAt });
const pubShipment = (db, s) => ({
  id: s.id, reference: s.reference, description: s.description, status: s.status,
  createdAt: s.createdAt, updatedAt: s.updatedAt, expiresAt: s.expiresAt,
  files: db.files.filter((f) => f.shipmentId === s.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)).map(pubFile),
});

export async function clientData(orgId) {
  const db = await readDb();
  return db.shipments.filter((s) => s.orgId === orgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => pubShipment(db, s));
}

// Returns file info only if it belongs to orgId. Staff pass orgId = null to open any file.
export async function fileFor(orgId, fileId) {
  const db = await readDb();
  const f = db.files.find((x) => x.id === fileId);
  if (!f || (orgId && f.orgId !== orgId)) return null;
  const buf = await getFile(f.id);
  return buf ? { meta: f, buf } : null;
}

// ---- staff ----
export function staffLogin(ok) {
  const now = Date.now();
  return withDb((db) => {
    if (isLocked(db, 'staff', now)) return fail('locked');
    if (!ok()) { noteFail(db, 'staff', now); return fail('invalid'); }
    noteOk(db, 'staff');
    return { ok: true };
  });
}

export async function staffOverview(orgId) {
  const db = await readDb();
  const orgs = db.orgs.map((o) => ({
    id: o.id, slug: o.slug, name: o.name, demo: Boolean(o.demo),
    profiles: o.profiles.map((p) => ({ id: p.id, name: p.name })),
    shipmentCount: db.shipments.filter((s) => s.orgId === o.id).length,
  })).sort((a, b) => a.name.localeCompare(b.name));
  const detail = orgId && db.orgs.some((o) => o.id === orgId)
    ? db.shipments.filter((s) => s.orgId === orgId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((s) => pubShipment(db, s))
    : null;
  return { orgs, shipments: detail };
}

const validPin = (p) => /^\d{4,6}$/.test(String(p ?? ''));
const validPassword = (p) => String(p ?? '').length >= 10 && String(p).length <= 200;

export function sniff(buf) {
  if (buf.length > 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return { type: 'application/pdf', ext: 'pdf' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { type: 'image/png', ext: 'png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  return null;
}

const safeName = (n, ext) => {
  const base = clean(n, 80).replace(/\.[a-z0-9]{1,5}$/i, '').replace(/[^A-Za-z0-9._ -]+/g, '_').trim() || 'file';
  return `${base}.${ext}`;
};

const ACTIONS = {
  createOrg(db, b) {
    const name = clean(b.name, 80);
    const slug = normSlug(b.slug || name);
    if (!name || !slug) return fail('Enter a company name.');
    if (!validPassword(b.password)) return fail('The password must be at least 10 characters.');
    if (db.orgs.some((o) => o.slug === slug)) return fail('That company ID is already used.');
    const org = { id: randomUUID(), slug, name, createdAt: new Date().toISOString(), passwordHash: hashSecret(b.password), profiles: [] };
    db.orgs.push(org);
    return { ok: true, orgId: org.id, slug };
  },
  resetOrgPassword(db, b) {
    const org = db.orgs.find((o) => o.id === b.orgId);
    if (!org) return fail('Company not found.');
    if (!validPassword(b.password)) return fail('The password must be at least 10 characters.');
    org.passwordHash = hashSecret(b.password);
    delete db.meta.locks[`org:${org.slug}`];
    return { ok: true };
  },
  deleteOrg(db, b) {
    const org = db.orgs.find((o) => o.id === b.orgId);
    if (!org) return fail('Company not found.');
    db.orgs = db.orgs.filter((o) => o.id !== org.id);
    db.shipments = db.shipments.filter((s) => s.orgId !== org.id);
    return { ok: true, removeFiles: db.files.filter((f) => f.orgId === org.id).map((f) => f.id), after: () => { db.files = db.files.filter((f) => f.orgId !== org.id); } };
  },
  addProfile(db, b) {
    const org = db.orgs.find((o) => o.id === b.orgId);
    if (!org) return fail('Company not found.');
    const name = clean(b.name, 40);
    if (!name) return fail('Enter a name.');
    if (!validPin(b.pin)) return fail('The PIN must be 4 to 6 digits.');
    if (org.profiles.some((p) => p.name.toLowerCase() === name.toLowerCase())) return fail('That company already has a profile with that name.');
    if (org.profiles.length >= 12) return fail('A company can have up to 12 profiles.');
    org.profiles.push({ id: randomUUID(), name, pinHash: hashSecret(b.pin) });
    return { ok: true };
  },
  resetPin(db, b) {
    const org = db.orgs.find((o) => o.id === b.orgId);
    const p = org?.profiles.find((x) => x.id === b.profileId);
    if (!p) return fail('Profile not found.');
    if (!validPin(b.pin)) return fail('The PIN must be 4 to 6 digits.');
    p.pinHash = hashSecret(b.pin);
    delete db.meta.locks[`pin:${org.id}:${p.id}`];
    return { ok: true };
  },
  removeProfile(db, b) {
    const org = db.orgs.find((o) => o.id === b.orgId);
    if (!org || !org.profiles.some((p) => p.id === b.profileId)) return fail('Profile not found.');
    org.profiles = org.profiles.filter((p) => p.id !== b.profileId);
    return { ok: true };
  },
  createShipment(db, b) {
    const org = db.orgs.find((o) => o.id === b.orgId);
    if (!org) return fail('Company not found.');
    const reference = clean(b.reference, 60);
    if (!reference) return fail('Enter a reference.');
    const status = b.status ? String(b.status) : 'In progress';
    if (!STATUSES.includes(status)) return fail('Unknown status.');
    const now = new Date().toISOString();
    db.shipments.push({ id: randomUUID(), orgId: org.id, reference, description: clean(b.description, 200), status, createdAt: now, updatedAt: now, expiresAt: addMonths(now, RETENTION_MONTHS) });
    return { ok: true };
  },
  setStatus(db, b) {
    const s = db.shipments.find((x) => x.id === b.shipmentId);
    if (!s) return fail('Shipment not found.');
    if (!STATUSES.includes(String(b.status))) return fail('Unknown status.');
    s.status = b.status;
    s.updatedAt = new Date().toISOString();
    return { ok: true };
  },
  deleteShipment(db, b) {
    const s = db.shipments.find((x) => x.id === b.shipmentId);
    if (!s) return fail('Shipment not found.');
    db.shipments = db.shipments.filter((x) => x.id !== s.id);
    const ids = db.files.filter((f) => f.shipmentId === s.id).map((f) => f.id);
    return { ok: true, removeFiles: ids, after: () => { db.files = db.files.filter((f) => f.shipmentId !== s.id); } };
  },
  deleteFile(db, b) {
    const f = db.files.find((x) => x.id === b.fileId);
    if (!f) return fail('File not found.');
    db.files = db.files.filter((x) => x.id !== f.id);
    return { ok: true, removeFiles: [f.id] };
  },
  async uploadFile(db, b) {
    const s = db.shipments.find((x) => x.id === b.shipmentId);
    if (!s) return fail('Shipment not found.');
    if (!FILE_KINDS.includes(String(b.kind))) return fail('Choose DGD, Invoice or Photo.');
    const data = String(b.data ?? '');
    if (!data || data.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 8) return fail('That file is too large. The limit is 3 MB.');
    const buf = Buffer.from(data, 'base64');
    if (!buf.length || buf.length > MAX_FILE_BYTES) return fail('That file is too large. The limit is 3 MB.');
    const kind = sniff(buf); // decided from the file's own bytes, never from the name or the browser's claim
    if (!kind) return fail('Only PDF, PNG and JPEG files can be uploaded.');
    if (b.kind === 'Photo' ? kind.ext === 'pdf' : kind.ext !== 'pdf') return fail(b.kind === 'Photo' ? 'Photos must be PNG or JPEG.' : 'DGDs and invoices must be PDFs.');
    const now = new Date().toISOString();
    const f = { id: randomUUID(), orgId: s.orgId, shipmentId: s.id, kind: b.kind, name: safeName(b.name, kind.ext), type: kind.type, size: buf.length, createdAt: now, expiresAt: addMonths(now, RETENTION_MONTHS) };
    await putFile(f.id, buf);
    db.files.push(f);
    return { ok: true };
  },
};

export function staffAction(action, body) {
  const fn = ACTIONS[action];
  if (!fn) return Promise.resolve(fail('Unknown action.'));
  return withDb(async (db) => {
    const res = await fn(db, body);
    if (res.error) return res;
    res.after?.();
    for (const id of res.removeFiles || []) await delFile(id);
    return { ok: true, ...(res.orgId ? { orgId: res.orgId, slug: res.slug } : {}) };
  });
}

// ---- retention: records are kept 5 months, then removed (run daily by the cron in vercel.json) ----
export function purgeExpired(now = Date.now()) {
  return withDb(async (db) => {
    const gone = new Set(db.files.filter((f) => Date.parse(f.expiresAt) <= now).map((f) => f.id));
    const goneShipments = new Set(db.shipments.filter((s) => Date.parse(s.expiresAt) <= now).map((s) => s.id));
    for (const f of db.files) if (goneShipments.has(f.shipmentId)) gone.add(f.id);
    db.files = db.files.filter((f) => !gone.has(f.id));
    db.shipments = db.shipments.filter((s) => !goneShipments.has(s.id));
    for (const id of gone) await delFile(id);
    return { files: gone.size, shipments: goneShipments.size };
  });
}
