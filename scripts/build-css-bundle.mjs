import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'lightningcss';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cssDirectory = path.join(root, 'assets/css');
const indexPath = path.join(root, 'index.html');
const sources = ['tailwind.css', 'site.css'];

const sourceCss = (await Promise.all(sources.map((file) => fs.readFile(path.join(cssDirectory, file), 'utf8')))).join('\n');
const { code } = transform({ filename: 'bundle.css', code: Buffer.from(sourceCss), minify: true });
const hash = createHash('sha256').update(code).digest('hex').slice(0, 8);
const outputName = `bundle.${hash}.min.css`;

for (const file of await fs.readdir(cssDirectory)) {
  if (/^bundle\.[a-f0-9]{8}\.min\.css$/.test(file) && file !== outputName) {
    await fs.rm(path.join(cssDirectory, file));
  }
}
await fs.writeFile(path.join(cssDirectory, outputName), code);

const criticalSource = await fs.readFile(path.join(cssDirectory, 'critical.css'));
const criticalCode = transform({ filename: 'critical.css', code: criticalSource, minify: true }).code.toString();
const criticalBlock = `<!-- critical-css:start -->\n  <style id="critical-css">${criticalCode}</style>\n  <!-- critical-css:end -->`;
const appCssBlock = `<!-- app-css:start -->\n  <link rel="preload" href="assets/css/${outputName}" as="style" onload="this.onload=null;this.rel='stylesheet'">\n  <noscript><link rel="stylesheet" href="assets/css/${outputName}"></noscript>\n  <!-- app-css:end -->`;

let html = await fs.readFile(indexPath, 'utf8');
html = html.replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.googleapis\.com">/g, '');
html = html.replace(/\s*<link rel="preconnect" href="https:\/\/fonts\.gstatic\.com" crossorigin>/g, '');
html = html.replace(/\s*<link href="https:\/\/fonts\.googleapis\.com\/[^"]+" rel="stylesheet">/g, '');
html = html.replace(/\s*<!-- critical-css:start -->[\s\S]*?<!-- critical-css:end -->/g, '');
html = html.replace(/\s*<!-- app-css:start -->[\s\S]*?<!-- app-css:end -->/g, '');
html = html.replace(/\s*<link\s+rel="stylesheet"\s+href="assets\/css\/bundle\.[a-f0-9]{8}\.min\.css">/g, '');
html = html.replace(/\s*<link\s+rel="stylesheet"\s+href="assets\/css\/(?:tailwind|site)\.css(?:\?[^"]*)?">/g, '');
const fontPreload = '<link rel="preload" href="assets/fonts/space-grotesk-latin.woff2" as="font" type="font/woff2" crossorigin>';
html = html.replace(/\s*<link rel="preload" href="assets\/fonts\/(?:inter-greek|space-grotesk-latin)\.woff2(?:\?v=[a-f0-9]{8})?" as="font" type="font\/woff2" crossorigin>/g, '');
html = html.replace(/\n\s*<script type="application\/ld\+json">/, `\n  ${fontPreload}\n  ${criticalBlock}\n  ${appCssBlock}\n\n  <script type="application/ld+json">`);
await fs.writeFile(indexPath, html);

console.log(`Built assets/css/${outputName} (${code.length} bytes) and inlined critical CSS (${Buffer.byteLength(criticalCode)} bytes).`);
