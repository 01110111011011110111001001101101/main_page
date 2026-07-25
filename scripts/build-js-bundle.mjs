import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const jsDirectory = path.join(root, 'assets/js');
const indexPath = path.join(root, 'index.html');

/*
 * Η ΣΕΙΡΑ ΕΧΕΙ ΣΗΜΑΣΙΑ.
 * Τα αρχεία δεν είναι ES modules — μοιράζονται το ίδιο global scope και
 * εξαρτώνται από τη σειρά εκτέλεσης (π.χ. το config.js δηλώνει το κοινό state
 * που πειράζουν τα ui.js/offers.js). Αν προσθέσεις αρχείο, βάλ' το εδώ.
 *
 * Τα lazy scripts (wizard, pdf-preview, office-closure) ΔΕΝ μπαίνουν εδώ:
 * φορτώνονται κατ' απαίτηση μέσω του #lazyScripts μητρώου.
 */
const EAGER_SCRIPTS = [
  'config.js',
  'scroll-coordinator.js',
  'clipboard.js',
  'image-preview.js',
  'ui.js',
  'modals.js',
  'offers.js',
  'offer-renderer.js',
  'tracking.js',
  'office-closure.config.js',
  'main.js',
];

const sources = await Promise.all(
  EAGER_SCRIPTS.map(async (file) => {
    const filePath = path.join(jsDirectory, file);
    return `/* ${file} */\n${await fs.readFile(filePath, 'utf8')}`;
  }),
);

/*
 * minifyIdentifiers: false είναι σκόπιμο. Τα lazy scripts καλούν globals που
 * ορίζονται εδώ (trackEvent, showToast, closeModal, lockPageScroll,
 * openImagePreview, writeClipboard, closeSidebarInstantly...). Αν επιτρέψουμε
 * μετονομασία, σπάνε σιωπηλά.
 */
const { code } = await transform(sources.join('\n;\n'), {
  minifyWhitespace: true,
  minifySyntax: true,
  minifyIdentifiers: false,
  legalComments: 'none',
  target: 'es2020',
});

const hash = createHash('sha256').update(code).digest('hex').slice(0, 8);
const outputName = `app.${hash}.min.js`;

for (const file of await fs.readdir(jsDirectory)) {
  if (/^app\.[a-f0-9]{8}\.min\.js$/.test(file) && file !== outputName) {
    await fs.rm(path.join(jsDirectory, file));
  }
}

await fs.writeFile(path.join(jsDirectory, outputName), code);

const block = `<!-- app-js:start -->\n<script defer src="assets/js/${outputName}"></script>\n<!-- app-js:end -->`;
let html = await fs.readFile(indexPath, 'utf8');

if (!/<!-- app-js:start -->[\s\S]*?<!-- app-js:end -->/.test(html)) {
  throw new Error('Λείπουν τα markers <!-- app-js:start --> / <!-- app-js:end --> από το index.html');
}

html = html.replace(/<!-- app-js:start -->[\s\S]*?<!-- app-js:end -->/, block);
await fs.writeFile(indexPath, html);

const originalBytes = sources.reduce((total, source) => total + Buffer.byteLength(source), 0);
console.log(
  `Built assets/js/${outputName} (${code.length} bytes από ${originalBytes}, ` +
  `${EAGER_SCRIPTS.length} αρχεία σε 1 request).`,
);
