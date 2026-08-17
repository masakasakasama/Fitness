(function () {
  'use strict';

  const APP_VERSION = 'v0.1.2';
  window.REPS_VERSION = APP_VERSION;

  function renderVersion() {
    const brandName = document.querySelector('.brand-name');
    if (!brandName || document.getElementById('appVersionLabel')) return;

    const label = document.createElement('span');
    label.id = 'appVersionLabel';
    label.textContent = APP_VERSION;
    label.style.cssText = 'margin-left:7px;font-size:9px;font-weight:700;letter-spacing:.04em;color:var(--muted);vertical-align:middle;';
    brandName.appendChild(label);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', renderVersion, { once: true });
  } else {
    renderVersion();
  }
})();
