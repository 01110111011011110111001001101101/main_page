import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import { root } from './helpers/load-scripts.mjs';

const index = readFileSync(path.join(root, 'index.html'), 'utf8');
const bundle = readFileSync(path.join(root, index.match(/assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/)[0]), 'utf8');
const modals = readdirSync(path.join(root, 'assets/modals')).filter((name) => name.endsWith('.html'));

/*
 * Το κουμπί αποστολής email ήταν φτιαγμένο με utilities και αυθαίρετο χρώμα
 * (text-[#0057ff]) που ζούσε μόνο μέσα στα modals. Όταν το χρώμα δεν παραγόταν,
 * το κείμενο κληρονομούσε το text-white του γονέα και το κουμπί έμενε άδειο.
 */
test('κανένα κουμπί email δεν κληρονομεί το χρώμα του', () => {
  // Ο πραγματικός κανόνας: αν κανένας κανόνας δεν ορίζει color πάνω στο
  // στοιχείο, το χρώμα έρχεται από τον γονέα — και αν ο γονέας είναι λευκός
  // πάνω σε λευκό φόντο, το κουμπί εξαφανίζεται. Ακριβώς αυτό συνέβη.
  const selectors = [...bundle.matchAll(/([^{}@]+)\{([^}]*)\}/g)]
    .filter(([, , body]) => /(?:^|;)\s*color\s*:/.test(body))
    .flatMap(([, selector]) => selector.split(',').map((one) => one.trim()))
    .filter(Boolean);

  for (const name of modals) {
    const markup = readFileSync(path.join(root, 'assets/modals', name), 'utf8');
    const dom = new JSDOM(index);
    dom.window.document.getElementById('lazyModalRoot').innerHTML = markup;

    for (const link of dom.window.document.querySelectorAll('#lazyModalRoot a[href^="mailto:"]')) {
      const painted = selectors.some((selector) => {
        try { return link.matches(selector); } catch { return false; }
      });

      assert.ok(painted, `${name}: το κουμπί email «${link.getAttribute('class') || 'χωρίς κλάση'}» κληρονομεί χρώμα`);
    }
  }
});

test('το κουμπί αποστολής έχει ρητά χρώματα, όχι κληρονομημένα', () => {
  const rule = bundle.match(/\.modal-send-email\{([^}]*)\}/);

  assert.ok(rule, 'λείπει ο κανόνας .modal-send-email');
  assert.match(rule[1], /color:#fff/, 'χωρίς ρητό χρώμα κειμένου μπορεί να κληρονομήσει λευκό');
  assert.match(rule[1], /background:#0b3a45/, 'χωρίς ρητό φόντο μπορεί να μείνει λευκό σε λευκό');
});

/* Γενικός φρουρός: κανένα ορατό στοιχείο σε modal δεν πρέπει να στηρίζει το
   χρώμα του σε αυθαίρετη κλάση Tailwind που ίσως δεν παραχθεί. */
test('καμία κλάση των modals δεν λείπει από το τελικό CSS', () => {
  const asCss = (value) => `.${value.replace(/[.:[\]()/%,#+*$&?|^!"'=<>{}~;@`]/g, (char) => `\\${char}`)}`;
  const hooks = new Set(['copy-msg', 'group', 'peer']);
  const missing = [];

  for (const name of modals) {
    const markup = readFileSync(path.join(root, 'assets/modals', name), 'utf8');
    const classes = new Set([...markup.matchAll(/class="([^"]+)"/g)].flatMap(([, value]) => value.split(/\s+/)));

    for (const value of classes) {
      if (!value || hooks.has(value)) continue;

      const needle = asCss(value);
      let at = bundle.indexOf(needle);
      let found = false;
      while (at !== -1 && !found) {
        if (!/[\w-]/.test(bundle[at + needle.length] || '')) found = true;
        at = bundle.indexOf(needle, at + 1);
      }

      if (!found) missing.push(`${name}: ${value}`);
    }
  }

  assert.deepEqual(missing, [], 'κλάσεις χωρίς στυλ σβήνουν περιεχόμενο σιωπηλά');
});

test('τα κουμπιά email καταγράφονται', () => {
  for (const name of modals) {
    const markup = readFileSync(path.join(root, 'assets/modals', name), 'utf8');
    const document = new JSDOM(`<body>${markup}</body>`).window.document;

    for (const link of document.querySelectorAll('a.modal-send-email')) {
      assert.equal(link.dataset.track, 'email_click', `${name}: λείπει το tracking`);
    }
  }
});
