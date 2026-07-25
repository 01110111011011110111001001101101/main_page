import assert from 'node:assert/strict';
import test from 'node:test';
import { createPage } from './helpers/load-scripts.mjs';

const PAGE = `<body>
  <header class="site-top-nav top-area-nav"><button data-action="toggle-sidebar">μενού</button></header>
  <main>
    <section id="hero"></section>
    <section id="choiceHub"></section>
    <section id="offers"><div id="offersContainer"></div></section>
  </main>
  <div class="top-bar-mini-nav" data-choice-mini-nav hidden>
    <button data-action="toggle-sidebar"><span>Μενού</span></button>
  </div>
</body>`;

const HEADER_HEIGHT = 68;
const CHOICE_HUB_TOP = 600;

function createNavPage({ mobile = true } = {}) {
  const page = createPage({
    html: PAGE,
    files: ['ui.js'],
    matchMedia: (query) => ({
      matches: /max-width:\s*767px/.test(query) ? mobile : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }),
  });

  const { window, document } = page;
  let scrollY = 0;

  Object.defineProperty(window, 'scrollY', { get: () => scrollY, configurable: true });
  window.requestAnimationFrame = (callback) => { callback(); return 1; };

  document.querySelector('.site-top-nav').getBoundingClientRect = () => ({ height: HEADER_HEIGHT, top: 0 });
  document.getElementById('choiceHub').getBoundingClientRect = () => ({ top: CHOICE_HUB_TOP - scrollY, height: 300 });
  document.querySelector('[data-choice-mini-nav]').getBoundingClientRect = () => ({ height: 62 });

  window.eval('initializeChoiceMiniNav();');

  return {
    ...page,
    scrollTo(value) {
      scrollY = value;
      window.dispatchEvent(new window.Event('scroll'));
    },
    get headerHidden() {
      return document.body.classList.contains('site-top-nav-hidden');
    },
    get miniNavVisible() {
      return document.body.classList.contains('choice-mini-nav-visible');
    },
  };
}

test('το mini nav εμφανίζεται μόλις φτάσουμε στη Γρήγορη εκκίνηση', () => {
  const page = createNavPage();

  assert.equal(page.miniNavVisible, false);
  page.scrollTo(300);
  assert.equal(page.miniNavVisible, false);
  page.scrollTo(700);
  assert.equal(page.miniNavVisible, true);
});

test('η πάνω μπάρα είναι αντίστροφα δεμένη με το mini nav', () => {
  const page = createNavPage();

  page.scrollTo(700);
  assert.equal(page.miniNavVisible, true);
  assert.equal(page.headerHidden, true, 'όταν φαίνεται το mini nav, η μπάρα κρύβεται');

  page.scrollTo(0);
  assert.equal(page.miniNavVisible, false);
  assert.equal(page.headerHidden, false, 'όταν κρύβεται το mini nav, η μπάρα επιστρέφει');
});

test('στον υπολογιστή η μπάρα δεν κρύβεται ποτέ', () => {
  const page = createNavPage({ mobile: false });

  page.scrollTo(2000);
  assert.equal(page.headerHidden, false);
});

test('το mini nav παίρνει hidden attribute όταν δεν φαίνεται', () => {
  const page = createNavPage();
  const miniNav = page.document.querySelector('[data-choice-mini-nav]');

  assert.equal(miniNav.hidden, true);
  page.scrollTo(700);
  assert.equal(miniNav.hidden, false);
  page.scrollTo(0);
  assert.equal(miniNav.hidden, true);
});

const TITLE = 'Προσφορές κινητής και internet για τα μέλη μας';
const HERO = `<body><h1 class="police-hero__title" data-typewriter>${TITLE}</h1></body>`;

function createHeroPage(reducedMotion) {
  return createPage({
    html: HERO,
    files: ['ui.js'],
    matchMedia: (query) => ({
      matches: /prefers-reduced-motion/.test(query) ? reducedMotion : false,
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }),
  });
}

test('ο τίτλος γράφεται σταδιακά και καταλήγει πλήρης', async () => {
  const page = createHeroPage(false);
  page.window.eval('initializeTypewriters();');
  const title = page.document.querySelector('[data-typewriter]');

  assert.equal(title.getAttribute('aria-label'), TITLE, 'οι αναγνώστες οθόνης ακούν όλη τη φράση');
  assert.equal(title.textContent, '', 'ξεκινά κενός');

  await new Promise((resolve) => setTimeout(resolve, 3000));
  assert.equal(title.textContent, TITLE);
  assert.ok(title.classList.contains('is-typed'));
});

test('με prefers-reduced-motion ο τίτλος εμφανίζεται αμέσως', () => {
  const page = createHeroPage(true);
  page.window.eval('initializeTypewriters();');
  const title = page.document.querySelector('[data-typewriter]');

  assert.equal(title.textContent, TITLE);
  assert.ok(title.classList.contains('is-typed'));
});
