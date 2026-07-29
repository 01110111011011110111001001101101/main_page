import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createPage, root, settle } from './helpers/load-scripts.mjs';

const html = readFileSync(path.join(root, 'index.html'), 'utf8');

/*
 * Ίδια σειρά με το production bundle (scripts/build-js-bundle.mjs), συν το
 * image-preview.js που το initializeUi καλεί κατευθείαν.
 *
 * Το offer-renderer.js μένει απ' έξω επίτηδες: αυτοεκκινείται και κάνει fetch
 * που ολοκληρώνεται αφού τελειώσει το test, οπότε το node --test το χρεώνει ως
 * asynchronous activity after the test ended. Η συγκατάθεση δεν το χρειάζεται.
 */
const SCRIPTS = [
  'config.js',
  'scroll-coordinator.js',
  'clipboard.js',
  'image-preview.js',
  'ui.js',
  'modals.js',
  'offers.js',
  'tracking.js',
];

/*
 * Το window ΠΡΕΠΕΙ να κλείνει μετά από κάθε test. Με αποδεκτά cookies το
 * tracking ανοίγει setInterval για το heartbeat· στο jsdom αυτό το timer κρατάει
 * το event loop ζωντανό και το `node --test` δεν τερματίζει ποτέ.
 */
function bootPage(t, storedConsent) {
  const page = createPage({ html, files: SCRIPTS });
  t.after(() => page.window.close());

  if (storedConsent) page.window.localStorage.setItem('cookieConsent', storedConsent);
  page.window.App.ui.init();
  return page;
}

test('η αποδοχή φορτώνει το GA και το αποθηκεύει', (t) => {
  const { window, document } = bootPage(t);

  assert.equal(document.documentElement.dataset.cookieConsent, 'pending');

  document.querySelector('#cookieConsentBanner [data-cookie-consent="accept"]').click();

  assert.equal(window.localStorage.getItem('cookieConsent'), 'accepted');
  assert.equal(window.trackingLoaded, true);
  assert.equal(window['ga-disable-G-LHQ9SHKY6J'], false);
  assert.ok(document.querySelector('script[data-analytics-script]'));
});

test('η απόρριψη μετά από αποδοχή σταματάει όντως τη συλλογή', (t) => {
  const { window, document } = bootPage(t);

  document.querySelector('#cookieConsentBanner [data-cookie-consent="accept"]').click();
  assert.equal(window.trackingLoaded, true);

  document.querySelector('#cookiesModal [data-cookie-consent="reject"]').click();

  assert.equal(window.localStorage.getItem('cookieConsent'), 'rejected');
  assert.equal(window.trackingLoaded, false, 'το GA πρέπει να θεωρείται ξεφορτωμένο');
  assert.equal(window['ga-disable-G-LHQ9SHKY6J'], true, 'το ga-disable πρέπει να είναι ενεργό');
});

test('η απόρριψη διαγράφει τα cookies του GA', (t) => {
  const { window, document } = bootPage(t);

  window.document.cookie = '_ga=GA1.1.123.456; path=/';
  window.document.cookie = '_ga_G-LHQ9SHKY6J=GS1.1.999; path=/';

  document.querySelector('#cookiesModal [data-cookie-consent="reject"]').click();

  assert.doesNotMatch(window.document.cookie, /_ga/);
});

test('τα κουμπιά του modal δουλεύουν και χωρίς banner στο DOM', (t) => {
  const { window, document } = bootPage(t);

  document.getElementById('cookieConsentBanner').remove();
  document.querySelector('#cookiesModal [data-cookie-consent="accept"]').click();

  assert.equal(window.localStorage.getItem('cookieConsent'), 'accepted');
  assert.equal(document.documentElement.dataset.cookieConsent, 'accepted');
});

test('το banner κρύβεται μόνο αφού τελειώσει το fade out', async (t) => {
  const { document } = bootPage(t);
  const banner = document.getElementById('cookieConsentBanner');

  document.querySelector('#cookieConsentBanner [data-cookie-consent="reject"]').click();

  assert.equal(banner.style.opacity, '0');
  assert.equal(
    document.documentElement.dataset.cookieConsent,
    'pending',
    'το attribute δεν πρέπει να αλλάζει πριν τελειώσει το transition',
  );

  await settle(260);

  assert.equal(document.documentElement.dataset.cookieConsent, 'rejected');
  assert.ok(banner.classList.contains('hidden'));
});

test('το modal δείχνει την τρέχουσα επιλογή', (t) => {
  const { document } = bootPage(t);
  const state = document.querySelector('[data-consent-state]');

  assert.equal(state.dataset.consentState, 'pending');

  document.querySelector('#cookiesModal [data-cookie-consent="accept"]').click();

  assert.equal(state.dataset.consentState, 'accepted');
  assert.match(state.textContent, /αποδοχή στατιστικών/i);
  assert.equal(
    document.querySelector('#cookiesModal [data-cookie-consent="accept"]').getAttribute('aria-pressed'),
    'true',
  );
  assert.equal(
    document.querySelector('#cookiesModal [data-cookie-consent="reject"]').getAttribute('aria-pressed'),
    'false',
  );
});

test('αποθηκευμένη απόρριψη επιβεβαιώνει το ga-disable σε νέα φόρτωση', (t) => {
  const { window } = bootPage(t, 'rejected');

  assert.equal(window['ga-disable-G-LHQ9SHKY6J'], true);
  assert.equal(window.trackingLoaded, false);
});

test('το banner έχει προσβάσιμη ταυτότητα', (t) => {
  const { document } = bootPage(t);
  const banner = document.getElementById('cookieConsentBanner');

  assert.equal(banner.tagName.toLowerCase(), 'section');
  assert.ok(document.getElementById(banner.getAttribute('aria-labelledby')));
  assert.ok(document.getElementById(banner.getAttribute('aria-describedby')));
});
