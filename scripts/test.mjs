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
try {
  const anon = new Client(base);
  console.log('Signed-out visitors');
  for (const p of ['/api/portal-data', '/api/portal-staff', '/api/portal-file?id=x']) {
    check(`${p} needs sign-in`, (await anon.json(p)).status === 401);
  }
  check('portal page loads', (await anon.req('/portal')).status === 200);
  const page = await anon.req('/portal');
  check('portal page is noindex', (page.headers.get('x-robots-tag') || '').includes('noindex'));
  for (const p of ['/api/_lib/store.js', '/data/portal.json', '/server.mjs', '/package.json', '/scripts/test.mjs']) {
    check(`${p} is not public`, (await anon.req(p)).status === 404);
  }

  console.log('Company sign-in');
  const A = new Client(base);
  const bad1 = await A.json('/api/portal-login', { method: 'POST', body: { slug: 'demo-logistics', password: 'wrong-password' } });
  const bad2 = await A.json('/api/portal-login', { method: 'POST', body: { slug: 'nobody-here', password: 'whatever-it-is' } });
  check('wrong password refused', bad1.status === 401);
  check('unknown company gives the same answer', bad2.status === 401 && bad1.data.error === bad2.data.error);
  const noJson = await A.req('/api/portal-login', { method: 'POST', raw: true, body: 'slug=demo-logistics&password=demo-password-1', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  check('form posts are refused', noJson.status === 400);
  const cross = await A.req('/api/portal-login', { method: 'POST', body: { slug: 'demo-logistics', password: 'demo-password-1' }, headers: { origin: 'https://evil.example' } });
  check('cross-site posts are refused', cross.status === 400);
  const login = await A.json('/api/portal-login', { method: 'POST', body: { slug: ' Demo-Logistics ', password: 'demo-password-1' } });
  check('right password signs in (ID is case/space tolerant)', login.status === 200 && login.data.profiles.length === 2);
  check('cookie is HttpOnly + SameSite', /HttpOnly/.test(login.res.lastCookie) && /SameSite=Lax/.test(login.res.lastCookie));
  check('no shipments before a profile is chosen', (await A.json('/api/portal-data')).status === 401);

  console.log('Profiles and PINs');
  const gabe = login.data.profiles.find((p) => p.name === 'Gabe');
  const badPin = await A.json('/api/portal-session', { method: 'POST', body: { profileId: gabe.id, pin: '0000' } });
  check('wrong PIN refused', badPin.status === 401);
  const goodPin = await A.json('/api/portal-session', { method: 'POST', body: { profileId: gabe.id, pin: '1234' } });
  check('right PIN accepted', goodPin.status === 200);
  const data = await A.json('/api/portal-data');
  check('dashboard data loads', data.status === 200 && data.data.profile.name === 'Gabe');
  const refs = data.data.shipments.map((s) => s.reference).sort();
  check('sees only its own 4 shipments', refs.join() === 'DL-0990,DL-1001,DL-1002,DL-1003', refs.join());
  check('all four statuses are in use', new Set(data.data.shipments.map((s) => s.status)).size === 4);
  check('file lists carry no storage details', !JSON.stringify(data.data).includes('orgId') && !JSON.stringify(data.data).includes('Hash'));
  const myFile = data.data.shipments[0].files[0] || data.data.shipments.flatMap((s) => s.files)[0];
  const dl = await A.req(`/api/portal-file?id=${myFile.id}`);
  check('own file downloads', dl.status === 200 && dl.headers.get('x-content-type-options') === 'nosniff' && /private/.test(dl.headers.get('cache-control')));
  const sw = await A.json('/api/portal-session', { method: 'PATCH', body: {} });
  check('switch profile', sw.status === 200 && (await A.json('/api/portal-data')).status === 401);
  const me = await A.json('/api/portal-session');
  check('session says pick a profile', me.data.client.profile === null && me.data.client.profiles.length === 2);

  console.log('Companies cannot see each other');
  const S = new Client(base);
  check('wrong staff key refused', (await S.json('/api/portal-staff-login', { method: 'POST', body: { key: 'nope' } })).status === 401);
  check('right staff key accepted', (await S.json('/api/portal-staff-login', { method: 'POST', body: { key: 'dev' } })).status === 200);
  check('a company login is not staff', (await A.json('/api/portal-staff')).status === 401);
  const ov = await S.json('/api/portal-staff');
  const orgB = ov.data.orgs.find((o) => o.slug === 'sample-freight');
  const orgA = ov.data.orgs.find((o) => o.slug === 'demo-logistics');
  const bDetail = await S.json(`/api/portal-staff?orgId=${orgB.id}`);
  const bFile = bDetail.data.shipments.flatMap((s) => s.files)[0];
  await A.json('/api/portal-session', { method: 'POST', body: { profileId: gabe.id, pin: '1234' } });
  check("company A cannot open company B's file", (await A.req(`/api/portal-file?id=${bFile.id}`)).status === 404);
  check('staff can open any file', (await S.req(`/api/portal-file?id=${bFile.id}`)).status === 200);
  const forged = new Client(base);
  forged.cookies.set('hp_portal', Buffer.from(JSON.stringify({ role: 'staff', exp: Date.now() + 1e9 })).toString('base64url') + '.AAAA');
  check('forged cookie is rejected', (await forged.json('/api/portal-staff')).status === 401);
  const tampered = new Client(base);
  const good = A.cookies.get('hp_portal');
  tampered.cookies.set('hp_portal', Buffer.from(JSON.stringify({ role: 'client', orgId: orgB.id, profileId: orgB.profiles[0].id, exp: Date.now() + 1e9 })).toString('base64url') + '.' + good.split('.')[1]);
  check('tampered cookie is rejected', (await tampered.json('/api/portal-data')).status === 401);

  console.log('Lockouts');
  const L = new Client(base);
  for (let i = 0; i < 5; i++) await L.json('/api/portal-login', { method: 'POST', body: { slug: 'no-such-co', password: 'guess-' + i } });
  check('5 wrong tries lock out (even unknown IDs, so IDs are not revealed)', (await L.json('/api/portal-login', { method: 'POST', body: { slug: 'no-such-co', password: 'guess-6' } })).status === 429);
  const J = new Client(base);
  const jl = await J.json('/api/portal-login', { method: 'POST', body: { slug: 'sample-freight', password: 'sample-password-2' } });
  const jordan = jl.data.profiles[0];
  for (let i = 0; i < 5; i++) await J.json('/api/portal-session', { method: 'POST', body: { profileId: jordan.id, pin: '000' + i } });
  const locked = await J.json('/api/portal-session', { method: 'POST', body: { profileId: jordan.id, pin: '2468' } });
  check('5 wrong PINs lock that profile, even for the right PIN', locked.status === 429);
  check('other profiles are not locked', (await A.json('/api/portal-session', { method: 'POST', body: { profileId: gabe.id, pin: '1234' } })).status === 200);

  console.log('Staff tools');
  const post = (body) => S.json('/api/portal-staff', { method: 'POST', body });
  check('short password refused', (await post({ action: 'createOrg', name: 'Test Co', password: 'short' })).status === 400);
  const created = await post({ action: 'createOrg', name: 'Test Co', password: 'a-long-enough-pass' });
  check('company created', created.status === 200 && created.data.slug === 'test-co');
  const orgId = created.data.orgId;
  check('duplicate ID refused', (await post({ action: 'createOrg', name: 'Test Co', password: 'a-long-enough-pass' })).status === 400);
  check('bad PIN refused', (await post({ action: 'addProfile', orgId, name: 'Sam', pin: '12' })).status === 400);
  check('profile added', (await post({ action: 'addProfile', orgId, name: 'Sam', pin: '4321' })).status === 200);
  check('duplicate profile name refused', (await post({ action: 'addProfile', orgId, name: 'sam', pin: '4321' })).status === 400);
  check('shipment with bad status refused', (await post({ action: 'createShipment', orgId, reference: 'T-1', status: 'Teleported' })).status === 400);
  check('shipment created', (await post({ action: 'createShipment', orgId, reference: 'T-1', description: 'Test shipment', status: 'In progress' })).status === 200);
  let shipId = (await S.json(`/api/portal-staff?orgId=${orgId}`)).data.shipments[0].id;
  const up = (kind, bytes, name = 'doc') => post({ action: 'uploadFile', shipmentId: shipId, kind, name, data: b64(bytes) });
  check('PDF accepted as DGD', (await up('DGD', PDF, 'T-1 DGD.pdf')).status === 200);
  check('PNG accepted as photo', (await up('Photo', PNG, 'box.png')).status === 200);
  check('JPEG accepted as photo', (await up('Photo', JPG, 'box.jpg')).status === 200);
  check('PNG refused as DGD', (await up('DGD', PNG)).status === 400);
  check('PDF refused as photo', (await up('Photo', PDF)).status === 400);
  check('text renamed to .pdf refused', (await up('Invoice', Buffer.from('<script>alert(1)</script>'), 'evil.pdf')).status === 400);
  check('oversized file refused', (await up('Invoice', Buffer.concat([PDF, Buffer.alloc(3.2 * 1024 * 1024)]))).status === 400);
  check('unknown kind refused', (await up('Selfie', PDF)).status === 400);
  check('bad status refused', (await post({ action: 'setStatus', shipmentId: shipId, status: 'Nope' })).status === 400);
  check('status changed', (await post({ action: 'setStatus', shipmentId: shipId, status: 'Cleared to ship' })).status === 200);

  const T = new Client(base);
  check('new company signs in', (await T.json('/api/portal-login', { method: 'POST', body: { slug: 'test-co', password: 'a-long-enough-pass' } })).status === 200);
  const sam = (await T.json('/api/portal-session')).data.client.profiles[0];
  check('new profile signs in', (await T.json('/api/portal-session', { method: 'POST', body: { profileId: sam.id, pin: '4321' } })).status === 200);
  const td = await T.json('/api/portal-data');
  check('new company sees its shipment, status and 3 files', td.data.shipments.length === 1 && td.data.shipments[0].status === 'Cleared to ship' && td.data.shipments[0].files.length === 3);
  const tf = td.data.shipments[0].files.find((f) => f.kind === 'DGD');
  const tdl = await T.req(`/api/portal-file?id=${tf.id}`);
  check('uploaded file comes back unchanged', tdl.status === 200 && Buffer.from(await tdl.arrayBuffer()).equals(PDF) && tdl.headers.get('content-type') === 'application/pdf');
  check('file name is cleaned', tf.name === 'T-1 DGD.pdf', tf.name);
  check('resetting a PIN works', (await post({ action: 'resetPin', orgId, profileId: sam.id, pin: '9999' })).status === 200);
  check('removing a profile signs that session out', (await post({ action: 'removeProfile', orgId, profileId: sam.id })).status === 200 && (await T.json('/api/portal-data')).status === 401);
  check('file can be deleted', (await post({ action: 'deleteFile', fileId: tf.id })).status === 200 && (await S.req(`/api/portal-file?id=${tf.id}`)).status === 404);
  check('shipment can be deleted', (await post({ action: 'deleteShipment', shipmentId: shipId })).status === 200);
  check('company can be deleted', (await post({ action: 'deleteOrg', orgId })).status === 200);
  check('deleted company cannot sign in', (await new Client(base).json('/api/portal-login', { method: 'POST', body: { slug: 'test-co', password: 'a-long-enough-pass' } })).status === 401);
  check('staff sign out works', (await S.json('/api/portal-session', { method: 'DELETE', body: {} })).status === 200 && (await S.json('/api/portal-staff')).status === 401);

  console.log('5-month clean-up');
  const cron = new Client(base);
  check('purge refuses without the secret', (await cron.json('/api/portal-purge')).status === 401);
  const p0 = await cron.json('/api/portal-purge', { headers: { authorization: 'Bearer testcron' } });
  check('nothing is purged today', p0.status === 200 && p0.data.files === 0 && p0.data.shipments === 0, JSON.stringify(p0.data));
  const { purgeExpired } = await import('../api/_lib/portal.js');
  const later = Date.now() + 5.2 * 30 * 86400000;
  const r = await purgeExpired(later);
  check('records older than 5 months are removed', r.shipments >= 5 && r.files >= 7, JSON.stringify(r));
  const S2 = new Client(base);
  await S2.json('/api/portal-staff-login', { method: 'POST', body: { key: 'dev' } });
  const empty = await S2.json(`/api/portal-staff?orgId=${orgA.id}`);
  check('shipments are gone afterwards', empty.data.shipments.length === 0);
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
  check('production without storage: sign-in is unavailable, not open', (await c.json('/api/portal-login', { method: 'POST', body: { slug: 'demo-logistics', password: 'demo-password-1' } })).status === 503);
  check('production without a staff key: staff sign-in is unavailable', (await c.json('/api/portal-staff-login', { method: 'POST', body: { key: 'dev' } })).status === 503);
  check('production purge needs CRON_SECRET', (await c.json('/api/portal-purge')).status === 503);
} finally { prod.kill(); }
const demo = await startServer(4403, { VERCEL: '1', PORTAL_DEMO: '1', PORTAL_SESSION_SECRET: 'y'.repeat(40), PORTAL_STAFF_KEY: 'preview-key', PORTAL_DATA_DIR: await mkdtemp(join(tmpdir(), 'hp-portal-demo-')) });
try {
  const c = new Client('http://localhost:4403');
  const l = await c.json('/api/portal-login', { method: 'POST', body: { slug: 'demo-logistics', password: 'demo-password-1' } });
  check('demo preview works with sample data', l.status === 200);
  check('cookie is Secure on Vercel', /; Secure/.test(l.res.lastCookie));
  check('"dev" is not a staff key on Vercel', (await c.json('/api/portal-staff-login', { method: 'POST', body: { key: 'dev' } })).status === 401);
  check('configured staff key works', (await c.json('/api/portal-staff-login', { method: 'POST', body: { key: 'preview-key' } })).status === 200);
} finally { demo.kill(); }

await rm(dataDir, { recursive: true, force: true });
await rm(prodDir, { recursive: true, force: true });
console.log(`\n${passed} checks passed, ${failures.length} failed`);
process.exit(failures.length ? 1 : 0);
