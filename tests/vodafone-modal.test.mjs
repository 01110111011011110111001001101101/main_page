import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const markup = readFileSync(path.join(root, 'assets/modals/vodafone-fixed.html'), 'utf8');
const index = readFileSync(path.join(root, 'index.html'), 'utf8');
const bundle = readFileSync(path.join(root, index.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0]), 'utf8');
const document = new JSDOM(`<body>${markup}</body>`).window.document;

/* Τα κουμπιά ήταν φωλιασμένα μέσα στον τίτλο και εμφανίζονταν πριν από το
   κείμενο που κατεβάζουν και αντιγράφουν. */
test('η Υπεύθυνη Δήλωση διαβάζεται με σειρά: τίτλος, κείμενο, ενέργειες', () => {
  const box = document.querySelector('.vodafone-declaration-box');
  const order = [...box.children].map((child) => child.className || child.tagName);

  assert.equal(order[0], 'vodafone-declaration-title');
  assert.equal(order[1], 'P', 'το κείμενο της δήλωσης πρέπει να έρχεται δεύτερο');
  assert.equal(order[2], 'vodafone-declaration-actions');
});

test('τα κουμπιά δεν είναι μέσα στον τίτλο', () => {
  const title = document.querySelector('.vodafone-declaration-title');

  assert.equal(title.querySelector('a, button'), null, 'ο τίτλος περιέχει ενέργειες');
});

test('το κουμπί αντιγραφής παίρνει ακριβώς το κείμενο που φαίνεται', () => {
  const copy = document.querySelector('.vodafone-declaration-actions [data-copy-text]');
  const quote = document.querySelector('.vodafone-declaration-box p:not(.vodafone-declaration-title)');

  const clean = (text) => text.replace(/[«»\s]+/g, ' ').trim();
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
