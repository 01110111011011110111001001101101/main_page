import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const index = readFileSync(path.join(root, 'index.html'), 'utf8');
const bundle = readFileSync(path.join(root, index.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0]), 'utf8');

const dom = new JSDOM(index);
dom.window.document.getElementById('lazyModalRoot').innerHTML =
  readFileSync(path.join(root, 'assets/modals/activation-guide.html'), 'utf8');
const { document } = dom.window;

// Επιλογείς του τελικού CSS που ορίζουν μια ιδιότητα, χωρίς media queries.
function selectorsFor(property) {
  return [...bundle.matchAll(/([^{}@]+)\{([^}]*)\}/g)]
    .filter(([, , body]) => new RegExp(`(?:^|;)\\s*${property}\\s*:`).test(body))
    .flatMap(([, selector]) => selector.split(',').map((one) => one.trim()))
    .filter(Boolean);
}

function isStyled(element, property) {
  return selectorsFor(property).some((selector) => {
    try { return element.matches(selector); } catch { return false; }
  });
}

/*
 * Ο κοινός κανόνας των κουμπιών όριζε ύψος και γωνίες αλλά ποτέ padding, και το
 * preflight του Tailwind μηδενίζει το padding των button. Το κείμενο ακουμπούσε
 * στις στρογγυλεμένες άκρες και το «Άνοιγμα email» φαινόταν κομμένο.
 */
test('κάθε κουμπί του οδηγού έχει οριζόντιο padding', () => {
  const buttons = [
    ...document.querySelectorAll('.activation-email-card a, .activation-email-card button'),
    ...document.querySelectorAll('.activation-payment-card button'),
    ...document.querySelectorAll('.activation-help-box a'),
    ...document.querySelectorAll('.activation-actions button'),
  ];

  assert.ok(buttons.length >= 8, `βρέθηκαν μόνο ${buttons.length} κουμπιά`);

  for (const button of buttons) {
    const label = button.textContent.trim().replace(/\s+/g, ' ').slice(0, 30);
    const padded = isStyled(button, 'padding') || isStyled(button, 'padding-inline') || isStyled(button, 'padding-left');

    assert.ok(padded, `«${label}» δεν έχει padding — το κείμενο ακουμπά στις άκρες`);
  }
});

test('στον υπολογιστή οι ενέργειες παίρνουν το πλάτος τους', () => {
  // Δύο ίσες στήλες στρίμωχναν το πλατύ «Άνοιγμα email» στο πλάτος του σύντομου
  // «Αντιγραφή».
  const desktop = bundle.split('@media (width>=48rem)').slice(1).join('');

  assert.match(
    desktop,
    /activation-email-card__actions\{grid-template-columns:auto auto;justify-content:end\}/,
    'οι ενέργειες παραμένουν κλειδωμένες σε ίσες στήλες'
  );
});

test('τα κουμπιά email δεν σπάνε σε δύο γραμμές στον υπολογιστή', () => {
  const link = document.querySelector('.activation-email-card__actions a[href^="mailto:"]');

  assert.ok(isStyled(link, 'white-space'), 'χωρίς white-space η ετικέτα σπάει άτσαλα');
});

test('σε πολύ στενές οθόνες επιτρέπεται η αναδίπλωση', () => {
  // Με nowrap παντού, στα 320px το κουμπί θα ξεχείλιζε από την κάρτα.
  assert.match(
    bundle,
    /@media \(width<=380px\)[\s\S]{0,400}white-space:normal/,
    'λείπει η διέξοδος για τις πολύ στενές οθόνες'
  );
});
