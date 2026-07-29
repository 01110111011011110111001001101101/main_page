import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const markup = readFileSync(path.join(root, 'assets/modals/vodafone-fixed.html'), 'utf8');
const index = readFileSync(path.join(root, 'index.html'), 'utf8');
const bundle = readFileSync(path.join(root, index.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0]), 'utf8');
const source = readFileSync(path.join(root, 'assets/css/site.css'), 'utf8');
const document = new JSDOM(`<body>${markup}</body>`).window.document;

/* Τα κουμπιά ήταν φωλιασμένα μέσα στον τίτλο και εμφανίζονταν πριν από το
   κείμενο που κατεβάζουν και αντιγράφουν. */
test('η Υπεύθυνη Δήλωση διαβάζεται με σειρά: τίτλος, κείμενο, ενέργειες', () => {
  const section = document.querySelector('#vodafoneDeclarationTitle').closest('section');
  const order = [...section.children].map((child) => child.className || child.tagName);

  assert.deepEqual(order.slice(0, 3), [
    'vodafone-section-title',
    'vodafone-declaration-box',
    'vodafone-declaration-actions',
  ]);
});

test('τα κουμπιά δεν είναι μέσα στο κείμενο της δήλωσης', () => {
  const box = document.querySelector('.vodafone-declaration-box');

  assert.equal(box.querySelector('a, button'), null, 'το έντυπο περιέχει ενέργειες');
});

/* Οι τελείες αντικαταστάθηκαν από πεδία με υπογράμμιση, ώστε να φαίνεται ότι
   συμπληρώνονται. */
test('το έντυπο δείχνει τα κενά ως πεδία', () => {
  const box = document.querySelector('.vodafone-declaration-box');

  assert.equal(box.querySelectorAll('.vodafone-blank').length, 2, 'δύο πεδία προς συμπλήρωση');
  assert.doesNotMatch(box.textContent, /\.{6,}/, 'έμειναν σειρές τελειών');
  assert.ok(box.querySelector('.vodafone-declaration-tag'), 'λείπει η ένδειξη «προς συμπλήρωση»');
});

test('το κουμπί αντιγραφής παίρνει ακριβώς το κείμενο που φαίνεται', () => {
  const copy = document.querySelector('.vodafone-declaration-actions [data-copy-text]');
  const quote = document.querySelector('.vodafone-declaration-text');

  // Στην οθόνη τα κενά είναι υπογραμμίσεις· στο πρόχειρο μένουν τελείες, ώστε
  // να συμπληρωθούν με το χέρι. Συγκρίνουμε τα λόγια, όχι τα κενά.
  const clean = (text) => text.replace(/[«».]+/g, ' ').replace(/\s+/g, ' ').trim();
  assert.equal(clean(copy.dataset.copyText), clean(quote.textContent));
});

test('το κατέβασμα της δήλωσης καταγράφεται', () => {
  const link = document.querySelector('.vodafone-declaration-actions a[download]');

  assert.equal(link.dataset.track, 'pdf_download');
  assert.match(link.getAttribute('href'), /\.pdf$/);
});

/* Το modal ανοίγει από κάρτα με βαθύ teal κεφαλίδα και χρυσή τιμή· με κόκκινο
   gradient έμοιαζε με άλλο site. */
test('το modal μοιράζεται τη γλώσσα των καρτών', () => {
  assert.match(bundle, /#vodafoneFixedModal .vodafone-fixed-hero\{background:#0b3a45!important\}/,
    'η κεφαλίδα δεν είναι το βαθύ teal');
  assert.match(bundle, /#vodafoneFixedModal[^{}]*text-6xl[^{}]*\{[^}]*color:#d6a23a!important/,
    'η τιμή δεν είναι χρυσή');
});

test('κάθε κλάση του modal έχει στυλ στο τελικό CSS', () => {
  const classes = new Set([...markup.matchAll(/class="([^"]+)"/g)].flatMap(([, value]) => value.split(/\s+/)));
  /*
   * Χωρίς regex. Το CSS γράφει τις κλάσεις με δικά του backslash (.md\:text-5xl,
   * .max-h-\[90vh\]), οπότε φτιάχνουμε την ίδια μορφή και ψάχνουμε κυριολεκτικά.
   * Ένα regex εδώ θα χρειαζόταν διπλό escaping και σιωπηλά δεν θα ταίριαζε.
   */
  const asCss = (value) => `.${value.replace(/[.:[\]()/%,#+*$&?|^!"'=<>{}~;@`]/g, (char) => `\\${char}`)}`;

  // Το copy-msg είναι αγκίστρι της JavaScript, δεν χρειάζεται στυλ από μόνο του.
  const missing = [...classes].filter((name) => {
    if (name === 'copy-msg') return false;

    const needle = asCss(name);
    let at = bundle.indexOf(needle);
    while (at !== -1) {
      if (!/[\w-]/.test(bundle[at + needle.length] || '')) return false;
      at = bundle.indexOf(needle, at + 1);
    }

    return true;
  });

  assert.deepEqual(missing, [], 'κλάσεις χωρίς στυλ σπάνε τη διάταξη σιωπηλά');
});

/* Οι μπάρες ταχύτητας πρέπει να είναι ανάλογες των Mbps, αλλιώς η εικόνα λέει
   ψέματα. Το ADSL είναι 24 από 300, δηλαδή 8%. */
test('οι μπάρες ταχύτητας είναι ανάλογες των Mbps', () => {
  const rows = [...document.querySelectorAll('.vodafone-speed')];
  assert.equal(rows.length, 3, 'τρία πακέτα');

  const speeds = rows.map((row) => Number(row.querySelector('.vodafone-speed__note').textContent.match(/(\d+)\s*Mbps/)[1]));
  const widths = rows.map((row) => Number(row.querySelector('.vodafone-speed__track span').getAttribute('style').match(/width:\s*(\d+)%/)[1]));
  const top = Math.max(...speeds);

  speeds.forEach((speed, index) => {
    const expected = Math.round((speed / top) * 100);
    assert.ok(
      Math.abs(widths[index] - expected) <= 1,
      `${speed} Mbps → μπάρα ${widths[index]}% αντί για ${expected}%`
    );
  });
});

/* Το ADSL κοστίζει όσο και το FTTH 100 με το ένα τέταρτο της ταχύτητας. Η
   σχεδίαση πρέπει να το δείχνει, όχι να τα παρουσιάζει ισότιμα. */
test('το πακέτο με την καλύτερη αξία ξεχωρίζει', () => {
  const best = document.querySelector('.vodafone-speed--best');
  const muted = document.querySelector('.vodafone-speed--muted');

  assert.ok(best, 'κανένα πακέτο δεν προτείνεται');
  assert.match(best.querySelector('.vodafone-speed__name').textContent, /FTTH 100/);
  assert.ok(best.querySelector('.vodafone-speed__flag'), 'λείπει η ένδειξη');
  assert.match(muted.querySelector('.vodafone-speed__name').textContent, /ADSL/, 'το ADSL δεν υποβαθμίζεται');
});

/* Ζητήθηκε ρητά: η τιμή δηλώνει ότι είναι τελική, με ΦΠΑ. */
test('κάθε τιμή δηλώνει ότι είναι τελική με ΦΠΑ', () => {
  const text = document.body.textContent.replace(/\s+/g, ' ');

  assert.match(text, /Τελική τιμή με ΦΠΑ/, 'λείπει από την κεφαλίδα');
  assert.match(text, /Όλες οι τιμές είναι τελικές, με ΦΠΑ/, 'λείπει από τα πακέτα');
});

test('τα δικαιολογητικά διαβάζονται ως ακολουθία', () => {
  const steps = [...document.querySelectorAll('.vodafone-steps li')];

  assert.equal(steps.length, 3);
  assert.deepEqual(steps.map((step) => step.querySelector('.vodafone-steps__num').textContent), ['1', '2', '3']);
});

/* Το πλαϊνό κουτί σύνοψης αφαιρέθηκε: επαναλάμβανε την τιμή της κεφαλίδας και
   στο κινητό ξεχείλιζε εκτός οθόνης. Το modal μένει μονόστηλο. */
test('δεν έμεινε πλαϊνή σύνοψη ούτε στο markup ούτε στο CSS', () => {
  const document = new JSDOM(`<body>${markup}</body>`).window.document;

  assert.equal(document.querySelector('.vodafone-fixed-aside, .vodafone-summary'), null, 'η σύνοψη υπάρχει ακόμα');
  assert.doesNotMatch(source, /vodafone-fixed-aside|vodafone-summary|vodafone-contact-actions/, 'έμειναν ορφανοί κανόνες');
});

/* Τα modals φορτώνονται κατά την εκτέλεση από το assets/modals/, ενώ το CSS
   ζει στο hashed bundle. Αν ανέβει το ένα χωρίς το άλλο, τα πεδία της δήλωσης
   ήταν άδεια <span> χωρίς border — εξαφανίζονταν εντελώς. Το <u> με nbsp
   φαίνεται ακόμη και με μηδέν CSS. */
test('τα πεδία της δήλωσης φαίνονται και χωρίς CSS', () => {
  const blanks = [...document.querySelectorAll('.vodafone-blank')];

  assert.equal(blanks.length, 2);
  for (const blank of blanks) {
    assert.equal(blank.tagName, 'U', 'το <u> υπογραμμίζει από μόνο του');
    assert.ok(blank.textContent.trim().length >= 0 && blank.textContent.length >= 8, 'χωρίς πλάτος το πεδίο εξαφανίζεται');
    assert.ok(blank.getAttribute('aria-label'), 'ο αναγνώστης οθόνης πρέπει να ξέρει ότι είναι κενό');
  }
});
