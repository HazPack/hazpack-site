(function () {
  // Footer year
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  // Mobile nav
  var toggle = document.querySelector('.nav-toggle');
  var nav = document.getElementById('nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    nav.addEventListener('click', function (e) {
      var a = e.target.closest('a');
      if (a) {
        nav.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Resources dropdown
  var dd = document.querySelector('.has-dd');
  if (dd) {
    var ddBtn = dd.querySelector('.dd-toggle');
    var setDd = function (open) {
      dd.classList.toggle('open', open);
      ddBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    };
    ddBtn.addEventListener('click', function () {
      setDd(!dd.classList.contains('open'));
    });
    document.addEventListener('click', function (e) {
      if (!dd.contains(e.target)) setDd(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && dd.classList.contains('open')) {
        setDd(false);
        ddBtn.focus();
      }
    });
  }

  // Quote form
  var form = document.getElementById('quote-form');
  if (!form) return;
  var status = document.getElementById('form-status');
  var btn = document.getElementById('submit-btn');

  // Multi-select dropdowns
  var msels = Array.prototype.slice.call(form.querySelectorAll('.msel'));
  function decode(s) { return s.replace(/&amp;/g, '&'); }
  function picked(m) {
    return Array.prototype.slice.call(m.querySelectorAll('input[type="checkbox"]'))
      .filter(function (b) { return b.checked; })
      .map(function (b) { return decode(b.value); });
  }
  function refresh(m) {
    var vals = picked(m);
    var text = m.querySelector('.msel-text');
    if (vals.length === 0) {
      text.textContent = m.getAttribute('data-placeholder');
      text.classList.add('placeholder');
    } else if (vals.length <= 2) {
      text.textContent = vals.join(', ');
      text.classList.remove('placeholder');
    } else {
      text.textContent = vals.length + ' selected';
      text.classList.remove('placeholder');
    }
    m.querySelector('input[type="hidden"]').value = vals.join(', ');
  }
  function setOpen(m, open) {
    m.classList.toggle('open', open);
    m.querySelector('.msel-btn').setAttribute('aria-expanded', open ? 'true' : 'false');
    m.querySelector('.msel-panel').hidden = !open;
  }
  msels.forEach(function (m) {
    refresh(m);
    m.querySelector('.msel-btn').addEventListener('click', function () {
      var willOpen = !m.classList.contains('open');
      msels.forEach(function (o) { setOpen(o, false); });
      setOpen(m, willOpen);
    });
    m.addEventListener('change', function (e) {
      var t = e.target;
      if (t.type !== 'checkbox') return;
      var boxes = m.querySelectorAll('input[type="checkbox"]');
      if (t.checked) {
        // "Not sure" style options are exclusive with the rest
        boxes.forEach(function (b) {
          if (b === t) return;
          if (t.hasAttribute('data-exclusive') || b.hasAttribute('data-exclusive')) b.checked = false;
        });
      }
      refresh(m);
      if (picked(m).length && m.classList.contains('invalid')) setFieldError(m, '');
    });
    m.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && m.classList.contains('open')) {
        setOpen(m, false);
        m.querySelector('.msel-btn').focus();
      }
    });
  });
  document.addEventListener('click', function (e) {
    msels.forEach(function (m) { if (!m.contains(e.target)) setOpen(m, false); });
  });

  function setStatus(msg, cls) {
    status.textContent = msg;
    status.className = 'form-status ' + (cls || '');
  }

  var alertBox = document.getElementById('form-alert');

  // Inline message under a field (brief #5)
  function setFieldError(field, msg) {
    var ctl = field.querySelector('.msel-btn, input, select, textarea');
    var id = (ctl.id || field.id) + '-err';
    var err = document.getElementById(id);
    field.classList.toggle('invalid', !!msg);
    if (!msg) {
      if (err) err.remove();
      ctl.removeAttribute('aria-invalid');
      ctl.removeAttribute('aria-describedby');
      return;
    }
    if (!err) {
      err = document.createElement('p');
      err.className = 'field-err';
      err.id = id;
      field.appendChild(err);
    }
    err.textContent = msg;
    ctl.setAttribute('aria-invalid', 'true');
    ctl.setAttribute('aria-describedby', id);
  }

  var MESSAGES = {
    name: 'Please enter your name.',
    email: 'Please enter your email address.',
    emailBad: 'Please check your email address, for example name@company.com.',
    message: 'Please tell us a little about your shipment.',
    services: 'Please choose at least one service, or "Not sure yet".'
  };

  // Returns the list of problems, in form order (brief #6: services is only named when none is ticked)
  function validate() {
    var problems = [];
    var name = form.querySelector('#name'), email = form.querySelector('#email'), msg = form.querySelector('#message');
    var services = document.getElementById('services-group');
    function check(field, text) {
      setFieldError(field, text || '');
      if (text) problems.push({ field: field, text: text });
    }
    check(name.closest('.field'), name.value.trim() ? '' : MESSAGES.name);
    var ev = email.value.trim();
    check(email.closest('.field'), !ev ? MESSAGES.email : (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ev) ? '' : MESSAGES.emailBad));
    if (!form.classList.contains('is-question')) check(services, picked(services).length ? '' : MESSAGES.services);
    check(msg.closest('.field'), msg.value.trim() ? '' : MESSAGES.message);
    return problems;
  }

  function showSummary(problems) {
    if (!problems.length) { alertBox.hidden = true; alertBox.innerHTML = ''; return; }
    alertBox.innerHTML = '';
    var h = document.createElement('p');
    h.className = 'form-alert-title';
    h.textContent = problems.length === 1 ? 'One thing needs your attention:' : problems.length + ' things need your attention:';
    var ul = document.createElement('ul');
    problems.forEach(function (pr) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      var ctl = pr.field.querySelector('.msel-btn, input, select, textarea');
      a.href = '#' + ctl.id;
      a.textContent = pr.text;
      a.addEventListener('click', function (e) { e.preventDefault(); ctl.focus(); });
      li.appendChild(a);
      ul.appendChild(li);
    });
    alertBox.appendChild(h);
    alertBox.appendChild(ul);
    alertBox.hidden = false;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var problems = validate();
    showSummary(problems);
    if (problems.length) {
      setStatus(problems.length === 1 ? problems[0].text : 'Please fix the ' + problems.length + ' highlighted fields above.', 'err');
      // Bring the summary into view (it sits at the top of the form), then focus the first field
      alertBox.scrollIntoView({ block: 'start', behavior: 'auto' });
      alertBox.focus({ preventScroll: true });
      return;
    }

    var keyField = form.querySelector('[name="access_key"]');
    if (keyField && keyField.value === 'YOUR_WEB3FORMS_ACCESS_KEY') {
      setStatus('Form is not connected yet. Please email us directly.', 'err');
      return;
    }

    btn.disabled = true;
    var label = btn.textContent;
    btn.textContent = 'Sending...';
    setStatus('', '');

    fetch(form.action, {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
      body: new FormData(form)
    })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok && j.success !== false, j: j }; }); })
      .then(function (res) {
        if (res.ok) {
          showDone(form.querySelector('#name').value.trim());
        } else {
          throw new Error('bad response');
        }
      })
      .catch(function () {
        // Failed send: give the address and number right here (brief 2, #5)
        setStatus('', 'err');
        status.appendChild(document.createTextNode("Sorry, that didn't send. Please try again, or email "));
        status.appendChild(link('mailto:lax-dgr@hazpackcompliance.com', 'lax-dgr@hazpackcompliance.com'));
        status.appendChild(document.createTextNode(' or call '));
        status.appendChild(link('tel:+13104253712', '+1 (310) 425-3712'));
        status.appendChild(document.createTextNode('.'));
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = label;
      });
  });

  function link(href, text) {
    var a = document.createElement('a');
    a.href = href;
    a.textContent = text;
    return a;
  }

  // After a successful send, swap the form for a confirmation the visitor can see (brief 2, #1)
  var fields = document.getElementById('form-fields'), done = document.getElementById('form-done');
  function showDone(name) {
    var isQ = form.classList.contains('is-question');
    done.innerHTML = '';
    var h = document.createElement('h2');
    h.textContent = name ? 'Thanks, ' + name.split(/\s+/)[0] + '.' : 'Thanks.';
    var p1 = document.createElement('p');
    p1.textContent = "We've got your " + (isQ ? 'question' : 'request') + ' and will reply within one business day.';
    var p2 = document.createElement('p');
    p2.appendChild(document.createTextNode('Urgent? Call '));
    p2.appendChild(link('tel:+13104253712', '+1 (310) 425-3712'));
    p2.appendChild(document.createTextNode('.'));
    var again = document.createElement('button');
    again.type = 'button';
    again.className = 'btn btn-outline btn-sm';
    again.textContent = isQ ? 'Ask another question' : 'Send another request';
    again.addEventListener('click', function () {
      form.reset();
      Array.prototype.forEach.call(form.querySelectorAll('input[data-yn]'), function (cb) {
        var hd = form.querySelector('input[name="' + cb.getAttribute('data-yn') + '"]');
        if (hd) hd.value = 'No';
      });
      applyPreset();
      msels.forEach(refresh);
      setStatus('', '');
      done.hidden = true;
      fields.hidden = false;
      form.querySelector('#name').focus();
    });
    done.appendChild(h); done.appendChild(p1); done.appendChild(p2); done.appendChild(again);
    showSummary([]);
    fields.hidden = true;
    done.hidden = false;
    done.scrollIntoView({ block: 'center' });
    done.focus({ preventScroll: true });
  }

  // Optional shipment details: open on larger screens, closed until tapped on phones (brief 2, #15)
  var more = document.getElementById('more-details');
  if (more && window.matchMedia('(min-width: 761px)').matches) more.open = true;

  // Yes/No checkboxes: send "Yes" or "No" in the email instead of nothing when unchecked
  Array.prototype.forEach.call(form.querySelectorAll('input[data-yn]'), function (cb) {
    cb.addEventListener('change', function () {
      var hidden = form.querySelector('input[name="' + cb.getAttribute('data-yn') + '"]');
      if (hidden) hidden.value = cb.checked ? 'Yes' : 'No';
    });
  });

  form.addEventListener('input', function (e) {
    var f = e.target.closest('.field');
    if (f && !f.classList.contains('msel') && f.classList.contains('invalid') && e.target.value.trim()) setFieldError(f, '');
  });

  // Links like /quote?service=inspection open the form with that service ticked,
  // and set the heading, button and email subject to match (brief 2, #2, #7, #11, #12, #21)
  function ticked(name) { return "We've ticked " + name + ' for you below.'; }
  var PRESETS = {
    classification: { value: 'DG classification', lead: ticked('DG classification') },
    documentation: { value: 'Documentation & DGD', lead: ticked('Documentation & DGD') },
    packaging: { value: 'Packaging & labeling', lead: ticked('Packaging & labeling') },
    inspection: { value: 'DG inspections', title: 'Request an Inspection', lead: 'Tell us what needs inspecting and where. ' + ticked('DG inspections'), button: 'Send inspection request', subject: 'New inspection request from HazPackCompliance.com' },
    emergency: { value: 'DG emergency support', title: 'Urgent DG help', lead: 'For anything needed today, call +1 (310) 425-3712. Otherwise send the form and we will reply within one business day.', subject: 'Urgent: new DG emergency request from HazPackCompliance.com' },
    consulting: { value: 'DG consulting', lead: ticked('DG consulting') },
    temperature: { value: 'Temperature control', lead: ticked('Temperature control') },
    'dry-ice': { value: 'Dry ice services', lead: ticked('Dry ice services') },
    question: { value: 'Not sure yet', question: true, title: 'Contact Us', lead: 'Questions are welcome. Ask anything about your shipment, call or email us. There is no obligation and no job is booked.', button: 'Send question', subject: 'New question from HazPackCompliance.com' }
  };
  var isContact = location.pathname.replace(/\/$/, '') === '/contact';
  var preset = PRESETS[isContact ? 'question' : new URLSearchParams(location.search).get('service')];
  function applyPreset() {
    if (!preset) return;
    var box = form.querySelector('#services-group input[value="' + preset.value + '"]');
    if (box) { box.checked = true; refresh(document.getElementById('services-group')); }
  }
  if (preset) {
    applyPreset();
    var t = document.getElementById('quote-title'), l = document.getElementById('quote-lead');
    if (preset.title && t) { t.textContent = preset.title; document.title = preset.title + ' | HazPack Compliance Solutions'; }
    if (preset.lead && l) l.textContent = preset.lead;
    if (preset.button) btn.textContent = preset.button;
    if (preset.subject) form.querySelector('[name="subject"]').value = preset.subject;
    if (preset.question) {
      // Contact page: breadcrumb, menu highlight and form title say Contact (brief 3, #5)
      var crumb = document.getElementById('quote-crumb');
      if (crumb) crumb.textContent = 'Contact';
      var navQuote = document.querySelector('.nav a[href="/quote"][aria-current]'), navContact = document.querySelector('.nav a[href="/contact"]');
      if (navQuote) navQuote.removeAttribute('aria-current');
      if (navContact) navContact.setAttribute('aria-current', 'page');
      var ft = document.getElementById('form-title');
      if (ft) ft.hidden = false;
      form.classList.add('is-question');
      var ml = document.getElementById('message-label');
      ml.firstChild.textContent = 'Your question ';
      document.getElementById('message').placeholder = 'What would you like to know?';
    }
  }
})();

// Step-by-step package animations: Home "package builder" and Services "inspection"
(function () {
  function init(rootId, p, playIdle) {
    var root = document.getElementById(rootId);
    if (!root) return;
    var $ = function (s) { return document.getElementById(p + s); };

    var steps = Array.prototype.slice.call(root.querySelectorAll('.b-step'));
    var layers = Array.prototype.slice.call(root.querySelectorAll('[data-min]'));
    var pkg = $('pkg');
    var shift = $('shift');
    var mag = $('mag');
    var magPos = mag ? JSON.parse(mag.getAttribute('data-pos')) : null;
    var bar = $('bar');
    var count = $('count');
    var now = $('now');
    var live = $('live');
    var back = $('back');
    var next = $('next');
    var play = $('play');
    var total = steps.length;
    var cur = 0;
    var timer = null;

    function titleOf(i) { return steps[i - 1].querySelector('.b-title').textContent; }
    function descOf(i) { return steps[i - 1].querySelector('.b-desc').textContent; }

    function render() {
      layers.forEach(function (el) {
        var min = parseInt(el.getAttribute('data-min'), 10);
        var maxAttr = el.getAttribute('data-max');
        var max = maxAttr === null ? 99 : parseInt(maxAttr, 10);
        var on = cur >= min && cur <= max;
        if (el.classList.contains('on') !== on) el.classList.toggle('on', on);
      });
      steps.forEach(function (btn, idx) {
        var n = idx + 1;
        btn.classList.toggle('active', n === cur);
        btn.classList.toggle('done', n < cur);
        if (n === cur) btn.setAttribute('aria-current', 'step'); else btn.removeAttribute('aria-current');
        btn.querySelector('.b-num').textContent = n < cur ? '✓' : String(n);
      });
      if (pkg) pkg.classList.toggle('lift', cur === total);
      if (shift) shift.classList.toggle('left', cur !== 1);
      if (mag) {
        var at = magPos[Math.min(Math.max(cur, 1), magPos.length) - 1];
        mag.style.transform = 'translate(' + at[0] + 'px,' + at[1] + 'px)';
        mag.classList.toggle('on', cur >= 1 && cur <= magPos.length);
      }
      bar.style.width = (cur / total * 100) + '%';
      count.textContent = cur === 0 ? 'Click a step to begin' : 'Step ' + cur + ' of ' + total;
      now.innerHTML = '';
      var b = document.createElement('b');
      var s = document.createElement('span');
      if (cur === 0) {
        b.textContent = root.getAttribute('data-intro-title') || 'Get started';
        s.textContent = 'Press Next step, pick a step below, or let it play on its own.';
      } else {
        b.textContent = titleOf(cur);
        s.textContent = descOf(cur);
      }
      now.appendChild(b);
      now.appendChild(s);
      live.textContent = cur === 0 ? '' : 'Step ' + cur + ' of ' + total + ': ' + titleOf(cur) + '. ' + descOf(cur);
      back.disabled = cur === 0;
      next.textContent = cur === total ? 'Start over' : 'Next step';
    }

    function go(n) {
      cur = Math.max(0, Math.min(total, n));
      render();
    }

    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      play.textContent = playIdle;
    }

    function start() {
      if (cur >= total) go(0);
      play.textContent = 'Pause';
      setTimeout(function () { if (timer) go(cur + 1); }, 400);
      timer = setInterval(function () {
        if (cur >= total) { stop(); return; }
        go(cur + 1);
        if (cur >= total) stop();
      }, 3200);
    }

    steps.forEach(function (btn, idx) {
      btn.addEventListener('click', function () { stop(); go(idx + 1); });
    });
    back.addEventListener('click', function () { stop(); go(cur - 1); });
    next.addEventListener('click', function () { stop(); go(cur >= total ? 0 : cur + 1); });
    play.addEventListener('click', function () { if (timer) stop(); else start(); });

    render();
  }

  init('builder', 'b-', 'Watch it build');
  init('inspection-demo', 'i-', 'Watch it run');
})();

// Quiet polish: sections ease in as they scroll into view (skipped for reduced motion)
(function () {
  if (!('IntersectionObserver' in window) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var groups = ['.section-head', '.cards', '.steps', '.values', '.badges', '.about-grid > div', '.split', '.cta-inner', '.reg-grid', '.cards-3'];
  var items = [];
  groups.forEach(function (sel) {
    document.querySelectorAll('main ' + sel).forEach(function (g) {
      var kids = /cards|steps|values|badges|reg-grid/.test(sel) ? g.children : [g];
      Array.prototype.forEach.call(kids, function (el, i) {
        if (el.closest('.hero') || el.classList.contains('rv')) return;
        el.classList.add('rv'); el.style.setProperty('--rd', Math.min(i, 5) * 0.07 + 's'); items.push(el);
      });
    });
  });
  function show(el) { el.classList.add('in'); setTimeout(function () { el.classList.add('settled'); }, 700 + parseFloat(el.style.getPropertyValue('--rd')) * 1000); }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach(function (el) {
    if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('in', 'settled'); else io.observe(el);
  });
  document.documentElement.classList.add('js-reveal');
})();

// Searchable question index on the Resources page
(function () {
  var root = document.getElementById('qx');
  if (!root) return;
  var tools = root.querySelector('.qx-tools'), input = document.getElementById('qx-q');
  var chips = Array.prototype.slice.call(root.querySelectorAll('.qx-chip'));
  var items = Array.prototype.slice.call(root.querySelectorAll('.qx-list li'));
  var count = document.getElementById('qx-count'), empty = document.getElementById('qx-empty'), list = document.getElementById('qx-list');
  var cat = 'all';
  items.forEach(function (li) {
    var q = li.querySelector('.qx-q');
    li._q = q.textContent; li._text = (li.textContent || '').toLowerCase();
  });
  function esc(t) { return t.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function inCat(li, c) { return c === 'all' || (' ' + li.getAttribute('data-cat') + ' ').indexOf(' ' + c + ' ') > -1; }
  function apply(typed) {
    var term = input.value.trim().toLowerCase(), words = term ? term.split(/\s+/) : [], shown = 0;
    function hit(li) { return words.every(function (w) { return li._text.indexOf(w) > -1; }); }
    items.forEach(function (li) {
      var ok = inCat(li, cat) && hit(li), q = li.querySelector('.qx-q');
      li.hidden = !ok; if (ok) shown++;
      var h = esc(li._q);
      words.forEach(function (w) { if (w.length > 1) h = h.replace(new RegExp('(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'ig'), '<mark>$1</mark>'); });
      q.innerHTML = h;
      if (typed) li.querySelector('details').open = ok && term.length > 2;
    });
    chips.forEach(function (b) {
      var c = b.getAttribute('data-cat');
      b.querySelector('.qx-n').textContent = items.filter(function (li) { return inCat(li, c) && hit(li); }).length;
    });
    count.textContent = shown === items.length ? items.length + ' questions' : 'Showing ' + shown + ' of ' + items.length + ' questions';
    empty.hidden = shown > 0; list.hidden = shown === 0;
  }
  chips.forEach(function (b) {
    b.addEventListener('click', function () {
      cat = b.getAttribute('data-cat');
      chips.forEach(function (x) { x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      apply();
    });
  });
  input.addEventListener('input', function () { apply(true); });
  input.addEventListener('keydown', function (e) { if (e.key === 'Escape') { input.value = ''; apply(true); } });
  tools.hidden = false;
  apply();
})();
