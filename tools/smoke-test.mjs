import jsdomPkg from 'jsdom';
const { JSDOM } = jsdomPkg;
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const loaded = [];
const errors = [];

const html = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'https://synetairismos-astynomikon.gr/',
  runScripts: 'dangerously',
  pretendToBeVisual: true,
});
const { window } = dom;
const { document } = window;

window.addEventListener('error', (e) => errors.push('window error: ' + (e.error?.stack || e.message)));
const origError = window.console.error;
window.console.error = (...a) => { errors.push('console.error: ' + a.map(String).join(' ')); origError(...a); };

// --- stubs ---
window.fetch = (input) => {
  const raw = typeof input === 'string' ? input : (input.href || input.url);
  const rel = String(raw).replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
  const abs = path.join(ROOT, rel);
  if (!existsSync(abs)) return Promise.resolve({ ok: false, status: 404, text: async () => '', json: async () => ({}) });
  const body = readFileSync(abs, 'utf8');
  return Promise.resolve({ ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body) });
};
window.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} };
window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
window.requestIdleCallback = (cb) => window.setTimeout(cb, 0);
window.scrollTo = () => {};
window.HTMLElement.prototype.scrollIntoView = () => {};

// Τα classic <script> μοιράζονται το ίδιο global lexical scope. Το window.eval ΔΕΝ το κάνει,
// οπότε εκτελούμε τα αρχεία ως πραγματικά inline <script> για να είναι ρεαλιστικό το τεστ.
function runFile(abs, label) {
  loaded.push(label);
  const el = document.createElement('script');
  el.textContent = readFileSync(abs, 'utf8');
  document.body.appendChild(el);
}

// --- εκτέλεση δυναμικά εισαγόμενων scripts (αυτό κάνει το App.loadScript) ---
const realAppend = document.head.appendChild.bind(document.head);
document.head.appendChild = (node) => {
  if (node.tagName === 'SCRIPT' && node.src) {
    const rel = String(node.src).replace(/^https?:\/\/[^/]+\//, '').split('?')[0];
    const abs = path.join(ROOT, rel);
    if (existsSync(abs)) {
      runFile(abs, path.basename(abs));
      setTimeout(() => node.onload?.(), 0);
      return node;
    }
    if (!/googletagmanager|cdnjs/.test(node.src)) errors.push('MISSING SCRIPT: ' + node.src);
    setTimeout(() => node.onerror?.(), 0);
    return node;
  }
  return realAppend(node);
};

// --- eager scripts, με τη σειρά του index.html ---
const eager = [...html.matchAll(/<script defer src="(assets\/js\/[^"?]+)/g)].map((m) => m[1]);
for (const rel of eager) runFile(path.join(ROOT, rel), path.basename(rel));
document.dispatchEvent(new window.Event('DOMContentLoaded', { bubbles: true }));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
await wait(800);

const results = [];
const check = (label, ok, extra = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${label}${extra ? '  — ' + extra : ''}`);

check('ένα μόνο eager request (bundle)', eager.length === 1, eager.join(','));
check('ΔΕΝ φορτώθηκε το wizard.js', !loaded.includes('wizard.js'));
check('ΔΕΝ φορτώθηκε το pdf-preview.js', !loaded.includes('pdf-preview.js'));
check('ΔΕΝ φορτώθηκε το office-closure.js (mode: off)', !loaded.includes('office-closure.js'));
check('window.App.loadLazyScript υπάρχει', typeof window.App?.loadLazyScript === 'function');
check('window.App.modals.open υπάρχει', typeof window.App?.modals?.open === 'function');
check('διαβάστηκε το μητρώο lazyScripts', Boolean(document.getElementById('lazyScripts')));

const cards = document.querySelectorAll('[data-offer-card]');
check('renderάρισαν οι κάρτες προσφορών', cards.length === 5, cards.length + ' κάρτες');
const guideCta = document.querySelector('[data-activation-guide-open]');
check('υπάρχει CTA οδηγού ενεργοποίησης', Boolean(guideCta));

if (guideCta) {
  guideCta.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(1200);
  check('φορτώθηκε το wizard.js μετά το κλικ', loaded.includes('wizard.js'));
  check('φορτώθηκε το pdf-preview.js μετά το κλικ', loaded.includes('pdf-preview.js'));
  const modal = document.getElementById('activationGuideModal');
  check('μπήκε στο DOM το activationGuideModal', Boolean(modal));
  check('το modal είναι ανοιχτό', Boolean(modal) && !modal.classList.contains('hidden'));
  check('renderάρισε το checklist', document.querySelectorAll('.activation-checklist__item').length > 0,
    document.querySelectorAll('.activation-checklist__item').length + ' items');
}

// modal προσφοράς (μη-lazy μονοπάτι)
const modalCta = document.querySelector('[data-modal-target="vodafoneFixedModal"]');
if (modalCta) {
  modalCta.dispatchEvent(new window.MouseEvent('click', { bubbles: true, cancelable: true }));
  await wait(800);
  const m = document.getElementById('vodafoneFixedModal');
  check('άνοιξε lazy modal προσφοράς', Boolean(m) && !m.classList.contains('hidden'));
}

console.log('\n' + results.join('\n'));
console.log('\nΣειρά φόρτωσης: ' + loaded.join(' → '));
if (errors.length) {
  console.log('\n--- ΣΦΑΛΜΑΤΑ ---\n' + [...new Set(errors)].slice(0, 10).join('\n'));
} else {
  console.log('\nΚανένα σφάλμα.');
}
console.log(results.some((r) => r.startsWith('FAIL')) ? '\n>>> ΥΠΑΡΧΟΥΝ ΑΠΟΤΥΧΙΕΣ' : '\n>>> ΟΛΑ ΠΕΡΑΣΑΝ');
