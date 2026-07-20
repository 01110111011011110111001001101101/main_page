import js from '@eslint/js';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const JS_DIR = 'assets/js';

function collectBrowserScriptGlobals() {
  if (!existsSync(JS_DIR)) return {};

  const globals = {};
  const declarationPattern = /^(?:(?:async\s+)?function\s+([A-Za-z_$][\w$]*)|(?:const|let|var)\s+([A-Za-z_$][\w$]*))/gm;

  for (const entry of readdirSync(JS_DIR, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.js')) continue;

    const source = readFileSync(join(JS_DIR, entry.name), 'utf8');
    for (const match of source.matchAll(declarationPattern)) {
      globals[match[1] || match[2]] = 'writable';
    }
  }

  return globals;
}

const browserGlobals = {
  ...collectBrowserScriptGlobals(),
  AbortController: 'readonly',
  ArrayBuffer: 'readonly',
  Blob: 'readonly',
  ClipboardItem: 'readonly',
  CustomEvent: 'readonly',
  DOMParser: 'readonly',
  Event: 'readonly',
  FileReader: 'readonly',
  FormData: 'readonly',
  HTMLElement: 'readonly',
  Image: 'readonly',
  IntersectionObserver: 'readonly',
  MutationObserver: 'readonly',
  ResizeObserver: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  alert: 'readonly',
  atob: 'readonly',
  btoa: 'readonly',
  cancelAnimationFrame: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  crypto: 'readonly',
  document: 'readonly',
  fetch: 'readonly',
  getComputedStyle: 'readonly',
  history: 'readonly',
  localStorage: 'readonly',
  location: 'readonly',
  navigator: 'readonly',
  performance: 'readonly',
  requestAnimationFrame: 'readonly',
  sessionStorage: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  window: 'readonly',
};

const nodeGlobals = {
  AbortController: 'readonly',
  Buffer: 'readonly',
  URL: 'readonly',
  URLSearchParams: 'readonly',
  clearInterval: 'readonly',
  clearTimeout: 'readonly',
  console: 'readonly',
  fetch: 'readonly',
  global: 'readonly',
  globalThis: 'readonly',
  document: 'readonly',
  process: 'readonly',
  setInterval: 'readonly',
  setTimeout: 'readonly',
  window: 'readonly',
};

const sharedRules = {
  ...js.configs.recommended.rules,
  'no-undef': 'warn',
  'no-unused-vars': ['warn', {
    args: 'after-used',
    argsIgnorePattern: '^_',
    caughtErrors: 'none',
    vars: 'all',
    varsIgnorePattern: '^_|^[A-Z0-9_]+$',
  }],
  'array-callback-return': 'warn',
  'eqeqeq': ['warn', 'smart'],
  'no-console': 'off',
  'no-empty': ['warn', { allowEmptyCatch: true }],
  'no-implicit-globals': 'off',
  'no-redeclare': 'off',
  'no-self-assign': 'warn',
  'no-unreachable': 'warn',
  'no-useless-catch': 'warn',
};

export default [
  {
    ignores: [
      '.git/**',
      'node_modules/**',
      'tools/reports/**',
      'assets/css/tailwind.css',
      'package-lock.json',
    ],
  },
  {
    files: ['assets/js/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'script',
      globals: browserGlobals,
    },
    rules: sharedRules,
  },
  {
    files: ['scripts/**/*.mjs', 'tools/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: nodeGlobals,
    },
    rules: sharedRules,
  },
];
