import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const FILES = ['config.js', 'scroll-coordinator.js', 'clipboard.js', 'image-preview.js', 'ui.js', 'modals.js', 'offers.js', 'offer-renderer.js', 'tracking.js', 'main.js'];
const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

async function createSite({ mobile = false } = {}) {
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

  return { document: window.document };
}

/* Η απόκρυψη των προσφορών ήταν διπλή: ένας κανόνας CSS ΚΑΙ ένα hidden=true από
   τη JavaScript. Αφαιρώντας μόνο τον έναν, η ενότητα εξαφανιζόταν εντελώς. */
test('οι προσφορές είναι ορατές από την πρώτη φόρτωση, και στο κινητό', async () => {
  for (const mobile of [true, false]) {
    const site = await createSite({ mobile });
    const where = mobile ? 'κινητό' : 'υπολογιστή';

    assert.equal(site.document.getElementById('offers').hidden, false, `στο ${where} η ενότητα είναι hidden`);
    assert.equal(site.document.querySelectorAll('[data-offer-card]').length, 6, `στο ${where} λείπουν κάρτες`);
    assert.ok(site.document.getElementById('offers-title'), `στο ${where} λείπει η επικεφαλίδα`);
  }
});

test('κανένας κανόνας CSS δεν κρύβει τις προσφορές πριν από κλικ', () => {
  for (const name of ['site.css', 'critical.css']) {
    const source = readFileSync(path.join(root, 'assets/css', name), 'utf8');
    assert.doesNotMatch(
      source,
      /offers-section-catalog:not\(\.is-offers-open\)[^}]*display:\s*none/,
      `το ${name} κρύβει ξανά τις προσφορές`
    );
  }
});

/* Τα τέσσερα κουμπιά κατηγορίας της «Γρήγορης εκκίνησης» ήταν διπλότυπα των
   chips και μπέρδευαν τον χρήστη με δύο σετ φίλτρων στην ίδια σελίδα. */
test('η Υποστήριξη δεν έχει διπλότυπα φίλτρα και έρχεται μετά τις προσφορές', async () => {
  const site = await createSite();
  const hub = site.document.getElementById('choiceHub');

  assert.equal(hub.querySelectorAll('[data-category-filter]').length, 0, 'έμειναν κουμπιά κατηγορίας');
  assert.equal(hub.querySelectorAll('.choice-card').length, 2, 'μένουν μόνο οδηγός και χάρτης');
  assert.ok(
    site.document.getElementById('offers').compareDocumentPosition(hub) & 4,
    'η Υποστήριξη πρέπει να ακολουθεί τις προσφορές'
  );
});

/* Τα φίλτρα δείχνουν μόνο το όνομα της κατηγορίας. Οι αριθμοί αφαιρέθηκαν:
   δίπλα σε τέσσερα κουμπιά διαβάζονταν σαν μέρος της ετικέτας. */
test('τα φίλτρα δεν δείχνουν αριθμούς', async () => {
  const site = await createSite();
  const labels = [...site.document.querySelectorAll('.offer-filter-bar [data-category-filter]')]
    .map((button) => button.textContent.trim());

  assert.deepEqual(labels, ['Όλες', 'Κινητή', 'Internet', 'TV']);
  assert.equal(site.document.querySelector('.offer-filter-count'), null, 'έμεινε μετρητής');
});

test('πουθενά δεν γράφει ότι οι προσφορές είναι μόνο για μέλη', () => {
  const files = ['index.html', 'info.html', 'assets/data/offers.json'];

  for (const file of files) {
    const source = readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /για (τα )?μέλη|Μέλη που/, `το ${file} περιορίζει τις προσφορές σε μέλη`);
  }
});
