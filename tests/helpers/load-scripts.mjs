/**
 * Φορτώνει τα scripts του site μέσα σε jsdom, όπως ακριβώς τα ενώνει το
 * esbuild στο production bundle (κοινό global scope, ίδια σειρά).
 *
 * Όσο τα αρχεία είναι top-level scripts και όχι ES modules, αυτός είναι ο
 * μόνος τρόπος να τα δοκιμάσουμε. Όταν γίνει η μετάβαση σε modules, αυτό το
 * helper αντικαθίσταται από κανονικά import.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export function readOffers() {
  return JSON.parse(readFileSync(path.join(root, 'assets/data/offers.json'), 'utf8'));
}

const DEFAULT_FILES = [
  'clipboard.js',
  'config.js',
  'ui.js',
  'modals.js',
  'tracking.js',
  'offers.js',
  'offer-renderer.js',
];

export function createPage({ html, files = DEFAULT_FILES, offers, matchMedia, url } = {}) {
  const dom = new JSDOM(html, {
    url: url ?? 'https://example.test/',
    runScripts: 'outside-only',
    pretendToBeVisual: true,
  });

  const { window } = dom;
  const errors = [];

  window.fetch = async () => ({ ok: true, json: async () => offers ?? readOffers() });
  window.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = matchMedia ?? ((query) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
  window.gtag = () => {};
  window.addEventListener('error', (event) => errors.push(event.message));

  const source = files
    .map((file) => readFileSync(path.join(root, 'assets/js', file), 'utf8'))
    .join('\n;\n');

  window.eval(source);
  return { dom, window, document: window.document, errors };
}

export const settle = (ms = 350) => new Promise((resolve) => setTimeout(resolve, ms));
