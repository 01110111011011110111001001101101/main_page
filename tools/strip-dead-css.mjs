/**
 * Αφαιρεί κανόνες CSS που στοχεύουν αποκλειστικά κλάσεις οι οποίες δεν
 * υπάρχουν πουθενά σε HTML, JS ή JSON.
 *
 *   node tools/strip-dead-css.mjs --check   → μόνο αναφορά, δεν γράφει
 *   node tools/strip-dead-css.mjs           → γράφει το site.css
 *
 * Ένας κανόνας διαγράφεται ΜΟΝΟ αν ΟΛΟΙ οι selectors του αναφέρονται σε
 * νεκρή κλάση. Έτσι δεν χάνεται κανόνας που μοιράζεται selector list με
 * ζωντανό στοιχείο.
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssPath = path.join(root, 'assets/css/site.css');
const checkOnly = process.argv.includes('--check');

// Κλάσεις των παλιών καρτών προσφορών, πριν το redesign σε .new-premium-*.
const DEAD_CLASSES = [
  'offer-card--glass',
  'offer-card-mobile',
  'offer-card-mobile-vodafone',
  'offer-card-mobile-nova',
  'offer-card__price-panel',
  'offer-card__spec-pill',
  'offer-card__title-row',
  'offer-card__type',
  'offer-card__benefits',
  'offer-card__glass-top',
  'offer-card-top',
  'offer-highlight-badge',
  'offer-note',
  'offer-category',
  'top-brand-text',
];

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    // Τα reports είναι παλιά αποτελέσματα coverage, όχι πηγαίος κώδικας.
    if (entry.name === 'node_modules' || entry.name === 'reports' || entry.name.startsWith('.')) return [];
    return entry.isDirectory() ? listFiles(target) : [target];
  }))).flat();
}

const sourceFiles = (await listFiles(root)).filter((file) => (
  /\.(?:html|json)$/.test(file) || (/\.js$/.test(file) && !/\.min\.js$/.test(file))
));
const sources = (await Promise.all(sourceFiles.map((file) => fs.readFile(file, 'utf8')))).join('\n');

const stillUsed = DEAD_CLASSES.filter((name) => sources.includes(name));
if (stillUsed.length) {
  console.error(`Οι κλάσεις χρησιμοποιούνται ακόμη, δεν αφαιρώ τίποτα: ${stillUsed.join(', ')}`);
  process.exit(1);
}

const css = await fs.readFile(cssPath, 'utf8');
const isDead = (selector) => DEAD_CLASSES.some((name) => selector.includes(`.${name}`));

// Απλός brace-aware περιπατητής: κρατά τα @media (μπορεί να περιέχουν ζωντανούς
// κανόνες) και κόβει μόνο κανόνες φύλλα.
function strip(block) {
  let output = '';
  let index = 0;

  while (index < block.length) {
    const braceIndex = block.indexOf('{', index);
    if (braceIndex === -1) {
      output += block.slice(index);
      break;
    }

    const prelude = block.slice(index, braceIndex);
    let depth = 1;
    let cursor = braceIndex + 1;
    while (cursor < block.length && depth > 0) {
      if (block[cursor] === '{') depth += 1;
      else if (block[cursor] === '}') depth -= 1;
      cursor += 1;
    }

    const body = block.slice(braceIndex + 1, cursor - 1);
    const trimmedPrelude = prelude.trim();

    if (trimmedPrelude.startsWith('@media') || trimmedPrelude.startsWith('@supports')) {
      const strippedBody = strip(body);
      if (strippedBody.trim()) output += `${prelude}{${strippedBody}}`;
    } else {
      const selectors = trimmedPrelude.split(',').map((one) => one.trim()).filter(Boolean);
      const alive = selectors.filter((one) => !isDead(one));

      if (!selectors.length) {
        output += `${prelude}{${body}}`;
      } else if (alive.length === selectors.length) {
        output += `${prelude}{${body}}`;
      } else if (alive.length) {
        // Μεικτή λίστα: κρατάμε μόνο τους ζωντανούς selectors.
        const indent = prelude.match(/^\s*/)?.[0] ?? '';
        output += `${indent}${alive.join(`,\n${indent}`)} {${body}}`;
      }
    }

    index = cursor;
  }

  return output;
}

const result = strip(css).replace(/\n{3,}/g, '\n\n');
const removedLines = css.split('\n').length - result.split('\n').length;

console.log(`site.css: ${css.split('\n').length} → ${result.split('\n').length} γραμμές (-${removedLines})`);
console.log(`bytes: ${css.length} → ${result.length} (-${css.length - result.length})`);

if (checkOnly) {
  console.log('--check: δεν γράφτηκε τίποτα.');
} else {
  await fs.writeFile(cssPath, result);
  console.log('Το site.css ενημερώθηκε.');
}
