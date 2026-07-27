import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Ο τίτλος του hero αποδίδεται ολόκληρος, μετά αδειάζει και ξαναγράφεται
   γράμμα-γράμμα. Χωρίς κλείδωμα ύψους η σελίδα από κάτω τιναζόταν δύο φορές. */
test('ο τίτλος κρατά το ύψος του όσο γράφεται', async () => {
  const dom = new JSDOM('<h1 data-typewriter>Ένας αρκετά μακρύς τίτλος που τυλίγεται</h1>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });

  const title = window.document.querySelector('[data-typewriter]');
  title.getBoundingClientRect = () => ({ height: 84, width: 300, top: 0, left: 0 });

  window.eval(readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8'));
  window.eval('initializeTypewriters()');

  // Όσο γράφει, το ύψος είναι κλειδωμένο στο μετρημένο.
  await settle(300);
  assert.equal(title.style.minHeight, '84px', 'δεν κλειδώθηκε το ύψος');
  assert.equal(title.classList.contains('is-typing'), true);

  // Μόλις τελειώσει, το κλείδωμα φεύγει.
  await settle(2600);
  assert.equal(title.classList.contains('is-typed'), true, 'δεν ολοκληρώθηκε η γραφή');
  assert.equal(title.style.minHeight, '', 'έμεινε κλειδωμένο το ύψος');
});

test('ο τίτλος δεν χάνει κείμενο ούτε προσβασιμότητα', async () => {
  const full = 'Ένας αρκετά μακρύς τίτλος που τυλίγεται';
  const dom = new JSDOM(`<h1 data-typewriter>${full}</h1>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });

  const title = window.document.querySelector('[data-typewriter]');
  window.eval(readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8'));
  window.eval('initializeTypewriters()');
  await settle(2600);

  assert.equal(title.getAttribute('aria-label'), full);
  assert.equal(title.querySelector('.typewriter-text').textContent, full);
});

/* Το banner cookies είναι fixed. Αν εμφανιστεί πριν φτάσει το πλήρες CSS,
   αλλάζει μέγεθος και χρεώνεται ως layout shift. */
test('το banner cookies μπαίνει με transform, όχι με display', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const critical = html.match(/<style id="critical-css">([\s\S]*?)<\/style>/)[1];

  assert.match(critical, /app-css-ready[^{]*#cookieConsentBanner[^{]*\{[^}]*transform:none/,
    'λείπει η αποκάλυψη με transform μετά το app-css-ready');
  assert.match(critical, /data-cookie-consent=pending\][^{]*#cookieConsentBanner[^{]*\{[^}]*translateY/,
    'το banner δεν ξεκινά εκτός οθόνης');
});

test('το πλήρες stylesheet σηματοδοτεί πότε είναι έτοιμο', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(html, /onload="[^"]*app-css-ready[^"]*"/, 'το link δεν προσθέτει το app-css-ready');
  assert.match(html, /<noscript>[\s\S]*?#cookieConsentBanner\{transform:none!important/,
    'χωρίς JavaScript το banner θα έμενε κρυφό');
});
