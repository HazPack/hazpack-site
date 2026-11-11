// Checks the client portal back end against throwaway sample data:  npm test
// Starts the local server on its own port and data folder, so it never touches data/.
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const dataDir = await mkdtemp(join(tmpdir(), 'hp-portal-test-'));
process.env.PORTAL_DATA_DIR = dataDir;

let passed = 0;
const failures = [];
const check = (name, cond, extra = '') => { if (cond) passed++; else { failures.push(`${name} ${extra}`); console.log(`  FAIL  ${name} ${extra}`); } };

function startServer(port, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['server.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(port), ...env } });
    let out = '';
    child.stdout.on('data', (d) => { out += d; if (out.includes('HazPack site on')) resolve(child); });
    child.stderr.on('data', (d) => { out += d; });
    child.on('exit', (c) => reject(new Error(`server exited ${c}: ${out}`)));
    setTimeout(() => reject(new Error('server did not start: ' + out)), 8000);
  });
}

class Client {
  constructor(base) { this.base = base; this.cookies = new Map(); }
  async req(path, { method = 'GET', body, headers = {}, raw = false } = {}) {
    const h = { ...headers };
    if (this.cookies.size) h.cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined && !raw) h['content-type'] = 'application/json';
    const res = await fetch(this.base + path, { method, headers: h, body: body === undefined ? undefined : raw ? body : JSON.stringify(body), redirect: 'manual' });
    for (const c of res.headers.getSetCookie()) {
      const [pair, ...attrs] = c.split(';');
      const [k, v] = [pair.slice(0, pair.indexOf('=')), pair.slice(pair.indexOf('=') + 1)];
      if (attrs.some((a) => a.trim().toLowerCase() === 'max-age=0') || !v) this.cookies.delete(k); else this.cookies.set(k, v);
      res.lastCookie = c;
    }
    return res;
  }
  async json(path, opts) { const res = await this.req(path, opts); let data = null; try { data = await res.clone().json(); } catch { /* not json */ } return { res, status: res.status, data }; }
}

const b64 = (buf) => Buffer.from(buf).toString('base64');
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);

const server = await startServer(4401, { CRON_SECRET: 'testcron', PORTAL_DATA_DIR: dataDir });
const base = 'http://localhost:4401';
const act = (c, body) => c.json('/api/portal-act', { method: 'POST', body });
async function signIn(slug, password, name, pin) {
  const c = new Client(base);
  const l = await c.json('/api/portal-login', { method: 'POST', body: { slug, password } });
  const p = l.data?.profiles?.find((x) => x.name === name);
  const s = p && await c.json('/api/portal-session', { method: 'POST', body: { profileId: p.id, pin } });
  return { c, login: l, session: s, profiles: l.data?.profiles || [] };
}
try {
  const anon = new Client(base);
  console.log('Signed-out visitors');
  for (const p of ['/api/portal-state', '/api/portal-staff', '/api/portal-file?id=x']) {
    check(`${p} needs sign-in`, (await anon.json(p)).status === 401);
  }
  check('portal-act needs sign-in', (await act(anon, { action: 'readNotifs', all: true })).status === 401);
  check('portal page loads', (await anon.req('/portal')).status === 200);
  const page = await anon.req('/portal');
  check('portal page is noindex', (page.headers.get('x-robots-tag') || '').includes('noindex'));
  for (const p of ['/api/_lib/store.js', '/api/_lib/sample-data.json', '/data/portal.json', '/server.mjs', '/package.json', '/scripts/test.mjs']) {
    check(`${p} is not public`, (await anon.req(p)).status === 404);
  }

  console.log('Company sign-in');
  const A = new Client(base);
  const bad1 = await A.json('/api/portal-login', { method: 'POST', body: { slug: 'pacific', password: 'wrong-password' } });
  const bad2 = await A.json('/api/portal-login', { method: 'POST', body: { slug: 'nobody-here', password: 'whatever-it-is' } });
  check('wrong password refused', bad1.status === 401);
  check('unknown company gives the same answer', bad2.status === 401 && bad1.data.error === bad2.data.error);
  const noJson = await A.req('/api/portal-login', { method: 'POST', raw: true, body: 'slug=pacific&password=demo', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  check('form posts are refused', noJson.status === 400);
  const cross = await A.req('/api/portal-login', { method: 'POST', body: { slug: 'pacific', password: 'demo' }, headers: { origin: 'https://evil.example' } });
  check('cross-site posts are refused', cross.status === 400);
  const login = await A.json('/api/portal-login', { method: 'POST', body: { slug: ' Pacific ', password: 'demo' } });
  check('right password signs in (ID is case/space tolerant)', login.status === 200 && login.data.profiles.length === 3);
  check('cookie is HttpOnly + SameSite', /HttpOnly/.test(login.res.lastCookie) && /SameSite=Lax/.test(login.res.lastCookie));
  check('no data before a person is chosen', (await A.json('/api/portal-state')).status === 401);

  console.log('People and PINs');
  const dana = login.data.profiles.find((p) => p.name === 'Dana Whitfield');
  check('wrong PIN refused', (await A.json('/api/portal-session', { method: 'POST', body: { profileId: dana.id, pin: '0000' } })).status === 401);
  check('right PIN accepted', (await A.json('/api/portal-session', { method: 'POST', body: { profileId: dana.id, pin: '1111' } })).status === 200);
  const st = await A.json('/api/portal-state');
  check('state loads', st.status === 200 && st.data.me === dana.id);
  check('admin sees all 7 jobs', st.data.org.jobs.length === 7);
  check('no hashes or passwords are sent', !/Hash|password/i.test(JSON.stringify(st.data)));
  check('admin gets accounts email, never rates', st.data.org.accountsEmail && st.data.org.rates === undefined);
  const myFile = st.data.org.files[0];
  const dl = await A.req(`/api/portal-file?id=${myFile.id}`);
  check('own file downloads', dl.status === 200 && dl.headers.get('x-content-type-options') === 'nosniff' && /private/.test(dl.headers.get('cache-control')));

  const P = await signIn('pacific', 'demo', 'Priya Nair', '3333');
  const ps = await P.c.json('/api/portal-state');
  const pJobs = ps.data.org.jobs.map((j) => j.id).sort();
  check('member sees only their own jobs', pJobs.join() === 'HP-2610-008,HP-2610-031', pJobs.join());
  check('member sees only files of those jobs', ps.data.org.files.every((f) => pJobs.includes(f.job)));
  check('member does not get the accounts email', ps.data.org.accountsEmail === undefined);
  const hidden = st.data.org.files.find((f) => !pJobs.includes(f.job));
  check("member cannot open a file on someone else's job", (await P.c.req(`/api/portal-file?id=${hidden.id}`)).status === 404);
  const sw = await A.json('/api/portal-session', { method: 'PATCH', body: {} });
  check('switch person', sw.status === 200 && (await A.json('/api/portal-state')).status === 401);

  console.log('Companies cannot see each other');
  const S = new Client(base);
  check('wrong staff key refused', (await S.json('/api/portal-staff-login', { method: 'POST', body: { key: 'nope' } })).status === 401);
  check('right staff key accepted', (await S.json('/api/portal-staff-login', { method: 'POST', body: { key: 'dev' } })).status === 200);
  check('a company login is not staff', (await A.json('/api/portal-staff')).status === 401);
  const ov = await S.json('/api/portal-state');
  check('staff see every company', ov.data.staff && ov.data.orgs.length === 2);
  const sierra = ov.data.orgs.find((o) => o.id === 'sierra');
  const sFile = sierra.files[0];
  const D = await signIn('pacific', 'demo', 'Dana Whitfield', '1111');
  check("company A cannot open company B's file", (await D.c.req(`/api/portal-file?id=${sFile.id}`)).status === 404);
  check('staff can open any file', (await S.req(`/api/portal-file?id=${sFile.id}`)).status === 200);
  const forged = new Client(base);
  forged.cookies.set('hp_portal', Buffer.from(JSON.stringify({ role: 'staff', exp: Date.now() + 1e9 })).toString('base64url') + '.AAAA');
  check('forged cookie is rejected', (await forged.json('/api/portal-staff')).status === 401);
  const tampered = new Client(base);
  tampered.cookies.set('hp_portal', Buffer.from(JSON.stringify({ role: 'client', orgId: 'sierra', profileId: sierra.reps[0].id, exp: Date.now() + 1e9 })).toString('base64url') + '.' + D.c.cookies.get('hp_portal').split('.')[1]);
  check('tampered cookie is rejected', (await tampered.json('/api/portal-state')).status === 401);

  console.log('Lockouts');
  const L = new Client(base);
  for (let i = 0; i < 5; i++) await L.json('/api/portal-login', { method: 'POST', body: { slug: 'no-such-co', password: 'guess-' + i } });
  check('5 wrong tries lock out (even unknown IDs, so IDs are not revealed)', (await L.json('/api/portal-login', { method: 'POST', body: { slug: 'no-such-co', password: 'guess-x' } })).status === 429);
  const J = new Client(base);
  const jl = await J.json('/api/portal-login', { method: 'POST', body: { slug: 'sierra', password: 'demo' } });
  const alicia = jl.data.profiles[0];
  for (let i = 0; i < 5; i++) await J.json('/api/portal-session', { method: 'POST', body: { profileId: alicia.id, pin: '000' + i } });
  check('5 wrong PINs lock that person, even for the right PIN', (await J.json('/api/portal-session', { method: 'POST', body: { profileId: alicia.id, pin: '4444' } })).status === 429);
  check('other people are not locked', (await D.c.json('/api/portal-state')).status === 200);

  console.log('Client actions');
  const rq = await act(D.c, { action: 'requestJob', svc: ['dgd', 'insp'], item: 'Test aerosols', un: 'un1950', cls: '2.1', mode: 'Ground', from: 'LAX', to: 'PHX', ref: 'PO-1', req: '2026-12-01' });
  check('request a job', rq.status === 200 && /^HP-\d{4}-\d{3}$/.test(rq.data.jobId));
  const newJob = rq.data.state.org.jobs.find((j) => j.id === rq.data.jobId);
  check('new job is pending, owned by the requester, UN uppercased', newJob.pending && newJob.rep === dana.id && newJob.un === 'UN1950' && newJob.steps.length === 6);
  check('request without a service refused', (await act(D.c, { action: 'requestJob', svc: ['bogus'] })).status === 400);
  const up = (type, bytes, name = 'doc', extra = {}) => act(D.c, { action: 'uploadFile', jobId: rq.data.jobId, type, name, data: b64(bytes), ...extra });
  const u1 = await up('DGD', PDF, 'My DGD.pdf', { quiet: true });
  check('PDF accepted as DGD', u1.status === 200 && u1.data.fileId);
  check('PNG accepted as photo', (await up('Photo', PNG, 'box.png')).status === 200);
  check('JPEG accepted as photo', (await up('Photo', JPG, 'box.jpg')).status === 200);
  check('PNG refused as DGD', (await up('DGD', PNG)).status === 400);
  check('PDF refused as photo', (await up('Photo', PDF)).status === 400);
  check('text renamed to .pdf refused', (await up('Other', Buffer.from('<script>alert(1)</script>'), 'evil.pdf')).status === 400);
  check('oversized file refused', (await up('Other', Buffer.concat([PDF, Buffer.alloc(3.2 * 1024 * 1024)]))).status === 400);
  check('clients cannot upload invoices', (await up('Invoice', PDF)).status === 400);
  check('cannot upload to a job that is not theirs', (await act(D.c, { action: 'uploadFile', jobId: 'HP-9999-999', type: 'Other', name: 'x', data: b64(PDF) })).status === 400);
  check('send a message', (await act(D.c, { action: 'sendMessage', jobId: rq.data.jobId, text: 'Hello HazPack' })).status === 200);
  check('empty message refused', (await act(D.c, { action: 'sendMessage', jobId: rq.data.jobId, text: '  ' })).status === 400);
  const P2 = await signIn('pacific', 'demo', 'Priya Nair', '3333');
  check("member cannot message someone else's job", (await act(P2.c, { action: 'sendMessage', jobId: rq.data.jobId, text: 'hi' })).status === 400);
  check("member cannot withdraw someone else's request", (await act(P2.c, { action: 'withdrawJob', jobId: rq.data.jobId })).status === 400);
  check('member cannot add people', (await act(P2.c, { action: 'addRep', name: 'Eve', pin: '1212' })).status === 400);
  check('member cannot make themselves admin', (await act(P2.c, { action: 'setAdmin', repId: ps.data.me, admin: true })).status === 400);
  check('withdraw own pending request', (await act(D.c, { action: 'withdrawJob', jobId: rq.data.jobId })).status === 200);
  const afterW = await D.c.json('/api/portal-state');
  check('withdrawn job and its files are gone', !afterW.data.org.jobs.some((j) => j.id === rq.data.jobId) && !afterW.data.org.files.some((f) => f.job === rq.data.jobId));
  check('cannot withdraw a job HazPack already opened', (await act(D.c, { action: 'withdrawJob', jobId: 'HP-2611-014' })).status === 400);

  const quoteFile = afterW.data.org.files.find((f) => f.docId && /awaiting/.test(f.note));
  check('a quote is waiting', Boolean(quoteFile));
  check('declining a quote needs no name', true);
  check('accepting needs the exact name', (await act(D.c, { action: 'decideQuote', fileId: quoteFile.id, accept: true, typed: 'Someone Else' })).status === 400);
  const acc = await act(D.c, { action: 'decideQuote', fileId: quoteFile.id, accept: true, typed: 'dana whitfield' });
  check('accept a quote', acc.status === 200 && acc.data.state.docs.find((d) => d.id === quoteFile.docId).status === 'Accepted');
  check('answering twice refused', (await act(D.c, { action: 'decideQuote', fileId: quoteFile.id, accept: false })).status === 400);
  check('the note on the file changes', acc.data.state.org.files.find((f) => f.id === quoteFile.id).note.endsWith('accepted'));
  const read = await act(D.c, { action: 'readNotifs', all: true });
  check('mark notifications read', read.status === 200 && read.data.state.org.notifs.every((n) => n.read[dana.id]));

  const add = await act(D.c, { action: 'addRep', name: 'Sam Rivera', pin: '5151', title: 'Driver', email: 'sam@example.com' });
  check('admin adds a person', add.status === 200 && add.data.state.org.reps.length === 4);
  check('bad PIN refused', (await act(D.c, { action: 'addRep', name: 'Tom', pin: '12' })).status === 400);
  check('duplicate name refused', (await act(D.c, { action: 'addRep', name: 'sam rivera', pin: '5151' })).status === 400);
  const sam = add.data.state.org.reps.find((r) => r.name === 'Sam Rivera');
  check('new person can sign in with their PIN', (await signIn('pacific', 'demo', 'Sam Rivera', '5151')).session.status === 200);
  check('admin resets a PIN', (await act(D.c, { action: 'resetPin', repId: sam.id, pin: '6262' })).status === 200 && (await signIn('pacific', 'demo', 'Sam Rivera', '5151')).session.status === 401);
  check('admin can demote another admin', (await act(D.c, { action: 'setAdmin', repId: 'r2', admin: false })).status === 200);
  check('the last admin cannot be demoted', (await act(D.c, { action: 'setAdmin', repId: dana.id, admin: false })).status === 400);
  check('remove a person', (await act(D.c, { action: 'removeRep', repId: sam.id })).status === 200);
  check('cannot remove yourself', (await act(D.c, { action: 'removeRep', repId: dana.id })).status === 400);
  check('unknown action refused', (await act(D.c, { action: 'deleteEverything' })).status === 400);

  console.log('Staff tools');
  const post = (body) => S.json('/api/portal-staff', { method: 'POST', body });
  check('short password refused', (await post({ action: 'createOrg', name: 'Test Co', password: 'short' })).status === 400);
  const created = await post({ action: 'createOrg', name: 'Test Co', password: 'a-long-enough-pass', adminName: 'Sam', pin: '4321' });
  check('company created', created.status === 200 && created.data.slug === 'test-co');
  check('duplicate ID refused', (await post({ action: 'createOrg', name: 'Test Co', password: 'a-long-enough-pass' })).status === 400);
  check('person added by staff', (await post({ action: 'addRep', orgId: 'test-co', name: 'Kim', pin: '2468' })).status === 200);
  check('staff reset a PIN', (await post({ action: 'resetPin', orgId: 'test-co', repId: (await S.json('/api/portal-state')).data.orgs.find((o) => o.id === 'test-co').reps[1].id, pin: '1357' })).status === 200);
  let org = (await S.json('/api/portal-state')).data.orgs.find((o) => o.id === 'test-co');
  org.jobs.push({ id: 'HP-2611-900', rep: org.reps[0].id, item: 'Test', un: 'UN1950', cls: '2.1', pg: 'N/A', qty: '1', mode: 'Ground', from: 'LAX', to: 'PHX', ref: 'T-1', req: '', svc: ['dgd'], steps: ['Job received', 'Declaration signed, cleared to ship', 'Invoice sent'], done: 1, start: new Date().toISOString(), pending: false, fix: false, msgs: [], owner: 'Alex Walsh', pri: '', by: {}, notes: {}, ev: [], log: [], expiresAt: new Date(Date.now() + 1e10).toISOString() });
  const saved = await post({ action: 'saveOrg', orgId: 'test-co', rev: org.rev, org, docs: [] });
  check('staff save works', saved.status === 200 && saved.data.rev === org.rev + 1);
  check('a stale save is refused with a conflict', (await post({ action: 'saveOrg', orgId: 'test-co', rev: org.rev, org, docs: [] })).status === 409);
  org = (await S.json('/api/portal-state')).data.orgs.find((o) => o.id === 'test-co');
  check('saved job is there and PINs survived', org.jobs.length === 1 && !JSON.stringify(org).includes('Hash') && (await signIn('test-co', 'a-long-enough-pass', 'Sam', '4321')).session.status === 200);
  const su = await post({ action: 'uploadFile', orgId: 'test-co', jobId: 'HP-2611-900', type: 'Invoice', name: 'Inv.pdf', data: b64(PDF), note: 'Due, $10.00' });
  check('staff upload a file', su.status === 200 && su.data.file.by === 'HazPack');
  check('staff upload checks the file too', (await post({ action: 'uploadFile', orgId: 'test-co', jobId: 'HP-2611-900', type: 'Invoice', name: 'x.pdf', data: b64(Buffer.from('nope')) })).status === 400);
  const T = await signIn('test-co', 'a-long-enough-pass', 'Sam', '4321');
  const tf = (await T.c.json('/api/portal-state')).data.org.files[0];
  const tdl = await T.c.req(`/api/portal-file?id=${tf.id}`);
  check('uploaded file comes back unchanged', tdl.status === 200 && Buffer.from(await tdl.arrayBuffer()).equals(PDF) && tdl.headers.get('content-type') === 'application/pdf');
  const org2 = (await S.json('/api/portal-state')).data.orgs.find((o) => o.id === 'test-co');
  org2.files = [];
  check('a save without the file removes it', (await post({ action: 'saveOrg', orgId: 'test-co', rev: org2.rev, org: org2, docs: [] })).status === 200 && (await S.req(`/api/portal-file?id=${tf.id}`)).status === 404);
  check('company can be deleted', (await post({ action: 'deleteOrg', orgId: 'test-co' })).status === 200);
  check('deleted company cannot sign in', (await new Client(base).json('/api/portal-login', { method: 'POST', body: { slug: 'test-co', password: 'a-long-enough-pass' } })).status === 401);
  check('staff sign out works', (await S.json('/api/portal-session', { method: 'DELETE', body: {} })).status === 200 && (await S.json('/api/portal-staff')).status === 401);

  console.log('5-month clean-up');
  const cron = new Client(base);
  check('purge refuses without the secret', (await cron.json('/api/portal-purge')).status === 401);
  const p0 = await cron.json('/api/portal-purge', { headers: { authorization: 'Bearer testcron' } });
  check('nothing is purged today', p0.status === 200 && p0.data.files === 0 && p0.data.jobs === 0, JSON.stringify(p0.data));
  const { purgeExpired } = await import('../api/_lib/portal.js');
  const later = Date.now() + 5.2 * 30 * 86400000;
  const r = await purgeExpired(later);
  check('records older than 5 months are removed', r.jobs >= 8 && r.files >= 10, JSON.stringify(r));
  const S2 = new Client(base);
  await S2.json('/api/portal-staff-login', { method: 'POST', body: { key: 'dev' } });
  const empty = await S2.json('/api/portal-state');
  check('jobs are gone afterwards', empty.data.orgs.every((o) => o.jobs.length === 0));
  check('their files are gone too', (await S2.req(`/api/portal-file?id=${myFile.id}`)).status === 404);
} catch (e) {
  failures.push(`crashed: ${e.stack}`);
  console.log(e);
} finally {
  server.kill();
}

console.log('Production safety');
const prodDir = await mkdtemp(join(tmpdir(), 'hp-portal-prod-'));
const prod = await startServer(4402, { VERCEL: '1', PORTAL_SESSION_SECRET: 'x'.repeat(40), PORTAL_DATA_DIR: prodDir, PORTAL_DEMO: '', PORTAL_STAFF_KEY: '' });
try {
  const c = new Client('http://localhost:4402');
  check('production without storage: sign-in is unavailable, not open', (await c.json('/api/portal-login', { method: 'POST', body: { slug: 'pacific', password: 'demo' } })).status === 503);
  check('production without a staff key: staff sign-in is unavailable', (await c.json('/api/portal-staff-login', { method: 'POST', body: { key: 'dev' } })).status === 503);
  check('production purge needs CRON_SECRET', (await c.json('/api/portal-purge')).status === 503);
} finally { prod.kill(); }
const demo = await startServer(4403, { VERCEL: '1', PORTAL_DEMO: '1', PORTAL_SESSION_SECRET: 'y'.repeat(40), PORTAL_STAFF_KEY: 'preview-key', PORTAL_DATA_DIR: await mkdtemp(join(tmpdir(), 'hp-portal-demo-')) });
try {
  const c = new Client('http://localhost:4403');
  const l = await c.json('/api/portal-login', { method: 'POST', body: { slug: 'pacific', password: 'demo' } });
  check('demo preview works with sample data', l.status === 200);
  check('cookie is Secure on Vercel', /; Secure/.test(l.res.lastCookie));
  check('"dev" is not a staff key on Vercel', (await c.json('/api/portal-staff-login', { method: 'POST', body: { key: 'dev' } })).status === 401);
  check('configured staff key works', (await c.json('/api/portal-staff-login', { method: 'POST', body: { key: 'preview-key' } })).status === 200);
} finally { demo.kill(); }

await rm(dataDir, { recursive: true, force: true });
await rm(prodDir, { recursive: true, force: true });
console.log(`\n${passed} checks passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
