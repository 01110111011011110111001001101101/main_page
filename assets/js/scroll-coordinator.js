/* =========================================
   SCROLL COORDINATOR
   Ένα και μόνο scroll/resize listener για όλη τη σελίδα.

   Πριν από αυτό υπήρχαν τέσσερις ανεξάρτητοι listeners (main.js, tracking.js
   και δύο στο ui.js). Καθένας διάβαζε scrollY ή καλούσε getBoundingClientRect,
   δηλαδή μέχρι τέσσερα forced synchronous layouts ανά frame στο κινητό.

   Χρήση:
     const unsubscribe = window.App.scroll.subscribe(({ scrollY, direction }) => { ... });

   Ο callback τρέχει μία φορά ανά requestAnimationFrame, ποτέ συχνότερα.
========================================= */
(function () {
  'use strict';

  const subscribers = new Set();
  let ticking = false;
  let listening = false;
  let lastScrollY = 0;

  function readState() {
    const scrollY = window.scrollY;
    const delta = scrollY - lastScrollY;
    const direction = delta > 0 ? 'down' : delta < 0 ? 'up' : 'none';
    lastScrollY = scrollY;

    return { scrollY, delta, direction, viewportHeight: window.innerHeight };
  }

  function flush() {
    ticking = false;
    const state = readState();

    subscribers.forEach((callback) => {
      try {
        callback(state);
      } catch (error) {
        // Ένας σπασμένος συνδρομητής δεν πρέπει να ρίξει τους υπόλοιπους.
        console.error('scroll subscriber failed', error);
      }
    });
  }

  function request() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(flush);
  }

  function startListening() {
    if (listening) return;
    listening = true;
    lastScrollY = window.scrollY;
    window.addEventListener('scroll', request, { passive: true });
    window.addEventListener('resize', request, { passive: true });
  }

  function subscribe(callback) {
    if (typeof callback !== 'function') return () => {};

    subscribers.add(callback);
    startListening();
    request();

    return () => subscribers.delete(callback);
  }

  window.App = window.App || {};
  window.App.scroll = { subscribe, request };
})();
