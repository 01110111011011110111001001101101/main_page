import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const index = readFileSync(path.join(root, 'index.html'), 'utf8');
const bundle = readFileSync(path.join(root, index.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0]), 'utf8');
const source = readFileSync(path.join(root, 'assets/css/site.css'), 'utf8');
const offers = JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8'));
const all = Array.isArray(offers) ? offers : offers.offers;

const MODALS = {
  novaLinePhone: 'nova-line-phone.html',
  novaEonModal: 'eon-tv.html',
};

const read = (file) => readFileSync(path.join(root, 'assets/modals', file), 'utf8');
const parse = (file) => new JSDOM(`<body>${read(file)}</body>`).window.document;

/*
 * Τα δύο modals δεν ανέφεραν καθόλου ποσό, ενώ ο χρήστης έμπαινε από κάρτα που
 * έγραφε 17,90€ ή 20,90€. Η τιμή γεμίζει τώρα από το offers.json, από την ίδια
 * πηγή με την κάρτα, ώστε οι δύο να μη μπορούν να διαφωνήσουν.
 */
for (const [id, file] of Object.entries(MODALS)) {
  test(`${id}: η τιμή υπάρχει και γεμίζει από τα δεδομένα`, () => {
    const document = parse(file);
    const slots = [...document.querySelectorAll('[data-modal-offer-price]')];

    assert.ok(slots.length >= 1, 'η τιμή λείπει από την κεφαλίδα');

    // Η προεπιλογή του markup πρέπει να συμφωνεί με τα δεδομένα, γιατί φαίνεται
    // αν το modal ανοίξει με απευθείας σύνδεσμο, χωρίς γνωστή προσφορά.
    const expected = new Set(all.filter((offer) => offer.modalId === id).map((offer) => offer.pricing?.amount || offer.price));
    assert.equal(expected.size, 1, 'οι προσφορές του modal δεν έχουν κοινή τιμή — η στατική προεπιλογή δεν αρκεί');

    for (const slot of slots) {
      assert.equal(slot.textContent.trim(), [...expected][0], 'η προεπιλογή διαφωνεί με το offers.json');
    }
  });

  test(`${id}: κάθε τιμή δηλώνει ότι είναι τελική με ΦΠΑ`, () => {
    const text = parse(file).body.textContent.replace(/\s+/g, ' ');

    assert.match(text, /Τελική τιμή με ΦΠΑ/, 'λείπει από την κεφαλίδα');
  });

  test(`${id}: τα βήματα διαβάζονται ως ακολουθία`, () => {
    const steps = [...parse(file).querySelectorAll('.nova-steps li')];

    assert.equal(steps.length, 3);
    assert.deepEqual(steps.map((step) => step.querySelector('.nova-steps__num').textContent.trim()), ['1', '2', '3']);
  });

  /* Ο όρος του gov.gr ήταν θαμμένος σε λίστα μέσα στο πρώτο βήμα, ενώ μπορεί
     να σταματήσει κάποιον χωρίς κωδικούς TaxisNet. */
  test(`${id}: ο όρος του gov.gr στέκει μόνος του`, () => {
    const alert = parse(file).querySelector('.nova-alert');

    assert.ok(alert, 'ο όρος έμεινε μέσα στη λίστα');
    assert.match(alert.textContent, /gov\.gr/i);
    assert.ok(alert.querySelector('strong'), 'χωρίς έμφαση διαβάζεται σαν υποσημείωση');
  });

  /* Πριν λέγονταν «ΠΕΡΙΠΤΩΣΗ Α / Β / Γ» — γλώσσα εγγράφου. Ο χρήστης έπρεπε να
     διαβάσει και τις τρεις για να βρει ποια τον αφορά. */
  test(`${id}: οι περιπτώσεις διεύθυνσης είναι απαντήσεις σε ερώτηση`, () => {
    const document = parse(file);

    assert.match(document.querySelector('.nova-question').textContent, /διεύθυνση εγκατάστασης/);
    assert.doesNotMatch(document.body.textContent, /ΠΕΡΙΠΤΩΣΗ/, 'έμεινε η γλώσσα εγγράφου');

    const cases = [...document.querySelectorAll('.nova-case')];
    assert.ok(cases.length >= 2, 'λείπουν οι εναλλακτικές');
    for (const one of cases) {
      assert.ok(one.querySelector('.nova-case__tag').textContent.trim(), 'κάθε απάντηση χρειάζεται τίτλο');
    }
  });

  test(`${id}: η περίπτωση που μπλοκάρει την αίτηση ξεχωρίζει`, () => {
    const blocked = parse(file).querySelector('.nova-case--blocked');

    assert.ok(blocked, 'καμία περίπτωση δεν σημαίνεται ως μπλοκαριστική');
    assert.match(blocked.textContent, /δεν προχωρά/);
    assert.ok(blocked.querySelector('.nova-case__warning'), 'λείπει η προειδοποίηση');
  });

  test(`${id}: τα έντυπα και η αποστολή παραμένουν προσβάσιμα`, () => {
    const document = parse(file);

    assert.ok(document.querySelector('[data-modal-offer-docs]'), 'χάθηκε η υποδοχή των εντύπων');
    assert.ok(document.querySelector(`[data-modal-close="${id}"]`), 'χάθηκε το κλείσιμο');
  });

  /*
   * Τα modals φορτώνονται κατά την εκτέλεση από το assets/modals/, ενώ το CSS
   * ζει στο hashed bundle. Μια κλάση χωρίς στυλ δεν βγάζει σφάλμα — απλώς
   * διαλύει τη διάταξη σιωπηλά. Οι δικές μας κλάσεις ελέγχονται στην πηγή,
   * γιατί το bundle χτίζεται στο μηχάνημα του χρήστη.
   */
  test(`${id}: καμία κλάση χωρίς στυλ`, () => {
    const asCss = (value) => `.${value.replace(/[.:[\]()/%,#+*$&?|^!"'=<>{}~;@`]/g, (char) => `\\${char}`)}`;
    const has = (css, name) => {
      const needle = asCss(name);
      let at = css.indexOf(needle);
      while (at !== -1) {
        if (!/[\w-]/.test(css[at + needle.length] || '')) return true;
        at = css.indexOf(needle, at + 1);
      }
      return false;
    };

    const classes = new Set([...read(file).matchAll(/class="([^"]+)"/g)].flatMap(([, value]) => value.split(/\s+/)));
    const missing = [...classes].filter((name) => {
      if (!name) return false;
      // Οι δικές μας κλάσεις γράφονται στο site.css· οι utilities παράγονται.
      return name.startsWith('nova-') ? !has(source, name) : !has(bundle, name);
    });

    assert.deepEqual(missing, [], 'κλάσεις χωρίς στυλ σπάνε τη διάταξη σιωπηλά');
  });
}

/* Το modal ανοίγει από κάρτα με βαθύ teal κεφαλίδα και χρυσή τιμή. Η παλιά
   κεφαλίδα ήταν μπλε-πορτοκαλί gradient και έμοιαζε με άλλο site. */
test('τα modals μοιράζονται τη γλώσσα των καρτών', () => {
  assert.match(source, /#novaLinePhone \.nova-hero,\s*\n#novaEonModal \.nova-hero \{[^}]*background: #0b3a45/,
    'η κεφαλίδα δεν είναι το βαθύ teal');
  assert.match(source, /#novaLinePhone \.nova-price-amount,\s*\n#novaEonModal \.nova-price-amount \{[^}]*color: #d6a23a/,
    'η τιμή δεν είναι χρυσή');
});

/* Το πλαϊνό κουτί σύνοψης αφαιρέθηκε: επαναλάμβανε την τιμή της κεφαλίδας και
   στο κινητό ξεχείλιζε εκτός οθόνης. Τα modals μένουν μονόστηλα. */
test('δεν έμεινε πλαϊνή σύνοψη ούτε στο markup ούτε στο CSS', () => {
  for (const file of Object.values(MODALS)) {
    assert.equal(parse(file).querySelector('.nova-aside, .nova-summary'), null, `${file}: η σύνοψη υπάρχει ακόμα`);
  }

  assert.doesNotMatch(source, /nova-aside|nova-summary|nova-contact-actions/, 'έμειναν ορφανοί κανόνες');
});

/* Ο renderer γεμίζει τίτλο, έντυπα και τώρα τιμή. Αν λείψει το αγκίστρι, το
   modal δείχνει τη στατική προεπιλογή σε λάθος προσφορά. */
test('ο renderer γεμίζει την τιμή από την προσφορά', () => {
  const renderer = readFileSync(path.join(root, 'assets/js/offer-renderer.js'), 'utf8');

  assert.match(renderer, /data-modal-offer-price/, 'ο renderer δεν ξέρει την υποδοχή τιμής');
  assert.match(renderer, /offer\.pricing\?\.amount \|\| offer\.price/, 'η τιμή δεν έρχεται από την ίδια πηγή με την κάρτα');
});
