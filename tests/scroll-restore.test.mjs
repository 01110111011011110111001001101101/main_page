import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const FILES = ['config.js', 'scroll-coordinator.js', 'clipboard.js', 'image-preview.js', 'ui.js', 'modals.js', 'offers.js', 'offer-renderer.js', 'tracking.js', 'main.js'];
const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

/*
 * Στο κινητό το κλείδωμα κύλισης γίνεται με position: fixed και top: -scrollY.
 * Μόλις αφαιρεθούν τα στυλ η σελίδα είναι στο 0 και πρέπει να γυρίσει αμέσως
 * πίσω. Επειδή το html έχει scroll-behavior: smooth, η επαναφορά γινόταν με
 * animation: η σελίδα πεταγόταν στην κορυφή και κατέβαινε ορατά.
 */
async function createMobileSite({ startAt = 1200 } = {}) {
  const dom = new JSDOM(readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true,
  });

  const { window } = dom;
  // coarse pointer + hover:none ενεργοποιεί το fixed κλείδωμα, όπως στο κινητό.
  window.matchMedia = (query) => ({
    matches: /max-width:\s*767px|pointer:\s*coarse|hover:\s*none/.test(query),
    media: query,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8')) });
  window.gtag = () => {};

  const calls = [];
  let position = startAt;
  Object.defineProperty(window, 'scrollY', { get: () => position, configurable: true });
  window.scrollTo = (...args) => {
    calls.push({
      target: typeof args[0] === 'object' ? args[0].top : args[1],
      // Κενό σημαίνει ότι κληρονομεί το smooth του html.
      behavior: window.document.documentElement.style.scrollBehavior,
    });
    position = typeof args[0] === 'object' ? (args[0].top ?? position) : (args[1] ?? position);
  };

  window.eval(FILES.map((file) => readFileSync(path.join(root, 'assets/js', file), 'utf8')).join('\n;\n'));
  await settle();

  const { document } = window;
  return {
    window,
    document,
    calls,
    at: () => position,
    openMenu: () => document.querySelector('.top-menu-button').dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
    closeMenu: () => document.querySelector('.premium-menu-close').dispatchEvent(new window.MouseEvent('click', { bubbles: true })),
  };
}

test('το μενού κλειδώνει τη σελίδα στη θέση του χρήστη', async () => {
  const site = await createMobileSite({ startAt: 1200 });
  site.openMenu();
  await settle(80);

  assert.equal(site.document.body.style.position, 'fixed');
  assert.equal(site.document.body.style.top, '-1200px', 'το κλείδωμα δεν κράτησε τη θέση');
});

test('η επαναφορά γίνεται ακαριαία, χωρίς κινούμενη κύλιση', async () => {
  const site = await createMobileSite({ startAt: 1200 });
  site.openMenu();
  await settle(80);
  site.calls.length = 0;

  site.closeMenu();
  await settle(450);

  assert.ok(site.calls.length > 0, 'δεν έγινε επαναφορά θέσης');
  for (const call of site.calls) {
    assert.equal(call.behavior, 'auto', 'η επαναφορά κληρονόμησε scroll-behavior: smooth');
  }
});

test('η σελίδα γυρίζει στη θέση από όπου άνοιξε το μενού', async () => {
  const site = await createMobileSite({ startAt: 1200 });
  site.openMenu();
  await settle(80);
  site.closeMenu();
  await settle(450);

  assert.equal(site.at(), 1200);
});

test('η θέση επαναφέρεται μία μόνο φορά', async () => {
  // Το παλιό μπάλωμα έκανε τρεις διαδοχικές κυλίσεις (δύο rAF και ένα timeout)
  // πάνω από αυτήν του κλειδώματος, και πρόσθετε δικό του τίναγμα.
  const site = await createMobileSite({ startAt: 900 });
  site.openMenu();
  await settle(80);
  site.calls.length = 0;

  site.closeMenu();
  await settle(450);

  assert.equal(site.calls.length, 1, `έγιναν ${site.calls.length} κυλίσεις αντί για μία`);
});

test('το μπάλωμα των τριών κυλίσεων έφυγε από τον κώδικα', () => {
  const source = readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8');

  assert.doesNotMatch(source, /function initializeMobileModalReturnPosition/, 'το μπάλωμα υπάρχει ακόμα');
  assert.doesNotMatch(source, /initializeMobileModalReturnPosition\(\);/, 'το μπάλωμα καλείται ακόμα');
});

/* Το mini nav εμφανιζόταν κάποιες φορές στη μέση της οθόνης αντί για κάτω.
   Αιτία: το overflow: clip σε html/body δημιουργεί clip context που κόβει και
   τα position: fixed παιδιά. Όταν το body γίνεται fixed με top: -scrollY για το
   κλείδωμα κύλισης, το clip box μετακινείται μαζί του. */
test('κανένας πρόγονος δεν κόβει τα στοιχεία που κρέμονται από το viewport', () => {
  const source = readFileSync(path.join(root, 'assets/css/site.css'), 'utf8');
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, '');

  const clips = [...withoutComments.matchAll(/([^{}]*)\{[^}]*overflow(?:-[xy])?:\s*clip/g)]
    .map(([, selector]) => selector.trim().replace(/\s+/g, ' '));

  assert.deepEqual(clips, [], 'το overflow: clip κόβει fixed στοιχεία σε αντίθεση με το hidden');
});

test('η οριζόντια κύλιση παραμένει κλειδωμένη στο κινητό', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = readFileSync(path.join(root, html.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0]), 'utf8');
  const mobile = css.split('@media (width<=767px)').slice(1).join('');

  const guard = [...mobile.matchAll(/html,body\{([^}]*)\}/g)].map(([, body]) => body)
    .find((body) => /touch-action:pan-y/.test(body));

  assert.ok(guard, 'χάθηκε το κλείδωμα οριζόντιας κίνησης');
  assert.match(guard, /overflow-x:hidden/, 'το hidden πρέπει να αντικαταστήσει το clip');
  assert.match(guard, /overscroll-behavior-x:none/, 'λείπει το φρένο στα άκρα');
});

test('το mini nav κρύβεται όσο η σελίδα είναι κλειδωμένη', async () => {
  // Αλλιώς μένει ζωγραφισμένο πάνω από το ανοιχτό μενού, στη λάθος θέση.
  const site = await createMobileSite();
  site.openMenu();
  await settle(80);

  assert.equal(
    site.document.body.classList.contains('mobile-bottom-nav-suppressed'),
    true,
    'το mini nav δεν καταστέλλεται με ανοιχτό μενού'
  );
});
