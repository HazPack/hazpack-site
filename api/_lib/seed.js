// Made-up sample data (from the portal prototype). Every company, person and document here is fake.
// Dates are moved so the newest sample job always looks recent.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { hashSecret } from './crypto.js';
import { RETENTION_MONTHS, DB_VERSION } from './config.js';
import { samplePdf, samplePng } from './samples.js';

const SAMPLE = JSON.parse(readFileSync(new URL('./sample-data.json', import.meta.url), 'utf8'));
const BASE = Date.UTC(2026, 10, 9); // the day the prototype's sample data is written for

export const DEMO_LOGINS = [
  { slug: 'pacific', password: 'demo', profiles: { 'Dana Whitfield': '1111', 'Marcus Lee': '2222', 'Priya Nair': '3333' } },
  { slug: 'sierra', password: 'demo', profiles: { 'Alicia Romero': '4444' } },
];

// Sample file ids are worked out from the file's name, not random. On Vercel each function starts its own copy of the
// sample data, so the copies must agree on the ids or a file listed by one function could not be opened by another.
const sampleId = (seed) => { const h = createHash('sha1').update(seed).digest('hex'); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`; };
const addMonths = (iso, n) => { const d = new Date(iso); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString(); };

export function buildDemo() {
  const now = new Date();
  const shiftDays = Math.round((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - BASE) / 86400000);
  const move = (v) => {
    if (typeof v === 'string') {
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return new Date(Date.parse(v) + shiftDays * 86400000).toISOString();
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return new Date(Date.parse(v) + shiftDays * 86400000).toISOString().slice(0, 10);
      return v;
    }
    if (Array.isArray(v)) return v.map(move);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, move(x)]));
    return v;
  };
  const src = move(SAMPLE);
  const db = { v: DB_VERSION, orgs: [], docs: [], tariff: null, meta: { locks: {} } };
  const bytes = [];
  const fileIds = new Map();

  for (const o of Object.values(src.ORGS)) {
    const { password, ...rest } = o;
    const org = { ...rest, demo: true, createdAt: o.jobs[o.jobs.length - 1]?.start || now.toISOString(), passwordHash: hashSecret(password), rev: 1, rates: o.rates || {}, accountsEmail: o.accountsEmail || '' };
    org.reps = o.reps.map(({ pin, ...r }) => ({ ...r, pinHash: hashSecret(pin) }));
    for (const j of org.jobs) { j.createdAt = j.start; j.expiresAt = addMonths(j.start, RETENTION_MONTHS); }
    org.files = o.files.map((f) => {
      const id = sampleId(`${o.id}:${f.id}`);
      fileIds.set(f.id, id);
      const job = org.jobs.find((j) => j.id === f.job);
      const isImg = f.type === 'Photo';
      const buf = isImg ? samplePng() : samplePdf(f.name.replace(/\.pdf$/i, ''), [`Job: ${f.job || 'none'}`, `Prepared for: ${o.name}`, job ? `Item: ${job.item} (${job.un})` : '', f.note ? `Note: ${f.note}` : ''].filter(Boolean));
      bytes.push({ id, buf });
      return { ...f, id, name: isImg ? f.name.replace(/\.pdf$/i, '.png') : f.name, bytes: buf.length, mime: isImg ? 'image/png' : 'application/pdf', expiresAt: addMonths(f.date, RETENTION_MONTHS) };
    });
    db.orgs.push(org);
  }
  for (const d of src.DOCS) {
    const lines = (d.lines || []).reduce((s, l) => s + l.rate * l.qty, 0);
    db.docs.push({ ...d, fileId: d.fileId ? fileIds.get(d.fileId) : d.fileId, total: Math.round(lines * 100) / 100 });
  }
  return { db, bytes };
}
