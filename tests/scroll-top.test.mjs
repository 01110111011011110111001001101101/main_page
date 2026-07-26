import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const FILES = ['config.js', 'scroll-coordinator.js', 'clipboard.js', 'image-preview.js', 'ui.js', 'modals.js', 'offers.js', 'offer-renderer.js', 'tracking.js', 'main.js'];
const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

async function createSite({ mobile = true, reducedMotion = false } = {}) {
  const dom = new JSDOM(readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://example.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  let scrollY = 0;
  const scrollCalls = [];

  window.matchMedia = (query) => ({
    matches: /prefers-reduced-motion/.test(query) ? reducedMotion : (/max-width:\s*767px/.test(query) && mobile),
    media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8')) });
  window.gtag = () => {};
  Object.defineProperty(window, 'scrollY', { get: () => scrollY, configurable: true });
  window.scrollTo = (options) => { scrollCalls.push(options); };
  window.requestAnimationFrame = (callback) => { callback(); return 1; };

  window.eval(FILES.map((file) => readFileSync(path.join(root, 'assets/js', file), 'utf8')).join('\n;\n'));
  await settle();

  return {
    window,
    document: window.document,
    button: window.document.querySelector('[data-scroll-top]'),
    scrollCalls,
    scrollTo(value) {
      scrollY = value;
      window.dispatchEvent(new window.Event('scroll'));
    },
  };
}

test('το κουμπί είναι κρυφό στην κορυφή της σελίδας', async () => {
  const site = await createSite();

  assert.ok(site.button, 'το κουμπί υπάρχει στο markup');
  assert.equal(site.button.hidden, true);
  assert.equal(site.button.classList.contains('is-visible'), false);
});

test('εμφανίζεται αφού ο χρήστης κατέβει αρκετά', async () => {
  const site = await createSite();

  site.scrollTo(400);
  assert.equal(site.button.classList.contains('is-visible'), false, 'στα 400px ακόμη κρυφό');

  site.scrollTo(900);
  assert.equal(site.button.hidden, false);
  assert.equal(site.button.classList.contains('is-visible'), true);

  site.scrollTo(0);
  assert.equal(site.button.hidden, true, 'κρύβεται ξανά στην κορυφή');
});

test('δεν εμφανίζεται στον υπολογιστή', async () => {
  const site = await createSite({ mobile: false });

  site.scrollTo(2000);
  assert.equal(site.button.classList.contains('is-visible'), false);
});

test('το πάτημα γυρίζει τη σελίδα στην κορυφή', async () => {
  const site = await createSite();
  site.scrollTo(900);

  site.button.dispatchEvent(new site.window.MouseEvent('click', { bubbles: true }));

  assert.equal(site.scrollCalls.length, 1);
  assert.equal(site.scrollCalls[0].top, 0);
  assert.equal(site.scrollCalls[0].behavior, 'smooth');
});

test('με prefers-reduced-motion η μετάβαση είναι ακαριαία', async () => {
  const site = await createSite({ reducedMotion: true });
  site.scrollTo(900);

  site.button.dispatchEvent(new site.window.MouseEvent('click', { bubbles: true }));

  assert.equal(site.scrollCalls[0].behavior, 'auto');
});

test('το κουμπί έχει προσβάσιμη ετικέτα', async () => {
  const site = await createSite();

  assert.match(site.button.getAttribute('aria-label'), /κορυφή/i);
  assert.equal(site.button.getAttribute('type'), 'button');
});
