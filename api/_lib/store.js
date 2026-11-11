// Storage for the client portal.
//
// This first version keeps everything in a JSON file plus a folder of files (data/ locally, /tmp on a
// Vercel preview when PORTAL_DEMO=1). It is for building and testing with sample data only.
// Before real clients use the portal, replace this one file with a real database and private file
// storage that exposes the same functions: readDb, withDb, putFile, getFile, delFile.
import { mkdir, readFile, writeFile, rename, unlink, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isProd, DEMO, NotConfigured, DB_VERSION, supabaseConfig, FILE_BUCKET } from './config.js';

const DIR = process.env.PORTAL_DATA_DIR
  || (isProd ? join(tmpdir(), 'hazpack-portal') : fileURLToPath(new URL('../../data', import.meta.url)));
const DB = join(DIR, 'portal.json');
const FILES = join(DIR, 'files');

async function load() {
  try { return JSON.parse(await readFile(DB, 'utf8')); } catch { return null; }
}

async function save(db) {
  await mkdir(DIR, { recursive: true });
  const tmp = `${DB}.tmp`;
  await writeFile(tmp, JSON.stringify(db, null, 2));
  await rename(tmp, DB);
}

// Writes the sample data the first time the portal runs (local development and demo previews only).
let ready;
function ensure() {
  ready ??= (async () => {
    if (isProd && !DEMO) throw new NotConfigured('Portal storage is not configured.');
    const have = await load();
    if (!have || have.v !== DB_VERSION) {
      const { buildDemo } = await import('./seed.js');
      const { db, bytes } = buildDemo();
      await rm(FILES, { recursive: true, force: true });
      await mkdir(FILES, { recursive: true });
      for (const f of bytes) await writeFile(join(FILES, f.id), f.buf);
      await save(db);
    }
  })().catch((e) => { ready = undefined; throw e; });
  return ready;
}

async function localRead() {
  await ensure();
  return load();
}

// Read, change and save as one step. Changes made inside fn are saved only if fn finishes without throwing.
let chain = Promise.resolve();
function localWith(fn) {
  const run = chain.then(async () => {
    await ensure();
    const db = await load();
    const out = await fn(db);
    await save(db);
    return out;
  });
  chain = run.catch(() => {});
  return run;
}

const SAFE_ID = /^[a-f0-9-]{36}$/;
async function localPut(id, buf) {
  if (!SAFE_ID.test(id)) throw new Error('bad file id');
  await mkdir(FILES, { recursive: true });
  await writeFile(join(FILES, id), buf);
}
async function localGet(id) {
  if (!SAFE_ID.test(id)) return null;
  try { return await readFile(join(FILES, id)); } catch { return null; }
}
async function localDel(id) {
  if (!SAFE_ID.test(id)) return;
  try { await unlink(join(FILES, id)); } catch { /* already gone */ }
}

// Used by the seed script and tests to start over (local files only).
export async function resetAll() {
  await rm(DIR, { recursive: true, force: true });
  ready = undefined;
}

// ---------------------------------------------------------------------------------------------------------------
// Supabase. All records live in one row of the table portal_state (created once with the SQL in PORTAL.md).
// A change reads the row and its revision number, runs, and writes back only if the revision is unchanged; if another
// request got there first, it starts again from the fresh row. Files go in a private Storage bucket. Everything is
// reached over HTTPS from this server code, using a key that exists only in Vercel's environment variables.
// ---------------------------------------------------------------------------------------------------------------
const api = (cfg, path, init = {}) => fetch(`${cfg.url}${path}`, { ...init, headers: { authorization: `Bearer ${cfg.key}`, apikey: cfg.key, ...(init.headers || {}) } });
const ROW = '/rest/v1/portal_state?id=eq.1';
let sbReady;

function sbEnsure(cfg) {
  sbReady ??= (async () => {
    const t = await api(cfg, `${ROW}&select=rev`);
    if (!t.ok) throw new Error(`portal_state table is not set up (${t.status}). Run the SQL in PORTAL.md in the Supabase SQL editor.`);
    const rows = await t.json();
    if (!rows.length) {
      const empty = { v: DB_VERSION, orgs: [], docs: [], tariff: null, meta: { locks: {} } };
      await api(cfg, '/rest/v1/portal_state', { method: 'POST', headers: { 'content-type': 'application/json', prefer: 'resolution=ignore-duplicates' }, body: JSON.stringify({ id: 1, rev: 0, data: empty }) });
    }
    const b = await api(cfg, '/storage/v1/bucket', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: FILE_BUCKET, name: FILE_BUCKET, public: false }) });
    if (!b.ok && b.status !== 409 && !/already exists|Duplicate/i.test(await b.text())) throw new Error(`could not create the file bucket (${b.status})`);
  })().catch((e) => { sbReady = undefined; throw e; });
  return sbReady;
}

async function sbRow(cfg) {
  await sbEnsure(cfg);
  const r = await api(cfg, `${ROW}&select=data,rev`);
  if (!r.ok) throw new Error(`database read failed (${r.status})`);
  const rows = await r.json();
  if (!rows[0]) throw new Error('portal_state row is missing');
  return rows[0];
}
const sbRead = async (cfg) => (await sbRow(cfg)).data;

async function sbWith(cfg, fn) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const { data: db, rev } = await sbRow(cfg);
    const out = await fn(db);
    const w = await api(cfg, `${ROW}&rev=eq.${rev}`, { method: 'PATCH', headers: { 'content-type': 'application/json', prefer: 'return=representation' }, body: JSON.stringify({ data: db, rev: rev + 1, updated_at: new Date().toISOString() }) });
    if (!w.ok) throw new Error(`database write failed (${w.status})`);
    if ((await w.json()).length) return out; // saved
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120)); // someone else saved first: try again on the fresh data
  }
  throw new Error('the portal is busy, please try again');
}

async function sbPut(cfg, id, buf) {
  if (!SAFE_ID.test(id)) throw new Error('bad file id');
  await sbEnsure(cfg);
  const r = await api(cfg, `/storage/v1/object/${FILE_BUCKET}/${id}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-upsert': 'true' }, body: buf });
  if (!r.ok) throw new Error(`file upload failed (${r.status})`);
}
async function sbGet(cfg, id) {
  if (!SAFE_ID.test(id)) return null;
  await sbEnsure(cfg);
  const r = await api(cfg, `/storage/v1/object/authenticated/${FILE_BUCKET}/${id}`);
  if (r.status === 400 || r.status === 404) return null;
  if (!r.ok) throw new Error(`file download failed (${r.status})`);
  return Buffer.from(await r.arrayBuffer());
}
async function sbDel(cfg, id) {
  if (!SAFE_ID.test(id)) return;
  await sbEnsure(cfg);
  await api(cfg, `/storage/v1/object/${FILE_BUCKET}/${id}`, { method: 'DELETE' }).catch(() => {});
}

// ---- the functions the rest of the portal uses ----
function mode() {
  const cfg = supabaseConfig();
  if (cfg) return cfg;
  if (isProd && !DEMO) throw new NotConfigured('Portal storage is not configured.');
  return null;
}
export const readDb = () => { const c = mode(); return c ? sbRead(c) : localRead(); };
export const withDb = (fn) => { const c = mode(); return c ? sbWith(c, fn) : localWith(fn); };
export const putFile = (id, buf) => { const c = mode(); return c ? sbPut(c, id, buf) : localPut(id, buf); };
export const getFile = (id) => { const c = mode(); return c ? sbGet(c, id) : localGet(id); };
export const delFile = (id) => { const c = mode(); return c ? sbDel(c, id) : localDel(id); };
