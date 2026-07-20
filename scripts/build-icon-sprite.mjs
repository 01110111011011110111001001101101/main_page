import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fas } from '@fortawesome/free-solid-svg-icons';
import { far } from '@fortawesome/free-regular-svg-icons';
import { fab } from '@fortawesome/free-brands-svg-icons';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function listFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(target) : [target];
  }))).flat();
}

const inputFiles = [
  path.join(root, 'index.html'),
  ...(await listFiles(path.join(root, 'assets/js'))),
  ...(await listFiles(path.join(root, 'assets/data'))),
  ...(await listFiles(path.join(root, 'assets/modals'))),
].filter((file) => /\.(?:html|js|json)$/.test(file));
const input = (await Promise.all(inputFiles.map((file) => fs.readFile(file, 'utf8')))).join('\n');
const iconNames = new Set([
  ...[...input.matchAll(/data-icon=["']([a-z0-9-]+)["']/g)].map((match) => match[1]),
  ...[...input.matchAll(/createIcon\(["']([a-z0-9-]+)["']/g)].map((match) => match[1]),
  ...[...input.matchAll(/icon:\s*["']([a-z0-9-]+)["']/g)].map((match) => match[1]),
]);
const icons = new Map();

for (const name of iconNames) {
  const collection = name === 'viber' ? fab : name === 'copy' ? far : fas;
  const definition = Object.values(collection).find((candidate) => candidate?.iconName === name);
  if (!definition) throw new Error(`Missing Font Awesome definition: ${name}`);
  icons.set(name, definition);
}

const symbols = [...icons.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, definition]) => {
  const [width, height, , , paths] = definition.icon;
  const pathMarkup = Array.isArray(paths)
    ? paths.map((data) => `<path d="${data}"/>`).join('')
    : `<path d="${paths}"/>`;
  return `<symbol id="icon-${name}" viewBox="0 0 ${width} ${height}">${pathMarkup}</symbol>`;
});

await fs.mkdir(path.join(root, 'assets/icons'), { recursive: true });
await fs.writeFile(
  path.join(root, 'assets/icons/icons.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg"><defs>${symbols.join('')}</defs></svg>\n`,
);
console.log(`Built ${icons.size} SVG symbols.`);
