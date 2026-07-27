import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const FILES = ['config.js', 'scroll-coordinator.js', 'clipboard.js', 'image-preview.js', 'ui.js', 'modals.js', 'offers.js', 'offer-renderer.js', 'tracking.js', 'office-closure.config.js', 'main.js'];

function createSite() {
  const dom = new JSDOM(readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://example.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  window.matchMedia = (query) => ({
    matches: /max-width:\s*767px/.test(query),
    media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8')) });
  window.gtag = () => {};
  window.eval(FILES.map((file) => readFileSync(path.join(root, 'assets/js', file), 'utf8')).join('\n;\n'));

  const { document } = window;
  return {
    window,
    document,
    menu: document.getElementById('sidebarMenu'),
    open: () => { document.querySelector('.top-menu-button').dispatchEvent(new window.MouseEvent('click', { bubbles: true })); },
    isOpen: () => !document.getElementById('sidebarMenu').classList.contains('-translate-x-full'),
  };
}

const settle = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

// Το main.js δένει τους delegated handlers μέσα σε async init, οπότε πριν από
// κάθε κλικ πρέπει να έχει ολοκληρωθεί η αρχικοποίηση.
async function createReadySite() {
  const site = createSite();
  await settle(200);
  return site;
}

test('το κλειστό μενού είναι inert και κρυφό από screen readers', () => {
  const site = createSite();

  assert.equal(site.menu.hasAttribute('inert'), true);
  assert.equal(site.menu.getAttribute('aria-hidden'), 'true');
});

test('το άνοιγμα αφαιρεί το inert και εστιάζει μέσα στο μενού', async () => {
  const site = await createReadySite();
  site.open();
  await settle();

  assert.equal(site.isOpen(), true);
  assert.equal(site.menu.hasAttribute('inert'), false);
  assert.equal(site.menu.hasAttribute('aria-hidden'), false);
  assert.ok(site.menu.contains(site.document.activeElement), 'η εστίαση πηγαίνει μέσα στο μενού');
});

test('το Escape κλείνει το μενού και επιστρέφει την εστίαση', async () => {
  const site = await createReadySite();
  const opener = site.document.querySelector('.top-menu-button');
  opener.focus();
  site.open();
  await settle();

  site.document.dispatchEvent(new site.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await settle(350);

  assert.equal(site.isOpen(), false);
  assert.equal(site.menu.hasAttribute('inert'), true);
  assert.equal(site.document.activeElement, opener, 'η εστίαση επιστρέφει στο κουμπί Μενού');
});

test('το Tab κυκλώνει μέσα στο ανοιχτό μενού', async () => {
  const site = await createReadySite();
  site.open();
  await settle();

  const items = [...site.menu.querySelectorAll('a[href], button:not([disabled])')];
  const last = items[items.length - 1];
  last.focus();

  const event = new site.window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
  site.document.dispatchEvent(event);

  assert.equal(event.defaultPrevented, true, 'το Tab στο τελευταίο στοιχείο δεν ξεφεύγει');
  assert.equal(site.document.activeElement, items[0]);
});

/* Το Viber έφυγε από τη μπάρα: ήταν κρυφό με display:none σε κάθε ανάλυση και
   υπάρχει ήδη σε δική του ενότητα και στο πλαϊνό μενού. */
test('η μπάρα δεν κουβαλά πια κρυφό σύνδεσμο Viber', () => {
  const site = createSite();

  assert.equal(site.document.querySelector('.site-top-nav .top-viber'), null);
});

test('η μπάρα έχει μία ενέργεια: τον οδηγό ενεργοποίησης', () => {
  const site = createSite();
  const cta = site.document.querySelector('.site-top-nav .top-guide-cta');

  assert.ok(cta, 'λείπει το κουμπί του οδηγού');
  assert.equal(cta.dataset.modalTarget, 'activationProviderChoiceModal');
  assert.equal(cta.tagName, 'BUTTON');
});

test('η μπάρα δεν έχει πια κουμπί κλήσης', () => {
  const site = createSite();

  assert.equal(site.document.querySelector('.site-top-nav .top-call-button'), null);
});

/* Το σήμα είναι τετράγωνο αρχείο σε κύκλο. Το παλιό hero-head.webp είναι
   πορτρέτο 320x442: μέσα σε πλαίσιο 109x50 άφηνε ~36px λευκό σε κάθε πλευρά
   και η κεφαλή γινόταν δυσδιάκριτη. */
test('το σήμα της μπάρας χρησιμοποιεί το τετράγωνο αρχείο', () => {
  const site = createSite();
  const mark = site.document.querySelector('.site-top-nav .top-brand__mark');

  assert.ok(mark, 'λείπει το σήμα από τη μπάρα');
  assert.match(mark.getAttribute('src'), /brand-mark\.webp/);
  assert.equal(mark.getAttribute('width'), mark.getAttribute('height'), 'το αρχείο πρέπει να είναι τετράγωνο');
  // Το κείμενο του συνδέσμου δίνει το όνομα· το alt θα το διάβαζε δεύτερη φορά.
  assert.equal(mark.getAttribute('alt'), '');
});

test('η μπάρα γράφει το όνομα του φορέα', () => {
  const site = createSite();
  const brand = site.document.querySelector('.site-top-nav .top-brand');

  assert.match(brand.querySelector('.top-brand__text strong').textContent, /Π\.Κ\.Σ\.Α\.Α\./);
  assert.ok(brand.getAttribute('aria-label'), 'ο σύνδεσμος χρειάζεται όνομα');
});

test('τα τρία κουμπιά του μενού έχουν σωστούς προορισμούς', () => {
  const site = createSite();
  const actions = [...site.document.querySelectorAll('.premium-menu-actions > a')];

  assert.equal(actions.length, 3);
  assert.match(actions[0].getAttribute('href'), /^tel:/);
  assert.match(actions[1].getAttribute('href'), /google\.com\/maps/);
  assert.match(actions[2].getAttribute('href'), /^mailto:/);
  assert.deepEqual(actions.map((a) => a.className), ['phone-green-btn', 'maps-btn', 'email-box']);
});
