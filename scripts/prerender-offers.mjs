import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

/*
 * ΠΡΟΑΠΟΔΟΣΗ ΤΩΝ ΚΑΡΤΩΝ ΠΡΟΣΦΟΡΩΝ
 *
 * Οι κάρτες φτιάχνονταν αποκλειστικά στον browser, μετά από fetch του
 * offers.json. Όσο ο χρήστης περίμενε, το #offersContainer ήταν άδειο και η
 * ενότητα «Υποστήριξη» από κάτω καθόταν ψηλά· μόλις έφταναν οι έξι κάρτες,
 * κατέβαινε απότομα. Το PageSpeed το χρέωνε ως 0,309 CLS — σχεδόν όλο το
 * πρόβλημα της σελίδας.
 *
 * Εδώ τρέχουμε τον ίδιο ακριβώς renderer σε jsdom κατά το build και γράφουμε το
 * αποτέλεσμα μέσα στο index.html. Ο browser ξαναποδίδει τις ίδιες κάρτες, οπότε
 * οι διαστάσεις δεν αλλάζουν και δεν υπάρχει μετατόπιση. Κερδίζουμε επίσης ότι
 * οι προσφορές γίνονται ορατές σε crawlers και χωρίς JavaScript.
 *
 * Σκόπιμα ΔΕΝ αντιγράφουμε τη λογική απόδοσης: αν διαφέρει από αυτήν του
 * browser, η προαπόδοση θα δημιουργούσε ακριβώς το shift που θέλει να λύσει.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'index.html');
const START = '<!-- offers:start -->';
const END = '<!-- offers:end -->';

// Ίδια σειρά με το EAGER_SCRIPTS του build-js-bundle: μοιράζονται global scope.
const SCRIPTS = ['config.js', 'clipboard.js', 'offers.js', 'offer-renderer.js'];

const html = await fs.readFile(indexPath, 'utf8');
const offers = await fs.readFile(path.join(root, 'assets/data/offers.json'), 'utf8');

const dom = new JSDOM(html, { url: 'https://synetairismos-astynomikon.gr/', runScripts: 'outside-only', pretendToBeVisual: true });
const { window } = dom;

window.matchMedia = (query) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
window.fetch = async () => ({ ok: true, json: async () => JSON.parse(offers) });
window.gtag = () => {};
window.scrollTo = () => {};

const sources = await Promise.all(SCRIPTS.map((file) => fs.readFile(path.join(root, 'assets/js', file), 'utf8')));
window.eval(sources.join('\n;\n'));
window.eval('window.App.offerRenderer.init();');
await new Promise((resolve) => { setTimeout(resolve, 500); });

const container = window.document.getElementById('offersContainer');
const cards = container.querySelectorAll('[data-offer-card]');
if (!cards.length) throw new Error('Η προαπόδοση δεν παρήγαγε καμία κάρτα — δες το offers.json.');

if (!html.includes(START) || !html.includes(END)) {
  throw new Error(`Λείπουν τα markers ${START} / ${END} από το index.html`);
}

/*
 * Καθαρίζουμε ό,τι αφορά κατάσταση εκτέλεσης. Το is-visible μπαίνει από τον
 * browser με animation αποκάλυψης· αν το γράφαμε στο HTML, οι κάρτες θα
 * εμφανίζονταν χωρίς αυτό και μετά ο browser θα το ξαναέβαζε.
 */
container.querySelectorAll('.is-visible').forEach((card) => card.classList.remove('is-visible'));

// Το transition-delay μπαίνει από το revealRenderedOfferCards κατά την εκτέλεση.
// Στο HTML δεν έχει νόημα, και το html-validate απορρίπτει τα inline styles.
container.querySelectorAll('[style]').forEach((element) => element.removeAttribute('style'));

const markup = container.innerHTML.trim();
const next = html.replace(
  new RegExp(`${START}[\\s\\S]*?${END}`),
  `${START}\n${markup}\n      ${END}`,
);

await fs.writeFile(indexPath, next);
console.log(`Προαποδόθηκαν ${cards.length} κάρτες προσφορών (${Buffer.byteLength(markup)} bytes) στο index.html.`);
