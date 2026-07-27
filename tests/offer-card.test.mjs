import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createPage, readOffers, root, settle } from './helpers/load-scripts.mjs';

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
    // Εικονίδιο αντί για κείμενο: το όνομα το δίνει το aria-label, αλλιώς ο
    // αναγνώστης οθόνης θα άκουγε έξι φορές «κουμπί» χωρίς προσδιορισμό.
    assert.match(secondary.getAttribute('aria-label'), /^Λεπτομέρειες: .+/);
    assert.ok(secondary.querySelector('.icon'), 'λείπει το εικονίδιο');
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

test('η ετικέτα δεν επαναλαμβάνει τον τίτλο', async () => {
  const offers = readOffers();
  offers.offers[0].title = 'EON + Cosmote TV';
  offers.offers[0].provider = 'EON / Cosmote TV';
  offers.offers[0].badge = 'EON + Cosmote TV';
  delete offers.offers[0].recommendationBadge;
  const { cards } = await renderCards(offers);
  const card = cards.find((one) => one.dataset.offerId === offers.offers[0].id);

  assert.equal(card.querySelector('.new-premium-ribbon-flag'), null, 'δεν γράφεται δύο φορές το ίδιο');
});

test('η ετικέτα πέφτει στον πάροχο όταν λείπει το badge', async () => {
  const offers = readOffers();
  delete offers.offers[0].badge;
  delete offers.offers[0].recommendationBadge;
  const { cards } = await renderCards(offers);
  const card = cards.find((one) => one.dataset.offerId === offers.offers[0].id);

  assert.equal(card.querySelector('.new-premium-ribbon-flag').textContent, offers.offers[0].provider);
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

/* ΣΧΕΔΙΟ Γ3 — μία βαθιά κεφαλίδα για όλες τις κάρτες, με χρυσή τιμή.
   Τα χρώματα ζουν στο site.css, όχι σε inline styles: γενικοί legacy κανόνες
   με !important νικούσαν κάθε inline δήλωση. */
test('η κεφαλίδα μαζεύει τίτλο, ετικέτα, τιμή και όρο', async () => {
  const { cards } = await renderCards();
  const card = cards.find((one) => one.dataset.offerId === 'vodafone-cu');
  const ribbon = card.querySelector('.new-premium-ribbon');

  assert.equal(ribbon.querySelector('.new-premium-title').textContent, 'Vodafone CU');
  assert.equal(ribbon.querySelector('.new-premium-ribbon-flag').textContent, '300GB κάθε μήνα');
  assert.equal(ribbon.querySelector('.new-premium-price-num').textContent, '8,3€');
  assert.match(ribbon.querySelector('.new-premium-note-banner').textContent, /100€ προπληρωμή/);
});

test('ο όρος προπληρωμής ανέβηκε μέσα στην κεφαλίδα', async () => {
  const { cards } = await renderCards();

  for (const card of cards) {
    const note = card.querySelector('.new-premium-note-banner');
    assert.ok(note, `λείπει η σημείωση από ${card.dataset.offerId}`);
    assert.ok(
      card.querySelector('.new-premium-ribbon').contains(note),
      `${card.dataset.offerId}: η σημείωση έμεινε εκτός κεφαλίδας`
    );
  }
});

test('η κάρτα δεν κρατά πια ξεχωριστή περιγραφή ούτε λωρίδα στον πάτο', async () => {
  const { cards } = await renderCards();

  for (const card of cards) {
    assert.equal(card.querySelector('.new-premium-desc'), null, 'έμεινε περιγραφή');
    assert.equal(card.querySelector('.new-premium-price-note'), null, 'έμεινε διπλή σημείωση');
    assert.equal(card.lastElementChild.className, 'new-premium-body', 'η κάρτα τελειώνει στο σώμα');
  }
});

test('όλες οι κάρτες μοιράζονται την ίδια κεφαλίδα', async () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const bundle = html.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0];
  const css = readFileSync(path.join(root, bundle), 'utf8');

  assert.match(css, /\.new-premium-ribbon\{background:#0b3a45!important\}/, 'η κεφαλίδα δεν είναι το βαθύ teal');
  assert.match(css, /\.new-premium-price-num\{color:#d6a23a!important\}/, 'η τιμή δεν είναι χρυσή');
});

/* Οι αποχρώσεις της κεφαλίδας επιλέχθηκαν με μέτρηση. Το τεστ ξαναμετράει,
   ώστε μια μελλοντική «μικρή» αλλαγή χρώματος να μη σπάσει την αναγνωσιμότητα. */
test('τα χρώματα της κεφαλίδας περνούν WCAG AA', () => {
  const channel = (value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((index) => channel(parseInt(hex.slice(index, index + 2), 16) / 255));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const ratio = (a, b) => {
    const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (light + 0.05) / (dark + 0.05);
  };

  const header = '#0b3a45';
  assert.ok(ratio('#ffffff', header) >= 4.5, 'ο τίτλος δεν διαβάζεται');
  assert.ok(ratio('#d6a23a', header) >= 4.5, 'η χρυσή τιμή δεν διαβάζεται');
  assert.ok(ratio('#a7d5de', header) >= 4.5, 'η σημείωση δεν διαβάζεται');
  assert.ok(ratio('#ffffff', '#0e7490') >= 4.5, 'η ετικέτα δεν διαβάζεται');

  // Γιατί η κεφαλίδα δεν μπορεί να γίνει το ανοιχτό teal της μπάρας.
  assert.ok(ratio('#d6a23a', '#0e7490') < 4.5, 'το χρυσό σε ανοιχτό teal δεν περνά — τεκμηρίωση');
});

test('ο τίτλος του πακέτου ζει μέσα στην κεφαλίδα, πάνω από την τιμή', async () => {
  const { cards } = await renderCards();
  const card = cards.find((one) => one.dataset.offerId === 'vodafone-cu');
  const title = card.querySelector('.new-premium-title');

  assert.ok(title, 'υπάρχει τίτλος');
  assert.equal(title.tagName, 'H3');
  assert.ok(card.querySelector('.new-premium-ribbon').contains(title), 'ο τίτλος είναι στην κεφαλίδα');
  assert.equal(card.querySelectorAll('h3').length, 1, 'ένας μόνο τίτλος ανά κάρτα');

  // Σειρά ανάγνωσης μέσα στην κεφαλίδα: τίτλος → ετικέτα → τιμή → όρος.
  const order = [...card.querySelectorAll('.new-premium-title, .new-premium-ribbon-flag, .new-premium-price-num, .new-premium-note-banner')]
    .map((element) => element.className);
  assert.deepEqual(order, [
    'new-premium-title',
    'new-premium-ribbon-flag',
    'new-premium-price-num',
    'new-premium-note-banner',
  ]);
});
