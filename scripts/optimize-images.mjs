import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const images = path.join(root, 'assets/images');
const source = path.join(images, 'logo-source.png');
const fonts = path.join(root, 'assets/fonts');

await fs.mkdir(images, { recursive: true });
await fs.mkdir(fonts, { recursive: true });
await sharp(source).resize(32, 32, { fit: 'contain', background: '#ffffff' }).png({ compressionLevel: 9 }).toFile(path.join(images, 'favicon-32.png'));
await sharp(source)
  .resize(192, 105, { fit: 'contain', background: '#ffffff' })
  .webp({ quality: 82 })
  .toFile(path.join(images, 'brand-128.webp'));
await sharp(source)
  .resize(1040, 470, { fit: 'contain', background: '#ffffff' })
  .extend({ top: 80, bottom: 80, left: 80, right: 80, background: '#ffffff' })
  .webp({ quality: 84 })
  .toFile(path.join(images, 'social-share.webp'));
await fs.copyFile(path.join(root, 'node_modules/@fontsource-variable/inter/files/inter-greek-wght-normal.woff2'), path.join(fonts, 'inter-greek.woff2'));
await fs.copyFile(path.join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'), path.join(fonts, 'inter-latin.woff2'));
await fs.copyFile(path.join(root, 'node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2'), path.join(fonts, 'space-grotesk-latin.woff2'));

console.log('Optimized images and copied self-hosted fonts.');
