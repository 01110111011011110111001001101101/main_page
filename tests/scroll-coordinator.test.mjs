import assert from 'node:assert/strict';
import test from 'node:test';
import { createPage } from './helpers/load-scripts.mjs';

function createCoordinatorPage() {
  const page = createPage({ html: '<body></body>', files: ['scroll-coordinator.js'] });
  const { window } = page;
  let scrollY = 0;
  let frames = 0;

  Object.defineProperty(window, 'scrollY', { get: () => scrollY, configurable: true });
  window.requestAnimationFrame = (callback) => { frames += 1; callback(); return frames; };

  return {
    ...page,
    scrollTo(value) {
      scrollY = value;
      window.dispatchEvent(new window.Event('scroll'));
    },
    get frames() { return frames; },
  };
}

test('δηλώνει ένα μόνο scroll listener ανεξάρτητα από τους συνδρομητές', () => {
  const page = createCoordinatorPage();
  const added = [];
  const original = page.window.addEventListener.bind(page.window);
  page.window.addEventListener = (type, ...rest) => {
    if (type === 'scroll' || type === 'resize') added.push(type);
    return original(type, ...rest);
  };

  page.window.App.scroll.subscribe(() => {});
  page.window.App.scroll.subscribe(() => {});
  page.window.App.scroll.subscribe(() => {});

  assert.deepEqual(added, ['scroll', 'resize']);
});

test('ενημερώνει όλους τους συνδρομητές με την ίδια κατάσταση', () => {
  const page = createCoordinatorPage();
  const seen = [];

  page.window.App.scroll.subscribe((state) => seen.push(['a', state.scrollY]));
  page.window.App.scroll.subscribe((state) => seen.push(['b', state.scrollY]));

  seen.length = 0;
  page.scrollTo(420);

  assert.deepEqual(seen, [['a', 420], ['b', 420]]);
});

test('υπολογίζει κατεύθυνση scroll', () => {
  const page = createCoordinatorPage();
  const directions = [];

  page.window.App.scroll.subscribe((state) => directions.push(state.direction));
  directions.length = 0;

  page.scrollTo(200);
  page.scrollTo(500);
  page.scrollTo(100);

  assert.deepEqual(directions, ['down', 'down', 'up']);
});

test('ένας συνδρομητής που πετάει δεν ρίχνει τους υπόλοιπους', () => {
  const page = createCoordinatorPage();
  page.window.console.error = () => {};
  let reached = false;

  page.window.App.scroll.subscribe(() => { throw new Error('σκόπιμο σφάλμα'); });
  page.window.App.scroll.subscribe(() => { reached = true; });

  page.scrollTo(50);
  assert.equal(reached, true);
});

test('η κατάργηση συνδρομής σταματά τις ειδοποιήσεις', () => {
  const page = createCoordinatorPage();
  let calls = 0;

  const unsubscribe = page.window.App.scroll.subscribe(() => { calls += 1; });
  const afterSubscribe = calls;

  unsubscribe();
  page.scrollTo(300);

  assert.equal(calls, afterSubscribe);
});

test('συγχωνεύει πολλά events σε ένα frame', () => {
  const page = createCoordinatorPage();
  page.window.App.scroll.subscribe(() => {});

  // rAF που δεν εκτελεί αμέσως: προσομοιώνει πραγματικό browser.
  const queue = [];
  page.window.requestAnimationFrame = (callback) => { queue.push(callback); return queue.length; };

  page.window.dispatchEvent(new page.window.Event('scroll'));
  page.window.dispatchEvent(new page.window.Event('scroll'));
  page.window.dispatchEvent(new page.window.Event('scroll'));

  assert.equal(queue.length, 1, 'τρία events, ένα μόνο frame');
});
