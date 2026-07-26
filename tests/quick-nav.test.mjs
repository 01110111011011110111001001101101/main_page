import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const FILES = ['config.js', 'scroll-coordinator.js', 'clipboard.js', 'image-preview.js', 'ui.js', 'modals.js', 'offers.js', 'offer-renderer.js', 'tracking.js', 'main.js'];
const settle = (ms = 200) => new Promise((resolve) => setTimeout(resolve, ms));

async function createSite() {
  const dom = new JSDOM(readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://example.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  window.matchMedia = (query) => ({ matches: /max-width:\s*767px/.test(query), media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8')) });
  window.gtag = () => {};
  window.scrollTo = () => {};
  window.eval(FILES.map((file) => readFileSync(path.join(root, 'assets/js', file), 'utf8')).join('\n;\n'));
  await settle(250);

  const { document } = window;
  return {
    window,
    document,
    openMenu: () => document.querySelector('.top-menu-button').dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
    click: (element) => element.dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
    visibleCards: () => [...document.querySelectorAll('[data-offer-card]')].filter((card) => !card.hidden),
  };
}

test('η γρήγορη πλοήγηση προσφέρει και τις τρεις κατηγορίες', async () => {
  const site = await createSite();
  const chips = [...site.document.querySelectorAll('.premium-menu-chip')];

  assert.deepEqual(chips.map((chip) => chip.dataset.sidebarCategory), ['mobile', 'internet', 'tv']);
});

test('κάθε επιλογή του μενού έχει tracking', async () => {
  const site = await createSite();
  const links = [...site.document.querySelectorAll('#sidebarMenu .premium-menu-link')];

  assert.ok(links.length >= 4);
  for (const link of links) {
    assert.ok(link.dataset.track, `λείπει data-track από «${link.querySelector('strong')?.textContent.trim()}»`);
  }
});

test('η επιλογή κατηγορίας φιλτράρει τις κάρτες και κλείνει το μενού', async () => {
  const site = await createSite();
  site.openMenu();
  await settle(60);

  const mobileChip = site.document.querySelector('[data-sidebar-category="mobile"]');
  site.click(mobileChip);
  await settle(80);

  const menu = site.document.getElementById('sidebarMenu');
  assert.equal(menu.classList.contains('-translate-x-full'), true, 'το μενού κλείνει');

  const visible = site.visibleCards();
  assert.ok(visible.length > 0);
  assert.ok(visible.every((card) => card.dataset.category === 'mobile'), 'μένουν μόνο οι κάρτες κινητής');
});

test('η ενεργή κατηγορία σημειώνεται με aria-current', async () => {
  const site = await createSite();
  site.openMenu();
  await settle(60);

  site.click(site.document.querySelector('[data-sidebar-category="tv"]'));
  await settle(80);

  const tv = site.document.querySelector('[data-sidebar-category="tv"]');
  const mobile = site.document.querySelector('[data-sidebar-category="mobile"]');

  assert.equal(tv.getAttribute('aria-current'), 'true');
  assert.equal(tv.classList.contains('is-active'), true);
  assert.equal(mobile.hasAttribute('aria-current'), false, 'μόνο μία επιλογή είναι ενεργή');
});

test('αλλαγή φίλτρου από αλλού ενημερώνει και το μενού', async () => {
  const site = await createSite();

  // Κλικ στη μπάρα φίλτρων, εκτός μενού.
  const barButton = site.document.querySelector('.offer-filter-bar [data-category-filter="internet"]');
  site.click(barButton);
  await settle(80);

  const sidebarInternet = site.document.querySelector('#sidebarMenu [data-sidebar-category="internet"]');
  assert.equal(sidebarInternet.getAttribute('aria-current'), 'true', 'το μενού συμφωνεί με τη μπάρα');
});

test('ο τίτλος της ενότητας δεν είναι γραμμένος με κεφαλαία στο markup', async () => {
  const site = await createSite();
  const eyebrow = site.document.querySelector('.premium-menu-eyebrow');

  assert.notEqual(eyebrow.textContent.trim(), eyebrow.textContent.trim().toUpperCase());
});
