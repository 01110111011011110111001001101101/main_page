import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const settle = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* Ο τίτλος του hero αποδίδεται ολόκληρος, μετά αδειάζει και ξαναγράφεται
   γράμμα-γράμμα. Χωρίς κλείδωμα ύψους η σελίδα από κάτω τιναζόταν δύο φορές. */
test('ο τίτλος κρατά το ύψος του όσο γράφεται', async () => {
  const dom = new JSDOM('<h1 data-typewriter>Ένας αρκετά μακρύς τίτλος που τυλίγεται</h1>', {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });

  const title = window.document.querySelector('[data-typewriter]');
  title.getBoundingClientRect = () => ({ height: 84, width: 300, top: 0, left: 0 });

  window.eval(readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8'));
  window.eval('initializeTypewriters()');

  // Όσο γράφει, το ύψος είναι κλειδωμένο στο μετρημένο.
  await settle(300);
  assert.equal(title.style.minHeight, '84px', 'δεν κλειδώθηκε το ύψος');
  assert.equal(title.classList.contains('is-typing'), true);

  // Μόλις τελειώσει, το κλείδωμα φεύγει.
  await settle(2600);
  assert.equal(title.classList.contains('is-typed'), true, 'δεν ολοκληρώθηκε η γραφή');
  assert.equal(title.style.minHeight, '', 'έμεινε κλειδωμένο το ύψος');
});

test('ο τίτλος δεν χάνει κείμενο ούτε προσβασιμότητα', async () => {
  const full = 'Ένας αρκετά μακρύς τίτλος που τυλίγεται';
  const dom = new JSDOM(`<h1 data-typewriter>${full}</h1>`, { runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });

  const title = window.document.querySelector('[data-typewriter]');
  window.eval(readFileSync(path.join(root, 'assets/js/ui.js'), 'utf8'));
  window.eval('initializeTypewriters()');
  await settle(2600);

  assert.equal(title.getAttribute('aria-label'), full);
  assert.equal(title.querySelector('.typewriter-text').textContent, full);
});

/* Το banner cookies είναι fixed. Αν εμφανιστεί πριν φτάσει το πλήρες CSS,
   αλλάζει μέγεθος και χρεώνεται ως layout shift. */
test('το banner cookies μπαίνει με transform, όχι με display', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const critical = html.match(/<style id="critical-css">([\s\S]*?)<\/style>/)[1];

  assert.match(critical, /app-css-ready[^{]*#cookieConsentBanner[^{]*\{[^}]*transform:none/,
    'λείπει η αποκάλυψη με transform μετά το app-css-ready');
  assert.match(critical, /data-cookie-consent=pending\][^{]*#cookieConsentBanner[^{]*\{[^}]*translateY/,
    'το banner δεν ξεκινά εκτός οθόνης');
});

test('το πλήρες stylesheet σηματοδοτεί πότε είναι έτοιμο', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(html, /onload="[^"]*app-css-ready[^"]*"/, 'το link δεν προσθέτει το app-css-ready');
  assert.match(html, /<noscript>[\s\S]*?#cookieConsentBanner\{transform:none!important/,
    'χωρίς JavaScript το banner θα έμενε κρυφό');
});

/* Το PageSpeed βρήκε 25 KiB περιττά: το σήμα ήταν 184px για προβολή 42px και το
   έμβλημα του hero 320px για προβολή 64px στο κινητό. */
test('οι εικόνες δεν είναι μεγαλύτερες από ό,τι δείχνονται', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');

  const mark = html.match(/<img[^>]*brand-mark\.webp[^>]*>/g) || [];
  assert.ok(mark.length >= 2, 'το τετράγωνο σήμα πρέπει να καλύπτει μπάρα και μενού');
  for (const tag of mark) {
    assert.match(tag, /width="96"/, `το σήμα δηλώνει λάθος πλάτος: ${tag.slice(0, 90)}`);
  }

  const hero = html.match(/<img[^>]*police-hero__logo[\s\S]*?>/)[0];
  assert.match(hero, /srcset="[^"]*hero-head-160\.webp(\?v=[a-f0-9]+)? 160w/, 'λείπει η μικρή εκδοχή για το κινητό');
  assert.match(hero, /sizes="\(max-width: 767px\) 64px/, 'το sizes δεν δηλώνει το πραγματικό πλάτος');
});

test('το preload του hero διαλέγει αρχείο ανά οθόνη', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');

  assert.match(html, /preload[^>]*hero-head-160\.webp[^>]*media="\(max-width: 767px\)"/, 'το κινητό δεν προφορτώνει το μικρό');
  assert.match(html, /preload[^>]*hero-head\.webp[^>]*media="\(min-width: 768px\)"/, 'ο υπολογιστής δεν προφορτώνει το μεγάλο');
});

/* Ο κανόνας για το μέγεθος του εμβλήματος έχανε σε specificity και το 64px δεν
   εφαρμοζόταν ποτέ — το έμβλημα έμενε έως 150px στο κινητό. */
test('το έμβλημα του hero είναι όντως 64px στο κινητό', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const css = readFileSync(path.join(root, html.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0]), 'utf8');
  const mobile = css.split('@media (width<=767px)').slice(1).join('');

  assert.match(
    mobile,
    /body(?:\.hero-intro-ready)? \.police-hero \.police-hero__logo[^{}]*\{[^}]*width:64px/,
    'ο κανόνας δεν έχει αρκετή specificity για να κερδίσει'
  );
});

/* Η μεγαλύτερη πηγή CLS ήταν ότι το critical CSS περιέγραφε ακόμη την παλιά
   μπάρα: δεν ήξερε το --top-area-height, οπότε το .site-main έπαιρνε άλλο
   padding-top στο πρώτο βάψιμο και ΟΛΗ η σελίδα κατέβαινε μόλις έφτανε το
   bundle. Το τεστ συγκρίνει τις δύο εκδοχές στα σημεία που καθορίζουν ύψος. */
test('το πρώτο βάψιμο συμφωνεί με το τελικό στα κρίσιμα μεγέθη', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const critical = html.match(/<style id="critical-css">([\s\S]*?)<\/style>/)[1];
  const full = readFileSync(path.join(root, html.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0]), 'utf8');

  const pairs = [
    ['--top-area-height', /--top-area-height:\s*([^;}]+)/g],
    // Το «;» πριν το height αποκλείει το min-height, που αλλιώς περνά ως ύψος.
    ['ύψος μπάρας', /\.site-top-nav-inner\{[^}]*[;{]height:\s*([^;}]+)/g],
  ];

  for (const [name, pattern] of pairs) {
    const inCritical = [...critical.matchAll(pattern)].map(([, value]) => value.trim());
    const inFull = [...full.matchAll(pattern)].map(([, value]) => value.trim());

    assert.ok(inCritical.length > 0, `το critical CSS δεν ορίζει ${name}`);
    for (const value of inCritical) {
      assert.ok(inFull.includes(value), `${name}: το critical λέει «${value}», το τελικό δεν το έχει`);
    }
  }
});

test('το critical CSS δεν περιγράφει πια το παλιό σήμα', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const critical = html.match(/<style id="critical-css">([\s\S]*?)<\/style>/)[1];

  assert.doesNotMatch(critical, /\.top-brand img\{/, 'έμεινε ο κανόνας της παλιάς εικόνας');
  assert.match(critical, /\.top-brand__mark\{/, 'λείπει το νέο σήμα από το πρώτο βάψιμο');
  assert.match(critical, /\.top-guide-cta\{[^}]*display:inline-flex/, 'ο οδηγός εμφανίζεται μόνο μετά το bundle');
});

/* Οι κάρτες φτιάχνονταν μόνο στον browser μετά από fetch· ώσπου να έρθουν, η
   ενότητα «Υποστήριξη» καθόταν ψηλά και μετά κατέβαινε απότομα. Ήταν το 0,309
   του PageSpeed — σχεδόν όλο το CLS της σελίδας. */
test('οι κάρτες υπάρχουν στο HTML πριν τρέξει JavaScript', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const offers = JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8')).offers
    .filter((offer) => offer.active !== false);

  const block = html.match(/<!-- offers:start -->([\s\S]*?)<!-- offers:end -->/);
  assert.ok(block, 'λείπουν τα markers προαπόδοσης');

  const rendered = [...block[1].matchAll(/data-offer-id="([^"]+)"/g)].map(([, id]) => id);
  assert.deepEqual(rendered, offers.map((offer) => offer.id), 'το HTML δεν συμφωνεί με το offers.json');
});

test('το προαποδοθέν markup δεν κουβαλά κατάσταση εκτέλεσης', () => {
  const html = readFileSync(path.join(root, 'index.html'), 'utf8');
  const block = html.match(/<!-- offers:start -->([\s\S]*?)<!-- offers:end -->/)[1];

  // Το is-visible και το transition-delay τα βάζει ο browser κατά την αποκάλυψη.
  assert.doesNotMatch(block, /is-visible/, 'οι κάρτες θα εμφανίζονταν χωρίς το animation');
  assert.doesNotMatch(block, /style="/, 'inline styles στο HTML — το html-validate τα κόβει');
});

test('η προαπόδοση τρέχει πριν το stamping στο build', () => {
  const pkg = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const build = pkg.scripts.build;

  assert.ok(build.includes('build:offers'), 'η προαπόδοση δεν είναι στο build');
  assert.ok(
    build.indexOf('build:offers') < build.indexOf('build:stamp-assets'),
    'χωρίς stamping μετά, τα εικονίδια των καρτών μένουν χωρίς version'
  );
});
