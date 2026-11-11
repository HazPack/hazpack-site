// Client portal pages (login, profile picker, dashboard, staff). All page content is built with
// textContent, never innerHTML, so nothing typed into the portal can run as script.
(() => {
  const page = document.body.dataset.page;
  const $ = (sel, root = document) => root.querySelector(sel);

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false && kid !== 0) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  // Replace an element's contents, skipping empty values so `condition && node` never prints "false" or "0".
  const mount = (el, ...kids) => el.replaceChildren(...kids.flat().filter((k) => k != null && k !== false && k !== 0 && k !== ''));

  async function api(path, method = 'GET', body) {
    try {
      const res = await fetch(path, {
        method, credentials: 'same-origin',
        headers: body !== undefined ? { 'content-type': 'application/json' } : {},
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
      let data = {};
      try { data = await res.json(); } catch { /* empty body */ }
      return { ok: res.ok, status: res.status, data };
    } catch {
      return { ok: false, status: 0, data: { error: 'Could not reach the server. Check your connection and try again.' } };
    }
  }

  const fmtDate = (iso) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const fmtSize = (n) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
  const statusClass = (s) => ({ 'Cleared to ship': 'st-cleared', 'Needs correction': 'st-needs', 'In progress': 'st-progress', Completed: 'st-completed' }[s] || 'st-progress');
  const fileUrl = (id, download) => `/api/portal-file?id=${encodeURIComponent(id)}${download ? '&download=1' : ''}`;

  const year = $('#year');
  if (year) year.textContent = new Date().getFullYear();

  const actions = $('#actions');
  function setActions(...items) { if (actions) { actions.replaceChildren(...items.filter(Boolean)); } }
  async function signOut(to = '/portal') { await api('/api/portal-session', 'DELETE', {}); location.href = to; }
  const signOutBtn = (to) => h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => signOut(to) }, 'Sign out');

  function setStatus(el, msg, ok = false) {
    el.className = `form-status ${msg ? (ok ? 'ok' : 'err') : ''}`;
    el.textContent = msg || '';
  }

  // ---------- sign in: company ID and password ----------
  async function loginPage() {
    const me = await api('/api/portal-session');
    if (me.data.client) { location.replace(me.data.client.profile ? '/portal/dashboard' : '/portal/profile'); return; }
    const form = $('#login-form');
    const status = $('#status');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('button');
      setStatus(status, '');
      if (!form.slug.value.trim() || !form.password.value) { setStatus(status, 'Enter your company ID and password.'); return; }
      btn.disabled = true;
      const r = await api('/api/portal-login', 'POST', { slug: form.slug.value, password: form.password.value });
      if (r.ok) { location.href = '/portal/profile'; return; }
      btn.disabled = false;
      form.password.value = '';
      setStatus(status, r.data.error || 'Could not sign in.');
    });
  }

  // ---------- pick who you are, then enter that profile's PIN ----------
  async function profilePage() {
    const card = $('#card');
    const me = await api('/api/portal-session');
    if (!me.data.client) { location.replace('/portal'); return; }
    if (me.data.client.profile) { location.replace('/portal/dashboard'); return; }
    const { org, profiles } = me.data.client;
    setActions(signOutBtn());

    const showPicker = () => {
      mount(card, 
        h('p', { class: 'portal-label' }, org.name),
        h('h1', null, 'Who is signing in?'),
        profiles.length
          ? h('div', { class: 'profiles' }, profiles.map((p) => h('button', { class: 'profile-btn', type: 'button', onclick: () => showPin(p) }, h('span', { class: 'avatar', 'aria-hidden': 'true' }, p.name.slice(0, 1).toUpperCase()), p.name)))
          : h('p', { class: 'muted' }, 'No profiles have been set up for this company yet. Please contact HazPack.'),
        h('p', { class: 'auth-foot' }, h('button', { class: 'linklike', type: 'button', onclick: () => signOut() }, 'Not your company? Sign out')),
      );
    };

    const showPin = (p) => {
      const status = h('p', { class: 'form-status', role: 'alert' });
      const pin = h('input', { id: 'pin', class: 'pin-input', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '6', autocomplete: 'off', 'aria-label': `PIN for ${p.name}` });
      const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Continue');
      const form = h('form', { novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        setStatus(status, '');
        if (!/^\d{4,6}$/.test(pin.value)) { setStatus(status, 'Enter your 4 to 6 digit PIN.'); return; }
        btn.disabled = true;
        const r = await api('/api/portal-session', 'POST', { profileId: p.id, pin: pin.value });
        if (r.ok) { location.href = '/portal/dashboard'; return; }
        btn.disabled = false; pin.value = ''; pin.focus();
        setStatus(status, r.data.error || 'Could not sign in.');
      } },
      h('div', { class: 'field' }, h('label', { for: 'pin' }, `Enter ${p.name}'s PIN`), pin), btn, status);
      mount(card, 
        h('p', { class: 'portal-label' }, org.name),
        h('h1', null, `Hi, ${p.name}`),
        form,
        h('p', { class: 'auth-foot' }, h('button', { class: 'linklike', type: 'button', onclick: showPicker }, 'Choose a different profile')),
      );
      pin.focus();
    };

    showPicker();
  }

  // ---------- the client's shipments ----------
  async function dashboardPage() {
    const app = $('#app');
    const r = await api('/api/portal-data');
    if (r.status === 401) { location.replace('/portal/profile'); return; }
    if (!r.ok) { mount(app, h('p', { class: 'form-status err' }, r.data.error || 'Could not load your shipments.')); return; }
    const { org, profile, shipments, statuses, retentionMonths } = r.data;
    setActions(
      h('span', { class: 'who' }, `Signed in as ${profile.name}`),
      h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: async () => { await api('/api/portal-session', 'PATCH', {}); location.href = '/portal/profile'; } }, 'Switch profile'),
      signOutBtn(),
    );

    let filter = 'All';
    const list = h('div', { id: 'ship-list' });
    const chips = h('div', { class: 'filters', role: 'group', 'aria-label': 'Filter by status' });

    const fileSection = (title, files, photos) => files.length > 0 && h('div', null, h('h4', null, title),
      photos
        ? h('div', { class: 'photos' }, files.map((f) => h('a', { href: fileUrl(f.id), target: '_blank', rel: 'noopener', title: f.name }, h('img', { src: fileUrl(f.id), alt: `Packing photo ${f.name}`, loading: 'lazy' }))))
        : files.map((f) => h('div', { class: 'file-row' },
          h('a', { href: fileUrl(f.id), target: '_blank', rel: 'noopener' }, f.name),
          h('span', null, `${fmtSize(f.size)} · available until ${fmtDate(f.expiresAt)}`))));

    const shipCard = (s) => h('article', { class: 'ship' },
      h('div', { class: 'ship-top' },
        h('div', null, h('h3', null, s.reference), s.description && h('p', { class: 'ship-desc' }, s.description), h('p', { class: 'ship-meta' }, `Updated ${fmtDate(s.updatedAt)}`)),
        h('span', { class: `badge ${statusClass(s.status)}` }, s.status)),
      s.files.length ? h('div', { class: 'files' },
        fileSection('Dangerous goods declarations', s.files.filter((f) => f.kind === 'DGD')),
        fileSection('Invoices', s.files.filter((f) => f.kind === 'Invoice')),
        fileSection('Packing photos', s.files.filter((f) => f.kind === 'Photo'), true)) : h('p', { class: 'ship-meta' }, 'No documents yet.'));

    const draw = () => {
      const shown = shipments.filter((s) => filter === 'All' || s.status === filter);
      list.replaceChildren(...(shown.length ? shown.map(shipCard) : [h('div', { class: 'empty' }, shipments.length ? `No shipments with the status "${filter}".` : 'No shipments yet. When HazPack works on a shipment for you, it will show up here.')]));
      chips.replaceChildren(...['All', ...statuses].map((st) => {
        const n = st === 'All' ? shipments.length : shipments.filter((s) => s.status === st).length;
        return h('button', { class: 'chip', type: 'button', 'aria-pressed': String(filter === st), onclick: () => { filter = st; draw(); } }, st, h('small', null, String(n)));
      }));
    };

    mount(app, 
      org.demo && h('div', { class: 'demo-banner' }, 'Sample data only. These companies, shipments and documents are made up for testing.'),
      h('div', { class: 'dash-head' }, h('div', null, h('p', { class: 'portal-label' }, 'Client Portal'), h('h1', null, org.name))),
      chips, list,
      h('p', { class: 'retention' }, `Records are kept for ${retentionMonths} months, then removed automatically. Download anything you need to keep.`),
    );
    draw();
  }

  // ---------- HazPack staff ----------
  async function staffPage() {
    const app = $('#app');
    const me = await api('/api/portal-session');
    if (!me.data.staff) return staffLogin();

    const state = { orgs: [], orgId: null, shipments: [], newOrg: false, open: {} };
    const status = h('p', { id: 'status', class: 'form-status', role: 'status' });
    const say = (msg, ok) => setStatus(status, msg, ok);

    async function load() {
      const r = await api(`/api/portal-staff${state.orgId ? `?orgId=${encodeURIComponent(state.orgId)}` : ''}`);
      if (r.status === 401) { location.reload(); return; }
      state.orgs = r.data.orgs || [];
      if (!state.orgId || !state.orgs.some((o) => o.id === state.orgId)) {
        state.orgId = state.orgs[0]?.id || null;
        if (state.orgId) return load();
      }
      state.shipments = r.data.shipments || [];
      render();
    }

    async function act(body, okMsg) {
      say('');
      const r = await api('/api/portal-staff', 'POST', body);
      if (!r.ok) { say(r.data.error || 'Something went wrong.'); return r; }
      await load();
      if (okMsg) say(okMsg, true);
      return r;
    }

    // Two-step buttons instead of pop-up dialogs, which some browsers and preview windows block.
    const dangerBtn = (label, onConfirm) => {
      let timer;
      const b = h('button', { class: 'btn btn-danger btn-xs', type: 'button', onclick: () => {
        if (b.classList.contains('armed')) { clearTimeout(timer); onConfirm(); return; }
        b.classList.add('armed'); b.textContent = 'Click again to confirm';
        timer = setTimeout(() => { b.classList.remove('armed'); b.textContent = label; }, 4000);
      } }, label);
      return b;
    };

    // A small form that appears under a button, for resetting a password or PIN.
    const secretForm = (key, label, hint, onSave, numeric) => {
      if (!state.open[key]) return null;
      const input = h('input', { type: 'password', autocomplete: 'new-password', inputmode: numeric ? 'numeric' : undefined, maxlength: numeric ? '6' : '200', 'aria-label': label });
      return h('form', { class: 'subpanel inline', novalidate: true, onsubmit: async (e) => { e.preventDefault(); state.open[key] = false; await onSave(input.value); } },
        h('div', null, h('label', null, label), input, h('span', { class: 'muted' }, hint)),
        h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Save'),
        h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { state.open[key] = false; render(); } }, 'Cancel'));
    };
    const toggle = (key) => () => { state.open[key] = !state.open[key]; render(); };

    const input = (name, label, props = {}) => h('div', null, h('label', { for: `f-${name}` }, label), h('input', { id: `f-${name}`, name, autocomplete: 'off', ...props }));
    const val = (form, name) => form.elements[name].value;

    function render() {
      const org = state.orgs.find((o) => o.id === state.orgId);
      const select = h('select', { id: 'org-select', 'aria-label': 'Company', onchange: (e) => { state.orgId = e.target.value; state.open = {}; load(); } },
        state.orgs.map((o) => h('option', { value: o.id, selected: o.id === state.orgId }, `${o.name} (${o.slug})`)));

      const newOrgForm = state.newOrg && h('form', { class: 'panel', novalidate: true, onsubmit: async (e) => {
        e.preventDefault();
        const f = e.target;
        const r = await act({ action: 'createOrg', name: val(f, 'name'), slug: val(f, 'slug'), password: val(f, 'password') }, 'Company created. Now add a profile for each person.');
        if (r.ok) { state.newOrg = false; state.orgId = r.data.orgId; load(); }
      } },
      h('h2', null, 'New company'),
      h('div', { class: 'inline' }, input('name', 'Company name', { required: true, maxlength: '80' }), input('slug', 'Company ID (they type this to sign in)', { placeholder: 'created from the name if blank', maxlength: '40' }), input('password', 'Password (10+ characters)', { type: 'password', autocomplete: 'new-password' })),
      h('p', null, h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Create company'), ' ', h('button', { class: 'btn btn-outline btn-sm', type: 'button', onclick: () => { state.newOrg = false; render(); } }, 'Cancel')));

      const companyPanel = org && h('section', { class: 'panel' },
        h('h2', null, org.name),
        org.demo && h('div', { class: 'demo-banner' }, 'Sample company with made-up data.'),
        h('p', { class: 'muted' }, `Company ID: ${org.slug}`),
        h('div', { class: 'row-actions' },
          h('button', { class: 'btn btn-outline btn-xs', type: 'button', onclick: toggle('orgpw') }, 'Reset company password'),
          dangerBtn('Delete company and all its records', () => act({ action: 'deleteOrg', orgId: org.id }, 'Company deleted.'))),
        secretForm('orgpw', 'New company password', ' At least 10 characters.', (v) => act({ action: 'resetOrgPassword', orgId: org.id, password: v }, 'Password changed.')));

      const profilesPanel = org && h('section', { class: 'panel' },
        h('h2', null, 'Profiles (people at this company)'),
        org.profiles.length ? org.profiles.map((p) => h('div', null,
          h('div', { class: 'list-row' }, h('strong', null, p.name), h('div', { class: 'row-actions' },
            h('button', { class: 'btn btn-outline btn-xs', type: 'button', onclick: toggle(`pin-${p.id}`) }, 'Reset PIN'),
            dangerBtn('Remove', () => act({ action: 'removeProfile', orgId: org.id, profileId: p.id }, 'Profile removed.')))),
          secretForm(`pin-${p.id}`, `New PIN for ${p.name}`, ' 4 to 6 digits.', (v) => act({ action: 'resetPin', orgId: org.id, profileId: p.id, pin: v }, 'PIN changed.'), true)))
          : h('p', { class: 'muted' }, 'No profiles yet.'),
        h('form', { class: 'subpanel inline', novalidate: true, onsubmit: async (e) => {
          e.preventDefault();
          const f = e.target;
          const r = await act({ action: 'addProfile', orgId: org.id, name: val(f, 'name'), pin: val(f, 'pin') }, 'Profile added.');
          if (r.ok) f.reset();
        } }, input('name', 'Name', { maxlength: '40' }), input('pin', 'PIN (4 to 6 digits)', { type: 'password', inputmode: 'numeric', maxlength: '6', autocomplete: 'new-password' }), h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Add profile')));

      const shipCard = (s) => {
        const sel = h('select', { class: 'status-select', 'aria-label': `Status for ${s.reference}`, onchange: (e) => act({ action: 'setStatus', shipmentId: s.id, status: e.target.value }, 'Status updated.') },
          ['Cleared to ship', 'Needs correction', 'In progress', 'Completed'].map((st) => h('option', { value: st, selected: st === s.status }, st)));
        const kind = h('select', { 'aria-label': 'File type' }, ['DGD', 'Invoice', 'Photo'].map((k) => h('option', { value: k }, k === 'DGD' ? 'DGD (PDF)' : k === 'Invoice' ? 'Invoice (PDF)' : 'Photo (PNG or JPEG)')));
        const file = h('input', { type: 'file', accept: 'application/pdf,image/png,image/jpeg', 'aria-label': 'File to upload' });
        const up = h('button', { class: 'btn btn-primary btn-xs', type: 'submit' }, 'Upload');
        return h('div', { class: 'ship' },
          h('div', { class: 'ship-top' },
            h('div', null, h('h3', null, s.reference), s.description && h('p', { class: 'ship-desc' }, s.description), h('p', { class: 'ship-meta' }, `Created ${fmtDate(s.createdAt)} · removed automatically ${fmtDate(s.expiresAt)}`)),
            h('div', { class: 'row-actions' }, sel, dangerBtn('Delete', () => act({ action: 'deleteShipment', shipmentId: s.id }, 'Shipment deleted.')))),
          s.files.length ? h('div', { class: 'files' }, s.files.map((f) => h('div', { class: 'file-row' },
            h('span', null, h('strong', null, f.kind), ' '), h('a', { href: fileUrl(f.id), target: '_blank', rel: 'noopener' }, f.name),
            h('span', null, fmtSize(f.size)), dangerBtn('Delete file', () => act({ action: 'deleteFile', fileId: f.id }, 'File deleted.'))))) : null,
          h('form', { class: 'subpanel inline', novalidate: true, onsubmit: async (e) => {
            e.preventDefault();
            const f = file.files[0];
            if (!f) { say('Choose a file first.'); return; }
            if (f.size > 3 * 1024 * 1024) { say('That file is over the 3 MB limit.'); return; }
            up.disabled = true; say('Uploading...', true);
            const data = await new Promise((res, rej) => { const rd = new FileReader(); rd.onload = () => res(String(rd.result).split(',')[1]); rd.onerror = rej; rd.readAsDataURL(f); });
            const r = await act({ action: 'uploadFile', shipmentId: s.id, kind: kind.value, name: f.name, data }, 'File uploaded.');
            if (!r.ok) up.disabled = false;
          } }, h('div', null, h('label', null, 'Add a file'), kind), h('div', null, file), up));
      };

      const shipmentsPanel = org && h('section', { class: 'panel' },
        h('h2', null, 'Shipments'),
        h('form', { class: 'subpanel inline', novalidate: true, onsubmit: async (e) => {
          e.preventDefault();
          const f = e.target;
          const r = await act({ action: 'createShipment', orgId: org.id, reference: val(f, 'reference'), description: val(f, 'description'), status: val(f, 'status') }, 'Shipment added.');
          if (r.ok) f.reset();
        } }, input('reference', 'Reference', { maxlength: '60' }), input('description', 'Description (optional)', { maxlength: '200' }),
        h('div', null, h('label', { for: 'f-status' }, 'Status'), h('select', { id: 'f-status', name: 'status' }, ['In progress', 'Cleared to ship', 'Needs correction', 'Completed'].map((st) => h('option', { value: st }, st)))),
        h('button', { class: 'btn btn-primary btn-sm', type: 'submit' }, 'Add shipment')),
        h('div', { class: 'mt' }, state.shipments.length ? state.shipments.map(shipCard) : h('p', { class: 'muted' }, 'No shipments yet.')));

      mount(app, 
        h('div', { class: 'toolbar' },
          h('div', { class: 'grow' }, h('label', { for: 'org-select' }, 'Company'), state.orgs.length ? select : h('p', { class: 'muted' }, 'No companies yet.')),
          h('button', { class: 'btn btn-primary btn-sm', type: 'button', onclick: () => { state.newOrg = !state.newOrg; render(); } }, 'New company')),
        status, newOrgForm, companyPanel, profilesPanel, shipmentsPanel);
    }

    setActions(h('span', { class: 'portal-label' }, 'Portal staff'), signOutBtn('/portal/staff'));
    await load();
  }

  function staffLogin() {
    const status = h('p', { class: 'form-status', role: 'alert' });
    const key = h('input', { id: 'key', type: 'password', autocomplete: 'current-password' });
    const btn = h('button', { class: 'btn btn-primary btn-block', type: 'submit' }, 'Sign in');
    mount($('#app'), h('div', { class: 'auth-card' },
      h('h1', null, 'Portal staff'),
      h('p', { class: 'lead-s' }, 'For the HazPack team: manage client companies, profiles and files.'),
      h('form', { novalidate: true, onsubmit: async (e) => {
        e.preventDefault(); setStatus(status, ''); btn.disabled = true;
        const r = await api('/api/portal-staff-login', 'POST', { key: key.value });
        if (r.ok) { location.reload(); return; }
        btn.disabled = false; key.value = ''; setStatus(status, r.data.error || 'Could not sign in.');
      } }, h('div', { class: 'field' }, h('label', { for: 'key' }, 'Staff key'), key), btn, status)));
  }

  ({ login: loginPage, profile: profilePage, dashboard: dashboardPage, staff: staffPage })[page]?.();
})();
