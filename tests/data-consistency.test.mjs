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
