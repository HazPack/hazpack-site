/* Seaports, sea lanes and the dashboard globe for the client portal.
   window.HP_ROUTES gives app.js:
     findPort(text)        the seaport named in a port field, or null
     seaPath(a, b)         [[lat, lon], ...] from port a to port b along simple sea lanes, so ships stay on water
     surfacePath(a, b)     [[lat, lon], ...] along the ground (trucks)
     ICON                  SVG path data for the plane, ship and truck (24 units wide, facing +x)
     mountGlobes(root)     draws every [data-globe] element inside root as a turning globe
     setGlobe(id, routes)  the routes a [data-globe="id"] element shows
   No libraries: the portal's Content Security Policy only allows its own scripts. */
(function () {
  'use strict';
  var D2R = Math.PI / 180;

  /* ---------- seaports (lat, lon). The first three are the ports of loading the request form suggests. ---------- */
  var PORTS = [
    ['Los Angeles / Long Beach', 'US', 33.74, -118.22, 'los angeles|long beach|san pedro'], ['Oakland', 'US', 37.8, -122.3, 'san francisco'], ['Seattle / Tacoma', 'US', 47.6, -122.36, 'seattle|tacoma'],
    ['New York / New Jersey', 'US', 40.67, -74.05, 'new york|newark|new jersey|elizabeth'], ['Savannah', 'US', 32.08, -81.1], ['Charleston', 'US', 32.8, -79.92], ['Norfolk', 'US', 36.9, -76.33, 'virginia'],
    ['Baltimore', 'US', 39.25, -76.55], ['Houston', 'US', 29.73, -95.27], ['Miami', 'US', 25.77, -80.17, 'port everglades'], ['Honolulu', 'US', 21.31, -157.87], ['Anchorage', 'US', 61.23, -149.9],
    ['Vancouver', 'CA', 49.29, -123.1], ['Prince Rupert', 'CA', 54.3, -130.35], ['Montreal', 'CA', 45.55, -73.53], ['Halifax', 'CA', 44.65, -63.57],
    ['Manzanillo', 'MX', 19.05, -104.32], ['Lazaro Cardenas', 'MX', 17.93, -102.18], ['Veracruz', 'MX', 19.2, -96.13],
    ['Balboa', 'PA', 8.95, -79.57, 'panama city'], ['Colon', 'PA', 9.35, -79.9, 'manzanillo international'], ['Cartagena', 'CO', 10.4, -75.53], ['Buenaventura', 'CO', 3.88, -77.07],
    ['Callao', 'PE', -12.05, -77.15, 'lima'], ['Guayaquil', 'EC', -2.28, -79.9], ['San Antonio', 'CL', -33.58, -71.62, 'santiago'], ['Valparaiso', 'CL', -33.03, -71.63],
    ['Santos', 'BR', -23.97, -46.3, 'sao paulo'], ['Rio de Janeiro', 'BR', -22.88, -43.2], ['Paranagua', 'BR', -25.5, -48.5], ['Buenos Aires', 'AR', -34.58, -58.37], ['Montevideo', 'UY', -34.9, -56.22],
    ['Kingston', 'JM', 17.97, -76.82], ['Freeport', 'BS', 26.52, -78.77],
    ['Shanghai', 'CN', 30.9, 122.0, 'yangshan'], ['Ningbo', 'CN', 29.93, 121.85, 'zhoushan'], ['Shenzhen', 'CN', 22.48, 113.9, 'yantian|shekou'], ['Guangzhou', 'CN', 22.75, 113.6, 'nansha'],
    ['Qingdao', 'CN', 36.07, 120.32], ['Tianjin', 'CN', 38.98, 117.75, 'xingang'], ['Xiamen', 'CN', 24.45, 118.07], ['Dalian', 'CN', 38.92, 121.65], ['Hong Kong', 'HK', 22.3, 114.15],
    ['Kaohsiung', 'TW', 22.6, 120.28], ['Keelung', 'TW', 25.15, 121.75, 'taipei'], ['Taichung', 'TW', 24.27, 120.5], ['Busan', 'KR', 35.08, 129.05, 'pusan'], ['Incheon', 'KR', 37.45, 126.6, 'seoul'],
    ['Tokyo', 'JP', 35.62, 139.78], ['Yokohama', 'JP', 35.45, 139.65], ['Nagoya', 'JP', 35.05, 136.85], ['Kobe', 'JP', 34.67, 135.2], ['Osaka', 'JP', 34.63, 135.42],
    ['Singapore', 'SG', 1.26, 103.82], ['Port Klang', 'MY', 3.0, 101.39, 'kuala lumpur|klang'], ['Tanjung Pelepas', 'MY', 1.36, 103.55], ['Penang', 'MY', 5.41, 100.35],
    ['Laem Chabang', 'TH', 13.08, 100.88], ['Bangkok', 'TH', 13.7, 100.57], ['Ho Chi Minh City', 'VN', 10.76, 106.75, 'cat lai|saigon|cai mep'], ['Hai Phong', 'VN', 20.85, 106.7, 'haiphong|hanoi'],
    ['Manila', 'PH', 14.6, 120.95], ['Jakarta', 'ID', -6.1, 106.88, 'tanjung priok'], ['Surabaya', 'ID', -7.2, 112.73], ['Colombo', 'LK', 6.95, 79.84],
    ['Nhava Sheva', 'IN', 18.95, 72.95, 'mumbai|jnpt|jawaharlal nehru|bombay'], ['Mundra', 'IN', 22.75, 69.7], ['Chennai', 'IN', 13.1, 80.3, 'madras'], ['Kolkata', 'IN', 22.55, 88.3, 'calcutta|haldia'],
    ['Karachi', 'PK', 24.83, 66.98], ['Chittagong', 'BD', 22.3, 91.8, 'chattogram'],
    ['Jebel Ali', 'AE', 25.01, 55.06, 'dubai'], ['Abu Dhabi', 'AE', 24.5, 54.38, 'khalifa'], ['Dammam', 'SA', 26.5, 50.2], ['Jeddah', 'SA', 21.47, 39.17], ['Salalah', 'OM', 16.95, 54.0],
    ['Sohar', 'OM', 24.5, 56.63, 'muscat'], ['Hamad', 'QA', 25.0, 51.6, 'doha'], ['Shuwaikh', 'KW', 29.35, 47.92, 'kuwait'],
    ['Haifa', 'IL', 32.82, 35.0], ['Ashdod', 'IL', 31.83, 34.64, 'tel aviv'], ['Port Said', 'EG', 31.25, 32.3], ['Alexandria', 'EG', 31.18, 29.87],
    ['Piraeus', 'GR', 37.94, 23.63, 'athens'], ['Istanbul', 'TR', 40.98, 28.95, 'ambarli'], ['Mersin', 'TR', 36.8, 34.63], ['Izmir', 'TR', 38.44, 27.14],
    ['Valencia', 'ES', 39.44, -0.32], ['Barcelona', 'ES', 41.35, 2.17], ['Algeciras', 'ES', 36.13, -5.43], ['Genoa', 'IT', 44.4, 8.92, 'genova'], ['La Spezia', 'IT', 44.1, 9.85],
    ['Gioia Tauro', 'IT', 38.45, 15.9], ['Trieste', 'IT', 45.63, 13.76], ['Marseille', 'FR', 43.33, 5.3, 'fos'], ['Le Havre', 'FR', 49.48, 0.12],
    ['Antwerp', 'BE', 51.25, 4.4, 'antwerpen'], ['Zeebrugge', 'BE', 51.33, 3.2], ['Rotterdam', 'NL', 51.95, 4.05], ['Amsterdam', 'NL', 52.4, 4.82],
    ['Hamburg', 'DE', 53.53, 9.95], ['Bremerhaven', 'DE', 53.57, 8.55, 'bremen'], ['Felixstowe', 'GB', 51.95, 1.32], ['Southampton', 'GB', 50.9, -1.43],
    ['London Gateway', 'GB', 51.5, 0.45, 'london|tilbury'], ['Liverpool', 'GB', 53.45, -3.0], ['Dublin', 'IE', 53.35, -6.2], ['Gothenburg', 'SE', 57.68, 11.85, 'goteborg'],
    ['Aarhus', 'DK', 56.15, 10.23], ['Gdansk', 'PL', 54.4, 18.67], ['Lisbon', 'PT', 38.7, -9.15, 'lisboa'], ['Sines', 'PT', 37.95, -8.87],
    ['Casablanca', 'MA', 33.6, -7.6], ['Tanger Med', 'MA', 35.88, -5.5, 'tangier'], ['Lagos', 'NG', 6.43, 3.38, 'apapa|tin can'], ['Tema', 'GH', 5.63, 0.0, 'accra'], ['Abidjan', 'CI', 5.28, -4.0],
    ['Durban', 'ZA', -29.87, 31.03], ['Cape Town', 'ZA', -33.9, 18.43], ['Mombasa', 'KE', -4.05, 39.65], ['Dar es Salaam', 'TZ', -6.83, 39.3], ['Djibouti', 'DJ', 11.6, 43.13],
    ['Sydney', 'AU', -33.97, 151.2, 'botany'], ['Melbourne', 'AU', -37.83, 144.92], ['Brisbane', 'AU', -27.38, 153.17], ['Fremantle', 'AU', -32.05, 115.75, 'perth'],
    ['Auckland', 'NZ', -36.84, 174.77], ['Tauranga', 'NZ', -37.65, 176.18]
  ].map(function (p) { return { name: p[0], country: p[1], lat: p[2], lon: p[3], words: [p[0]].concat(p[0].split(' / ').length > 1 ? p[0].split(' / ') : [], p[4] ? p[4].split('|') : []) }; });

  function plain(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  var portRe = PORTS.map(function (p) { return new RegExp('\\b(' + p.words.map(function (w) { return plain(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')\\b'); });
  function findPort(text) {
    var t = plain(text); if (!t) return null;
    var best = null;
    PORTS.forEach(function (p, i) { var m = portRe[i].exec(t); if (m && (!best || m.index < best.i || (m.index === best.i && m[0].length > best.n))) best = { p: p, i: m.index, n: m[0].length }; });
    return best ? best.p : null;
  }

  /* ---------- sea lanes: open-water waypoints joined where a ship can sail between them ---------- */
  var NODES = {
    pacE: [32, -125], canW: [48.4, -125], alaska: [57, -150], pacN: [45, -160], hawaii: [22, -158], pacSC: [-10, -160], mexW: [17, -104], pacW: [35, 150],
    japS: [32, 134], korea: [34, 128.5], yellow: [36, 122.5], bohai: [38.5, 120], ecs: [27, 124], luzon: [20.5, 121.5], scsN: [18, 116], phil: [14, 119],
    scsS: [6, 109], sing: [1.2, 104.2], jav: [-5, 108], sunda: [-7, 105], malN: [6, 95.5], bay: [15, 88], srilE: [8, 83], sril: [5.5, 81], indW: [15, 71], pakS: [23, 64],
    arab: [14, 62], hormuz: [26.3, 56.6], gulf: [27, 51], aden: [12.2, 45], bab: [12.6, 43.3], redN: [27.5, 34.5], suez: [30.5, 32.4], medE: [33, 30], adri: [41, 18.5],
    medC: [35.5, 17], medW: [37, 0], gib: [35.95, -5.6], atlE: [40, -15], celtic: [50, -7], irish: [52.5, -5.5], chan: [49.8, -3.5], north: [54, 4], skag: [57.8, 10.5],
    baltic: [55.5, 15], atlN: [42, -40], canE: [44, -62], stlaw: [47, -62], usE: [36, -72], florida: [24.3, -81.5], gom: [25, -90], carib: [15, -75], antil: [13, -58],
    panaE: [9.6, -79.9], panaW: [8.8, -79.5], pacSE: [0, -85], pacCH: [-25, -75], horn: [-57, -67], plate: [-36, -55], brazilS: [-25, -43], brazilN: [-5, -33],
    afNW: [20, -20], gguinea: [2, 0], cape: [-35.5, 19], durb: [-32, 32], afE: [-18, 41], kenya: [-4, 42], indS: [-20, 75], ausW: [-32, 113], ausS: [-36, 118],
    bass: [-39.5, 146.5], ausE: [-34, 152.5], nzN: [-35, 174.5]
  };
  var EDGES = ('pacE-mexW pacE-pacN pacE-hawaii pacE-canW pacE-pacSC canW-alaska canW-pacN pacN-pacW pacN-alaska hawaii-pacW hawaii-pacN hawaii-pacSC pacSC-ausE pacSC-nzN ' +
    'pacW-japS pacW-luzon pacW-ecs japS-korea japS-ecs korea-yellow yellow-bohai ecs-yellow ecs-luzon luzon-scsN luzon-phil scsN-scsS scsN-phil scsS-sing scsS-phil ' +
    'sing-jav jav-sunda sunda-ausW sing-malN malN-bay malN-srilE malN-sril srilE-sril srilE-bay sril-indW sril-arab sril-indS indW-arab indW-pakS pakS-arab pakS-hormuz ' +
    'arab-hormuz hormuz-gulf arab-aden arab-kenya aden-bab bab-redN redN-suez suez-medE medE-medC medC-adri medC-medW medW-gib gib-atlE atlE-celtic celtic-irish celtic-chan ' +
    'chan-north north-skag skag-baltic atlE-atlN atlE-afNW atlN-usE atlN-canE canE-stlaw usE-florida usE-antil florida-gom florida-carib carib-panaE carib-antil panaE-panaW ' +
    'panaW-mexW panaW-pacSE pacSE-pacCH pacCH-horn horn-plate plate-brazilS brazilS-brazilN brazilN-antil brazilN-gguinea afNW-gguinea afNW-antil gguinea-cape cape-durb ' +
    'cape-indS durb-afE afE-kenya kenya-aden indS-ausW ausW-ausS ausS-bass bass-ausE ausE-nzN').split(' ');
  function unit(lat, lon) { var a = lat * D2R, b = lon * D2R; return [Math.cos(a) * Math.cos(b), Math.cos(a) * Math.sin(b), Math.sin(a)]; }
  function angle(p, q) { var u = unit(p[0], p[1]), v = unit(q[0], q[1]); return Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))); }
  var ADJ = {}; Object.keys(NODES).forEach(function (k) { ADJ[k] = []; });
  EDGES.forEach(function (e) { var ab = e.split('-'); ADJ[ab[0]].push(ab[1]); ADJ[ab[1]].push(ab[0]); });
  function nearestNode(p) { var best = null, bd = 9; Object.keys(NODES).forEach(function (k) { var d = angle([p.lat, p.lon], NODES[k]); if (d < bd) { bd = d; best = k; } }); return best; }
  function lanes(s, t) {
    var dist = {}, prev = {}, todo = Object.keys(NODES);
    todo.forEach(function (k) { dist[k] = Infinity; }); dist[s] = 0;
    while (todo.length) {
      todo.sort(function (a, b) { return dist[a] - dist[b]; });
      var u = todo.shift(); if (u === t || dist[u] === Infinity) break;
      ADJ[u].forEach(function (v) { var d = dist[u] + angle(NODES[u], NODES[v]); if (d < dist[v]) { dist[v] = d; prev[v] = u; } });
    }
    var path = [t]; while (path[0] !== s && prev[path[0]]) path.unshift(prev[path[0]]);
    return path[0] === s ? path : [s, t];
  }
  /* Points every ~2 degrees along the great circle from p to q (both [lat, lon]), q included. */
  function slerpLine(p, q, out) {
    var u = unit(p[0], p[1]), v = unit(q[0], q[1]), w = angle(p, q), n = Math.max(1, Math.ceil(w / (2 * D2R)));
    for (var i = 1; i <= n; i++) {
      var t = i / n, s = Math.sin(w), a = s < 1e-6 ? 1 - t : Math.sin((1 - t) * w) / s, b = s < 1e-6 ? t : Math.sin(t * w) / s;
      var x = a * u[0] + b * v[0], y = a * u[1] + b * v[1], z = a * u[2] + b * v[2];
      out.push([Math.atan2(z, Math.sqrt(x * x + y * y)) / D2R, Math.atan2(y, x) / D2R]);
    }
    return out;
  }
  function surfacePath(a, b) { return slerpLine([a.lat, a.lon], [b.lat, b.lon], [[a.lat, a.lon]]); }
  var seaCache = {};
  function toLatLon(v) { var n = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]); return [Math.asin(v[2] / n) / D2R, Math.atan2(v[1], v[0]) / D2R]; }
  /* The point dist radians from p toward q, as [lat, lon]. */
  function toward(p, q, dist) {
    var w = angle(p, q); if (w < 1e-6) return p;
    var t = Math.min(1, dist / w), u = unit(p[0], p[1]), v = unit(q[0], q[1]), s = Math.sin(w), a = Math.sin((1 - t) * w) / s, b = Math.sin(t * w) / s;
    return toLatLon([a * u[0] + b * v[0], a * u[1] + b * v[1], a * u[2] + b * v[2]]);
  }
  /* A route through waypoints with each corner rounded off: the line stops a little before the waypoint and bends
     to a point a little after it. The bend is at most 6 degrees and never more than a third of either leg, so it
     stays close to the lane and does not cut across land. */
  function rounded(K) {
    var pts = [K[0]], prev = K[0];
    for (var i = 1; i < K.length - 1; i++) {
      var V = K[i], r = Math.min(6 * D2R, angle(K[i - 1], V) / 3, angle(V, K[i + 1]) / 3);
      var A = toward(V, K[i - 1], r), B = toward(V, K[i + 1], r), ua = unit(A[0], A[1]), uv = unit(V[0], V[1]), ub = unit(B[0], B[1]);
      slerpLine(prev, A, pts);
      for (var k = 1; k <= 10; k++) { var t = k / 10, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t; pts.push(toLatLon([a * ua[0] + b * uv[0] + c * ub[0], a * ua[1] + b * uv[1] + c * ub[1], a * ua[2] + b * uv[2] + c * ub[2]])); }
      prev = B;
    }
    return slerpLine(prev, K[K.length - 1], pts);
  }
  function seaPath(a, b) {
    var key = a.lat + ',' + a.lon + '>' + b.lat + ',' + b.lon; if (seaCache[key]) return seaCache[key];
    var s = nearestNode(a), t = nearestNode(b), way = s === t ? [s] : lanes(s, t), start = [a.lat, a.lon];
    if (angle(start, [b.lat, b.lon]) < angle(start, NODES[s])) way = []; /* two ports on the same stretch of coast */
    return (seaCache[key] = rounded([start].concat(way.map(function (k) { return NODES[k]; }), [[b.lat, b.lon]])));
  }

  var ICON = {
    Air: 'M12 0L5 -2.2L-1 -10L-4.5 -10L-1.5 -2.4L-7.5 -2.4L-9.5 -5.5L-12 -5.5L-10 0L-12 5.5L-9.5 5.5L-7.5 2.4L-1.5 2.4L-4.5 10L-1 10L5 2.2Z',
    Ocean: 'M-12 1H12L8.5 7H-9.5ZM-9 1V-4H-3V1ZM-7.5 -4V-7.5H-5V-4ZM-2 1V-2.5H3.5V1ZM4 1V-2.5H9.5V1Z',
    Ground: 'M-12 -6H3V3H-12ZM4 -3H8.5L12 0.5V3H4ZM-6.5 6a2.2 2.2 0 1 1-4.4 0a2.2 2.2 0 1 1 4.4 0ZM10 6a2.2 2.2 0 1 1-4.4 0a2.2 2.2 0 1 1 4.4 0Z'
  };
  var COLOR = { Air: '#F37A21', Ocean: '#4FB3E8', Ground: '#8BD17C' };

  /* ---------- globe ---------- */
  var LAND = null;
  function landDots() {
    if (LAND) return LAND;
    var mask = window.HP_MAP.mask, out = [];
    mask.forEach(function (row, r) { var lat = 84 - r * 1.5; for (var c = 0; c < row.length; c++) if (row.charAt(c) === '1') out.push(unit(lat, (c + 0.5) * 1.5 - 180)); });
    return (LAND = out);
  }
  /* Sample routes for the sign-in background: made up, spread around the world. */
  function pt(name, lat, lon) { return { city: name, lat: lat, lon: lon }; }
  var SHOWCASE = [
    ['Air', pt('Los Angeles', 33.94, -118.41), pt('Tokyo', 35.55, 139.78)], ['Air', pt('Los Angeles', 33.94, -118.41), pt('Frankfurt', 50.03, 8.56)],
    ['Air', pt('New York', 40.64, -73.78), pt('London', 51.47, -0.45)], ['Air', pt('Dubai', 25.25, 55.36), pt('Singapore', 1.36, 103.99)],
    ['Air', pt('Sao Paulo', -23.43, -46.47), pt('Madrid', 40.49, -3.57)], ['Air', pt('Sydney', -33.94, 151.18), pt('Hong Kong', 22.31, 113.92)],
    ['Air', pt('Johannesburg', -26.13, 28.24), pt('Doha', 25.27, 51.61)], ['Air', pt('Chicago', 41.97, -87.9), pt('Mexico City', 19.44, -99.07)],
    ['Ocean', 'Los Angeles / Long Beach', 'Shanghai'], ['Ocean', 'Rotterdam', 'Singapore'], ['Ocean', 'Santos', 'Antwerp'], ['Ocean', 'Busan', 'Seattle / Tacoma'],
    ['Ocean', 'Jebel Ali', 'Nhava Sheva'], ['Ocean', 'Savannah', 'Hamburg'], ['Ocean', 'Durban', 'Fremantle'],
    ['Ground', pt('Los Angeles', 34.05, -118.24), pt('Phoenix', 33.45, -112.07)], ['Ground', pt('Hamburg', 53.55, 9.99), pt('Munich', 48.14, 11.58)],
    ['Ground', pt('Paris', 48.86, 2.35), pt('Lyon', 45.76, 4.84)], ['Ground', pt('Mumbai', 19.08, 72.88), pt('Delhi', 28.61, 77.21)],
    ['Ground', pt('Sydney', -33.87, 151.21), pt('Melbourne', -37.81, 144.96)], ['Ground', pt('Sao Paulo', -23.55, -46.63), pt('Rio de Janeiro', -22.91, -43.17)],
    ['Ground', pt('Shanghai', 31.23, 121.47), pt('Beijing', 39.9, 116.4)], ['Ground', pt('Toronto', 43.65, -79.38), pt('Montreal', 45.5, -73.57)],
    ['Ground', pt('Johannesburg', -26.2, 28.05), pt('Durban', -29.86, 31.02)]
  ];
  function showcase() {
    var byName = {}; PORTS.forEach(function (p) { byName[p.name] = p; });
    return SHOWCASE.map(function (r) { return { mode: r[0], a: typeof r[1] === 'string' ? byName[r[1]] : r[1], b: typeof r[2] === 'string' ? byName[r[2]] : r[2], label: '' }; });
  }
  var DATA = {}, LIVE = [], raf = 0, reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  function setGlobe(id, routes) { DATA[id] = routes; }

  function build(r) {
    var pts, mode = r.mode in ICON ? r.mode : 'Air';
    if (mode === 'Ocean') pts = r.path || seaPath(r.a, r.b); else pts = surfacePath(r.a, r.b);
    var V = pts.map(function (p) { return unit(p[0], p[1]); }), w = angle([r.a.lat, r.a.lon], [r.b.lat, r.b.lon]);
    var lift = mode === 'Air' ? Math.min(0.32, 0.12 + w * 0.09) : 0.006;
    var len = [0]; for (var i = 1; i < V.length; i++) len.push(len[i - 1] + Math.acos(Math.max(-1, Math.min(1, V[i][0] * V[i - 1][0] + V[i][1] * V[i - 1][1] + V[i][2] * V[i - 1][2]))));
    var total = len[len.length - 1] || 1;
    return { r: r, mode: mode, V: V, H: len.map(function (l) { return mode === 'Air' ? 1 + lift * Math.sin(Math.PI * l / total) : 1 + lift; }), len: len, total: total, icon: new Path2D(ICON[mode]) };
  }

  /* A globe survives the portal's redraws: the page HTML is rebuilt on every change (and every few seconds while it
     checks for updates), so an existing globe with the same routes is moved into the new placeholder, canvas and all,
     instead of being drawn again from scratch. */
  function sigOf(routes) { return JSON.stringify(routes.map(function (r) { return [r.mode, r.a.lat, r.a.lon, r.b.lat, r.b.lon, r.label || '']; })); }
  function watch(g) {
    if (g.ro) g.ro.disconnect(); if (g.io) g.io.disconnect();
    if (window.ResizeObserver) { g.ro = new ResizeObserver(function () { if (size(g)) draw(g, performance.now()); }); g.ro.observe(g.el); }
    if (window.IntersectionObserver) { g.io = new IntersectionObserver(function (es) { g.visible = es[es.length - 1].isIntersecting; if (g.visible) loop(); }); g.io.observe(g.el); }
  }
  function mountGlobes(root) {
    [].forEach.call((root || document).querySelectorAll('[data-globe]'), function (el) {
      if (el._globe) return;
      var still = el.dataset.globe === 'backdrop', raw = still ? showcase() : DATA[el.dataset.globe] || [], drop = delete DATA[el.dataset.globe], sig = (still ? 'backdrop:' : '') + sigOf(raw);
      var old = LIVE.filter(function (g) { return g.sig === sig && !g.el.isConnected; })[0];
      if (old) { el.appendChild(old.cv); old.el = el; el._globe = old; watch(old); size(old); return; }
      var routes = raw.map(build);
      var cv = document.createElement('canvas'); cv.setAttribute('aria-hidden', 'true'); el.appendChild(cv);
      var g = { el: el, cv: cv, ctx: cv.getContext('2d'), routes: routes, sig: sig, lon0: -100, lat0: still ? 18 : 25, base: -100, drag: null, idle: 0, t0: performance.now(), visible: true, spin: still, last: 0 };
      if (routes.length && !still) {
        var s = [0, 0, 0]; routes.forEach(function (x) { [x.V[0], x.V[x.V.length - 1]].forEach(function (v) { s[0] += v[0]; s[1] += v[1]; s[2] += v[2]; }); });
        var n = Math.sqrt(s[0] * s[0] + s[1] * s[1] + s[2] * s[2]) || 1;
        g.base = g.lon0 = Math.atan2(s[1], s[0]) / D2R; g.lat0 = Math.max(-20, Math.min(45, Math.asin(s[2] / n) / D2R));
      }
      el._globe = g; LIVE.push(g); watch(g); size(g);
      if (!still) {
        cv.addEventListener('pointerdown', function (e) { g.drag = { x: e.clientX, y: e.clientY, lon: g.lon0, lat: g.lat0 }; try { cv.setPointerCapture(e.pointerId); } catch (x) {} });
        cv.addEventListener('pointermove', function (e) {
          if (!g.drag) return; var k = 90 / (g.R / g.dpr);
          g.lon0 = g.drag.lon - (e.clientX - g.drag.x) * k; g.lat0 = Math.max(-60, Math.min(70, g.drag.lat + (e.clientY - g.drag.y) * k));
          if (reduce) draw(g, performance.now());
        });
        var up = function () { if (g.drag) { g.drag = null; g.idle = performance.now(); g.base = g.lon0 - 28 * Math.sin((g.idle - g.t0) / 9000); } };
        cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
      }
      draw(g, performance.now());
    });
    /* forget globes whose page is gone for good (kept one redraw so they can be reused) */
    LIVE = LIVE.filter(function (g) { return g.el.isConnected || (g.gone = (g.gone || 0) + 1) < 3; });
    LIVE.forEach(function (g) { if (g.el.isConnected) g.gone = 0; });
    loop();
  }
  /* Resize the canvas only when its size really changes: setting width or height wipes it. The sign-in background is
     full screen, so it is drawn at no more than 1.25x for speed; the dashboard globe up to 2x. */
  function size(g) {
    var dpr = Math.min(window.devicePixelRatio || 1, g.spin ? 1.25 : 2), w = g.el.clientWidth, h = g.el.clientHeight;
    if (!w || !h) return false;
    var W = Math.round(w * dpr), H = Math.round(h * dpr);
    if (W === g.W && H === g.Hh) return false;
    g.cv.width = W; g.cv.height = H; g.cv.style.width = w + 'px'; g.cv.style.height = h + 'px';
    g.W = W; g.Hh = H; g.dpr = dpr; g.R = g.spin ? Math.min(W, H) * 0.38 : Math.min(W, H) * 0.43; g.bg = null;
    return true;
  }
  function loop() {
    if (raf || reduce) return;
    raf = requestAnimationFrame(function tick(now) {
      raf = 0;
      var any = false;
      LIVE.forEach(function (g) { if (g.visible && g.el.isConnected && g.W && !document.hidden) { any = true; draw(g, now); } });
      if (any) raf = requestAnimationFrame(tick);
    });
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) loop(); });

  /* The glow and the sphere never change for a given size, so they are painted once into a spare canvas. */
  function background(g) {
    if (g.bg) return g.bg;
    var W = g.W, H = g.Hh, R = g.R, cx = W / 2, cy = H / 2 + R * 0.02, b = document.createElement('canvas'), c = b.getContext('2d');
    b.width = W; b.height = H;
    var gl = c.createRadialGradient(cx, cy, R * 0.9, cx, cy, R * 1.25); gl.addColorStop(0, 'rgba(79,140,220,0.22)'); gl.addColorStop(1, 'rgba(79,140,220,0)');
    c.fillStyle = gl; c.beginPath(); c.arc(cx, cy, R * 1.25, 0, 7); c.fill();
    var sf = c.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R); sf.addColorStop(0, '#1d3557'); sf.addColorStop(1, '#0b1626');
    c.fillStyle = sf; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.fill();
    c.strokeStyle = 'rgba(140,180,240,0.28)'; c.lineWidth = g.dpr; c.stroke();
    return (g.bg = b);
  }
  var SHADES = 7, DOT_FILL = []; for (var si = 0; si < SHADES; si++) DOT_FILL.push('rgba(176,200,235,' + (0.2 + 0.6 * (si + 0.5) / SHADES).toFixed(2) + ')');

  function draw(g, now) {
    if (!g.W) return;
    var c = g.ctx, W = g.W, H = g.Hh, R = g.R, cx = W / 2, cy = H / 2 + R * 0.02, dpr = g.dpr;
    var dt = g.last ? Math.min(now - g.last, 100) : 16; g.last = now;
    if (g.spin) { if (!reduce) g.lon0 = g.base - (now - g.t0) / 1000 * 4; }
    else if (!g.drag && !reduce && now - g.idle > 2500) g.lon0 += ((g.base + 28 * Math.sin((now - g.t0) / 9000)) - g.lon0) * (1 - Math.pow(0.98, dt / 16.7));
    var l0 = g.lon0 * D2R, p0 = g.lat0 * D2R, sl = Math.sin(l0), cl = Math.cos(l0), sp = Math.sin(p0), cp = Math.cos(p0);
    function P(v, h) {
      var x = -v[0] * sl + v[1] * cl, t = v[0] * cl + v[1] * sl, y = cp * v[2] - sp * t, z = sp * v[2] + cp * t;
      h = h || 1; return [cx + R * x * h, cy - R * y * h, z, (x * x + y * y) * h * h > 1];
    }
    c.clearRect(0, 0, W, H);
    c.drawImage(background(g), 0, 0);
    /* land dots, grouped into a few shades so each shade is one fill instead of thousands */
    var L = landDots(), d = 1.6 * dpr, hd = d / 2, paths = [];
    for (var s = 0; s < SHADES; s++) paths.push(new Path2D());
    for (var i = 0; i < L.length; i++) {
      var v = L[i], z = sp * v[2] + cp * (v[0] * cl + v[1] * sl); if (z <= 0) continue;
      var x = -v[0] * sl + v[1] * cl, y = cp * v[2] - sp * (v[0] * cl + v[1] * sl);
      paths[Math.min(SHADES - 1, (z * SHADES) | 0)].rect(cx + R * x - hd, cy - R * y - hd, d, d);
    }
    for (s = 0; s < SHADES; s++) { c.fillStyle = DOT_FILL[s]; c.fill(paths[s]); }
    var period = 9000;
    c.lineCap = 'round'; c.lineJoin = 'round';
    g.routes.forEach(function (rt, ri) {
      var col = COLOR[rt.mode], S = rt.V.map(function (v, k) { return P(v, rt.H[k]); });
      c.lineWidth = 1.6 * dpr; c.strokeStyle = col; c.globalAlpha = 0.75; c.beginPath();
      var pen = false;
      for (var k = 0; k < S.length; k++) { var q = S[k], vis = q[2] > 0 || q[3]; if (vis) { if (pen) c.lineTo(q[0], q[1]); else c.moveTo(q[0], q[1]); } pen = vis; }
      c.stroke(); c.globalAlpha = 1;
      var A = S[0], B = S[S.length - 1];
      if (A[2] > 0) { c.fillStyle = '#ffffff'; c.beginPath(); c.arc(A[0], A[1], 3.2 * dpr, 0, 7); c.fill(); }
      if (B[2] > 0) {
        c.fillStyle = col; c.beginPath(); c.arc(B[0], B[1], 3.4 * dpr, 0, 7); c.fill();
        if (!reduce) { var ph = ((now - g.t0) / 1800 + ri * 0.37) % 1; c.strokeStyle = col; c.globalAlpha = 1 - ph; c.lineWidth = 1.2 * dpr; c.beginPath(); c.arc(B[0], B[1], (4 + ph * 12) * dpr, 0, 7); c.stroke(); c.globalAlpha = 1; }
        if (rt.r.label) { c.font = '600 ' + (10.5 * dpr) + 'px "IBM Plex Mono", ui-monospace, monospace'; c.fillStyle = 'rgba(232,238,248,0.92)'; c.fillText(rt.r.label, B[0] + 7 * dpr, B[1] - 6 * dpr); }
      }
      /* the vehicle glides between points along the route instead of jumping from one to the next */
      var f = reduce ? 0.5 : ((now - g.t0) / period + ri * 0.23) % 1, at = f * rt.total, j = 1;
      while (j < rt.len.length - 1 && rt.len[j] < at) j++;
      var seg = rt.len[j] - rt.len[j - 1], u = seg > 0 ? Math.max(0, Math.min(1, (at - rt.len[j - 1]) / seg)) : 0, a0 = S[j - 1], a1 = S[j];
      var mx = a0[0] + (a1[0] - a0[0]) * u, my = a0[1] + (a1[1] - a0[1]) * u, mvis = (a0[2] > 0 || a0[3]) && (a1[2] > 0 || a1[3]);
      if (mvis) {
        var ang = Math.atan2(a1[1] - a0[1], a1[0] - a0[0]), flip = rt.mode !== 'Air' && Math.abs(ang) > Math.PI / 2;
        c.save(); c.translate(mx, my); c.rotate(flip ? ang + Math.PI : ang); c.scale((flip ? -1 : 1) * 0.62 * dpr, 0.62 * dpr);
        c.fillStyle = col; c.strokeStyle = '#0b1626'; c.lineWidth = 2.2; c.stroke(rt.icon); c.fill(rt.icon); c.restore();
      }
    });
  }

  window.HP_ROUTES = { PORTS: PORTS, findPort: findPort, seaPath: seaPath, surfacePath: surfacePath, ICON: ICON, COLOR: COLOR, mountGlobes: mountGlobes, setGlobe: setGlobe };
  mountGlobes(document); /* the sign-in background lives outside the redrawn part of the page */
})();
