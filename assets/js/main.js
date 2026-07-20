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
    ['wizard', () => window.App.wizard?.init?.()],
    ['ui', () => window.App.ui?.init?.()],
    ['officeClosure', () => window.App.officeClosure?.init?.()],
  ];

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
  }

  window.App.init = initializeApp;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
  } else {
    initializeApp();
  }
})();

document.addEventListener('DOMContentLoaded', () => {
  // Βρίσκουμε το κεντρικό navigation bar
  const topNav = document.querySelector('.site-top-nav');
  
  if (!topNav) return;

  // Ορίζουμε από πόσα pixels scroll και κάτω θα εμφανίζεται το nav
  // π.χ. μετά από 50px
  const scrollThreshold = 50; 

  const handleScroll = () => {
    // Ελέγχουμε την κάθετη θέση του scroll
    if (window.scrollY > scrollThreshold) {
      topNav.classList.add('is-scrolled');
    } else {
      topNav.classList.remove('is-scrolled');
    }
  };

  // 1. Τρέχουμε τη συνάρτηση μία φορά κατά τη φόρτωση 
  // (για την περίπτωση που ο χρήστης έκανε refresh στη μέση της σελίδας)
  handleScroll();

  // 2. Ακούμε το scroll event. Το passive: true είναι κρίσιμο για 60fps performance!
  window.addEventListener('scroll', handleScroll, { passive: true });
});