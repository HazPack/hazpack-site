// Checks the Supabase storage code against a fake Supabase (its web API imitated in memory):  node scripts/test-supabase.mjs
import { createServer } from 'node:http';

let row = null;             // { id, rev, data }
const bucket = new Map();   // file id -> Buffer
let bucketMade = 0;
let conflictOnce = false;   // make the next PATCH lose a race
const log = [];
const fake = createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);
  const u = new URL(req.url, 'http://x');
  const json = (code, v) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(v)); };
  if (!/^Bearer test-service-key$/.test(req.headers.authorization || '') || req.headers.apikey !== 'test-service-key') return json(401, { message: 'bad key' });
  log.push(`${req.method} ${u.pathname}`);
  if (u.pathname === '/rest/v1/portal_state') {
    if (req.method === 'GET') return json(200, row ? [{ ...row }] : []);
    if (req.method === 'POST') { const b = JSON.parse(body); if (!row) row = { id: b.id, rev: b.rev, data: b.data }; return json(201, []); }
    if (req.method === 'PATCH') {
      const want = Number(u.searchParams.get('rev').replace('eq.', ''));
      if (conflictOnce) { conflictOnce = false; row.rev += 1; } // another request saved first
      if (row.rev !== want) return json(200, []);
      const b = JSON.parse(body); row = { ...row, data: b.data, rev: b.rev };
      return json(200, [row]);
    }
  }
  if (u.pathname === '/storage/v1/bucket' && req.method === 'POST') { bucketMade++; return bucketMade > 1 ? json(409, { message: 'Duplicate' }) : json(200, {}); }
  const m = u.pathname.match(/^\/storage\/v1\/object\/(?:authenticated\/)?portal-files\/(.+)$/);
  if (m) {
    if (req.method === 'POST') { bucket.set(m[1], body); return json(200, {}); }
    if (req.method === 'GET') { if (!bucket.has(m[1])) return json(404, {}); res.writeHead(200); return res.end(bucket.get(m[1])); }
    if (req.method === 'DELETE') { bucket.delete(m[1]); return json(200, {}); }
  }
  json(404, { message: 'no route ' + u.pathname });
});
await new Promise((r) => fake.listen(0, r));
process.env.SUPABASE_URL = `http://localhost:${fake.address().port}`;
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-key';
process.env.VERCEL = '1'; // as on Vercel: no local-file fallback allowed

let passed = 0; const failures = [];
const check = (n, c, x = '') => { if (c) passed++; else { failures.push(n); console.log(`  FAIL  ${n} ${x}`); } };

const store = await import('../api/_lib/store.js');
const { clientLogin, staffAction, readDb: _r } = await import('../api/_lib/portal.js');

const db0 = await store.readDb();
check('first read creates an empty database row', row && db0.orgs.length === 0 && db0.v === 2);
check('the file bucket was created', bucketMade === 1);

const made = await staffAction('createOrg', { name: 'Fake Co', password: 'a-long-enough-pass', adminName: 'Sam', pin: '1234' });
check('company is saved', made.ok && row.data.orgs.length === 1 && row.rev === 1, JSON.stringify(made));
check('only a hash of the password is stored', !JSON.stringify(row.data).includes('a-long-enough-pass') && /s1\$/.test(row.data.orgs[0].passwordHash));
const login = await clientLogin('fake-co', 'a-long-enough-pass');
check('sign-in works from the stored data', Boolean(login.org));
check('a failed sign-in is remembered (lockout counter saved)', (await clientLogin('fake-co', 'wrong-pass-word')).error === 'invalid' && row.data.meta.locks['org:fake-co'].failed === 1);

conflictOnce = true;
const racy = await staffAction('addRep', { orgId: 'fake-co', name: 'Kim', pin: '4321' });
check('a lost race is retried on fresh data, not lost', racy.ok && row.data.orgs[0].reps.length === 2, JSON.stringify(racy));

const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n');
const up = await staffAction('uploadFile', { orgId: 'fake-co', jobId: '', type: 'Invoice', name: 'Inv.pdf', data: PDF.toString('base64'), note: 'x' });
check('file upload stores bytes in the bucket', up.ok && bucket.size === 1 && bucket.get(up.file.id).equals(PDF), JSON.stringify(up));
const got = await store.getFile(up.file.id);
check('file comes back unchanged', got && got.equals(PDF));
check('a missing file is null, not an error', (await store.getFile('00000000-0000-4000-8000-000000000000')) === null);
check('bad file ids never reach Supabase', (await store.getFile('../../etc')) === null);
const gone = await staffAction('deleteOrg', { orgId: 'fake-co' });
check('deleting a company removes its files', gone.ok && bucket.size === 0 && row.data.orgs.length === 0);

console.log(`\n${passed} checks passed, ${failures.length} failed`);
fake.close();
process.exit(failures.length ? 1 : 0);
