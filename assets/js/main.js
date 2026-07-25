/* =========================================
   MAIN INITIALIZER
   Keep feature logic in the responsibility-specific modules.
========================================= */
(function () {
  'use strict';

  window.App = window.App || {};

  const modules = [
    ['modals', () => window.App.modals?.init?.()],
    ['offers', () => window.App.offers?.init?.()],
    ['offerRenderer', () => window.App.offerRenderer?.init?.()],
    ['tracking', () => window.App.tracking?.init?.()],
    ['ui', () => window.App.ui?.init?.()],
  ];

  // Το office-closure.js είναι ~14 KB που δεν κάνουν τίποτα όσο το mode είναι 'off'.
  // Το config (1,4 KB) φορτώνεται κανονικά και αποφασίζει αν αξίζει να έρθει το υπόλοιπο.
  async function initializeOfficeClosure() {
    const config = window.OFFICE_CLOSURE_CONFIG || window.PKSAA_OFFICE_CLOSURE_CONFIG;
    const mode = typeof config?.mode === 'string' ? config.mode.trim().toLowerCase() : 'off';
    if (mode !== 'date' && mode !== 'on') return;

    await window.App.loadLazyScript?.('officeClosure');
    window.App.officeClosure?.init?.();
  }

  let initialized = false;

  async function initializeApp() {
    if (initialized) return;
    initialized = true;

    for (const [name, init] of modules) {
      try {
        await Promise.resolve(init());
      } catch (error) {
        console.error('Module initialization failed: ' + name, error);
      }
    }

    try {
      await initializeOfficeClosure();
    } catch (error) {
      console.error('Module initialization failed: officeClosure', error);
    }
  }

  window.App.init = initializeApp;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
  } else {
    initializeApp();
  }
})();

// Η κλάση .is-scrolled στην πάνω μπάρα. Η απόκρυψη/εμφάνιση της ίδιας μπάρας
// ζει στο ui.js (site-top-nav-hidden) — εδώ μένει μόνο η οπτική κατάσταση
// «έχει γίνει scroll», ώστε να υπάρχει ένας ιδιοκτήτης ανά συμπεριφορά.
document.addEventListener('DOMContentLoaded', () => {
  const topNav = document.querySelector('.site-top-nav');
  if (!topNav) return;

  const SCROLL_THRESHOLD = 50;

  window.App?.scroll?.subscribe(({ scrollY }) => {
    topNav.classList.toggle('is-scrolled', scrollY > SCROLL_THRESHOLD);
  });
});