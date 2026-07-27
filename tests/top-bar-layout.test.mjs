import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { root } from './helpers/load-scripts.mjs';

const site = readFileSync(path.join(root, 'assets/css/site.css'), 'utf8');

/* Η θέση του σήματος καθοριζόταν από 21 κανόνες σε οκτώ σημεία του αρχείου,
   γραμμένους ο ένας για να νικήσει τον άλλο σε specificity. Κάθε αλλαγή
   απαιτούσε νέο μπάλωμα και το σήμα κατέληγε σε απρόβλεπτες θέσεις. */
test('το σήμα της μπάρας ορίζεται σε ένα μόνο σημείο', () => {
  const rules = [...site.matchAll(/([^{}]*\.top-brand\b[^{}]*)\{/g)].map(([, selector]) => selector.trim());

  assert.ok(rules.length > 0, 'δεν βρέθηκε κανένας κανόνας — μήπως χάθηκε το σήμα;');
  assert.ok(
    rules.length <= 8,
    `το .top-brand ορίζεται σε ${rules.length} κανόνες· κρατάμε ένα μπλοκ:\n${rules.join('\n')}`
  );
});

test('δεν υπάρχουν πια κανόνες για στοιχεία που αφαιρέθηκαν', () => {
  for (const dead of ['.top-viber', '.top-call-button']) {
    assert.doesNotMatch(
      site,
      new RegExp(`\\${dead}\\s*[,{]`),
      `το ${dead} δεν υπάρχει στο markup — ο κανόνας είναι νεκρός`
    );
  }
});

test('η μπάρα βάζει σήμα αριστερά και ενέργεια δεξιά', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const bundle = html.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0];
  const css = readFileSync(path.join(root, bundle), 'utf8');

  assert.match(css, /\.top-brand\{[^}]*grid-column:1/, 'το σήμα δεν είναι στην πρώτη στήλη');
  assert.match(css, /\.top-guide-cta\{[^}]*grid-column:3/, 'ο οδηγός δεν είναι στην τρίτη στήλη');
  assert.match(css, /\.top-brand__mark\{[^}]*border-radius:50%/, 'το σήμα δεν είναι κύκλος');
});

/* Στο κινητό ένας legacy κανόνας επιβάλλει display:flex!important στη μπάρα,
   οπότε κάθε grid-column αγνοείται σιωπηλά. Η σειρά ορίζεται με order. */
test('στο κινητό το μενού είναι αριστερά και το σήμα δεξιά του', () => {
  const mobile = site.slice(site.indexOf('ΣΤΑΘΕΡΗ ΜΠΑΡΑ'));

  assert.match(mobile, /\.top-menu-button\s*\{[^}]*order:\s*-1/, 'το μενού δεν πάει πρώτο');
  assert.match(mobile, /\.top-brand\s*\{[^}]*flex:\s*1 1 auto/, 'το σήμα δεν παίρνει τον υπόλοιπο χώρο');
});

/* Το markup βάζει πρώτο το σήμα ώστε ο αναγνώστης οθόνης και το Tab να
   ακολουθούν τη λογική σειρά· η οπτική εναλλαγή γίνεται μόνο με CSS. */
test('η σειρά στο markup μένει σήμα πριν από μενού', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const bar = html.slice(html.indexOf('site-top-nav-inner'), html.indexOf('</nav>'));

  assert.ok(bar.indexOf('top-brand') < bar.indexOf('top-menu-button'), 'άλλαξε η σειρά στο DOM');
});

test('το κουμπί μενού μένει κρυφό στον υπολογιστή', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const bundle = html.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0];
  const css = readFileSync(path.join(root, bundle), 'utf8');

  const desktop = css.split('@media (width>=48rem)').slice(1).join('')
    + css.split('@media (width>=768px)').slice(1).join('');

  assert.match(desktop, /top-menu-button[^{}]*\{[^}]*display:none/, 'το μενού εμφανίζεται στον υπολογιστή');
});

test('ο οδηγός δεν εμφανίζεται δύο φορές στη μπάρα', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const bar = html.slice(html.indexOf('site-top-nav-inner'), html.indexOf('</nav>'));
  const guides = [...bar.matchAll(/activationProviderChoiceModal/g)];

  assert.equal(guides.length, 1, 'ο οδηγός πρέπει να είναι μόνο το κουμπί δεξιά');
});
