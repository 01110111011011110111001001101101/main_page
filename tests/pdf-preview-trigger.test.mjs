import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createPage, root, readOffers, settle } from './helpers/load-scripts.mjs';

const html = readFileSync(path.join(root, 'index.html'), 'utf8');

function findOfferWithDocuments() {
  const offers = readOffers();
  const list = offers.offers;
  return list.find((offer) => Array.isArray(offer.documents) && offer.documents.length);
}

// Ίδια σειρά με το production bundle (scripts/build-js-bundle.mjs).
const SCRIPTS = [
  'config.js',
  'scroll-coordinator.js',
  'clipboard.js',
  'image-preview.js',
  'ui.js',
  'modals.js',
  'offers.js',
  'offer-renderer.js',
  'tracking.js',
];

async function bootPage(t) {
  const page = createPage({ html, files: SCRIPTS });
  t.after(() => page.window.close());
  page.window.App.ui.init();
  await settle(120);
  return page;
}

test('η προσφορά EON TV έχει το παράδειγμα συμπλήρωσης', () => {
  const offer = findOfferWithDocuments();
  assert.ok(offer, 'χρειάζεται τουλάχιστον μία προσφορά με έντυπα');

  const offers = readOffers();
  const list = offers.offers;
  const eon = list.find((item) => (item.documents || []).some((doc) => doc.href.includes('eon-tv-paradeigma')));

  assert.ok(eon, 'το eon-tv-paradeigma.pdf πρέπει να δηλώνεται στο offers.json');
});

test('το πλακάκι εντύπου ανοίγει προεπισκόπηση, όχι λήψη', async (t) => {
  const { window, document } = await bootPage(t);
  const offer = findOfferWithDocuments();

  const modal = document.createElement('div');
  modal.innerHTML = '<div data-modal-offer-docs></div>';
  document.body.appendChild(modal);

  const filled = window.App.offerRenderer.fillModalForOffer(modal, offer.id);
  assert.equal(filled, true);

  const preview = modal.querySelector('[data-pdf-url]');
  assert.ok(preview, 'πρέπει να υπάρχει κουμπί με data-pdf-url');
  assert.equal(preview.tagName.toLowerCase(), 'button', 'η προβολή δεν πρέπει να είναι κατέβασμα');
  assert.equal(preview.dataset.pdfUrl, offer.documents[0].href);
  assert.equal(preview.dataset.track, 'pdf_preview');

  const download = modal.querySelector('.modal-offer-doc__download');
  assert.ok(download, 'η λήψη πρέπει να παραμένει διαθέσιμη');
  assert.equal(download.getAttribute('href'), offer.documents[0].href);
  assert.equal(download.dataset.track, 'pdf_download');
});

test('το πάτημα «Προβολή» καλεί τον viewer με το σωστό PDF', async (t) => {
  const { window, document } = await bootPage(t);
  const offer = findOfferWithDocuments();

  const opened = [];
  window.App.pdfPreview = { open: (options) => opened.push(options) };

  const modal = document.createElement('div');
  modal.innerHTML = '<div data-modal-offer-docs></div>';
  document.body.appendChild(modal);
  window.App.offerRenderer.fillModalForOffer(modal, offer.id);

  modal.querySelector('[data-pdf-url]').click();
  await settle(50);

  assert.equal(opened.length, 1, 'ο viewer πρέπει να ανοίξει μία φορά');
  assert.equal(opened[0].url, offer.documents[0].href);
  assert.equal(opened[0].title, offer.documents[0].title);
});

test('χωρίς τον viewer το PDF ανοίγει σε νέα καρτέλα', async (t) => {
  const { window, document } = await bootPage(t);
  const offer = findOfferWithDocuments();

  delete window.App.pdfPreview;
  window.App.loadLazyScript = () => Promise.reject(new Error('offline'));

  const openedUrls = [];
  window.open = (url) => openedUrls.push(url);

  const modal = document.createElement('div');
  modal.innerHTML = '<div data-modal-offer-docs></div>';
  document.body.appendChild(modal);
  window.App.offerRenderer.fillModalForOffer(modal, offer.id);

  modal.querySelector('[data-pdf-url]').click();
  await settle(80);

  assert.deepEqual(openedUrls, [offer.documents[0].href]);
});
