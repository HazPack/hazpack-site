/* Homepage hero: a dotted world map with dangerous-goods shipments leaving LAX, one route at a time.
   Uses the same map data as the client portal (/portal/map-data.js). Illustration only. */
(function () {
  var root = document.getElementById('heroMap');
  if (!root || !window.HP_MAP) return;
  var NS = 'http://www.w3.org/2000/svg';
  var M = window.HP_MAP, AP = {};
  M.airports.forEach(function (a) { AP[a[0]] = { code: a[0], city: a[1], lat: a[3], lon: a[4] }; });
  var px = function (lon) { return (lon + 180) * 2; }, py = function (lat) { return (84 - lat) * 2; };

  /* Each stop: destination, what is in the box, and the paperwork that goes with it. */
  var TRIPS = [
    ['SIN', 'Lithium ion batteries', 'UN3481', 'Air'],
    ['FRA', 'Flammable liquids', 'UN1993', 'Air'],
    ['NRT', 'Dry ice shipment', 'UN1845', 'Air'],
    ['MEX', 'Aerosols', 'UN1950', 'Ground'],
    ['DXB', 'Lithium metal batteries', 'UN3090', 'Air'],
    ['SYD', 'Biological substance, Cat. B', 'UN3373', 'Air'],
    ['LHR', 'Corrosive liquid', 'UN1760', 'Air'],
    ['HKG', 'Paint and coatings', 'UN1263', 'Air'],
    ['GRU', 'Compressed gas', 'UN1956', 'Air']
  ].filter(function (t) { return AP[t[0]]; });
  var from = AP.LAX;

  /* View centred on Los Angeles so the Pacific and the Atlantic routes both fit. */
  var cx = px(from.lon), W = 640, H = 280, vx = cx - W / 2 + 20, vy = py(86);
  var svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', vx + ' ' + vy + ' ' + W + ' ' + H);
  svg.setAttribute('class', 'hm-svg'); svg.setAttribute('aria-hidden', 'true');
  var d = [];
  M.mask.forEach(function (row, r) { for (var c = 0; c < row.length; c++) if (row.charAt(c) === '1') d.push('M' + ((c + .5) * 3).toFixed(1) + ' ' + (r * 3) + 'h0'); });
  var land = document.createElementNS(NS, 'path'); land.setAttribute('d', d.join('')); land.setAttribute('id', 'hmLand'); land.setAttribute('class', 'hm-land');
  var defs = document.createElementNS(NS, 'defs'); defs.appendChild(land); svg.appendChild(defs);
  [-720, 0, 720].forEach(function (x) { var u = document.createElementNS(NS, 'use'); u.setAttribute('href', '#hmLand'); u.setAttribute('x', x); svg.appendChild(u); });
  var routesG = document.createElementNS(NS, 'g'); svg.appendChild(routesG);
  var x0 = px(from.lon), y0 = py(from.lat);
  var home = document.createElementNS(NS, 'g'); home.setAttribute('class', 'hm-home');
  home.innerHTML = '<circle class="hm-ping" cx="' + x0 + '" cy="' + y0 + '" r="4"/><circle class="hm-pin" cx="' + x0 + '" cy="' + y0 + '" r="3.6"/>';
  svg.appendChild(home);
  root.querySelector('.hm-map').appendChild(svg);
  var lab = document.createElement('span'); lab.className = 'hm-lax'; lab.textContent = 'LAX';
  lab.style.left = ((x0 - vx) / W * 100) + '%'; lab.style.top = ((y0 - vy) / H * 100) + '%';
  root.querySelector('.hm-map').appendChild(lab);

  function arc(b) {
    var x1 = x0, y1 = y0, x2 = px(b.lon), y2 = py(b.lat), dx = x2 - x1;
    if (dx > 360) x2 -= 720; else if (dx < -360) x2 += 720;
    var len = Math.sqrt((x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1)), lift = Math.min(len * .3, 70);
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2 - lift;
    return { d: 'M' + x1 + ' ' + y1 + 'Q' + mx.toFixed(1) + ' ' + my.toFixed(1) + ' ' + x2.toFixed(1) + ' ' + y2.toFixed(1), x2: x2, y2: y2 };
  }
  var el = function (tag, attrs) { var e = document.createElementNS(NS, tag); for (var k in attrs) e.setAttribute(k, attrs[k]); return e; };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var line = root.querySelector('.hm-now'), stepEls = root.querySelectorAll('.hm-steps li');

  function drawRoute(t, animate) {
    var b = AP[t[0]], a = arc(b);
    var g = el('g', { 'class': 'hm-route' });
    var p = el('path', { d: a.d, 'class': 'hm-arc' }); g.appendChild(p);
    var end = el('circle', { cx: a.x2, cy: a.y2, r: 2.6, 'class': 'hm-end' }); g.appendChild(end);
    routesG.appendChild(g);
    if (!animate) { g.classList.add('done'); return g; }
    var L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L;
    var dot = el('circle', { r: 3, 'class': 'hm-dot' }); g.appendChild(dot);
    var t0 = null, dur = 1700;
    (function step(ts) {
      if (t0 == null) t0 = ts; var k = Math.min(1, (ts - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      p.style.strokeDashoffset = L * (1 - e); var q = p.getPointAtLength(L * e); dot.setAttribute('cx', q.x); dot.setAttribute('cy', q.y);
      if (k < 1) requestAnimationFrame(step); else { dot.remove(); g.classList.add('done'); }
    })(performance.now());
    return g;
  }
  function caption(t) {
    var b = AP[t[0]];
    line.innerHTML = '<b>' + t[1] + '</b><span>' + t[2] + ' · ' + t[3] + ' · LAX → ' + b.city + '</span>';
    line.classList.remove('in'); void line.offsetWidth; line.classList.add('in');
  }
  function stepsTo(n) { stepEls.forEach(function (li, i) { li.classList.toggle('on', i < n); }); }

  if (reduce) { TRIPS.forEach(function (t) { drawRoute(t, false); }); caption(TRIPS[0]); stepsTo(4); return; }

  var i = 0, live = [], timer = null, running = false, stepT = [];
  function next() {
    var t = TRIPS[i++ % TRIPS.length];
    /* Bars clear, then light up one after another, each a short beat after the last. */
    caption(t); stepsTo(0); stepT.forEach(clearTimeout);
    stepT = [1, 2, 3, 4].map(function (n) { return setTimeout(function () { stepsTo(n); }, 250 + 520 * n); });
    var g = drawRoute(t, true); live.push(g);
    if (live.length > 4) { var old = live.shift(); old.classList.add('gone'); setTimeout(function () { old.remove(); }, 800); }
    live.forEach(function (x, k) { x.style.opacity = String(.35 + .65 * (k + 1) / live.length); });
    timer = setTimeout(next, 3800);
  }
  function start() { if (running) return; running = true; next(); }
  function stop() { running = false; clearTimeout(timer); stepT.forEach(clearTimeout); }
  /* Only animate while the map is on screen and the tab is visible. */
  var onScreen = true;
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { onScreen = es[0].isIntersecting; if (onScreen && !document.hidden) start(); else stop(); }).observe(root);
  document.addEventListener('visibilitychange', function () { if (document.hidden) stop(); else if (onScreen) start(); });
  start();
})();
