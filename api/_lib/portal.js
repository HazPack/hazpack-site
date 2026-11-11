// Client portal rules. Every function that reads or changes client data takes the company id from the
// signed session, never from the request, so one company can never reach another company's records.
//
// Data shape (db.json):
//   orgs[]  { id (= company ID people type), name, passwordHash, accountsEmail, rates, reps[], jobs[], files[], notifs[], rev }
//   docs[]  quotes and invoices written by staff (each has orgId)
//   tariff  HazPack's standard rate card
// Staff (one shared key) can write an organisation as a whole with `saveOrg`. Clients can only run the
// small list of actions in CLIENT_ACTIONS below, each of which checks what that person may do.
import { randomUUID } from 'node:crypto';
import { hashSecret, verifySecret, DUMMY_HASH } from './crypto.js';
import { FILE_TYPES, CLIENT_FILE_TYPES, SERVICES, RETENTION_MONTHS, MAX_FILE_BYTES, MAX_FAILS, LOCK_MS } from './config.js';
import { withDb, readDb, putFile, getFile, delFile } from './store.js';

const clean = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
export const normSlug = (v) => String(v ?? '').trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
const addMonths = (iso, n) => { const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString(); };
const nowIso = () => new Date().toISOString();
const fail = (error) => ({ error });
const money = (n) => '$' + Number(n || 0).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const validPin = (p) => /^\d{4}$/.test(String(p ?? ''));
const validPassword = (p) => String(p ?? '').length >= 10 && String(p).length <= 200;

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

// ---- sign-in ----
export function clientLogin(slug, password) {
  const s = normSlug(slug);
  const now = Date.now();
  return withDb((db) => {
    const key = `org:${s}`;
    if (isLocked(db, key, now)) return fail('locked');
    const org = db.orgs.find((o) => o.id === s);
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
    const rep = org?.reps.find((p) => p.id === profileId);
    if (!org || !rep) return fail('invalid');
    const key = `pin:${org.id}:${rep.id}`;
    if (isLocked(db, key, now)) return fail('locked');
    if (!verifySecret(String(pin ?? ''), rep.pinHash)) { noteFail(db, key, now); return fail('invalid'); }
    noteOk(db, key);
    return { org, profile: rep };
  });
}

export async function getClient(orgId, profileId) {
  const db = await readDb();
  const org = db.orgs.find((o) => o.id === orgId);
  if (!org) return null;
  const profile = profileId ? org.reps.find((p) => p.id === profileId) || null : null;
  if (profileId && !profile) return null; // that person was removed
  return { org, profile };
}

export function staffLogin(ok) {
  const now = Date.now();
  return withDb((db) => {
    if (isLocked(db, 'staff', now)) return fail('locked');
    if (!ok()) { noteFail(db, 'staff', now); return fail('invalid'); }
    noteOk(db, 'staff');
    return { ok: true };
  });
}

// ---- what each kind of user is sent (never a hash, never another company) ----
const pubRep = (r) => { const { pinHash, ...rest } = r; return rest; };
const pubOrg = (o) => { const { passwordHash, ...rest } = o; return { ...rest, reps: o.reps.map(pubRep) }; };
const canSee = (rep, job) => rep.admin || job.rep === rep.id;

export function clientState(db, org, rep) {
  const jobs = org.jobs.filter((j) => canSee(rep, j));
  const ids = new Set(jobs.map((j) => j.id));
  const files = org.files.filter((f) => ids.has(f.job) || (!f.job && rep.admin));
  const fileIds = new Set(files.map((f) => f.id));
  const notifs = org.notifs.filter((n) => n.to === 'client' && (n.job ? ids.has(n.job) : rep.admin));
  const docs = db.docs.filter((d) => d.orgId === org.id && d.fileId && fileIds.has(d.fileId));
  return { org: { ...pubOrg(org), jobs, files, notifs, accountsEmail: rep.admin ? org.accountsEmail : undefined, rates: undefined }, docs, me: rep.id, rev: org.rev };
}

export async function clientData(orgId, repId) {
  const db = await readDb();
  const org = db.orgs.find((o) => o.id === orgId);
  const rep = org?.reps.find((r) => r.id === repId);
  return org && rep ? clientState(db, org, rep) : null;
}

export async function staffData() {
  const db = await readDb();
  return { orgs: db.orgs.map(pubOrg), docs: db.docs, tariff: db.tariff || null, staff: true };
}

// Returns file info only if it belongs to the signed-in person's company (and a job they can see).
// Staff pass orgId = null to open any file.
export async function fileFor(orgId, repId, fileId) {
  const db = await readDb();
  let meta = null;
  let owner = null;
  for (const o of db.orgs) { const f = o.files.find((x) => x.id === fileId); if (f) { meta = f; owner = o; } }
  if (!meta || (orgId && owner.id !== orgId)) return null;
  if (orgId) {
    const rep = owner.reps.find((r) => r.id === repId);
    const job = meta.job ? owner.jobs.find((j) => j.id === meta.job) : null;
    if (!rep || (meta.job ? !job || !canSee(rep, job) : !rep.admin)) return null;
  }
  const buf = await getFile(meta.id);
  return buf ? { meta, buf } : null;
}

// ---- file checks: decided from the file's own bytes, never from the name or the browser's claim ----
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
const sizeText = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

// Checks and stores one uploaded file. Returns the new file record (already added to org.files).
async function storeUpload(org, { jobId, type, name, data, note, by, step }) {
  if (!FILE_TYPES.includes(type)) return fail('Choose a file type.');
  const text = String(data ?? '');
  if (!text || text.length > Math.ceil(MAX_FILE_BYTES * 4 / 3) + 8) return fail('That file is too large. The limit is 3 MB.');
  const buf = Buffer.from(text, 'base64');
  if (!buf.length || buf.length > MAX_FILE_BYTES) return fail('That file is too large. The limit is 3 MB.');
  const kind = sniff(buf);
  if (!kind) return fail('Only PDF, PNG and JPEG files can be uploaded.');
  if (type === 'Photo' ? kind.ext === 'pdf' : kind.ext !== 'pdf') return fail(type === 'Photo' ? 'Photos must be PNG or JPEG.' : 'Declarations, reports, invoices and documents must be PDFs.');
  const now = nowIso();
  const f = { id: randomUUID(), job: jobId || '', type, name: safeName(name, kind.ext), size: sizeText(buf.length), bytes: buf.length, mime: kind.type, date: now, by, note: clean(note, 200), step: clean(step, 80), expiresAt: addMonths(now, RETENTION_MONTHS) };
  await putFile(f.id, buf);
  org.files.push(f);
  return { file: f };
}

// ---- helpers for jobs ----
const LB = { rec: 'Job received', rev: 'Documents reviewed', cls: 'Shipment classified', pack: 'Packed and photographed', temp: 'Temperature control set up', dry: 'Dry ice loaded and marked', insp: 'Inspection complete', dgdp: 'Declaration prepared', dgd: 'Declaration signed, cleared to ship', consult: 'Consultation delivered', emerg: 'Emergency support provided', inv: 'Invoice sent' };
// Every job starts the same way, then gets a step for each service chosen, and ends with the invoice.
function stepsFor(svc) {
  const has = (k) => svc.includes(k);
  const s = [LB.rec, LB.rev];
  if (has('class')) s.push(LB.cls);
  if (has('pack') || has('temp') || has('dry')) s.push(LB.pack);
  if (has('temp')) s.push(LB.temp);
  if (has('dry')) s.push(LB.dry);
  if (has('insp')) s.push(LB.insp);
  if (has('dgd') || has('dry')) { s.push(LB.dgdp); s.push(LB.dgd); }
  if (has('consult')) s.push(LB.consult);
  if (has('emerg')) s.push(LB.emerg);
  s.push(LB.inv);
  return s;
}
const logEv = (j, who, text) => { j.log.push({ date: nowIso(), who, text }); if (j.log.length > 400) j.log.splice(0, j.log.length - 400); };
const notify = (org, job, text, to) => { org.notifs.unshift({ id: randomUUID(), to, job: job || '', text: clean(text, 400), date: nowIso(), read: {} }); if (org.notifs.length > 300) org.notifs.length = 300; };
function nextJobId(db) {
  let max = 0;
  for (const o of db.orgs) for (const j of o.jobs) { const n = parseInt(String(j.id).slice(-3), 10); if (n > max) max = n; }
  const d = new Date();
  return `HP-${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}-${String(max + 1).padStart(3, '0')}`;
}
function makeJob(db, rep, f) {
  const svc = [...new Set((Array.isArray(f.svc) ? f.svc : []).filter((k) => SERVICES.includes(k)))];
  if (!svc.length) return null;
  const now = nowIso();
  const j = {
    id: nextJobId(db), rep: rep.id, item: clean(f.item, 160) || 'Shipment, details to be confirmed', un: clean(f.un, 12).toUpperCase(),
    cls: clean(f.cls, 20) || 'To be confirmed', pg: clean(f.pg, 12) || 'N/A', qty: clean(f.qty, 80),
    mode: ['Air', 'Ground', 'Ocean'].includes(f.mode) ? f.mode : 'Air', from: /^[A-Z]{3}$/.test(f.from) ? f.from : 'LAX',
    to: /^[A-Z]{3}$/.test(f.to) ? f.to : null, toText: clean(f.toText, 80), ref: clean(f.ref, 60),
    req: /^\d{4}-\d{2}-\d{2}$/.test(String(f.req || '')) ? f.req : '',
    svc, steps: stepsFor(svc), done: 0, start: now, pending: true, fix: false, msgs: [], owner: '', pri: '', by: {}, notes: {},
    ev: [[now, 'Request submitted']], log: [], createdAt: now, expiresAt: addMonths(now, RETENTION_MONTHS),
  };
  return j;
}

// ---- what a signed-in person can do ----
const CLIENT_ACTIONS = {
  requestJob(db, org, rep, b) {
    const j = makeJob(db, rep, b);
    if (!j) return fail('Choose at least one service.');
    j.log.push({ date: j.start, who: rep.name, text: 'Request submitted' });
    org.jobs.unshift(j);
    notify(org, j.id, `${rep.name} of ${org.name} submitted a job request, ${j.id}.`, 'staff');
    return { jobId: j.id };
  },
  withdrawJob(db, org, rep, b) {
    const j = org.jobs.find((x) => x.id === b.jobId);
    if (!j || !canSee(rep, j) || !j.pending) return fail('That request can no longer be withdrawn.');
    org.jobs = org.jobs.filter((x) => x.id !== j.id);
    const gone = org.files.filter((f) => f.job === j.id).map((f) => f.id);
    org.files = org.files.filter((f) => f.job !== j.id);
    notify(org, j.id, `${rep.name} of ${org.name} withdrew the request ${j.id}.`, 'staff');
    return { removeFiles: gone };
  },
  sendMessage(db, org, rep, b) {
    const j = org.jobs.find((x) => x.id === b.jobId);
    const text = clean(b.text, 2000);
    if (!j || !canSee(rep, j) || !text) return fail('Write a message first.');
    j.msgs.push({ from: 'client', who: `${rep.name}, ${org.name}`, text, date: nowIso() });
    logEv(j, rep.name, 'Sent a message');
    notify(org, j.id, `${rep.name} of ${org.name} sent a message on ${j.id}.`, 'staff');
    return {};
  },
  async uploadFile(db, org, rep, b) {
    const j = org.jobs.find((x) => x.id === b.jobId);
    if (!j || !canSee(rep, j)) return fail('Job not found.');
    if (!CLIENT_FILE_TYPES.includes(b.type)) return fail('Choose a file type.');
    const r = await storeUpload(org, { jobId: j.id, type: b.type, name: b.name, data: b.data, note: b.note, by: `${rep.name}, ${org.name}`, step: b.step });
    if (r.error) return r;
    if (!(b.quiet && j.pending)) {
      logEv(j, rep.name, `Uploaded ${r.file.name} (${b.type})`);
      notify(org, j.id, `${rep.name} uploaded ${r.file.name} to ${j.id}.`, 'staff');
    }
    return { fileId: r.file.id };
  },
  // Accept or decline a quote HazPack sent. Accepting a quote with no job yet opens a new job request.
  decideQuote(db, org, rep, b) {
    const f = org.files.find((x) => x.id === b.fileId);
    const q = f && f.docId ? db.docs.find((d) => d.id === f.docId && d.orgId === org.id) : null;
    if (!q || q.type !== 'Quote') return fail('Quote not found.');
    const job = f.job ? org.jobs.find((x) => x.id === f.job) : null;
    if (job ? !canSee(rep, job) : !(rep.admin || q.repId === rep.id)) return fail('Quote not found.');
    if (q.status === 'Accepted' || q.status === 'Declined') return fail('This quote has already been answered.');
    const accept = Boolean(b.accept);
    const typed = clean(b.typed, 80);
    const why = clean(b.reason, 300);
    if (accept && typed.toLowerCase() !== rep.name.toLowerCase()) return fail('Type your full name exactly as shown to accept.');
    q.status = accept ? 'Accepted' : 'Declined';
    q.decision = { action: q.status, by: rep.name, typed: accept ? typed : '', when: nowIso().slice(0, 10), reason: why };
    f.note = `Quote, ${money(q.total)}, ${accept ? 'accepted' : 'declined'}`;
    let made = null;
    if (accept && !q.jobId) {
      const ids = (q.lines || []).map((l) => String(l.id));
      const svc = [];
      if (ids.some((i) => /^dgd/.test(i))) svc.push('dgd');
      if (ids.some((i) => /^(pack|label|overpack|pallet)/.test(i))) svc.push('pack');
      if (ids.some((i) => /^insp/.test(i))) svc.push('insp');
      made = makeJob(db, rep, { svc: svc.length ? svc : ['dgd'], ref: q.bkg });
      made.rep = q.repId && org.reps.some((r) => r.id === q.repId) ? q.repId : rep.id;
      made.log = [{ date: made.start, who: rep.name, text: 'Request submitted' }];
      logEv(made, rep.name, `Request opened from accepted quote ${q.docNum}`);
      org.jobs.unshift(made);
      f.job = made.id; q.jobId = made.id;
    }
    logEv(job || made, rep.name, `${accept ? 'Accepted' : 'Declined'} quote ${q.docNum}${why ? ': ' + why : ''}`);
    notify(org, f.job, `${rep.name} ${accept ? 'accepted' : 'declined'} quote ${q.docNum} (${money(q.total)})${f.job ? ' on ' + f.job : ''}.${made ? ' A job request, ' + made.id + ', was opened.' : ''}`, 'staff');
    return { jobId: made?.id || null };
  },
  // The route read from a declaration (or chosen by hand) after an upload.
  setRoute(db, org, rep, b) {
    const j = org.jobs.find((x) => x.id === b.jobId);
    if (!j || !canSee(rep, j)) return fail('Job not found.');
    j.from = /^[A-Z]{3}$/.test(b.from) ? b.from : 'LAX';
    j.to = /^[A-Z]{3}$/.test(b.to) ? b.to : null;
    j.toText = clean(b.toText, 80);
    logEv(j, rep.name, 'Set the route');
    return {};
  },
  readNotifs(db, org, rep, b) {
    const all = Boolean(b.all);
    const ids = new Set(Array.isArray(b.ids) ? b.ids.map(String) : []);
    const visible = new Set(org.jobs.filter((j) => canSee(rep, j)).map((j) => j.id));
    for (const n of org.notifs) if (n.to === 'client' && (n.job ? visible.has(n.job) : rep.admin) && (all || ids.has(n.id))) n.read[rep.id] = 1;
    return {};
  },
  // ---- team ----
  addRep(db, org, rep, b) {
    if (!rep.admin) return fail('Only an admin can add people.');
    const name = clean(b.name, 40);
    if (!name) return fail('Enter a name.');
    if (!validPin(b.pin)) return fail('The PIN must be 4 digits.');
    if (org.reps.some((p) => p.name.toLowerCase() === name.toLowerCase())) return fail('Someone with that name is already on the team.');
    if (org.reps.length >= 25) return fail('A company can have up to 25 people.');
    org.reps.push({ id: randomUUID(), name, title: clean(b.title, 60) || 'Team member', email: clean(b.email, 120), phone: clean(b.phone, 40), addr: '', city: '', admin: Boolean(b.admin), notify: true, pinHash: hashSecret(b.pin) });
    return {};
  },
  resetPin(db, org, rep, b) {
    if (!rep.admin) return fail('Only an admin can reset a PIN.');
    const t = org.reps.find((p) => p.id === b.repId);
    if (!t) return fail('Person not found.');
    if (!validPin(b.pin)) return fail('The PIN must be 4 digits.');
    t.pinHash = hashSecret(b.pin);
    delete db.meta.locks[`pin:${org.id}:${t.id}`];
    return {};
  },
  setAdmin(db, org, rep, b) {
    if (!rep.admin) return fail('Only an admin can change access.');
    const t = org.reps.find((p) => p.id === b.repId);
    if (!t) return fail('Person not found.');
    const admin = Boolean(b.admin);
    if (!admin && t.admin && org.reps.filter((p) => p.admin).length < 2) return fail('A company must keep at least one admin.');
    t.admin = admin;
    return {};
  },
  removeRep(db, org, rep, b) {
    if (!rep.admin) return fail('Only an admin can remove people.');
    const t = org.reps.find((p) => p.id === b.repId);
    if (!t) return fail('Person not found.');
    if (t.id === rep.id) return fail('You cannot remove yourself.');
    if (t.admin && org.reps.filter((p) => p.admin).length < 2) return fail('A company must keep at least one admin.');
    org.reps = org.reps.filter((p) => p.id !== t.id);
    return {};
  },
  editRep(db, org, rep, b) {
    const t = org.reps.find((p) => p.id === b.repId);
    if (!t || (t.id !== rep.id && !rep.admin)) return fail('Person not found.');
    for (const [k, max] of [['title', 60], ['email', 120], ['phone', 40], ['addr', 120], ['city', 80]]) if (k in b) t[k] = clean(b[k], max);
    if (typeof b.notify === 'boolean') t.notify = b.notify;
    return {};
  },
};

export function clientAction(orgId, repId, action, body) {
  const fn = CLIENT_ACTIONS[action];
  if (!fn) return Promise.resolve(fail('Unknown action.'));
  return withDb(async (db) => {
    const org = db.orgs.find((o) => o.id === orgId);
    const rep = org?.reps.find((r) => r.id === repId);
    if (!org || !rep) return fail('Please sign in again.');
    const res = await fn(db, org, rep, body);
    if (res.error) return res;
    for (const id of res.removeFiles || []) await delFile(id);
    org.rev = (org.rev || 0) + 1;
    return { ok: true, jobId: res.jobId, fileId: res.fileId, state: clientState(db, org, rep) };
  });
}

// ---- staff ----
const STAFF_ACTIONS = {
  createOrg(db, b) {
    const name = clean(b.name, 80);
    const slug = normSlug(b.slug || name);
    if (!name || !slug) return fail('Enter a company name.');
    if (!validPassword(b.password)) return fail('The password must be at least 10 characters.');
    if (db.orgs.some((o) => o.id === slug)) return fail('That company ID is already used.');
    const admin = b.adminName ? clean(b.adminName, 40) : '';
    const org = { id: slug, name, createdAt: nowIso(), passwordHash: hashSecret(b.password), accountsEmail: '', rates: {}, reps: [], jobs: [], files: [], notifs: [], rev: 1 };
    if (admin) {
      if (!validPin(b.pin)) return fail('The PIN must be 4 digits.');
      org.reps.push({ id: randomUUID(), name: admin, title: clean(b.adminTitle, 60) || 'Account admin', email: clean(b.adminEmail, 120), phone: '', addr: '', city: '', admin: true, notify: true, pinHash: hashSecret(b.pin) });
    }
    db.orgs.push(org);
    return { ok: true, orgId: org.id, slug };
  },
  resetOrgPassword(db, b) {
    const org = db.orgs.find((o) => o.id === b.orgId);
    if (!org) return fail('Company not found.');
    if (!validPassword(b.password)) return fail('The password must be at least 10 characters.');
    org.passwordHash = hashSecret(b.password);
    delete db.meta.locks[`org:${org.id}`];
    return { ok: true };
  },
  deleteOrg(db, b) {
    const org = db.orgs.find((o) => o.id === b.orgId);
    if (!org) return fail('Company not found.');
    db.orgs = db.orgs.filter((o) => o.id !== org.id);
    db.docs = db.docs.filter((d) => d.orgId !== org.id);
    return { ok: true, removeFiles: org.files.map((f) => f.id) };
  },
  addRep(db, b) {
    const org = db.orgs.find((o) => o.id === b.orgId);
    if (!org) return fail('Company not found.');
    return CLIENT_ACTIONS.addRep(db, org, { admin: true }, b);
  },
  resetPin(db, b) {
    const org = db.orgs.find((o) => o.id === b.orgId);
    if (!org) return fail('Company not found.');
    return CLIENT_ACTIONS.resetPin(db, org, { admin: true }, b);
  },
  // Replaces what staff can edit in one company: its people's details, jobs, files' details, alerts, rates, and the quotes/invoices.
  saveOrg(db, b) {
    const org = db.orgs.find((o) => o.id === b.orgId);
    if (!org) return fail('Company not found.');
    if ((org.rev || 0) !== b.rev) return { error: 'This company was changed by someone else. Reloading.', conflict: true };
    const inc = b.org;
    if (!inc || typeof inc !== 'object' || !Array.isArray(inc.jobs) || !Array.isArray(inc.files) || !Array.isArray(inc.notifs) || !Array.isArray(inc.reps)) return fail('Invalid data.');
    if (JSON.stringify(inc).length > 3_000_000) return fail('That is too much data.');
    const hashes = new Map(org.reps.map((r) => [r.id, r.pinHash]));
    const knownFiles = new Map(org.files.map((f) => [f.id, f]));
    const reps = inc.reps.map((r) => ({ ...r, pinHash: hashes.get(r.id) })).filter((r) => r.pinHash); // new people only via addRep (needs a PIN)
    if (inc.reps.length && !reps.some((r) => r.admin)) return fail('A company must keep at least one admin.');
    // A file record can only point at bytes that were uploaded through uploadFile; staff cannot invent file ids.
    const files = inc.files.filter((f) => knownFiles.has(f.id)).map((f) => ({ ...f, bytes: knownFiles.get(f.id).bytes, mime: knownFiles.get(f.id).mime, expiresAt: knownFiles.get(f.id).expiresAt }));
    const kept = new Set(files.map((f) => f.id));
    const removeFiles = org.files.filter((f) => !kept.has(f.id)).map((f) => f.id);
    org.name = clean(inc.name, 80) || org.name;
    org.accountsEmail = clean(inc.accountsEmail, 120);
    org.rates = inc.rates && typeof inc.rates === 'object' ? inc.rates : {};
    org.reps = reps; org.jobs = inc.jobs; org.files = files; org.notifs = inc.notifs;
    if (inc.billing && typeof inc.billing === 'object') {
      const bl = inc.billing;
      org.billing = { company: clean(bl.company, 80), name: clean(bl.name, 60), email: clean(bl.email, 120), phone: clean(bl.phone, 40), addr: clean(bl.addr, 120), city: clean(bl.city, 80) };
    } else delete org.billing;
    org.rev = (org.rev || 0) + 1;
    return { ok: true, removeFiles, rev: org.rev };
  },
  // Quotes and invoices for one company (orgId '' holds ones written for a company that has no portal yet).
  saveDocs(db, b) {
    const orgId = String(b.orgId ?? '');
    if (orgId && !db.orgs.some((o) => o.id === orgId)) return fail('Company not found.');
    if (!Array.isArray(b.docs) || JSON.stringify(b.docs).length > 3_000_000) return fail('Invalid data.');
    const mine = b.docs.filter((d) => d && typeof d === 'object' && String(d.orgId ?? '') === orgId);
    db.docs = db.docs.filter((d) => String(d.orgId ?? '') !== orgId).concat(mine);
    return { ok: true };
  },
  saveTariff(db, b) {
    if (!Array.isArray(b.tariff) || b.tariff.length > 60 || JSON.stringify(b.tariff).length > 60_000) return fail('Invalid data.');
    db.tariff = b.tariff;
    return { ok: true };
  },
  async uploadFile(db, b) {
    const org = db.orgs.find((o) => o.id === b.orgId);
    if (!org) return fail('Company not found.');
    if (b.jobId && !org.jobs.some((j) => j.id === b.jobId)) return fail('Job not found.');
    const r = await storeUpload(org, { jobId: b.jobId, type: b.type, name: b.name, data: b.data, note: b.note, by: 'HazPack', step: b.step });
    if (r.error) return r;
    if (b.docId) r.file.docId = clean(b.docId, 60);
    org.rev = (org.rev || 0) + 1;
    return { ok: true, file: r.file, rev: org.rev };
  },
};

export function staffAction(action, body) {
  const fn = STAFF_ACTIONS[action];
  if (!fn) return Promise.resolve(fail('Unknown action.'));
  return withDb(async (db) => {
    const res = await fn(db, body);
    if (res.error) return res;
    for (const id of res.removeFiles || []) await delFile(id);
    if (action === 'addRep' || action === 'resetPin') {
      const org = db.orgs.find((o) => o.id === body.orgId); if (org) org.rev = (org.rev || 0) + 1;
    }
    const { removeFiles, ...rest } = res;
    return { ok: true, ...rest };
  });
}

// ---- retention: records are kept 5 months, then removed (run daily by the cron in vercel.json) ----
export function purgeExpired(now = Date.now()) {
  return withDb(async (db) => {
    let files = 0; let jobs = 0;
    for (const org of db.orgs) {
      const goneJobs = new Set(org.jobs.filter((j) => Date.parse(j.expiresAt) <= now).map((j) => j.id));
      const goneFiles = org.files.filter((f) => Date.parse(f.expiresAt) <= now || (f.job && goneJobs.has(f.job)));
      const ids = new Set(goneFiles.map((f) => f.id));
      if (!goneJobs.size && !ids.size) continue;
      org.jobs = org.jobs.filter((j) => !goneJobs.has(j.id));
      org.files = org.files.filter((f) => !ids.has(f.id));
      db.docs = db.docs.filter((d) => !(d.orgId === org.id && ((d.jobId && goneJobs.has(d.jobId)) || (d.fileId && ids.has(d.fileId)))));
      for (const id of ids) await delFile(id);
      files += ids.size; jobs += goneJobs.size; org.rev = (org.rev || 0) + 1;
    }
    return { files, shipments: jobs, jobs };
  });
}
