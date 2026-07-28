import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const html = readFileSync(path.join(root, 'info.html'), 'utf8');
const tailwind = readFileSync(path.join(root, 'assets/css/tailwind.css'), 'utf8');
const inlineStyles = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map(([, css]) => css).join('\n');
const document = new JSDOM(html).window.document;

/*
 * Το info.html φορτώνει ΜΟΝΟ το tailwind.css — όχι το bundle του site. Κάθε
 * κλάση που ορίζεται στο site.css είναι αόρατη εδώ. Το .top-emblem ήταν τέτοια:
 * η εικόνα αποδιδόταν στο φυσικό της μέγεθος, 320x442, και σκέπαζε την κεφαλίδα.
 */
test('κάθε κλάση του info.html έχει στυλ στα αρχεία που φορτώνει', () => {
  const available = `${tailwind}\n${inlineStyles}`;
  const asCss = (value) => `.${value.replace(/[.:[\]()/%,#+*$&?|^!"'=<>{}~;@`]/g, (char) => `\\${char}`)}`;

  const classes = new Set([...html.matchAll(/class="([^"]+)"/g)].flatMap(([, value]) => value.split(/\s+/)));
  const missing = [...classes].filter((name) => {
    if (!name) return false;

    const needle = asCss(name);
    let at = available.indexOf(needle);
    while (at !== -1) {
      if (!/[\w-]/.test(available[at + needle.length] || '')) return false;
      at = available.indexOf(needle, at + 1);
    }

    return true;
  });

  assert.deepEqual(missing, [], 'κλάσεις χωρίς στυλ σπάνε τη σελίδα σιωπηλά');
});

test('το info.html δεν εξαρτάται από το site.css', () => {
  assert.doesNotMatch(html, /bundle\.[a-f0-9]{8}\.min\.css/, 'αν το φορτώνει, ας φορτώνει και το critical');
  assert.match(html, /assets\/css\/tailwind\.css/, 'λείπει το μόνο stylesheet της σελίδας');
});

test('το σήμα της κεφαλίδας είναι το τετράγωνο αρχείο', () => {
  const mark = document.querySelector('.top-emblem');

  assert.ok(mark, 'λείπει το σήμα');
  assert.match(mark.getAttribute('src'), /brand-mark\.webp/, 'το πορτρέτο 320x442 δεν ταιριάζει σε 44px');
  assert.equal(mark.getAttribute('width'), mark.getAttribute('height'), 'το αρχείο πρέπει να είναι τετράγωνο');
});

test('το σήμα έχει ρητό μέγεθος στο ίδιο το αρχείο', () => {
  const rule = inlineStyles.match(/\.top-emblem\{([^}]*)\}/);

  assert.ok(rule, 'χωρίς κανόνα η εικόνα παίρνει το φυσικό της μέγεθος');
  assert.match(rule[1], /width:\s*\d+px/, 'λείπει ρητό πλάτος');
  assert.match(rule[1], /height:\s*\d+px/, 'λείπει ρητό ύψος');
});
