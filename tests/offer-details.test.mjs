import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const FILES = ['config.js', 'scroll-coordinator.js', 'clipboard.js', 'image-preview.js', 'ui.js', 'modals.js', 'offers.js', 'offer-renderer.js', 'tracking.js', 'main.js'];
const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));
const OFFERS = JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8')).offers;

async function createSite() {
  const dom = new JSDOM(readFileSync(path.join(root, 'index.html'), 'utf8'), {
    url: 'https://example.test/', runScripts: 'outside-only', pretendToBeVisual: true,
  });

  const { window } = dom;
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  window.fetch = async () => ({ ok: true, json: async () => JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8')) });
  window.gtag = () => {};
  window.scrollTo = () => {};
  window.eval(FILES.map((file) => readFileSync(path.join(root, 'assets/js', file), 'utf8')).join('\n;\n'));
  await settle();

  const { document } = window;
  return {
    window,
    document,
    async open(offerId) {
      document.querySelector(`[data-offer-id="${offerId}"] .offer-secondary-cta`)
        .dispatchEvent(new window.MouseEvent('click', { bubbles: true }));
      await settle(80);
      return document.getElementById('offerDetailsModal');
    },
  };
}

const words = (text) => String(text).toLowerCase().normalize('NFD')
  .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9α-ω\s]/gi, ' ')
  .split(/\s+/).filter((word) => word.length > 3);

test('κάθε προσφορά δείχνει τις τρεις ενότητες με σειρά', async () => {
  const site = await createSite();

  for (const offer of OFFERS) {
    const modal = await site.open(offer.id);
    const titles = [...modal.querySelectorAll('.offer-details-block h3')].map((h) => h.textContent);

    assert.ok(titles.includes('Τι παίρνεις'), `${offer.id}: λείπει το «Τι παίρνεις»`);
    assert.ok(titles.includes('Τι χρειάζεσαι'), `${offer.id}: λείπουν τα έγγραφα`);
    assert.equal(titles[0], 'Τι παίρνεις', `${offer.id}: λάθος σειρά`);
    assert.equal(titles[titles.length - 1], 'Τι χρειάζεσαι', `${offer.id}: τα έγγραφα δεν είναι τελευταία`);
  }
});

/* Το βασικό πρόβλημα του παλιού panel: το ίδιο πράγμα λεγόταν έως πέντε φορές. */
test('καμία γραμμή δεν επαναλαμβάνει άλλη μέσα στο ίδιο panel', async () => {
  const site = await createSite();

  for (const offer of OFFERS) {
    const modal = await site.open(offer.id);
    const lines = [...modal.querySelectorAll('.offer-details-highlights li')]
      .map((item) => item.textContent.trim());

    for (let i = 0; i < lines.length; i += 1) {
      for (let j = i + 1; j < lines.length; j += 1) {
        const a = words(lines[i]);
        const b = new Set(words(lines[j]));
        const shared = a.filter((word) => b.has(word)).length;
        const overlap = a.length ? shared / a.length : 0;

        assert.ok(overlap < 0.8, `${offer.id}: «${lines[i]}» επαναλαμβάνει το «${lines[j]}»`);
      }
    }
  }
});

test('το appliesTo εμφανίζεται, μία φορά', async () => {
  const site = await createSite();

  for (const offer of OFFERS) {
    if (!offer.appliesTo) continue;
    const modal = await site.open(offer.id);
    const notes = [...modal.querySelectorAll('.offer-details-notes dd')].map((dd) => dd.textContent.trim());
    const matches = notes.filter((note) => note === offer.appliesTo.trim());

    assert.equal(matches.length, 1, `${offer.id}: το appliesTo εμφανίζεται ${matches.length} φορές`);
  }
});

test('η μοναδική νέα πληροφορία δεν χάνεται', async () => {
  const site = await createSite();
  const modal = await site.open('vodafone-cu');
  const notes = [...modal.querySelectorAll('.offer-details-notes dd')].map((dd) => dd.textContent);

  assert.ok(notes.some((note) => /roaming|11 GB/i.test(note)), 'χάθηκε το roaming');
});

test('το panel έχει δική του ενέργεια στον πάτο', async () => {
  const site = await createSite();

  for (const offer of OFFERS) {
    const modal = await site.open(offer.id);
    const cta = modal.querySelector('.offer-details-footer .offer-primary-cta');

    assert.ok(cta, `${offer.id}: λείπει το κουμπί`);
    assert.ok(cta.textContent.trim().length > 0, `${offer.id}: κουμπί χωρίς κείμενο`);
  }
});

test('η κεφαλίδα δείχνει την τιμή της κάρτας', async () => {
  const site = await createSite();
  const modal = await site.open('vodafone-cu');

  assert.equal(modal.querySelector('.offer-details-title').textContent, 'Vodafone CU');
  assert.equal(modal.querySelector('.offer-details-price-num').textContent, '8,3€');
  assert.match(modal.querySelector('.offer-details-note').textContent, /100€ προπληρωμή/);
});

test('οι ενότητες που δεν είχαν δεδομένα έφυγαν από τον κώδικα', () => {
  const source = readFileSync(path.join(root, 'assets/js/offer-renderer.js'), 'utf8');

  assert.doesNotMatch(source, /contactLinks/, 'η Επικοινωνία υπήρχε σε μία μόνο προσφορά');
  assert.doesNotMatch(source, /'Βασικά οφέλη'|'Περιλαμβάνει'|'Σημειώσεις'/, 'έμειναν οι παλιές ενότητες');
});
