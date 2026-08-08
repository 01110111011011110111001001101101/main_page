/*
 * ΚΟΥΜΠΙΑ ΕΝΤΥΠΩΝ ΣΕ LAZY MODAL
 *
 * Τα modals προσφορών φορτώνονται lazy από assets/modals/*.html. Στο πρώτο
 * άνοιγμα η openModal επιστρέφει Promise και το fragment δεν έχει μπει ακόμη
 * στο DOM· το ui.js όμως καλούσε fillModalForOffer συγχρονα, οπότε έπαιρνε null
 * και το γέμισμα χανόταν σιωπηλά. Αποτέλεσμα: η ενότητα «Έντυπα αίτησης»
 * έμενε άδεια — χωρίς κουμπί προβολής και χωρίς λήψη — μέχρι ο χρήστης να
 * κλείσει και να ξανανοίξει το modal.
 *
 * Το τεστ ανοίγει το novaEonModal όπως ο χρήστης, με το fragment να έρχεται
 * ασύγχρονα, και απαιτεί να υπάρχουν και τα δύο κουμπιά.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createPage, root, readOffers, settle } from './helpers/load-scripts.mjs';

const html = readFileSync(path.join(root, 'index.html'), 'utf8');

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

const MODAL_FRAGMENTS = {
  novaEonModal: 'assets/modals/eon-tv.html',
  novaLinePhone: 'assets/modals/nova-line-phone.html',
};

function bootPage(t, { url } = {}) {
  const page = createPage({ html, files: SCRIPTS, url });
  t.after(() => page.window.close());

  // fetch: JSON για το offers.json, κείμενο για τα fragments των modals.
  const offers = readOffers();
  page.window.fetch = async (url) => {
    const target = String(url);
    const fragment = Object.values(MODAL_FRAGMENTS).find((file) => target.includes(file));
    if (fragment) {
      return { ok: true, status: 200, text: async () => readFileSync(path.join(root, fragment), 'utf8') };
    }
    return { ok: true, status: 200, json: async () => offers };
  };

  // Στο jsdom δεν φορτώνονται πραγματικά τα lazy scripts (pdf-preview κ.λπ.).
  page.window.App.loadLazyScript = () => Promise.resolve();

  page.window.App.ui.init();
  return page;
}

for (const [modalId, fragment] of Object.entries(MODAL_FRAGMENTS)) {
  test(`${modalId}: τα κουμπιά εντύπων υπάρχουν ήδη από το πρώτο άνοιγμα`, async (t) => {
    const { window, document } = bootPage(t);
    await settle(150);

    const trigger = document.querySelector(`[data-modal-target="${modalId}"][data-modal-offer]`);
    assert.ok(trigger, `χρειάζεται κουμπί που ανοίγει το ${modalId} με data-modal-offer`);

    const offerId = trigger.dataset.modalOffer;
    const offer = readOffers().offers.find((item) => item.id === offerId);
    const documents = (offer?.documents || []).filter((item) => item.href);
    assert.ok(documents.length, `η προσφορά ${offerId} πρέπει να δηλώνει έντυπα (${fragment})`);

    assert.equal(document.getElementById(modalId), null, 'το fragment πρέπει να είναι ακόμη lazy');

    trigger.click();
    await settle(150);

    const modal = document.getElementById(modalId);
    assert.ok(modal, 'το modal πρέπει να έχει φορτωθεί');

    const previews = modal.querySelectorAll('[data-modal-offer-docs] [data-pdf-url]');
    const downloads = modal.querySelectorAll('[data-modal-offer-docs] .modal-offer-doc__download');

    assert.equal(previews.length, documents.length, 'λείπουν κουμπιά προβολής από τα έντυπα');
    assert.equal(downloads.length, documents.length, 'λείπουν σύνδεσμοι λήψης από τα έντυπα');

    for (const download of downloads) {
      assert.ok(download.getAttribute('href'), 'ο σύνδεσμος λήψης πρέπει να δείχνει σε αρχείο');
      assert.ok(download.hasAttribute('download'), 'ο σύνδεσμος λήψης πρέπει να κατεβάζει');
    }

    window.close();
  });

  /*
   * Η openModal γράφει το modal στο URL, οπότε ανανέωση σελίδας, back/forward ή
   * μοιρασμένος σύνδεσμος φτάνουν εδώ ΧΩΡΙΣ να περάσουν από κουμπί κάρτας με
   * data-modal-offer. Τα έντυπα πρέπει να υπάρχουν και έτσι.
   */
  test(`${modalId}: τα έντυπα υπάρχουν και όταν το modal ανοίγει από #hash`, async (t) => {
    const { window, document } = bootPage(t, { url: `https://example.test/#${modalId}` });
    await settle(250);

    const modal = document.getElementById(modalId);
    assert.ok(modal, 'το modal πρέπει να έχει φορτωθεί από το hash');

    const previews = modal.querySelectorAll('[data-modal-offer-docs] [data-pdf-url]');
    assert.ok(previews.length, 'η ενότητα «Έντυπα αίτησης» έμεινε άδεια σε άνοιγμα από hash');

    window.close();
  });
}
