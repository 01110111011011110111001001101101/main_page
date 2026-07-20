import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import {
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
} from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPORT_DIR = resolve(PROJECT_ROOT, 'tools/reports');
const REPORT_PATH = resolve(REPORT_DIR, 'dead-code-audit.md');
const COVERAGE_PATH = resolve(REPORT_DIR, 'coverage-summary.json');
const COVERAGE_DETAILS_PATH = resolve(REPORT_DIR, 'coverage-details.json');
const COVERAGE_ONLY = process.argv.includes('--coverage-only');
const BASE_URL = process.env.AUDIT_BASE_URL || '';

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 900 },
  { name: 'mobile-360', width: 360, height: 820 },
  { name: 'mobile-390', width: 390, height: 820 },
  { name: 'mobile-430', width: 430, height: 820 },
];

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'tools/reports']);
const CONTACT_SAFE_PREFIXES = ['tel:', 'mailto:', 'https://invite.viber.com/'];

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.xml': 'application/xml; charset=utf-8',
};

function toPosixPath(filePath) {
  return filePath.split('\\').join('/');
}

function projectPath(filePath) {
  return toPosixPath(relative(PROJECT_ROOT, filePath));
}

function ensureReportDir() {
  mkdirSync(REPORT_DIR, { recursive: true });
}

function logProgress(message) {
  if (process.env.AUDIT_SILENT === '1') return;
  console.log(`[audit] ${message}`);
}

function readText(filePath) {
  return readFileSync(resolve(PROJECT_ROOT, filePath), 'utf8');
}

function listFiles(dir = PROJECT_ROOT, output = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, entry.name);
    const rel = projectPath(absolute);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(rel) || IGNORE_DIRS.has(entry.name)) continue;
      listFiles(absolute, output);
      continue;
    }

    if (entry.isFile()) output.push(rel);
  }

  return output.sort();
}

function sourceFilesByExtension(extension) {
  return listFiles().filter((file) => file.endsWith(extension));
}

function startStaticServer() {
  return new Promise((resolveStart, rejectStart) => {
    const server = createServer((request, response) => {
      try {
        const requestUrl = new URL(request.url || '/', 'http://127.0.0.1');
        const decodedPath = decodeURIComponent(requestUrl.pathname);
        const requestPath = decodedPath === '/' ? '/index.html' : decodedPath;
        const absolutePath = resolve(PROJECT_ROOT, `.${requestPath}`);
        const rel = relative(PROJECT_ROOT, absolutePath);

        if (rel.startsWith('..') || isAbsolute(rel)) {
          response.writeHead(403);
          response.end('Forbidden');
          return;
        }

        let finalPath = absolutePath;
        if (existsSync(finalPath) && statSync(finalPath).isDirectory()) {
          finalPath = join(finalPath, 'index.html');
        }

        if (!existsSync(finalPath) || !statSync(finalPath).isFile()) {
          response.writeHead(404);
          response.end('Not found');
          return;
        }

        response.writeHead(200, {
          'Cache-Control': 'no-store',
          'Content-Type': CONTENT_TYPES[extname(finalPath).toLowerCase()] || 'application/octet-stream',
        });
        response.end(readFileSync(finalPath));
      } catch (error) {
        response.writeHead(500);
        response.end(error instanceof Error ? error.message : 'Server error');
      }
    });

    server.on('error', rejectStart);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        rejectStart(new Error('Could not determine local static server port.'));
        return;
      }

      resolveStart({
        close: () => new Promise((resolveClose) => server.close(resolveClose)),
        url: `http://127.0.0.1:${address.port}/index.html`,
      });
    });
  });
}

function mergeRanges(ranges) {
  const sorted = ranges
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (!last || range.start > last.end) {
      merged.push({ ...range });
    } else {
      last.end = Math.max(last.end, range.end);
    }
  }

  return merged;
}

function normalizeCoverageRanges(entry) {
  if (Array.isArray(entry.ranges)) {
    return entry.ranges.map((range) => ({
      count: range.count,
      end: range.end ?? range.endOffset,
      start: range.start ?? range.startOffset,
    }));
  }

  if (Array.isArray(entry.functions)) {
    return entry.functions.flatMap((fn) => (fn.ranges || []).map((range) => ({
      count: range.count,
      end: range.end ?? range.endOffset,
      start: range.start ?? range.startOffset,
    })));
  }

  return [];
}

function getCoverageSourceLength(entry, file) {
  const inlineSource = entry.text || entry.source || '';
  if (inlineSource) return inlineSource.length;

  const absolutePath = resolve(PROJECT_ROOT, file);
  if (existsSync(absolutePath)) return readFileSync(absolutePath, 'utf8').length;

  return 0;
}

function countUsedBytes(ranges, totalBytes) {
  if (!ranges.some((range) => Number.isFinite(range.count))) {
    return mergeRanges(ranges).reduce((sum, range) => sum + (range.end - range.start), 0);
  }

  const bytes = new Uint8Array(totalBytes);
  const sorted = ranges
    .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
    .sort((a, b) => (b.end - b.start) - (a.end - a.start));

  for (const range of sorted) {
    bytes.fill(range.count > 0 ? 1 : 0, Math.max(0, range.start), Math.min(totalBytes, range.end));
  }

  return bytes.reduce((sum, value) => sum + value, 0);
}

function normalizeCoverageUrl(url) {
  if (!url) return '';

  try {
    const parsed = new URL(url);
    if (!['127.0.0.1', 'localhost'].includes(parsed.hostname)) return '';
    return decodeURIComponent(parsed.pathname.replace(/^\//, '')).replace(/\\/g, '/');
  } catch (_) {
    if (url.startsWith('file://')) return projectPath(fileURLToPath(url));
    return '';
  }
}

function summarizeCoverage(entries) {
  const byFile = new Map();

  for (const entry of entries) {
    const file = normalizeCoverageUrl(entry.url);
    if (!file || file === 'index.html') continue;

    const existing = byFile.get(file) || {
      file,
      totalBytes: 0,
      ranges: [],
      url: entry.url,
    };

    existing.totalBytes = Math.max(existing.totalBytes, getCoverageSourceLength(entry, file));
    existing.ranges.push(...normalizeCoverageRanges(entry));
    byFile.set(file, existing);
  }

  return [...byFile.values()]
    .map((item) => {
      const usedBytes = countUsedBytes(item.ranges, item.totalBytes);
      const totalBytes = Math.max(item.totalBytes, usedBytes, 1);
      const unusedBytes = Math.max(0, totalBytes - usedBytes);
      return {
        file: item.file,
        totalBytes,
        usedBytes,
        unusedBytes,
        usedPercent: Number(((usedBytes / totalBytes) * 100).toFixed(2)),
        unusedPercent: Number(((unusedBytes / totalBytes) * 100).toFixed(2)),
      };
    })
    .sort((a, b) => b.unusedPercent - a.unusedPercent || a.file.localeCompare(b.file));
}

async function waitForUi(page, ms = 180) {
  await page.waitForTimeout(ms);
}

async function clickIfUsable(page, selector, label, options = {}) {
  const locator = page.locator(selector);
  const count = await locator.count().catch(() => 0);
  if (!count) return { label, status: 'missing', selector };

  const index = options.index || 0;
  const target = locator.nth(Math.min(index, count - 1));
  const visible = await target.isVisible().catch(() => false);
  if (!visible && !options.force) return { label, status: 'hidden', selector, count };

  await target.click({ timeout: options.timeout || 4000, force: Boolean(options.force) });
  await waitForUi(page, options.waitMs || 220);
  return { label, status: 'clicked', selector, count };
}

async function closeOpenLayers(page) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const closed = await page.evaluate(() => {
      const guideClose = document.querySelector('#activationGuideModal:not(.hidden) [data-activation-guide-close]');
      if (guideClose) {
        guideClose.click();
        return true;
      }

      const providerClose = document.querySelector('#activationProviderChoiceModal:not(.hidden) [data-modal-close], #activationProviderChoiceModal:not(.hidden) .activation-provider-choice__close');
      if (providerClose) {
        providerClose.click();
        return true;
      }

      const modalClose = document.querySelector('.modal-backdrop:not(.hidden) [data-modal-close]');
      if (modalClose) {
        modalClose.click();
        return true;
      }

      const menuButton = document.querySelector('#sidebarMenu:not(.-translate-x-full) [data-action="toggle-sidebar"]');
      if (menuButton) {
        menuButton.click();
        return true;
      }

      return false;
    });

    if (!closed) break;
    await waitForUi(page, 260);
  }
}

async function collectDomUsage(page, usage) {
  const snapshot = await page.evaluate(() => {
    const classes = new Set();
    const ids = new Set();
    const dataAttributes = new Set();

    document.querySelectorAll('*').forEach((element) => {
      element.classList.forEach((className) => classes.add(className));
      if (element.id) ids.add(element.id);
      [...element.attributes].forEach((attribute) => {
        if (attribute.name.startsWith('data-')) dataAttributes.add(attribute.name);
      });
    });

    return {
      classes: [...classes],
      dataAttributes: [...dataAttributes],
      ids: [...ids],
    };
  });

  snapshot.classes.forEach((className) => usage.classes.add(className));
  snapshot.ids.forEach((id) => usage.ids.add(id));
  snapshot.dataAttributes.forEach((attribute) => usage.dataAttributes.add(attribute));
}

async function readSafeContactLinks(page) {
  return page.evaluate((safePrefixes) => Array.from(document.querySelectorAll('a[href]'))
    .map((link) => link.getAttribute('href') || '')
    .filter((href) => safePrefixes.some((prefix) => href.startsWith(prefix)))
    .sort(), CONTACT_SAFE_PREFIXES);
}

async function revealOffers(page) {
  await clickIfUsable(page, '.police-hero__primary[href="#offers"], .top-desktop-nav a[href="#offers"]', 'hero/top offers');
  await waitForUi(page, 120);

  const stillHidden = await page.evaluate(() => Boolean(document.getElementById('offers')?.hidden));
  if (stillHidden) {
    await page.evaluate(() => {
      document.querySelector('.police-hero__primary[href="#offers"], .top-desktop-nav a[href="#offers"]')?.click();
    });
  }

  await page.waitForFunction(() => {
    const offers = document.getElementById('offers');
    return offers && !offers.hidden;
  }, { timeout: 5000 }).catch(() => {});
  await waitForUi(page, 300);
}

async function exerciseActivationGuide(page, result) {
  const guideVisible = await page.locator('#activationGuideModal:not(.hidden)').count().catch(() => 0);
  if (!guideVisible) {
    result.activationGuide = 'not-open';
    return;
  }

  const progressTexts = [];
  const readProgress = async () => {
    const text = await page.locator('#activationGuideModal [data-activation-progress]').textContent().catch(() => '');
    if (text) progressTexts.push(text.trim());
  };

  await readProgress();
  await clickIfUsable(page, '#activationGuideModal [data-activation-type="portability"]', 'activation portability');
  await clickIfUsable(page, '#activationGuideModal [data-activation-next]', 'activation next to docs');
  await readProgress();

  await clickIfUsable(page, '#activationGuideModal [data-preview-src]', 'activation document preview');
  await clickIfUsable(page, '#imagePreviewModal:not(.hidden) [data-modal-close="imagePreviewModal"]', 'close preview');

  await clickIfUsable(page, '#activationGuideModal [data-activation-next]', 'activation next to payment');
  await readProgress();
  await clickIfUsable(page, '#activationGuideModal [data-activation-next]', 'activation next to sim');
  await readProgress();
  await clickIfUsable(page, '#activationGuideModal [data-activation-prev]', 'activation previous');
  await readProgress();

  result.activationGuide = {
    opened: true,
    progressTexts: [...new Set(progressTexts)],
  };
}

async function openActivationGuideFromProvider(page, provider, result) {
  await closeOpenLayers(page);
  await clickIfUsable(page, '.choice-card-guide, [data-modal-target="activationProviderChoiceModal"]', `open provider choice ${provider}`);
  await waitForUi(page, 300);
  await clickIfUsable(page, `#activationProviderChoiceModal [data-activation-provider="${provider}"]`, `choose ${provider}`);
  await waitForUi(page, 400);
  await exerciseActivationGuide(page, result);
  await closeOpenLayers(page);
}

async function exerciseMenu(page, result) {
  const startScroll = await page.evaluate(() => window.scrollY);
  await clickIfUsable(page, '.premium-menu-toggle.top-menu-button', 'open mobile menu');
  await waitForUi(page, 350);
  const beforeScroll = await page.evaluate(() => ({
    bodyLocked: document.body.classList.contains('scroll-locked'),
    htmlLocked: document.documentElement.classList.contains('scroll-locked'),
    menuOpen: !document.getElementById('sidebarMenu')?.classList.contains('-translate-x-full'),
    scrollY: window.scrollY,
  }));

  await page.mouse.wheel(0, 500).catch(() => {});
  await waitForUi(page, 200);
  const afterScroll = await page.evaluate(() => ({
    menuOpen: !document.getElementById('sidebarMenu')?.classList.contains('-translate-x-full'),
    scrollY: window.scrollY,
  }));

  result.mobileMenu = {
    opened: beforeScroll.menuOpen,
    scrollLocked: beforeScroll.bodyLocked || beforeScroll.htmlLocked,
    backgroundStayedStill: afterScroll.scrollY === beforeScroll.scrollY || afterScroll.scrollY === startScroll,
  };

  await page.evaluate(() => {
    document.querySelector('#sidebarMenu [data-sidebar-target="activationProviderChoiceModal"]')?.click();
  });
  await waitForUi(page, 350);
  const providerCentered = await page.evaluate(() => {
    const modal = document.getElementById('activationProviderChoiceModal');
    const panel = modal?.querySelector('.activation-provider-choice');
    const rect = panel?.getBoundingClientRect();
    return {
      visible: Boolean(modal && !modal.classList.contains('hidden')),
      centerDiff: rect ? Math.round((rect.top + rect.height / 2) - window.innerHeight / 2) : null,
      menuOpen: !document.getElementById('sidebarMenu')?.classList.contains('-translate-x-full'),
    };
  });
  result.providerChoiceFromMenu = providerCentered;
  await closeOpenLayers(page);
}

async function exerciseOfferCards(page, result, options = {}) {
  await revealOffers(page);
  await clickIfUsable(page, '.offer-filter-bar [data-category-filter="all"]', 'all filter');

  const cards = page.locator('[data-offer-card]');
  const cardCount = await cards.count().catch(() => 0);
  result.offerCardCount = cardCount;
  result.offerButtons = [];

  for (let index = 0; index < cardCount; index += 1) {
    const card = cards.nth(index);
    const offer = await card.getAttribute('data-offer').catch(() => `card-${index + 1}`);
    const action = card.locator('.offer-actions [data-activation-guide-open], .offer-actions [data-modal-target], .offer-actions .offer-primary-cta');
    const actionCount = await action.count().catch(() => 0);
    if (!actionCount) {
      result.offerButtons.push({ offer, status: 'no-primary-action' });
      continue;
    }

    await action.first().click({ timeout: 5000 });
    await waitForUi(page, 450);
    const openState = await page.evaluate(() => ({
      activationGuide: !document.getElementById('activationGuideModal')?.classList.contains('hidden'),
      providerChoice: !document.getElementById('activationProviderChoiceModal')?.classList.contains('hidden'),
      modals: Array.from(document.querySelectorAll('.modal-backdrop:not(.hidden)')).map((modal) => modal.id),
    }));

    if (openState.activationGuide && options.deepGuide) {
      await exerciseActivationGuide(page, result);
    }

    result.offerButtons.push({
      offer,
      opened: openState.activationGuide ? 'activation-guide' : openState.modals.filter(Boolean).join(', ') || 'none',
    });
    await closeOpenLayers(page);
    await revealOffers(page);
    await clickIfUsable(page, '.offer-filter-bar [data-category-filter="all"]', 'all filter after modal');
  }

  result.moreButtons = await page.locator('button:has-text("Περισσότερα"), .offer-secondary-cta').count().catch(() => 0);
}

async function exerciseFilters(page, result) {
  result.filters = {};

  for (const category of ['all', 'mobile', 'internet', 'tv']) {
    await clickIfUsable(page, `.offer-filter-bar [data-category-filter="${category}"]`, `filter ${category}`);
    await waitForUi(page, 180);
    result.filters[category] = await page.evaluate(() => Array.from(document.querySelectorAll('[data-offer-card]'))
      .filter((card) => !card.hidden)
      .map((card) => ({
        category: card.getAttribute('data-category'),
        offer: card.getAttribute('data-offer'),
      })));
  }
}

async function exerciseStaticModals(page, result) {
  result.staticModals = [];

  for (const modalId of ['privacyModal', 'cookiesModal', 'contactInfoModal', 'infoCoopModal']) {
    const clicked = await clickIfUsable(page, `[data-modal-target="${modalId}"]`, `open ${modalId}`);
    if (clicked.status !== 'clicked') {
      result.staticModals.push({ modalId, status: clicked.status });
      continue;
    }

    const visible = await page.locator(`#${modalId}:not(.hidden)`).count().catch(() => 0);
    await clickIfUsable(page, `#${modalId} [data-modal-close="${modalId}"]`, `close ${modalId}`);
    result.staticModals.push({ modalId, opened: Boolean(visible) });
  }
}

async function auditViewport(page, viewport, baseUrl, usage) {
  const detailed = viewport.name === 'desktop' || viewport.name === 'mobile-390';
  const result = {
    detailed,
    viewport: viewport.name,
    width: viewport.width,
    height: viewport.height,
  };

  await page.setViewportSize({ width: viewport.width, height: viewport.height });
  await page.goto(`${baseUrl}?audit=${encodeURIComponent(viewport.name)}-${Date.now()}`, { waitUntil: 'load' });
  await waitForUi(page, 450);

  result.initial = await page.evaluate(() => ({
    noHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
    offersHidden: Boolean(document.getElementById('offers')?.hidden),
    title: document.title,
  }));

  await collectDomUsage(page, usage);
  await exerciseMenu(page, result);
  await collectDomUsage(page, usage);

  await revealOffers(page);
  result.offersAfterHero = await page.evaluate(() => {
    const offers = document.getElementById('offers');
    const label = offers?.querySelector('.section-heading span');
    const heading = document.getElementById('offers-title');
    const header = document.querySelector('.site-top-nav');
    return {
      hidden: Boolean(offers?.hidden),
      labelTop: label?.getBoundingClientRect().top ?? null,
      headingTop: heading?.getBoundingClientRect().top ?? null,
      headerBottom: header?.getBoundingClientRect().bottom ?? null,
    };
  });

  await exerciseFilters(page, result);
  await collectDomUsage(page, usage);

  await clickIfUsable(page, '.choice-card-mobile', 'choice mobile');
  await clickIfUsable(page, '.choice-card-internet', 'choice internet');
  await clickIfUsable(page, '.choice-card-tv', 'choice tv');

  if (detailed) {
    await openActivationGuideFromProvider(page, 'vodafone', result);
    await openActivationGuideFromProvider(page, 'nova', result);
    await collectDomUsage(page, usage);

    await exerciseOfferCards(page, result, { deepGuide: false });
    await collectDomUsage(page, usage);

    if (viewport.name === 'desktop') {
      await exerciseStaticModals(page, result);
    }
  } else {
    result.offerCardCount = await page.locator('[data-offer-card]').count().catch(() => 0);
    result.moreButtons = await page.locator('button:has-text("Περισσότερα"), .offer-secondary-cta').count().catch(() => 0);
  }

  result.safeContactLinks = await readSafeContactLinks(page);

  result.final = await page.evaluate(() => ({
    noHorizontalScroll: document.documentElement.scrollWidth <= window.innerWidth + 1,
    openModals: Array.from(document.querySelectorAll('.modal-backdrop:not(.hidden)')).map((modal) => modal.id),
    menuOpen: !document.getElementById('sidebarMenu')?.classList.contains('-translate-x-full'),
  }));

  await closeOpenLayers(page);
  return result;
}

async function runBrowserCoverage() {
  const server = BASE_URL ? null : await startStaticServer();
  const baseUrl = BASE_URL || server.url;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  const consoleErrors = [];
  const usage = {
    classes: new Set(),
    dataAttributes: new Set(),
    ids: new Set(),
  };

  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    consoleErrors.push(error.message);
  });

  await context.addInitScript(() => {
    window.localStorage.setItem('cookieConsent', 'rejected');
  });

  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  await page.coverage.startCSSCoverage({ resetOnNavigation: false });

  const viewportResults = [];
  let jsCoverage;
  let cssCoverage;

  try {
    for (const viewport of VIEWPORTS) {
      logProgress(`checking ${viewport.name} (${viewport.width}x${viewport.height})`);
      viewportResults.push(await auditViewport(page, viewport, baseUrl, usage));
    }
  } finally {
    jsCoverage = await page.coverage.stopJSCoverage();
    cssCoverage = await page.coverage.stopCSSCoverage();
    await browser.close();
    if (server) await server.close();
  }

  return {
    baseUrl,
    consoleErrors: [...new Set(consoleErrors)],
    cssCoverage: summarizeCoverage(cssCoverage),
    jsCoverage: summarizeCoverage(jsCoverage),
    observedDom: {
      classes: [...usage.classes].sort(),
      dataAttributes: [...usage.dataAttributes].sort(),
      ids: [...usage.ids].sort(),
    },
    viewportResults,
  };
}

function runEslintJson() {
  const eslintBin = resolve(PROJECT_ROOT, 'node_modules/.bin/eslint');
  const executable = process.platform === 'win32' ? `${eslintBin}.cmd` : eslintBin;
  const args = ['assets/js', 'scripts', 'tools', 'eslint.config.mjs', '--format', 'json'];
  const result = spawnSync(executable, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20,
  });

  const output = result.stdout || '[]';
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch (error) {
    parsed = [{
      filePath: 'eslint',
      messages: [{
        ruleId: 'eslint-output',
        severity: 2,
        message: `Could not parse ESLint JSON output: ${error.message}`,
      }],
    }];
  }

  return {
    exitCode: result.status,
    stderr: result.stderr || '',
    results: parsed,
  };
}

function flattenEslintMessages(eslintResult) {
  return eslintResult.results.flatMap((fileResult) => {
    const file = fileResult.filePath ? projectPath(fileResult.filePath) : 'unknown';
    return (fileResult.messages || []).map((message) => ({
      file,
      line: message.line || 0,
      column: message.column || 0,
      message: message.message,
      ruleId: message.ruleId || 'unknown',
      severity: message.severity === 2 ? 'error' : 'warning',
    }));
  });
}

function extractReferencedAssets() {
  const htmlFiles = ['index.html', 'info.html'].filter((file) => existsSync(resolve(PROJECT_ROOT, file)));
  const referenced = new Set();
  const attrPattern = /\b(?:href|src|data-src|data-preview-src)=["']([^"']+)["']/g;

  for (const htmlFile of htmlFiles) {
    const html = readText(htmlFile);
    for (const match of html.matchAll(attrPattern)) {
      const raw = match[1];
      if (!raw || raw.startsWith('#') || raw.startsWith('http') || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('data:')) continue;
      referenced.add(raw.split('#')[0].split('?')[0]);
    }
  }

  return referenced;
}

function findLegacyFiles(allFiles) {
  const legacyPattern = /(?:^|[/._-])(?:bak|backup|copy|deprecated|legacy|old|orig|previous|tmp|unused)(?:[/._-]|$)/i;
  return allFiles.filter((file) => legacyPattern.test(file));
}

function extractCssSelectorHints(cssFiles, observedDom) {
  const htmlAndJsText = ['index.html', 'info.html', ...sourceFilesByExtension('.js')]
    .filter((file) => existsSync(resolve(PROJECT_ROOT, file)))
    .map((file) => readText(file))
    .join('\n');

  const observedClasses = new Set(observedDom.classes);
  const observedIds = new Set(observedDom.ids);
  const classHints = new Map();
  const idHints = new Map();

  for (const file of cssFiles) {
    if (file.endsWith('tailwind.css')) continue;
    const css = readText(file).replace(/\/\*[\s\S]*?\*\//g, '');
    const classPattern = /\.([_a-zA-Z-][_a-zA-Z0-9-]*)/g;
    const idPattern = /#([_a-zA-Z-][_a-zA-Z0-9-]*)/g;

    for (const match of css.matchAll(classPattern)) {
      const className = match[1];
      if (observedClasses.has(className) || htmlAndJsText.includes(className)) continue;
      if (/^(fa|fa-solid|fa-brands|is|has|js)-/.test(className)) continue;
      const files = classHints.get(className) || new Set();
      files.add(file);
      classHints.set(className, files);
    }

    for (const match of css.matchAll(idPattern)) {
      const id = match[1];
      if (/^[0-9a-fA-F]{3,8}$/.test(id)) continue;
      if (observedIds.has(id) || htmlAndJsText.includes(id)) continue;
      const files = idHints.get(id) || new Set();
      files.add(file);
      idHints.set(id, files);
    }
  }

  const toList = (map) => [...map.entries()]
    .map(([selector, files]) => ({ selector, files: [...files].sort() }))
    .sort((a, b) => a.selector.localeCompare(b.selector));

  return {
    classHints: toList(classHints).slice(0, 80),
    idHints: toList(idHints).slice(0, 40),
  };
}

function classifyUnreferencedFiles(jsFiles, cssFiles) {
  const referenced = extractReferencedAssets();
  const keepBecauseBuild = new Set(['assets/css/tailwind.input.css']);
  const sourceFiles = [...jsFiles, ...cssFiles];

  return sourceFiles
    .filter((file) => !referenced.has(file))
    .map((file) => {
      if (keepBecauseBuild.has(file)) {
        return { file, status: 'Keep because build source', reason: 'Tailwind input used by npm build/dev scripts.' };
      }

      if (/analytics|cookie|chatbot|nameday/i.test(file)) {
        return { file, status: 'Keep because third-party/analytics/cookie/chatbot related', reason: 'Name indicates dynamic or operational behavior.' };
      }

      if (file.startsWith('tools/') || file.startsWith('scripts/')) {
        return { file, status: 'Keep because tool script', reason: 'Not loaded by homepage by design.' };
      }

      return { file, status: 'Needs manual review', reason: 'Not directly referenced by index.html or info.html.' };
    })
    .sort((a, b) => a.file.localeCompare(b.file));
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function markdownTable(headers, rows) {
  if (!rows.length) return '_None found._\n';
  const safeRows = rows.map((row) => row.map((cell) => String(cell ?? '').replace(/\n/g, ' ')));
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...safeRows.map((row) => `| ${row.join(' | ')} |`),
  ].join('\n') + '\n';
}

function createReport({ browserAudit, eslintResult, jsFiles, cssFiles, allFiles }) {
  const eslintMessages = flattenEslintMessages(eslintResult);
  const unusedMessages = eslintMessages.filter((message) => message.ruleId === 'no-unused-vars');
  const undefinedMessages = eslintMessages.filter((message) => message.ruleId === 'no-undef');
  const otherMessages = eslintMessages.filter((message) => !['no-unused-vars', 'no-undef'].includes(message.ruleId));
  const selectorHints = extractCssSelectorHints(cssFiles, browserAudit.observedDom);
  const legacyFiles = findLegacyFiles(allFiles);
  const unreferencedFiles = classifyUnreferencedFiles(jsFiles, cssFiles);
  const generatedAt = new Date().toISOString();
  const viewportRows = browserAudit.viewportResults.map((result) => [
    result.viewport,
    result.initial?.noHorizontalScroll ? 'pass' : 'review',
    result.initial?.offersHidden ? 'pass' : 'review',
    result.viewport === 'desktop' ? 'n/a' : (result.mobileMenu?.opened ? 'pass' : 'review'),
    result.providerChoiceFromMenu?.visible ? 'pass' : 'review',
    result.offersAfterHero?.hidden === false ? 'pass' : 'review',
    result.moreButtons === 0 ? 'not present' : String(result.moreButtons),
  ]);

  const coverageRows = (items) => items.map((item) => [
    item.file,
    formatBytes(item.totalBytes),
    `${item.usedPercent}%`,
    `${item.unusedPercent}%`,
    item.unusedPercent >= 85 ? 'Needs manual review' : 'Keep because used dynamically / partially covered',
  ]);

  const eslintRows = (items, limit = 80) => items.slice(0, limit).map((item) => [
    `${item.file}:${item.line}:${item.column}`,
    item.ruleId,
    item.severity,
    item.message.replace(/\|/g, '\\|'),
    item.ruleId === 'no-undef' ? 'Needs manual review' : 'Needs manual review',
  ]);

  const selectorRows = (items, prefix) => items.map((item) => [
    `${prefix}${item.selector}`,
    item.files.join(', '),
    'Needs manual review',
  ]);

  return `# Dead Code Audit Report

Generated: ${generatedAt}

This report is audit-only. It did not delete or rewrite source code, contact information, payment details, document links, analytics, cookies, legal content, or chatbot-related code.

## Commands

- Lint: \`npm run lint\`
- Coverage only: \`npm run audit:coverage\`
- Full report: \`npm run audit:dead-code\`

## Files Checked

- JavaScript files: ${jsFiles.length}
- CSS files: ${cssFiles.length}
- Browser test URL: ${browserAudit.baseUrl}

### JavaScript

${jsFiles.map((file) => `- \`${file}\``).join('\n')}

### CSS

${cssFiles.map((file) => `- \`${file}\``).join('\n')}

## Browser Flow Checks

${markdownTable(['Viewport', 'No horizontal scroll', 'Offers hidden initially', 'Menu', 'Provider choice', 'Hero offers CTA', 'More buttons'], viewportRows)}

Console/page errors captured during audit: ${browserAudit.consoleErrors.length}

${browserAudit.consoleErrors.length ? browserAudit.consoleErrors.map((error) => `- ${error}`).join('\n') : '_None captured._'}

## JavaScript Coverage

${markdownTable(['File', 'Size', 'Used', 'Unused', 'Status'], coverageRows(browserAudit.jsCoverage))}

## CSS Coverage

${markdownTable(['File', 'Size', 'Used', 'Unused', 'Status'], coverageRows(browserAudit.cssCoverage))}

## ESLint: Undefined References

${markdownTable(['Location', 'Rule', 'Severity', 'Message', 'Status'], eslintRows(undefinedMessages))}

## ESLint: Suspicious Unused JS

${markdownTable(['Location', 'Rule', 'Severity', 'Message', 'Status'], eslintRows(unusedMessages))}

## ESLint: Other Warnings

${markdownTable(['Location', 'Rule', 'Severity', 'Message', 'Status'], eslintRows(otherMessages, 60))}

## Suspicious CSS Selectors Not Observed

These selectors were not seen in the DOM during the automated desktop/mobile flows and were not found as literal tokens in HTML/JS. They may still be used dynamically, by pseudo states, by browser-specific fallbacks, or by pages not covered by this audit.

### Class selectors

${markdownTable(['Selector', 'Files', 'Status'], selectorRows(selectorHints.classHints, '.'))}

### ID selectors

${markdownTable(['Selector', 'Files', 'Status'], selectorRows(selectorHints.idHints, '#'))}

## Files That Look Backup/Legacy

${legacyFiles.length ? legacyFiles.map((file) => `- \`${file}\` - Needs manual review`).join('\n') : '_None found by filename pattern._'}

## Source Files Not Directly Referenced By HTML

${markdownTable(['File', 'Status', 'Reason'], unreferencedFiles.map((item) => [item.file, item.status, item.reason]))}

## Recommendations

- Safe to remove: none automatically identified. Treat every item in this report as suspicious until manually reviewed.
- Needs manual review: high-unused coverage files, ESLint unused warnings, undefined references, and selectors not observed by the browser audit.
- Keep because used dynamically: anything referenced through \`data-*\` attributes, modal IDs, runtime class toggles, analytics, cookies, contact/legal/payment/document flows, and responsive/pseudo-state CSS.
- Keep because third-party/analytics/cookie/chatbot related: do not remove analytics/cookie/chatbot/contact code based only on coverage, because it can depend on consent, external scripts, user timing, or production-only behavior.
- Re-run \`npm run audit:dead-code\` after meaningful UI changes. Coverage is path-dependent, so unused percentages are a guide, not proof.
`;
}

async function main() {
  ensureReportDir();

  const allFiles = listFiles();
  const jsFiles = sourceFilesByExtension('.js').filter((file) => !file.startsWith('node_modules/'));
  const cssFiles = sourceFilesByExtension('.css').filter((file) => !file.startsWith('node_modules/'));
  const browserAudit = await runBrowserCoverage();

  writeFileSync(COVERAGE_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    baseUrl: browserAudit.baseUrl,
    cssCoverage: browserAudit.cssCoverage,
    jsCoverage: browserAudit.jsCoverage,
    viewportResults: browserAudit.viewportResults,
    consoleErrors: browserAudit.consoleErrors,
  }, null, 2));

  writeFileSync(COVERAGE_DETAILS_PATH, JSON.stringify({
    generatedAt: new Date().toISOString(),
    observedDom: browserAudit.observedDom,
  }, null, 2));

  if (COVERAGE_ONLY) {
    console.log(`Coverage audit written to ${projectPath(COVERAGE_PATH)}`);
    console.log(`Coverage details written to ${projectPath(COVERAGE_DETAILS_PATH)}`);
    return;
  }

  const eslintResult = runEslintJson();
  const report = createReport({
    allFiles,
    browserAudit,
    cssFiles,
    eslintResult,
    jsFiles,
  });

  writeFileSync(REPORT_PATH, report);
  console.log(`Dead-code audit report written to ${projectPath(REPORT_PATH)}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
