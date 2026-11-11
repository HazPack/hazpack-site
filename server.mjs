// Local preview: serves the static site and runs the /api functions, like Vercel does.
//   npm run dev   ->   http://localhost:4321   (staff key "dev"; sample logins are printed on start)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = process.env.PORT || 4321;
const ROOT = fileURLToPath(new URL('./', import.meta.url));
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.xml': 'application/xml', '.txt': 'text/plain' };
// Only these top-level names are public, like a deploy: everything else (api source, data, scripts) is not.
const PUBLIC_DIRS = new Set(['portal', 'resources', 'assets']);

// Apply the portal's response headers from vercel.json (CSP, noindex, no-store) so problems show up here first.
const vercel = JSON.parse(await readFile(join(ROOT, 'vercel.json'), 'utf8'));
const portalHeaders = Object.fromEntries((vercel.headers.find((h) => h.source === '/portal(.*)')?.headers || []).map((h) => [h.key.toLowerCase(), h.value]));

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      const name = url.pathname.slice(5).replace(/[^a-z-]/g, '');
      const mod = await import(`./api/${name}.js`);
      const handler = mod[req.method];
      if (!handler) { res.writeHead(405).end(); return; }
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, { method: req.method, headers: req.headers, body: chunks.length ? Buffer.concat(chunks) : undefined });
      const out = await handler(request);
      const headers = {};
      for (const [k, v] of out.headers) if (k !== 'set-cookie') headers[k] = v;
      const cookies = out.headers.getSetCookie();
      if (cookies.length) headers['set-cookie'] = cookies;
      res.writeHead(out.status, headers);
      res.end(Buffer.from(await out.arrayBuffer()));
      return;
    }
    let rel = normalize(decodeURIComponent(url.pathname)).replace(/^[/\\]+/, '');
    const top = rel.split(/[/\\]/)[0];
    if (rel && !PUBLIC_DIRS.has(top) && extname(rel) === '.js') throw new Error('not public');
    let p = join(ROOT, rel);
    if (!p.startsWith(ROOT)) throw new Error('bad path');
    if (!extname(p)) {
      const dirIndex = join(p, 'index.html');
      p = (await stat(dirIndex).then(() => true, () => false)) ? dirIndex : `${p}.html`;
    }
    if (!TYPES[extname(p)] || /(^|[/\\])(\.|node_modules|data|scripts|api|lib)([/\\]|$)/.test(p.slice(ROOT.length))) throw new Error('not public');
    await stat(p);
    const headers = { 'content-type': TYPES[extname(p)] };
    if (url.pathname.startsWith('/portal')) Object.assign(headers, portalHeaders);
    res.writeHead(200, headers);
    res.end(await readFile(p));
  } catch (err) {
    if (url.pathname.startsWith('/api/')) console.error(err);
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}).listen(PORT, async () => {
  console.log(`HazPack site on http://localhost:${PORT}`);
  console.log('Client portal: http://localhost:' + PORT + '/portal   Staff sign-in: the link on that page (key "dev")');
  const { DEMO_LOGINS } = await import('./api/_lib/seed.js');
  for (const l of DEMO_LOGINS) console.log(`  sample login: ${l.slug} / ${l.password}   profiles/PINs: ${Object.entries(l.profiles).map(([n, p]) => `${n} ${p}`).join(', ')}`);
});
