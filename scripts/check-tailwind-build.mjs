import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const tempDir = mkdtempSync(join(tmpdir(), 'activesite2-tailwind-check-'));
const outputFile = join(tempDir, 'tailwind.css');
const tailwindBinary = resolve('node_modules/.bin/tailwindcss');

try {
  execFileSync(
    tailwindBinary,
    ['-i', './assets/css/tailwind.input.css', '-o', outputFile, '--minify'],
    { stdio: 'inherit' }
  );
  console.log('Tailwind build check passed.');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
