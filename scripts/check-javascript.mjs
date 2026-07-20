import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const jsDir = 'assets/js';
const files = readdirSync(jsDir, { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
  .map((entry) => join(jsDir, entry.name))
  .sort();

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}

console.log(`JavaScript syntax checks passed for ${files.length} files.`);
