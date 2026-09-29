/* Shared newsletter signup behaviour.
   Progressive enhancement for every `form[data-signup]` on the page:
   posts JSON to the Netlify Function, shows success only on a real 2xx,
   and falls back to email on any error. No third-party code. */
(function () {
  var ENDPOINT = '/.netlify/functions/subscribe';

  function field(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? el.value : '';
  }

  function setStatus(el, message, kind) {
    if (!el) return;
    el.textContent = message || '';
    el.classList.remove('is-success', 'is-error');
    if (kind) el.classList.add(kind);
  }

  function initSignup(form) {
    var statusEl = form.querySelector('[data-signup-status]');
    var button = form.querySelector('button[type="submit"], button:not([type])');

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var consentEl = form.querySelector('[name="consent"]');
      var payload = {
        email: field(form, 'email'),
        name: field(form, 'name'),
        consent: consentEl ? consentEl.checked : false,
        website: field(form, 'website'),
        source: field(form, 'source') || form.getAttribute('data-source') || ''
      };

      var originalLabel = button ? button.textContent : '';
      if (button) {
        button.disabled = true;
        button.textContent = form.getAttribute('data-loading') || '…';
      }
      setStatus(statusEl, '', null);

      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
        .then(function (res) {
          if (!res.ok) throw new Error('HTTP ' + res.status);
          form.reset();
          setStatus(
            statusEl,
            form.getAttribute('data-success') ||
              'Almost there — check your inbox to confirm your subscription.',
            'is-success'
          );
          if (button) {
            button.disabled = false;
            button.textContent = originalLabel;
          }
        })
        .catch(function () {
          if (button) {
            button.disabled = false;
            button.textContent = originalLabel;
          }
          setStatus(
            statusEl,
            form.getAttribute('data-error') ||
              'Something went wrong — please email hello@lxrydesigns.com.',
            'is-error'
          );
        });
    });
  }

  function ready(fn) {
    if (document.readyState !== 'loading') fn();
    else document.addEventListener('DOMContentLoaded', fn);
  }

  ready(function () {
    var forms = document.querySelectorAll('form[data-signup]');
    for (var i = 0; i < forms.length; i++) initSignup(forms[i]);
  });
})();
