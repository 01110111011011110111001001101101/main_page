import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './helpers/load-scripts.mjs';

const offers = JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8')).offers;
const wizardSource = readFileSync(path.join(root, 'assets/js/wizard.js'), 'utf8');

/* Τα δικαιολογητικά του οδηγού ζουν σε δύο σημεία: στο GUIDE_CONFIG του
   wizard.js (που τρέχει) και στο activationGuide του offers.json (που είναι η
   τεκμηρίωση για όποιον προσθέτει προσφορά). Αν ξεφύγουν μεταξύ τους, ο χρήστης
   βλέπει άλλα έντυπα από αυτά που περιγράφει το JSON. Το τεστ κρατά τα δύο δεμένα. */
test('ο οδηγός και το offers.json συμφωνούν στα έντυπα', () => {
  for (const offer of offers) {
    const guide = offer.activationGuide;
    if (!guide) continue;

    for (const documents of Object.values(guide.documents || {})) {
      for (const document of documents) {
        assert.ok(
          wizardSource.includes(`title: '${document.title}'`),
          `το wizard.js δεν ξέρει το έντυπο «${document.title}» της ${offer.id}`
        );

        if (document.href) {
          assert.ok(
            wizardSource.includes(document.href),
            `το wizard.js δείχνει αλλού για το «${document.title}» της ${offer.id}`
          );
        }
      }
    }

    if (guide.simNumber) {
      assert.ok(
        wizardSource.includes(`simNumber: '${guide.simNumber}'`),
        `διαφορετικός αριθμός ενεργοποίησης SIM για την ${offer.id}`
      );
    }
  }
});

test('κάθε έντυπο που αναφέρεται υπάρχει στον δίσκο', () => {
  const raw = readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8');
  const hrefs = new Set([...raw.matchAll(/"href":\s*"(assets\/[^"]+)"/g)].map((match) => match[1]));

  for (const href of hrefs) {
    assert.ok(existsSync(path.join(root, href)), `λείπει το αρχείο ${href}`);
  }
});

/* Το παλιό σχέδιο είχε overrides ανά κάρτα: η «Vodafone Internet» έπαιρνε
   grid-row: span 3 και τεντωνόταν σε τρεις σειρές του πλέγματος, με τα κουμπιά
   της να πέφτουν πολύ πιο κάτω από τις υπόλοιπες. Καμία κάρτα δεν πρέπει να
   ξαναπάρει δικό της ύψος ή θέση στο πλέγμα. */
test('καμία κάρτα δεν έχει δικό της ύψος ή θέση στο πλέγμα', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const bundle = html.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0];
  const css = readFileSync(path.join(root, bundle), 'utf8');

  const offenders = [...css.matchAll(/([^{}]*#offersContainer[^{}]*)\{([^}]*)\}/g)]
    .filter(([, selector, body]) => (
      /\[data-modal-target=[^\]]+\]|:nth-child/.test(selector) &&
      /(?:^|;)\s*(?:grid-row|min-height|height)\s*:/.test(body)
    ))
    .map(([, selector]) => selector.trim());

  assert.deepEqual(offenders, [], 'επέστρεψαν overrides ύψους/πλέγματος ανά κάρτα');
});

/* Στο κινητό το σύρσιμο αριστερά-δεξιά δεν κάνει τίποτα: ούτε πλοηγεί πίσω,
   ούτε κουνάει τη σελίδα πλάγια. */
test('δεν υπάρχει χειρονομία swipe-back στον κώδικα', () => {
  const scripts = ['config.js', 'ui.js', 'modals.js', 'offers.js', 'main.js'];

  for (const file of scripts) {
    const source = readFileSync(path.join(root, 'assets/js', file), 'utf8');
    assert.doesNotMatch(source, /swipeBack|SWIPE_BACK/i, `το ${file} έχει ξανά κώδικα swipe-back`);
  }
});

test('το κινητό δεν επιτρέπει οριζόντια μετακίνηση της σελίδας', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const bundle = html.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0];
  const css = readFileSync(path.join(root, bundle), 'utf8');

  // Μετά το lightningcss το (max-width: 767px) γίνεται (width<=767px). Μέσα στο
  // media query υπάρχουν πολλά μπλοκ html,body — αρκεί ένα να τα έχει και τα τρία.
  const mobileCss = css.split('@media (width<=767px){').slice(1).join('');
  const blocks = [...mobileCss.matchAll(/html,body\{([^}]*)\}/g)].map(([, body]) => body);

  assert.ok(blocks.length, 'λείπει εντελώς κανόνας html/body για το κινητό');

  const guard = blocks.find((body) => (
    /touch-action:pan-y/.test(body) &&
    /overscroll-behavior-x:none/.test(body) &&
    // hidden αντί για clip: το clip κόβει και τα position: fixed παιδιά.
    /overflow-x:hidden/.test(body)
  ));

  assert.ok(guard, `κανένα μπλοκ html/body δεν κλειδώνει την οριζόντια κίνηση:\n${blocks.join('\n')}`);
});

test('τα modalId των προσφορών αντιστοιχούν σε υπαρκτό modal', () => {
  const modals = readFileSync(path.join(root, 'assets/js/modals.js'), 'utf8');

  for (const offer of offers) {
    if (!offer.modalId) continue;
    assert.match(
      modals,
      new RegExp(`${offer.modalId}:\\s*'assets/modals/`),
      `το ${offer.modalId} της ${offer.id} δεν είναι δηλωμένο στα lazyModalFragments`
    );
  }
});
