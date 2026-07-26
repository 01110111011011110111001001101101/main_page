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
/*
 * Το κεφάλι του hero. Η πηγή είναι σκούρο μπλε πάνω σε λευκό χωρίς διαφάνεια,
 * οπότε μετατρέπουμε το λευκό σε διάφανο για να δουλεύει πάνω σε οποιοδήποτε
 * φόντο. Το κατώφλι 235 πιάνει το καθαρό λευκό, η ζώνη 170-235 δίνει ήπιο
 * feather ώστε να μη γίνει πριονωτό το περίγραμμα.
 */
const headSource = path.join(images, 'head-source.png');
const { data: headPixels, info: headInfo } = await sharp(headSource)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

for (let index = 0; index < headPixels.length; index += 4) {
  const lightness = (headPixels[index] + headPixels[index + 1] + headPixels[index + 2]) / 3;
  if (lightness > 235) headPixels[index + 3] = 0;
  else if (lightness > 170) headPixels[index + 3] = Math.round(((235 - lightness) / 65) * 255);
}

const headTransparent = await sharp(headPixels, {
  raw: { width: headInfo.width, height: headInfo.height, channels: 4 },
}).png().toBuffer();

// 320px = πάνω από διπλάσιο του μέγιστου πλάτους προβολής (150px στο κινητό,
// 128px στον υπολογιστή). Στα 420px η εικόνα ήταν 3x μεγαλύτερη από ό,τι χρειάζεται.
await sharp(headTransparent)
  .trim({ threshold: 10 })
  .resize({ width: 320, withoutEnlargement: true })
  .webp({ quality: 82, alphaQuality: 100, effort: 6 })
  .toFile(path.join(images, 'hero-head.webp'));

await fs.copyFile(path.join(root, 'node_modules/@fontsource-variable/inter/files/inter-greek-wght-normal.woff2'), path.join(fonts, 'inter-greek.woff2'));
await fs.copyFile(path.join(root, 'node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2'), path.join(fonts, 'inter-latin.woff2'));

console.log('Optimized images and copied self-hosted fonts.');
