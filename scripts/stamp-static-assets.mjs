import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(root, 'index.html');
const modalDirectory = path.join(root, 'assets/modals');
const jsDirectory = path.join(root, 'assets/js');
const hashCache = new Map();

async function contentHash(assetPath) {
  const normalized = assetPath.replace(/^\//, '');
  if (!hashCache.has(normalized)) {
    const content = await fs.readFile(path.join(root, normalized));
    hashCache.set(normalized, createHash('sha256').update(content).digest('hex').slice(0, 8));
  }
  return hashCache.get(normalized);
}

/*
 * ΠΡΟΣΟΧΗ: παλιότερα αυτή η συνάρτηση έκανε content.split(match).join(stamped)
 * για κάθε μοναδικό match. Αν το ίδιο αρχείο εμφανιζόταν μία φορά με ?v= και
 * μία χωρίς, το ασφράγιστο match ταίριαζε και ΜΕΣΑ στο ήδη σφραγισμένο URL και
 * έβγαινε "hero-head.webp?v=abc?v=abc". Τώρα γίνεται μία μόνο διέλευση με
 * callback, οπότε δεν υπάρχουν επικαλυπτόμενες αντικαταστάσεις.
 */
async function stampSharedAssets(content) {
  const pattern = /assets\/(?:images\/[a-zA-Z0-9._-]+\.(?:png|webp)|icons\/icons\.svg|fonts\/[a-zA-Z0-9._-]+\.woff2)(?:\?v=[a-f0-9]{8})*(?:#[a-zA-Z0-9_-]+)?/g;
  const matches = [...new Set(content.match(pattern) || [])];

  const replacements = new Map();
  for (const match of matches) {
    const [urlPart, fragment] = match.split('#');
    const assetPath = urlPart.replace(/(?:\?v=[a-f0-9]{8})+$/, '');
    const hash = await contentHash(assetPath);
    replacements.set(match, `${assetPath}?v=${hash}${fragment ? `#${fragment}` : ''}`);
  }

  return content.replace(pattern, (match) => replacements.get(match) ?? match);
}

for (const file of await fs.readdir(jsDirectory)) {
  if (!file.endsWith('.js')) continue;
  const filePath = path.join(jsDirectory, file);
  const source = await fs.readFile(filePath, 'utf8');
  const stamped = await stampSharedAssets(source);
  if (stamped !== source) await fs.writeFile(filePath, stamped);
}

for (const file of await fs.readdir(modalDirectory)) {
  if (!file.endsWith('.html')) continue;
  const filePath = path.join(modalDirectory, file);
  const source = await fs.readFile(filePath, 'utf8');
  const stamped = await stampSharedAssets(source);
  if (stamped !== source) await fs.writeFile(filePath, stamped);
}

let indexHtml = await fs.readFile(indexPath, 'utf8');
indexHtml = await stampSharedAssets(indexHtml);
const scriptPattern = /(<script\b[^>]*\bsrc=")(?<src>assets\/js\/(?<file>[^"?#]+\.js))(?:\?v=[^"#]*)?(?<suffix>#[^"]*)?("[^>]*><\/script>)/g;
const scriptMatches = [...indexHtml.matchAll(scriptPattern)];
for (const match of scriptMatches) {
  const hash = await contentHash(match.groups.src);
  const replacement = `${match[1]}${match.groups.src}?v=${hash}${match.groups.suffix || ''}${match[5]}`;
  indexHtml = indexHtml.replace(match[0], replacement);
}
// Τα lazy scripts δεν έχουν <script> tag, ζουν στο JSON μητρώο #lazyScripts.
// Χρειάζονται κι αυτά ?v=<hash>, γιατί το /assets/js/* σερβίρεται ως immutable.
const lazyBlockPattern = /<script type="application\/json" id="lazyScripts">[\s\S]*?<\/script>/;
const lazyBlockMatch = indexHtml.match(lazyBlockPattern);
let lazyCount = 0;

if (lazyBlockMatch) {
  let block = lazyBlockMatch[0];
  const references = [...new Set(block.match(/assets\/js\/[a-zA-Z0-9._-]+\.js(?:\?v=[a-f0-9]{8})?/g) || [])]
    .sort((a, b) => b.length - a.length);

  for (const reference of references) {
    const assetPath = reference.replace(/\?v=[a-f0-9]{8}$/, '');
    const hash = await contentHash(assetPath);
    block = block.split(reference).join(`${assetPath}?v=${hash}`);
    lazyCount += 1;
  }

  indexHtml = indexHtml.replace(lazyBlockMatch[0], block);
}

// Find the generated CSS bundle and update index.html
const cssDirectory = path.join(root, 'assets/css');

const cssBundle = (await fs.readdir(cssDirectory))
  .find(file => /^bundle\.[a-f0-9]{8}\.min\.css$/i.test(file));

if (!cssBundle) {
  throw new Error('CSS bundle not found.');
}

indexHtml = indexHtml.replace(
  /assets\/css\/bundle\.[a-f0-9]{8}\.min\.css/g,
  `assets/css/${cssBundle}`
);
await fs.writeFile(indexPath, indexHtml);

console.log(`Stamped ${scriptMatches.length} JavaScript files, ${lazyCount} lazy scripts and critical static assets.`);
