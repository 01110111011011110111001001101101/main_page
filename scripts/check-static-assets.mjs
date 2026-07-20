import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function listFiles(directory, extension) {
    return readdirSync(resolve(projectRoot, directory), { withFileTypes: true })
        .filter((entry) => entry.isFile() && extname(entry.name) === extension)
        .map((entry) => `${directory}/${entry.name}`)
        .filter((file) => !/^assets\/css\/bundle\.[a-f0-9]{8}\.min\.css$/.test(file));
}

const sourceFiles = [
    'index.html',
    ...listFiles('assets/css', '.css'),
    ...listFiles('assets/modals', '.html'),
    ...listFiles('assets/js', '.js'),
    'assets/data/offers.json',
];

const indexHtml = readFileSync(resolve(projectRoot, 'index.html'), 'utf8');
if (/onclick\s*=/.test(indexHtml)) failures.push('index.html still contains inline onclick handlers.');
if (indexHtml.includes('cdn.tailwindcss.com')) failures.push('index.html still loads the Tailwind CDN.');
if (/energyModal|Enerwave/.test(indexHtml)) failures.push('Removed electricity offer references are still present.');

function normalizeReference(rawValue) {
    return rawValue.trim().replace(/^['"]|['"]$/g, '').split('#')[0].split('?')[0];
}

function isIgnoredReference(value) {
    return !value || /^(?:#|https?:|mailto:|tel:|viber:|javascript:|data:)/i.test(value);
}

function assertExists(rawValue, sourceFile) {
    const value = normalizeReference(rawValue);
    if (isIgnoredReference(value)) return;

    const baseDirectory = sourceFile.startsWith('assets/css/') && !value.startsWith('assets/')
        ? resolve(projectRoot, dirname(sourceFile))
        : projectRoot;
    const absolutePath = value.startsWith('/')
        ? resolve(projectRoot, value.slice(1))
        : resolve(baseDirectory, value);

    if (!existsSync(absolutePath)) {
        failures.push(`${sourceFile} references missing asset: ${value}`);
    }
}

function checkTextReferences(content, sourceFile) {
    const attributePattern = /\b(?:src|href|data-src|data-preview-src)\s*=\s*["']([^"']+)["']/g;
    const cssUrlPattern = /url\(\s*([^)]+?)\s*\)/g;
    const quotedAssetPattern = /["']((?:\.\.\/|\.\/)?assets\/[a-z0-9_./-]+(?:\?[a-z0-9_=&.-]+)?(?:#[a-z0-9_-]+)?)["']/gi;

    for (const match of content.matchAll(attributePattern)) assertExists(match[1], sourceFile);
    for (const match of content.matchAll(cssUrlPattern)) assertExists(match[1], sourceFile);
    for (const match of content.matchAll(quotedAssetPattern)) assertExists(match[1], sourceFile);
}

for (const sourceFile of sourceFiles.filter((file) => file !== 'assets/data/offers.json')) {
    checkTextReferences(readFileSync(resolve(projectRoot, sourceFile), 'utf8'), sourceFile);
}

const offers = JSON.parse(readFileSync(resolve(projectRoot, 'assets/data/offers.json'), 'utf8'));
function checkOfferReferences(value) {
    if (Array.isArray(value)) {
        value.forEach(checkOfferReferences);
        return;
    }
    if (!value || typeof value !== 'object') return;
    for (const [key, nestedValue] of Object.entries(value)) {
        if ((key === 'href' || key === 'previewSrc') && typeof nestedValue === 'string') {
            assertExists(nestedValue, 'assets/data/offers.json');
        } else {
            checkOfferReferences(nestedValue);
        }
    }
}
checkOfferReferences(offers);

if (failures.length) {
    console.error([...new Set(failures)].map((failure) => `- ${failure}`).join('\n'));
    process.exit(1);
}

console.log(`Static asset checks passed across ${sourceFiles.length} source files.`);
