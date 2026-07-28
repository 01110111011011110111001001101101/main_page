import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const FILES = ['config.js', 'scroll-coordinator.js', 'clipboard.js', 'image-preview.js', 'ui.js', 'modals.js', 'offers.js', 'offer-renderer.js', 'tracking.js', 'main.js'];
const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

async function createSite(offers) {
  const data = offers || JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8'));
  const dom = new JSDOM(readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://example.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.fetch = async () => ({ ok: true, json: async () => data });
  window.gtag = () => {};
  window.scrollTo = () => {};
  window.eval(FILES.map((file) => readFileSync(path.join(root, 'assets/js', file), 'utf8')).join('\n;\n'));
  await settle();

  const { document } = window;
  return {
    document,
    count: (category) => document.querySelector(`.offer-filter-bar [data-category-filter="${category}"] .offer-filter-count`)?.textContent,
    chipCount: (category) => document.querySelector(`.premium-menu-chip[data-sidebar-category="${category}"] .offer-filter-count`)?.textContent,
  };
}

test('κάθε κατηγορία δείχνει πόσες προσφορές έχει', async () => {
  const site = await createSite();

  assert.equal(site.count('mobile'), '2');
  assert.equal(site.count('internet'), '3');
  assert.equal(site.count('tv'), '1');
});

test('τα chips του μενού δείχνουν τους ίδιους αριθμούς', async () => {
  const site = await createSite();

  for (const category of ['mobile', 'internet', 'tv']) {
    assert.equal(site.chipCount(category), site.count(category), `διαφωνούν στο ${category}`);
  }
});

/* Το «Όλες» δεν παίρνει αριθμό: δίπλα στα 2 / 3 / 1 των κατηγοριών, ένα 6
   διαβάζεται σαν τέταρτη κατηγορία αντί για άθροισμα. */
test('το «Όλες» δεν δείχνει σύνολο', async () => {
  const site = await createSite();
  const all = site.document.querySelector('.offer-filter-bar [data-category-filter="all"]');

  assert.equal(all.querySelector('.offer-filter-count'), null, 'το σύνολο μπερδεύει');
  assert.equal(all.textContent.trim(), 'Όλες');
});

test('οι αριθμοί ακολουθούν το offers.json χωρίς χειρόγραφη αλλαγή', async () => {
  const offers = JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8'));
  offers.offers = offers.offers.filter((offer) => offer.category !== 'internet');
  const site = await createSite(offers);

  assert.equal(site.count('mobile'), '2');
  assert.equal(site.count('tv'), '1');
});

test('κατηγορία χωρίς προσφορές κρύβει το φίλτρο της', async () => {
  const offers = JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8'));
  offers.offers = offers.offers.filter((offer) => offer.category !== 'tv');
  const site = await createSite(offers);

  const tv = site.document.querySelector('.offer-filter-bar [data-category-filter="tv"]');
  const mobile = site.document.querySelector('.offer-filter-bar [data-category-filter="mobile"]');

  assert.equal(tv.hidden, true, 'το άδειο φίλτρο κρύβεται');
  assert.equal(mobile.hidden, false, 'τα υπόλοιπα μένουν');
});

test('ο αριθμός δεν διαβάζεται ξεκάρφωτα από αναγνώστη οθόνης', async () => {
  const site = await createSite();
  const button = site.document.querySelector('.offer-filter-bar [data-category-filter="tv"]');

  assert.equal(button.querySelector('.offer-filter-count').getAttribute('aria-hidden'), 'true');
  assert.equal(button.getAttribute('aria-label'), 'TV: 1 προσφορά', 'ενικός για μία προσφορά');
});

/* Η «Γρήγορη εκκίνηση» κατέβηκε κάτω από τις προσφορές και κράτησε μόνο τις δύο
   πραγματικές ενέργειες. Τα τέσσερα κουμπιά κατηγορίας έφυγαν — ήταν διπλότυπα
   των chips και μπέρδευαν τον χρήστη με δύο σετ φίλτρων στην ίδια σελίδα. */
test('η Γρήγορη εκκίνηση δεν έχει πια διπλότυπα φίλτρα', async () => {
  const site = await createSite();
  const hub = site.document.getElementById('choiceHub');

  assert.equal(hub.querySelectorAll('[data-category-filter]').length, 0, 'έμειναν κουμπιά κατηγορίας');
  assert.equal(hub.querySelectorAll('.choice-card').length, 2, 'μένουν μόνο οδηγός και χάρτης');
  assert.equal(hub.querySelector('.offer-filter-count'), null, 'δεν μπαίνει μετρητής εκεί');
});

/* Η απόκρυψη των προσφορών ήταν διπλή: ένας κανόνας CSS ΚΑΙ ένα hidden=true
   από τη JavaScript. Αφαιρώντας μόνο τον έναν, η ενότητα εξαφανιζόταν εντελώς
   — η σελίδα πήγαινε από το hero στην «Υποστήριξη». */
test('οι προσφορές είναι ορατές από την πρώτη φόρτωση, και στο κινητό', async () => {
  for (const mobile of [true, false]) {
    const data = JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8'));
    const dom = new JSDOM(readFileSync(path.join(root, 'index.html'), 'utf8'), {
      url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true,
    });

    const { window } = dom;
    window.matchMedia = (query) => ({ matches: mobile && /max-width:\s*767px/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
    window.fetch = async () => ({ ok: true, json: async () => data });
    window.gtag = () => {};
    window.scrollTo = () => {};
    window.eval(FILES.map((file) => readFileSync(path.join(root, 'assets/js', file), 'utf8')).join('\n;\n'));
    await settle();

    const panel = window.document.getElementById('offers');
    const where = mobile ? 'κινητό' : 'υπολογιστή';

    assert.equal(panel.hidden, false, `στο ${where} η ενότητα είναι hidden`);
    assert.equal(window.document.querySelectorAll('[data-offer-card]').length, 6, `στο ${where} λείπουν κάρτες`);
    assert.ok(window.document.getElementById('offers-title'), `στο ${where} λείπει η επικεφαλίδα`);
  }
});

test('κανένας κανόνας CSS δεν κρύβει τις προσφορές πριν από κλικ', () => {
  const css = readFileSync(path.join(root, 'assets/css/site.css'), 'utf8');
  const critical = readFileSync(path.join(root, 'assets/css/critical.css'), 'utf8');

  for (const [name, source] of [['site.css', css], ['critical.css', critical]]) {
    assert.doesNotMatch(
      source,
      /offers-section-catalog:not\(\.is-offers-open\)[^}]*display:\s*none/,
      `το ${name} κρύβει ξανά τις προσφορές`
    );
  }
});

test('η Γρήγορη εκκίνηση έρχεται μετά τις προσφορές', async () => {
  const site = await createSite();
  const offers = site.document.getElementById('offers');
  const hub = site.document.getElementById('choiceHub');

  const position = offers.compareDocumentPosition(hub);
  assert.ok(position & 4, 'η ενότητα υποστήριξης πρέπει να ακολουθεί τις προσφορές');
});
