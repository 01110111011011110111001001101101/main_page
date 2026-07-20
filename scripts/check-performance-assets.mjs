import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { transform } from 'lightningcss';
import { gzipSync } from 'node:zlib';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const limits = { critical: 10 * 1024, bundle: 60 * 1024, image: 100 * 1024, fonts: 150 * 1024 };
const criticalSource = await fs.readFile(path.join(root, 'assets/css/critical.css'));
const criticalBytes = transform({ filename: 'critical.css', code: criticalSource, minify: true }).code.length;
const cssFiles = (await fs.readdir(path.join(root, 'assets/css'))).filter((file) => /^bundle\.[a-f0-9]{8}\.min\.css$/.test(file));
if (cssFiles.length !== 1) throw new Error(`Expected one CSS bundle, found ${cssFiles.length}.`);
const bundleRaw = await fs.readFile(path.join(root, 'assets/css', cssFiles[0]));
const bundleBytes = gzipSync(bundleRaw, { level: 9 }).length;
const imageBytes = (await fs.stat(path.join(root, 'assets/images/brand-128.webp'))).size;
const fontDirectory = path.join(root, 'assets/fonts');
const fontBytes = (await Promise.all((await fs.readdir(fontDirectory)).filter((file) => file.endsWith('.woff2')).map(async (file) => (await fs.stat(path.join(fontDirectory, file))).size))).reduce((sum, size) => sum + size, 0);

const measurements = { critical: criticalBytes, bundle: bundleBytes, image: imageBytes, fonts: fontBytes };
for (const [name, bytes] of Object.entries(measurements)) {
  if (bytes > limits[name]) throw new Error(`${name} performance budget exceeded: ${bytes} > ${limits[name]} bytes.`);
}
console.log(`Performance assets passed: critical=${criticalBytes}, bundle=${bundleBytes}, image=${imageBytes}, fonts=${fontBytes} bytes.`);
