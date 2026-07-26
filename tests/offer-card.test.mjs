import assert from 'node:assert/strict';
import test from 'node:test';
import { createPage, readOffers, settle } from './helpers/load-scripts.mjs';

const CONTAINER = `<body>
  <section id="offers" class="offers-section-catalog is-offers-open">
    <div id="offersContainer" class="offer-grid"></div>
  </section>
</body>`;

async function renderCards(offers) {
  const page = createPage({ html: CONTAINER, offers });
  await settle();
  return { ...page, cards: [...page.document.querySelectorAll('[data-offer-card]')] };
}

test('αποδίδει μία κάρτα για κάθε ενεργή προσφορά', async () => {
  const offers = readOffers();
  const active = offers.offers.filter((offer) => offer.active !== false);
  const { cards, errors } = await renderCards(offers);

  assert.equal(errors.length, 0, `σφάλματα κατά το render: ${errors.join(', ')}`);
  assert.equal(cards.length, active.length);
});

test('παραλείπει τις ανενεργές προσφορές', async () => {
  const offers = readOffers();
  offers.offers[0].active = false;
  const { cards } = await renderCards(offers);

  assert.ok(!cards.some((card) => card.dataset.offerId === offers.offers[0].id));
});

test('σέβεται το sortOrder', async () => {
  const offers = readOffers();
  offers.offers.forEach((offer, index) => { offer.sortOrder = offers.offers.length - index; });
  const { cards } = await renderCards(offers);

  const expected = [...offers.offers].sort((a, b) => a.sortOrder - b.sortOrder).map((offer) => offer.id);
  assert.deepEqual(cards.map((card) => card.dataset.offerId), expected);
});

test('η κάρτα δείχνει τη μηνιαία τιμή από το pricing', async () => {
  const { cards } = await renderCards();
  const card = cards.find((one) => one.dataset.offerId === 'vodafone-cu');

  assert.equal(card.querySelector('.new-premium-price-num').textContent, '8,3€');
  assert.equal(card.querySelector('.new-premium-price-unit').textContent, '/ μήνα');
  // Στις προσφορές κινητής η προπληρωμή προβάλλεται ως λωρίδα, όχι ως σημείωση.
  assert.match(card.querySelector('.new-premium-note-banner').textContent, /100€/);
});

test('το prefix της τιμής αποδίδεται ξεχωριστά', async () => {
  const { cards } = await renderCards();
  const card = cards.find((one) => one.dataset.offerId === 'vodafone-fixed-internet');

  assert.equal(card.querySelector('.new-premium-price-prefix').textContent, 'από');
  assert.equal(card.querySelector('.new-premium-price-num').textContent, '16,00€');
});

test('εμφανίζονται το πολύ τρία οφέλη', async () => {
  const offers = readOffers();
  offers.offers[0].benefits = ['ένα', 'δύο', 'τρία', 'τέσσερα', 'πέντε'];
  const { cards } = await renderCards(offers);
  const card = cards.find((one) => one.dataset.offerId === offers.offers[0].id);

  assert.equal(card.querySelectorAll('.new-premium-perk').length, 3);
});

test('το CTA ενεργοποίησης κρατά τα data attributes του οδηγού', async () => {
  const { cards } = await renderCards();
  const cta = cards
    .find((one) => one.dataset.offerId === 'vodafone-cu')
    .querySelector('.offer-primary-cta');

  assert.equal(cta.textContent.trim(), 'Ενεργοποίηση');
  assert.equal(cta.dataset.activationProvider, 'vodafone');
  assert.equal(cta.dataset.activationOffer, 'Vodafone CU');
  assert.ok('activationGuideOpen' in cta.dataset);
  assert.equal(cta.dataset.track, 'offer_interest_click');
});

test('το CTA modal κρατά το data-modal-target', async () => {
  const { cards } = await renderCards();
  const cta = cards
    .find((one) => one.dataset.offerId === 'vodafone-fixed-internet')
    .querySelector('.offer-primary-cta');

  assert.equal(cta.dataset.modalTarget, 'vodafoneFixedModal');
});

test('το δευτερεύον CTA ανοίγει τις λεπτομέρειες της σωστής προσφοράς', async () => {
  const { cards } = await renderCards();

  for (const card of cards) {
    const secondary = card.querySelector('.offer-secondary-cta');
    assert.equal(secondary.textContent.trim(), 'Λεπτομέρειες');
    assert.equal(secondary.dataset.offerDetailsOpen, card.dataset.offerId);
  }
});

test('η προσφορά με href γίνεται σύνδεσμος και όχι κουμπί', async () => {
  const offers = readOffers();
  const offer = offers.offers[0];
  offer.ctaType = 'modal';
  delete offer.modalId;
  offer.actionTarget = { ...offer.actionTarget, href: 'https://example.com/pdf', modalId: undefined };
  delete offer.actionTarget.modalId;

  const { cards } = await renderCards(offers);
  const cta = cards.find((one) => one.dataset.offerId === offer.id).querySelector('.offer-primary-cta');

  assert.equal(cta.tagName, 'A');
  assert.equal(cta.getAttribute('target'), '_blank');
  assert.equal(cta.getAttribute('rel'), 'noopener noreferrer');
});

test('δεν εμφανίζεται διπλό badge όταν πάροχος και badge ταυτίζονται', async () => {
  const offers = readOffers();
  offers.offers[0].provider = 'EON / Cosmote TV';
  offers.offers[0].badge = 'EON + Cosmote TV';
  const { cards } = await renderCards(offers);
  const card = cards.find((one) => one.dataset.offerId === offers.offers[0].id);

  assert.equal(card.querySelector('.new-premium-ribbon-flag'), null);
});

test('η κάρτα δεν ενεργοποιεί whole-card click', async () => {
  const { cards, window } = await renderCards();
  const card = cards[0];
  const primary = card.querySelector('.offer-primary-cta');

  let clicks = 0;
  primary.addEventListener('click', () => { clicks += 1; });
  card.querySelector('.new-premium-perk').dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  assert.equal(clicks, 0, 'το tap σε κείμενο δεν πρέπει να ανοίγει το modal');
});

test('τα κρυμμένα οφέλη παραμένουν στο index αναζήτησης', async () => {
  const { cards } = await renderCards();
  const card = cards.find((one) => one.dataset.offerId === 'vodafone-cu');

  assert.match(card.textContent, /300 GB/);
});

test('δεν μένουν υπολείμματα του παλιού accordion', async () => {
  const { document } = await renderCards();

  assert.equal(document.querySelectorAll('.new-premium-toggle, .new-premium-content').length, 0);
});

test('δεν χρησιμοποιούνται legacy κλάσεις που σπάνε το layout στο κινητό', async () => {
  const { document } = await renderCards();

  assert.equal(document.querySelectorAll('.offer-benefits').length, 0);
  assert.equal(document.querySelectorAll('.offer-actions').length, 0);
});

test('όταν το fetch αποτύχει εμφανίζεται μήνυμα και κουμπί επανάληψης', async () => {
  const page = createPage({ html: CONTAINER });
  page.window.fetch = async () => ({ ok: false });
  await page.window.App.offerRenderer.init({ force: true });

  const container = page.document.getElementById('offersContainer');
  assert.equal(container.dataset.offerLoadState, 'failed');
  assert.ok(container.querySelector('[data-offers-retry]'));
});

test('η τιμή παίρνει τον τόνο του παρόχου', async () => {
  const { cards } = await renderCards();
  const tone = (id) => cards.find((card) => card.dataset.offerId === id)
    .querySelector('.new-premium-price-num').style.color;

  assert.equal(tone('vodafone-cu'), 'rgb(197, 0, 0)', 'Vodafone: κόκκινο');
  assert.equal(tone('nova-q'), 'rgb(194, 65, 12)', 'Nova: πορτοκαλί');
  // Πράσινο EON, όχι το λαδί της Cosmote — σε απόχρωση που περνά WCAG AA.
  assert.equal(tone('eon-cosmote-tv'), 'rgb(14, 122, 20)', 'EON: πράσινο, όχι της Cosmote');
});

test('οι κάρτες κινητής δείχνουν λωρίδα προπληρωμής στον πάτο', async () => {
  const { cards } = await renderCards();

  for (const id of ['vodafone-cu', 'nova-q']) {
    const card = cards.find((one) => one.dataset.offerId === id);
    const banner = card.querySelector('.new-premium-note-banner');

    assert.ok(banner, `λείπει η λωρίδα από ${id}`);
    assert.match(banner.textContent, /100€ προπληρωμή/);
    assert.equal(card.lastElementChild, banner, 'η λωρίδα είναι το τελευταίο στοιχείο της κάρτας');
  }
});

test('οι υπόλοιπες κάρτες δεν έχουν λωρίδα, κρατούν μικρή σημείωση', async () => {
  const { cards } = await renderCards();
  const card = cards.find((one) => one.dataset.offerId === 'eon-cosmote-tv');

  assert.equal(card.querySelector('.new-premium-note-banner'), null);
  assert.match(card.querySelector('.new-premium-price-note').textContent, /ΦΠΑ/);
});

test('η λωρίδα δεν εμφανίζεται χωρίς highlightNote', async () => {
  const offers = readOffers();
  offers.offers.forEach((offer) => { delete offer.pricing?.highlightNote; });
  const { cards } = await renderCards(offers);

  assert.equal(cards.filter((card) => card.querySelector('.new-premium-note-banner')).length, 0);
});

test('ο τίτλος του πακέτου ζει μέσα στην κεφαλίδα, πάνω από την τιμή', async () => {
  const { cards } = await renderCards();
  const card = cards.find((one) => one.dataset.offerId === 'vodafone-cu');
  const title = card.querySelector('.new-premium-title');

  assert.ok(title, 'υπάρχει τίτλος');
  assert.equal(title.tagName, 'H3');
  assert.ok(card.querySelector('.new-premium-ribbon').contains(title), 'ο τίτλος είναι στην κεφαλίδα');
  assert.equal(card.querySelectorAll('h3').length, 1, 'ένας μόνο τίτλος ανά κάρτα');

  // Σειρά ανάγνωσης: πάροχος → τίτλος → περιγραφή → τιμή.
  const order = [...card.querySelectorAll('.new-premium-ribbon-name, .new-premium-title, .new-premium-desc, .new-premium-price-num')]
    .map((element) => element.className);
  assert.deepEqual(order, [
    'new-premium-ribbon-name',
    'new-premium-title',
    'new-premium-desc',
    'new-premium-price-num',
  ]);
});
