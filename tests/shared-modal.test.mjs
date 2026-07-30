import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const FILES = ['config.js', 'scroll-coordinator.js', 'clipboard.js', 'image-preview.js', 'ui.js', 'modals.js', 'offers.js', 'offer-renderer.js', 'tracking.js', 'main.js'];
const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

async function createSite({ modal = 'nova-line-phone.html' } = {}) {
  const dom = new JSDOM(readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://example.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8')) });
  window.gtag = () => {};
  window.scrollTo = () => {};

  // Το modal φορτώνεται lazy στο production· εδώ μπαίνει απευθείας.
  window.document.getElementById('lazyModalRoot').innerHTML =
    readFileSync(path.join(root, 'assets/modals/', modal), 'utf8');

  window.eval(FILES.map((file) => readFileSync(path.join(root, 'assets/js', file), 'utf8')).join('\n;\n'));
  await settle();

  const { document } = window;
  return {
    window,
    document,
    modal: document.getElementById('novaLinePhone'),
    openFrom(offerId) {
      document.querySelector(`[data-offer-id="${offerId}"] .offer-primary-cta`)
        .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    },
    docs: () => readDocumentTiles(document, '#novaLinePhone'),
  };
}

/*
 * Κάθε έντυπο είναι πλέον ζευγάρι: κουμπί «Προβολή» με data-pdf-url (ανοίγει τον
 * ενσωματωμένο viewer) και σύνδεσμος «Λήψη» με download. Ο τίτλος διαβάζεται από
 * την ετικέτα, όχι από όλο το textContent του πλακιδίου, γιατί το πλακίδιο
 * περιέχει και το badge «Προβολή».
 */
function readDocumentTiles(document, modalSelector) {
  return [...document.querySelectorAll(`${modalSelector} .modal-offer-doc-group`)].map((group) => ({
    title: group.querySelector('.modal-offer-doc__label').textContent.trim(),
    href: group.querySelector('.modal-offer-doc__download').getAttribute('href'),
  }));
}

test('οι δύο προσφορές Nova δείχνουν στο ίδιο modal', async () => {
  const site = await createSite();
  const targets = ['nova-5g-internet', 'nova-fiber-internet'].map((id) => (
    site.document.querySelector(`[data-offer-id="${id}"] .offer-primary-cta`).dataset.modalTarget
  ));

  assert.deepEqual(targets, ['novaLinePhone', 'novaLinePhone']);
});

test('κάθε κάρτα δηλώνει ποια προσφορά ανοίγει το modal', async () => {
  const site = await createSite();

  for (const id of ['nova-5g-internet', 'nova-fiber-internet']) {
    const cta = site.document.querySelector(`[data-offer-id="${id}"] .offer-primary-cta`);
    assert.equal(cta.dataset.modalOffer, id);
  }
});

test('το 5G ανοίγει τα δικά του έντυπα και τίτλο', async () => {
  const site = await createSite();
  site.openFrom('nova-5g-internet');
  await settle(60);

  assert.equal(site.modal.querySelector('[data-modal-offer-title]').textContent, 'Nova 5G Internet');
  assert.deepEqual(site.docs(), [
    { title: 'Αίτηση Nova 5G', href: 'assets/docs/nova-5g-aitisi.pdf' },
    { title: 'Παράδειγμα συμπλήρωσης', href: 'assets/docs/nova-5g-paradeigma.pdf' },
  ]);
});

test('η οπτική ίνα ανοίγει διαφορετικό έντυπο και τίτλο', async () => {
  const site = await createSite();
  site.openFrom('nova-fiber-internet');
  await settle(60);

  assert.equal(site.modal.querySelector('[data-modal-offer-title]').textContent, 'Nova οπτική ίνα');
  assert.deepEqual(site.docs(), [
    { title: 'Αίτηση οπτικής ίνας', href: 'assets/docs/nova-fiber-aitisi.pdf' },
  ]);
});

test('το περιεχόμενο αντικαθίσταται όταν ανοίξει η άλλη προσφορά', async () => {
  const site = await createSite();

  site.openFrom('nova-5g-internet');
  await settle(60);
  const first = site.docs();

  site.openFrom('nova-fiber-internet');
  await settle(60);
  const second = site.docs();

  assert.equal(second.length, 1, 'δεν συσσωρεύονται έντυπα');
  assert.notDeepEqual(first, second);
});

test('τα έντυπα προβάλλονται στη σελίδα και παράλληλα κατεβαίνουν', async () => {
  const site = await createSite();
  site.openFrom('nova-5g-internet');
  await settle(60);

  const preview = site.document.querySelector('#novaLinePhone .modal-offer-doc');
  assert.equal(preview.tagName.toLowerCase(), 'button');
  assert.match(preview.dataset.pdfUrl, /\.pdf$/);
  assert.equal(preview.dataset.track, 'pdf_preview');

  const download = site.document.querySelector('#novaLinePhone .modal-offer-doc__download');
  assert.ok(download.hasAttribute('download'));
  assert.equal(download.dataset.track, 'pdf_download');
  assert.match(download.dataset.label, /\.pdf$/);
});

test('το EON TV παίρνει κι αυτό τα έντυπά του από τα δεδομένα', async () => {
  const site = await createSite({ modal: 'eon-tv.html' });
  site.openFrom('eon-cosmote-tv');
  await settle(60);

  assert.deepEqual(readDocumentTiles(site.document, '#novaEonModal'), [
    { title: 'Αίτηση EON TV', href: 'assets/docs/eon-tv-aitisi.pdf' },
    { title: 'Παράδειγμα συμπλήρωσης', href: 'assets/docs/eon-tv-paradeigma.pdf' },
  ]);
});
