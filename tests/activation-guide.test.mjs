import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const FILES = ['config.js', 'scroll-coordinator.js', 'clipboard.js', 'image-preview.js', 'ui.js', 'modals.js', 'offers.js', 'offer-renderer.js', 'tracking.js', 'wizard.js'];
const settle = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));

function createMemoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    get length() { return data.size; },
  };
}

async function createGuide(storage = createMemoryStorage()) {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const guideMarkup = readFileSync(path.join(root, 'assets/modals/activation-guide.html'), 'utf8');
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true });

  const { window } = dom;
  Object.defineProperty(window, 'localStorage', { value: storage, configurable: true });
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8')) });
  window.gtag = () => {};

  // Το modal φορτώνεται lazy στο production· εδώ το βάζουμε απευθείας.
  window.document.getElementById('lazyModalRoot').innerHTML = guideMarkup;
  window.eval(FILES.map((file) => readFileSync(path.join(root, 'assets/js', file), 'utf8')).join('\n;\n'));
  window.eval("window.App?.offerRenderer?.init?.(); window.App.wizard.init();");
  await settle(250);

  const { document } = window;
  return {
    window,
    document,
    storage,
    modal: document.getElementById('activationGuideModal'),
    openFromCard(offerId) {
      const cta = document.querySelector(`[data-offer-id="${offerId}"] .offer-primary-cta`);
      cta.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
    },
  };
}

test('το βήμα πληρωμής δείχνει το ποσό της προσφοράς', async () => {
  const guide = await createGuide();
  guide.openFromCard('vodafone-cu');
  await settle();

  const card = guide.modal.querySelector('[data-activation-amount-card]');
  assert.equal(card.hidden, false, 'η κάρτα ποσού είναι ορατή');
  assert.equal(card.querySelector('[data-activation-amount-value]').textContent, '100€');
  assert.match(card.querySelector('[data-activation-amount-note]').textContent, /προπληρωμή/);
});

test('το κουμπί αντιγραφής ποσού αντιγράφει μόνο τον αριθμό', async () => {
  const guide = await createGuide();
  guide.openFromCard('vodafone-cu');
  await settle();

  const copy = guide.modal.querySelector('[data-activation-amount-copy]');
  assert.equal(copy.dataset.activationCopy, '100');
});

test('τα δικαιολογητικά έχουν checkbox', async () => {
  const guide = await createGuide();
  guide.openFromCard('vodafone-cu');
  await settle();

  const boxes = guide.modal.querySelectorAll('.activation-checklist__checkbox');
  assert.ok(boxes.length >= 3, `βρέθηκαν ${boxes.length} checkboxes`);
  assert.ok([...boxes].every((box) => box.type === 'checkbox'));
});

test('το τσεκάρισμα αποθηκεύεται και επανέρχεται στο επόμενο άνοιγμα', async () => {
  const storage = createMemoryStorage();
  const guide = await createGuide(storage);
  guide.openFromCard('vodafone-cu');
  await settle();

  // Το click κάνει το ίδιο toggle που κάνει ο browser — δεν ορίζουμε checked χειροκίνητα.
  const first = guide.modal.querySelector('.activation-checklist__checkbox');
  first.dispatchEvent(new guide.window.MouseEvent('click', { bubbles: true }));
  assert.equal(first.checked, true);

  const stored = JSON.parse(storage.getItem('activationGuideProgress'));
  assert.deepEqual(stored.docs['vodafone:new'], [0]);

  // Νέα «επίσκεψη» με το ίδιο storage.
  const again = await createGuide(storage);
  again.openFromCard('vodafone-cu');
  await settle();

  assert.equal(again.modal.querySelector('.activation-checklist__checkbox').checked, true);
});

test('η υπόδειξη μετράει την πρόοδο των δικαιολογητικών', async () => {
  const guide = await createGuide();
  guide.openFromCard('vodafone-cu');
  await settle();

  const hint = guide.modal.querySelector('[data-activation-checklist-hint]');
  assert.match(hint.textContent, /δικαιολογητικά/);

  const boxes = [...guide.modal.querySelectorAll('.activation-checklist__checkbox')];
  boxes.forEach((box) => box.dispatchEvent(new guide.window.MouseEvent('click', { bubbles: true })));

  assert.match(hint.textContent, /Έτοιμα και τα/);
  assert.ok(hint.classList.contains('activation-guide-note--complete'));
});

test('το βήμα αποθηκεύεται και ο οδηγός συνεχίζει από εκεί', async () => {
  const storage = createMemoryStorage();
  const guide = await createGuide(storage);
  guide.openFromCard('vodafone-cu');
  await settle();

  guide.modal.querySelector('[data-activation-next]').dispatchEvent(new guide.window.MouseEvent('click', { bubbles: true }));
  await settle();

  const session = JSON.parse(storage.getItem('activationGuideProgress')).session;
  assert.equal(session.step, 2);
  assert.equal(session.provider, 'vodafone');

  const again = await createGuide(storage);
  again.openFromCard('vodafone-cu');
  await settle();

  const visible = again.modal.querySelector('[data-activation-step]:not(.hidden)');
  assert.equal(visible.dataset.activationStep, '2', 'συνεχίζει από το βήμα 2');
});

test('χωρίς localStorage ο οδηγός εξακολουθεί να ανοίγει', async () => {
  const broken = {
    getItem() { throw new Error('μπλοκαρισμένο'); },
    setItem() { throw new Error('μπλοκαρισμένο'); },
    removeItem() {}, clear() {}, key() { return null; }, length: 0,
  };

  const guide = await createGuide(broken);
  guide.openFromCard('vodafone-cu');
  await settle();

  assert.equal(guide.modal.classList.contains('hidden'), false);
});
