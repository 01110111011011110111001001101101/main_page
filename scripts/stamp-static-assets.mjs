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

async function stampSharedAssets(content) {
  const pattern = /assets\/(?:images\/[a-zA-Z0-9._-]+\.(?:png|webp)|icons\/icons\.svg|fonts\/[a-zA-Z0-9._-]+\.woff2)(?:\?v=[a-f0-9]{8})?(?:#[a-zA-Z0-9_-]+)?/g;
  const matches = [...new Set(content.match(pattern) || [])];
  for (const match of matches) {
    const [urlPart, fragment] = match.split('#');
    const assetPath = urlPart.replace(/\?v=[a-f0-9]{8}$/, '');
    const hash = await contentHash(assetPath);
    const stamped = `${assetPath}?v=${hash}${fragment ? `#${fragment}` : ''}`;
    content = content.split(match).join(stamped);
  }
  return content;
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

console.log(`Stamped ${scriptMatches.length} JavaScript files and critical static assets.`);
