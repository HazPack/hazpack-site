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
import { isProd, DEMO, NotConfigured } from './config.js';

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
    if (!(await load())) {
      const { buildDemo } = await import('./seed.js');
      const { db, bytes } = buildDemo();
      await mkdir(FILES, { recursive: true });
      for (const f of bytes) await writeFile(join(FILES, f.id), f.buf);
      await save(db);
    }
  })().catch((e) => { ready = undefined; throw e; });
  return ready;
}

export async function readDb() {
  await ensure();
  return load();
}

// Read, change and save as one step. Changes made inside fn are saved only if fn finishes without throwing.
let chain = Promise.resolve();
export function withDb(fn) {
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
export async function putFile(id, buf) {
  if (!SAFE_ID.test(id)) throw new Error('bad file id');
  await mkdir(FILES, { recursive: true });
  await writeFile(join(FILES, id), buf);
}
export async function getFile(id) {
  if (!SAFE_ID.test(id)) return null;
  try { return await readFile(join(FILES, id)); } catch { return null; }
}
export async function delFile(id) {
  if (!SAFE_ID.test(id)) return;
  try { await unlink(join(FILES, id)); } catch { /* already gone */ }
}

// Used by the seed script and tests to start over.
export async function resetAll() {
  await rm(DIR, { recursive: true, force: true });
  ready = undefined;
}
