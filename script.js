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
      if (picked(m).length) m.classList.remove('invalid');
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

  function validate() {
    var ok = true;
    form.querySelectorAll('[required]').forEach(function (el) {
      var good = el.value.trim() !== '' &&
        (el.type !== 'email' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value.trim()));
      el.closest('.field').classList.toggle('invalid', !good);
      if (!good) ok = false;
    });
    msels.forEach(function (m) {
      if (m.hasAttribute('data-required')) {
        var bad = picked(m).length === 0;
        m.classList.toggle('invalid', bad);
        if (bad) ok = false;
      }
    });
    return ok;
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) {
      setStatus('Please complete the highlighted fields and choose at least one service.', 'err');
      var first = form.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea, .msel.invalid .msel-btn');
      if (first) first.focus();
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
          form.reset();
          msels.forEach(refresh);
          setStatus('Thank you! Your request was sent. We will be in touch soon.', 'ok');
        } else {
          throw new Error('bad response');
        }
      })
      .catch(function () {
        setStatus('Sorry, something went wrong. Please try again or email us directly.', 'err');
      })
      .then(function () {
        btn.disabled = false;
        btn.textContent = label;
      });
  });

  form.addEventListener('input', function (e) {
    var f = e.target.closest('.field');
    if (f && !f.classList.contains('msel')) f.classList.remove('invalid');
  });
})();
