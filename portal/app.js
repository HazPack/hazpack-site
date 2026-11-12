(function () {
  /* ---------- assets generated at build time ---------- */
  var LOGO_L = '/portal/logo-light.svg', LOGO_D = '/portal/logo-dark.svg';
  var MASK = window.HP_MAP.mask;
  var AIRPORTS = window.HP_MAP.airports.map(function (a) { return { code: a[0], city: a[1], country: a[2], lat: a[3], lon: a[4] }; });
  var AP = {}; AIRPORTS.forEach(function (a) { AP[a.code] = a; });
  var FROM_EMAIL = 'lax-dgr@hazpackcompliance.com';

  /* ---------- dates, steps ---------- */
  var TODAY = (function () { var n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); })();
  function d(m, day) { return new Date(2026, m - 1, day); }
  function fmt(dt) { return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function fmtS(dt) { return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
  var uid = 0; function nid(p) { return p + Date.now().toString(36) + (++uid); }
  var LB = { rec: 'Job received', rev: 'Documents reviewed', cls: 'Shipment classified', pack: 'Packed and photographed', temp: 'Temperature control set up', dry: 'Dry ice loaded and marked', insp: 'Inspection complete', dgdp: 'Declaration prepared', dgd: 'Declaration signed, cleared to ship', consult: 'Consultation delivered', emerg: 'Emergency support provided', inv: 'Invoice sent' };
  /* services as named on the HazPack website's Services page */
  var SVC = { class: 'DG classification', dgd: 'Documentation & DGD', pack: 'Packaging & labeling', insp: 'DG inspections', emerg: 'DG emergency support', consult: 'DG consulting', temp: 'Temperature control', dry: 'Dry ice services' };
  var SVC_HELP = { class: 'All 9 hazard classes, UN number, packing group, proper shipping name', dgd: 'Declarations and paperwork for air, ocean and ground', pack: 'UN-certified packaging, marking, labeling and placarding', insp: 'Pre-shipment inspections, repackaging and relabeling', emerg: 'Urgent help with a last-minute shipment or compliance problem', consult: 'Ongoing guidance for complex or restricted commodities', temp: 'Insulated packaging, coolants and transit planning', dry: 'Packaging, marking, labeling and paperwork for dry ice shipments' };
  /* Every job starts the same way, then gets a step for each service chosen, and ends with the invoice. */
  function stepsFor(svc) {
    var has = function (k) { return svc.indexOf(k) > -1; };
    var s = [LB.rec, LB.rev];
    if (has('class')) s.push(LB.cls);
    if (has('pack') || has('temp') || has('dry')) s.push(LB.pack);
    if (has('temp')) s.push(LB.temp);
    if (has('dry')) s.push(LB.dry);
    if (has('insp')) s.push(LB.insp);
    if (has('dgd') || has('dry')) { s.push(LB.dgdp); s.push(LB.dgd); }
    if (has('consult')) s.push(LB.consult);
    if (has('emerg')) s.push(LB.emerg);
    s.push(LB.inv); return s;
  }
  /* Jobs opened before these steps existed get them added, keeping everything already done. */
  function upgradeSteps(j) {
    if (!j.svc || j.pending || j.done >= j.steps.length) return;
    var ns = stepsFor(j.svc); if (ns.join('|') === j.steps.join('|')) return;
    var last = -1; j.steps.slice(0, j.done).forEach(function (l) { last = Math.max(last, ns.indexOf(l)); });
    j.steps = ns; j.done = Math.max(1, last + 1);
  }
  function mk(o) {
    o.svc = o.svc || ['pack', 'insp', 'dgd']; o.steps = stepsFor(o.svc); o.ev = o.ev || [];
    var base = []; for (var i = 0; i < o.done; i++) base.push([new Date(o.start.getTime() + i * 864e5), o.steps[i]]);
    o.ev = base.concat(o.ev).sort(function (a, b) { return a[0] - b[0]; }); o.fix = !!o.fix; o.pending = !!o.pending; o.msgs = o.msgs || []; o.req = o.req || ''; o.owner = o.owner || ''; o.pri = o.pri || ''; o.by = {}; o.notes = {};
    o.log = o.ev.map(function (e) { return { date: e[0], who: /submitted/i.test(e[1]) ? 'Client' : 'HazPack', text: e[1] }; }); return o;
  }
  function F(id, job, type, name, size, date, by, note) { return { id: id, job: job, type: type, name: name, size: size, date: date, by: by, note: note || '' }; }
  var FIXNOTE = 'Our inspection found that the net quantity on the declaration does not match the package marking. Confirm the correct quantity and we will reissue the declaration.';

  var ORGS = {};

  /* ---------- state ---------- */
  var S = { stage: 'org', org: null, home: null, homeRep: null, pendingRep: null, pin: '', pinErr: '', orgErr: '', rep: null, role: 'client', view: 'dashboard', job: null, jobTab: 'overview', q: '', f: 'all', fp: 'all', ff: 'all', openF: {}, notif: false, attempts: {}, mobileDetail: false };
  var app = document.getElementById('app'), layer = document.getElementById('layer'), idleT = null;

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function initials(n) { return n.split(' ').map(function (p) { return p[0]; }).slice(0, 2).join('').toUpperCase(); }
  /* Clients see their own reference number (their PO or order number) wherever a job is named. HazPack keeps the HP number. */
  function jn(j) { return j ? (j.ref || j.id) : ''; }
  function jnId(id) { if (!id) return id; var j = S.org ? S.org.jobs.filter(function (x) { return x.id === id; })[0] : null; if (!j) Object.keys(ORGS).some(function (k) { j = ORGS[k].jobs.filter(function (x) { return x.id === id; })[0]; return !!j; }); return j ? jn(j) : id; }
  function clientText(t) { return String(t).replace(/HP-\d{4}-\d{3}/g, function (m) { return jnId(m); }); }
  function pt(code) { return code ? AP[code] : null; }
  function getJob(id) { return S.org.jobs.filter(function (j) { return j.id === id; })[0]; }
  function repOf(id) { return S.org.reps.filter(function (r) { return r.id === id; })[0]; }
  function repName(id) { var r = repOf(id); return r ? r.name : 'Former member'; }
  function staff() { return S.role === 'staff'; }
  function canSee(rep, j) { return rep.admin || j.rep === rep.id; }
  function vis() { return S.org.jobs.filter(function (j) { return staff() || canSee(S.rep, j); }); }
  function visFiles() { var ids = vis().map(function (j) { return j.id; }); return S.org.files.filter(function (f) { return ids.indexOf(f.job) > -1; }); }
  function unread() { var ids = vis().map(function (j) { return j.id; }); return S.org.notifs.filter(function (n) { return n.to === 'client' && nvis(n, ids) && !n.read[S.rep.id]; }); }
  function doneStep(j, label) { var i = j.steps.indexOf(label); return i > -1 && j.done > i; }
  function jobStatus(j) {
    if (j.pending) return ['Request received', 'info']; if (j.fix) return ['Needs correction', 'bad']; if (j.done >= j.steps.length) return ['Completed', 'info'];
    if (doneStep(j, LB.dgd)) return ['Cleared to ship', 'ok']; return ['In progress', 'warn'];
  }
  function isOpen(j) { return j.done < j.steps.length; }
  function pill(j) { var s = jobStatus(j); return '<span class="pill ' + s[1] + '">' + s[0] + '</span>'; }
  function latest(j, type) { return S.org.files.filter(function (f) { return f.job === j.id && f.type === type; }).sort(function (a, b) { return b.date - a.date; })[0]; }
  var TYPE_LABEL = { DGD: 'Declaration (DGD)', Report: 'Inspection report', Invoice: 'Invoice', Photo: 'Packing photo', Other: 'Other document' };
  function ftype(t) { return { DGD: ['DGD', ''], Report: ['RPT', ''], Invoice: ['INV', 'inv'], Photo: ['IMG', 'oth'], Other: ['DOC', 'oth'] }[t] || ['DOC', 'oth']; }
  function routeOf(j) { return j.from && j.to && AP[j.from] && AP[j.to]; }

  /* ---------- sample PDFs, built in the page ---------- */
  function makePdf(lines) {
    var e = function (s) { return String(s).replace(/[^\x20-\x7e]/g, '-').replace(/[\\()]/g, '\\$&'); };
    var content = 'BT /F1 12 Tf 54 740 Td 18 TL ' + lines.map(function (l) { return '(' + e(l) + ') Tj T*'; }).join(' ') + ' ET';
    var objs = ['<</Type/Catalog/Pages 2 0 R>>', '<</Type/Pages/Kids[3 0 R]/Count 1>>', '<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>', '<</Length ' + content.length + '>>\nstream\n' + content + '\nendstream', '<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>'];
    var out = '%PDF-1.4\n', off = [];
    objs.forEach(function (o, i) { off.push(out.length); out += (i + 1) + ' 0 obj\n' + o + '\nendobj\n'; });
    var x = out.length; out += 'xref\n0 6\n0000000000 65535 f \n' + off.map(function (o) { return ('0000000000' + o).slice(-10) + ' 00000 n \n'; }).join('') + 'trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n' + x + '\n%%EOF';
    return new Blob([out], { type: 'application/pdf' });
  }
  function blobFor(f) { return f.blob || BLOBS[f.id]; }

  /* ---------- map ---------- */
  (function buildLand() {
    var p = [], st = 3;
    MASK.forEach(function (row, r) { for (var c = 0; c < row.length; c++) if (row.charAt(c) === '1') p.push('M' + ((c + .5) * st).toFixed(1) + ' ' + (r * st) + 'h0'); });
    document.getElementById('hpLand').setAttribute('d', p.join(''));
  })();
  var MAP_H = MASK.length * 3;
  function px(lon) { return (lon + 180) * 2; }
  function py(lat) { return (84 - lat) * 2; }
  /* A simple, gentle arc between two airports on the flat map. It always takes the shorter way round (east or west),
     and bends upward by an amount that grows with the distance. (A true shortest path over the globe goes up near the
     North Pole for routes like Los Angeles to Dubai, which looks like a tall loop on a flat map.) */
  function greatCircle(a, b) {
    var x1 = px(a.lon), y1 = py(a.lat), x2 = px(b.lon), y2 = py(b.lat), dx = x2 - x1;
    if (dx > 360) x2 -= 720; else if (dx < -360) x2 += 720;
    var len = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)), lift = Math.min(len * 0.28, 70);
    var cx = (x1 + x2) / 2, cy = (y1 + y2) / 2 - lift, N = 72, out = [];
    for (var i = 0; i <= N; i++) { var t = i / N, u = 1 - t; out.push([u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2]); }
    return out;
  }
  var PLANE = 'M12 0L5 -2.2L-1 -10L-4.5 -10L-1.5 -2.4L-7.5 -2.4L-9.5 -5.5L-12 -5.5L-10 0L-12 5.5L-9.5 5.5L-7.5 2.4L-1.5 2.4L-4.5 10L-1 10L5 2.2Z';
  function mapHtml(jobs, opt) {
    opt = opt || {};
    var routes = jobs.filter(routeOf).map(function (j) { var a = pt(j.from), b = pt(j.to); return { j: j, a: a, b: b, P: greatCircle(a, b) }; });
    if (!routes.length) return '<div class="mapcard empty"><span>' + (opt.empty || 'The route appears here once airports are added or a declaration is uploaded.') + '</span></div>';
    var minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
    routes.forEach(function (r) { r.P.forEach(function (q) { minx = Math.min(minx, q[0]); maxx = Math.max(maxx, q[0]); miny = Math.min(miny, q[1]); maxy = Math.max(maxy, q[1]); }); });
    var AR = opt.ar || 2.1, w = Math.max((maxx - minx) * 1.5, (maxy - miny) * AR * 1.7, 150) * 1.2; w = Math.min(w, 900);
    var h = w / AR, cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, vx = cx - w / 2, vy = cy - h / 2;
    if (h < MAP_H + 30) vy = Math.max(-15, Math.min(MAP_H + 15 - h, vy)); else vy = (MAP_H - h) / 2;
    var u = w / 720, svg = '<svg class="map" viewBox="' + vx.toFixed(1) + ' ' + vy.toFixed(1) + ' ' + w.toFixed(1) + ' ' + h.toFixed(1) + '" preserveAspectRatio="xMidYMid slice" role="img" aria-label="' + esc(opt.label || 'Route map') + '">';
    svg += '<g style="color:var(--map-dot)"><use href="#hpLand" x="-720"/><use href="#hpLand"/><use href="#hpLand" x="720"/></g>';
    var labels = '';
    function pos(x, y) { return 'left:' + ((x - vx) / w * 100).toFixed(2) + '%;top:' + ((y - vy) / h * 100).toFixed(2) + '%'; }
    routes.forEach(function (r) {
      var n = r.P.length - 1, m = Math.floor(n / 2);
      var ang = Math.atan2(r.P[m + 1][1] - r.P[m - 1][1], r.P[m + 1][0] - r.P[m - 1][0]) * 180 / Math.PI;
      svg += '<path d="' + r.P.map(function (q, ix) { return (ix ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join('') + '" fill="none" stroke="#F37A21" stroke-width="' + (2 * u).toFixed(2) + '" stroke-linecap="round" stroke-opacity=".95"/>';
      [r.P[0], r.P[n]].forEach(function (e) { svg += '<circle cx="' + e[0].toFixed(1) + '" cy="' + e[1].toFixed(1) + '" r="' + (4.2 * u).toFixed(2) + '" fill="#ffffff" stroke="#F37A21" stroke-width="' + (1.6 * u).toFixed(2) + '"/>'; });
      if (r.j.mode === 'Air') svg += '<g transform="translate(' + r.P[m][0].toFixed(1) + ' ' + r.P[m][1].toFixed(1) + ') rotate(' + ang.toFixed(1) + ') scale(' + (1.05 * u).toFixed(3) + ')"><path d="' + PLANE + '" fill="#F37A21" stroke="#0c1829" stroke-width="1.2"/></g>';
      if (opt.labels) {
        var lab = function (p, above, html) {
          var pc = (p[0] - vx) / w * 100, tx = pc > 78 ? '-100%' : pc < 22 ? '0%' : '-50%';
          return '<span class="mlabel" style="' + pos(p[0], p[1]) + ';transform:translate(' + tx + ',' + (above ? 'calc(-100% - 12px)' : '12px') + ')">' + html + '</span>';
        };
        labels += lab(r.P[0], true, '<i>From</i>' + esc(r.a.city)) + lab(r.P[n], false, '<i>To</i>' + esc(r.b.city));
      } else labels += '<span class="mlabel tag" style="' + pos(r.P[n][0], r.P[n][1]) + '">' + esc(r.b.code) + '</span>';
    });
    svg += '</svg>';
    var foot = opt.foot ? '<div class="map-foot"><span>' + opt.foot[0] + '</span><span>' + opt.foot[1] + '</span></div>' : '';
    return '<div class="mapcard">' + svg + labels + foot + '</div>';
  }

  /* ---------- server connection ---------- */
  var REV = {}, SNAP = {}, SNAP_D = {}, SNAP_T = '', NET = Promise.resolve(), syncT = null, pollT = null, BLOBS = {};
  function jsonOf(v) { return JSON.stringify(v, function (k, x) { return k === 'blob' ? undefined : x; }); }
  function apiCall(method, path, body) {
    var opt = { method: method, credentials: 'same-origin', headers: {} };
    if (body !== undefined) { opt.headers['content-type'] = 'application/json'; opt.body = jsonOf(body); }
    return fetch(path, opt).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) { return { status: r.status, ok: r.ok, data: data }; });
    }, function () { return { status: 0, ok: false, data: { error: 'Could not reach the portal. Check your connection and try again.' } }; });
  }
  function reviveOrg(o) {
    var D = function (v) { return typeof v === 'string' ? new Date(v) : v; };
    o.jobs.forEach(function (j) {
      j.start = D(j.start); j.ev = (j.ev || []).map(function (e) { return [D(e[0]), e[1]]; });
      (j.log || []).forEach(function (l) { l.date = D(l.date); }); (j.msgs || []).forEach(function (m) { m.date = D(m.date); });
      if (j.by) Object.keys(j.by).forEach(function (k) { if (j.by[k] && j.by[k].date) j.by[k].date = D(j.by[k].date); });
    });
    o.files.forEach(function (f) { f.date = D(f.date); }); o.notifs.forEach(function (n) { n.date = D(n.date); });
    return o;
  }
  function orgForSave(o) { return { name: o.name, accountsEmail: o.accountsEmail || '', rates: o.rates || {}, billing: o.billing || null, reps: o.reps, jobs: o.jobs, files: o.files, notifs: o.notifs }; }
  function docsOf(id) { return DOCS.filter(function (d) { if (d.lines) d.total = Math.round(docTotal(d) * 100) / 100; return (d.orgId || '') === id; }); }
  function snapshot() {
    SNAP = {}; SNAP_D = {};
    Object.keys(ORGS).forEach(function (id) { SNAP[id] = jsonOf(orgForSave(ORGS[id])); SNAP_D[id] = jsonOf(docsOf(id)); });
    SNAP_D[''] = jsonOf(docsOf('')); SNAP_T = jsonOf(TARIFF);
  }
  function dirty() {
    if (!staff()) return false;
    if (jsonOf(TARIFF) !== SNAP_T || jsonOf(docsOf('')) !== SNAP_D['']) return true;
    return Object.keys(ORGS).some(function (id) { return jsonOf(orgForSave(ORGS[id])) !== SNAP[id] || jsonOf(docsOf(id)) !== SNAP_D[id]; });
  }
  /* Takes what the server sent (one company for a client, every company for staff) and keeps the screen where it was. */
  function adopt(data) {
    var keepOrg = S.org && S.org.id, keepRep = S.rep && S.rep.id;
    ORGS = {}; (data.orgs || [data.org]).forEach(function (o) { reviveOrg(o); ORGS[o.id] = o; REV[o.id] = o.rev; });
    DOCS = data.docs || []; SEQ = data.seq || {}; MAIL_ON = !!data.mail;
    Object.keys(ORGS).forEach(function (k) { ORGS[k].jobs.forEach(upgradeSteps); });
    if (data.tariff && data.tariff.length) TARIFF = data.tariff;
    if (data.me) ME = data.me;
    var ids = Object.keys(ORGS).sort(function (a, b) { return ORGS[a].name.localeCompare(ORGS[b].name); });
    /* With no companies yet (a new setup) staff still need a screen to add the first one, so give the page an empty stand-in. */
    S.org = ORGS[keepOrg] || ORGS[ids[0]] || (staff() ? { id: '', name: 'No clients yet', reps: [], jobs: [], files: [], notifs: [] } : null);
    if (!staff()) S.rep = S.org ? repOf(ME) : null;
    else S.rep = S.org ? (S.org.reps.filter(function (r) { return r.id === keepRep; })[0] || S.org.reps.filter(function (r) { return r.admin; })[0] || S.org.reps[0] || null) : null;
    S.home = S.org; S.homeRep = S.rep; S.demo = ids.some(function (id) { return ORGS[id].demo; });
    snapshot();
  }
  var ME = '';
  function signedOut(msg) {
    clearTimeout(pollT); clearTimeout(idleT); ORGS = {}; DOCS = []; BLOBS = {}; S.stage = 'org'; S.org = null; S.rep = null; S.role = 'client'; S.job = null; S.orgErr = msg || '';
    closeModal(); render();
  }
  function enter(kind) {
    return apiCall('GET', '/api/portal-state').then(function (r) {
      if (!r.ok) { signedOut(r.status === 401 ? '' : r.data.error); return; }
      S.role = kind; adopt(r.data);
      S.stage = 'app'; S.view = kind === 'staff' ? 'staffhome' : 'dashboard'; S.job = null; S.fp = 'all'; S.pin = ''; S.pinErr = ''; S.orgErr = '';
      render(); window.scrollTo(0, 0); resetIdle(); poll();
    });
  }
  function boot() {
    apiCall('GET', '/api/portal-session').then(function (r) {
      var d = r.data || {};
      if (d.staff) { enter('staff'); return; }
      if (d.client && d.client.profile) { enter('client'); return; }
      if (d.client) { S.org = stubOrg(d.client.org.name, d.client.profiles); S.stage = 'pin'; render(); return; }
      S.stage = 'org'; render();
    });
  }
  function stubOrg(name, profiles) { return { id: '', name: name, reps: profiles.map(function (p) { return { id: p.id, name: p.name, title: p.title || '' }; }), jobs: [], files: [], notifs: [] }; }
  /* Every change a person makes goes to the server first. The screen only updates from what the server answers. */
  function clientAct(body, ok) {
    return apiCall('POST', '/api/portal-act', body).then(function (r) {
      if (r.status === 401) { signedOut('Please sign in again.'); return null; }
      if (!r.ok) { toast(r.data.error || 'That did not work. Please try again.'); return null; }
      adopt(r.data.state); render(); if (ok) ok(r.data); return r.data;
    });
  }
  /* Staff edit the screen's data directly. A moment later the changed companies are sent to the server, one after another. */
  function queueSync() { if (!staff() || S.stage !== 'app') return; clearTimeout(syncT); syncT = setTimeout(syncStaff, 400); }
  function syncStaff() {
    NET = NET.then(function () {
      if (!staff() || S.stage !== 'app') return;
      var jobs = [], tariffNow = jsonOf(TARIFF);
      Object.keys(ORGS).forEach(function (id) {
        var cur = jsonOf(orgForSave(ORGS[id])), dd = jsonOf(docsOf(id));
        if (cur !== SNAP[id]) jobs.push(function () { return apiCall('POST', '/api/portal-staff', { action: 'saveOrg', orgId: id, rev: REV[id], org: orgForSave(ORGS[id]) }).then(function (r) { if (r.ok) { REV[id] = r.data.rev; SNAP[id] = cur; } return r; }); });
        if (dd !== SNAP_D[id]) jobs.push(function () { return apiCall('POST', '/api/portal-staff', { action: 'saveDocs', orgId: id, docs: docsOf(id) }).then(function (r) { if (r.ok) SNAP_D[id] = dd; return r; }); });
      });
      var loose = jsonOf(docsOf(''));
      if (loose !== SNAP_D['']) jobs.push(function () { return apiCall('POST', '/api/portal-staff', { action: 'saveDocs', orgId: '', docs: docsOf('') }).then(function (r) { if (r.ok) SNAP_D[''] = loose; return r; }); });
      if (tariffNow !== SNAP_T) jobs.push(function () { return apiCall('POST', '/api/portal-staff', { action: 'saveTariff', tariff: TARIFF }).then(function (r) { if (r.ok) SNAP_T = tariffNow; return r; }); });
      return jobs.reduce(function (p, fn) { return p.then(function (bad) { return bad ? bad : fn().then(function (r) { return r.ok ? null : r; }); }); }, Promise.resolve(null)).then(function (bad) {
        if (!bad) return;
        if (bad.status === 409) { toast('Someone else changed this company. Reloading the latest.'); return reload(); }
        if (bad.status === 401) { signedOut('Please sign in again.'); return; }
        toast(bad.data.error || 'Could not save your changes. Check your connection.');
      });
    });
    return NET;
  }
  /* Waits until every pending staff change has reached the server. */
  function flush() { clearTimeout(syncT); return syncStaff(); }
  function reload() {
    return apiCall('GET', '/api/portal-state').then(function (r) { if (r.status === 401) { signedOut('Please sign in again.'); return; } if (r.ok) { adopt(r.data); render(); } });
  }
  /* Checks every half minute for changes made by other people, unless the screen is busy. */
  function poll() {
    clearTimeout(pollT);
    pollT = setTimeout(function () {
      var a = document.activeElement, busy = layer.innerHTML || (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) || dirty() || document.hidden;
      if (S.stage !== 'app') return;
      if (busy) { poll(); return; }
      apiCall('GET', '/api/portal-state').then(function (r) {
        if (r.status === 401) { signedOut('Please sign in again.'); return; }
        if (r.ok && !dirty()) { var orgs = r.data.orgs || [r.data.org], chg = orgs.length !== Object.keys(ORGS).length || orgs.some(function (o) { return REV[o.id] !== o.rev; }); if (chg) { adopt(r.data); render(); } }
        poll();
      });
    }, 30000);
  }
  function fileToB64(file) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { var t = String(r.result); res(t.slice(t.indexOf(',') + 1)); }; r.onerror = rej; r.readAsDataURL(file); }); }
  /* Sends one file. Resolves to the new file record, or null (after telling the person why). */
  function sendFile(jobId, type, file, note, quiet, step, extra) {
    return fileToB64(file).then(function (b64) {
      if (staff()) {
        var orgId = (extra && extra.orgId) || S.org.id, body = { action: 'uploadFile', orgId: orgId, jobId: jobId, type: type, name: file.name, data: b64, note: note || '', step: step || '' };
        if (extra && extra.docId) body.docId = extra.docId;
        NET = NET.then(function () { return apiCall('POST', '/api/portal-staff', body); });
        return NET.then(function (r) {
          if (r.status === 401) { signedOut('Please sign in again.'); return null; }
          if (!r.ok) { toast(r.data.error || 'The upload did not work.'); return null; }
          var f = r.data.file; f.date = new Date(f.date); BLOBS[f.id] = file; ORGS[orgId].files.push(f); REV[orgId] = r.data.rev; return f;
        });
      }
      return apiCall('POST', '/api/portal-act', { action: 'uploadFile', jobId: jobId, type: type, name: file.name, data: b64, note: note || '', quiet: !!quiet, step: step || '' }).then(function (r) {
        if (r.status === 401) { signedOut('Please sign in again.'); return null; }
        if (!r.ok) { toast(r.data.error || 'The upload did not work.'); return null; }
        adopt(r.data.state); BLOBS[r.data.fileId] = file; return findFile(r.data.fileId);
      });
    }, function () { toast('Could not read that file.'); return null; });
  }
  function sendFiles(jobId, list, quiet) {
    return list.reduce(function (p, it) { return p.then(function () { return sendFile(jobId, it.type, it.file, it.note, quiet); }); }, Promise.resolve());
  }
  /* The bytes of a file come from the server, only after the sign-in check. */
  function ensureBlob(f) {
    if (f.blob) return Promise.resolve(f.blob);
    if (BLOBS[f.id]) return Promise.resolve(BLOBS[f.id]);
    return fetch('/api/portal-file?id=' + encodeURIComponent(f.id), { credentials: 'same-origin' }).then(function (r) {
      if (r.status === 401) { signedOut('Please sign in again.'); throw new Error('auth'); }
      if (!r.ok) throw new Error('missing');
      return r.blob();
    }).then(function (b) { BLOBS[f.id] = b; return b; });
  }

  /* ---------- sign-in ---------- */
  function loginShell(inner) {
    return '<div class="login"><div class="login-card"><div class="login-band"><img class="logo logo-l" src="' + LOGO_L + '" alt="HazPack Compliance"><img class="logo logo-d" src="' + LOGO_D + '" alt="" aria-hidden="true"><p class="eyebrow">Client portal</p></div><div class="login-body">' + inner + '</div></div></div>';
  }
  function orgView() {
    return loginShell('<div><h1>Sign in</h1><p class="muted" style="margin:4px 0 0">Enter your organization login. You will choose your name and enter your PIN next.</p></div>' +
      '<form id="orgForm" style="display:grid;gap:14px"><label class="f" for="oid">Organization ID<input id="oid" type="text" autocomplete="username" autocapitalize="off" spellcheck="false" required value="' + esc(S.orgIdVal || '') + '"></label>' +
      '<label class="f" for="opw">Password<input id="opw" type="password" autocomplete="current-password" required></label>' +
      '<p class="err" id="oerr" role="alert">' + esc(S.orgErr) + '</p><button class="btn" type="submit" id="oGo">Continue</button></form>' +
      '<p class="hint">Need a login or a reset? Contact HazPack at lax-dgr@hazpackcompliance.com. <button type="button" class="linkbtn" data-act="toStaff">HazPack staff sign-in</button></p>');
  }
  function staffView() {
    return loginShell('<div><h1>HazPack staff</h1><p class="muted" style="margin:4px 0 0">Enter the staff key to manage client companies, jobs, quotes and invoices.</p></div>' +
      '<form id="staffForm" style="display:grid;gap:14px"><label class="f" for="skey">Staff key<input id="skey" type="password" autocomplete="current-password" required></label>' +
      '<p class="err" id="serr" role="alert">' + esc(S.orgErr) + '</p><button class="btn" type="submit" id="sGo">Sign in</button></form>' +
      '<p class="hint"><button type="button" class="linkbtn" data-act="toOrg">Back to company sign-in</button></p>');
  }
  function pinView() {
    var o = S.org, reps = o.reps.map(function (r) {
      return '<button type="button" class="rep" data-act="pickRep" data-id="' + r.id + '" aria-pressed="' + (S.pendingRep === r.id) + '"><span class="av">' + initials(r.name) + '</span><span><b>' + esc(r.name) + '</b><span>' + esc(r.title) + '</span></span></button>';
    }).join('');
    var pad = '';
    if (S.pendingRep) {
      var dots = ''; for (var i = 0; i < 4; i++) dots += '<i class="' + (i < S.pin.length ? 'on' : '') + '"></i>';
      pad = '<div class="dots" aria-label="PIN entry, ' + S.pin.length + ' of 4 digits">' + dots + '</div><p class="err" role="alert" style="text-align:center">' + esc(S.pinErr) + '</p><div class="pad-grid">' +
        [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button type="button" data-act="digit" data-d="' + n + '">' + n + '</button>'; }).join('') +
        '<button type="button" class="aux" data-act="pinClear">Clear</button><button type="button" data-act="digit" data-d="0">0</button><button type="button" class="aux" data-act="pinBack" aria-label="Delete last digit">Delete</button></div>';
    }
    return loginShell('<div><p class="eyebrow">' + esc(o.name) + '</p><h1>Who is signing in?</h1><p class="muted" style="margin:4px 0 0">Choose your name, then enter your 4-digit PIN.</p></div><div class="replist">' + reps + '</div>' + pad +
      '<button type="button" class="linkbtn" data-act="toOrg">Use a different organization</button>');
  }

  /* ---------- shell ---------- */
  var TITLES = { dashboard: 'Dashboard', jobs: 'Jobs', files: 'Files', team: 'Team', billing: 'Billing', doc: 'Quote and invoice', staffhome: 'Home', invoices: 'Invoices', clients: 'Client companies' };
  function railOld() {
    var o = S.org, items = [['dashboard', 'Dashboard', ''], ['jobs', 'Jobs', staff() ? allJobsCount() : vis().length], ['files', 'Files', visFiles().length], ['team', 'Team', (staff() || S.rep.admin) ? o.reps.length : 1]];
    if (!staff()) items.splice(3, 0, ['invoices', 'Invoices', clientInvoices().length]);
    if (staff()) { items.unshift(['staffhome', 'Home', needsCount()]); items.push(['billing', 'Billing', DOCS.length]); items.push(['clients', 'Clients', Object.keys(ORGS).length]); }
    var meName = staff() ? staffName() : S.rep.name, meSub = staff() ? 'Viewing ' + o.name : S.rep.title + (S.rep.admin ? ' · Admin' : '');
    return '<aside class="rail"><div class="brand"><img class="logo logo-l" src="' + LOGO_L + '" alt="HazPack Compliance"><img class="logo logo-d" src="' + LOGO_D + '" alt="" aria-hidden="true"><p class="eyebrow">Client portal</p></div>' +
      '<div class="org"><b>' + esc(o.name) + '</b><span>' + vis().length + ' ' + (vis().length === 1 ? 'job' : 'jobs') + (staff() || S.rep.admin ? ' across your team' : ' yours') + '</span></div>' +
      '<nav class="nav" aria-label="Portal sections">' + items.map(function (i) { return '<button type="button" data-act="nav" data-v="' + i[0] + '"' + (S.view === i[0] || (i[0] === 'billing' && S.view === 'doc') ? ' aria-current="page"' : '') + '>' + i[1] + '<span class="badge quiet">' + i[2] + '</span></button>'; }).join('') + '</nav>' +
      '<div class="foot">' +
      '<div class="me"><span class="av">' + initials(meName) + '</span><div class="t"><b>' + esc(meName) + '</b><span>' + esc(meSub) + '</span></div><button type="button" class="linkbtn" data-act="lock" style="font-size:12.5px">' + 'Log out' + '</button></div></div></aside>';
  }
  function topbar() {
    var n = staff() ? 0 : unread().length;
    var btns = staff() ? '<button type="button" class="btn sm" data-act="upload" data-job="' + esc(S.view === 'jobs' ? S.job || '' : '') + '">Upload to client</button>' :
      '<button type="button" class="btn sm ghost" data-act="upload" data-job="' + esc(S.view === 'jobs' ? S.job || '' : '') + '">Upload a file</button>' + ihb('New job request', 'type="button" data-act="request"', 'sm') + '';
    var cmSeg = staff() && S.view === 'clients' ? '<div class="seg top" role="group" aria-label="Show companies as"><button type="button" data-act="cmMode" data-m="0" aria-pressed="' + !S.cmap + '">Table</button><button type="button" data-act="cmMode" data-m="1" aria-pressed="' + !!S.cmap + '">Map</button></div>' :
      !staff() && S.view === 'dashboard' ? '<div class="seg top wide" role="group" aria-label="Show the dashboard as"><button type="button" data-act="dMode" data-m="0" aria-pressed="' + !S.dmap + '">Dashboard</button><button type="button" data-act="dMode" data-m="1" aria-pressed="' + !!S.dmap + '">Company map</button></div>' : '';
    return '<div class="topbar"><h1>' + TITLES[S.view] + '</h1>' + cmSeg + kButton() + btns +
      (!staff() ? '<button type="button" class="bell" data-act="bell" aria-label="Notifications, ' + n + ' unread"><svg viewBox="0 0 24 24"><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>' + (n ? '<span class="badge">' + n + '</span>' : '') + '</button>' : '') + '</div>' +
      (S.notif && !staff() ? notifPanel() : '');
  }
  function notifPanel() {
    var ids = vis().map(function (j) { return j.id; });
    var list = S.org.notifs.filter(function (n) { return n.to === 'client' && nvis(n, ids); }).sort(function (a, b) { return b.date - a.date; });
    return '<div class="npanel" role="dialog" aria-label="Notifications"><header><b>Notifications</b><button type="button" class="linkbtn" data-act="readAll">Mark all read</button></header><ul>' +
      (list.length ? list.map(function (n) { return '<li class="' + (n.read[S.rep.id] ? '' : 'unread') + '"><button type="button" data-act="openNotif" data-id="' + n.id + '"><span>' + esc(clientText(n.text)) + '</span><small class="mono">' + esc(jnId(n.job)) + ' · ' + fmt(n.date) + '</small></button></li>'; }).join('') : '<li style="padding:16px" class="muted">Nothing new.</li>') + '</ul></div>';
  }

  /* ---------- views ---------- */
  function showWho() { return staff() || S.rep.admin; }
  function jobTable(list) {
    return '<div class="tbl-wrap"><table><thead><tr><th>' + (staff() ? 'Job' : 'Reference') + '</th><th>Contents</th><th>UN no.</th><th>Route</th>' + (showWho() ? '<th>Requested by</th>' : '') + '<th>Status</th></tr></thead><tbody>' + list.map(function (j) {
      return '<tr class="click" data-act="job" data-id="' + j.id + '"><td class="mono"><b>' + esc(jn(j)) + '</b></td><td>' + esc(j.item) + '</td><td><span class="un">' + j.un + '</span></td><td class="mono">' + (routeOf(j) ? j.from + ' → ' + j.to : j.toText ? (j.from || 'LAX') + ' → ' + esc(j.toText) : '—') + '</td>' + (showWho() ? '<td>' + esc(repName(j.rep)) + '</td>' : '') + '<td>' + pill(j) + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function actions(f) {
    return '<span style="display:flex;gap:6px;flex-wrap:wrap">' + quoteBtns(f) + (/\.(pdf|png|jpe?g|gif|webp)$/i.test(f.name) ? '<button type="button" class="btn ghost sm" data-act="view" data-id="' + f.id + '">View</button>' : '') + '<button type="button" class="btn ghost sm" data-act="dl" data-id="' + f.id + '">Download</button></span>';
  }
  /* Dashboard version: one line of details and two buttons that line up on the right in every row. */
  function fileRowCompact(f) {
    var t = ftype(f.type), q = quoteDoc(f), waiting = !staff() && q && q.type === 'Quote' && q.status === 'Open';
    var meta = [f.job ? jnId(f.job) : 'No job yet', TYPE_LABEL[f.type], fmtS(f.date)].concat(f.note ? [f.note] : []).join(' · ');
    var first = waiting && f.job ? '<button type="button" class="btn sm" data-act="job" data-id="' + esc(f.job) + '">Review quote</button>' : /\.(pdf|png|jpe?g|gif|webp)$/i.test(f.name) ? '<button type="button" class="btn ghost sm" data-act="view" data-id="' + f.id + '">View</button>' : '';
    return '<li class="frow"><div class="ico ' + t[1] + '">' + t[0] + '</div><div class="t"><b title="' + esc(f.name) + '">' + esc(f.name) + '</b><span title="' + esc(meta) + '">' + esc(meta) + '</span></div><span class="fa">' + first + '<button type="button" class="btn ghost sm" data-act="dl" data-id="' + f.id + '">Download</button></span></li>';
  }
  function fileRow(f, showJob) {
    var t = ftype(f.type);
    return '<li><div class="ico ' + t[1] + '">' + t[0] + '</div><div class="t"><b>' + esc(f.name) + '</b><span>' + (showJob ? '<span class="mono">' + esc(jnId(f.job)) + '</span> · ' : '') + TYPE_LABEL[f.type] + ' · ' + fmt(f.date) + ' · ' + esc(f.by) + (f.note ? ' · ' + esc(f.note) : '') + '</span></div>' + actions(f) + '</li>';
  }
  function dashboard() {
    if (!staff() && S.dmap) return clientMapView();
    var jobs = vis(), fix = jobs.filter(function (j) { return j.fix; }), req = jobs.filter(function (j) { return j.pending; }), open = jobs.filter(function (j) { return isOpen(j) && !j.pending; });
    var files = visFiles(), recentFiles = files.slice().sort(function (a, b) { return b.date - a.date; }).slice(0, 4);
    var ids = jobs.map(function (j) { return j.id; });
    var feed = S.org.notifs.filter(function (n) { return n.to === 'client' && nvis(n, ids); }).sort(function (a, b) { return b.date - a.date; }).slice(0, 4);
    var wk = files.filter(function (f) { return TODAY - f.date <= 7 * 864e5; }).length;
    var first = staff() ? staffName() : S.rep.name.split(' ')[0];
    return '<section class="banner"><div><p class="eyebrow">' + esc(S.org.name) + '</p><h2>' + (staff() ? 'Viewing ' + esc(S.org.name) : 'Welcome back, ' + esc(first)) + '</h2><p>Here is where ' + (showWho() ? 'all jobs' : 'your jobs') + ' stand on ' + fmt(TODAY) + '.</p></div>' +
      (fix.length ? '<button type="button" class="btn" data-act="job" data-id="' + fix[0].id + '">Review the job that needs correction</button>' : !staff() ? ihb('Start a new job request', 'type="button" data-act="request"', 'lg') : '') + '</section>' +
      '<div class="stats"><div class="card stat' + (fix.length || quotesWaiting().length ? ' attn' : '') + '"><span class="k">Needs your attention</span><span class="v">' + (fix.length + quotesWaiting().length) + '</span><span class="s">' + (quotesWaiting().length ? 'corrections and quotes to approve' : 'awaiting a correction') + '</span></div>' +
      '<div class="card stat"><span class="k">Open jobs</span><span class="v">' + open.length + '</span><span class="s">being worked by HazPack</span></div>' +
      '<div class="card stat"><span class="k">Requests under review</span><span class="v">' + req.length + '</span><span class="s">waiting for HazPack to accept</span></div>' +
      '<div class="card stat"><span class="k">Files added this week</span><span class="v">' + wk + '</span><span class="s">declarations, reports, invoices</span></div></div>' +
      looseQuotesCard() + '<div class="card"><h2>Routes</h2><div class="pad">' + mapHtml(jobs.filter(isOpen), { label: 'Routes for open jobs', empty: 'Routes for open jobs appear here.', foot: ['Open jobs', 'Airports read from each declaration'] }) + '</div></div>' +
      '<div class="card"><h2>Jobs</h2>' + (jobs.length ? jobTable(jobs.slice(0, 5)) : emptyS('No jobs yet', 'Start a job request and it appears here.', !staff() ? '' + ihb('New job request', 'type="button" data-act="request"', 'sm') + '' : '')) + '</div>' +
      '<div class="two"><div class="card"><h2>Latest files</h2><ul class="list">' + (recentFiles.length ? recentFiles.map(fileRowCompact).join('') : '<li class="muted">No files yet.</li>') + '</ul></div>' +
      '<div class="card"><h2>Recent activity</h2><ul class="list">' + (feed.length ? feed.map(function (n) { return '<li><div class="t"><b style="font-weight:500">' + esc(clientText(n.text)) + '</b><span class="mono">' + esc(jnId(n.job)) + ' · ' + fmt(n.date) + '</span></div></li>'; }).join('') : '<li class="muted">No activity yet.</li>') + '</ul></div></div>';
  }
  function jobCard(j) {
    var a = pt(j.from), b = pt(j.to), ok = routeOf(j);
    return '<button type="button" class="jcard" data-act="job" data-id="' + j.id + '"' + (S.job === j.id ? ' aria-current="true"' : '') + '><div class="r1"><b>' + esc(jn(j)) + '</b>' + pill(j) + '</div>' +
      (ok ? '<div class="rt"><span class="code">' + a.code + '</span><span class="ln">' + (j.mode === 'Air' ? '<svg viewBox="-13 -11 26 22" aria-hidden="true"><path d="' + PLANE + '"/></svg>' : '') + '</span><span class="code">' + b.code + '</span></div><div class="cities"><span>' + esc(a.city) + '</span><span>' + esc(b.city) + '</span></div>' : '<div class="sub">' + (j.toText ? 'To ' + esc(j.toText) + ' (not on the map yet)' : 'Route not set yet') + '</div>') +
      '<div class="sub">' + esc(j.item) + '</div><div class="sub">' + j.mode + ' · Opened ' + fmtS(j.ev[0][0]) + (j.req ? ' · Required by ' + fmtS(isoDate(j.req)) : '') + (showWho() ? ' · ' + esc(repName(j.rep)) : '') + '</div></button>';
  }
  function jobsView() {
    if (staff()) return staffJobs();
    return clientJobsView();
    var q = S.q.toLowerCase();
    var list = vis().filter(function (j) {
      if (S.f === 'air' && j.mode !== 'Air') return false; if (S.f === 'ground' && j.mode !== 'Ground') return false; if (S.f === 'attn' && !j.fix) return false; if (S.f === 'open' && !isOpen(j)) return false;
      if (showWho() && S.fp !== 'all' && j.rep !== S.fp) return false;
      return !q || (j.id + j.item + j.un + j.ref + (pt(j.to) ? pt(j.to).city + j.to : '')).toLowerCase().indexOf(q) > -1;
    });
    list = sortJobs(list);
    if ((!S.job || !list.some(function (j) { return j.id === S.job; })) && list.length) S.job = list[0].id;
    if (!list.length) S.job = null;
    var chips = [['all', 'All'], ['open', 'Open'], ['air', 'Air'], ['ground', 'Ground'], ['attn', 'Needs correction']].map(function (c) { return '<button type="button" class="chip" data-act="filter" data-f="' + c[0] + '" aria-pressed="' + (S.f === c[0]) + '">' + c[1] + '</button>'; }).join('');
    var who = showWho() ? '<select id="fp" aria-label="Filter by person"><option value="all">Everyone at ' + esc(S.org.name) + '</option>' + S.org.reps.map(function (r) { return '<option value="' + r.id + '"' + (S.fp === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('') + '</select>' : '';
    return '<div class="split"><div class="jlist-wrap" id="jlistWrap"><div class="jlist"><input id="q" type="search" placeholder="Search job, contents, UN number" value="' + esc(S.q) + '" aria-label="Search jobs">' + who + jobSortSel() + '<div class="chips">' + chips + '</div>' +
      (list.length ? list.map(jobCard).join('') : emptyS('No jobs match', 'Try a different search or filter.', '')) + '</div></div><div class="jdetail">' + (S.job && getJob(S.job) ? detail(getJob(S.job)) : '<p class="muted">Select a job.</p>') + '</div></div>';
  }
  function docCell(f, none) {
    if (!f) return '<span class="muted">' + none + '</span>';
    return '<div class="dcell"><span class="mono">' + esc(f.name) + '</span><span class="muted" style="font-size:12.5px">' + (f.note ? esc(f.note) + ' · ' : '') + fmt(f.date) + '</span>' + actions(f) + '</div>';
  }
  function stepNodes(j) {
    var out = [];
    j.steps.forEach(function (n, i) {
      if (i === j.done && j.fix) out.push('<div class="bad">Correction needed</div>');
      out.push('<div class="' + (i < j.done ? 'done' : (i === j.done && !j.pending) ? 'now' : '') + '">' + esc(n) + '</div>');
    });
    return out.join('');
  }
  function detail(j) {
    if (S.jobTab === 'flow' && !staff()) S.jobTab = 'overview';
    var a = pt(j.from), b = pt(j.to), t = S.jobTab, ok = routeOf(j);
    var files = S.org.files.filter(function (f) { return f.job === j.id; }).sort(function (x, y) { return y.date - x.date; });
    var body = '';
    if (t === 'overview') {
      body = quoteBanner(j) + (j.pending && !staff() ? '<div class="pad" style="padding-bottom:0"><div class="alert" style="border-color:var(--info);background:var(--info-soft)"><b style="color:var(--info)">Request received.</b> HazPack is reviewing it and will open the job shortly. You will get a notification when that happens.' + withdrawBtn(j) + '</div></div>' : '') +
        (j.fix && !staff() ? '<div class="pad" style="padding-bottom:0"><div class="alert"><b>Action needed.</b> ' + esc(j.fixNote || 'Something on this job needs a correction.') + ' This job cannot be cleared to ship until it is resolved. <button type="button" class="linkbtn" data-act="upload" data-job="' + j.id + '">Upload a corrected file</button></div></div>' + diffCard(j) : '') + (j.fix && staff() ? diffCard(j) : '') +
        '<dl class="dl"><div><dt>UN number</dt><dd><span class="un">' + esc(j.un || '—') + '</span></dd></div><div><dt>Hazard class</dt><dd>' + esc(j.cls) + '</dd></div><div><dt>Packing group</dt><dd>' + esc(j.pg) + '</dd></div><div><dt>Quantity</dt><dd>' + esc(j.qty || '—') + '</dd></div><div><dt>Transport</dt><dd>' + j.mode + '</dd></div><div><dt>Your reference</dt><dd class="mono">' + esc(j.ref || '—') + '</dd></div>' +
        '<div><dt>Requested by</dt><dd>' + esc(repName(j.rep)) + '</dd></div><div><dt>Services</dt><dd>' + j.svc.map(function (k) { return SVC[k]; }).join(', ') + '</dd></div><div><dt>Required by</dt><dd>' + (j.req ? fmt(isoDate(j.req)) : 'Not set') + '</dd></div>' +
        '<div class="wide2"><dt>DGD</dt><dd>' + docCell(latest(j, 'DGD'), 'Not uploaded yet') + '</dd></div><div class="wide2"><dt>Invoice</dt><dd>' + docCell(latest(j, 'Invoice'), 'Not sent yet') + '</dd></div></dl>' + (staff() ? '' : '<div class="pad" style="padding-top:0">' + taskRows(j) + '</div>');
    } else if (t === 'timeline') {
      var items = j.ev.map(function (e) { return '<li class="' + (/^Correction needed/.test(e[1]) ? 'warn' : '') + '"><div><b>' + esc(clientText(e[1])) + '</b><span>' + fmt(e[0]) + '</span></div></li>'; });
      j.steps.forEach(function (n, i) { if (i >= j.done) items.push('<li class="todo"><div><b>' + esc(n) + '</b><span>Up next</span></div></li>'); });
      body = '<ul class="tl">' + items.join('') + '</ul>';
    } else if (t === 'flow') { body = '<div class="pad">' + flowHtml(j) + '</div>';
    } else if (t === 'msgs') body = msgsBody(j); else if (t === 'log' && staff()) body = logBody(j); else body = filesBody(j, files);
    var sb = '';
    if (staff()) {
      sb = '<div class="staffbar"><span><b>Staff view.</b> Clients never see this bar.</span><span class="row">' +
        (j.pending ? '<button type="button" class="btn sm" data-act="accept" data-id="' + j.id + '">Accept request and open job</button>' :
          (j.done < j.steps.length ? '<button type="button" class="btn sm" data-act="stepNext" data-id="' + j.id + '">Complete: ' + esc(j.steps[j.done]) + '</button>' : '') + (j.done > 1 ? '<button type="button" class="btn sm ghost" data-act="stepUndo" data-id="' + j.id + '">Undo last step</button>' : '') +
          '<button type="button" class="btn sm ghost" data-act="docNew" data-m="Quote" data-org="' + S.org.id + '" data-job="' + j.id + '">New quote</button><button type="button" class="btn sm ghost" data-act="docNew" data-m="Invoice" data-org="' + S.org.id + '" data-job="' + j.id + '">New invoice</button>' + (j.fix ? '<button type="button" class="btn sm ghost" data-act="fixOff" data-id="' + j.id + '">Resolve correction</button>' : '<input id="fixnote" type="text" placeholder="What needs correcting" style="width:200px;padding:6px 8px" aria-label="Correction note"><button type="button" class="btn sm ghost" data-act="fixOn" data-id="' + j.id + '">Flag for correction</button>')) + '</span></div>';
    }
    var tabsCard = '<div class="card"><div class="tabs" role="tablist">' + tabList(j, files).map(function (x) { return '<button type="button" role="tab" data-act="jobTab" data-t="' + x[0] + '" aria-selected="' + (t === x[0]) + '">' + x[1] + '</button>'; }).join('') + '</div>' + body + '</div>';
    if (staff()) return staffWorkspace(j, tabsCard);
    var foot = ok ? [esc(a.city) + ' (' + a.code + ') to ' + esc(b.city) + ' (' + b.code + ')', j.mode + ' route'] : null;
    return '<div style="display:grid;gap:14px"><button type="button" class="btn ghost sm back-m" data-act="backList">&larr; All jobs</button>' +
      '<div style="display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap"><div><h2 class="mono" style="font-family:var(--font-mono);font-size:22px">' + esc(jn(j)) + '</h2><div class="muted">' + esc(j.item) + '' + '</div></div>' + pill(j) + '</div>' + sb +
      mapHtml([j], { labels: true, empty: j.toText ? 'The destination ' + esc(j.toText) + ' is not on the map yet. HazPack can add it.' : undefined, label: ok ? 'Route from ' + a.city + ' to ' + b.city : 'Route', foot: foot }) +
      tabsCard + jobDock(j) + '</div>';
  }
  var FOLDER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.2l2 2.2h8.8A1.5 1.5 0 0 1 21 8.7v9.8a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg>';
  function filesView() {
    var files = visFiles().filter(function (f) { return S.ff === 'all' || f.type === S.ff; });
    var folders = vis().map(function (j) { return [j, files.filter(function (f) { return f.job === j.id; }).sort(function (a, b) { return b.date - a.date; })]; }).filter(function (p) { return p[1].length; });
    var allOpen = S.ff !== 'all';
    var html = folders.map(function (p, i) {
      var j = p[0], fl = p[1], open = allOpen || (S.openF[j.id] !== undefined ? S.openF[j.id] : i === 0);
      return '<section class="folder' + (open ? ' open' : '') + '"><button type="button" class="fhead" data-act="folder" data-id="' + j.id + '" aria-expanded="' + open + '">' + FOLDER_SVG +
        '<span class="ft"><b class="mono">' + esc(jn(j)) + '</b><span>' + esc(j.item) + '</span></span><span class="fmeta">' + pill(j) + '<span class="muted">' + fl.length + (fl.length === 1 ? ' file' : ' files') + ' · ' + fmtS(fl[0].date) + '</span></span><span class="chev" aria-hidden="true"></span></button>' +
        (open ? '<ul class="list">' + fl.map(function (f) { return fileRow(f, false); }).join('') + '</ul>' : '') + '</section>';
    }).join('');
    return '<div class="tools"><select id="ff" aria-label="Filter by type"><option value="all">All file types</option>' + Object.keys(TYPE_LABEL).map(function (k) { return '<option value="' + k + '"' + (S.ff === k ? ' selected' : '') + '>' + TYPE_LABEL[k] + '</option>'; }).join('') + '</select>' +
      (folders.length > 1 && !allOpen ? '<button type="button" class="btn ghost sm" data-act="folderAll" data-o="1">Open all folders</button><button type="button" class="btn ghost sm" data-act="folderAll" data-o="0">Close all</button>' : '') + '</div>' +
      (folders.length ? '<div class="folders">' + html + '</div>' : '<div class="card">' + emptyS('No files yet', 'Files from HazPack and files you upload appear here.', '<button type="button" class="btn sm" data-act="upload" data-job="">' + (staff() ? 'Upload to client' : 'Upload a file') + '</button>') + '</div>');
  }
  function teamView() {
    var o = S.org, all = staff() || S.rep.admin, me = S.rep, canEdit = all;
    var reps = all ? o.reps : [me];
    var rows = reps.map(function (r) {
      var can = canEdit || r.id === me.id;
      return '<tr><td><b>' + esc(r.name) + '</b>' + (!staff() && r.id === me.id ? ' <span class="muted">(you)</span>' : '') + '<br><span class="muted">' + esc(r.title) + '</span></td><td>' + esc(r.email) + (r.phone ? '<br><span class="muted">' + esc(r.phone) + '</span>' : '') + '</td><td>' + (r.admin ? 'Admin' : 'Member') + '<br><span class="muted">' + (r.admin ? 'Sees every job' : 'Sees own jobs') + '</span></td>' +
        '<td><label class="switch"><input type="checkbox" data-act="toggleAlert" data-id="' + r.id + '"' + (r.notify ? ' checked' : '') + (can ? '' : ' disabled') + '> ' + (r.notify ? 'On' : 'Off') + '</label></td>' +
        '<td><span style="display:flex;gap:6px;flex-wrap:wrap">' + (can ? '<button type="button" class="btn ghost sm" data-act="editRep" data-id="' + r.id + '">Edit details</button>' : '') + (canEdit ? '<button type="button" class="btn ghost sm" data-act="resetPin" data-id="' + r.id + '">Reset PIN</button><button type="button" class="btn ghost sm" data-act="toggleAdmin" data-id="' + r.id + '">' + (r.admin ? 'Make member' : 'Make admin') + '</button>' + (!(r.id === me.id && !staff()) ? '<button type="button" class="btn ghost sm" data-act="removeRep" data-id="' + r.id + '">Remove</button>' : '') : '') + '</span></td></tr>';
    }).join('');
    return '<div class="card"><h2>' + (all ? 'People at ' + esc(o.name) : 'Your details') + '</h2><p class="muted" style="margin:4px 16px 12px">One organization login, one PIN per person. Admins see every job in the company. Members see only their own. Email alerts go to each person who has them on and can see the job.</p><div class="tbl-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Email alerts</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></div>' +
      (staff() ? accountsCard(o) : '') +
      (canEdit ? '<form class="card pad" id="addRep" style="display:grid;gap:12px"><h3 style="font-size:16px">Add a person</h3><div class="form-row"><label class="f" for="rn">Name<input id="rn" type="text" required></label><label class="f" for="rt">Job title<input id="rt" type="text"></label><label class="f" for="re">Email<input id="re" type="email" required></label><label class="f" for="rp">4-digit PIN<input id="rp" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label></div><label class="switch" for="radm"><input id="radm" type="checkbox"> Make this person an admin</label><div><button type="submit" class="btn">Add person</button></div></form>' : '<p class="muted">Only an admin can add people, see everyone, or reset PINs.</p>');
  }
  function clientsView() {
    if (S.cmap) return clientMapView();
    var pend = []; Object.keys(ORGS).forEach(function (k) { ORGS[k].jobs.forEach(function (j) { if (j.pending) pend.push([ORGS[k], j]); }); });
    var acts = []; Object.keys(ORGS).forEach(function (k) { ORGS[k].notifs.forEach(function (n) { if (n.to === 'staff') acts.push([ORGS[k], n]); }); }); acts.sort(function (a, b) { return b[1].date - a[1].date; });
    return '<div class="card"><h2>New job requests</h2><ul class="list">' + requestItems(pend) + '</ul></div>' +
      '<div class="card"><h2>Client companies</h2><div class="tbl-wrap"><table><thead><tr><th>Company</th><th>Organization ID</th><th>People</th><th>Open jobs</th><th></th></tr></thead><tbody>' + Object.keys(ORGS).map(function (k) {
        var o = ORGS[k]; return '<tr><td><b>' + esc(o.name) + '</b></td><td class="mono">' + o.id + '</td><td>' + o.reps.length + ' (' + o.reps.filter(function (r) { return r.admin; }).length + ' admin)</td><td>' + o.jobs.filter(isOpen).length + '</td><td><span style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="btn ghost sm" data-act="openOrg" data-org="' + o.id + '">Open portal</button><button type="button" class="btn ghost sm" data-act="clientRates" data-org="' + o.id + '">Rates</button><button type="button" class="btn ghost sm" data-act="resetOrgPw" data-org="' + o.id + '">Reset password</button></span></td></tr>';
      }).join('') + '</tbody></table></div></div>' +
      '<form class="card pad" id="addOrg" style="display:grid;gap:12px"><h3 style="font-size:16px">Add a client company</h3><div class="form-row"><label class="f" for="on">Company name<input id="on" type="text" required></label><label class="f" for="oi">Organization ID<input id="oi" type="text" required placeholder="lowercase, no spaces"></label><label class="f" for="op">Starting password<input id="op" type="text" required></label></div>' +
      '<p class="muted" style="margin:0;font-size:13px">First admin for the company</p><div class="form-row"><label class="f" for="an">Name<input id="an" type="text" required></label><label class="f" for="ae">Email<input id="ae" type="email" required></label><label class="f" for="ap">4-digit PIN<input id="ap" type="text" inputmode="numeric" pattern="[0-9]{4}" maxlength="4" required></label></div><div><button type="submit" class="btn">Add company</button></div></form>' +
      '<div class="card"><h2>Recent client activity</h2><ul class="list">' + (acts.length ? acts.slice(0, 6).map(function (a) { return '<li><div class="t"><b style="font-weight:500">' + esc(clientText(a[1].text)) + '</b><span class="mono">' + esc(a[0].name) + ' · ' + fmt(a[1].date) + '</span></div></li>'; }).join('') : '<li class="muted">Nothing yet.</li>') + '</ul></div>';
  }

  function render() {
    document.body.classList.toggle('is-login', S.stage !== 'app'); queueSync();
    document.body.classList.toggle('job-open', S.stage === 'app' && S.view === 'jobs' && S.mobileDetail && !sheetMode());
    var nb = document.getElementById('notebar'); nb.hidden = !(S.demo && S.stage === 'app'); nb.textContent = 'Sample data. Every company, person and file here is made up, and this copy resets from time to time.';
    if (S.stage === 'org') { app.innerHTML = orgView(); return; }
    if (S.stage === 'staff') { app.innerHTML = staffView(); return; }
    if (S.stage === 'pin') { app.innerHTML = pinView(); return; }
    var foc = document.activeElement && (document.activeElement.id === 'q' || document.activeElement.id === 'bq') ? document.activeElement.id : null;
    if (!staff() && (S.view === 'billing' || S.view === 'doc' || S.view === 'staffhome')) S.view = 'dashboard';
    if (staff() && S.view === 'invoices') S.view = 'dashboard';
    if (S.view === 'doc' && !ED) S.view = 'billing';
    var body = { dashboard: dashboard, jobs: jobsView, files: filesView, team: teamView, billing: billingView, doc: docView, staffhome: staffHome, invoices: invoicesView, clients: clientsView }[S.view]();
    var jl = document.getElementById('jlistWrap'), jlTop = jl ? jl.scrollTop : 0; /* keep the job list where it was */
    app.innerHTML = '<div class="shell">' + rail() + '<div class="work" style="position:relative">' + topbar() + '<main class="content">' + body + '</main></div>' + navDock() + '</div>';
    if (jlTop && (jl = document.getElementById('jlistWrap'))) jl.scrollTop = jlTop;
    if (foc) { var q = document.getElementById(foc); q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
    fitPaper(); cmDraw(); railAfter(); flipAfter(); dockAfter(); labelTables(); polishAfter(); S.recAnim = false;
  }

  /* ---------- helpers ---------- */
  function toast(msg) { var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3400); }
  function closeModal() { layer.innerHTML = ''; }
  function openModal(html) { layer.innerHTML = '<div class="veil" id="veil">' + html + '</div>'; var v = document.getElementById('veil'); v.addEventListener('click', function (e) { if (e.target === v) closeModal(); }); var f = layer.querySelector('select, input, button'); if (f) f.focus(); }
  function resetIdle() { clearTimeout(idleT); if (S.stage === 'app') idleT = setTimeout(function () { lock(true); toast('Locked after 10 minutes without activity.'); }, 600000); }
  /* Log out (the button) signs the company out completely. After 10 idle minutes a client is only locked: the company stays
     signed in and the screen goes back to choosing a name and PIN, so a colleague on a shared computer can pick up from there. */
  function lock(idle) {
    var wasStaff = staff(), o = S.org, reps = o ? o.reps.map(function (r) { return { id: r.id, name: r.name, title: r.title }; }) : [], name = o ? o.name : '';
    var done = function () { ORGS = {}; DOCS = []; BLOBS = {}; closeModal(); };
    clearTimeout(pollT); clearTimeout(idleT); S.notif = false; S.rep = null; S.pendingRep = null; S.pin = ''; S.pinErr = ''; S.job = null;
    if (idle && !wasStaff) { apiCall('PATCH', '/api/portal-session', {}).then(function () { done(); S.role = 'client'; S.org = stubOrg(name, reps); S.stage = 'pin'; render(); }); return; }
    apiCall('DELETE', '/api/portal-session', {}).then(function () { done(); S.role = 'client'; S.stage = 'org'; S.org = null; S.orgErr = ''; render(); });
  }

  function download(name, blob) {
    var use = window.claude && window.claude.use;
    if (!use) { var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); return; }
    use.call(window.claude, 'downloads').then(function (dl) {
      if (!dl) { toast('Downloads are not available in this view.'); return; }
      return dl.save({ filename: name, data: blob }).catch(function (e) { if (!e || e.code !== 'declined') toast('Could not save the file.'); });
    });
  }
  function notify(job, text, to, acct) { var n = { id: nid('n'), to: to, job: job, text: text, date: TODAY, read: {} }; if (acct) n.acct = true; S.org.notifs.unshift(n); }
  function recipients(job) { return S.org.reps.filter(function (r) { return r.notify && canSee(r, job); }); }
  function mailBox(from, toHtml, subject, bodyHtml, extra, ccHtml) {
    return '<div class="mail"><div class="h">' + (MAIL_ON ? '<b>Email sent.</b> People with email alerts on get this.' : '<b>Email preview.</b> Email is not set up yet, so this was not sent.') + '</div><div class="h">From: ' + from + '</div><div class="h">To: ' + toHtml + '</div>' + (ccHtml ? '<div class="h">Cc: ' + ccHtml + '</div>' : '') + '<div><b>Subject:</b> ' + esc(subject) + '</div><div>' + bodyHtml + '</div>' + (extra || '') + '</div>';
  }
  var HP_FROM = 'HazPack Compliance &lt;' + FROM_EMAIL + '&gt;';
  function peopleList(rs) { return rs.length ? rs.map(function (r) { return esc(r.name) + ' &lt;' + esc(r.email) + '&gt;'; }).join(', ') : 'nobody has email alerts on for this job'; }

  /* ---------- PDF viewing and route reading ---------- */
  var pdfPromise = null;
  function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (pdfPromise) return pdfPromise;
    pdfPromise = new Promise(function (res, rej) {
      var s = document.createElement('script'); s.src = '/portal/vendor/pdf.min.js';
      s.onload = function () { try { window.pdfjsLib.GlobalWorkerOptions.workerSrc = '/portal/vendor/pdf.worker.min.js'; res(window.pdfjsLib); } catch (e) { rej(e); } };
      s.onerror = function () { pdfPromise = null; rej(new Error('load')); }; document.head.appendChild(s);
    });
    return pdfPromise;
  }
  function withTimeout(p, ms) { return Promise.race([p, new Promise(function (_, rej) { setTimeout(function () { rej(new Error('timeout')); }, ms); })]); }
  function openPdf(blob) { return loadPdfJs().then(function (lib) { return blob.arrayBuffer().then(function (buf) { return lib.getDocument({ data: buf }).promise; }); }); }
  function readText(file) {
    if (/\.pdf$/i.test(file.name)) {
      return withTimeout(openPdf(file).then(function (doc) {
        var n = Math.min(doc.numPages, 4), ps = [];
        for (var i = 1; i <= n; i++) ps.push(doc.getPage(i).then(function (p) { return p.getTextContent(); }).then(function (c) { return c.items.map(function (x) { return x.str; }).join(' '); }));
        return Promise.all(ps).then(function (a) { return a.join(' '); });
      }), 12000);
    }
    return file.text();
  }
  function viewFile(f) {
    ensureBlob(f).then(function (blob) { viewBlob(f, blob); }, function (e) { if (!e || e.message !== 'auth') toast('Could not open that file.'); });
  }
  function viewBlob(f, blob) {
    if (/\.(png|jpe?g|gif|webp)$/i.test(f.name)) { openModal('<div class="modal wide" role="dialog" aria-modal="true" aria-label="' + esc(f.name) + '"><h2 style="overflow-wrap:anywhere">' + esc(f.name) + '</h2><div class="pdfbox"><img alt="' + esc(f.name) + '" src="' + URL.createObjectURL(blob) + '" style="max-width:100%;display:block;margin:auto"></div><div class="row"><button type="button" class="btn ghost" data-act="dl" data-id="' + f.id + '">Download</button><button type="button" class="btn" data-act="closeModal">Close</button></div></div>'); return; }
    openModal('<div class="modal wide" role="dialog" aria-modal="true" aria-label="' + esc(f.name) + '"><h2 style="overflow-wrap:anywhere">' + esc(f.name) + '</h2><div class="pdfbox muted" id="pdfBox">Opening the file</div><div class="row"><button type="button" class="btn ghost" data-act="dl" data-id="' + f.id + '">Download</button><button type="button" class="btn" data-act="closeModal">Close</button></div></div>');
    withTimeout(openPdf(blob), 12000).then(function (doc) {
      var box = document.getElementById('pdfBox'); if (!box) return; box.textContent = ''; box.classList.remove('muted');
      var n = Math.min(doc.numPages, 6), chain = Promise.resolve();
      for (var i = 1; i <= n; i++) (function (num) {
        chain = chain.then(function () { return doc.getPage(num).then(function (p) { var vp = p.getViewport({ scale: 1.4 }), c = document.createElement('canvas'); c.width = vp.width; c.height = vp.height; box.appendChild(c); return p.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise; }); });
      })(i);
      if (doc.numPages > n) chain.then(function () { var m = document.createElement('p'); m.className = 'muted'; m.textContent = 'Showing the first ' + n + ' pages. Download the file to see the rest.'; box.appendChild(m); });
    }).catch(function () { var box = document.getElementById('pdfBox'); if (box) box.textContent = 'This view could not open the PDF here. Use Download to open it on your device.'; });
  }
  function lookup(seg) {
    var best = null;
    AIRPORTS.forEach(function (a) {
      var pos = -1, m = new RegExp('\\b' + a.code + '\\b').exec(seg); if (m) pos = m.index;
      var c = seg.toLowerCase().indexOf(a.city.toLowerCase()); if (c > -1 && (pos < 0 || c < pos)) pos = c;
      if (pos > -1 && (!best || pos < best.pos)) best = { a: a, pos: pos };
    });
    return best && best.a;
  }
  function detectRoute(text) {
    var T = text.replace(/\s+/g, ' ');
    function near(re) { var m = re.exec(T); return m ? lookup(T.slice(m.index + m[0].length, m.index + m[0].length + 90)) : null; }
    var o = near(/(airport|place)\s+of\s+departure\s*:?|departure\s+airport\s*:?/i), de = near(/airport\s+of\s+destination\s*:?|destination\s+airport\s*:?|destination\s*:?/i);
    if (!o && !de) {
      var codes = [], m, re = /\(([A-Z]{3})\)/g; while ((m = re.exec(T))) if (AP[m[1]] && codes.indexOf(m[1]) < 0) codes.push(m[1]);
      if (codes.length >= 2) { o = AP[codes[0]]; de = AP[codes[1]]; }
    }
    return { from: o ? o.code : null, to: de ? de.code : null };
  }
  function apOptions(sel, blank) { return (blank ? '<option value="">Not sure yet</option>' : '') + AIRPORTS.slice().sort(function (a, b) { return a.city.localeCompare(b.city); }).map(function (a) { return '<option value="' + a.code + '"' + (a.code === sel ? ' selected' : '') + '>' + esc(a.city) + ' (' + a.code + ')</option>'; }).join(''); }
  function apDatalist() { return '<datalist id="apList">' + AIRPORTS.slice().sort(function (a, b) { return a.city.localeCompare(b.city); }).map(function (a) { return '<option value="' + esc(a.city) + ' (' + a.code + ')"></option>'; }).join('') + '</datalist>'; }
  function apLabel(code) { var a = AP[code]; return a ? a.city + ' (' + a.code + ')' : ''; }
  function parseAp(v) {
    v = (v || '').trim(); if (!v) return { code: null, text: '' };
    var m = /\(([A-Za-z]{3})\)\s*$/.exec(v), c = m ? m[1].toUpperCase() : (/^[A-Za-z]{3}$/.test(v) ? v.toUpperCase() : null);
    if (c && AP[c]) return { code: c, text: '' };
    var byCity = AIRPORTS.filter(function (a) { return a.city.toLowerCase() === v.toLowerCase(); })[0]; if (byCity) return { code: byCity.code, text: '' };
    return { code: null, text: v };
  }
  function destInput(id, code) { return '<input id="' + id + '" type="text" list="apList" autocomplete="off" placeholder="Type a city or code, or pick from the list" value="' + esc(apLabel(code)) + '">'; }
  function sizeOf(file) { return file.size > 1048576 ? (file.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(file.size / 1024)) + ' KB'; }

  /* ---------- upload ---------- */
  function uploadModal(jobId, type, step) {
    var o = S.org, st = staff(), jobs = vis();
    var opts = jobs.map(function (j) { return '<option value="' + j.id + '"' + (jobId === j.id ? ' selected' : '') + '>' + esc(jn(j)) + ' · ' + esc(j.item) + '</option>'; }).join('');
    if (!jobs.length) { toast('There are no jobs to attach a file to yet.'); return; }
    var types = Object.keys(TYPE_LABEL).filter(function (k) { return st || (k !== 'Invoice' && k !== 'Report'); }).map(function (k) { return '<option value="' + k + '"' + (type === k ? ' selected' : '') + '>' + TYPE_LABEL[k] + '</option>'; }).join('');
    openModal('<form class="modal" id="upForm" role="dialog" aria-modal="true" aria-label="Upload a file"><h2>' + (st ? 'Upload a file for ' + esc(o.name) : 'Upload a file to HazPack') + '</h2>' +
      '<input type="hidden" id="ustep" value="' + esc(step || '') + '"><label class="f" for="us">Job<select id="us">' + opts + '</select></label><label class="f" for="ut">File type<select id="ut">' + types + '</select></label>' +
      '<label class="f" for="uf">File (click or drop it here)<input id="uf" type="file" required></label><label class="f" for="un">Note (optional)<input id="un" type="text" placeholder="For example: Signed, or Corrected quantity"></label>' +
      '<p class="hint">' + (st ? 'People who can see this job and have email alerts on get an email from ' + FROM_EMAIL + '. Everyone else who can see the job gets a portal notification.' : 'HazPack staff are notified as soon as you upload.') + ' Choose Declaration (DGD) and the portal reads the airports from the PDF to draw the route.</p>' +
      '<div class="row"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button type="submit" class="btn" id="upGo">Upload</button></div></form>');
    document.getElementById('upForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var file = document.getElementById('uf').files[0]; if (!file) return;
      var job = getJob(document.getElementById('us').value), type = document.getElementById('ut').value, note = document.getElementById('un').value.trim();
      var btn = document.getElementById('upGo'); btn.disabled = true; btn.textContent = type === 'DGD' ? 'Reading file' : 'Uploading';
      var step = (document.getElementById('ustep') || {}).value || '';
      var readP = type === 'DGD' ? readText(file).then(function (t) { return { det: detectRoute(t) }; }, function () { return { det: { from: null, to: null }, err: true }; }) : Promise.resolve({ det: null });
      Promise.all([readP, sendFile(job.id, type, file, note, false, step)]).then(function (a) {
        if (!a[1]) { var b2 = document.getElementById('upGo'); if (b2) { b2.disabled = false; b2.textContent = 'Upload'; } return; }
        afterUpload(getJob(job.id), a[1], a[0].det, a[0].err);
      });
    });
  }
  function afterUpload(job, rec, det, readErr) {
    var o = S.org, st = staff();
    if (st) { logEv(job, staffName(), 'Uploaded ' + rec.name + ' (' + TYPE_LABEL[rec.type] + ')'); notify(job.id, 'HazPack added ' + rec.name + ' (' + TYPE_LABEL[rec.type] + ') to ' + job.id + '.', 'client'); }
    var route = '';
    if (det) {
      var ok = det.from && det.to;
      route = '<div class="found"><b>' + (ok ? 'Route read from the declaration' : readErr ? 'Could not read this file here' : 'No origin and destination found') + '</b><p class="muted" style="margin:0;font-size:13px">' + (ok ? 'Check the two airports before saving. The map updates when you save.' : 'Pick the airports yourself and the map will use them.') + '</p>' +
        '<div class="g"><label class="f" for="rf">Origin<select id="rf">' + apOptions(job.from || 'LAX', false) + '</select></label><label class="f" for="rt2">Destination' + destInput('rt2', det.to || job.to) + '</label>'+ apDatalist() + '</div>' +
        '<div><button type="button" class="btn sm" data-act="saveRoute" data-job="' + job.id + '">Save route</button></div></div>';
    }
    var mail;
    if (st) mail = mailBox(HP_FROM, peopleList(recipients(job)), 'New file on ' + jn(job) + ': ' + rec.name, 'HazPack added a file to job ' + esc(jn(job)) + ' for ' + esc(o.name) + ': ' + esc(rec.name) + ' (' + TYPE_LABEL[rec.type] + '). Sign in to the client portal to view and download it.');
    else mail = mailBox('HazPack client portal', esc(FROM_EMAIL), 'Client upload on ' + jn(job) + ': ' + rec.name, esc(S.rep.name) + ' of ' + esc(o.name) + ' uploaded ' + esc(rec.name) + ' to job ' + esc(jn(job)) + '.');
    openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="Upload complete"><h2>Uploaded to ' + esc(jn(job)) + '</h2><p class="muted" style="margin:0">' + esc(rec.name) + ' · ' + rec.size + '</p>' + route + mail + '<div class="row"><button type="button" class="btn" data-act="closeModal">Done</button></div></div>');
    S.job = job.id; render();
  }

  /* ---------- job request ---------- */
  function nextJobId() {
    var max = 0; Object.keys(ORGS).forEach(function (k) { ORGS[k].jobs.forEach(function (j) { var n = +j.id.slice(-3); if (n > max) max = n; }); });
    return 'HP-2611-' + ('00' + (max + 1)).slice(-3);
  }
  /* Countries mapped to their main cargo airport, used when a DGD leaves the airport fields blank (they are optional on the IATA form). */
  var COUNTRY_AP = { 'Taiwan': 'TPE', 'Singapore': 'SIN', 'Hong Kong': 'HKG', 'Japan': 'NRT', 'South Korea': 'ICN', 'Korea': 'ICN', 'China': 'PVG', 'Germany': 'FRA', 'United Kingdom': 'LHR', 'U.K.': 'LHR', 'England': 'LHR', 'France': 'CDG', 'Netherlands': 'AMS', 'Belgium': 'BRU', 'Switzerland': 'ZRH', 'Italy': 'FCO', 'Spain': 'MAD', 'Turkey': 'IST', 'Canada': 'YYZ', 'Mexico': 'MEX', 'Brazil': 'GRU', 'Colombia': 'BOG', 'India': 'DEL', 'Thailand': 'BKK', 'Malaysia': 'KUL', 'Australia': 'SYD', 'New Zealand': 'AKL', 'United Arab Emirates': 'DXB', 'U.A.E.': 'DXB', 'Qatar': 'DOH', 'Egypt': 'CAI', 'South Africa': 'JNB', 'Kenya': 'NBO' };
  function inferRoute(T) {
    var best = null;
    AIRPORTS.forEach(function (a) { if (a.country === 'US') return; var i = T.toLowerCase().indexOf(a.city.toLowerCase()); if (i > -1 && (!best || i < best.i)) best = { code: a.code, i: i }; });
    if (best) return best.code;
    Object.keys(COUNTRY_AP).forEach(function (c) { var m = new RegExp('\\b' + c.replace(/\./g, '\\.') + '\\b', 'i').exec(T); if (m && (!best || m.index < best.i)) best = { code: COUNTRY_AP[c], i: m.index }; });
    return best ? best.code : null;
  }
  /* Read what we can from a DGD's text. The IATA form lists the goods as one unlabelled row:
     UN no., proper shipping name, quantity and type of packing, class (subsidiary), packing group, packing instruction.
     Labelled text (name: value) is handled too. Everything is shown to the person to confirm. */
  function extractDgd(text) {
    var T = text.replace(/\s+/g, ' '), r = detectRoute(T), o = { from: r.from, to: r.to, un: '', item: '', cls: '', pg: 'N/A', qty: '', mode: 'Air', inferred: false }, m;
    var row = /\b(UN|ID)\s?(\d{4})\s+(.+?)\s+(\d+\s+[A-Za-z][A-Za-z ,\-]*?\s*x\s*[\d.,]+\s*(?:kg|g|L|mL|ml|lbs?)\b)\s+(\d(?:\.\d)?)(?:\s*\(([\d.,\s]+)\))?(?:\s+(III|II|I)\b)?/.exec(T);
    if (row) { o.un = 'UN' + row[2]; o.item = row[3].trim(); o.qty = row[4].trim(); o.cls = row[5] + (row[6] ? ' (' + row[6].trim() + ')' : ''); o.pg = row[7] || 'N/A'; }
    else {
      var STOP = '(?=\\s+(?:UN\\b|ID\\b|Class\\b|Division\\b|Packing\\b|Quantity\\b|Net\\b|Airport\\b|Proper\\b|Contents\\b|Subsidiary\\b)|$)';
      if ((m = /\b(?:UN|ID)\s?(\d{4})\b/.exec(T))) o.un = 'UN' + m[1];
      if ((m = new RegExp('Proper Shipping Name\\s*:\\s*(.{3,110}?)' + STOP, 'i').exec(T))) o.item = m[1].replace(/^[\s,;:-]+|[\s,;:-]+$/g, '');
      if (!o.item && (m = new RegExp('Contents\\s*:\\s*(.{3,110}?)' + STOP, 'i').exec(T))) o.item = m[1].trim();
      if ((m = /Class(?:\s+or\s+Division)?\s*:\s*(\d(?:\.\d)?)/i.exec(T))) o.cls = m[1];
      if ((m = /Packing\s+Group\s*:\s*(III|II|I|n\/a)\b/i.exec(T))) o.pg = m[1].toUpperCase() === 'N/A' ? 'N/A' : m[1];
      if ((m = new RegExp('Quantity[^:]{0,30}:\\s*(.{3,60}?)' + STOP, 'i').exec(T))) o.qty = m[1].trim();
    }
    if (/aircraft|air transport|IATA|airport/i.test(T)) o.mode = 'Air'; else if (/IMDG|vessel|ocean/i.test(T)) o.mode = 'Ocean'; else if (/49\s?CFR|ground transport/i.test(T)) o.mode = 'Ground';
    if (!o.to && o.mode === 'Air') { var dest = inferRoute(T); if (dest) { o.to = dest; o.inferred = true; } }
    o.from = 'LAX';
    o.found = !!(o.un || o.item || o.from || o.to);
    return o;
  }
  var reqDetect = null;
  function msel() {
    var keys = Object.keys(SVC);
    return '<div class="msel" id="msel"><button type="button" class="msel-b" id="mselB" data-act="mselToggle" aria-expanded="false" aria-haspopup="listbox"><span id="mselT" class="muted">Select one or more services</span><span class="chev" aria-hidden="true"></span></button>' +
      '<div class="msel-p" id="mselP" role="group" aria-label="Services" hidden>' + keys.map(function (k) { return '<label><input type="checkbox" data-svc="' + k + '"><span><b>' + SVC[k] + '</b><small>' + SVC_HELP[k] + '</small></span></label>'; }).join('') + '</div></div>';
  }
  function updateMsel() {
    var on = [].slice.call(document.querySelectorAll('[data-svc]:checked')).map(function (c) { return SVC[c.dataset.svc]; }), t = document.getElementById('mselT'); if (!t) return;
    t.textContent = on.length ? (on.length > 2 ? on.slice(0, 2).join(', ') + ' and ' + (on.length - 2) + ' more' : on.join(', ')) : 'Select one or more services'; t.className = on.length ? '' : 'muted';
  }
  function reviewFields(o) {
    return '<div class="g3"><label class="f" for="rv1">Contents (proper shipping name)<input id="rv1" type="text" value="' + esc(o.item) + '"></label><label class="f" for="rv2">UN number<input id="rv2" type="text" value="' + esc(o.un) + '"></label><label class="f" for="rv3">Class<input id="rv3" type="text" value="' + esc(o.cls) + '"></label>' +
      '<label class="f" for="rv4">Packing group<input id="rv4" type="text" value="' + esc(o.pg) + '"></label><label class="f" for="rv5">Quantity<input id="rv5" type="text" value="' + esc(o.qty) + '"></label><label class="f" for="rv6">Transport<select id="rv6">' + ['Air', 'Ground', 'Ocean'].map(function (x) { return '<option' + (x === o.mode ? ' selected' : '') + '>' + x + '</option>'; }).join('') + '</select></label>' +
      '<label class="f" for="rv7">From (origin airport)<select id="rv7">' + apOptions(o.from || 'LAX', false) + '</select></label><label class="f" for="rv8">To (destination airport)' + destInput('rv8', o.to) + '</label></div>' + apDatalist();
  }
  function requestModal() {
    reqDetect = null;
    openModal('<form class="modal wide" id="reqForm" role="dialog" aria-modal="true" aria-label="New job request"><h2>New job request</h2><p class="muted" style="margin:0">Choose the services you need, add your reference number and upload your DGD. We fill in the rest from the DGD.</p>' +
      '<div class="f"><span id="svl" style="font-size:13px;font-weight:600">Services</span>' + msel() + '</div>' +
      '<label class="f" for="rq7">Your reference number<input id="rq7" type="text" required placeholder="PO or order number"></label>' +
      '<label class="f" for="rq8">Required by (optional)<input id="rq8" type="date" min="' + iso(TODAY) + '"></label>' +
      '<label class="f" for="rq0">DGD (PDF, click or drop it here)<input id="rq0" type="file" accept="application/pdf,.pdf" required></label>' +
      '<div id="found" class="found" hidden></div>' +
      '<label class="f" for="rq9">Additional files (optional, click or drop)<input id="rq9" type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"></label><p class="hint" style="margin-top:-6px">Photos, safety data sheets (SDS) or anything else that helps. You can also add files to the job later.</p>' +
      '<p class="err" id="rqerr" role="alert"></p><div class="row"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button>' + ihb('Submit request', 'type="submit" id="rqGo"', '') + '</div></form>');
    document.getElementById('rq0').addEventListener('change', function () {
      var f = this.files[0], box = document.getElementById('found'); reqDetect = null; if (!f) { box.hidden = true; return; }
      box.hidden = false; box.innerHTML = '<b>Reading your DGD</b><p class="muted" style="margin:0;font-size:13px">This takes a few seconds.</p>';
      reqDetect = readText(f).then(function (t) { return extractDgd(t); }, function () { return { from: null, to: null, un: '', item: '', cls: '', pg: 'N/A', qty: '', mode: 'Air', found: false, failed: true }; }).then(function (o) {
        box.innerHTML = '<b>' + (o.found ? 'Here is what we read from your DGD' : o.failed ? 'We could not read this file here' : 'We could not find the details in this file') + '</b><p class="muted" style="margin:0;font-size:13px">' + (o.found ? (o.inferred ? 'This DGD has no destination airport written on it, so we used the consignee\'s address. Please check the destination airport. ' : 'Check it over and fix anything that looks wrong. ') + 'HazPack reviews every request.' : 'You can still submit. Fill in what you can below and HazPack will complete the rest.') + '</p>' + reviewFields(o); return o;
      });
    });
    document.getElementById('reqForm').addEventListener('submit', function (e) {
      e.preventDefault();
      var svc = [].slice.call(document.querySelectorAll('[data-svc]:checked')).map(function (c) { return c.dataset.svc; }), err = document.getElementById('rqerr');
      if (!svc.length) { err.textContent = 'Choose at least one service.'; document.getElementById('mselB').focus(); return; }
      var dgd = document.getElementById('rq0').files[0]; if (!dgd) { err.textContent = 'Upload your DGD.'; return; }
      var go = document.getElementById('rqGo'); go.disabled = true; go.querySelectorAll('.ihb-t').forEach(function (t) { t.textContent = 'Submitting'; });
      Promise.resolve(reqDetect).then(function () {
        var v = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
        var item = v('rv1') || 'Shipment, details to be confirmed', dstP = parseAp(v('rv8'));
        var fl = document.getElementById('rq9').files, list = [{ type: 'DGD', file: dgd, note: 'Sent with the request' }];
        for (var i = 0; i < fl.length; i++) {
          var nm = fl[i].name, isImg = /\.(png|jpe?g|gif|webp|heic)$/i.test(nm) || /^image\//.test(fl[i].type), isSds = /sds|safety/i.test(nm);
          list.push({ type: isImg ? 'Photo' : 'Other', file: fl[i], note: isSds ? 'Safety data sheet' : 'Sent with the request' });
        }
        clientAct({ action: 'requestJob', svc: svc, item: item, un: v('rv2'), cls: v('rv3'), pg: v('rv4'), qty: v('rv5'), mode: v('rv6') || 'Air', from: v('rv7') || 'LAX', to: dstP.code, toText: dstP.text, ref: v('rq7'), req: v('rq8') }, function (res) {
        sendFiles(res.jobId, list, true).then(function () {
        var j = getJob(res.jobId);
        S.view = 'jobs'; S.job = j.id; S.jobTab = 'overview'; S.f = 'all'; S.q = ''; S.fp = 'all'; S.mobileDetail = true; render();
        openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="Request submitted"><h2>Request submitted</h2><p style="margin:0">Your request is <b class="mono">' + esc(jn(j)) + '</b>. HazPack will review it and open the job. You can follow it under Jobs.</p>' +
          mailBox('HazPack client portal', esc(FROM_EMAIL), 'New job request ' + jn(j) + ' from ' + S.org.name, esc(S.rep.name) + ' requested: ' + svc.map(function (k) { return SVC[k]; }).join(', ') + '. Reference ' + esc(j.ref) + '. DGD attached: ' + esc(dgd.name) + '.') +
          mailBox(HP_FROM, esc(S.rep.name) + ' &lt;' + esc(S.rep.email) + '&gt;', 'We received your request ' + j.id, 'Thanks. HazPack received your job request and will open the job shortly. You can follow it in the client portal.') + '<div class="row"><button type="button" class="btn" data-act="closeModal">Done</button></div></div>');
        });
        });
        go.disabled = false; go.textContent = 'Submit request';
      });
    });
  }

  /* ---------- billing: quotes and invoices (HazPack staff only) ----------
     Ported from the standalone "HazPack Quote and Invoice" page. Lives inside the portal closure, so it
     shares ORGS, S, esc, openModal, toast and download. Injected into portal.js by build.py. */
  var STAFF_NAMES = { 'James Whitty': 'DG Specialist / Owner', 'Alex Walsh': 'DG Specialist / Owner' };
  /* Bank numbers are placeholders in the prototype. In the real build they come from server settings. */
  var BANK = { bank: 'Chase Bank', name: 'HazPack Compliance Solutions LLC', acct: 'Added when live', ach: 'Added when live', wire: 'Added when live' };
  var TARIFF0 = [
    { id: 'attend', label: 'Attendance', note: 'Site visit / call-out', unit: 'per visit', rate: 55 },
    { id: 'dgd', label: 'DGD', note: 'Dangerous Goods Declaration prepared & certified', unit: 'per DGD', rate: 65 },
    { id: 'pack1', label: 'UN Spec Packaging (1–10)', note: 'Packaging — Tier 1 rate, pieces 1–10', unit: 'per piece', rate: 65 },
    { id: 'pack2', label: 'UN Spec Packaging (11–30)', note: 'Packaging — Tier 2 rate, pieces 11–30', unit: 'per piece', rate: 55 },
    { id: 'pack3', label: 'UN Spec Packaging (31+)', note: 'Packaging — Tier 3 rate, every piece beyond 30', unit: 'per piece', rate: 45 },
    { id: 'dgd_multi', label: 'DG Checklist (multi-DGD)', note: 'Multiple DGDs on same booking', unit: 'per checklist', rate: 45 },
    { id: 'insp1', label: 'Check / Inspect (1–10)', note: 'DG inspection — Tier 1 rate, pieces 1 through 10', unit: 'per piece', rate: 10 },
    { id: 'insp2', label: 'Check / Inspect (11–30)', note: 'DG inspection — Tier 2 rate, pieces 11 through 30', unit: 'per piece', rate: 7.5 },
    { id: 'insp3', label: 'Check / Inspect (31+)', note: 'DG inspection — Tier 3 rate, pieces 31+', unit: 'per piece', rate: 5 },
    { id: 'label1', label: 'Marks & Label (1–10)', note: 'Hazard marks and labels — Tier 1, pieces 1–10', unit: 'per piece', rate: 10 },
    { id: 'label2', label: 'Marks & Label (11–30)', note: 'Hazard marks and labels — Tier 2, pieces 11–30', unit: 'per piece', rate: 7.5 },
    { id: 'label3', label: 'Marks & Label (31+)', note: 'Hazard marks and labels — Tier 3, pieces 31+', unit: 'per piece', rate: 5 },
    { id: 'overpack', label: 'Overpack', note: 'Overpack assembly & palletizing. Excludes HT pallets', unit: 'per pallet', rate: 65 },
    { id: 'pallet', label: 'Pallet', note: 'Pallet supply', unit: 'each', rate: 45 },
    { id: 'wait', label: 'Wait Time', note: 'Wait time beyond first 15 min', unit: 'per 30 min', rate: 45 }
  ];
  var ON0 = { attend: 1, dgd: 1, insp1: 1, label1: 1 };
  var TARIFF = JSON.parse(JSON.stringify(TARIFF0));
  var ED = null;

  function iso(dt) { return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2) + '-' + ('0' + dt.getDate()).slice(-2); }
  function isoDate(s) { return s ? new Date(s + 'T12:00:00') : null; }
  function mdy(s) { return s ? s.slice(5, 7) + '/' + s.slice(8, 10) + '/' + s.slice(0, 4) : ''; }
  function addDays(s, n) { var dt = isoDate(s); if (!dt) return ''; dt.setDate(dt.getDate() + n); return iso(dt); }
  function longDate(s) { var dt = isoDate(s); return dt ? dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : ''; }
  function money(n) { return '$' + (n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function tRow(id) { return TARIFF.filter(function (t) { return t.id === id; })[0]; }
  function line(id, qty) { var t = tRow(id); return { id: id, label: t.label, note: t.note, unit: t.unit, rate: t.rate, qty: qty, noteOverride: '' }; }
  function lateRate(l) { return l === true ? 1.5 : (parseFloat(l) || 0); }
  function sums(rows, custom, disc, late) {
    var sub = 0; rows.forEach(function (r) { if (r.active !== false) sub += (r.qty || 0) * r.rate; }); custom.forEach(function (c) { sub += (c.qty || 0) * (c.rate || 0); });
    var d = sub * (parseFloat(disc) || 0) / 100, after = sub - d, lf = after * lateRate(late) / 100;
    return { sub: sub, d: d, lf: lf, total: after + lf };
  }
  function docTotal(x) { return sums(x.lines, x.custom, x.disc, x.late).total; }
  function dueOf(x) { return addDays(x.date, 15); }
  function isOverdue(x) { return x.type === 'Invoice' && x.status === 'Unpaid' && dueOf(x) && dueOf(x) < iso(TODAY); }

  /* sample documents, matching the invoices already on the sample jobs */
  var DOCS = [];
  var billF = { type: '', st: [], q: '' }, armDel = null, stOpen = false;

  function docLabel(x) { return x.type === 'Invoice' ? 'Invoice' : 'Quote'; }
  function docOrgName(x) { return x.company || x.name || '—'; }

  /* Quotes and invoices each keep their own counter per month (Q-2026-11-HP-001, I-2026-11-HP-001).
     The next number follows the highest one on a saved document. SEQ also holds the highest number of any deleted document
     that had been sent to the client (they already have it), kept on the server, so that number is never given out again.
     Deleting an unsent document, or renumbering and resending one, frees the number. */
  var SEQ = {}, MAIL_ON = false;
  function docStem(type, date) { return (type === 'Invoice' ? 'I' : 'Q') + '-' + date.slice(0, 4) + '-' + date.slice(5, 7) + '-HP-'; }
  function nextDocNum(type, date) {
    var stem = docStem(type, date), n = SEQ[stem.slice(0, -4)] || 0;
    DOCS.forEach(function (x) { if (x.docNum.indexOf(stem) === 0) n = Math.max(n, parseInt(x.docNum.slice(stem.length), 10) || 0); });
    return stem + ('00' + (n + 1)).slice(-3);
  }
  /* A new quote or invoice starts with its number already filled in. It follows the type and date until someone types their own. */
  function autoNum(e) { if (!e.id && e.autoNum !== false) e.docNum = nextDocNum(e.type, e.date); }
  function noteDocNum(num) { var m = /^([QI]-\d{4}-\d{2})-HP-(\d+)$/.exec(num || ''); if (m) SEQ[m[1]] = Math.max(SEQ[m[1]] || 0, parseInt(m[2], 10)); }

  /* ----- editor state ----- */
  function rateFor(org, id) { var o = org && org.rates && org.rates[id]; return (o !== undefined && o !== null && o !== '') ? o : tRow(id).rate; }
  function customRates(org) { return org && org.rates ? Object.keys(org.rates).length : 0; }
  function ratesNote(org) { return org ? (customRates(org) ? 'Using the ' + esc(org.name) + ' rates (' + customRates(org) + ' custom). ' : 'No custom rates for ' + esc(org.name) + ', so standard rates apply. ') : ''; }
  function blankRows(org) { return TARIFF.map(function (t) { return { id: t.id, label: t.label, note: t.note, unit: t.unit, rate: rateFor(org, t.id), active: !!ON0[t.id], qty: 1, noteOverride: '' }; }); }
  /* Billing details saved on the client company fill the Bill to section. Without them, the requester's name and email are used. */
  function personBill(org, rep) { var b = org.billing || {}; return { company: org.name, name: rep.name, email: rep.email, phone: rep.phone || b.phone || '', addr: rep.addr || b.addr || '', city: rep.city || b.city || '' }; }
  function putBill(e, v) { e.company = v.company; e.name = v.name; e.email = v.email; e.phone = v.phone || ''; e.addr = v.addr || ''; e.city = v.city || ''; }
  function applyBill(e, org, rep) {
    if (org && org.billing) { putBill(e, org.billing); e.company = org.name; }
    else if (org) putBill(e, rep ? personBill(org, rep) : { company: org.name, name: '', email: '' });
  }
  function tiers3(n) { return [Math.min(n, 10), n > 10 ? Math.min(n - 10, 20) : 0, n > 30 ? n - 30 : 0]; }
  function pieceCount(job) { var m = /^\s*(\d+)/.exec(job.qty || ''); return m ? Math.max(1, parseInt(m[1], 10)) : 1; }
  /* Tick the rate rows that match the job's services and piece count. Returns false when nothing matches. */
  function prefillFromJob(e, job) {
    var svc = job.svc || [], n = pieceCount(job), t = tiers3(n), on = {}, any = false, has = function (k) { return svc.indexOf(k) > -1; };
    var set = function (id, q) { on[id] = q; any = true; }, tier = function (ids) { ids.forEach(function (id, i) { if (t[i]) set(id, t[i]); }); };
    if (has('dgd')) set('dgd', 1);
    if (has('pack')) { tier(['pack1', 'pack2', 'pack3']); tier(['label1', 'label2', 'label3']); }
    if (has('insp')) tier(['insp1', 'insp2', 'insp3']);
    if (has('pack') || has('insp')) set('attend', 1);
    if (!any) return false;
    e.rows.forEach(function (r) { r.active = on[r.id] !== undefined; r.qty = r.active ? on[r.id] : 1; });
    e.split = String(n); return true;
  }
  function edNew(type, orgId, jobId) {
    var org = ORGS[orgId] || null, job = org && jobId ? org.jobs.filter(function (j) { return j.id === jobId; })[0] : null;
    var rep = org ? (job ? org.reps.filter(function (r) { return r.id === job.rep; })[0] : null) || org.reps.filter(function (r) { return r.admin; })[0] : null;
    var e = { id: null, type: type, orgId: orgId || '', repId: rep ? rep.id : '', jobId: jobId || '', name: '', company: '', addr: '', city: '', email: '', phone: '', bkg: job ? job.ref : '', date: iso(TODAY), docNum: '', payRcvd: '', preparedBy: 'James Whitty', issuedBy: 'James Whitty', rows: blankRows(org), custom: [], disc: '', late: '', notes: '', status: type === 'Invoice' ? 'Unpaid' : 'Open', datePaid: '', fileId: '', split: '', decision: null };
    if (org) { applyBill(e, org, rep); if (org.billing) e.repId = ''; }
    if (job && prefillFromJob(e, job)) e.prefilled = true;
    autoNum(e);
    return e;
  }
  function edFromDoc(x) {
    var e = JSON.parse(JSON.stringify(x));
    e.rows = TARIFF.map(function (t) {
      var l = x.lines.filter(function (y) { return y.id === t.id; })[0];
      return l ? { id: l.id, label: l.label, note: l.note, unit: l.unit, rate: l.rate, active: true, qty: l.qty, noteOverride: l.noteOverride || '' } : { id: t.id, label: t.label, note: t.note, unit: t.unit, rate: t.rate, active: false, qty: 1, noteOverride: '' };
    });
    delete e.lines; e.split = ''; return e;
  }
  function edRecord(e) {
    var lines = e.rows.filter(function (r) { return r.active; }).map(function (r) { return { id: r.id, label: r.label, note: r.note, unit: r.unit, rate: r.rate, qty: r.qty, noteOverride: r.noteOverride }; });
    return { id: e.id, docNum: e.docNum, type: e.type, orgId: e.orgId, repId: e.repId, jobId: e.jobId, name: e.name, company: e.company, addr: e.addr, city: e.city, email: e.email, phone: e.phone, bkg: e.bkg, date: e.date, payRcvd: e.payRcvd, preparedBy: e.preparedBy, issuedBy: e.issuedBy, lines: lines, custom: JSON.parse(JSON.stringify(e.custom)), disc: e.disc, late: e.late, notes: e.notes, status: e.status, datePaid: e.datePaid, fileId: e.fileId, fromQuote: e.fromQuote || '', decision: e.decision || null };
  }
  function edSave() {
    var e = ED;
    if (!e.company && !e.name) { toast('Add a Bill To name or company before saving.'); return null; }
    autoNum(e);
    if (!e.docNum) e.docNum = nextDocNum(e.type, e.date);
    if (DOCS.some(function (x) { return x.docNum === e.docNum && x.id !== e.id; })) { toast('Another document already uses ' + e.docNum + '.'); return null; }
    var rec = edRecord(e);
    if (e.id) DOCS[DOCS.map(function (x) { return x.id; }).indexOf(e.id)] = rec; else { rec.id = e.id = nid('d'); DOCS.unshift(rec); }
    if (e.fromQuote) { var q0 = DOCS.filter(function (x) { return x.id === e.fromQuote; })[0]; if (q0 && q0.status === 'Open') q0.status = 'Accepted'; }
    return rec;
  }

  /* ----- the paper (one function draws both the live editor and the PDF) ----- */
  function fld(label, key, value, print, extra) {
    var type = key === 'date' ? 'date' : key === 'email' ? 'email' : 'text';
    return '<div class="fl"><span>' + label + '</span>' + (print ? '<span class="v">' + esc(key === 'date' ? mdy(value) : value) + '</span>' : '<input type="' + type + '" data-ed="' + key + '" value="' + esc(value) + '"' + (extra || '') + '>') + '</div>';
  }
  function staffSel(key, value, print) {
    if (print) return '<span class="v">' + esc(value) + '</span>';
    return '<select data-ed="' + key + '">' + Object.keys(STAFF_NAMES).map(function (n) { return '<option' + (n === value ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select>';
  }
  function paperHtml(e, print) {
    var inv = e.type === 'Invoice', s = sums(e.rows, e.custom, e.disc, e.late), n = 0, id = function (x) { return print ? '' : ' id="' + x + '"'; };
    var rows = e.rows.map(function (r, i) {
      if (print && !r.active) return '';
      if (r.active) n++;
      var amt = r.active ? money(r.qty * r.rate) : '—';
      return '<tr class="' + (r.active ? 'on' : 'off') + '">' + (print ? '' : '<td class="c"><input type="checkbox" data-act="edToggle" data-i="' + i + '"' + (r.active ? ' checked' : '') + ' aria-label="Include ' + esc(r.label) + '"></td>') +
        '<td class="c g">' + (r.active ? n : '') + '</td><td><b>' + esc(r.label) + '</b>' + (print ? '' : '<small>' + esc(r.note) + '</small>') + '</td>' +
        '<td class="nt">' + (print ? '<i>' + esc(r.noteOverride || r.note) + '</i>' : '<textarea rows="2" data-er="' + i + ':noteOverride" placeholder="' + esc(r.note) + '">' + esc(r.noteOverride) + '</textarea>') + '</td>' +
        '<td class="c">' + (print ? r.qty : '<input type="number" min="0" step="0.5" value="' + r.qty + '" data-er="' + i + ':qty"' + (r.active ? '' : ' disabled') + '>') + '</td><td class="c g">' + esc(r.unit) + '</td><td class="r">' + money(r.rate) + '</td><td class="r"><b' + (print ? '' : ' id="ea' + i + '"') + '>' + amt + '</b></td></tr>';
    }).join('');
    var cust = e.custom.map(function (c, i) {
      return '<tr><td>' + (print ? esc(c.desc) : '<input type="text" data-ec="' + i + ':desc" value="' + esc(c.desc) + '" placeholder="Service description">') + '</td><td class="nt">' + (print ? '<i>' + esc(c.note) + '</i>' : '<input type="text" data-ec="' + i + ':note" value="' + esc(c.note) + '" placeholder="Note">') + '</td>' +
        '<td class="c">' + (print ? c.qty : '<input type="number" min="0" step="0.5" data-ec="' + i + ':qty" value="' + c.qty + '">') + '</td><td class="c">' + (print ? esc(c.unit) : '<input type="text" data-ec="' + i + ':unit" value="' + esc(c.unit) + '" placeholder="each">') + '</td>' +
        '<td class="r">' + (print ? money(c.rate) : '<input type="number" min="0" step="0.01" data-ec="' + i + ':rate" value="' + c.rate + '">') + '</td><td class="r"><b' + (print ? '' : ' id="ec' + i + '"') + '>' + money(c.qty * c.rate) + '</b></td>' + (print ? '' : '<td class="c"><button type="button" class="x" data-act="edDelLine" data-i="' + i + '" aria-label="Remove line">&times;</button></td>') + '</tr>';
    }).join('');
    var custBlock = (print && !e.custom.length) ? '' : '<div class="sec"><h5>Additional lines</h5><table class="pt cu"><thead><tr><th class="l">Description</th><th class="l">Notes</th><th>Qty</th><th>Unit</th><th class="r">Rate</th><th class="r">Line total</th>' + (print ? '' : '<th></th>') + '</tr></thead><tbody>' + cust + '</tbody></table>' + (print ? '' : '<button type="button" class="addln" data-act="edAddLine">+ Add line</button>') + '</div>';
    var due = dueOf(e);
    var tail = '';
    if (inv) {
      tail = '<div class="sec"><h5>Payment terms</h5><table class="pt tm"><thead><tr><th class="l">Payment window</th><th>Late fee</th><th class="l">Notes</th></tr></thead><tbody><tr><td>Within 15 days of invoice date</td><td class="c">0.0%</td><td><i>No late fee, standard terms.</i></td></tr><tr><td>Days 16 through 30</td><td class="c o">1.5%</td><td><i>1.5% late fee applied to subtotal.</i></td></tr><tr><td>Day 31 onwards</td><td class="c o">2.0%</td><td><i>2.0% late fee applied to subtotal.</i></td></tr></tbody></table></div>' +
        '<div class="sec"><h5>ACH / electronic payment <em>(preferred)</em></h5><table class="pt ach"><thead><tr><th class="l">Bank</th><th class="l">Account name</th><th class="l">Account #</th><th class="l">ACH routing</th><th class="l">Wire routing</th></tr></thead><tbody><tr><td><b>' + esc(BANK.bank) + '</b></td><td><b>' + esc(BANK.name) + '</b></td><td><b>' + esc(BANK.acct) + '</b></td><td><b>' + esc(BANK.ach) + '</b></td><td><b>' + esc(BANK.wire) + '</b></td></tr></tbody></table></div>' +
        '<div class="sec"><h5>Remittance and general terms</h5><ul><li>Payment due within 15 days of invoice date. Late fees apply per the schedule above, assessed on the outstanding balance.</li><li>Remittance email: <b>accounts@hazpackcompliance.com</b> &middot; AR contact: James Whitty, +1 (310) 425-3712.</li><li>Quantity and rate reference the original quote unless otherwise noted. Any per-line override is shown in the Qty column.</li><li>Disputes must be raised in writing within 7 days of invoice receipt.</li></ul></div>';
    }
    var sig = inv ? '<div class="sigs"><div><b>Approved for payment</b><p>Signature: ________________________ &nbsp; Date: __________</p></div><div><b>Issued by HazPack Compliance Solutions</b><p>' + staffSel('issuedBy', e.issuedBy, print) + ' &middot; ' + esc(STAFF_NAMES[e.issuedBy] || 'DG Specialist / Owner') + '</p><p>Signature: ________________________ &nbsp; Date: __________</p></div></div>' : '';
    return '<div class="paper' + (print ? ' print' : '') + '"><div class="p-head"><img src="' + LOGO_L + '" alt="HazPack Compliance"><div class="co"><b>HazPack Compliance Solutions LLC</b>Dangerous Goods Compliance &amp; Inspection Services<br>' + esc(FROM_EMAIL) + ' &nbsp;|&nbsp; +1 (310) 425-3712<br>www.hazpackcompliance.com &nbsp;|&nbsp; Los Angeles, CA<em class="cert">IATA DGR Certified &nbsp;&middot;&nbsp; IMDG Certified &nbsp;&middot;&nbsp; 49 CFR Certified</em></div></div>' +
      '<div class="p-title"><span>' + (inv ? 'INVOICE' : 'QUOTE') + '</span></div>' +
      '<div class="p-row"><div class="p-box"><h4>Bill to</h4><div class="bd">' + fld('Name', 'name', e.name, print) + fld('Company', 'company', e.company, print) + fld('Address', 'addr', e.addr, print) + fld('City / State', 'city', e.city, print) + fld('Email', 'email', e.email, print) + fld('Phone', 'phone', e.phone, print) + fld('BKG #', 'bkg', e.bkg, print) + '</div></div>' +
      '<div class="p-box nw"><h4>Document details</h4><div class="bd">' + fld('Doc #', 'docNum', e.docNum, print, ' placeholder="' + nextDocNum(e.type, e.date) + '" title="The next number for this month. Change it only to use a different number."' + id('edNum')) + fld('Date', 'date', e.date, print) +
      (inv ? '<div class="fl"><span>Due date</span><span class="v o"' + id('edDue') + '>' + esc(longDate(due)) + '</span></div>' + fld('Payment rcvd', 'payRcvd', e.payRcvd, print, ' placeholder="e.g. 06/12/2026"') : '') + '<div class="fl"><span>Prepared by</span>' + staffSel('preparedBy', e.preparedBy, print) + '</div></div></div></div>' +
      '<div class="sec rel">' + (print ? '' : '<div class="wm"><img src="' + LOGO_L + '" alt=""></div>') + '<table class="pt sv"><thead><tr>' + (print ? '' : '<th></th>') + '<th>#</th><th class="l">Service</th><th class="l">Notes</th><th>Qty</th><th>Unit</th><th class="r">Rate</th><th class="r">Line total</th></tr></thead><tbody>' + rows + '</tbody></table></div>' + custBlock +
      '<div class="tots">' + (print ? '' : '<button type="button" class="latebtn" data-act="edLate">' + (!e.late ? '+ Late fee' : lateRate(e.late) === 1.5 ? 'Late fee 1.5%, switch to 2.0%' : 'Late fee 2.0%, remove') + '</button>') + '<table><tr><td>Subtotal</td><td' + id('edSub') + '>' + money(s.sub) + '</td></tr><tr><td>Discount ' + (print ? esc(e.disc || '0') : '<input type="number" min="0" max="100" step="0.5" data-ed="disc" value="' + esc(e.disc) + '" placeholder="0">') + '%</td><td' + id('edDisc') + '>' + (s.d > 0 ? '−' + money(s.d) : '—') + '</td></tr>' +
      (e.late ? '<tr><td>Late fee (' + lateRate(e.late) + '%)</td><td' + id('edLate') + '>' + money(s.lf) + '</td></tr>' : '') + '<tr class="gr"><td>TOTAL DUE (USD)</td><td' + id('edTot') + '>' + money(s.total) + '</td></tr></table></div>' +
      '<div class="push"></div>' + tail +
      '<div class="sec nts"><h5>Notes</h5>' + (print ? '<p><i>' + esc(e.notes) + '</i></p>' : '<textarea rows="2" data-ed="notes" placeholder="Additional notes, AWB or booking reference numbers, special instructions">' + esc(e.notes) + '</textarea>') + '</div>' + sig +
      '<div class="pfoot"><b>HazPack Compliance Solutions LLC</b> &nbsp;|&nbsp; ' + esc(FROM_EMAIL) + ' &nbsp;|&nbsp; +1 (310) 425-3712 &nbsp;|&nbsp; www.hazpackcompliance.com<br><span class="cert-l">IATA DGR Certified &nbsp;&middot;&nbsp; IMDG Certified &nbsp;&middot;&nbsp; 49 CFR Certified &nbsp;&middot;&nbsp; IATA DGR 67th Edition &nbsp;&middot;&nbsp; Los Angeles, CA</span></div></div>';
  }
  function edRefresh() {
    var s = sums(ED.rows, ED.custom, ED.disc, ED.late), set = function (id, t) { var el = document.getElementById(id); if (el) el.textContent = t; };
    ED.rows.forEach(function (r, i) { set('ea' + i, r.active ? money(r.qty * r.rate) : '—'); });
    ED.custom.forEach(function (c, i) { set('ec' + i, money(c.qty * c.rate)); });
    set('edSub', money(s.sub)); set('edDisc', s.d > 0 ? '−' + money(s.d) : '—'); set('edLate', money(s.lf)); set('edTot', money(s.total)); set('edDue', longDate(dueOf(ED))); var nb = document.getElementById('edNum'); if (nb) { autoNum(ED); nb.value = ED.docNum; nb.placeholder = nextDocNum(ED.type, ED.date); }
  }

  /* ----- screens ----- */
  function statusSel(x) {
    var od = isOverdue(x), shown = od ? 'Overdue' : x.status;
    var opts = x.type === 'Invoice' ? (od ? ['Unpaid', 'Overdue', 'Paid', 'Cancelled'] : ['Unpaid', 'Paid', 'Cancelled']) : ['Open', 'Accepted', 'Declined'];
    return '<select class="stsel ' + shown.toLowerCase() + '" data-act="docStatus" data-id="' + x.id + '" aria-label="Status of ' + esc(x.docNum) + '">' + opts.map(function (o) { return '<option' + (o === shown ? ' selected' : '') + '>' + o + '</option>'; }).join('') + '</select>';
  }
  var billSort = { k: 'date', dir: -1 }, selMode = false, sel = {}, billIds = [];
  function shownStatus(x) { return isOverdue(x) ? 'Overdue' : x.status; }
  function billVal(x, k) {
    switch (k) { case 'docNum': return x.docNum; case 'type': return x.type; case 'date': return x.date; case 'client': return docOrgName(x).toLowerCase(); case 'job': return x.jobId || ''; case 'amount': return docTotal(x); case 'status': return shownStatus(x); case 'due': return x.type === 'Invoice' ? dueOf(x) : ''; }
    return '';
  }
  function sth(label, k) { var on = billSort.k === k; return '<th aria-sort="' + (on ? (billSort.dir > 0 ? 'ascending' : 'descending') : 'none') + '"><button type="button" class="thb" data-act="docSort" data-k="' + k + '">' + label + (on ? (billSort.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>'; }
  function stSelHtml() {
    var on = billF.st, label = !on.length ? 'All statuses' : on.length <= 2 ? on.join(', ') : on.length + ' statuses';
    return '<div class="msel st"><button type="button" class="msel-b" data-act="stToggle" aria-expanded="' + stOpen + '" aria-haspopup="listbox"><span' + (on.length ? '' : ' class="muted"') + '>' + label + '</span><span class="chev" aria-hidden="true"></span></button>' +
      (stOpen ? '<div class="msel-p" role="group" aria-label="Statuses">' + ['Unpaid', 'Paid', 'Overdue'].map(function (o) { return '<label><input type="checkbox" data-act="stOne" data-v="' + o + '"' + (on.indexOf(o) > -1 ? ' checked' : '') + '><span><b>' + o + '</b></span></label>'; }).join('') + (on.length ? '<button type="button" class="linkbtn" data-act="stClear" style="padding:6px 10px">Clear</button>' : '') + '</div>' : '') + '</div>';
  }
  document.addEventListener('click', function (e) { if (stOpen && !e.target.closest('.msel.st')) { stOpen = false; render(); } });
  function billingView() {
    var inv = DOCS.filter(function (x) { return x.type === 'Invoice'; }), tot = 0, paid = 0, out = 0, od = 0, days = [], thisM = 0, lastM = 0, nThis = 0;
    var ym = iso(TODAY).slice(0, 7), lm = iso(new Date(TODAY.getFullYear(), TODAY.getMonth() - 1, 1)).slice(0, 7);
    inv.forEach(function (x) {
      var t = docTotal(x); tot += t;
      if (x.status === 'Paid') { paid += t; if (x.datePaid) days.push((isoDate(x.datePaid) - isoDate(x.date)) / 864e5); } else if (x.status !== 'Cancelled') { out += t; if (isOverdue(x)) od++; }
      if (x.status !== 'Cancelled') { if (x.date.slice(0, 7) === ym) { thisM += t; nThis++; } else if (x.date.slice(0, 7) === lm) lastM += t; }
    });
    var avg = days.length ? (days.reduce(function (a, b) { return a + b; }, 0) / days.length) : null, openQ = DOCS.filter(function (x) { return x.type === 'Quote' && x.status === 'Open'; }).length;
    var q = billF.q.toLowerCase();
    var list = DOCS.filter(function (x) { return (!billF.type || x.type === billF.type) && (!billF.st.length || billF.st.some(function (s) { return shownStatus(x) === s || (s === 'Unpaid' && x.type === 'Invoice' && x.status === 'Unpaid'); })) && (!q || (docOrgName(x) + x.docNum + x.bkg + x.jobId).toLowerCase().indexOf(q) > -1); });
    list.sort(function (a, b) { var A = billVal(a, billSort.k), B = billVal(b, billSort.k), c = typeof A === 'number' ? A - B : String(A).localeCompare(String(B)); return (c || b.date.localeCompare(a.date)) * (c ? billSort.dir : 1); });
    Object.keys(sel).forEach(function (id) { if (!list.some(function (x) { return x.id === id; })) delete sel[id]; });
    billIds = list.map(function (x) { return x.id; }); var nSel = Object.keys(sel).length;
    var rows = list.map(function (x) {
      var t = docTotal(x);
      return '<tr class="click' + (selMode && sel[x.id] ? ' sel' : '') + '" data-act="' + (selMode ? 'bulkRow' : 'docOpen') + '" data-id="' + x.id + '">' + (selMode ? '<td class="cb"><input type="checkbox" data-act="bulkOne" data-id="' + x.id + '"' + (sel[x.id] ? ' checked' : '') + ' aria-label="Select ' + esc(x.docNum) + '"></td>' : '') + '<td class="mono nw"><b>' + esc(x.docNum) + '</b>' + (x.decision ? '<br><span class="muted" style="font-size:12px;font-family:var(--font-sans)">' + x.decision.action + ' by ' + esc(x.decision.by) + ', ' + mdy(x.decision.when) + '</span>' : '') + '</td><td>' + x.type + '</td><td>' + mdy(x.date) + '</td><td class="nw">' + esc(docOrgName(x)) + '</td><td class="mono nw">' + esc(jnId(x.jobId) || '—') + '</td><td>' + money(t) + '</td><td>' + statusSel(x) + '</td>' +
        '<td>' + (x.type === 'Invoice' ? mdy(dueOf(x)) : '—') + '</td><td>' + (x.datePaid ? mdy(x.datePaid) : '—') + '</td><td>' + (x.fileId ? '<span class="pill ok">Sent</span>' : '<span class="muted">Not sent</span>') + '</td>' +
        '<td class="go nw">' + (x.type === 'Quote' && x.status !== 'Declined' ? '<button type="button" class="linkbtn mk" data-act="docToInvoice" data-id="' + x.id + '">Make invoice</button>' : '') + '<span class="vw">Open &rsaquo;</span></td></tr>';
    }).join('');
    var card = function (k, v, s, cls) { return '<div class="card stat' + (cls || '') + '"><span class="k">' + k + '</span><span class="v">' + v + '</span><span class="s">' + s + '</span></div>'; };
    return '<div class="stats">' + card('Total invoiced', money(tot), inv.length + ' invoices') + card('Invoiced this month', money(thisM), 'Last month ' + money(lastM)) + card('Paid', money(paid), 'marked paid') + card('Outstanding', money(out), od ? od + ' overdue' : 'none overdue', out ? ' attn' : '') +
      card('Average days to pay', avg === null ? '—' : (Math.round(avg * 10) / 10) + '', 'invoice date to payment') + card('Open quotes', openQ, 'waiting for an answer') + '</div>' +
      '<div class="tools"><input id="bq" type="search" placeholder="Search client, document, reference or job" value="' + esc(billF.q) + '" aria-label="Search documents"><select id="bt" aria-label="Type"><option value="">All types</option><option' + (billF.type === 'Quote' ? ' selected' : '') + '>Quote</option><option' + (billF.type === 'Invoice' ? ' selected' : '') + '>Invoice</option></select>' +
      stSelHtml() +
      '<button type="button" class="btn ghost sm" data-act="bulkToggle" aria-pressed="' + selMode + '">' + (selMode ? 'Selecting' : 'Select') + '</button><button type="button" class="btn ghost sm" data-act="docCsv">Export CSV</button><button type="button" class="btn ghost sm" data-act="docNew" data-m="Quote">New quote</button><button type="button" class="btn sm" data-act="docNew" data-m="Invoice">New invoice</button></div>' +
      (selMode ? '<div class="bulkbar"><span><b>' + nSel + '</b> selected</span><span class="grow"></span><button type="button" class="btn ghost sm" data-act="bulkClear">Clear</button><button type="button" class="btn sm dng2" data-act="bulkAsk"' + (nSel ? '' : ' disabled') + '>Delete selected</button></div>' : '') +
      '<div class="card"><div class="tbl-wrap"><table><thead><tr>' + (selMode ? '<th class="cb"><input type="checkbox" data-act="bulkAll" aria-label="Select all"' + (list.length && list.every(function (x) { return sel[x.id]; }) ? ' checked' : '') + '></th>' : '') + sth('Doc #', 'docNum') + sth('Type', 'type') + sth('Date', 'date') + sth('Client', 'client') + sth('Job', 'job') + sth('Amount', 'amount') + sth('Status', 'status') + sth('Due', 'due') + '<th>Paid</th><th>Client copy</th><th class="act-h">Action</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="' + (selMode ? 12 : 11) + '">' + emptyS('No documents match', 'Change the filters, or start a new quote or invoice.', '') + '</td></tr>') + '</tbody></table></div></div>' +
      '<p class="muted" style="margin:0;font-size:13px">Staff only. Clients never see this screen. A client sees a quote or invoice only after you send it to a job, and then as a file on that job. Only invoices are copied to a company accounts email.</p>';
  }
  function docView() {
    var e = ED, org = ORGS[e.orgId], inv = e.type === 'Invoice';
    var orgs = '<option value="">Other, type below</option>' + Object.keys(ORGS).map(function (k) { return '<option value="' + k + '"' + (e.orgId === k ? ' selected' : '') + '>' + esc(ORGS[k].name) + '</option>'; }).join('');
    var reps = org ? '<option value="">' + 'Choose' + '</option>' + org.reps.map(function (r) { return '<option value="' + r.id + '"' + (e.repId === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('') : '<option value="">Choose a company first</option>';
    var jobs = org ? '<option value="">No job yet</option>' + org.jobs.map(function (j) { return '<option value="' + j.id + '"' + (e.jobId === j.id ? ' selected' : '') + '>' + esc(jn(j)) + ' · ' + esc(j.item) + '</option>'; }).join('') : '<option value="">Choose a company first</option>';
    var mode = e.id ? '<span class="pill info">' + e.type + ' ' + esc(e.docNum) + '</span>' : '<div class="seg" role="group" aria-label="Document type"><button type="button" data-act="edMode" data-m="Quote" aria-pressed="' + !inv + '">Quote</button><button type="button" data-act="edMode" data-m="Invoice" aria-pressed="' + inv + '">Invoice</button></div>';
    return '<div class="card pad"><div class="edbar"><button type="button" class="btn ghost sm" data-act="docBack">&larr; Billing</button>' + mode + (e.id ? '<span style="flex:1"></span><button type="button" class="btn ghost sm dng" data-act="docDel" data-id="' + e.id + '">' + (armDel === e.id ? 'Click again to delete' : 'Delete this document') + '</button>' : '') + '</div>' +
      '<div class="edbar" style="margin-top:12px"><label class="f">Client company<select data-act="edOrg">' + orgs + '</select></label><label class="f">Contact<select data-act="edRep"' + (org ? '' : ' disabled') + '>' + reps + '</select></label><label class="f">Job<select data-act="edJob"' + (org ? '' : ' disabled') + '>' + jobs + '</select></label></div>' +
      '<div class="edbar" style="margin-top:12px"><label class="f" style="max-width:150px">Total pieces<input type="number" min="1" data-ed="split" value="' + esc(e.split) + '" placeholder="e.g. 25"></label><button type="button" class="btn ghost sm" data-act="edSplit">Split into tiers</button><button type="button" class="btn ghost sm" data-act="tariff">Standard rates</button>' + (org ? '<button type="button" class="btn ghost sm" data-act="clientRates" data-org="' + e.orgId + '">Client rates</button>' : '') + (e.id && e.type === 'Quote' ? '<button type="button" class="btn ghost sm" data-act="docToInvoice" data-id="' + e.id + '">Make invoice from this quote</button>' : '') + (org && e.repId ? '<button type="button" class="btn ghost sm" data-act="edSaveRep">Save Bill to for this person</button>' : '') + '<span style="flex:1"></span>' +
      '<button type="button" class="btn ghost sm" data-act="edSave">Save</button><button type="button" class="btn ghost sm" data-act="edPdf">Download PDF</button><button type="button" class="btn sm" data-act="edSend">Send to client</button></div>' +
      '<p class="muted" style="margin:10px 0 0;font-size:13px">' + ratesNote(org) + (!e.jobId && !inv ? 'With no job chosen, a sent quote goes to the company admins and opens a new job request when accepted. ' : '') + 'Sending attaches the PDF to the job as ' + (inv ? 'an invoice' : 'a file') + ' and notifies the people who can see that job. Inspection and label tiers use the piece count above.</p></div>' +
      '<div class="paperwrap">' + paperHtml(e, false) + '</div>';
  }

  /* ----- PDF ----- */
  var scriptP = {};
  function loadScript(url, ready) {
    if (ready()) return Promise.resolve();
    if (scriptP[url]) return scriptP[url];
    scriptP[url] = new Promise(function (res, rej) { var s = document.createElement('script'); s.src = url; s.onload = res; s.onerror = function () { delete scriptP[url]; rej(new Error('load')); }; document.head.appendChild(s); });
    return scriptP[url];
  }
  function docPdf(e) {
    return Promise.all([loadScript('/portal/vendor/html2canvas.min.js', function () { return window.html2canvas; }), loadScript('/portal/vendor/jspdf.umd.min.js', function () { return window.jspdf; })]).then(function () {
      var host = document.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0'; host.innerHTML = paperHtml(e, true); document.body.appendChild(host);
      return new Promise(function (r) { setTimeout(r, 80); }).then(function () { return window.html2canvas(host.firstElementChild, { scale: 2, backgroundColor: '#ffffff', useCORS: true }); }).then(function (canvas) {
        host.remove();
        var pdf = new window.jspdf.jsPDF({ unit: 'in', format: 'letter', orientation: 'portrait' }), img = canvas.toDataURL('image/jpeg', 0.85), W = 8.5, H = 11, h = canvas.height * W / canvas.width, left = h, pos = 0;
        /* JPEG, stored once and reused on each page, keeps the file well under the 3 MB upload limit (a PNG was over 10 MB). */
        pdf.addImage(img, 'JPEG', 0, 0, W, h, 'doc'); left -= H;
        while (left > 0.02) { pos -= H; pdf.addPage(); pdf.addImage(img, 'JPEG', 0, pos, W, h, 'doc'); left -= H; }
        return pdf.output('blob');
      }, function (err) { host.remove(); throw err; });
    });
  }
  function pdfName(rec) { return (rec.type + '_' + rec.docNum).replace(/[^a-zA-Z0-9_-]+/g, '_') + '.pdf'; }
  function edPdf() {
    var rec = edSave(); if (!rec) return; toast('Making the PDF'); render();
    docPdf(edFromDoc(rec)).then(function (b) { download(pdfName(rec), b); }, function () { toast('Could not make the PDF. Check your connection and try again.'); });
  }
  function fileNote(rec) { return rec.type === 'Invoice' ? (rec.status === 'Paid' ? 'Paid, ' : 'Due, ') + money(docTotal(rec)) : 'Quote, ' + money(docTotal(rec)) + (rec.status === 'Accepted' ? ', accepted' : rec.status === 'Declined' ? ', declined' : ', awaiting your approval'); }
  function edSend() {
    var rec = edSave(); if (!rec) return;
    var org = ORGS[rec.orgId], job = org && org.jobs.filter(function (j) { return j.id === rec.jobId; })[0];
    if (!org || (!job && rec.type === 'Invoice')) { toast(rec.type === 'Invoice' ? 'Choose the client company and the job to send this invoice to.' : 'Choose the client company to send this quote to.'); render(); return; }
    toast('Making the PDF'); render();
    docPdf(edFromDoc(rec)).then(function (blob) {
      var reopened = false; if (rec.type === 'Quote' && rec.decision) { rec.status = 'Open'; rec.decision = null; reopened = true; ED.status = 'Open'; ED.decision = null; }
      var old = rec.fileId ? org.files.filter(function (x) { return x.id === rec.fileId; })[0] : null, name = pdfName(rec), again = !!old;
      return sendFile(job ? job.id : '', rec.type === 'Invoice' ? 'Invoice' : 'Other', new File([blob], name, { type: 'application/pdf' }), fileNote(rec), true, '', { docId: rec.id, orgId: org.id }).then(function (f) {
      if (!f) return;
      if (old) org.files = org.files.filter(function (x) { return x.id !== old.id; });
      rec.fileId = f.id; f.note = fileNote(rec); f.docId = rec.id; f.job = job ? job.id : ''; var size = f.size;
      logEv(job, staffName(), rec.type + ' ' + rec.docNum + ' sent to the client (' + fileNote(rec) + ')');
      var prev = S.org, cc = rec.type === 'Invoice' && org.accountsEmail ? esc(org.accountsEmail) : ''; S.org = org;
      notify(job ? job.id : '', ('HazPack ' + (again ? 'updated' : 'added') + ' ' + name + ' (' + rec.type.toLowerCase() + ')' + (job ? ' on ' + job.id : ' for ' + org.name) + (rec.type === 'Quote' ? '. It is waiting for your approval.' : '.')).replace(/\.\./g, '.'), 'client', rec.type === 'Invoice');
      var to = peopleList(job ? recipients(job) : org.reps.filter(function (r) { return r.notify && (r.admin || r.id === rec.repId); })); S.org = prev;
      render();
      openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="Sent to client"><h2>' + rec.type + ' sent to ' + esc(org.name) + '</h2><p class="muted" style="margin:0">' + esc(name) + ' ' + (job ? 'is now a file on job ' + esc(jn(job)) + '. People who can see the job have a portal notification.' : 'was sent to the company with no job yet. Company admins and the contact see it on their dashboard. Accepting it opens a new job request.') + (reopened ? ' The quote changed after it was answered, so it is open for approval again.' : '') + (cc ? ' The company accounts email is copied on the invoice email.' : '') + '</p>' +
        mailBox(HP_FROM, to, rec.type + ' ' + rec.docNum + (job ? ' for ' + jn(job) : ''), 'HazPack added ' + (rec.type === 'Invoice' ? 'an invoice' : 'a quote') + (job ? ' to job ' + esc(jn(job)) : '') + ' for ' + esc(org.name) + ': ' + esc(name) + ' (' + fileNote(rec) + '). Sign in to the client portal to view and download it.', '', cc) +
        '<div class="row"><button type="button" class="btn" data-act="closeModal">Done</button></div></div>');
      });
    }, function () { toast('Could not make the PDF. Check your connection and try again.'); });
  }
  function repModal(id) {
    var r = repOf(id), f = function (k, label, v, type) { return '<label class="f" for="pe-' + k + '">' + label + '<input id="pe-' + k + '" type="' + (type || 'text') + '" value="' + esc(v || '') + '"></label>'; };
    openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="Edit details"><h2>Details for ' + esc(r.name) + '</h2><p class="muted" style="margin:0">These fill in the Bill to section when a quote or invoice is made for this person. Job title is for the portal only and does not appear on documents. Leave address blank to use the company address.</p><div class="form-row">' +
      f('name', 'Name', r.name) + f('title', 'Job title', r.title) + f('email', 'Email', r.email, 'email') + f('phone', 'Phone', r.phone, 'tel') + '</div><div class="form-row">' + f('addr', 'Address', r.addr) + f('city', 'City / State', r.city) + '</div>' +
      '<div class="row"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button type="button" class="btn" data-act="repSave" data-id="' + r.id + '">Save details</button></div></div>');
  }
  function ratesModal(orgId) {
    var o = ORGS[orgId];
    openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="Client rates"><h2>Rates for ' + esc(o.name) + '</h2><p class="muted" style="margin:0">Leave a box empty to use the standard rate. Custom rates fill in on new quotes and invoices for this company. Saved documents keep the rates they were made with.</p>' +
      '<div class="tbl-wrap" style="max-height:50vh;overflow:auto"><table><thead><tr><th>Service</th><th>Standard</th><th style="width:120px">This client</th></tr></thead><tbody>' + TARIFF.map(function (t, i) { var c = o.rates && o.rates[t.id]; return '<tr><td>' + esc(t.label) + '</td><td>' + money(t.rate) + '</td><td><input type="number" min="0" step="0.01" id="cr' + i + '" value="' + (c !== undefined ? c : '') + '" placeholder="' + t.rate + '" aria-label="Rate for ' + esc(t.label) + '"></td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="row"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button type="button" class="btn" data-act="ratesSave" data-org="' + o.id + '">Save client rates</button></div></div>');
  }
  function tariffModal() {
    openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="Rates"><h2>Rates</h2><p class="muted" style="margin:0">Standard rates in US dollars. A change applies to new documents. Saved documents keep the rates they were made with. Rates reset when the prototype reloads.</p>' +
      '<div class="tbl-wrap" style="max-height:50vh;overflow:auto"><table><thead><tr><th>Service</th><th style="width:110px">Rate</th><th>Unit</th></tr></thead><tbody>' + TARIFF.map(function (t, i) { return '<tr><td>' + esc(t.label) + '</td><td><input type="number" min="0" step="0.01" id="te' + i + '" value="' + t.rate + '" aria-label="Rate for ' + esc(t.label) + '"></td><td>' + esc(t.unit) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
      '<div class="row"><button type="button" class="btn ghost" data-act="tariffReset">Reset to defaults</button><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button type="button" class="btn" data-act="tariffSave">Save rates</button></div></div>');
  }
  function applyRates() { if (ED && !ED.id) ED.rows.forEach(function (r) { if (tRow(r.id)) r.rate = rateFor(ORGS[ED.orgId], r.id); }); }
  function csvOut() {
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var rows = [['Doc #', 'Type', 'Date', 'Client', 'Job', 'BKG #', 'Amount', 'Status', 'Due', 'Date paid', 'Prepared by']].concat(DOCS.map(function (x) { return [x.docNum, x.type, mdy(x.date), docOrgName(x), jnId(x.jobId), x.bkg, docTotal(x).toFixed(2), x.status, x.type === 'Invoice' ? mdy(dueOf(x)) : '', mdy(x.datePaid), x.preparedBy]; }));
    download('HazPack_Billing_' + iso(TODAY) + '.csv', new Blob(['﻿' + rows.map(function (r) { return r.map(q).join(','); }).join('\n')], { type: 'text/csv;charset=utf-8' }));
  }
  function setStatus(x, st) {
    if (st === 'Open') x.decision = null;
    x.status = st; x.datePaid = st === 'Paid' ? (x.datePaid || iso(TODAY)) : '';
    var f = x.fileId && ORGS[x.orgId] && ORGS[x.orgId].files.filter(function (y) { return y.id === x.fileId; })[0]; if (f) f.note = fileNote(x);
    var jb = x.jobId && ORGS[x.orgId] && ORGS[x.orgId].jobs.filter(function (y) { return y.id === x.jobId; })[0]; if (jb) logEv(jb, staffName(), x.docNum + ' marked ' + st.toLowerCase());
  }
  /* actions that belong to billing, called from act() and the change/input listeners */
  function billingAct(a, ds) {
    var x;
    if (a === 'nav' || a === 'docOpen' || a === 'docNew') { selMode = false; sel = {}; stOpen = false; }
    switch (a) {
      case 'stToggle': stOpen = !stOpen; render(); return true;
      case 'stClear': billF.st = []; render(); return true;
      case 'bulkToggle': selMode = !selMode; sel = {}; render(); return true;
      case 'bulkRow': if (sel[ds.id]) delete sel[ds.id]; else sel[ds.id] = true; render(); return true;
      case 'bulkClear': sel = {}; render(); return true;
      case 'bulkAsk':
        var ids = Object.keys(sel); if (!ids.length) return true;
        var nums = DOCS.filter(function (y) { return sel[y.id]; }).map(function (y) { return y.docNum; });
        openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="Delete documents"><h2>Delete ' + ids.length + (ids.length === 1 ? ' document?' : ' documents?') + '</h2><p style="margin:0" class="mono">' + esc(nums.slice(0, 8).join(', ')) + (nums.length > 8 ? ' and ' + (nums.length - 8) + ' more' : '') + '</p><p style="margin:0">This cannot be undone. Quotes and invoices already sent to clients stay on their jobs as files.</p><div class="row"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button type="button" class="btn dng2" data-act="bulkGo">Delete ' + ids.length + '</button></div></div>'); return true;
      case 'bulkGo':
        var n = 0; for (var k = DOCS.length - 1; k >= 0; k--) if (sel[DOCS[k].id]) { if (DOCS[k].fileId) noteDocNum(DOCS[k].docNum); DOCS.splice(k, 1); n++; }
        sel = {}; selMode = false; closeModal(); render(); toast('Deleted ' + n + (n === 1 ? ' document.' : ' documents.')); return true;
      case 'docNew': ED = edNew(ds.m, ds.org || '', ds.job || ''); S.view = 'doc'; render(); window.scrollTo(0, 0); if (ED.prefilled) toast('Lines filled from the job\'s services and piece count. Check them before sending.'); return true;
      case 'docOpen': x = DOCS.filter(function (y) { return y.id === ds.id; })[0]; ED = edFromDoc(x); S.view = 'doc'; render(); window.scrollTo(0, 0); return true;
      case 'docToInvoice':
        x = DOCS.filter(function (y) { return y.id === ds.id; })[0]; if (!x) return true;
        var ni = edFromDoc(x); ni.id = null; ni.type = 'Invoice'; ni.docNum = ''; ni.autoNum = true; ni.date = iso(TODAY); ni.status = 'Unpaid'; ni.datePaid = ''; ni.fileId = ''; ni.payRcvd = ''; ni.fromQuote = x.id; ni.notes = (ni.notes ? ni.notes + '\n' : '') + 'Based on quote ' + x.docNum + '.'; autoNum(ni);
        ED = ni; S.view = 'doc'; render(); window.scrollTo(0, 0); toast('Invoice started from ' + x.docNum + '. Save it to mark the quote accepted.'); return true;
      case 'docSort': billSort = { k: ds.k, dir: billSort.k === ds.k ? -billSort.dir : (ds.k === 'date' || ds.k === 'amount' ? -1 : 1) }; render(); return true;
      case 'clientRates': ratesModal(ds.org); return true;
      case 'ratesSave':
        var ro = ORGS[ds.org], map = {}; TARIFF.forEach(function (t, i) { var v = document.getElementById('cr' + i).value.trim(); if (v !== '' && parseFloat(v) !== t.rate) map[t.id] = parseFloat(v) || 0; });
        ro.rates = map; closeModal(); if (ED && !ED.id && ED.orgId === ro.id) { applyRates(); } render(); toast(Object.keys(map).length ? 'Custom rates saved: ' + Object.keys(map).length + ' for ' + ro.name : 'Custom rates cleared for ' + ro.name); return true;
      case 'docBack': S.view = 'billing'; render(); return true;
      case 'docDel':
        if (armDel !== ds.id) { armDel = ds.id; render(); setTimeout(function () { if (armDel === ds.id) { armDel = null; if (S.view === 'billing') render(); } }, 3000); return true; }
        x = DOCS.filter(function (y) { return y.id === ds.id; })[0]; if (x.fileId) noteDocNum(x.docNum); DOCS.splice(DOCS.indexOf(x), 1); armDel = null; if (S.view === 'doc') { S.view = 'billing'; ED = null; } render(); toast('Deleted ' + x.docNum + (x.fileId ? '. The copy already sent to the client stays on their job.' : '.')); return true;
      case 'docCsv': csvOut(); return true;
      case 'edMode': if (!ED.id) { ED.type = ds.m; ED.status = ds.m === 'Invoice' ? 'Unpaid' : 'Open'; autoNum(ED); render(); } return true;
      case 'edAddLine': ED.custom.push({ desc: '', note: '', qty: 1, unit: 'each', rate: 0 }); render(); return true;
      case 'edDelLine': ED.custom.splice(+ds.i, 1); render(); return true;
      case 'edLate': ED.late = !ED.late ? '1.5' : lateRate(ED.late) === 1.5 ? '2.0' : ''; render(); return true;
      case 'edSplit':
        var total = parseInt(ED.split, 10) || 0; if (!total) { toast('Enter the total number of pieces first.'); return true; }
        var t1 = Math.min(total, 10), t2 = total > 10 ? Math.min(total - 10, 20) : 0, t3 = total > 30 ? total - 30 : 0, tiers = { insp1: t1, insp2: t2, insp3: t3 };
        ED.rows.forEach(function (r) { if (tiers[r.id] !== undefined) { r.active = tiers[r.id] > 0; r.qty = tiers[r.id] || 1; } });
        render(); toast('Inspection tiers set: ' + t1 + ', ' + t2 + ' and ' + t3 + ' pieces.'); return true;
      case 'edSaveRep':
        x = ORGS[ED.orgId] && ORGS[ED.orgId].reps.filter(function (r) { return r.id === ED.repId; })[0]; if (!x) { toast('Choose a person first.'); return true; }
        x.name = ED.name; x.email = ED.email; x.phone = ED.phone; x.addr = ED.addr; x.city = ED.city; render(); toast('Saved. Choosing ' + x.name + ' fills in these details.'); return true;
      case 'editRep': repModal(ds.id); return true;
      case 'repSave':
        x = repOf(ds.id); var pv = function (k) { return document.getElementById('pe-' + k).value.trim(); };
        if (!pv('name') || !pv('email')) { toast('A person needs a name and an email.'); return true; }
        if (!staff()) { var xr = x; clientAct({ action: 'editRep', repId: x.id, title: pv('title') || x.title, email: pv('email'), phone: pv('phone'), addr: pv('addr'), city: pv('city') }, function () { closeModal(); toast('Details saved for ' + xr.name + '.'); }); return true; }
        x.name = pv('name'); x.title = pv('title') || x.title; x.email = pv('email'); x.phone = pv('phone'); x.addr = pv('addr'); x.city = pv('city'); closeModal(); render(); toast('Details saved for ' + x.name + '.'); return true;
      case 'edSave': x = edSave(); if (x) { render(); toast('Saved ' + x.docNum + '.'); } return true;
      case 'edPdf': edPdf(); return true;
      case 'edSend': edSend(); return true;
      case 'tariff': tariffModal(); return true;
      case 'tariffSave': TARIFF.forEach(function (t, i) { t.rate = parseFloat(document.getElementById('te' + i).value) || 0; }); applyRates(); closeModal(); render(); toast('Rates saved.'); return true;
      case 'tariffReset':
        var b = document.querySelector('[data-act="tariffReset"]');
        if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to confirm'; return true; }
        TARIFF = JSON.parse(JSON.stringify(TARIFF0)); applyRates(); closeModal(); render(); toast('Rates reset.'); return true;
    }
    return false;
  }
  function billingChange(el) {
    var d = el.dataset;
    if (d.act === 'bulkOne') { if (el.checked) sel[d.id] = true; else delete sel[d.id]; render(); return true; }
    if (d.act === 'bulkAll') { sel = {}; if (el.checked) billIds.forEach(function (id) { sel[id] = true; }); render(); return true; }
    if (d.act === 'docStatus') { var x = DOCS.filter(function (y) { return y.id === d.id; })[0]; if (el.value === 'Overdue') { render(); return true; } setStatus(x, el.value); render(); toast(x.docNum + ' marked ' + el.value.toLowerCase() + '.'); return true; }
    if (d.act === 'edToggle') { var r = ED.rows[+d.i]; r.active = el.checked; if (!el.checked) r.qty = 1; render(); return true; }
    if (d.act === 'edOrg') { var o = ORGS[el.value]; var keep = ED; ED = edNew(keep.type, el.value, ''); ED.id = keep.id; ED.docNum = keep.docNum; ED.autoNum = keep.autoNum; ED.date = keep.date; ED.rows = keep.rows; if (!keep.id) ED.rows.forEach(function (r) { r.rate = rateFor(o, r.id); }); ED.custom = keep.custom; ED.disc = keep.disc; ED.late = keep.late; ED.notes = keep.notes; ED.preparedBy = keep.preparedBy; ED.issuedBy = keep.issuedBy; ED.status = keep.status; ED.datePaid = keep.datePaid; ED.fileId = keep.fileId; if (!o) { ED.company = keep.company; ED.name = keep.name; ED.email = keep.email; ED.bkg = keep.bkg; } render(); return true; }
    if (d.act === 'edRep') { var rp = ORGS[ED.orgId].reps.filter(function (y) { return y.id === el.value; })[0]; ED.repId = el.value; if (rp) putBill(ED, personBill(ORGS[ED.orgId], rp)); else applyBill(ED, ORGS[ED.orgId], null); render(); return true; }
    if (d.act === 'edJob') { var jb = ORGS[ED.orgId].jobs.filter(function (y) { return y.id === el.value; })[0]; var was = ED.jobId && ORGS[ED.orgId].jobs.filter(function (y) { return y.id === ED.jobId; })[0]; if (was && ED.bkg === was.ref) ED.bkg = ''; ED.jobId = el.value; if (jb) { ED.bkg = jb.ref || ED.bkg; if (!ED.id && prefillFromJob(ED, jb)) toast('Lines filled from the job\'s services and piece count. Check them before sending.'); var rq = ORGS[ED.orgId].billing ? null : ORGS[ED.orgId].reps.filter(function (y) { return y.id === jb.rep; })[0]; if (rq) { ED.repId = rq.id; putBill(ED, personBill(ORGS[ED.orgId], rq)); } } render(); return true; }
    if (el.id === 'bt') { billF.type = el.value; render(); return true; }
    if (d.act === 'stOne') { var ix = billF.st.indexOf(d.v); if (el.checked && ix < 0) billF.st.push(d.v); else if (!el.checked && ix > -1) billF.st.splice(ix, 1); render(); return true; }
    return false;
  }
  function billingInput(el) {
    var d = el.dataset, p;
    if (el.id === 'bq') { billF.q = el.value; render(); return true; }
    if (!ED) return false;
    if (d.ed) { ED[d.ed] = el.value; if (d.ed === 'docNum') ED.autoNum = !el.value.trim(); if (d.ed === 'date' || d.ed === 'disc') edRefresh(); return true; }
    if (d.er) { p = d.er.split(':'); ED.rows[+p[0]][p[1]] = p[1] === 'qty' ? (parseFloat(el.value) || 0) : el.value; edRefresh(); return true; }
    if (d.ec) { p = d.ec.split(':'); ED.custom[+p[0]][p[1]] = (p[1] === 'qty' || p[1] === 'rate') ? (parseFloat(el.value) || 0) : el.value; edRefresh(); return true; }
    return false;
  }

  /* ----- company accounts email: copied (Cc) on every invoice email for this company ----- */
  function accountsCard(o) {
    return '<form class="card pad" id="acctForm" style="display:grid;gap:12px"><h3 style="font-size:16px">Company accounts email</h3><p class="muted" style="margin:0;font-size:13px">Usually the payments department. When HazPack sends an invoice for ' + esc(o.name) + ', this address is copied on the email. Leave it blank for no copy. Staff only. Clients never see this.</p>' +
      '<div class="form-row"><label class="f" for="acct-email">Accounts email<input id="acct-email" type="email" value="' + esc(o.accountsEmail || '') + '" placeholder="payments@company.com"></label></div><div><button type="submit" class="btn">Save accounts email</button></div></form>';
  }
  function saveAcct() {
    if (!staff()) return;
    var v = document.getElementById('acct-email').value.trim();
    if (v && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast('That does not look like an email address.'); return; }
    S.org.accountsEmail = v; render(); toast(v ? 'Invoices for ' + S.org.name + ' are now copied to ' + v + '.' : 'Accounts email removed. Invoices are not copied to anyone else.');
  }
  /* ---------- extras: staff home, client invoices, messages, activity log, zip, sorting, drag and drop ----------
     Injected into portal.js by build.py after billing.js. Shares the portal closure. */
  function emptyS(title, text, btn) { return '<div class="empty-s"><b>' + title + '</b><span>' + text + '</span>' + (btn || '') + '</div>'; }
  function logEv(j, who, text) { if (j && j.log) j.log.push({ date: new Date(), who: who, text: text }); }
  function daysTo(s) { return Math.floor((isoDate(s) - TODAY) / 864e5); }

  /* ----- job tabs: messages, activity (staff), files with zip ----- */
  function tabList(j, files) {
    /* The Workflow tab is for HazPack staff only; clients see Overview and Timeline instead. */
    var t = [['overview', 'Overview'], ['timeline', 'Timeline']].concat(staff() ? [['flow', 'Workflow']] : [], [['files', 'Files (' + files.length + ')'], ['msgs', 'Messages (' + j.msgs.length + ')']]);
    if (staff()) t.push(['log', 'Activity']);
    return t;
  }
  function msgsBody(j) {
    var list = j.msgs.slice().sort(function (a, b) { return a.date - b.date; });
    return '<div class="msgs">' + (list.length ? list.map(function (m) { return '<div class="msg ' + m.from + '"><div class="mh"><b>' + esc(m.who) + '</b><span>' + fmt(m.date) + '</span></div><p>' + esc(m.text) + '</p></div>'; }).join('') :
      emptyS('No messages yet', 'Ask a question about this job or reply here. HazPack and the people who can see this job are notified.', '')) + '</div>' +
      '<form class="msgform" id="msgForm"><label class="f" for="msgText">Message<textarea id="msgText" rows="3" placeholder="Write a message"></textarea></label><div><button type="submit" class="btn sm">Send message</button></div></form>';
  }
  function logBody(j) {
    var items = j.log.map(function (l, i) { return [l, i]; }).sort(function (a, b) { return (b[0].date - a[0].date) || (b[1] - a[1]); });
    return '<p class="muted" style="margin:0;padding:12px 16px 0;font-size:13px">Staff only. Clients do not see this history.</p><ul class="list">' +
      (items.length ? items.map(function (p) { return '<li><div class="t"><b style="font-weight:500">' + esc(clientText(p[0].text)) + '</b><span>' + esc(p[0].who) + ' · ' + fmt(p[0].date) + '</span></div></li>'; }).join('') : '<li>' + emptyS('Nothing logged yet', 'Actions on this job appear here as they happen.', '') + '</li>') + '</ul>';
  }
  function filesBody(j, files) {
    return (files.length ? '<div style="padding:12px 16px 0"><button type="button" class="btn ghost sm" data-act="zipJob" data-id="' + j.id + '">Download all files (zip)</button></div>' : '') +
      '<ul class="list">' + (files.length ? files.map(function (f) { return fileRow(f, false); }).join('') : '<li>' + emptyS('No files yet', 'Files for this job appear here.', '<button type="button" class="btn sm" data-act="upload" data-job="' + j.id + '">' + (staff() ? 'Upload to client' : 'Upload a file') + '</button>') + '</li>') + '</ul>';
  }
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'msgForm') return;
    e.preventDefault();
    var text = document.getElementById('msgText').value.trim(), j = getJob(S.job);
    if (!text) { toast('Write a message first.'); return; }
    if (!j) return;
    var st = staff(), who = st ? staffName() : S.rep.name;
    if (!st) { clientAct({ action: 'sendMessage', jobId: j.id, text: text }, function () { toast('Message sent.'); }); return; }
    j.msgs.push({ from: 'staff', who: who, text: text, date: new Date() }); logEv(j, who, 'Sent a message');
    notify(j.id, 'HazPack sent a message on ' + j.id + '.', 'client');
    render(); toast('Message sent.');
  });
  function zipJob(id) {
    var files = S.org.files.filter(function (f) { return f.job === id; }); if (!files.length) return;
    toast('Preparing the zip');
    loadScript('/portal/vendor/jszip.min.js', function () { return window.JSZip; }).then(function () {
      var z = new window.JSZip(), used = {};
      return Promise.all(files.map(function (f) { return ensureBlob(f); })).then(function (blobs) {
        files.forEach(function (f, k) { var n = f.name; if (used[n]) { var c = ++used[n], i = n.lastIndexOf('.'); n = (i > 0 ? n.slice(0, i) : n) + ' (' + c + ')' + (i > 0 ? n.slice(i) : ''); } else used[n] = 1; z.file(n, blobs[k]); });
        return z.generateAsync({ type: 'blob' });
      });
    }).then(function (blob) { download(String(jnId(id)).replace(/[^a-zA-Z0-9_-]+/g, '_') + '_files.zip', blob); }, function () { toast('Could not make the zip. Check your connection and try again.'); });
  }

  /* ----- withdraw a request (client) ----- */
  var armW = null;
  function withdrawBtn(j) {
    if (staff() || !(S.rep.admin || j.rep === S.rep.id)) return '';
    return ' <button type="button" class="linkbtn" data-act="withdraw" data-id="' + j.id + '">' + (armW === j.id ? 'Click again to withdraw this request' : 'Withdraw request') + '</button>';
  }

  /* ----- jobs list sorting ----- */
  var JOB_ORDER = { 'Needs correction': 0, 'Request received': 1, 'In progress': 2, 'Cleared to ship': 3, 'Completed': 4 };
  function sortJobs(list) {
    var k = S.js || 'new';
    return list.slice().sort(function (a, b) {
      if (k === 'old') return a.ev[0][0] - b.ev[0][0];
      if (k === 'id') return a.id.localeCompare(b.id);
      if (k === 'status') return (JOB_ORDER[jobStatus(a)[0]] - JOB_ORDER[jobStatus(b)[0]]) || (b.ev[0][0] - a.ev[0][0]);
      if (k === 'req') { if (!a.req && !b.req) return 0; if (!a.req) return 1; if (!b.req) return -1; return a.req.localeCompare(b.req); }
      return (b.ev[0][0] - a.ev[0][0]) || b.id.localeCompare(a.id);
    });
  }
  function jobSortSel() {
    var o = [['new', 'Newest first'], ['old', 'Oldest first'], ['status', 'Status'], ['id', 'Job number'], ['req', 'Required by']];
    return '<select id="js" aria-label="Sort jobs">' + o.map(function (x) { return '<option value="' + x[0] + '"' + ((S.js || 'new') === x[0] ? ' selected' : '') + '>Sort: ' + x[1] + '</option>'; }).join('') + '</select>';
  }

  /* ----- client invoices ----- */
  function clientInvoices() {
    var ids = vis().map(function (j) { return j.id; });
    return DOCS.filter(function (x) { return x.type === 'Invoice' && x.orgId === S.org.id && x.fileId && x.status !== 'Cancelled' && ids.indexOf(x.jobId) > -1; });
  }
  function invoicesView() {
    var list = clientInvoices().sort(function (a, b) { return b.date.localeCompare(a.date); }), out = 0, paid = 0, od = 0;
    list.forEach(function (x) { var t = docTotal(x); if (x.status === 'Paid') paid += t; else { out += t; if (isOverdue(x)) od++; } });
    var rows = list.map(function (x) {
      var f = S.org.files.filter(function (y) { return y.id === x.fileId; })[0], st = x.status === 'Paid' ? ['Paid', 'ok'] : isOverdue(x) ? ['Overdue', 'bad'] : ['Due', 'warn'];
      return '<tr><td class="mono"><b>' + esc(x.docNum) + '</b></td><td class="mono">' + esc(jnId(x.jobId)) + '</td><td>' + mdy(x.date) + '</td><td>' + money(docTotal(x)) + '</td><td>' + mdy(dueOf(x)) + '</td><td><span class="pill ' + st[1] + '">' + st[0] + '</span></td><td>' + (f ? actions(f) : '') + '</td></tr>';
    }).join('');
    return '<div class="stats"><div class="card stat' + (od ? ' attn' : '') + '"><span class="k">Outstanding</span><span class="v">' + money(out) + '</span><span class="s">' + (od ? od + ' past the due date' : 'nothing past due') + '</span></div><div class="card stat"><span class="k">Paid</span><span class="v">' + money(paid) + '</span><span class="s">marked paid by HazPack</span></div><div class="card stat"><span class="k">Invoices</span><span class="v">' + list.length + '</span><span class="s">' + (showWho() ? 'across your team' : 'on your jobs') + '</span></div></div>' +
      '<div class="card">' + (list.length ? '<div class="tbl-wrap"><table><thead><tr><th>Invoice</th><th>Job</th><th>Date</th><th>Amount</th><th>Due</th><th>Status</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div>' : emptyS('No invoices yet', 'Invoices HazPack sends for your jobs appear here with the amount and due date.', '')) + '</div>';
  }

  /* ----- staff home: what needs attention across every client ----- */
  function needs() {
    var r = { req: [], fix: [], soon: [], od: [], dueSoon: [], qs: [] };
    Object.keys(ORGS).forEach(function (k) {
      var o = ORGS[k];
      o.jobs.forEach(function (j) {
        if (j.pending) r.req.push([o, j]); else if (j.fix) r.fix.push([o, j]);
        if (j.req && !j.pending && isOpen(j) && !doneStep(j, LB.dgd) && daysTo(j.req) <= 7) r.soon.push([o, j]);
      });
    });
    DOCS.forEach(function (x) {
      if (x.type === 'Invoice') { if (isOverdue(x)) r.od.push(x); else if (x.status === 'Unpaid' && daysTo(dueOf(x)) <= 7) r.dueSoon.push(x); }
      else if (x.status === 'Open') r.qs.push(x);
    });
    return r;
  }
  function needsCount() { var n = needs(); return n.req.length + n.fix.length + n.od.length; }
  function staffHome() {
    var n = needs(), odTotal = 0; n.od.forEach(function (x) { odTotal += docTotal(x); });
    var li = function (t, s, btns) { return '<li><div class="t"><b>' + t + '</b><span>' + s + '</span></div>' + (btns || '') + '</li>'; };
    var none = function (t) { return '<li>' + emptyS(t, '', '') + '</li>'; };
    var reqLi = n.req.map(function (p) {
      var o = p[0], j = p[1], r = repOf2(o, j.rep);
      return li('<span class="mono">' + esc(jn(j)) + '</span> · ' + esc(o.name), esc(j.item) + ' · ' + j.mode + (routeOf(j) ? ' · ' + j.from + ' to ' + j.to : '') + (r ? ' · ' + esc(r.name) : '') + (j.req ? ' · Required by ' + fmtS(isoDate(j.req)) : ''),
        '<button type="button" class="btn sm" data-act="acceptOrg" data-org="' + o.id + '" data-id="' + j.id + '">Accept</button><button type="button" class="btn ghost sm" data-act="openOrg" data-org="' + o.id + '" data-job="' + j.id + '">Open</button>');
    }).join('');
    var fixLi = n.fix.map(function (p) { return li('<span class="mono">' + p[1].id + '</span> · ' + esc(p[0].name), esc(p[1].fixNote || 'Needs a correction'), '<button type="button" class="btn ghost sm" data-act="openOrg" data-org="' + p[0].id + '" data-job="' + p[1].id + '">Open</button>'); }).join('');
    var docLi = function (x, tag) { return li('<span class="mono">' + esc(x.docNum) + '</span> · ' + esc(docOrgName(x)), money(docTotal(x)) + (x.type === 'Invoice' ? ' · due ' + mdy(dueOf(x)) : ' · quote of ' + mdy(x.date)) + (tag ? ' · ' + tag : ''), '<button type="button" class="btn ghost sm" data-act="docOpen" data-id="' + x.id + '">Open</button>'); };
    var invLi = n.od.map(function (x) { return docLi(x, 'overdue ' + (-daysTo(dueOf(x))) + ' days'); }).join('') + n.dueSoon.map(function (x) { return docLi(x, 'due in ' + daysTo(dueOf(x)) + ' days'); }).join('');
    var qLi = n.qs.map(function (x) { return docLi(x, ''); }).join('');
    var soonLi = n.soon.map(function (p) { var dd = daysTo(p[1].req); return li('<span class="mono">' + p[1].id + '</span> · ' + esc(p[0].name), esc(p[1].item) + ' · required by ' + fmt(isoDate(p[1].req)) + (dd < 0 ? ' (late)' : dd === 0 ? ' (today)' : ' (' + dd + (dd === 1 ? ' day' : ' days') + ')'), '<button type="button" class="btn ghost sm" data-act="openOrg" data-org="' + p[0].id + '" data-job="' + p[1].id + '">Open</button>'); }).join('');
    var acts = []; Object.keys(ORGS).forEach(function (k) { ORGS[k].notifs.forEach(function (x) { if (x.to === 'staff') acts.push([ORGS[k], x]); }); }); acts.sort(function (a, b) { return b[1].date - a[1].date; });
    var actLi = acts.slice(0, 5).map(function (a) { return li(esc(clientText(a[1].text)), esc(a[0].name) + ' · ' + fmt(a[1].date), ''); }).join('');
    var card = function (title, html, empty) { return '<div class="card"><h2>' + title + '</h2><ul class="list">' + (html || none(empty)) + '</ul></div>'; };
    var stat = function (k, v, s, cls) { return '<div class="card stat' + (cls || '') + '"><span class="k">' + k + '</span><span class="v">' + v + '</span><span class="s">' + s + '</span></div>'; };
    return '<section class="banner"><div><p class="eyebrow">HazPack staff</p><h2>Needs attention</h2><p>Across every client company, on ' + fmt(TODAY) + '.</p></div></section>' +
      '<div class="stats">' + stat('New requests', n.req.length, 'waiting to be accepted', n.req.length ? ' attn' : '') + stat('Needs correction', n.fix.length, 'waiting on a client', n.fix.length ? ' attn' : '') + stat('Overdue invoices', money(odTotal), n.od.length + (n.od.length === 1 ? ' invoice' : ' invoices'), n.od.length ? ' attn' : '') + stat('Open quotes', n.qs.length, 'waiting for an answer') + '</div>' +
      calendarCard() + '<div class="card"><h2>New requests</h2><ul class="list">' + requestItems(n.req) + '</ul></div>' +
      '<div class="two">' + card('Waiting on clients', fixLi, 'No corrections outstanding') + card('Invoices to chase', invLi, 'Nothing overdue or due this week') + '</div>' +
      '<div class="two">' + card('Quotes waiting for an answer', qLi, 'No open quotes') + card('Needed within a week', soonLi, 'No required-by dates coming up') + '</div>' +
      card('Recent client activity', actLi, 'Nothing yet');
  }
  function repOf2(o, id) { return o.reps.filter(function (r) { return r.id === id; })[0]; }

  /* ----- client approval of quotes ----- */
  function quoteDoc(f) { return f && f.docId ? DOCS.filter(function (q) { return q.id === f.docId; })[0] : null; }
  function quoteBtns(f) {
    var q = quoteDoc(f); if (staff() || !q || q.type !== 'Quote' || q.status !== 'Open') return '';
    return '<button type="button" class="btn sm" data-act="quoteAccept" data-id="' + f.id + '">Accept quote</button><button type="button" class="btn ghost sm" data-act="quoteDecline" data-id="' + f.id + '">Decline</button>';
  }
  function quotesWaiting() {
    if (staff()) return [];
    var ids = vis().map(function (j) { return j.id; });
    return DOCS.filter(function (q) { return q.type === 'Quote' && q.status === 'Open' && q.fileId && q.orgId === S.org.id && (q.jobId ? ids.indexOf(q.jobId) > -1 : (S.rep.admin || q.repId === S.rep.id)); });
  }
  function quoteBanner(j) {
    if (staff()) return '';
    var list = quotesWaiting().filter(function (q) { return q.jobId === j.id; });
    return list.map(function (q) {
      return '<div class="pad" style="padding-bottom:0"><div class="alert" style="border-color:var(--warn);background:var(--warn-soft)"><b style="color:var(--warn)">Quote waiting for your approval.</b> ' + esc(q.docNum) + ' for ' + money(docTotal(q)) + '. HazPack starts the work in this quote once you accept it. ' +
        '<span style="display:inline-flex;gap:6px;flex-wrap:wrap;margin-left:6px"><button type="button" class="btn sm" data-act="quoteAccept" data-id="' + q.fileId + '">Accept quote</button><button type="button" class="btn ghost sm" data-act="quoteDecline" data-id="' + q.fileId + '">Decline</button><button type="button" class="btn ghost sm" data-act="view" data-id="' + q.fileId + '">View quote</button></span></div></div>';
    }).join('');
  }
  function nvis(n, ids) { return ids.indexOf(n.job) > -1 || (!n.job && !!S.rep && S.rep.admin); }
  /* quotes sent to the company before any job exists */
  function looseQuotesCard() {
    var list = quotesWaiting().filter(function (q) { return !q.jobId; }); if (!list.length) return '';
    return '<div class="card"><h2>Quotes waiting for your approval</h2><ul class="list">' + list.map(function (q) {
      var what = q.lines.slice(0, 3).map(function (l) { return l.label; }).join(', ') + (q.lines.length > 3 ? ' and more' : '');
      return '<li><div class="t"><b><span class="mono">' + esc(q.docNum) + '</span> · ' + money(docTotal(q)) + '</b><span>' + esc(what) + ' · sent ' + mdy(q.date) + ' · accepting opens a new job request</span></div>' +
        '<button type="button" class="btn sm" data-act="quoteAccept" data-id="' + q.fileId + '">Accept quote</button><button type="button" class="btn ghost sm" data-act="quoteDecline" data-id="' + q.fileId + '">Decline</button><button type="button" class="btn ghost sm" data-act="view" data-id="' + q.fileId + '">View</button></li>';
    }).join('') + '</ul></div>';
  }
  function jobFromQuote(q, f) {
    var ids = q.lines.map(function (l) { return l.id; }), svc = [];
    if (ids.some(function (i) { return /^dgd/.test(i); })) svc.push('dgd');
    if (ids.some(function (i) { return /^(pack|label|overpack|pallet)/.test(i); })) svc.push('pack');
    if (ids.some(function (i) { return /^insp/.test(i); })) svc.push('insp');
    if (!svc.length) svc = ['dgd'];
    var j = mk({ id: nextJobId(), rep: q.repId || S.rep.id, item: 'Shipment, details to be confirmed', un: '', cls: 'To be confirmed', pg: 'N/A', qty: '', mode: 'Air', from: 'LAX', to: null, toText: '', ref: q.bkg || '', req: '', svc: svc, done: 0, start: TODAY, pending: true, ev: [[TODAY, 'Request submitted']] });
    j.log.forEach(function (l) { l.who = S.rep.name; }); logEv(j, S.rep.name, 'Request opened from accepted quote ' + q.docNum);
    S.org.jobs.unshift(j); f.job = j.id; q.jobId = j.id; return j;
  }
  function quoteModal(fileId, accept) {
    var f = S.org.files.filter(function (y) { return y.id === fileId; })[0], q = quoteDoc(f); if (!q) return;
    openModal('<form class="modal" id="qForm" data-id="' + f.id + '" data-accept="' + (accept ? '1' : '0') + '" role="dialog" aria-modal="true" aria-label="' + (accept ? 'Accept quote' : 'Decline quote') + '"><h2>' + (accept ? 'Accept' : 'Decline') + ' quote ' + esc(q.docNum) + '</h2>' +
      '<p style="margin:0">Total <b>' + money(docTotal(q)) + '</b>' + (q.jobId ? ' for job <span class="mono">' + esc(jnId(q.jobId)) + '</span>' : '') + '. ' + (accept ? 'Accepting tells HazPack to go ahead with the work in this quote at these rates.' + (q.jobId ? '' : ' It also opens a new job request, and you can then add your declaration to it.') : 'Declining tells HazPack not to go ahead. You can add a reason so they can offer a different quote.') + '</p>' +
      (accept ? '<label class="f" for="qName">Type your full name to accept<input id="qName" type="text" required autocomplete="off" placeholder="' + esc(S.rep.name) + '"></label>' : '<label class="f" for="qWhy">Reason (optional)<textarea id="qWhy" rows="3" placeholder="For example: the quantity is wrong, or please quote again with fewer pieces"></textarea></label>') +
      '<div class="row"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button type="submit" class="btn">' + (accept ? 'Accept quote' : 'Decline quote') + '</button></div></form>');
  }
  function decideQuote(f, accept, typed, why) {
    if (!quoteDoc(f)) return;
    clientAct({ action: 'decideQuote', fileId: f.id, accept: accept, typed: typed || '', reason: why || '' }, function (res) { quoteDone(f.id, accept, typed, why, res.jobId ? getJob(res.jobId) : null); });
  }
  function quoteDone(fileId, accept, typed, why, made) {
    var f = findFile(fileId), q = quoteDoc(f), org = S.org; if (!q) return;
    openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="Quote answered"><h2>Quote ' + (accept ? 'accepted' : 'declined') + '</h2><p class="muted" style="margin:0">HazPack has been told. ' + (accept ? (made ? 'A job request, ' + esc(jn(made)) + ', was opened for you. Add your declaration (DGD) to it so HazPack can prepare the shipment. ' : '') + 'They will go ahead with the work and invoice you when it is done.' : 'They can send you a different quote.') + '</p>' +
      mailBox('HazPack client portal', esc(FROM_EMAIL), 'Quote ' + q.docNum + ' ' + q.status.toLowerCase() + ' by ' + S.rep.name, esc(S.rep.name) + ' of ' + esc(org.name) + ' ' + q.status.toLowerCase() + ' quote ' + esc(q.docNum) + ' (' + money(docTotal(q)) + ')' + (f.job ? ' for job ' + esc(f.job) : '') + '.' + (made ? ' A job request, ' + esc(made.id) + ', was opened.' : '') + (accept ? ' Typed name: ' + esc(typed) + '.' : '') + (why ? ' Reason: ' + esc(why) : '')) +
      '<div class="row"><button type="button" class="btn" data-act="closeModal">Done</button></div></div>');
  }
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'qfForm') return;
    e.preventDefault();
    var org = e.target.dataset.org, id = e.target.dataset.id;
    withOrg(org, function () { act('fixOn', { id: id }); }); closeModal();
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'qForm') return;
    e.preventDefault();
    var f = S.org.files.filter(function (y) { return y.id === e.target.dataset.id; })[0], accept = e.target.dataset.accept === '1';
    if (!f) return;
    if (accept) { var nm = document.getElementById('qName').value.trim(); if (!nm) { toast('Type your full name to accept.'); return; } decideQuote(f, true, nm, ''); }
    else decideQuote(f, false, '', document.getElementById('qWhy').value.trim());
  });

  /* ----- staff: jobs table, job workspace with task board, expandable requests ----- */
  function findFile(id) { var r = null; Object.keys(ORGS).forEach(function (k) { var f = ORGS[k].files.filter(function (y) { return y.id === id; })[0]; if (f) r = f; }); return r; }
  /* Priority is worked out from the required-by date and corrections. Nothing is typed in by hand. */
  function priorityOf(j) {
    if (!isOpen(j)) return null;
    if (j.pri) return [j.pri, j.pri === 'Urgent' ? 'bad' : j.pri === 'High' ? 'warn' : j.pri === 'Low' ? 'low' : 'info'];
    if (j.fix) return ['High', 'bad'];
    if (j.req) { var d = daysTo(j.req); if (d <= 2) return ['Urgent', 'bad']; if (d <= 7) return ['High', 'warn']; }
    return ['Normal', 'info'];
  }
  function priChip(j) { var p = priorityOf(j); return p ? '<span class="pill ' + p[1] + '">' + p[0] + '</span>' : '<span class="muted">—</span>'; }
  function progOf(j) { return j.pending ? 0 : Math.round(100 * Math.min(j.done, j.steps.length) / j.steps.length); }
  function progBar(j) { var v = progOf(j); return '<span class="prog" role="img" aria-label="' + v + ' percent done"><i style="width:' + v + '%"></i></span><b class="pv">' + v + '%</b>'; }
  function allJobsCount() { var n = 0; Object.keys(ORGS).forEach(function (k) { n += ORGS[k].jobs.length; }); return n; }
  function orgOfJob(id) { var r = null; Object.keys(ORGS).forEach(function (k) { if (ORGS[k].jobs.some(function (j) { return j.id === id; })) r = ORGS[k]; }); return r; }

  var OWNERS = ['James Whitty', 'Alex Walsh'];
  function byName(w) { return /^HazPack/.test(w) ? 'HazPack' : w; }
  function staffName() { return 'HazPack staff'; }
  function withOrg(orgId, fn) { var prev = S.org; S.org = ORGS[orgId]; try { fn(); } finally { S.org = prev; } render(); }
  function ownChip(j) { return j.owner ? '<span class="own"><i>' + initials(j.owner) + '</i>' + esc(j.owner.split(' ')[0]) + '</span>' : '<span class="muted">Unassigned</span>'; }
  function qaButtons(o, j) {
    var a = ' data-org="' + o.id + '" data-id="' + j.id + '"';
    if (j.pending) return '<button type="button" class="btn sm" data-act="qAccept"' + a + '>Accept</button>';
    if (!isOpen(j)) return '';
    return '<button type="button" class="btn ghost sm" data-act="qStep"' + a + ' title="Complete: ' + esc(j.steps[j.done]) + '">Complete step</button><button type="button" class="btn ghost sm" data-act="qFlag"' + a + '>Flag</button>';
  }
  function staffJobs() {
    if (S.mobileDetail && S.job && getJob(S.job) && !sheetMode()) return detail(getJob(S.job));
    return staffJobsView();
    var all = []; Object.keys(ORGS).forEach(function (k) { ORGS[k].jobs.forEach(function (j) { all.push(j); }); });
    var q = S.q.toLowerCase(), sc = S.sc || '', so = S.so || '';
    var list = all.filter(function (j) {
      var o = orgOfJob(j.id);
      if (sc && o.id !== sc) return false;
      if (so === 'none' && j.owner) return false; if (so && so !== 'none' && j.owner !== so) return false;
      if (S.f === 'air' && j.mode !== 'Air') return false; if (S.f === 'ground' && j.mode !== 'Ground') return false; if (S.f === 'attn' && !j.fix) return false; if (S.f === 'open' && !isOpen(j)) return false;
      return !q || (j.id + j.item + j.un + j.ref + o.name + j.owner).toLowerCase().indexOf(q) > -1;
    });
    list = sortJobs(list);
    var open = all.filter(isOpen).length, fix = all.filter(function (j) { return j.fix; }).length, req = all.filter(function (j) { return j.pending; }).length;
    var stat = function (v, k) { return '<div class="sl"><b>' + v + '</b><span>' + k + '</span></div>'; };
    var chips = [['all', 'All'], ['open', 'Open'], ['air', 'Air'], ['ground', 'Ground'], ['attn', 'Needs correction']].map(function (c) { return '<button type="button" class="chip" data-act="filter" data-f="' + c[0] + '" aria-pressed="' + (S.f === c[0]) + '">' + c[1] + '</button>'; }).join('');
    var rows = list.map(function (j) {
      var o = orgOfJob(j.id), s = jobStatus(j);
      return '<tr class="click" data-act="openOrg" data-org="' + o.id + '" data-job="' + j.id + '"><td><b class="mono">' + esc(jn(j)) + '</b><br><span class="muted">' + esc(j.item) + '</span></td><td>' + esc(o.name) + '<br><span class="muted">' + esc(repName2(o, j.rep)) + '</span></td><td>' + ownChip(j) + '</td><td><span class="pill ' + s[1] + '">' + s[0] + '</span></td><td><span class="pcell">' + progBar(j) + '</span></td><td>' + priChip(j) + '</td><td>' + (j.req ? '<span class="dcell2">' + fmtS(isoDate(j.req)) + '</span>' : '<span class="muted">Not set</span>') + '</td><td class="go"><span class="qa">' + qaButtons(o, j) + '</span><span class="vw">View &rsaquo;</span></td></tr>';
    }).join('');
    return '<div class="statline">' + stat(all.length, 'Total jobs') + stat(open, 'Open') + stat(req, 'Requests to accept') + stat(fix, 'Needs correction') + '</div>' +
      '<div class="card roomy"><div class="ch"><div><h2>Jobs</h2><p class="muted">Every client company. Select a job to work on it, or use the quick buttons on a row.</p></div></div>' +
      '<div class="tools" style="padding:0 20px 14px"><input id="q" type="search" placeholder="Search job, client, contents, UN number or owner" value="' + esc(S.q) + '" aria-label="Search jobs"><select id="sc" aria-label="Client company"><option value="">All companies</option>' + Object.keys(ORGS).map(function (k) { return '<option value="' + k + '"' + (sc === k ? ' selected' : '') + '>' + esc(ORGS[k].name) + '</option>'; }).join('') + '</select>' +
      '<select id="so" aria-label="Owner"><option value="">All owners</option>' + OWNERS.map(function (n) { return '<option value="' + n + '"' + (so === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '<option value="none"' + (so === 'none' ? ' selected' : '') + '>Unassigned</option></select>' + jobSortSel() + '</div>' +
      '<div class="chips" style="padding:0 20px 14px">' + chips + '</div>' +
      '<div class="tbl-wrap"><table class="roomy-t"><thead><tr><th>Job</th><th>Client</th><th>Owner</th><th>Status</th><th>Progress</th><th>Priority</th><th>Required by</th><th></th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="8">' + emptyS('No jobs match', 'Try a different search or filter.', '') + '</td></tr>') + '</tbody></table></div></div>';
  }
  function repName2(o, id) { var r = repOf2(o, id); return r ? r.name : 'Former member'; }

  var STEP_HELP = {};
  STEP_HELP[LB.rec] = ['HazPack opened the job.', null];
  STEP_HELP[LB.rev] = ['HazPack read the request, the declaration and the safety data.', null];
  STEP_HELP[LB.cls] = ['UN number, hazard class and packing group confirmed.', null];
  STEP_HELP[LB.temp] = ['Temperature control prepared for the shipment.', null];
  STEP_HELP[LB.dry] = ['Dry ice loaded and the package marked.', null];
  STEP_HELP[LB.dgdp] = ['Declaration drafted and sent for checking.', null];
  STEP_HELP[LB.consult] = ['Advice given to the client.', null];
  STEP_HELP[LB.emerg] = ['Emergency support provided.', null];
  STEP_HELP[LB.pack] = ['Packaging done and photos added to the job.', ['Upload photos', 'Photo']];
  STEP_HELP[LB.insp] = ['Inspection finished and the report added.', ['Upload report', 'Report']];
  STEP_HELP[LB.dgd] = ['Declaration signed. The shipment is cleared to ship.', ['Upload DGD', 'DGD']];
  STEP_HELP[LB.inv] = ['Invoice made and sent to the client.', ['Create invoice', '__inv']];
  var TYPE_STEP = { Photo: LB.pack, Report: LB.insp, DGD: LB.dgd, Invoice: LB.inv };
  function stepFiles(j, label) { return S.org.files.filter(function (f) { return f.job === j.id && (f.step ? f.step === label : TYPE_STEP[f.type] === label); }); }
  function taskCard(j, i, state) {
    var s = j.steps[i], h = STEP_HELP[s] || ['', null], meta = state === 'cur' ? 'In progress' : 'Up next', btns = '', nf = stepFiles(j, s).length;
    if (state === 'done') { var e = j.ev.filter(function (ev) { return ev[1] === s; })[0], by = j.by && j.by[s]; meta = (e || by) ? 'Completed ' + fmtS(by ? by.date : e[0]) + (by ? ' by ' + esc(byName(by.who)) : '') : 'Completed'; }
    if (state === 'cur' && !j.pending) btns += '<button type="button" class="btn sm" data-act="stepNext" data-id="' + j.id + '">Complete step</button>';
    if (state === 'done' && i === j.done - 1 && j.done > 1) btns += '<button type="button" class="btn ghost sm" data-act="stepUndo" data-id="' + j.id + '">Undo</button>';
    if (state !== 'done' && h[1]) btns += h[1][1] === '__inv' ? '<button type="button" class="btn ghost sm" data-act="docNew" data-m="Invoice" data-org="' + S.org.id + '" data-job="' + j.id + '">' + h[1][0] + '</button>' : '<button type="button" class="btn ghost sm" data-act="upload" data-job="' + j.id + '" data-type="' + h[1][1] + '" data-step="' + esc(s) + '">' + h[1][0] + '</button>';
    var note = j.notes && j.notes[s] ? '<span class="tchip">Note</span>' : '';
    return '<div class="tcard ' + state + '" data-act="stepOpen" data-i="' + i + '"><div class="tt"><b>' + esc(s) + '</b>' + (state === 'done' ? '<span class="tick" aria-hidden="true"></span>' : '') + '</div><p>' + esc(h[0]) + '</p><div class="tf"><span class="tmeta">' + meta + '</span>' + (nf ? '<span class="tchip">' + nf + (nf === 1 ? ' file' : ' files') + '</span>' : '') + note + '<button type="button" class="linkbtn tdet" data-act="stepOpen" data-i="' + i + '">Details</button></div>' + (btns ? '<div class="tb">' + btns + '</div>' : '') + '</div>';
  }
  function boardHtml(j) {
    var done = j.pending ? 0 : j.done, c = { todo: [], prog: [], done: [] };
    j.steps.forEach(function (s, i) { if (i < done) c.done.push(i); else if (i === done && !j.pending) c.prog.push(i); else c.todo.push(i); });
    var col = function (title, items, state, extra) { return '<div class="bcol"><div class="bch"><b>' + title + '</b><span class="cnt">' + (extra ? 1 : items.length) + '</span></div><div class="bcards">' + (extra || items.map(function (i) { return taskCard(j, i, state); }).join('') || '<div class="bempty">Nothing here</div>') + '</div></div>'; };
    var blocked = j.fix ? '<div class="tcard blocked"><div class="tt"><b>Correction needed</b></div><p>' + esc(j.fixNote || 'Something on this job needs a correction.') + '</p><div class="tf"><span class="tmeta">Waiting on the client</span></div><div class="tb"><button type="button" class="btn sm" data-act="fixOff" data-id="' + j.id + '">Resolve correction</button></div></div>' : '';
    var flag = !j.fix && !j.pending && isOpen(j) ? '<span class="flagf"><input id="fixnote" type="text" placeholder="What needs correcting" aria-label="Correction note"><button type="button" class="btn ghost sm" data-act="fixOn" data-id="' + j.id + '">Flag for correction</button></span>' : '';
    return '<section class="board"><div class="bh"><div><h3>Task board</h3><p class="muted">' + (j.pending ? 'Accept the request to start the first step.' : Math.min(done, j.steps.length) + ' of ' + j.steps.length + ' steps done.') + '</p></div><div class="bhr"><span class="pcell">' + progBar(j) + '</span>' + flag + '</div></div>' +
      '<div class="bcols' + (j.fix ? ' four' : '') + '">' + col('Up next', c.todo, 'todo') + col('In progress', c.prog, 'cur') + col('Done', c.done, 'done') + (j.fix ? col('Blocked', [], 'blocked', blocked) : '') + '</div></section>';
  }
  function drawerHtml(j) {
    if (S.stepJ !== j.id || S.stepI == null || !j.steps[S.stepI]) return '';
    var i = S.stepI, s = j.steps[i], state = (!j.pending && i < j.done) ? 'done' : (!j.pending && i === j.done) ? 'cur' : 'todo', h = STEP_HELP[s] || ['', null];
    var by = j.by && j.by[s], e = j.ev.filter(function (ev) { return ev[1] === s; })[0], files = stepFiles(j, s);
    var pillH = state === 'done' ? '<span class="pill ok">Done</span>' : state === 'cur' ? '<span class="pill warn">In progress</span>' : '<span class="pill info">Up next</span>';
    var row = function (k, v) { return '<div class="dr"><span>' + k + '</span><b>' + v + '</b></div>'; };
    var acts = (state === 'cur' ? '<button type="button" class="btn" data-act="stepNext" data-id="' + j.id + '">Complete step</button>' : '') + (state === 'done' && i === j.done - 1 && j.done > 1 ? '<button type="button" class="btn ghost" data-act="stepUndo" data-id="' + j.id + '">Undo this step</button>' : '') +
      (h[1] && h[1][1] !== '__inv' ? '<button type="button" class="btn ghost" data-act="upload" data-job="' + j.id + '" data-type="' + h[1][1] + '" data-step="' + esc(s) + '">' + h[1][0] + '</button>' : '') + (h[1] && h[1][1] === '__inv' ? '<button type="button" class="btn ghost" data-act="docNew" data-m="Invoice" data-org="' + S.org.id + '" data-job="' + j.id + '">Create invoice</button>' : '');
    return '<div class="dveil" data-act="stepClose"></div><aside class="drawer" role="dialog" aria-label="Step details"><div class="dhead"><div><p class="eyebrow">Step ' + (i + 1) + ' of ' + j.steps.length + '</p><h3>' + esc(s) + '</h3></div><button type="button" class="btn ghost sm" data-act="stepClose" aria-label="Close details">Close</button></div><div class="dbody">' +
      '<div class="dsec"><h4>Details</h4>' + row('Status', pillH) + row('Job', '<span class="mono">' + esc(jn(j)) + '</span>') + row('Owner', j.owner ? esc(j.owner) : '<span class="muted">Unassigned</span>') + row('Completed by', state === 'done' ? esc(by ? byName(by.who) : 'HazPack') : '<span class="muted">Not yet</span>') + row('Completed on', state === 'done' && (by || e) ? fmt(by ? by.date : e[0]) : '<span class="muted">Not yet</span>') + row('Required by', j.req ? fmt(isoDate(j.req)) : '<span class="muted">Not set</span>') + '</div>' +
      '<div class="dsec"><h4>What this step means</h4><p style="margin:0">' + esc(h[0]) + '</p></div>' +
      '<div class="dsec"><h4>Notes <span class="muted" style="text-transform:none;letter-spacing:0">(staff only)</span></h4><textarea id="sn" rows="4" placeholder="Anything the team should know about this step">' + esc((j.notes && j.notes[s]) || '') + '</textarea><div style="margin-top:8px"><button type="button" class="btn ghost sm" data-act="stepNote">Save note</button></div></div>' +
      '<div class="dsec"><h4>Files for this step</h4>' + (files.length ? '<ul class="list">' + files.map(function (f) { return fileRow(f, false); }).join('') + '</ul>' : '<p class="muted" style="margin:0">No files yet. Files you upload from this step appear here.</p>') + '</div></div>' + (acts ? '<div class="dfoot">' + acts + '</div>' : '') + '</aside>';
  }
  function staffWorkspace(j, tabsCard) {
    var o = S.org, a = pt(j.from), b = pt(j.to), ok = routeOf(j), s = jobStatus(j), r = repOf2(o, j.rep);
    var fact = function (k, v) { return '<div class="fact"><span>' + k + '</span><b>' + v + '</b></div>'; };
    var pr = priorityOf(j), cur = !j.pending && isOpen(j) ? j.steps[j.done] : '';
    var head = '<div class="ws-head"><div class="wh1"><button type="button" class="btn ghost sm" data-act="backList">&larr; All jobs</button><h2 class="mono">' + esc(jn(j)) + '</h2><span class="pill ' + s[1] + '">' + s[0] + '</span>' + priChip(j) + '<span class="ws-item">' + esc(j.item) + '</span></div>' +
      '<div class="wh2"><label class="mini-l">Owner<select id="owner" class="mini"><option value="">Unassigned</option>' + OWNERS.map(function (n) { return '<option' + (j.owner === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' +
      '<label class="mini-l">Priority<select id="prio" class="mini"><option value="">Auto' + (pr && !j.pri ? ' (' + pr[0] + ')' : '') + '</option>' + ['Urgent', 'High', 'Normal', 'Low'].map(function (n) { return '<option' + (j.pri === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '</select></label>' +
      '</div></div>';
    var facts = '<div class="facts">' + fact('Client', esc(o.name)) + fact('Requested by', esc(r ? r.name : 'Former member')) + fact('Transport', j.mode) + fact('Route', ok ? j.from + ' &rarr; ' + j.to : j.toText ? esc(j.toText) : 'Not set') + fact('Reference', '<span class="mono">' + esc(j.ref || '—') + '</span>') + fact('Required by', j.req ? fmt(isoDate(j.req)) : 'Not set') + '</div>';
    var accept = j.pending ? '<div class="alert" style="border-color:var(--info);background:var(--info-soft)"><b style="color:var(--info)">New request.</b> Check the details below, then accept it to open the job and start the first step.</div>' : '';
    var foot = ok ? [esc(a.city) + ' (' + a.code + ') to ' + esc(b.city) + ' (' + b.code + ')', j.mode + ' route'] : null;
    var mapbar = '<div class="mapbar"><span><b>Route</b> ' + (ok ? esc(a.city) + ' to ' + esc(b.city) + ' · ' + j.mode : j.toText ? 'to ' + esc(j.toText) : 'not set yet') + '</span><button type="button" class="linkbtn" data-act="mapToggle">' + (S.mapHide ? 'Show map' : 'Hide map') + '</button></div>';
    return '<div class="ws">' + head + accept + facts + '<div class="mapwrap">' + mapbar + (S.mapHide ? '' : mapHtml([j], { ar: window.innerWidth <= 800 ? 2.1 : 4, labels: true, empty: j.toText ? 'The destination ' + esc(j.toText) + ' is not on the map yet. HazPack can add it.' : undefined, label: ok ? 'Route from ' + a.city + ' to ' + b.city : 'Route', foot: foot })) + '</div>' +
      '<section class="board trboard">' + taskRows(j) + '</section>' + tabsCard + drawerHtml(j) + jobDock(j) + '</div>';
  }

  /* ----- calendar on Home ----- */
  function calEvents() {
    var ev = {}, add = function (k, e) { (ev[k] = ev[k] || []).push(e); };
    Object.keys(ORGS).forEach(function (k) { ORGS[k].jobs.forEach(function (j) { if (j.req && isOpen(j)) add(j.req, { t: 'job', label: jn(j), org: ORGS[k], job: j, late: daysTo(j.req) < 0 && !doneStep(j, LB.dgd) }); }); });
    DOCS.forEach(function (x) { if (x.type === 'Invoice' && x.status === 'Unpaid') add(dueOf(x), { t: 'inv', label: 'Inv ' + x.docNum.slice(-3), doc: x, late: isOverdue(x) }); });
    return ev;
  }
  function calendarCard() {
    var off = S.calM || 0, base = new Date(TODAY.getFullYear(), TODAY.getMonth() + off, 1), y = base.getFullYear(), m = base.getMonth(), days = new Date(y, m + 1, 0).getDate(), ev = calEvents(), cells = '', sel = S.calDay || iso(TODAY);
    for (var i = 0; i < base.getDay(); i++) cells += '<span class="cd blank"></span>';
    for (var n = 1; n <= days; n++) {
      var key = y + '-' + ('0' + (m + 1)).slice(-2) + '-' + ('0' + n).slice(-2), list = ev[key] || [];
      cells += '<button type="button" class="cd' + (key === iso(TODAY) ? ' today' : '') + (key === sel ? ' sel' : '') + '" data-act="calDay" data-d="' + key + '" aria-label="' + longDate(key) + (list.length ? ', ' + list.length + ' items' : '') + '"><span class="cn">' + n + '</span>' +
        list.slice(0, 2).map(function (e) { return '<i class="cc ' + (e.late ? 'bad' : e.t) + '">' + esc(e.label) + '</i>'; }).join('') + (list.length > 2 ? '<em>+' + (list.length - 2) + ' more</em>' : '') + '</button>';
    }
    var items = ev[sel] || [];
    var li = items.map(function (e) {
      return e.t === 'job' ? '<li><div class="t"><b><span class="mono">' + esc(jn(e.job)) + '</span> · ' + esc(e.org.name) + '</b><span>Required by this day · ' + esc(e.job.item) + (e.late ? ' · late' : '') + '</span></div><button type="button" class="btn ghost sm" data-act="openOrg" data-org="' + e.org.id + '" data-job="' + esc(jn(e.job)) + '">Open</button></li>' :
        '<li><div class="t"><b><span class="mono">' + esc(e.doc.docNum) + '</span> · ' + esc(docOrgName(e.doc)) + '</b><span>Invoice due this day · ' + money(docTotal(e.doc)) + (e.late ? ' · overdue' : '') + '</span></div><button type="button" class="btn ghost sm" data-act="docOpen" data-id="' + e.doc.id + '">Open</button></li>';
    }).join('');
    return '<div class="card roomy"><div class="ch"><div><h2>Calendar</h2><p class="muted">Required-by dates and invoice due dates.</p></div><div class="calnav"><button type="button" class="btn ghost sm" data-act="calNav" data-n="-1" aria-label="Previous month">&lsaquo;</button><b>' + base.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) + '</b><button type="button" class="btn ghost sm" data-act="calNav" data-n="1" aria-label="Next month">&rsaquo;</button></div></div>' +
      '<div class="calgrid" role="group" aria-label="Month">' + ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(function (d0) { return '<span class="cw">' + d0 + '</span>'; }).join('') + cells + '</div>' +
      '<div class="callegend"><span><i class="cc job"></i>Job required by</span><span><i class="cc inv"></i>Invoice due</span><span><i class="cc bad"></i>Late</span></div>' +
      '<h4 class="reqh">' + longDate(sel) + '</h4><ul class="list">' + (li || '<li class="muted">Nothing due on this day.</li>') + '</ul></div>';
  }

  /* requests: click a row to see everything the job involves */
  function reqItem(o, j) {
    var open = !!(S.openReq && S.openReq[j.id]), r = repOf2(o, j.rep), files = o.files.filter(function (f) { return f.job === j.id; });
    var f = function (k, v) { return '<div><dt>' + k + '</dt><dd>' + v + '</dd></div>'; };
    var detailHtml = !open ? '' : '<div class="reqd"><dl class="dl">' +
      f('Contents', esc(j.item)) + f('UN number', '<span class="un">' + esc(j.un || '—') + '</span>') + f('Hazard class', esc(j.cls)) + f('Packing group', esc(j.pg)) + f('Quantity', esc(j.qty || '—')) + f('Transport', j.mode) +
      f('From', j.from && AP[j.from] ? esc(AP[j.from].city) + ' (' + j.from + ')' : esc(j.from || 'LAX')) + f('To', routeOf(j) ? esc(AP[j.to].city) + ' (' + j.to + ')' : j.toText ? esc(j.toText) + ' <span class="muted">(not on the map yet)</span>' : '<span class="muted">Not set</span>') + f('Reference', '<span class="mono">' + esc(j.ref || '—') + '</span>') +
      f('Required by', j.req ? fmt(isoDate(j.req)) : 'Not set') + f('Services', j.svc.map(function (k) { return SVC[k]; }).join(', ')) + f('Submitted', fmt(j.ev[0][0])) +
      f('Requested by', r ? esc(r.name) + '<br><span class="muted">' + esc(r.title) + '</span>' : 'Former member') + f('Contact', r ? esc(r.email) + (r.phone ? '<br>' + esc(r.phone) : '') : '—') + f('Company', esc(o.name)) + '</dl>' +
      '<h4 class="reqh">Files sent with the request</h4>' + (files.length ? '<ul class="list">' + files.map(function (x) { return fileRow(x, false); }).join('') + '</ul>' : '<p class="muted" style="margin:0 20px 14px">No files were attached.</p>') +
      '<div class="reqf"><button type="button" class="btn ghost sm" data-act="openOrg" data-org="' + o.id + '" data-job="' + j.id + '">Open the full job</button></div></div>';
    return '<li class="reqli' + (open ? ' open' : '') + '"><div class="reqrow"><button type="button" class="reqhead" data-act="reqToggle" data-id="' + j.id + '" aria-expanded="' + open + '"><span class="chev" aria-hidden="true"></span><span class="t"><b><span class="mono">' + esc(jn(j)) + '</span> · ' + esc(o.name) + '</b><span>' + esc(j.item) + ' · ' + j.mode + (routeOf(j) ? ' · ' + j.from + ' to ' + j.to : j.toText ? ' · to ' + esc(j.toText) : '') + (r ? ' · ' + esc(r.name) : '') + (j.req ? ' · Required by ' + fmtS(isoDate(j.req)) : '') + '</span></span></button>' +
      '<button type="button" class="btn sm" data-act="acceptOrg" data-org="' + o.id + '" data-id="' + j.id + '">Accept</button></div>' + detailHtml + '</li>';
  }
  function requestItems(pairs) {
    if (!pairs.length) return '<li>' + emptyS('No requests waiting', 'New job requests from clients appear here.', '') + '</li>';
    return pairs.map(function (p) { return reqItem(p[0], p[1]); }).join('');
  }

  /* ----- company map (staff Clients screen, and each client's own dashboard) -----
     One company in the centre, its groups as cards, the selected group's items fanned out to the right,
     and a side panel for the selected item. The graph is drawn after render (cmDraw) because it needs the box width.
     A client only ever sees their own company, filtered by the same rules as the rest of the portal:
     admins see the whole company, members see their own jobs, files and invoices. Staff-only details are left out. */
  function cmOrg() { if (!S.cmOrg || !ORGS[S.cmOrg]) S.cmOrg = Object.keys(ORGS)[0]; return ORGS[S.cmOrg]; }
  function byDateDesc(a, b) { return b.date - a.date; }
  function cmScope(o) {
    if (!staff() && S.rep && o === S.org) return { client: true, jobs: vis(), files: visFiles(), reps: S.rep.admin ? o.reps : [S.rep], inv: clientInvoices(), qs: quotesWaiting() };
    return { client: false, jobs: o.jobs, files: o.files, reps: o.reps,
      inv: DOCS.filter(function (x) { return x.type === 'Invoice' && x.orgId === o.id && x.status !== 'Cancelled'; }),
      qs: DOCS.filter(function (x) { return x.type === 'Quote' && x.orgId === o.id && x.status === 'Open'; }) };
  }
  function cmGroups(o, sc) {
    var inv = sc.inv.slice().sort(function (a, b) { return b.date.localeCompare(a.date); });
    var due = 0; inv.forEach(function (x) { if (x.status === 'Unpaid') due += docTotal(x); });
    return [
      { k: 'people', label: 'People', list: sc.reps.map(function (r) { return { k: 'rep', id: r.id, r: r }; }) },
      { k: 'jobs', label: 'Open jobs', list: sortJobs(sc.jobs.filter(isOpen)).map(function (j) { return { k: 'job', id: j.id, j: j }; }) },
      cmOverviewGroup(sc, inv),
      { k: 'files', label: 'Files', count: sc.files.length, list: cmFolders(o, sc.files), files: sc.files },
      { k: 'inv', label: 'Invoices' + (due ? ' · ' + money(due) + ' due' : ''), list: inv.map(function (x) { return { k: 'inv', id: x.id, x: x }; }) },
      { k: 'quotes', label: sc.qs.length === 1 ? 'Quote waiting' : 'Quotes waiting', list: sc.qs.map(function (x) { return { k: 'quote', id: x.id, x: x }; }) }
    ];
  }
  /* Files are shown as one folder per job (newest first); files with no job yet share one folder. Selecting a folder opens its files. */
  function cmFolders(o, files) {
    var map = {}, L = [];
    files.forEach(function (f) { var k = f.job || ''; if (!map[k]) { map[k] = { k: 'folder', id: 'fd:' + k, job: k, j: k ? o.jobs.filter(function (j) { return j.id === k; })[0] : null, files: [] }; L.push(map[k]); } map[k].files.push(f); });
    L.forEach(function (fd) { fd.files.sort(byDateDesc); });
    return L.sort(function (a, b) { return b.files[0].date - a.files[0].date; });
  }
  function cmTypeCounts(files) {
    var c = {}; files.forEach(function (f) { c[f.type] = (c[f.type] || 0) + 1; });
    return Object.keys(TYPE_LABEL).filter(function (k) { return c[k]; }).map(function (k) { return [TYPE_LABEL[k], c[k]]; });
  }
  /* Overview: the things waiting on someone right now. With nothing selected, the side panel shows the company summary. */
  function cmOverviewGroup(sc, inv) {
    var L = [], job = function (j) { return { k: 'job', id: j.id, j: j }; };
    sc.jobs.filter(function (j) { return j.fix && isOpen(j); }).forEach(function (j) { L.push(job(j)); });
    sc.jobs.filter(function (j) { return j.pending; }).forEach(function (j) { L.push(job(j)); });
    inv.filter(isOverdue).forEach(function (x) { L.push({ k: 'inv', id: x.id, x: x }); });
    sc.qs.forEach(function (x) { L.push({ k: 'quote', id: x.id, x: x }); });
    inv.filter(function (x) { return x.status === 'Unpaid' && !isOverdue(x); }).forEach(function (x) { L.push({ k: 'inv', id: x.id, x: x }); });
    return { k: 'overview', label: L.length ? L.length + ' waiting' : 'Nothing waiting', list: L };
  }
  function cmOverviewPanel(o, sc) {
    var out = 0, od = 0, billed = 0, days = [];
    sc.inv.forEach(function (x) { var t = docTotal(x); billed += t; if (x.status === 'Unpaid') { out += t; if (isOverdue(x)) od++; } if (x.status === 'Paid' && x.datePaid) days.push((isoDate(x.datePaid) - isoDate(x.date)) / 864e5); });
    var jobs = sc.jobs, open = jobs.filter(isOpen).length, done = jobs.length - open, fix = jobs.filter(function (j) { return j.fix && isOpen(j); }).length, pend = jobs.filter(function (j) { return j.pending; }).length;
    var avg = days.length ? Math.round(days.reduce(function (a, b) { return a + b; }, 0) / days.length * 10) / 10 : null;
    var last = null; jobs.forEach(function (j) { j.ev.forEach(function (e) { if (!last || e[0] > last) last = e[0]; }); }); if (!sc.client) o.notifs.forEach(function (n) { if (!last || n.date > last) last = n.date; });
    var months = []; for (var i = 5; i >= 0; i--) { var m = new Date(TODAY.getFullYear(), TODAY.getMonth() - i, 1); months.push({ y: m.getFullYear(), m: m.getMonth(), label: m.toLocaleDateString('en-US', { month: 'short' }), n: 0 }); }
    jobs.forEach(function (j) { var s = j.ev[0][0]; months.forEach(function (mm) { if (s.getFullYear() === mm.y && s.getMonth() === mm.m) mm.n++; }); });
    var top = Math.max.apply(null, months.map(function (mm) { return mm.n; }).concat([1]));
    var bars = months.map(function (mm, i) { return '<div><i class="' + (i === 5 ? 'cur' : '') + '" style="height:' + (mm.n ? Math.max(5, Math.round(mm.n / top * 38)) : 0) + 'px"></i><b>' + mm.n + '</b><span>' + mm.label + '</span></div>'; }).join('');
    var tile = function (v, k, attn) { return '<div class="cm-tile' + (attn ? ' attn' : '') + '"><b>' + v + '</b><span>' + k + '</span></div>'; };
    var tiles = tile(open, 'open jobs') + tile(done, 'completed to date') + tile(fix, 'needs correction', fix) +
      (sc.client ? tile(pend, 'requests under review') : tile(avg === null ? '—' : avg, 'average days to pay')) + tile(money(out), od ? od + ' overdue' : 'outstanding', od) + tile(money(billed), 'invoiced to date');
    var them = sc.client ? (S.rep.admin ? 'Your team' : 'You') : 'Client', wc = [], wh = [];
    jobs.forEach(function (j) { if (j.fix && isOpen(j)) wc.push('Correction on <span class="mono">' + esc(jn(j)) + '</span>'); if (j.pending) wh.push((sc.client ? 'Review request ' : 'Accept request ') + '<span class="mono">' + esc(jn(j)) + '</span>'); });
    sc.qs.forEach(function (q) { wc.push('Approve quote <span class="mono">' + esc(q.docNum) + '</span>'); });
    var waits = wc.map(function (t) { return '<div class="dr"><span>' + them + '</span><b>' + t + '</b></div>'; }).join('') + wh.map(function (t) { return '<div class="dr"><span>HazPack</span><b>' + t + '</b></div>'; }).join('');
    var foot = sc.client ? '' : '<button type="button" class="btn sm" data-act="openOrg" data-org="' + o.id + '">Open portal</button><button type="button" class="btn sm ghost" data-act="clientRates" data-org="' + o.id + '">Rates</button>';
    return '<div class="cm-sh"><p class="eyebrow">Overview</p><h3>' + esc(o.name) + '</h3><div class="cm-pills"><span class="pill ' + (open ? 'ok' : 'low') + '">' + (open ? 'Active' : 'No open jobs') + '</span><span class="muted" style="font-size:13px">' + jobs.length + (jobs.length === 1 ? ' job' : ' jobs') + ' to date' + (last ? ' · last activity ' + fmtS(last) : '') + '</span></div></div>' +
      '<div class="cm-sb"><div class="cm-tiles">' + tiles + '</div>' +
      '<div class="cm-sec"><h4>Jobs opened by month</h4><div class="cm-bars">' + bars + '</div></div>' +
      '<div class="cm-sec"><h4>Waiting on</h4>' + (waits || '<p class="muted" style="margin:0">Nothing waiting.</p>') + '</div></div>' +
      (foot ? '<div class="cm-sf">' + foot + '</div>' : '');
  }
  function cmState() {
    var o = staff() ? cmOrg() : S.org, sc = cmScope(o), gs = cmGroups(o, sc), g = gs.filter(function (x) { return x.k === (S.cmGroup || 'overview'); })[0] || gs[2];
    var folder = null, list = g.list, it;
    if (g.k === 'files') {
      /* Files: the job folders first; once a folder is open, that job's files. Nothing is pre-selected. */
      folder = S.cmFolder != null ? g.list.filter(function (x) { return x.job === S.cmFolder; })[0] || null : null;
      if (!folder) S.cmFolder = null; else list = folder.files.map(function (f) { return { k: 'file', id: f.id, f: f }; });
      it = folder ? list.filter(function (x) { return x.id === S.cmItem; })[0] || null : null;
    } else it = g.list.filter(function (x) { return x.id === S.cmItem; })[0] || (g.k === 'overview' ? null : g.list[0]) || null;
    return { o: o, sc: sc, gs: gs, g: g, list: list, folder: folder, it: it };
  }
  var CM_MAX = 7;
  function cmInfo(it) {
    if (it.k === 'folder') { var nf = it.files.length; return { name: it.job ? jnId(it.job) : 'No job yet', sans: !it.job, chip: [nf + (nf === 1 ? ' file' : ' files'), 'done'], sub: (it.j ? it.j.item.split(/[,(]/)[0].trim() : it.job ? 'Job' : 'Not tied to a job') + ' · latest ' + fmtS(it.files[0].date) }; }
    if (it.k === 'rep') return { name: it.r.name, sans: true, chip: it.r.admin ? ['Admin', 'info'] : ['Member', 'done'], sub: it.r.title || 'Team member' };
    if (it.k === 'job') { var j = it.j, s = jobStatus(j); return { name: jn(j), chip: [s[0], s[0] === 'Completed' ? 'done' : s[1]], sub: j.item.split(/[,(]/)[0].trim() + ' · ' + (j.from || 'LAX') + (j.to ? ' to ' + j.to : j.toText ? ' to ' + j.toText : ''), prog: progOf(j) }; }
    if (it.k === 'file') { var f = it.f; return { name: f.name, chip: [ftype(f.type)[0], 'done'], sub: (f.note ? f.note + ' · ' : '') + fmtS(f.date) }; } /* files are only shown inside their job's folder, so no job number here */
    var x = it.x;
    if (it.k === 'inv') return { name: x.docNum, chip: x.status === 'Paid' ? ['Paid', 'ok'] : isOverdue(x) ? ['Overdue', 'bad'] : ['Due', 'warn'], sub: money(docTotal(x)) + ' · due ' + mdy(dueOf(x)) };
    return { name: x.docNum, chip: ['Waiting', 'warn'], sub: money(docTotal(x)) + ' · ' + (x.jobId ? jnId(x.jobId) : 'no job yet') };
  }
  function cmItemBtn(it, sel, style) {
    var n = cmInfo(it);
    return '<button type="button" class="cm-item' + (it.k === 'folder' ? ' folder' : '') + '" data-act="' + (it.k === 'folder' ? 'cmFolder' : 'cmItem') + '" data-id="' + esc(it.id) + '"' + (it.k === 'folder' ? ' title="Open the files for ' + esc(it.job || 'files with no job') + '"' : '') + ' aria-pressed="' + sel + '"' + (style ? ' style="' + style + '"' : '') + '><span class="l1"><b class="' + (n.sans ? 'sans' : '') + '">' + esc(n.name) + '</b><span class="dchip ' + n.chip[1] + '">' + esc(n.chip[0]) + '</span></span>' +
      '<span class="l2"><span class="tx">' + esc(n.sub) + '</span>' + (n.prog != null ? '<span class="mbar" aria-hidden="true"><i style="width:' + n.prog + '%"></i></span>' : '') + '</span></button>';
  }
  function cmSince(o, sc) { var t = o.jobs.map(function (j) { return j.ev[0][0]; }).sort(function (a, b) { return a - b; })[0], m = t ? t.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : ''; return sc.client ? (m ? 'with HazPack since ' + m : 'new to HazPack') : (m ? o.id + ' · client since ' + m : o.id + ' · no jobs yet'); }
  /* small line icons for the group cards (16 x 16, drawn with the text colour) */
  var CM_ICON = {
    people: '<circle cx="6" cy="5" r="2.6"/><path d="M1.5 14c.4-2.8 2.2-4.2 4.5-4.2s4.1 1.4 4.5 4.2M10.5 2.8a2.5 2.5 0 0 1 0 4.6M12.2 9.9c1.3.6 2 1.9 2.3 4.1"/>',
    jobs: '<rect x="1.5" y="4.5" width="13" height="9.5" rx="1.5"/><path d="M5.5 4.5V2.5h5v2M1.5 8.5h13"/>',
    files: '<path d="M3.5 1.5h6l3.5 3.5v9.5h-9.5zM9.5 1.5V5H13"/>',
    inv: '<path d="M3 1.5h10v13l-2-1.2-1.7 1.2-1.3-1-1.3 1L5 13.3l-2 1.2zM5.5 5.5h5M5.5 8.5h5"/>',
    quotes: '<path d="M3 1.5h10v13H3zM5.4 8.6l1.9 1.9 3.4-3.7"/>',
    overview: '<rect x="1.5" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="9" y="1.5" width="5.5" height="5.5" rx="1"/><rect x="1.5" y="9" width="5.5" height="5.5" rx="1"/><rect x="9" y="9" width="5.5" height="5.5" rx="1"/>'
  };
  /* Tallest side panel any group or item can need at this width (every company for staff, their own for a client), so the map keeps one size. */
  function cmPanelMax(side) {
    var probe = document.createElement('aside'), max = 0;
    probe.className = 'cm-side'; probe.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;height:auto;width:' + side.offsetWidth + 'px';
    document.body.appendChild(probe);
    (staff() ? Object.keys(ORGS).map(function (k) { return ORGS[k]; }) : [S.org]).forEach(function (o) {
      var sc = cmScope(o), gs = cmGroups(o, sc), measure = function (st) { probe.innerHTML = cmPanel(st); max = Math.max(max, probe.offsetHeight); };
      gs.forEach(function (g) {
        if (g.k === 'files') {
          /* the file summary, each job's files summary, and every file */
          measure({ o: o, sc: sc, gs: gs, g: g, it: null });
          g.list.forEach(function (fd) { measure({ o: o, sc: sc, gs: gs, g: g, folder: fd, it: null }); fd.files.forEach(function (f) { measure({ o: o, sc: sc, gs: gs, g: g, folder: fd, it: { k: 'file', id: f.id, f: f } }); }); });
          return;
        }
        (g.k === 'overview' ? [null] : []).concat(g.list.length ? g.list : [null]).forEach(function (it) { measure({ o: o, sc: sc, gs: gs, g: g, it: it }); });
      });
    });
    probe.remove(); return max;
  }
  /* The canvas is drawn after render because it needs its own width. Items sit at even steps on a circle around the company,
     so the layout stays neat however few items a group has. The column of group cards is centred on the company. */
  /* What the map last drew, so it animates only what changed: the full entrance when the map appears or the company changes,
     only the fan of items when the group changes, and only the side panel when the item changes. A plain redraw (any other click,
     or resizing the window) animates nothing. Cleared whenever the map is off screen, so coming back plays the entrance again. */
  var CM_PREV = null;
  function cmDraw() {
    var el = document.getElementById('cmGraph'); if (!el) { CM_PREV = null; return; }
    var st = cmState(), o = st.o, side = el.parentNode.querySelector('.cm-side');
    var key = { o: o.id, g: st.g.k + (st.folder ? ':' + st.folder.job : ''), i: st.it ? st.it.id : '' }, mode = !CM_PREV || CM_PREV.o !== key.o ? 'full' : CM_PREV.g !== key.g ? 'fan' : 'none';
    if (side && (mode !== 'none' || CM_PREV.i !== key.i)) side.classList.add('swap');
    CM_PREV = key;
    el.style.height = ''; if (side) side.style.height = ''; var W = el.clientWidth;
    var shown = st.list.slice(0, st.list.length > CM_MAX ? CM_MAX - 1 : CM_MAX), more = st.list.length - shown.length;
    var card = function (g, style) {
      return '<button type="button" class="cm-card' + (g.k === 'overview' ? ' ov' : '') + '" data-act="cmGroup" data-g="' + g.k + '" aria-pressed="' + (g === st.g) + '"' + (style ? ' style="' + style + '"' : '') + '><span class="ci"><svg viewBox="0 0 16 16" aria-hidden="true">' + CM_ICON[g.k] + '</svg><b>' + (g.k === 'overview' ? 'Overview' : g.count != null ? g.count : g.list.length) + '</b></span><span class="cl">' + esc(g.label) + (g.k === 'files' && g.list.length ? ' · ' + g.list.length + (g.list.length === 1 ? ' job' : ' jobs') : '') + '</span></button>';
    };
    /* delays for each step of the entrance (ms); the fan starts sooner when only the group changed */
    var T = mode === 'full' ? { card: 180, cardStep: 70, orbit: 420, item: 620, itemStep: 75 } : { card: 0, cardStep: 0, orbit: 0, item: 40, itemStep: 60 };
    var d = function (ms) { return '--d:' + Math.round(ms) + 'ms'; };
    var who = st.sc.client ? 'yet' : 'for this company', noneTx = st.g.k === 'files' ? 'No files ' + who + '.' : st.g.k === 'overview' ? 'Nothing waiting ' + (st.sc.client ? 'right now' : 'for this company') + '.' : 'No ' + esc(st.g.label.split(' · ')[0].toLowerCase()) + ' ' + who + '.';
    if (W < 600) {
      el.className = 'cm-canvas compact' + (mode !== 'none' ? ' anim-' + mode : '');
      el.innerHTML = '<div class="cm-cards">' + st.gs.map(function (g, i) { return card(g, d(i * 50)); }).join('') + '</div><div class="cm-list">' + shown.map(function (it, i) { return cmItemBtn(it, it === st.it, d((mode === 'full' ? 300 : 0) + i * 50)); }).join('') +
        (more ? '<p class="cm-more">and ' + more + ' more</p>' : '') + (!shown.length ? '<p class="cm-none">' + noneTx + '</p>' : '') + '</div>';
      return;
    }
    el.className = 'cm-canvas' + (mode !== 'none' ? ' anim-' + mode : '');
    /* One height for every group (and every company, for staff): room for the cards around Overview, the largest fan and the tallest side panel. */
    var ov = 0; st.gs.forEach(function (g, i) { if (g.k === 'overview') ov = i; });
    var mid = (st.gs.length - 1) / 2, reach = Math.max(mid, 0.5), n = shown.length, nx = 92, cx = 196, cw = 150, R = Math.max(250, Math.min(W - nx - 262, 440)), deg = Math.PI / 180, MAXA = 72;
    var slots = n + (more ? 1 : 0), stepA = slots > 1 ? Math.min(13, MAXA / (slots - 1)) : 0, half = (slots - 1) / 2 * stepA;
    var H = Math.max(2 * reach * 84 + 130, 2 * R * Math.sin(MAXA / 2 * deg) + 150, side ? cmPanelMax(side) : 0), cy = H / 2;
    el.style.height = H + 'px'; if (side) side.style.height = H + 'px';
    var gap = Math.max(84, Math.min(100, (H - 140) / (2 * reach)));
    var svg = '<svg class="cm-lines" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><defs><radialGradient id="cmGlow"><stop offset="0" stop-color="#F37A21" stop-opacity=".16"/><stop offset=".45" stop-color="#24497a" stop-opacity=".35"/><stop offset="1" stop-color="#0c1829" stop-opacity="0"/></radialGradient></defs>';
    svg += '<circle class="cm-glow" cx="' + nx + '" cy="' + cy + '" r="150" fill="url(#cmGlow)"/>';
    /* orbit lines only on the item side, so they never run through the group cards */
    var arc = function (r) { var a = 41 * deg; return 'M' + (nx + r * Math.cos(a)).toFixed(1) + ' ' + (cy - r * Math.sin(a)).toFixed(1) + ' A' + r + ' ' + r + ' 0 0 1 ' + (nx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1); };
    svg += '<path class="ln orbit" pathLength="1" style="' + d(T.orbit) + '" d="' + arc(R) + '" fill="none" stroke="rgba(168,190,222,.13)" stroke-width="1"/>';
    svg += '<path class="orbit2" style="' + d(T.orbit + 200) + '" d="' + arc(R + 26) + '" fill="none" stroke="rgba(168,190,222,.06)" stroke-width="1" stroke-dasharray="2 5"/>';
    var html = '<div class="cm-node" style="left:' + nx + 'px;top:' + cy + 'px"><span class="ring">' + esc(initials(o.name)) + '</span><b>' + esc(o.name) + '</b><span>' + esc(cmSince(o, st.sc)) + '</span></div>', selY = cy;
    /* cards are centred on the company and appear outward from Overview */
    st.gs.forEach(function (g, i) {
      var y = cy + (i - mid) * gap, on = g === st.g, t = T.card + Math.abs(i - ov) * T.cardStep; if (on) selY = y;
      svg += '<path class="ln card-ln" pathLength="1" style="' + d(t - 60) + '" d="M' + (nx + 47) + ' ' + cy + ' C' + (nx + 84) + ' ' + cy + ' ' + (cx - 46) + ' ' + y + ' ' + cx + ' ' + y + '" fill="none" stroke="' + (on ? '#F37A21' : 'rgba(168,190,222,.32)') + '" stroke-width="' + (on ? 2 : 1.1) + '"/>';
      html += card(g, 'left:' + cx + 'px;top:' + y + 'px;' + d(t));
    });
    var sx = cx + cw;
    shown.forEach(function (it, i) {
      var a = (i * stepA - half) * deg, x = nx + R * Math.cos(a), y = cy + R * Math.sin(a), on = it === st.it, t = T.item + i * T.itemStep;
      svg += '<path class="ln item-ln" pathLength="1" style="' + d(t) + '" d="M' + sx + ' ' + selY + ' C' + (sx + (x - sx) * .5) + ' ' + selY + ' ' + (sx + (x - sx) * .5) + ' ' + y + ' ' + (x - 5) + ' ' + y + '" fill="none" stroke="' + (on ? '#F37A21' : 'rgba(243,190,140,.42)') + '" stroke-width="' + (on ? 2 : 1.1) + '"/>';
      if (on) svg += '<circle class="cm-halo" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="9" fill="none" stroke="#F37A21" stroke-width="1.5"/>';
      svg += '<circle class="dot" style="' + d(t + 220) + '" cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (on ? 5 : 3.6) + '" fill="' + (on ? '#F37A21' : '#f3c39c') + '"' + (on ? ' stroke="rgba(243,122,33,.35)" stroke-width="5"' : '') + '/>';
      html += cmItemBtn(it, on, 'left:' + (x + 10).toFixed(1) + 'px;top:' + y.toFixed(1) + 'px;' + d(t + 180));
    });
    if (more) { var am = (n * stepA - half) * deg; /* the last slot */ html += '<p class="cm-more" style="left:' + (nx + R * Math.cos(am) + 18).toFixed(1) + 'px;top:' + (cy + R * Math.sin(am)).toFixed(1) + 'px;' + d(T.item + n * T.itemStep + 180) + '">and ' + more + ' more</p>'; }
    if (!n) html += '<p class="cm-none" style="left:' + (sx + 36) + 'px;top:' + selY + 'px;' + d(T.item + 120) + '">' + noneTx + '</p>';
    el.innerHTML = svg + '</svg>' + html;
  }
  window.addEventListener('resize', cmDraw);
  function cmPanel(st) {
    var it = st.it, o = st.o, cl = st.sc.client, row = function (k, v) { return '<div class="dr"><span>' + k + '</span><b>' + v + '</b></div>'; };
    var head = function (eyebrow, title, mono, sub, pills) { return '<div class="cm-sh"><p class="eyebrow">' + eyebrow + '</p><h3' + (mono ? ' class="mono"' : '') + '>' + title + '</h3>' + (sub ? '<div class="muted">' + sub + '</div>' : '') + (pills ? '<div class="cm-pills">' + pills + '</div>' : '') + '</div>'; };
    var foot = function (btns) { return btns ? '<div class="cm-sf">' + btns + '</div>' : ''; };
    var jobBtn = function (id, primary) { return id ? (cl ? '<button type="button" class="btn sm' + (primary ? '' : ' ghost') + '" data-act="job" data-id="' + esc(id) + '">Open the job</button>' : '<button type="button" class="btn sm' + (primary ? '' : ' ghost') + '" data-act="openOrg" data-org="' + o.id + '" data-job="' + esc(id) + '">Open the ' + (primary ? 'full ' : '') + 'job</button>') : ''; };
    if (!it && st.g.k === 'overview') return cmOverviewPanel(o, st.sc);
    var types = function (files) { return cmTypeCounts(files).map(function (t) { return row(esc(t[0]), String(t[1])); }).join(''); };
    if (!it && st.g.k === 'files' && st.folder) {
      var fd = st.folder, fj = fd.j, nf = fd.files.length;
      return head('Job files', fd.job ? esc(jnId(fd.job)) : 'No job yet', !!fd.job, fj ? esc(fj.item) : fd.job ? '' : 'Files sent before a job was opened.', fj ? '<span class="pill ' + jobStatus(fj)[1] + '">' + jobStatus(fj)[0] + '</span>' : '') +
        '<div class="cm-sb">' + row('Files', String(nf)) + row('Latest', fmt(fd.files[0].date)) + row('First', fmt(fd.files[nf - 1].date)) + '<div class="cm-sec"><h4>By type</h4>' + types(fd.files) + '</div></div>' +
        foot((fd.job ? '<button type="button" class="btn sm" data-act="cmZip" data-org="' + o.id + '" data-id="' + esc(fd.job) + '">Download all (zip)</button>' + jobBtn(fd.job, false) : '') + '<button type="button" class="btn sm ghost" data-act="cmFolderUp">Back to all jobs</button>');
    }
    if (!it && st.g.k === 'files') {
      var all = st.g.files, latest = all.slice().sort(byDateDesc)[0];
      return head('Files', 'Files by job', false, all.length ? 'Select a job to open its files.' : 'No files yet.', '') +
        '<div class="cm-sb">' + row('Files', String(all.length)) + row('Jobs with files', String(st.g.list.filter(function (x) { return x.job; }).length)) + (latest ? row('Latest file', fmt(latest.date)) : '') +
        (all.length ? '<div class="cm-sec"><h4>By type</h4>' + types(all) + '</div>' : '') + '</div>';
    }
    if (!it) return head(esc(o.name), esc(st.g.label.split(' · ')[0]), false, 'Nothing here yet.', '') + '<div class="cm-sb"></div>';
    var back = st.g.k === 'overview' ? '<button type="button" class="btn sm ghost" data-act="cmGroup" data-g="overview">Back to overview</button>' : '';
    var body = '';
    if (it.k === 'job') {
      var j = it.j, s = jobStatus(j), pr = cl ? null : priorityOf(j), r = repOf2(o, j.rep), ok = routeOf(j), cur = !j.pending && isOpen(j) ? j.steps[j.done] : '';
      var bars = j.steps.map(function (x, i) { return '<i class="' + (!j.pending && i < j.done ? 'd' : i === j.done && !j.pending ? 'c' : '') + '"></i>'; }).join('');
      var wait = [];
      if (j.fix) wait.push(esc(j.fixNote || 'A correction is needed.'));
      DOCS.forEach(function (q) { if (q.type === 'Quote' && q.status === 'Open' && q.orgId === o.id && q.jobId === j.id && q.fileId) wait.push('Quote ' + esc(q.docNum) + ' for ' + money(docTotal(q)) + ' is waiting for approval.'); });
      body = row('Requested by', esc(r ? r.name : 'Former member')) + row('UN number', '<span class="un">' + esc(j.un || '—') + '</span> · Class ' + esc(j.cls) + ' · PG ' + esc(j.pg)) +
        row('Route', ok ? esc(AP[j.from].city) + ' to ' + esc(AP[j.to].city) + ' · ' + j.mode : j.toText ? 'To ' + esc(j.toText) + ' · ' + j.mode : 'Not set') + row('Required by', j.req ? fmt(isoDate(j.req)) : 'Not set') + (cl ? row('Your reference', '<span class="mono">' + esc(j.ref || '—') + '</span>') : row('Owner', j.owner ? esc(j.owner) : '<span class="muted">Unassigned</span>')) +
        '<div class="cm-sec"><h4>Progress · ' + (j.pending ? 'not started' : Math.min(j.done, j.steps.length) + ' of ' + j.steps.length + ' steps') + '</h4><div class="cm-steps">' + bars + '</div><p>' + (j.pending ? 'Waiting for HazPack to accept the request.' : cur ? 'Up next: <b>' + esc(cur) + '</b>' : 'All steps done.') + '</p></div>' +
        (wait.length ? '<div class="cm-sec"><h4>' + (cl ? 'Waiting on you' : 'Waiting on the client') + '</h4>' + wait.map(function (w) { return '<p>' + w + '</p>'; }).join('') + '</div>' : '');
      var staffBtns = cl ? '' : j.pending ? '<button type="button" class="btn sm ghost" data-act="qAccept" data-org="' + o.id + '" data-id="' + j.id + '">Accept request</button>' : cur ? '<button type="button" class="btn sm ghost" data-act="qStep" data-org="' + o.id + '" data-id="' + j.id + '" title="Complete: ' + esc(cur) + '">Complete step</button>' : '';
      return head(isOpen(j) ? 'Open job' : 'Job', esc(jn(j)), true, esc(j.item), '<span class="pill ' + s[1] + '">' + s[0] + '</span>' + (pr ? '<span class="pill ' + pr[1] + '">' + pr[0] + '</span>' : '')) + '<div class="cm-sb">' + body + '</div>' + foot(jobBtn(j.id, true) + staffBtns + back);
    }
    if (it.k === 'rep') {
      var p = it.r, njobs = o.jobs.filter(function (x) { return x.rep === p.id; }).length;
      body = row('Email', esc(p.email)) + row('Phone', p.phone ? esc(p.phone) : '<span class="muted">Not set</span>') + row('Access', p.admin ? 'Admin · sees every job' : 'Member · sees own jobs') + row('Email alerts', p.notify ? 'On' : 'Off') + row('Jobs requested', String(njobs));
      return head(cl && p.id === S.rep.id ? 'You' : 'Person', esc(p.name), false, esc(p.title || 'Team member'), '') + '<div class="cm-sb">' + body + '</div>' + foot(cl ? '<button type="button" class="btn sm" data-act="nav" data-v="team">Open team</button>' : '<button type="button" class="btn sm" data-act="openOrg" data-org="' + o.id + '">Open portal</button>');
    }
    if (it.k === 'file') {
      var f = it.f, canView = /\.(pdf|png|jpe?g|gif|webp)$/i.test(f.name);
      body = row('Type', TYPE_LABEL[f.type]) + row('Job', f.job ? '<span class="mono">' + esc(jnId(f.job)) + '</span>' : '<span class="muted">No job yet</span>') + row('Added', fmt(f.date)) + row('Added by', esc(f.by)) + row('Size', esc(f.size)) + (f.note ? row('Note', esc(f.note)) : '');
      return head('File', esc(f.name), true, '', '') + '<div class="cm-sb">' + body + '</div>' + foot((canView ? '<button type="button" class="btn sm" data-act="view" data-id="' + f.id + '">View</button>' : '') + '<button type="button" class="btn sm ghost" data-act="dl" data-id="' + f.id + '">Download</button>' + jobBtn(f.job, false));
    }
    var x = it.x, inv = it.k === 'inv', stt = inv ? (x.status === 'Paid' ? ['Paid', 'ok'] : isOverdue(x) ? ['Overdue', 'bad'] : ['Due', 'warn']) : ['Waiting for approval', 'warn'];
    body = row('Amount', money(docTotal(x))) + row('Date', mdy(x.date)) + (inv ? row('Due', mdy(dueOf(x))) + row('Paid', x.datePaid ? mdy(x.datePaid) : '<span class="muted">Not yet</span>') : '') + row('Job', x.jobId ? '<span class="mono">' + esc(jnId(x.jobId)) + '</span>' : '<span class="muted">No job yet</span>') +
      (cl ? '' : row('Bill to', esc(x.name || x.company || '—')) + row('Client copy', x.fileId ? 'Sent' : 'Not sent'));
    var btns;
    if (!cl) btns = '<button type="button" class="btn sm" data-act="docOpen" data-id="' + x.id + '">Open in Billing</button>' + jobBtn(x.jobId, false);
    else if (inv) btns = '<button type="button" class="btn sm" data-act="view" data-id="' + x.fileId + '">View</button><button type="button" class="btn sm ghost" data-act="dl" data-id="' + x.fileId + '">Download</button>' + jobBtn(x.jobId, false);
    else btns = '<button type="button" class="btn sm" data-act="quoteAccept" data-id="' + x.fileId + '">Accept quote</button><button type="button" class="btn sm ghost" data-act="quoteDecline" data-id="' + x.fileId + '">Decline</button><button type="button" class="btn sm ghost" data-act="view" data-id="' + x.fileId + '">View</button>';
    return head(inv ? 'Invoice' : 'Quote', esc(x.docNum), true, '', '<span class="pill ' + stt[1] + '">' + stt[0] + '</span>') + '<div class="cm-sb">' + body + '</div>' + foot(btns + back);
  }
  function clientMapView() {
    var st = cmState(), o = st.o;
    var left = staff() ? '<label class="cm-pick">Company <select id="cmOrg" aria-label="Client company">' + Object.keys(ORGS).map(function (k) { return '<option value="' + k + '"' + (k === o.id ? ' selected' : '') + '>' + esc(ORGS[k].name) + '</option>'; }).join('') + '</select></label>'
      : '<span class="cm-pick"><b style="color:#fff">' + esc(o.name) + '</b>' + (S.rep.admin ? '' : ' · your jobs only') + '</span>';
    var right = st.folder ? '<span class="cm-crumb">Files <span aria-hidden="true">›</span> <b class="' + (st.folder.job ? 'mono' : '') + '">' + esc(st.folder.job ? jnId(st.folder.job) : 'No job yet') + '</b><button type="button" class="linkbtn" data-act="cmFolderUp">All jobs</button></span>'
      : st.g.k === 'files' ? '<span>Select a job to see its files</span>' : '<span>Select a group, then an item</span>';
    return '<div class="cm-frame"><div class="cm-top">' + left + right + '</div><div class="cm-body"><div class="cm-canvas" id="cmGraph" role="group" aria-label="Map of ' + esc(o.name) + '"></div><aside class="cm-side" aria-label="Selected item">' + cmPanel(st) + '</aside></div></div>';
  }

  /* ----- actions and changes ----- */
  function extrasAct(a, ds) {
    if (a === 'backList' || a === 'openOrg' || a === 'nav' || a === 'job') S.stepI = null;
    switch (a) {
      case 'cmMode': S.cmap = ds.m === '1'; if (S.cmap) { S.cmGroup = 'overview'; S.cmItem = null; S.cmFolder = null; } render(); return true;
      case 'dMode': S.dmap = ds.m === '1'; if (S.dmap) { S.cmGroup = 'overview'; S.cmItem = null; S.cmFolder = null; } render(); return true;
      case 'cmGroup': S.cmGroup = ds.g; S.cmItem = null; S.cmFolder = null; render(); return true;
      case 'cmFolder': S.cmGroup = 'files'; S.cmFolder = ds.id.slice(3); S.cmItem = null; render(); return true;
      case 'cmFolderUp': S.cmFolder = null; S.cmItem = null; render(); return true;
      case 'cmZip': withOrg(ds.org, function () { zipJob(ds.id); }); return true;
      case 'cmItem': S.cmItem = ds.id; render(); return true;
      case 'stepOpen': S.stepJ = S.job; S.stepI = +ds.i; render(); return true;
      case 'stepClose': S.stepI = null; render(); return true;
      case 'stepNote':
        var jn = getJob(S.stepJ), lab = jn && jn.steps[S.stepI]; if (!lab) return true;
        jn.notes[lab] = document.getElementById('sn').value.trim(); logEv(jn, staffName(), 'Added a note on ' + lab); render(); toast('Note saved.'); return true;
      case 'mapToggle': S.mapHide = !S.mapHide; render(); return true;
      case 'calNav': S.calM = (S.calM || 0) + (+ds.n); render(); return true;
      case 'calDay': S.calDay = ds.d; render(); return true;
      case 'qStep': withOrg(ds.org, function () { act('stepNext', { id: ds.id }); }); return true;
      case 'qAccept': withOrg(ds.org, function () { act('accept', { id: ds.id }); }); return true;
      case 'qFlag':
        openModal('<form class="modal" id="qfForm" data-org="' + ds.org + '" data-id="' + ds.id + '" role="dialog" aria-modal="true" aria-label="Flag a correction"><h2>Flag a correction on ' + esc(ds.id) + '</h2><p class="muted" style="margin:0">The client is notified that this job needs a correction before it can be cleared to ship.</p><label class="f" for="fixnote">What needs correcting<input id="fixnote" type="text" required></label><div class="row"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button><button type="submit" class="btn">Flag for correction</button></div></form>'); return true;
      case 'zipJob': zipJob(ds.id); return true;
      case 'reqToggle': S.openReq = S.openReq || {}; S.openReq[ds.id] = !S.openReq[ds.id]; render(); return true;
      case 'quoteAccept': quoteModal(ds.id, true); return true;
      case 'quoteDecline': quoteModal(ds.id, false); return true;
      case 'withdraw':
        if (armW !== ds.id) { armW = ds.id; render(); setTimeout(function () { if (armW === ds.id) { armW = null; render(); } }, 3500); return true; }
        var j = getJob(ds.id); armW = null; if (!j) return true;
        clientAct({ action: 'withdrawJob', jobId: j.id }, function () { S.job = null; S.mobileDetail = false; render(); toast('Request withdrawn.'); }); return true;
    }
    return false;
  }
  function extrasChange(el) {
    if (el.id === 'js') { S.js = el.value; render(); return true; }
    if (el.id === 'cmOrg') { S.cmOrg = el.value; S.cmItem = null; S.cmFolder = null; render(); return true; }
    if (el.id === 'sc') { flipBefore(); S.sc = el.value; render(); return true; }
    if (el.id === 'so') { flipBefore(); S.so = el.value; render(); return true; }
    if (el.id === 'owner') { var jo = getJob(S.job); jo.owner = el.value; logEv(jo, staffName(), el.value ? 'Assigned the job to ' + el.value : 'Removed the job owner'); render(); toast(el.value ? 'Assigned to ' + el.value + '.' : 'Owner removed.'); return true; }
    if (el.id === 'prio') { var jp = getJob(S.job); jp.pri = el.value; logEv(jp, staffName(), el.value ? 'Set the priority to ' + el.value : 'Set the priority back to automatic'); render(); return true; }
    return false;
  }

  /* ----- drag and drop: drop a file on any file box ----- */
  function dropZone(e) { var z = e.target && e.target.closest ? e.target.closest('label.f') : null; return z && z.querySelector('input[type=file]') ? z : null; }
  ['dragenter', 'dragover'].forEach(function (ev) {
    document.addEventListener(ev, function (e) {
      var z = dropZone(e);
      if (z) { e.preventDefault(); z.classList.add('drag'); } else if (e.dataTransfer && [].indexOf.call(e.dataTransfer.types || [], 'Files') > -1) e.preventDefault();
    });
  });
  document.addEventListener('dragleave', function (e) { var z = dropZone(e); if (z && !z.contains(e.relatedTarget)) z.classList.remove('drag'); });
  document.addEventListener('drop', function (e) {
    var z = dropZone(e); [].forEach.call(document.querySelectorAll('label.f.drag'), function (x) { x.classList.remove('drag'); });
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    if (!z) return;
    var inp = z.querySelector('input[type=file]'), files = e.dataTransfer.files;
    if (!inp.multiple) { var dt = new DataTransfer(); dt.items.add(files[0]); files = dt.files; }
    inp.files = files; inp.dispatchEvent(new Event('change', { bubbles: true }));
  });

  /* ----- fit the invoice paper to a narrow screen ----- */
  function fitPaper() {
    var w = document.querySelector('.paperwrap'), p = w && w.querySelector('.paper'); if (!p) return;
    var z = Math.min(1, (w.clientWidth - 36) / 816); p.style.zoom = z > 0 && z < 1 ? z : '';
  }
  window.addEventListener('resize', fitPaper);



  /* ---------- events ---------- */
  document.addEventListener('submit', function (e) {
    var f = e.target.id;
    if (f === 'orgForm') {
      e.preventDefault();
      var slug = document.getElementById('oid').value.trim().toLowerCase(); S.orgIdVal = slug; var go = document.getElementById('oGo'); go.disabled = true;
      apiCall('POST', '/api/portal-login', { slug: slug, password: document.getElementById('opw').value }).then(function (r) {
        if (!r.ok) { S.orgErr = r.data.error || 'That did not work. Please try again.'; render(); return; }
        S.org = stubOrg(r.data.org.name, r.data.profiles); S.orgErr = ''; S.stage = 'pin'; S.pendingRep = null; S.pin = ''; render();
      });
    } else if (f === 'staffForm') {
      e.preventDefault(); document.getElementById('sGo').disabled = true;
      apiCall('POST', '/api/portal-staff-login', { key: document.getElementById('skey').value }).then(function (r) {
        if (!r.ok) { S.orgErr = r.data.error || 'That did not work.'; render(); return; }
        enter('staff');
      });
    } else if (f === 'addRep') {
      e.preventDefault();
      var pin = document.getElementById('rp').value.trim();
      if (!/^\d{4}$/.test(pin)) { toast('The PIN must be 4 digits.'); return; }
      var rb = { action: 'addRep', name: document.getElementById('rn').value.trim(), title: document.getElementById('rt').value.trim(), email: document.getElementById('re').value.trim(), pin: pin, admin: document.getElementById('radm').checked };
      if (!staff()) { clientAct(rb, function () { toast('Person added. They can sign in with their PIN.'); }); return; }
      rb.orgId = S.org.id; flush().then(function () { return apiCall('POST', '/api/portal-staff', rb); }).then(function (r) { if (!r.ok) { toast(r.data.error || 'That did not work.'); return; } return reload().then(function () { toast('Person added. They can sign in with their PIN.'); }); });
    } else if (f === 'acctForm') {
      e.preventDefault(); saveAcct();
    } else if (f === 'addOrg') {
      e.preventDefault();
      var id = document.getElementById('oi').value.trim().toLowerCase().replace(/[^a-z0-9-]/g, ''), p = document.getElementById('ap').value.trim(), pw = document.getElementById('op').value;
      if (!id) { toast('Enter an organization ID.'); return; }
      if (!/^\d{4}$/.test(p)) { toast('The PIN must be 4 digits.'); return; }
      flush().then(function () { return apiCall('POST', '/api/portal-staff', { action: 'createOrg', slug: id, name: document.getElementById('on').value.trim(), password: pw, adminName: document.getElementById('an').value.trim(), adminEmail: document.getElementById('ae').value.trim(), adminTitle: 'Admin', pin: p }); }).then(function (r) {
        if (!r.ok) { toast(r.data.error || 'That did not work.'); return; }
        return reload().then(function () { render(); toast('Company added. Give them the organization ID, password and PIN.'); });
      });
    }
  });
  document.addEventListener('input', function (e) { if (e.target.id === 'q') { flipBefore(); S.q = e.target.value; render(); return; } billingInput(e.target); });
  document.addEventListener('change', function (e) {
    if (e.target.dataset && e.target.dataset.svc) { updateMsel(); return; }
    if (billingChange(e.target) || extrasChange(e.target)) return;
    if (e.target.id === 'ff') { S.ff = e.target.value; render(); }
    if (e.target.id === 'fp') { flipBefore(); S.fp = e.target.value; render(); }
    if (e.target.id === 'fm') { flipBefore(); S.fm = e.target.value; render(); }
    if (e.target.dataset && e.target.dataset.act === 'toggleAlert') { var r = repOf(e.target.dataset.id), on = e.target.checked; if (!staff()) { clientAct({ action: 'editRep', repId: r.id, notify: on }, function () { toast(r.name + ': email alerts ' + (on ? 'on' : 'off') + '.'); }); return; } r.notify = on; render(); toast(r.name + ': email alerts ' + (r.notify ? 'on' : 'off') + '.'); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { if (S.stepI != null) { S.stepI = null; render(); } closeModal(); if (S.notif) { S.notif = false; render(); } }
    if (S.stage === 'pin' && S.pendingRep && /^\d$/.test(e.key) && !e.target.matches('input')) act('digit', { d: e.key });
    if (S.stage === 'pin' && S.pendingRep && e.key === 'Backspace') act('pinBack', {});
  });
  ['click', 'keydown', 'mousemove', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, resetIdle, { passive: true }); });
  document.addEventListener('click', function (e) {
    var mp = document.getElementById('mselP'); if (mp && !mp.hidden && !e.target.closest('#msel')) { mp.hidden = true; document.getElementById('mselB').setAttribute('aria-expanded', 'false'); }
    var t = e.target.closest('[data-act]'); if (!t || t.tagName === 'INPUT' || t.tagName === 'SELECT') return;
    if (S.notif && !e.target.closest('.npanel') && !e.target.closest('.bell')) S.notif = false;
    act(t.dataset.act, t.dataset);
  });
  function newPin() { var a = new Uint32Array(1); window.crypto.getRandomValues(a); return String(1000 + (a[0] % 9000)); }
  function addEv(j, text) { j.ev.push([TODAY, text]); }

  function act(a, ds) {
    var o = S.org, j;
    if (polishAct(a, ds) || ideasAct(a, ds) || billingAct(a, ds) || extrasAct(a, ds)) return;
    switch (a) {
      case 'toOrg': apiCall('DELETE', '/api/portal-session', {}); S.stage = 'org'; S.org = null; S.orgErr = ''; render(); break;
      case 'toStaff': S.stage = 'staff'; S.orgErr = ''; render(); break;
      case 'pickRep': S.pendingRep = ds.id; S.pin = ''; S.pinErr = ''; render(); break;
      case 'digit':
        if (S.pin.length >= 4 || S.pinBusy) return; S.pin += ds.d; S.pinErr = '';
        if (S.pin.length === 4) {
          var pinNow = S.pin; S.pinBusy = true; render();
          apiCall('POST', '/api/portal-session', { profileId: S.pendingRep, pin: pinNow }).then(function (r) {
            S.pinBusy = false;
            if (r.ok) { enter('client'); return; }
            S.pinErr = r.status === 429 ? (r.data.error || 'Too many wrong PINs. Try again in 15 minutes, or ask your admin.') : r.status === 401 && /sign in/i.test(r.data.error || '') ? 'Please sign in again.' : 'Incorrect PIN. Try again.';
            S.pin = ''; render();
          });
          break;
        }
        render(); break;
      case 'pinBack': S.pin = S.pin.slice(0, -1); render(); break;
      case 'pinClear': S.pin = ''; S.pinErr = ''; render(); break;
      case 'lock': lock(); break;
      case 'nav': S.view = ds.v; S.notif = false; S.mobileDetail = false; render(); window.scrollTo(0, 0); break;
      case 'job':
        /* Picking a job from the list beside it (desktop): keep the search, filters and scroll position. Coming from anywhere else: start at the top. */
        var inList = S.view === 'jobs' && !staff();
        S.view = 'jobs'; S.job = ds.id; S.jobTab = 'overview'; S.mobileDetail = true; S.notif = false;
        if (!inList) { S.f = 'all'; S.q = ''; S.fp = 'all'; S.fs = 'all'; S.fm = 'all'; }
        render();
        if (!inList) window.scrollTo(0, 0);
        break;
      case 'backList': S.mobileDetail = false; render(); break;
      case 'jobTab': S.jobTab = ds.t; render(); break;
      case 'filter': S.f = ds.f; render(); break;
      case 'bell': S.notif = !S.notif; render(); break;
      case 'readAll': clientAct({ action: 'readNotifs', all: true }); break;
      case 'openNotif': var nn = o.notifs.filter(function (x) { return x.id === ds.id; })[0]; S.notif = false; clientAct({ action: 'readNotifs', ids: [ds.id] }, function () { if (nn.job) act('job', { id: nn.job }); else { S.view = 'dashboard'; render(); } }); break;
      case 'upload': uploadModal(ds.job || '', ds.type || '', ds.step || ''); break;
      case 'request': requestModal(); break;
      case 'closeModal': closeModal(); break;
      case 'mselToggle': var pnl = document.getElementById('mselP'); pnl.hidden = !pnl.hidden; document.getElementById('mselB').setAttribute('aria-expanded', String(!pnl.hidden)); break;
      case 'folder': var cur = S.openF[ds.id] !== undefined ? S.openF[ds.id] : (document.querySelector('.fhead[data-id="' + ds.id + '"]').getAttribute('aria-expanded') === 'true'); S.openF[ds.id] = !cur; render(); break;
      case 'folderAll': vis().forEach(function (jj) { S.openF[jj.id] = ds.o === '1'; }); render(); break;
      case 'view': viewFile(findFile(ds.id)); break;
      case 'dl': var f = findFile(ds.id); ensureBlob(f).then(function (b) { download(f.name, b); }, function (e) { if (!e || e.message !== 'auth') toast('Could not download that file.'); }); break;
      case 'saveRoute':
        j = getJob(ds.job); var dp = parseAp(document.getElementById('rt2').value), rf = document.getElementById('rf').value || 'LAX';
        if (staff()) { j.from = rf; j.to = dp.code; j.toText = dp.text; logEv(j, staffName(), 'Set the route'); closeModal(); render(); toast(routeOf(j) ? 'Route saved: ' + j.from + ' to ' + j.to + '.' : 'Route cleared.'); break; }
        clientAct({ action: 'setRoute', jobId: j.id, from: rf, to: dp.code, toText: dp.text }, function () { closeModal(); var jj = getJob(ds.job); toast(jj && routeOf(jj) ? 'Route saved: ' + jj.from + ' to ' + jj.to + '.' : 'Route cleared.'); }); break;
      case 'accept': j = getJob(ds.id); acceptJob(o, j); break;
      case 'acceptOrg': j = ORGS[ds.org].jobs.filter(function (x) { return x.id === ds.id; })[0]; var prev = S.org; S.org = ORGS[ds.org]; acceptJob(S.org, j, true); S.org = prev; render(); break;
      case 'stepNext':
        j = getJob(ds.id); if (j.done < j.steps.length) { addEv(j, j.steps[j.done]); logEv(j, staffName(), 'Completed: ' + j.steps[j.done]); j.by = j.by || {}; j.by[j.steps[j.done]] = { who: staffName(), date: TODAY }; j.done++; notify(j.id, j.id + ': ' + j.steps[j.done - 1] + '.', 'client'); render(); toast('Step complete. People who can see this job were notified.'); } break;
      case 'stepUndo':
        j = getJob(ds.id); if (j.done > 1) { var lab = j.steps[j.done - 1]; for (var i = j.ev.length - 1; i >= 0; i--) if (j.ev[i][1] === lab) { j.ev.splice(i, 1); break; } j.done--; if (j.by) delete j.by[lab]; logEv(j, staffName(), 'Undid: ' + lab); render(); } break;
      case 'fixOn':
        j = getJob(ds.id); var note = (document.getElementById('fixnote').value || '').trim() || 'Something on this job needs a correction.'; j.fix = true; j.fixNote = note; addEv(j, 'Correction needed: ' + note); logEv(j, staffName(), 'Flagged for correction: ' + note);
        notify(j.id, j.id + ' needs a correction before it can be cleared to ship.', 'client'); render(); toast('Flagged. People who can see this job were notified.'); break;
      case 'fixOff': j = getJob(ds.id); j.fix = false; addEv(j, 'Correction resolved'); logEv(j, staffName(), 'Resolved the correction'); notify(j.id, 'The correction on ' + j.id + ' is resolved.', 'client'); render(); break;
      case 'openOrg': S.org = ORGS[ds.org]; S.rep = S.org.reps.filter(function (r) { return r.admin; })[0]; S.view = ds.job ? 'jobs' : 'dashboard'; S.job = ds.job || null; S.mobileDetail = !!ds.job; render(); break;
      case 'resetOrgPw': var pw = 'portal-' + Math.random().toString(36).slice(2, 10);
        flush().then(function () { return apiCall('POST', '/api/portal-staff', { action: 'resetOrgPassword', orgId: ds.org, password: pw }); }).then(function (r) { if (!r.ok) { toast(r.data.error || 'That did not work.'); return; } openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="New password"><h2>New password for ' + esc(ORGS[ds.org].name) + '</h2><p style="margin:0">Give them this password now. It is not shown again.</p><p class="mono" style="font-size:22px;margin:0">' + pw + '</p><div class="row"><button type="button" class="btn" data-act="closeModal">Done</button></div></div>'); }); break;
      case 'resetPin':
        var rr = repOf(ds.id), np = newPin(o), pinCall = staff() ? flush().then(function () { return apiCall('POST', '/api/portal-staff', { action: 'resetPin', orgId: o.id, repId: rr.id, pin: np }); }) : apiCall('POST', '/api/portal-act', { action: 'resetPin', repId: rr.id, pin: np });
        pinCall.then(function (r) { if (!r.ok) { toast(r.data.error || 'That did not work.'); return; }
        openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="New PIN"><h2>New PIN for ' + esc(rr.name) + '</h2><p style="margin:0">Give them this PIN now. It is not shown again.</p><p class="mono" style="font-size:30px;margin:0;letter-spacing:.3em">' + np + '</p><div class="row"><button type="button" class="btn" data-act="closeModal">Done</button></div></div>'); }); break;
      case 'toggleAdmin':
        var tr = repOf(ds.id);
        if (tr.admin && o.reps.filter(function (x) { return x.admin; }).length < 2) { toast('A company needs at least one admin.'); break; }
        if (!staff()) { var wasMe = tr.id === S.rep.id, want = !tr.admin; clientAct({ action: 'setAdmin', repId: tr.id, admin: want }, function () { if (wasMe && !want) S.view = 'dashboard'; render(); toast(tr.name + (want ? ' is now an admin.' : ' is now a member.')); }); break; }
        tr.admin = !tr.admin; render(); toast(tr.name + (tr.admin ? ' is now an admin.' : ' is now a member.')); break;
      case 'removeRep':
        var rm = repOf(ds.id); if (rm.admin && o.reps.filter(function (x) { return x.admin; }).length < 2) { toast('A company needs at least one admin.'); break; }
        if (!staff()) { clientAct({ action: 'removeRep', repId: ds.id }, function () { toast('Person removed.'); }); break; }
        o.reps = o.reps.filter(function (x) { return x.id !== ds.id; }); render(); toast('Person removed.'); break;
    }
  }
  function acceptJob(org, j, quiet) {
    j.pending = false; j.done = 1; addEv(j, j.steps[0]); logEv(j, staffName(), 'Accepted the request and opened the job');
    org.notifs.unshift({ id: nid('n'), to: 'client', job: j.id, text: 'HazPack received your request and opened job ' + j.id + '.', date: TODAY, read: {} });
    org.notifs.forEach(function (n) { if (n.to === 'staff' && n.job === j.id) n.read.staff = 1; });
    if (!quiet) { render(); toast('Job opened. The requester was notified.'); }
  }

  /* =====================================================================
     DESIGN IDEAS (local sandbox only). Patterns borrowed from beautifului.dev:
     13 Filter table · 14 Sidebar nav · 06 Task rows · 11 Diff table · 16 Flowchart
     ===================================================================== */
  var IC = {
    home: '<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    dash: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    jobs: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    files: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
    inv: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>',
    team: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c2 .7 3.2 2.5 3.5 5.2"/>',
    bill: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h3"/>',
    clients: '<path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20"/>',
    plus: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    panel: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    chev: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    flag: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    box: '<path d="M21 8 12 3 3 8v8l9 5 9-5z"/>',
    back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
    up: '<path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    down: '<path d="M12 4v12M7 11l5 5 5-5"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/>',
    msg: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12z"/>',
    dgd: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="m9 15 2 2 4-4"/>',
    flow: '<rect x="3" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/><path d="M6.5 9v3a2 2 0 0 0 2 2h7a2 2 0 0 1 2 2v-1"/>',
    newreq: '<path d="M12 5v14M5 12h14"/>',
    undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    quote: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
    csv: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>'
  };
  /* Interactive hover button (magicui.design): a dot grows to fill the button, the label slides out and comes back with an arrow */
  function ihb(label, attrs, size) { return '<button ' + attrs + ' class="ihb' + (size ? ' ' + size : '') + '"><span class="ihb-a"><i class="ihb-dot"></i><span class="ihb-t">' + esc(label) + '</span></span><span class="ihb-b" aria-hidden="true"><span class="ihb-t">' + esc(label) + '</span><svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg></span></button>'; }
  function ico(k, cls) { return '<svg class="ic' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + IC[k] + '</svg>'; }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window */ } }
  S.railMin = lsGet('hp-rail-min') === '1'; S.recOpen = lsGet('hp-rec-closed') !== '1';
  S.fs = 'all'; S.fm = 'all'; S.trMode = lsGet('hp-tr-mode') || 'caps'; S.trOpen = {}; S.diffOff = {};

  /* ---------- 14 Sidebar nav ---------- */
  var NAV_IC = { staffhome: 'home', dashboard: 'dash', jobs: 'jobs', files: 'files', invoices: 'inv', team: 'team', billing: 'bill', clients: 'clients' };
  var STATUS_DOT = { 'Request received': 'info', 'In progress': 'warn', 'Needs correction': 'bad', 'Cleared to ship': 'ok', 'Completed': 'mute' };
  function rail() {
    var o = S.org, items = [['dashboard', 'Dashboard', ''], ['jobs', 'Jobs', staff() ? allJobsCount() : vis().length], ['files', 'Files', visFiles().length], ['team', 'Team', (staff() || S.rep.admin) ? o.reps.length : 1]];
    if (!staff()) items.splice(3, 0, ['invoices', 'Invoices', clientInvoices().length]);
    if (staff()) { items.unshift(['staffhome', 'Home', needsCount()]); items.push(['billing', 'Billing', DOCS.length]); items.push(['clients', 'Clients', Object.keys(ORGS).length]); }
    var meName = staff() ? staffName() : S.rep.name, meSub = staff() ? 'Viewing ' + o.name : S.rep.title + (S.rep.admin ? ' · Admin' : '');
    var cur = function (v) { return S.view === v || (v === 'billing' && S.view === 'doc'); };
    var ni = function (attrs, icon, label, extra, on) { return '<button type="button" class="ni"' + attrs + (on ? ' aria-current="page"' : '') + ' title="' + esc(label) + '">' + ico(icon) + '<span class="nl">' + esc(label) + '</span>' + (extra || '') + '</button>'; };
    var recent = vis().slice().sort(function (a, b) { return (b.ev.length ? b.ev[b.ev.length - 1][0] : b.start) - (a.ev.length ? a.ev[a.ev.length - 1][0] : a.start); }).slice(0, 7);
    var recHtml = '<div class="rsec"><div class="rsec-h"><button type="button" class="rsec-t" data-act="recToggle" aria-expanded="' + S.recOpen + '">' + ico('chev', 'cv') + 'Recent jobs</button><button type="button" class="iconbtn" data-act="recSearch" title="Search jobs" aria-label="Search jobs">' + ico('search') + '</button></div>' +
      (S.recOpen ? '<div class="rlist' + (S.recAnim ? ' anim' : '') + '">' + recent.map(function (j) { var s = jobStatus(j); return '<button type="button" class="ni rj" data-act="job" data-id="' + j.id + '"' + (S.view === 'jobs' && S.mobileDetail && S.job === j.id ? ' aria-current="page"' : '') + ' title="' + esc(jn(j) + ' · ' + s[0]) + '"><i class="sdot ' + STATUS_DOT[s[0]] + '"></i><span class="nl">' + esc(jn(j)) + '</span><span class="rj-s">' + esc(j.item) + '</span></button>'; }).join('') + '</div>' : '') + '</div>';
    return '<aside class="rail rail2' + (S.railMin ? ' min' : '') + '">' +
      '<div class="r2-top"><div class="brand"><img class="logo logo-l" src="' + LOGO_L + '" alt="HazPack Compliance"><img class="logo logo-d" src="' + LOGO_D + '" alt="" aria-hidden="true"><img class="logo-mark" src="/assets/favicon.svg" alt="HazPack"></div><span class="r2-btns">' + phoneBtn() + '<button type="button" class="iconbtn" data-act="railMin" aria-label="' + (S.railMin ? 'Expand' : 'Collapse') + ' sidebar" title="' + (S.railMin ? 'Expand' : 'Collapse') + ' sidebar">' + ico('panel') + '</button></span></div>' +
      '<div class="r2-org" title="' + esc(o.name) + '"><span class="oav">' + esc(initials(o.name).slice(0, 2)) + '</span><span class="nl"><b>' + esc(o.name) + '</b><span>' + vis().length + ' ' + (vis().length === 1 ? 'job' : 'jobs') + (staff() || S.rep.admin ? ' across your team' : ' yours') + '</span></span></div>' +
      '<div class="navzone" id="navzone"><i class="glide" aria-hidden="true"></i><i class="actbar" aria-hidden="true"></i>' +
      (staff() ? '' : ni(' data-act="request"', 'plus', 'New job request', '', false)) +
      '<nav class="nav2" aria-label="Portal sections">' + items.map(function (i) { return ni(' data-act="nav" data-v="' + i[0] + '"', NAV_IC[i[0]], i[1], i[2] !== '' ? '<span class="cnt">' + i[2] + '</span>' : '', cur(i[0])); }).join('') + '</nav>' +
      recHtml + '</div>' +
      '<div class="foot"><button type="button" class="iconbtn m-team" data-act="nav" data-v="team" aria-label="Team" title="Team"' + (S.view === 'team' ? ' aria-current="page"' : '') + '>' + ico('team') + '</button><div class="me"><span class="av">' + initials(meName) + '</span><div class="t"><b>' + esc(meName) + '</b><span>' + esc(meSub) + '</span></div><button type="button" class="linkbtn" data-act="lock" style="font-size:12.5px">Log out</button></div></div></aside>';
  }
  /* the hover highlight glides between items; the active bar slides from the last page's item to the new one */
  var lastAct = null;
  function railAfter() {
    var z = document.getElementById('navzone'); if (!z) return;
    var g = z.querySelector('.glide'), bar = z.querySelector('.actbar'), on = z.querySelector('.ni[aria-current=page]');
    var place = function (el, node) { node.style.transform = 'translateY(' + node._y + 'px)'; node.style.height = el.offsetHeight + 'px'; };
    if (on) {
      var y = on.offsetTop, from = lastAct !== null ? lastAct : y;
      bar.style.transition = 'none'; bar.style.height = on.offsetHeight + 'px'; bar.style.transform = 'translateY(' + from + 'px)'; bar.style.opacity = 1;
      void bar.offsetWidth; bar.style.transition = '';
      if (from !== y) bar.style.transform = 'translateY(' + y + 'px)';
      lastAct = y;
    } else { bar.style.opacity = 0; lastAct = null; }
    z.addEventListener('mouseover', function (e) {
      var el = e.target.closest('.ni'); if (!el || !z.contains(el)) return;
      if (g.style.opacity !== '1') { g.style.transition = 'none'; g._y = el.offsetTop; place(el, g); void g.offsetWidth; g.style.transition = ''; }
      g._y = el.offsetTop; place(el, g); g.style.opacity = 1;
    });
    z.addEventListener('mouseleave', function () { g.style.opacity = 0; });
    var hov = z.querySelector('.ni:hover'); if (hov) { g.style.transition = 'none'; g._y = hov.offsetTop; place(hov, g); g.style.opacity = 1; void g.offsetWidth; g.style.transition = ''; }
    /* looping animations (step spinner, correction ping) carry on from where they were instead of restarting */
    var t = performance.now();
    document.querySelectorAll('.tr-i .spin').forEach(function (el) { el.style.animationDelay = -(t % 1100) + 'ms'; });
    document.querySelectorAll('.dk.alert').forEach(function (el) { el.style.setProperty('--ad', -(t % 1600) + 'ms'); });
  }

  /* ---------- 13 Filter table ---------- */
  var FS = [['all', 'All'], ['Request received', 'Requested'], ['In progress', 'In progress'], ['Needs correction', 'Needs correction'], ['Cleared to ship', 'Cleared to ship'], ['Completed', 'Completed']];
  function clientJobsView() {
    if (S.mobileDetail && S.job && getJob(S.job) && !sheetMode()) return detail(getJob(S.job));
    var q = S.q.toLowerCase();
    var base = vis().filter(function (j) {
      if (S.fm === 'Air' && j.mode !== 'Air') return false; if (S.fm === 'Ground' && j.mode !== 'Ground') return false;
      if (showWho() && S.fp !== 'all' && j.rep !== S.fp) return false;
      return !q || (j.id + j.item + j.un + j.ref + (pt(j.to) ? pt(j.to).city + j.to : '')).toLowerCase().indexOf(q) > -1;
    });
    var count = function (k) { return k === 'all' ? base.length : base.filter(function (j) { return jobStatus(j)[0] === k; }).length; };
    var list = sortJobs(base.filter(function (j) { return S.fs === 'all' || jobStatus(j)[0] === S.fs; }));
    var chips = FS.filter(function (c) { return c[0] === 'all' || count(c[0]) || S.fs === c[0]; }).map(function (c) {
      return '<button type="button" class="fchip" data-act="fstat" data-s="' + esc(c[0]) + '" aria-pressed="' + (S.fs === c[0]) + '">' + (c[0] === 'all' ? '' : '<i class="sdot ' + STATUS_DOT[c[0]] + '"></i>') + esc(c[1]) + '<span class="n">' + count(c[0]) + '</span></button>';
    }).join('');
    var who = showWho() ? '<select id="fp" class="mini" aria-label="Filter by person"><option value="all">Everyone</option>' + S.org.reps.map(function (r) { return '<option value="' + r.id + '"' + (S.fp === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>'; }).join('') + '</select>' : '';
    var mode = '<select id="fm" class="mini" aria-label="Filter by transport"><option value="all">Any transport</option><option' + (S.fm === 'Air' ? ' selected' : '') + '>Air</option><option' + (S.fm === 'Ground' ? ' selected' : '') + '>Ground</option></select>';
    var rows = list.map(function (j) {
      var rt = routeOf(j) ? j.from + ' → ' + j.to : j.toText ? (j.from || 'LAX') + ' → ' + esc(j.toText) : '—';
      var on = !!S.sel[j.id];
      return '<tr class="click' + (on ? ' sel' : '') + '" data-act="job" data-id="' + j.id + '" data-flip="job-' + j.id + '"><td class="cbc"><button type="button" class="cbx" role="checkbox" aria-checked="' + on + '" aria-label="Select ' + esc(jn(j)) + '" data-act="selRow" data-id="' + j.id + '">' + ico('check') + '</button></td><td><b class="mono">' + esc(jn(j)) + '</b></td><td class="ell">' + esc(j.item) + '</td><td class="mono nowrap">' + rt + '</td><td class="nowrap">' + (j.req ? fmtS(isoDate(j.req)) : '<span class="muted">—</span>') + '</td><td class="nowrap">' + progBar(j) + '</td><td>' + pill(j) + '</td>' + (showWho() ? '<td class="ell muted">' + esc(repName(j.rep)) + '</td>' : '') + '</tr>';
    }).join('');
    return '<div class="ftbl">' +
      '<div class="ftbl-bar"><div class="fchips" role="group" aria-label="Filter by status">' + chips + '</div><div class="ftbl-tools"><label class="fsearch">' + ico('search') + '<input id="q" type="search" placeholder="Search jobs" value="' + esc(S.q) + '" aria-label="Search jobs"></label>' + mode + who + jobSortSel().replace('<select', '<select class="mini"') + '</div></div>' +
      '<div class="ftbl-card">' + (list.length ? '<table><thead><tr><th class="cbc">' + selAllBox(list) + '</th><th>Job</th><th>Contents</th><th>Route</th><th>Required by</th><th>Progress</th><th>Status</th>' + (showWho() ? '<th>Requested by</th>' : '') + '</tr></thead><tbody>' + rows + '</tbody></table>' :
        '<div class="ftbl-empty">' + emptyS('No jobs match', 'Try another status, search or filter.', '<button type="button" class="btn sm ghost" data-act="fclear">Clear filters</button>') + '</div>') + '</div>' + bulkDock() + '</div>';
  }
  /* rows that stay slide to their new place; new rows fade in */
  var FLIP = null;
  function flipBefore() { FLIP = {}; document.querySelectorAll('[data-flip]').forEach(function (el) { FLIP[el.getAttribute('data-flip')] = el.getBoundingClientRect().top; }); }
  function flipAfter() {
    var old = FLIP; FLIP = null; if (!old || !window.matchMedia('(prefers-reduced-motion: no-preference)').matches) return;
    var had = Object.keys(old).length;
    document.querySelectorAll('[data-flip]').forEach(function (el, i) {
      var k = el.getAttribute('data-flip'), top = el.getBoundingClientRect().top;
      if (old[k] !== undefined) { var d = old[k] - top; if (Math.abs(d) > 1) el.animate([{ transform: 'translateY(' + d + 'px)' }, { transform: 'none' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' }); }
      else if (had) el.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: Math.min(i, 8) * 25, easing: 'ease-out', fill: 'backwards' });
    });
  }

  /* ---------- 06 Task rows ---------- */
  function stepBy(j, label) { return j.by && j.by[label] && j.by[label].date ? j.by[label] : null; }
  function stepDate(j, label) { var e = j.ev.filter(function (x) { return x[1] === label; })[0]; return e ? e[0] : null; }
  function taskRows(j) {
    var n = j.steps.length, done = Math.min(j.done, n);
    var rows = j.steps.map(function (label, i) {
      var st = j.pending ? 'next' : i < j.done ? 'done' : i === j.done ? (j.fix ? 'fix' : 'now') : 'next';
      var files = stepFiles(j, label), when = stepDate(j, label), key = j.id + ':' + i, open = S.trOpen[key] === undefined ? (staff() && (st === 'now' || st === 'fix')) : !!S.trOpen[key];
      var icon = st === 'done' ? '<span class="tr-i done">' + ico('check') + '</span>' : st === 'now' ? '<span class="tr-i now"><svg class="spin" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg><b>' + (i + 1) + '</b></span>' : st === 'fix' ? '<span class="tr-i fix">!</span>' : '<span class="tr-i next">' + (i + 1) + '</span>';
      var chip = { done: ['Completed', 'ok'], now: ['In progress', 'info'], fix: ['Needs correction', 'bad'], next: ['Up next', 'low'] }[st];
      var meta = files.length ? files.length + (files.length === 1 ? ' file' : ' files') : st === 'done' && when ? fmtS(when) : '';
      var sub = [];
      if (st === 'done') sub.push(['check', 'Completed by HazPack', when ? fmt(when) : '']);
      if (st === 'now') sub.push(['bolt', 'HazPack is working on this step', 'now']);
      if (st === 'fix') sub.push(['flag', j.fixNote || 'A correction is needed before this step can finish', staff() ? 'waiting on the client' : 'waiting on you']);
      files.forEach(function (f) { sub.push(['files', f.name, fmtS(f.date), f.id]); });
      if (st === 'next') sub.push(['box', 'Starts after ' + (i ? j.steps[i - 1].toLowerCase() : 'the job is opened'), '']);
      var sa = '';
      if (staff()) {
        var h = STEP_HELP[label] || ['', null];
        if (st === 'done' && stepBy(j, label)) sub[0] = ['check', 'Completed by ' + byName(stepBy(j, label).who), fmt(stepBy(j, label).date)];
        if (j.notes && j.notes[label]) sub.push(['msg', 'Note: ' + j.notes[label], 'staff only']);
        sa = (st === 'now' ? '<button type="button" class="btn sm" data-act="stepNext" data-id="' + j.id + '">Complete step</button>' : '') +
          (st === 'done' && i === j.done - 1 && j.done > 1 ? '<button type="button" class="btn ghost sm" data-act="stepUndo" data-id="' + j.id + '">Undo this step</button>' : '') +
          (h[1] && h[1][1] !== '__inv' ? '<button type="button" class="btn ghost sm" data-act="upload" data-job="' + j.id + '" data-type="' + h[1][1] + '" data-step="' + esc(label) + '">' + h[1][0] + '</button>' : '') +
          (h[1] && h[1][1] === '__inv' ? '<button type="button" class="btn ghost sm" data-act="docNew" data-m="Invoice" data-org="' + S.org.id + '" data-job="' + j.id + '">Create invoice</button>' : '') +
          '<button type="button" class="linkbtn" data-act="stepOpen" data-i="' + i + '">Details and notes</button>';
      }
      return '<div class="tr ' + st + (open ? ' open' : '') + '"><button type="button" class="tr-h" data-act="trToggle" data-k="' + key + '" aria-expanded="' + open + '">' + icon + '<span class="tr-l">' + esc(label) + '</span><span class="tr-m">' + meta + '</span><span class="pill ' + chip[1] + '">' + chip[0] + '</span>' + ico('chev', 'cv') + '</button>' +
        '<div class="tr-b"><div class="tr-bi">' + sub.map(function (s) { return '<div class="tr-s">' + ico(s[0]) + '<span class="ell">' + esc(s[1]) + '</span><span class="muted">' + esc(s[2]) + '</span>' + (s[3] ? '<button type="button" class="linkbtn" data-act="view" data-id="' + s[3] + '">View</button>' : '') + '</div>'; }).join('') + (sa ? '<div class="tr-acts">' + sa + '</div>' : '') + '</div></div></div>';
    }).join('');
    return '<div class="trwrap ' + S.trMode + '"><div class="trhead"><div><b>Progress</b><span class="muted">' + (j.pending ? 'Waiting for HazPack to accept' : done + ' of ' + n + ' steps done') + '</span></div><div class="seg2" role="group" aria-label="Show progress as"><button type="button" data-act="trMode" data-m="caps" aria-pressed="' + (S.trMode === 'caps') + '">Capsules</button><button type="button" data-act="trMode" data-m="list" aria-pressed="' + (S.trMode === 'list') + '">List</button></div></div><div class="trs">' + rows + '</div></div>';
  }

  /* ---------- 11 Diff table ---------- */
  /* Sample only: what HazPack would propose for the job flagged for correction. A real version would come from the staff "Flag for correction" form. */
  var DEMO_DIFF = { 'HP-2610-031': { title: 'Declaration vs. package marking', rows: [['UN number', 'UN3373'], ['Proper shipping name', 'Biological substance, Category B'], ['Net quantity', '1.2 kg', '1.0 kg'], ['Quantity on DGD', '1 package, 1.2 kg', '1 package, 1.0 kg'], ['Packing instruction', 'P650']] } };
  function diffOf(j) { return j.fix ? (j.fixDiff || DEMO_DIFF[j.id] || null) : null; }
  function diffCard(j) {
    var d = diffOf(j); if (!d) return '';
    var ch = d.rows.filter(function (r) { return r.length > 2; }), on = ch.filter(function (r) { return !S.diffOff[j.id + r[0]]; });
    if (staff()) {
      var ro = d.rows.map(function (r) { return r.length < 3 ? '<tr><td class="muted">' + esc(r[0]) + '</td><td colspan="2">' + esc(r[1]) + '</td></tr>' : '<tr class="dif del ro"><td>' + esc(r[0]) + '</td><td colspan="2"><span class="dv">' + esc(r[1]) + '</span></td></tr><tr class="dif add ro"><td></td><td colspan="2"><span class="dv">' + esc(r[2]) + '</span></td></tr>'; }).join('');
      return '<div class="pad" style="padding-bottom:0"><div class="dtbl"><div class="dtbl-h"><b>' + esc(d.title || 'Proposed correction') + '</b><span class="pill bad">Waiting on the client</span></div><table><thead><tr><th>Field</th><th colspan="2">Value</th></tr></thead><tbody>' + ro + '</tbody></table>' +
        '<div class="dtbl-f"><span class="muted">' + ch.length + (ch.length === 1 ? ' change' : ' changes') + ' sent to the client to confirm</span><button type="button" class="btn sm ghost" data-act="fixOff" data-id="' + j.id + '">Resolve correction</button></div></div></div>';
    }
    var body = d.rows.map(function (r) {
      if (r.length < 3) return '<tr><td class="muted">' + esc(r[0]) + '</td><td colspan="2">' + esc(r[1]) + '</td></tr>';
      var off = !!S.diffOff[j.id + r[0]], box = '<span class="dbox' + (off ? '' : ' on') + '">' + (off ? '' : ico('check')) + '</span>';
      return '<tr class="dif del' + (off ? ' off' : '') + '" data-act="diffRow" data-k="' + esc(j.id + r[0]) + '"><td>' + esc(r[0]) + '</td><td><span class="dv">' + esc(r[1]) + '</span></td><td class="dck">' + box + '</td></tr>' +
        '<tr class="dif add' + (off ? ' off' : '') + '" data-act="diffRow" data-k="' + esc(j.id + r[0]) + '"><td></td><td><span class="dv">' + esc(r[2]) + '</span></td><td></td></tr>';
    }).join('');
    return '<div class="pad" style="padding-bottom:0"><div class="dtbl"><div class="dtbl-h"><b>' + esc(d.title || 'Proposed correction') + '</b><span class="muted">Click a changed row to keep or drop it</span></div>' +
      '<table><thead><tr><th>Field</th><th>Value</th><th></th></tr></thead><tbody>' + body + '</tbody></table>' +
      '<div class="dtbl-f"><span class="muted">' + ch.length + (ch.length === 1 ? ' change' : ' changes') + ' proposed · ' + on.length + ' selected</span><button type="button" class="btn sm" data-act="diffApply" data-id="' + j.id + '"' + (on.length ? '' : ' disabled') + '>Confirm ' + on.length + (on.length === 1 ? ' change' : ' changes') + '</button></div></div></div>';
  }

  /* staff: propose exact changes when flagging, so the client gets a diff table to confirm */
  var DF_FIELDS = [['un', 'UN number'], ['item', 'Proper shipping name'], ['cls', 'Hazard class'], ['pg', 'Packing group'], ['qty', 'Quantity'], ['mode', 'Transport'], ['ref', 'Reference']];
  var dfN = 0;
  document.addEventListener('change', function (e) { if (e.target.classList && e.target.classList.contains('df-f')) { var o = e.target.selectedOptions[0]; e.target.parentNode.querySelector('.df-c').textContent = (o && o.dataset.cur) || ''; } });
  function dfRow(j, k) {
    var i = ++dfN, f = DF_FIELDS.filter(function (x) { return x[0] === k; })[0];
    return '<div class="df-row" data-i="' + i + '"><select class="mini df-f" aria-label="Field">' + '<option value="">Choose a field</option>' + DF_FIELDS.map(function (x) { return '<option value="' + x[0] + '" data-cur="' + esc(j[x[0]] || '') + '"' + (x[0] === k ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '<option value="other" data-cur="">Something else</option></select>' +
      '<span class="df-c" title="Now on the job">' + esc(f ? j[f[0]] || '' : '') + '</span><span class="df-ar">→</span><input type="text" class="df-n" placeholder="Corrected value" aria-label="Corrected value"><button type="button" class="iconbtn" data-act="dfDel" data-i="' + i + '" aria-label="Remove this change">' + ico('x') + '</button></div>';
  }
  function dfEditor(j) {
    return '<div class="df"><div class="df-h"><b>Proposed changes</b><span class="muted">Optional. The client sees these as a before-and-after table and confirms them.</span></div><div id="dfRows">' + dfRow(j, 'qty') + '</div><button type="button" class="linkbtn" data-act="dfAdd" data-id="' + j.id + '">+ Add another change</button></div>';
  }
  function dfRead(j) {
    var rows = [], used = {};
    document.querySelectorAll('.df-row').forEach(function (r) {
      var sel = r.querySelector('.df-f'), k = sel.value, nv = r.querySelector('.df-n').value.trim(); if (!k || !nv) return;
      var label = k === 'other' ? 'Other' : sel.selectedOptions[0].textContent, cur = k === 'other' ? '—' : String(j[k] || '—');
      if (nv !== cur) { rows.push([label, cur, nv]); used[k] = 1; }
    });
    if (!rows.length) return null;
    var ctx = [['un', 'UN number'], ['item', 'Proper shipping name']].filter(function (x) { return !used[x[0]] && j[x[0]]; }).map(function (x) { return [x[1], j[x[0]]]; });
    return { title: 'Proposed correction', rows: ctx.concat(rows) };
  }

  /* ---------- staff jobs: the same filter table, across every client company ---------- */
  function staffJobsView() {
    var all = []; Object.keys(ORGS).forEach(function (k) { ORGS[k].jobs.forEach(function (j) { all.push(j); }); });
    var q = S.q.toLowerCase(), sc = S.sc || '', so = S.so || '';
    var base = all.filter(function (j) {
      var o = orgOfJob(j.id);
      if (sc && o.id !== sc) return false;
      if (so === 'none' && j.owner) return false; if (so && so !== 'none' && j.owner !== so) return false;
      if (S.fm === 'Air' && j.mode !== 'Air') return false; if (S.fm === 'Ground' && j.mode !== 'Ground') return false;
      return !q || (j.id + j.item + j.un + j.ref + o.name + j.owner).toLowerCase().indexOf(q) > -1;
    });
    var count = function (k) { return k === 'all' ? base.length : base.filter(function (j) { return jobStatus(j)[0] === k; }).length; };
    var list = sortJobs(base.filter(function (j) { return S.fs === 'all' || jobStatus(j)[0] === S.fs; }));
    var chips = FS.filter(function (c) { return c[0] === 'all' || count(c[0]) || S.fs === c[0]; }).map(function (c) {
      return '<button type="button" class="fchip" data-act="fstat" data-s="' + esc(c[0]) + '" aria-pressed="' + (S.fs === c[0]) + '">' + (c[0] === 'all' ? '' : '<i class="sdot ' + STATUS_DOT[c[0]] + '"></i>') + esc(c[1]) + '<span class="n">' + count(c[0]) + '</span></button>';
    }).join('');
    var tools = '<label class="fsearch">' + ico('search') + '<input id="q" type="search" placeholder="Search jobs, clients, owners" value="' + esc(S.q) + '" aria-label="Search jobs"></label>' +
      '<select id="sc" class="mini" aria-label="Client company"><option value="">All companies</option>' + Object.keys(ORGS).map(function (k) { return '<option value="' + k + '"' + (sc === k ? ' selected' : '') + '>' + esc(ORGS[k].name) + '</option>'; }).join('') + '</select>' +
      '<select id="so" class="mini" aria-label="Owner"><option value="">All owners</option>' + OWNERS.map(function (n) { return '<option value="' + n + '"' + (so === n ? ' selected' : '') + '>' + n + '</option>'; }).join('') + '<option value="none"' + (so === 'none' ? ' selected' : '') + '>Unassigned</option></select>' +
      '<select id="fm" class="mini" aria-label="Filter by transport"><option value="all">Any transport</option><option' + (S.fm === 'Air' ? ' selected' : '') + '>Air</option><option' + (S.fm === 'Ground' ? ' selected' : '') + '>Ground</option></select>' + jobSortSel().replace('<select', '<select class="mini"');
    var rows = list.map(function (j) {
      var o = orgOfJob(j.id), on = !!S.sel[j.id];
      return '<tr class="click' + (on ? ' sel' : '') + '" data-act="openOrg" data-org="' + o.id + '" data-job="' + j.id + '" data-flip="job-' + j.id + '"><td class="cbc"><button type="button" class="cbx" role="checkbox" aria-checked="' + on + '" aria-label="Select ' + esc(jn(j)) + '" data-act="selRow" data-id="' + j.id + '">' + ico('check') + '</button></td>' +
        '<td><b class="mono">' + esc(jn(j)) + '</b><div class="sub2 ell">' + esc(j.item) + '</div></td><td><span class="ell" style="display:block;max-width:190px">' + esc(o.name) + '</span><div class="sub2">' + esc(repName2(o, j.rep)) + '</div></td><td class="nowrap">' + ownChip(j) + '</td><td>' + pill(j) + '</td><td class="nowrap">' + progBar(j) + '</td><td>' + priChip(j) + '</td><td class="nowrap">' + (j.req ? fmtS(isoDate(j.req)) : '<span class="muted">—</span>') + '</td><td class="qa-c"><span class="qa">' + qaButtons(o, j) + '</span></td></tr>';
    }).join('');
    var open = all.filter(isOpen).length, fix = all.filter(function (j) { return j.fix; }).length, req = all.filter(function (j) { return j.pending; }).length;
    var stat = function (v, k) { return '<div class="sl"><b>' + v + '</b><span>' + k + '</span></div>'; };
    return '<div class="statline">' + stat(all.length, 'Total jobs') + stat(open, 'Open') + stat(req, 'Requests to accept') + stat(fix, 'Needs correction') + '</div>' +
      '<div class="ftbl"><div class="ftbl-bar"><div class="fchips" role="group" aria-label="Filter by status">' + chips + '</div><div class="ftbl-tools">' + tools + '</div></div>' +
      '<div class="ftbl-card">' + (list.length ? '<table><thead><tr><th class="cbc">' + selAllBox(list) + '</th><th>Job</th><th>Client</th><th>Owner</th><th>Status</th><th>Progress</th><th>Priority</th><th>Required by</th><th></th></tr></thead><tbody>' + rows + '</tbody></table>' :
        '<div class="ftbl-empty">' + emptyS('No jobs match', 'Try another status, search or filter.', '<button type="button" class="btn sm ghost" data-act="fclear">Clear filters</button>') + '</div>') + '</div>' + bulkDock() + '</div>';
  }

  /* ---------- 16 Flowchart ---------- */
  var SVC_STEPS = { class: [LB.cls], pack: [LB.pack], temp: [LB.temp], dry: [LB.dry], insp: [LB.insp], dgd: [LB.dgdp, LB.dgd], consult: [LB.consult], emerg: [LB.emerg] };
  function flowHtml(j) {
    var stOf = function (label) { var i = j.steps.indexOf(label); return j.pending || i < 0 ? 'next' : i < j.done ? 'done' : i === j.done ? (j.fix ? 'fix' : 'now') : 'next'; };
    var node = function (label, cls) { var s = cls || stOf(label); return '<div class="fn st-' + s + '"><span class="fn-d"></span><span>' + esc(label) + '</span>' + (s === 'done' ? ico('check', 'fn-c') : '') + '</div>'; };
    var tag = function (t, c) { return '<span class="ftag ' + c + '">' + t + '</span>'; };
    var tok = function (t, dot) { return '<span class="tok">' + (dot ? '<i class="sdot ' + dot + '"></i>' : '') + esc(t) + '</span>'; };
    var conds = j.svc.map(function (k, i) { return '<div class="cond"><span class="grip"></span><span class="cw">' + (i ? 'and' : 'If') + '</span>' + tok('job') + tok('services') + '<span class="cw">has</span>' + tok(SVC[k], 'warn') + '</div>'; }).join('') +
      '<div class="cond"><span class="grip"></span><span class="cw">and</span>' + tok('job') + tok('transport') + '<span class="cw">is</span>' + tok(j.mode, 'info') + '</div>';
    var yes = [], no = [];
    Object.keys(SVC_STEPS).forEach(function (k) { SVC_STEPS[k].forEach(function (l) { if (j.steps.indexOf(l) > -1) { if (yes.indexOf(l) < 0) yes.push(l); } else if (no.indexOf(l) < 0) no.push(l); }); });
    yes.sort(function (a, b) { return j.steps.indexOf(a) - j.steps.indexOf(b); });
    var who = repName(j.rep), opened = j.ev.length ? fmtS(j.ev[0][0]) : '';
    return '<div class="flow"><div class="fcol">' +
      tag('Trigger', 'vio') + '<div class="fbox trig"><span class="fbi">' + ico('jobs') + '</span><div><b>Job request submitted</b><span>' + esc(who) + (opened ? ' · ' + opened : '') + ' · ' + esc(jn(j)) + '</span></div></div><i class="fl"></i>' +
      node(LB.rec) + '<i class="fl"></i>' + node(LB.rev) + '<i class="fl"></i>' +
      tag('If / Else', 'amb') + '<div class="fbox conds">' + conds + '</div>' +
      '<div class="fsplit"><div class="fbr"><span class="fbr-l ok">Then</span>' + yes.map(function (l) { return node(l); }).join('<i class="fl s"></i>') + '</div>' +
      '<div class="fbr else"><span class="fbr-l">Else, skipped</span>' + (no.length ? no.map(function (l) { return node(l, 'skip'); }).join('<i class="fl s"></i>') : '<span class="muted" style="font-size:12.5px">Nothing skipped</span>') + '</div></div>' +
      '<i class="fl"></i>' + tag('End', 'grn') + node(LB.inv) + '</div></div>';
  }

  /* ---------- Floating dock (ui.aceternity.com) ---------- */
  function dockItem(icon, label, attrs, cls) { return '<button type="button" class="dk' + (cls ? ' ' + cls : '') + '" aria-label="' + esc(label) + '" ' + attrs + '><span class="dk-tip" aria-hidden="true">' + esc(label) + '</span>' + ico(icon) + '</button>'; }
  function staffDock(j) {
    var o = S.org, cur = !j.pending && isOpen(j) ? j.steps[j.done] : '', files = o.files.filter(function (f) { return f.job === j.id; }).length;
    var items = [dockItem('back', 'All jobs', 'data-act="backList"'), '<i class="dk-sep"></i>',
      j.pending ? dockItem('check', 'Accept request', 'data-act="accept" data-id="' + j.id + '"', 'primary') : cur ? dockItem('check', 'Complete: ' + cur, 'data-act="stepNext" data-id="' + j.id + '"', 'primary') : dockItem('check', 'All steps done', 'disabled'),
      j.done > 1 && !j.pending ? dockItem('undo', 'Undo last step', 'data-act="stepUndo" data-id="' + j.id + '"') : dockItem('undo', 'Nothing to undo', 'disabled'),
      j.fix ? dockItem('flag', 'Resolve correction', 'data-act="fixOff" data-id="' + j.id + '"', 'alert') : dockItem('flag', 'Flag for correction', 'data-act="dockFix" data-id="' + j.id + '"'),
      '<i class="dk-sep"></i>',
      dockItem('up', 'Upload to client', 'data-act="upload" data-job="' + j.id + '"'),
      dockItem('quote', 'New quote', 'data-act="docNew" data-m="Quote" data-org="' + o.id + '" data-job="' + j.id + '"'),
      dockItem('inv', 'New invoice', 'data-act="docNew" data-m="Invoice" data-org="' + o.id + '" data-job="' + j.id + '"'),
      dockItem('msg', 'Messages' + (j.msgs.length ? ' (' + j.msgs.length + ')' : ''), 'data-act="dockTab" data-t="msgs"'),
      files ? dockItem('down', 'Download all (' + files + ')', 'data-act="zipJob" data-id="' + j.id + '"') : dockItem('down', 'No files yet', 'disabled')];
    return '<div class="dockwrap job staff"><nav class="dock" data-mag aria-label="Staff actions">' + items.join('') + '</nav></div>';
  }
  function jobDock(j) {
    if (staff()) return staffDock(j);
    var dgd = latest(j, 'DGD'), inv = latest(j, 'Invoice'), files = S.org.files.filter(function (f) { return f.job === j.id; }).length;
    var items = [dockItem('back', 'All jobs', 'data-act="backList"'), '<i class="dk-sep"></i>',
      j.fix ? dockItem('up', 'Upload correction', 'data-act="upload" data-job="' + j.id + '"', 'alert') : dockItem('up', 'Upload a file', 'data-act="upload" data-job="' + j.id + '"'),
      dockItem('msg', 'Message HazPack' + (j.msgs.length ? ' (' + j.msgs.length + ')' : ''), 'data-act="dockTab" data-t="msgs"'),
      dgd ? dockItem('dgd', 'View DGD', 'data-act="view" data-id="' + dgd.id + '"') : dockItem('dgd', 'No DGD yet', 'disabled'),
      inv ? dockItem('inv', 'View invoice', 'data-act="view" data-id="' + inv.id + '"') : dockItem('inv', 'No invoice yet', 'disabled'),
      files ? dockItem('down', 'Download all (' + files + ')', 'data-act="zipJob" data-id="' + j.id + '"') : dockItem('down', 'No files yet', 'disabled')];
    return '<div class="dockwrap job"><nav class="dock" data-mag aria-label="Job actions">' + items.join('') + '</nav></div>';
  }
  function navDock() {
    var it = [['dashboard', 'dash', 'Dashboard'], ['jobs', 'jobs', 'Jobs'], ['files', 'files', 'Files'], [staff() ? 'billing' : 'invoices', staff() ? 'bill' : 'inv', staff() ? 'Billing' : 'Invoices']];
    var b = function (x) { var on = S.view === x[0] || (x[0] === 'billing' && S.view === 'doc'); return '<button type="button" class="dk dnav' + (on ? ' on' : '') + '" data-act="nav" data-v="' + x[0] + '"' + (on ? ' aria-current="page"' : '') + '>' + ico(x[1]) + '<span class="dk-l">' + x[2] + '</span></button>'; };
    var mid = staff() ? b(['clients', 'clients', 'Clients']) : '<button type="button" class="dk plus" data-act="request" aria-label="New job request">' + ico('newreq') + '</button>';
    return '<nav class="dock pdock" aria-label="Portal sections">' + b(it[0]) + b(it[1]) + mid + b(it[2]) + b(it[3]) + '</nav>';
  }
  /* desktop magnification: each icon grows with closeness to the pointer and eases toward its target (spring-like) */
  var dockX = null;
  function dockAfter() {
    document.body.classList.toggle('has-dock', !!document.querySelector('.dockwrap.job'));
    var d = document.querySelector('.dock[data-mag]'); if (!d || !window.matchMedia('(hover: hover) and (prefers-reduced-motion: no-preference)').matches) return;
    var items = [].slice.call(d.querySelectorAll('.dk')), mx = dockX, raf = 0;
    items.forEach(function (el) { el._s = 40; });
    var tick = function () {
      var moving = false;
      items.forEach(function (el) {
        var t = 40;
        if (mx !== null) { var r = el.getBoundingClientRect(), dist = Math.abs(mx - (r.left + r.width / 2)); t = 40 + 26 * Math.max(0, Math.cos(Math.min(dist, 150) / 150 * Math.PI / 2)); }
        el._s += (t - el._s) * 0.22; if (Math.abs(t - el._s) > 0.3) moving = true; else el._s = t;
        el.style.width = el.style.height = el._s + 'px'; el.style.setProperty('--ic', (el._s * 0.48) + 'px');
      });
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    var kick = function () { if (!raf) raf = requestAnimationFrame(tick); };
    d.addEventListener('mousemove', function (e) { mx = dockX = e.clientX; kick(); });
    d.addEventListener('mouseleave', function () { mx = dockX = null; kick(); });
    if (mx !== null && d.matches(':hover')) { items.forEach(function (el) { var r = el.getBoundingClientRect(), dist = Math.abs(mx - (r.left + r.width / 2)); el._s = 40 + 26 * Math.max(0, Math.cos(Math.min(dist, 150) / 150 * Math.PI / 2)); el.style.width = el.style.height = el._s + 'px'; el.style.setProperty('--ic', (el._s * 0.48) + 'px'); }); }
    else dockX = null;
  }

  /* ---------- 4 Bulk actions: tick jobs in the table and a dock rises with what you can do to all of them ---------- */
  S.sel = {};
  function jobAny(id) { var o = staff() ? orgOfJob(id) : S.org; return o ? o.jobs.filter(function (j) { return j.id === id; })[0] : null; }
  function filesOfJobs(ids) { var out = []; ids.forEach(function (id) { var o = staff() ? orgOfJob(id) : S.org; if (o) o.files.forEach(function (f) { if (f.job === id) out.push(f); }); }); return out; }
  function selIds() { return Object.keys(S.sel).filter(function (id) { return S.sel[id] && jobAny(id); }); }
  function selAllBox(list) {
    var n = list.filter(function (j) { return S.sel[j.id]; }).length, st = !n ? 'false' : n === list.length ? 'true' : 'mixed';
    return '<button type="button" class="cbx" role="checkbox" aria-checked="' + st + '" aria-label="Select all shown jobs" data-act="selAll" data-ids="' + list.map(function (j) { return j.id; }).join(',') + '">' + ico(st === 'mixed' ? 'newreq' : 'check') + '</button>';
  }
  var bulkWas = 0;
  function bulkDock() {
    var ids = selIds(), n = ids.length, fresh = n && !bulkWas; bulkWas = n;
    if (!n) return '';
    var files = filesOfJobs(ids).length;
    return '<div class="bulkdock' + (fresh ? ' rise' : '') + '" role="region" aria-label="Actions for selected jobs"><nav class="dock" data-mag><span class="bk-n"><b>' + n + '</b> selected</span><i class="dk-sep"></i>' +
      (files ? dockItem('down', 'Download files (' + files + ')', 'data-act="bulkZip"') : dockItem('down', 'No files on these jobs', 'disabled')) +
      dockItem('csv', 'Export CSV', 'data-act="bulkCsv"') + (staff() ? dockItem('team', 'Assign owner', 'data-act="bulkOwner"') + dockItem('flag', 'Set priority', 'data-act="bulkPri"') + dockItem('msg', 'Message the clients', 'data-act="bulkMsg"') : dockItem('msg', 'Message HazPack about these', 'data-act="bulkMsg"')) +
      '<i class="dk-sep"></i>' + dockItem('x', 'Clear selection', 'data-act="selClear"') + '</nav></div>';
  }
  function bulkZip(ids) {
    var files = filesOfJobs(ids); if (!files.length) return;
    toast('Preparing the zip');
    loadScript('/portal/vendor/jszip.min.js', function () { return window.JSZip; }).then(function () {
      var z = new window.JSZip(), used = {};
      return Promise.all(files.map(function (f) { return ensureBlob(f); })).then(function (blobs) {
        files.forEach(function (f, k) { var dir = String(jnId(f.job)).replace(/[^a-zA-Z0-9_-]+/g, '_') + '/', n = dir + f.name; if (used[n]) { var c = ++used[n], i = n.lastIndexOf('.'); n = (i > dir.length ? n.slice(0, i) : n) + ' (' + c + ')' + (i > dir.length ? n.slice(i) : ''); } else used[n] = 1; z.file(n, blobs[k]); });
        return z.generateAsync({ type: 'blob' });
      });
    }).then(function (blob) { download('HazPack_' + ids.length + '_jobs_' + iso(TODAY) + '.zip', blob); }, function () { toast('Could not make the zip. Check your connection and try again.'); });
  }
  function bulkCsv(ids) {
    var q = function (v) { return '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; };
    var st = staff(), rows = [['Job', 'HazPack ID'].concat(st ? ['Client', 'Owner', 'Priority'] : [], ['Contents', 'UN number', 'Class', 'Quantity', 'Transport', 'From', 'To', 'Required by', 'Status', 'Progress %', 'Requested by'])].concat(ids.map(jobAny).map(function (j) {
      var o = st ? orgOfJob(j.id) : S.org, p = priorityOf(j);
      return [jn(j), j.id].concat(st ? [o.name, j.owner || 'Unassigned', p ? p[0] : ''] : [], [j.item, j.un, j.cls, j.qty, j.mode, j.from, j.to || j.toText, j.req ? mdy(j.req) : '', jobStatus(j)[0], progOf(j), repName2(o, j.rep)]);
    }));
    download('HazPack_jobs_' + iso(TODAY) + '.csv', new Blob(['﻿' + rows.map(function (r) { return r.map(q).join(','); }).join('\n')], { type: 'text/csv;charset=utf-8' }));
  }
  function bulkMsgModal(ids) {
    openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="Send a message"><h2>' + (staff() ? 'Message the clients' : 'Message HazPack') + '</h2><p class="muted" style="margin:0">Sent on each of these jobs: ' + ids.map(function (id) { return '<b class="mono">' + esc(jn(jobAny(id))) + '</b>'; }).join(', ') + '</p>' +
      '<label class="f" for="bkText">Message<textarea id="bkText" rows="4" placeholder="Write a message"></textarea></label><div class="row"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button>' + ihb('Send to ' + ids.length + (ids.length === 1 ? ' job' : ' jobs'), 'type="button" data-act="bulkMsgGo"', '') + '</div></div>');
    document.getElementById('bkText').focus();
  }

  /* ---------- phone preview (sandbox only): the portal in a phone-sized frame ---------- */
  var IN_FRAME = window.self !== window.top;
  if (IN_FRAME) document.documentElement.classList.add('in-frame');
  function phoneBtn() { return IN_FRAME ? '' : '<button type="button" class="iconbtn phonebtn" data-act="phoneOpen" aria-label="Phone view" title="Phone view">' + ico('phone') + '</button>'; }
  function phoneOpen() {
    var w = document.createElement('div'); w.className = 'phoneveil'; w.id = 'phoneveil';
    w.innerHTML = '<div class="phonebar"><b>Phone preview</b><span class="muted">390 × 844 · it is the live portal, so taps work</span><div class="seg2"><button type="button" data-act="phoneTheme" data-t="" aria-pressed="true">Auto</button><button type="button" data-act="phoneTheme" data-t="light" aria-pressed="false">Light</button><button type="button" data-act="phoneTheme" data-t="dark" aria-pressed="false">Dark</button></div><button type="button" class="iconbtn" data-act="phoneClose" aria-label="Close phone preview">' + ico('x') + '</button></div>' +
      '<div class="phone"><div class="notch"></div><iframe id="phoneframe" title="Portal on a phone" src="/portal/"></iframe></div>';
    document.body.appendChild(w);
    w.addEventListener('click', function (e) { if (e.target === w) phoneClose(); });
    phoneFit();
  }
  /* scale the whole phone (not the page inside it) so the page keeps a true 390px width on short screens */
  function phoneFit() { var p = document.querySelector('.phone'); if (p) p.style.zoom = Math.min(1, (window.innerHeight - 90) / 868, (window.innerWidth - 32) / 414); }
  window.addEventListener('resize', phoneFit);
  function phoneClose() { var w = document.getElementById("phoneveil"); if (w) w.remove(); render(); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('phoneveil')) phoneClose(); });

  /* phones: every data table can fold into one card per row. Each cell gets its column name so CSS can show it as a small label. */
  function labelTables() {
    document.querySelectorAll('.content table').forEach(function (t) {
      if (t.closest('.paper, .dtbl, .cal, .flow')) return;
      var head = t.tHead && t.tHead.rows.length ? t.tHead.rows[t.tHead.rows.length - 1] : null; if (!head) return;
      var names = [].map.call(head.cells, function (c) { return c.classList.contains('cbc') ? '' : c.textContent.trim(); });
      t.classList.add('cardify');
      [].forEach.call(t.tBodies, function (b) {
        [].forEach.call(b.rows, function (r) {
          var main = false;
          [].forEach.call(r.cells, function (c, i) {
            if (c.colSpan > 1) { c.classList.add('c-wide'); return; }
            if (c.classList.contains('cbc')) return;
            if (!main) { main = true; c.classList.add('c-main'); return; }
            if (names[i]) c.setAttribute('data-label', names[i]); else c.classList.add('c-wide');
          });
        });
      });
    });
  }

  /* ---------- actions for the ideas ---------- */
  function ideasAct(a, ds) {
    switch (a) {
      case 'dockTab': S.jobTab = ds.t; render(); var tb = document.querySelector('.jdetail .tabs, .content .tabs'); if (tb) tb.scrollIntoView({ behavior: 'smooth', block: 'start' }); return true;
      case 'phoneOpen': phoneOpen(); return true;
      case 'phoneClose': phoneClose(); return true;
      case 'phoneTheme':
        var fr = document.getElementById('phoneframe'), de = fr && fr.contentDocument && fr.contentDocument.documentElement;
        if (de) { if (ds.t) de.setAttribute('data-theme', ds.t); else de.removeAttribute('data-theme'); }
        document.querySelectorAll('[data-act=phoneTheme]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-t') === ds.t)); }); return true;
      case 'fixOff': var fj = getJob(ds.id); if (fj) delete fj.fixDiff; return false;
      case 'dfAdd': var tb2 = document.getElementById('dfRows'); tb2.insertAdjacentHTML('beforeend', dfRow(getJob(ds.id), '')); return true;
      case 'dfDel': var tr2 = document.querySelector('.df-row[data-i="' + ds.i + '"]'); if (tr2) tr2.remove(); return true;
      case 'dockFix':
        openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="Flag for correction"><h2>Flag for correction</h2><p class="muted" style="margin:0">The client sees this note and the job cannot be cleared to ship until it is resolved.</p><label class="f" for="fixnote2">What needs correcting<textarea id="fixnote2" rows="3" placeholder="For example: the net quantity on the declaration does not match the package marking"></textarea></label>' + dfEditor(getJob(ds.id)) + '<div class="row"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button>' + ihb('Flag the job', 'type="button" data-act="dockFixGo" data-id="' + ds.id + '"', '') + '</div></div>');
        return true;
      case 'dockFixGo':
        var fx = getJob(ds.id), note2 = (document.getElementById('fixnote2').value || '').trim() || 'Something on this job needs a correction.', rows2 = dfRead(fx);
        fx.fix = true; fx.fixNote = note2; if (rows2) fx.fixDiff = rows2; else delete fx.fixDiff;
        addEv(fx, 'Correction needed: ' + note2); logEv(fx, staffName(), 'Flagged for correction: ' + note2 + (rows2 ? ' (' + rows2.rows.filter(function (r) { return r.length > 2; }).length + ' proposed changes)' : ''));
        notify(fx.id, fx.id + ' needs a correction before it can be cleared to ship.', 'client'); closeModal(); render(); toast('Flagged. People who can see this job were notified.'); return true;
      case 'selRow': flipBefore(); S.sel[ds.id] = !S.sel[ds.id]; render(); return true;
      case 'selAll': var ids = ds.ids ? ds.ids.split(',') : [], all = ids.every(function (id) { return S.sel[id]; }); ids.forEach(function (id) { S.sel[id] = !all; }); render(); return true;
      case 'selClear': S.sel = {}; render(); return true;
      case 'bulkOwner': case 'bulkPri':
        var isO = a === 'bulkOwner', opts = isO ? [['', 'Unassigned']].concat(OWNERS.map(function (n) { return [n, n]; })) : [['', 'Auto (from the required-by date)'], ['Urgent', 'Urgent'], ['High', 'High'], ['Normal', 'Normal'], ['Low', 'Low']];
        openModal('<div class="modal" role="dialog" aria-modal="true" aria-label="' + (isO ? 'Assign owner' : 'Set priority') + '"><h2>' + (isO ? 'Assign an owner' : 'Set priority') + '</h2><p class="muted" style="margin:0">For ' + selIds().length + ' selected ' + (selIds().length === 1 ? 'job' : 'jobs') + '.</p><label class="f" for="bkSel">' + (isO ? 'Owner' : 'Priority') + '<select id="bkSel">' + opts.map(function (x) { return '<option value="' + esc(x[0]) + '">' + esc(x[1]) + '</option>'; }).join('') + '</select></label><div class="row"><button type="button" class="btn ghost" data-act="closeModal">Cancel</button>' + ihb('Apply', 'type="button" data-act="bulkSetGo" data-k="' + (isO ? 'owner' : 'pri') + '"', '') + '</div></div>');
        return true;
      case 'bulkSetGo':
        var v = document.getElementById('bkSel').value, k2 = ds.k, ids2 = selIds();
        ids2.forEach(function (id) { var jj = jobAny(id); jj[k2] = v; logEv(jj, staffName(), (k2 === 'owner' ? 'Owner set to ' + (v || 'unassigned') : 'Priority set to ' + (v || 'auto'))); });
        closeModal(); flipBefore(); render(); toast((k2 === 'owner' ? 'Owner' : 'Priority') + ' updated on ' + ids2.length + (ids2.length === 1 ? ' job.' : ' jobs.')); return true;
      case 'bulkZip': bulkZip(selIds()); return true;
      case 'bulkCsv': bulkCsv(selIds()); toast('Exported ' + selIds().length + ' jobs.'); return true;
      case 'bulkMsg': bulkMsgModal(selIds()); return true;
      case 'bulkMsgGo':
        var text = document.getElementById('bkText').value.trim(), todo = selIds(), sent = 0;
        if (!text) { toast('Write a message first.'); return true; }
        closeModal();
        if (staff()) {
          todo.forEach(function (id) { var o = orgOfJob(id), jj = jobAny(id); jj.msgs.push({ from: 'staff', who: staffName(), text: text, date: new Date() }); logEv(jj, staffName(), 'Sent a message'); withOrg(o.id, function () { notify(jj.id, 'HazPack sent a message on ' + jj.id + '.', 'client'); }); });
          toast('Message sent on ' + todo.length + (todo.length === 1 ? ' job.' : ' jobs.')); S.sel = {}; render(); return true;
        }
        (function next() { if (!todo.length) { toast('Message sent on ' + sent + (sent === 1 ? ' job.' : ' jobs.')); S.sel = {}; render(); return; } var id = todo.shift(); clientAct({ action: 'sendMessage', jobId: id, text: text }, function () { sent++; next(); }); })();
        return true;
      case 'railMin': S.railMin = !S.railMin; lsSet('hp-rail-min', S.railMin ? '1' : '0'); render(); return true;
      case 'recToggle': S.recOpen = !S.recOpen; S.recAnim = S.recOpen; lsSet('hp-rec-closed', S.recOpen ? '0' : '1'); render(); return true;
      case 'recSearch': S.view = 'jobs'; S.mobileDetail = false; render(); var q = document.getElementById('q'); if (q) q.focus(); return true;
      case 'fstat': flipBefore(); S.fs = ds.s; render(); return true;
      case 'fclear': flipBefore(); S.fs = 'all'; S.fm = 'all'; S.fp = 'all'; S.q = ''; S.sc = ''; S.so = ''; render(); return true;
      case 'trToggle': S.trOpen[ds.k] = !S.trOpen[ds.k]; var el = document.querySelector('.tr-h[data-k="' + ds.k + '"]'); if (el) { el.parentNode.classList.toggle('open', S.trOpen[ds.k]); el.setAttribute('aria-expanded', String(S.trOpen[ds.k])); } return true;
      case 'trMode': S.trMode = ds.m; lsSet('hp-tr-mode', ds.m); render(); return true;
      case 'diffRow': S.diffOff[ds.k] = !S.diffOff[ds.k]; render(); return true;
      case 'diffApply':
        var j = getJob(ds.id), d = diffOf(j), on = d.rows.filter(function (r) { return r.length > 2 && !S.diffOff[j.id + r[0]]; });
        on.forEach(function (r) { if (/quantity on dgd/i.test(r[0])) j.qty = r[2]; });
        clientAct({ action: 'sendMessage', jobId: j.id, text: 'Confirmed the correction: ' + on.map(function (r) { return r[0] + ' ' + r[1] + ' → ' + r[2]; }).join('; ') + '.' }, function () { toast('Sent to HazPack. They will reissue the paperwork.'); });
        return true;
    }
    return false;
  }

  /* ---------- polish ideas from the UI-library video (sandbox) ----------
     1. Quick search (cmdk style): Cmd/Ctrl+K opens a box that finds pages, jobs, files, companies and quotes/invoices.
     2. Rolling numbers (NumberFlow style): stat tiles roll to their new value instead of jumping.
     3. Stacked messages (Sonner style): toasts stack, pause on hover, and can be swiped away.
     4. Phone drawer (Vaul style): on a phone, a job opens in a sheet over the list that you can drag down to close. */

  /* ---- 1. Quick search ---- */
  var K = { open: false, q: '', i: 0, items: [] };
  function kItems() {
    var out = [];
    document.querySelectorAll('.rail2 [data-act="nav"][data-v]').forEach(function (b) {
      var v = b.dataset.v, label = TITLES[v] || b.textContent.trim();
      if (!out.some(function (x) { return x.k === 'p' + v; })) out.push({ k: 'p' + v, g: 'Pages', t: label, s: 'Go to ' + label, ic: 'arrow', run: function () { act('nav', { v: v }); } });
    });
    if (staff()) {
      Object.keys(ORGS).forEach(function (id) {
        var o = ORGS[id];
        out.push({ k: 'o' + id, g: 'Companies', t: o.name, s: o.jobs.filter(isOpen).length + ' open jobs', ic: 'org', run: function () { act('openOrg', { org: id }); } });
        o.jobs.forEach(function (j) { out.push(kJob(j, o)); });
        o.files.forEach(function (f) { out.push(kFile(f, o)); });
      });
      DOCS.forEach(function (x) { out.push({ k: 'd' + x.id, g: 'Quotes and invoices', t: x.docNum + ' · ' + (x.client || ''), s: (x.type || '') + (x.amount != null ? ' · ' + money(x.amount) : '') + (x.status ? ' · ' + x.status : ''), ic: 'doc', run: function () { act('nav', { v: 'billing' }); act('docOpen', { id: x.id }); } }); });
    } else if (S.org) {
      var ids = vis().map(function (j) { return j.id; });
      vis().forEach(function (j) { out.push(kJob(j, S.org)); });
      S.org.files.filter(function (f) { return ids.indexOf(f.job) > -1; }).forEach(function (f) { out.push(kFile(f, S.org)); });
    }
    return out;
  }
  function kJob(j, o) {
    var s = jobStatus(j)[0], to = pt(j.to);
    return { k: 'j' + j.id, g: 'Jobs', t: jn(j) + ' · ' + j.item, s: s + (staff() ? ' · ' + o.name : '') + (to ? ' · to ' + to.city : ''), x: (j.un || '') + ' ' + (j.ref || '') + ' ' + j.id, dot: STATUS_DOT[s], run: function () { kOpenJob(o, j.id, 'overview'); } };
  }
  function kFile(f, o) {
    var j = o.jobs.filter(function (x) { return x.id === f.job; })[0];
    return { k: 'f' + f.id, g: 'Files', t: f.name, s: f.type + ' · ' + (j ? jn(j) : '') + (staff() ? ' · ' + o.name : ''), ic: 'file', run: function () { kOpenJob(o, f.job, 'files'); } };
  }
  function kOpenJob(o, id, tab) {
    if (staff()) act('openOrg', { org: o.id, job: id }); else act('job', { id: id });
    S.jobTab = tab; render();
  }
  function kScore(it, q) {
    if (!q) return it.g === 'Pages' ? 2 : it.g === 'Jobs' ? 1 : 0;
    var t = it.t.toLowerCase(), hay = (it.t + ' ' + it.s + ' ' + (it.x || '')).toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    if (!words.every(function (w) { return hay.indexOf(w) > -1; })) return -1;
    return (t.indexOf(q) === 0 ? 30 : 0) + (t.indexOf(q) > -1 ? 15 : 0) + (it.g === 'Pages' ? 4 : it.g === 'Jobs' ? 3 : 1);
  }
  var KICO = {
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>', org: '<path d="M4 21V5l8-2v18M12 9h8v12M8 8h.01M8 12h.01M8 16h.01M16 13h.01M16 17h.01"/>',
    file: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>', doc: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/>'
  };
  function kOpen() {
    if (S.stage !== 'app' || K.open) return;
    K.open = true; K.q = ''; K.i = 0; K.items = kItems(); K.back = document.activeElement;
    var el = document.createElement('div'); el.id = 'kbar'; el.className = 'kveil';
    el.innerHTML = '<div class="kbox" role="dialog" aria-modal="true" aria-label="Quick search"><div class="kin"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>' +
      '<input id="kq" type="text" autocomplete="off" spellcheck="false" placeholder="' + (staff() ? 'Search jobs, companies, files, invoices…' : 'Search jobs, files, pages…') + '" role="combobox" aria-expanded="true" aria-controls="klist" aria-autocomplete="list"><kbd>Esc</kbd></div>' +
      '<div class="klist" id="klist" role="listbox"></div><div class="kfoot"><span><kbd>↑</kbd><kbd>↓</kbd> move</span><span><kbd>↵</kbd> open</span><span><kbd>' + (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl') + '</kbd><kbd>K</kbd> anytime</span></div></div>';
    document.body.appendChild(el);
    el.addEventListener('mousedown', function (e) { if (e.target === el) kClose(); });
    var inp = document.getElementById('kq');
    inp.addEventListener('input', function () { K.q = inp.value; K.i = 0; kDraw(); });
    inp.addEventListener('keydown', function (e) {
      var n = K.shown.length;
      if (e.key === 'ArrowDown') { e.preventDefault(); if (n) { K.i = (K.i + 1) % n; kDraw(true); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (n) { K.i = (K.i - 1 + n) % n; kDraw(true); } }
      else if (e.key === 'Enter') { e.preventDefault(); kGo(K.i); }
      else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); kClose(); }
      else if (e.key === 'Tab') e.preventDefault();
    });
    document.getElementById('klist').addEventListener('click', function (e) { var b = e.target.closest('[data-ki]'); if (b) kGo(+b.dataset.ki); });
    document.getElementById('klist').addEventListener('mousemove', function (e) { var b = e.target.closest('[data-ki]'); if (b && +b.dataset.ki !== K.i) { K.i = +b.dataset.ki; kDraw(true); } });
    kDraw(); inp.focus();
  }
  function kDraw(keepList) {
    var q = K.q.trim().toLowerCase();
    if (!keepList) {
      var sc = K.items.map(function (it) { return { it: it, s: kScore(it, q) }; }).filter(function (x) { return x.s >= 0; });
      sc.sort(function (a, b) { return b.s - a.s; });
      var groups = {}, order = [];
      sc.forEach(function (x) { var g = x.it.g; if (!groups[g]) { groups[g] = []; order.push(g); } if (groups[g].length < (q ? 8 : 6)) groups[g].push(x.it); });
      if (!q) order = ['Pages', 'Jobs'].filter(function (g) { return groups[g]; });
      K.shown = []; K.order = order; K.groups = groups;
      order.forEach(function (g) { groups[g].forEach(function (it) { K.shown.push(it); }); });
    }
    var list = document.getElementById('klist'), n = 0, html = '';
    if (!K.shown.length) html = '<p class="kempty">Nothing matches “' + esc(K.q) + '”.</p>';
    K.order.forEach(function (g) {
      html += '<div class="kg" role="presentation">' + esc(q ? g : g === 'Jobs' ? 'Recent jobs' : g) + '</div>';
      K.groups[g].forEach(function (it) {
        var i = n++;
        html += '<button type="button" class="ki" role="option" id="ki' + i + '" data-ki="' + i + '" aria-selected="' + (i === K.i) + '">' +
          (it.dot ? '<i class="sdot ' + it.dot + '"></i>' : '<svg viewBox="0 0 24 24" aria-hidden="true">' + KICO[it.ic] + '</svg>') +
          '<span class="kt"><b>' + kMark(it.t, q) + '</b><small>' + esc(it.s) + '</small></span>' + (i === K.i ? '<kbd class="kgo">↵</kbd>' : '') + '</button>';
      });
    });
    list.innerHTML = html;
    document.getElementById('kq').setAttribute('aria-activedescendant', K.shown.length ? 'ki' + K.i : '');
    var cur = document.getElementById('ki' + K.i); if (cur) cur.scrollIntoView({ block: 'nearest' });
  }
  function kMark(t, q) {
    if (!q) return esc(t);
    var i = t.toLowerCase().indexOf(q); if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
  }
  function kGo(i) { var it = K.shown[i]; if (!it) return; kClose(true); it.run(); }
  function kClose(going) {
    var el = document.getElementById('kbar'); if (el) el.remove(); K.open = false;
    if (!going && K.back && document.contains(K.back)) K.back.focus();
  }
  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (K.open) kClose(); else kOpen(); }
    else if (e.key === '/' && !K.open && S.stage === 'app' && !e.target.closest('input, textarea, select, [contenteditable]')) { e.preventDefault(); kOpen(); }
  });
  function kButton() {
    return '<button type="button" class="kbtn" data-act="kOpen" aria-label="Quick search" title="Quick search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><span>Search</span><kbd>' + (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl ') + 'K</kbd></button>';
  }

  /* ---- 2. Rolling numbers ---- */
  var NUM = {}, numReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  function numAfter() {
    document.querySelectorAll('.stat .v, .statline b, .statline .n').forEach(function (el) {
      if (el.dataset.rolled) return;
      var text = el.textContent.trim(); if (!/\d/.test(text) || text.length > 16) return;
      var holder = el.closest('.stat, .statline > *'), lab = holder ? (holder.querySelector('.k, span:not(.v)') || {}).textContent || '' : '';
      var key = S.view + '|' + (S.org ? S.org.id : '') + '|' + lab.trim() + '|' + Array.prototype.indexOf.call(el.parentNode.parentNode.children, el.parentNode);
      var prev = NUM[key]; NUM[key] = text;
      if (prev === text || numReduce.matches) return;
      var from = prev == null ? text.replace(/\d/g, '0') : prev;
      el.dataset.rolled = '1'; el.setAttribute('aria-label', text);
      var a = from.split(''), b = text.split('');
      while (a.length < b.length) a.unshift(/\d/.test(b[b.length - a.length - 1]) ? '0' : b[b.length - a.length - 1]);
      var html = '';
      b.forEach(function (ch, i) {
        if (!/\d/.test(ch)) { html += '<span class="nr-c">' + esc(ch) + '</span>'; return; }
        var start = /\d/.test(a[a.length - b.length + i]) ? +a[a.length - b.length + i] : 0;
        html += '<span class="nr-d" data-to="' + ch + '" style="--d:' + start + ';--delay:' + (i * 35) + 'ms"><span>0<br>1<br>2<br>3<br>4<br>5<br>6<br>7<br>8<br>9</span></span>';
      });
      el.innerHTML = '<span class="nr" aria-hidden="true">' + html + '</span>';
      el.getBoundingClientRect();
      requestAnimationFrame(function () { el.querySelectorAll('.nr-d').forEach(function (d) { d.classList.add('go'); d.style.setProperty('--d', d.dataset.to); }); });
    });
  }

  /* ---- 3. Stacked messages ---- */
  var TS = { list: [], hover: false };
  function toastBox() {
    var box = document.getElementById('toasts');
    if (!box) {
      box = document.createElement('section'); box.id = 'toasts'; box.setAttribute('aria-live', 'polite'); box.setAttribute('aria-label', 'Messages');
      box.addEventListener('mouseenter', function () { TS.hover = true; box.classList.add('open'); TS.list.forEach(function (t) { clearTimeout(t.timer); t.left -= Date.now() - t.started; }); });
      box.addEventListener('mouseleave', function () { TS.hover = false; box.classList.remove('open'); TS.list.forEach(tArm); });
      document.body.appendChild(box);
    }
    return box;
  }
  function tArm(t) { t.started = Date.now(); clearTimeout(t.timer); t.timer = setTimeout(function () { tGone(t); }, Math.max(800, t.left)); }
  function tGone(t, dir) {
    if (t.dead) return; t.dead = true; clearTimeout(t.timer);
    t.el.classList.add(dir ? 'swiped' : 'out'); if (dir) t.el.style.setProperty('--sx', dir * 120 + '%');
    setTimeout(function () { t.el.remove(); TS.list.splice(TS.list.indexOf(t), 1); tLayout(); if (!TS.list.length) { var b = document.getElementById('toasts'); if (b) b.classList.remove('open'); } }, 220);
  }
  function tLayout() {
    var live = TS.list.filter(function (t) { return !t.dead; }), y = 0, gap = 8;
    for (var i = live.length - 1, n = 0; i >= 0; i--, n++) {
      var t = live[i]; t.el.style.setProperty('--i', n); t.el.style.setProperty('--y', y + 'px'); t.el.classList.toggle('hidden3', n > 2); t.el.classList.toggle('back', n > 0);
      y += t.el.offsetHeight + gap;
    }
  }
  toast = function (msg) {
    var box = toastBox(), el = document.createElement('div'), bad = /could not|failed|error|incorrect|too many|not allowed|can't|cannot/i.test(msg);
    el.className = 'tst' + (bad ? ' bad' : '');
    el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + (bad ? '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5.5M12 16.5h.01"/>' : '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.6 2.6L16 9.5"/>') + '</svg><span></span><button type="button" class="tx" aria-label="Dismiss">×</button>';
    el.querySelector('span').textContent = msg;
    var t = { el: el, left: Math.min(7000, 3600 + msg.length * 25) };
    el.querySelector('.tx').addEventListener('click', function () { tGone(t); });
    var sx = null, dx = 0;
    el.addEventListener('pointerdown', function (e) { if (e.target.closest('.tx')) return; sx = e.clientX; dx = 0; el.setPointerCapture(e.pointerId); el.classList.add('drag'); });
    el.addEventListener('pointermove', function (e) { if (sx == null) return; dx = e.clientX - sx; el.style.setProperty('--dx', dx + 'px'); el.style.opacity = String(Math.max(0, 1 - Math.abs(dx) / 260)); });
    el.addEventListener('pointerup', function () { if (sx == null) return; sx = null; el.classList.remove('drag'); if (Math.abs(dx) > 80) tGone(t, dx > 0 ? 1 : -1); else { el.style.setProperty('--dx', '0px'); el.style.opacity = ''; } });
    TS.list.push(t); box.appendChild(el); tLayout();
    requestAnimationFrame(function () { el.classList.add('in'); });
    if (!TS.hover) tArm(t);
    if (TS.list.length > 6) tGone(TS.list[0]);
  };

  /* ---- 4. Phone drawer for a job ---- */
  var phoneMQ = window.matchMedia('(max-width: 800px)');
  function sheetMode() { return phoneMQ.matches; }
  var SH = { was: false };
  function sheetAfter() {
    var old = document.getElementById('jsheet'), keep = old ? old.querySelector('.sh-body').scrollTop : 0;
    var on = S.stage === 'app' && S.view === 'jobs' && S.mobileDetail && sheetMode() && S.job && getJob(S.job);
    if (old) old.remove();
    document.body.classList.toggle('sheet-on', !!on);
    if (!on) { SH.was = false; return; }
    var el = document.createElement('div'); el.id = 'jsheet';
    el.innerHTML = '<div class="sh-veil" data-act="sheetClose"></div><div class="sh" role="dialog" aria-modal="true" aria-label="Job ' + esc(jn(getJob(S.job))) + '"><div class="sh-grab" aria-hidden="true"><i></i></div><div class="sh-body">' + detail(getJob(S.job)) + '</div></div>';
    if (!SH.was) el.classList.add('enter');
    document.body.appendChild(el);
    el.querySelector('.sh-body').scrollTop = SH.was ? keep : 0;
    SH.was = true;
    var sh = el.querySelector('.sh'), body = el.querySelector('.sh-body');
    sh.addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' && !e.target.closest('.sh-grab')) return;
      if (e.target.closest('button, a, input, select, textarea, .map, .mapcard') || (body.scrollTop > 0 && !e.target.closest('.sh-grab'))) return;
      SH.y0 = e.clientY; SH.dy = 0; SH.t0 = Date.now(); sh.classList.add('drag');
    });
  }
  window.addEventListener('pointermove', function (e) {
    if (SH.y0 == null) return; var el = document.getElementById('jsheet'); if (!el) { SH.y0 = null; return; }
    SH.dy = Math.max(0, e.clientY - SH.y0);
    el.querySelector('.sh').style.transform = 'translateY(' + SH.dy + 'px)'; el.querySelector('.sh-veil').style.opacity = String(1 - Math.min(1, SH.dy / 400));
  });
  window.addEventListener('pointerup', function () {
    if (SH.y0 == null) return; SH.y0 = null; var el = document.getElementById('jsheet'); if (!el) return;
    var sh = el.querySelector('.sh'); sh.classList.remove('drag');
    var fast = SH.dy / Math.max(1, Date.now() - SH.t0) > .6;
    if (SH.dy > 130 || (fast && SH.dy > 30)) sheetClose(); else { sh.style.transform = ''; el.querySelector('.sh-veil').style.opacity = ''; }
  });
  function sheetClose() {
    var el = document.getElementById('jsheet'); if (!el) { act('backList', {}); return; }
    el.classList.add('leave'); el.querySelector('.sh').style.transform = '';
    setTimeout(function () { SH.was = false; act('backList', {}); }, 240);
  }
  phoneMQ.addEventListener('change', function () { if (S.stage === 'app') render(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && document.getElementById('jsheet') && !document.getElementById('veil') && !K.open) sheetClose(); });

  function polishAfter() { sheetAfter(); numAfter(); }
  function polishAct(a, ds) {
    switch (a) {
      case 'kOpen': kOpen(); return true;
      case 'sheetClose': sheetClose(); return true;
    }
    return false;
  }

  render();
  boot();
})();
