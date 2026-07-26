/* =========================================
   GENERAL UI / DELEGATED INTERACTIONS
========================================= */

  function prefersReducedMotion() {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  // Γράφει τον τίτλο χαρακτήρα-χαρακτήρα. Το πλήρες κείμενο μένει στο HTML
  // (SEO) και περνά ως aria-label ώστε οι αναγνώστες οθόνης να το ακούν
  // ολόκληρο αντί για γράμμα-γράμμα. Χωρίς JS ή με reduced-motion, ο τίτλος
  // απλώς εμφανίζεται κανονικά.
  // Ο ρυθμός προσαρμόζεται στο μήκος: ένας μακρύς τίτλος με σταθερά 45ms/χαρακτήρα
  // θα κρατούσε πάνω από 2,5 δευτερόλεπτα, που είναι κουραστικό.
  const TYPEWRITER_TOTAL_MS = 1700;
  const TYPEWRITER_MIN_CHAR_MS = 16;
  const TYPEWRITER_MAX_CHAR_MS = 45;
  const TYPEWRITER_START_MS = 260;

  function getTypewriterCharDelay(length) {
    if (!length) return TYPEWRITER_MAX_CHAR_MS;
    const delay = TYPEWRITER_TOTAL_MS / length;
    return Math.min(TYPEWRITER_MAX_CHAR_MS, Math.max(TYPEWRITER_MIN_CHAR_MS, delay));
  }

  function runTypewriter(element) {
    const fullText = (element.textContent || '').trim();
    if (!fullText) return;

    element.setAttribute('aria-label', fullText);

    const text = document.createElement('span');
    text.className = 'typewriter-text';

    const caret = document.createElement('span');
    caret.className = 'typewriter-caret';
    caret.setAttribute('aria-hidden', 'true');

    element.textContent = '';
    element.append(text, caret);
    element.classList.add('is-typing');

    const charDelay = getTypewriterCharDelay(fullText.length);
    let index = 0;

    const step = () => {
      text.textContent = fullText.slice(0, index);
      index += 1;

      if (index <= fullText.length) {
        window.setTimeout(step, charDelay);
        return;
      }

      element.classList.remove('is-typing');
      element.classList.add('is-typed');
    };

    window.setTimeout(step, TYPEWRITER_START_MS);
  }

  function initializeTypewriters() {
    const targets = Array.from(document.querySelectorAll('[data-typewriter]'));
    if (!targets.length) return;

    // Με prefers-reduced-motion δεν παίζει καθόλου animation.
    if (prefersReducedMotion()) {
      targets.forEach((element) => element.classList.add('is-typed'));
      return;
    }

    targets.forEach(runTypewriter);
  }

  // Το έτος στο copyright γράφεται στο HTML (ώστε να φαίνεται και χωρίς JS)
  // και ενημερώνεται εδώ, για να μη μένει ξεχασμένο σε παλιά χρονιά.
  function initializeCurrentYear() {
    const year = String(new Date().getFullYear());
    document.querySelectorAll('[data-current-year]').forEach((element) => {
      element.textContent = year;
    });
  }

  function readNavigationMetrics() {
    const header = document.querySelector('.site-top-nav');
    const miniNav = document.querySelector('[data-choice-mini-nav]');
    const headerHeight = Math.ceil(header?.getBoundingClientRect().height || 96);
    const miniNavHeight = document.body.classList.contains('choice-mini-nav-visible')
      ? Math.ceil(miniNav?.getBoundingClientRect().height || 0)
      : 0;

    return { headerHeight, miniNavHeight };
  }

  function updateNavigationOffsets(metrics = readNavigationMetrics()) {
    const { headerHeight, miniNavHeight } = metrics;
    document.documentElement.style.setProperty('--site-header-height', `${headerHeight}px`);
    document.documentElement.style.setProperty('--choice-mini-nav-height', `${miniNavHeight}px`);
  }

  function updateChoiceMiniNavVisibility(shouldShow) {
    const miniNav = document.querySelector('[data-choice-mini-nav]');
    if (!miniNav) return;

    if (shouldShow) miniNav.hidden = false;
    document.body.classList.toggle('choice-mini-nav-visible', shouldShow);
    if (!shouldShow) miniNav.hidden = true;
    requestAnimationFrame(updateNavigationOffsets);
  }

  const MOBILE_NAV_QUERY = '(max-width: 767px)';

  function isMobileNavViewport() {
    return window.matchMedia?.(MOBILE_NAV_QUERY).matches ?? false;
  }

  function setTopNavHidden(hidden) {
    document.body.classList.toggle('site-top-nav-hidden', hidden);
  }

  // Στα κινητά: μόλις ο χρήστης φτάσει στη "Γρήγορη εκκίνηση" και συνεχίσει προς
  // τα κάτω, η πάνω μπάρα κρύβεται και εμφανίζεται το mini nav στον πάτο.
  // Με scroll προς τα πάνω η μπάρα επανέρχεται αμέσως.
  // Η "Γρήγορη εκκίνηση" κρύβεται στον υπολογιστή, όπου η πλοήγηση γίνεται από
  // την πάνω μπάρα. Όταν είναι κρυφή, το σημείο ενεργοποίησης γίνονται οι
  // προσφορές — αλλιώς ένα στοιχείο με μηδενικό ύψος θα έδινε top === 0 και το
  // trigger θα χτυπούσε από την πρώτη στιγμή.
  function getMiniNavTrigger() {
    const choiceHub = document.getElementById('choiceHub');
    // getComputedStyle αντί για getClientRects: διαβάζει το media query που
    // κρύβει την ενότητα, και δουλεύει και εκτός browser (tests σε jsdom).
    const isVisible = choiceHub && window.getComputedStyle(choiceHub).display !== 'none';
    return isVisible ? choiceHub : document.getElementById('offers');
  }

  function initializeChoiceMiniNav() {
    const miniNav = document.querySelector('[data-choice-mini-nav]');
    if (!miniNav || !getMiniNavTrigger()) return;

    const syncMiniNav = () => {
      const { headerHeight } = readNavigationMetrics();

      // Ξαναϋπολογίζεται σε κάθε κλήση: σε αλλαγή μεγέθους παραθύρου το
      // choiceHub μπορεί να εμφανιστεί ή να κρυφτεί.
      const triggerSection = getMiniNavTrigger();
      if (!triggerSection) return;

      const passedTrigger = triggerSection.getBoundingClientRect().top <= headerHeight;

      updateChoiceMiniNavVisibility(passedTrigger);

      // Η πάνω μπάρα και το mini nav είναι αντίστροφα δεμένα: όποτε φαίνεται
      // το ένα, κρύβεται το άλλο. Στο desktop η μπάρα μένει πάντα ορατή.
      setTopNavHidden(isMobileNavViewport() && passedTrigger);
    };

    syncMiniNav();

    if (window.App?.scroll?.subscribe) {
      window.App.scroll.subscribe(syncMiniNav);
      return;
    }

    // Fallback αν φορτωθεί το ui.js χωρίς τον scroll-coordinator (π.χ. σε test).
    window.addEventListener('scroll', syncMiniNav, { passive: true });
    window.addEventListener('resize', syncMiniNav);
  }

  // Καλύπτει κάθε σύνδεσμο προς #contact (πλαϊνό μενού, μπάρα πληροφοριών, κάρτες).
  function handleContactAnchorClick(event) {
    const link = event.target.closest('a[href="#contact"], .choice-card-contact');
    if (!link) return false;

    const contact = document.getElementById('contact');
    if (!contact) return false;

    event.preventDefault();

    if (link.closest('#sidebarMenu') && typeof closeSidebarInstantly === 'function') {
      closeSidebarInstantly();
    }

    requestAnimationFrame(() => {
      contact.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'start',
      });
    });

    return true;
  }

function resetSwipeBackTracking() {
    swipeBackTracking = false;
    swipeBackStartX = 0;
    swipeBackStartY = 0;
    swipeBackStartTime = 0;
}

function shouldIgnoreSwipeBackTarget(target) {
    if (!target || !target.closest) return false;

    // Όταν είμαστε μέσα σε οποιοδήποτε modal, το γενικό browser swipe-back
    // δεν πρέπει να τρέχει ποτέ, γιατί στέλνει τον χρήστη στην αρχική/προηγούμενη σελίδα.
    // Τα modals/οδηγοί έχουν δική τους πλοήγηση.
    if (target.closest('.modal-backdrop')) {
        return true;
    }

    if (target.closest('input, textarea, select, button, a, [role="button"], [contenteditable="true"]')) {
        return true;
    }

    if (target.closest('[data-preview-zoom], [data-preview-reset], [data-copy-text], [data-copy-iban], [data-copy-beneficiary], [data-tab-show]')) {
        return true;
    }

    let node = target;
    while (node && node !== document.body) {
        if (node.scrollWidth > node.clientWidth + 12) {
            const style = window.getComputedStyle(node);
            if (style.overflowX === 'auto' || style.overflowX === 'scroll') {
                return true;
            }
        }

        node = node.parentElement;
    }

    return false;
}

function handleSwipeBackTouchStart(event) {
    if (!event.touches || event.touches.length !== 1) {
        resetSwipeBackTracking();
        return;
    }

    if (imagePreviewPinchDistance > 0 || imagePreviewDragging || (isImagePreviewOpen() && imagePreviewZoom > 1)) {
        resetSwipeBackTracking();
        return;
    }

    if (shouldIgnoreSwipeBackTarget(event.target)) {
        resetSwipeBackTracking();
        return;
    }

    const touch = event.touches[0];

    if (touch.clientX <= SWIPE_BACK_EDGE_GUARD || touch.clientX >= window.innerWidth - SWIPE_BACK_EDGE_GUARD) {
        resetSwipeBackTracking();
        return;
    }

    swipeBackStartX = touch.clientX;
    swipeBackStartY = touch.clientY;
    swipeBackStartTime = Date.now();
    swipeBackTracking = true;
}

function handleSwipeBackTouchEnd(event) {
    if (!swipeBackTracking || !event.changedTouches || event.changedTouches.length !== 1) {
        resetSwipeBackTracking();
        return;
    }

    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - swipeBackStartX;
    const deltaY = Math.abs(touch.clientY - swipeBackStartY);
    const duration = Date.now() - swipeBackStartTime;

    resetSwipeBackTracking();

    if (
        deltaX >= SWIPE_BACK_MIN_DISTANCE &&
        deltaY <= SWIPE_BACK_MAX_VERTICAL_DISTANCE &&
        duration <= SWIPE_BACK_MAX_DURATION_MS
    ) {
        trackEvent('Navigation', 'swipe_back', 'touch_gesture', {
            direction: 'right',
        });

        // Extra ασφάλεια: αν υπάρχει ανοιχτό modal, μη χρησιμοποιείς browser history back.
        // Αλλιώς σε Safari/iPhone μπορεί να πετάξει τον χρήστη στην αρχική.
        if (document.querySelector('.modal-backdrop:not(.hidden)')) {
            return;
        }

        window.history.back();
    }
}

function initializeBottomNavOffersState() {
    const offersSection = document.getElementById('offers');
    const offersNavLink = document.querySelector('.mobile-nav-offers-link');
    if (!offersSection || !offersNavLink || !('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            offersNavLink.classList.toggle('is-active', entry.isIntersecting);
        });
    }, {
        threshold: 0.01,
        rootMargin: '0px',
    });

    observer.observe(offersSection);
}

function initializePremiumMenuActiveState() {
    const menuLinks = {
        mobile: document.querySelector('.premium-menu-link-mobile'),
        internet: document.querySelector('.premium-menu-link-internet'),
        tv: document.querySelector('.premium-menu-link-tv'),
        info: document.querySelector('.premium-menu-link-info'),
    };

    const targetGroups = {
        mobile: Array.from(document.querySelectorAll('[data-offer-card][data-category="mobile"]')),
        internet: Array.from(document.querySelectorAll('[data-offer-card][data-category="internet"]')),
        tv: Array.from(document.querySelectorAll('[data-offer-card][data-category="tv"]')),
        info: Array.from([document.getElementById('siteLegalBar')].filter(Boolean)),
    };

    const hasTargets = Object.values(targetGroups).some((elements) => elements.length);
    if (!hasTargets) return;

    const visibility = new Map();
    const updateActiveState = () => {
        let bestKey = '';
        let bestRatio = 0;

        Object.entries(targetGroups).forEach(([key, elements]) => {
            const keyRatio = elements.reduce((ratio, element) => Math.max(ratio, element?.hidden ? 0 : (visibility.get(element) || 0)), 0);

            if (keyRatio > bestRatio) {
                bestRatio = keyRatio;
                bestKey = key;
            }
        });

        Object.entries(menuLinks).forEach(([key, link]) => {
            if (!link) return;
            link.classList.toggle('is-active', key === bestKey && bestRatio >= 0.12);
        });
    };

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => visibility.set(entry.target, entry.intersectionRatio));
        requestAnimationFrame(updateActiveState);
    }, { threshold: [0, 0.12, 0.25, 0.5, 0.75, 1] });
    Object.values(targetGroups).flat().forEach((element) => observer.observe(element));
    window.syncPremiumMenuActiveState = updateActiveState;
}

function initializeHeroIntroNavigation() {
    const heroSection = document.querySelector('.landing-hero');
    const topNav = document.querySelector('.site-top-nav');
    if (!heroSection || !topNav) return;

    const heroActionLinks = Array.from(document.querySelectorAll('.hero-actions a'));
    let listenersBound = false;

    const syncHeroIntroNavigationState = () => {
        const body = document.body;
        if (!body) return;

        const hash = window.location.hash || '#top';
        const shouldShowNav = window.scrollY > 80 || hash !== '#top';
        body.classList.toggle('hero-nav-visible', shouldShowNav);
    };

    const showHeroNavImmediately = () => {
        document.body?.classList.add('hero-nav-visible');
    };

    const bindListeners = () => {
        if (listenersBound) return;
        listenersBound = true;

        if (window.App?.scroll?.subscribe) {
            window.App.scroll.subscribe(syncHeroIntroNavigationState);
        } else {
            window.addEventListener('scroll', syncHeroIntroNavigationState, { passive: true });
            window.addEventListener('resize', syncHeroIntroNavigationState, { passive: true });
        }
        window.addEventListener('hashchange', syncHeroIntroNavigationState);

        if (typeof HERO_INTRO_DESKTOP_QUERY.addEventListener === 'function') {
            HERO_INTRO_DESKTOP_QUERY.addEventListener('change', syncHeroIntroNavigationState);
        } else if (typeof HERO_INTRO_DESKTOP_QUERY.addListener === 'function') {
            HERO_INTRO_DESKTOP_QUERY.addListener(syncHeroIntroNavigationState);
        }

        heroActionLinks.forEach((link) => {
            link.addEventListener('click', showHeroNavImmediately);
        });
    };

    bindListeners();
    syncHeroIntroNavigationState();
}

/* =========================================
   4. COOKIE CONSENT
   ========================================= */
function handleCookieConsent(action) {
    if (action !== 'accept' && action !== 'reject') return;

    const banner = document.getElementById('cookieConsentBanner');
    if (!banner) return;

    if (action === 'accept') {
        // Το localStorage πετάει σε private mode ή με μπλοκαρισμένα cookies.
        // Η επιλογή τότε δεν θυμάται, αλλά η σελίδα πρέπει να συνεχίσει κανονικά.
        try {
            localStorage.setItem('cookieConsent', 'accepted');
        } catch (_error) {
            console.warn('Η προτίμηση cookies δεν αποθηκεύτηκε: το localStorage δεν είναι διαθέσιμο.');
        }

        // ΑΣΦΑΛΕΙΑ: Εκτέλεση ΜΟΝΟ αν το tracking script είναι διαθέσιμο
        if (typeof window.loadAllTracking === 'function') {
            window.loadAllTracking();
        } else {
            console.warn('Το tracking script (loadAllTracking) δεν είναι διαθέσιμο σε αυτή τη σελίδα.');
        }

        // ΑΣΦΑΛΕΙΑ: Έλεγχος αν υπάρχει η trackEvent
        if (typeof trackEvent === 'function') {
            trackEvent('Consent', 'analytics_consent_accept', 'Cookie Banner');
        }
        
        // ΑΣΦΑΛΕΙΑ: Έλεγχος αν υπάρχει η showToast
        if (typeof showToast === 'function') {
            showToast('Οι προτιμήσεις αποθηκεύτηκαν', 'success');
        }
    } else {
        // Βλέπε παραπάνω: αποτυχία localStorage δεν είναι λόγος να σπάσει η ροή.
        try {
            localStorage.setItem('cookieConsent', 'rejected');
        } catch (_error) {
            console.warn('Η προτίμηση cookies δεν αποθηκεύτηκε: το localStorage δεν είναι διαθέσιμο.');
        }
        
        if (typeof showToast === 'function') {
            showToast('Τα cookies απορρίφθηκαν', 'info');
        }
    }

    // ΑΥΤΟΣ Ο ΚΩΔΙΚΑΣ ΤΩΡΑ ΘΑ ΕΚΤΕΛΕΙΤΑΙ ΠΑΝΤΑ ΚΑΙ ΤΟ BANNER ΘΑ ΚΛΕΙΝΕΙ
    banner.style.opacity = '0';
    banner.style.transform = 'translateY(100%)';
    document.documentElement.dataset.cookieConsent = action === 'accept' ? 'accepted' : 'rejected';
    banner.dataset.cookieClosing = 'true';
    
    setTimeout(() => {
        banner.classList.add('hidden');
        banner.removeAttribute('data-cookie-closing');
    }, 180);

    // ΑΣΦΑΛΕΙΑ: Κλείσιμο του modal αν είναι ανοιχτό
    const cookiesModal = document.getElementById('cookiesModal');
    if (cookiesModal && !cookiesModal.classList.contains('hidden') && typeof closeModal === 'function') {
        closeModal('cookiesModal');
    }
}

function handleDocumentClick(event) {

    const stopTarget = event.target.closest('[data-stop-click]');
    if (stopTarget) event.stopPropagation();

    const categoryTarget = event.target.closest('[data-category-filter]');
    if (categoryTarget) {
        event.preventDefault();
        applyOfferFilter(categoryTarget.dataset.categoryFilter, categoryTarget);
        return;
    }

    const offersLinkTarget = event.target.closest('a[href="#offers"]');
    if (offersLinkTarget) {
        handleOffersAnchorClick(event);
        return;
    }

    const explicitTrackTarget = event.target.closest('[data-track]');
    if (explicitTrackTarget && !shouldSkipExplicitTracking(explicitTrackTarget)) {
        trackEvent(explicitTrackTarget.dataset.track, getExplicitTrackParams(explicitTrackTarget));
    }

    const linkTarget = event.target.closest('a[href]');
    if (linkTarget) trackLinkClick(linkTarget);

    if (handleContactAnchorClick(event)) return;

    const actionTarget = event.target.closest('[data-action]');
    if (actionTarget) {
        const action = actionTarget.dataset.action;

        if (action === 'go-home') {
            event.preventDefault();
            goHomeFromHeader();
            return;
        }

        if (action === 'toggle-sidebar') {
            event.preventDefault();
            toggleSidebar();
            return;
        }
    }

    const cookieTarget = event.target.closest(
        'button[data-cookie-consent="accept"], button[data-cookie-consent="reject"]'
    );
    if (cookieTarget) {
        event.preventDefault();
        handleCookieConsent(cookieTarget.dataset.cookieConsent);
        return;
    }

    const previewSourceTarget = event.target.closest('[data-preview-src]');
    if (previewSourceTarget) {
        event.preventDefault();
        openImagePreview(previewSourceTarget.dataset.previewSrc);
        return;
    }

    const previewZoomTarget = event.target.closest('[data-preview-zoom]');
    if (previewZoomTarget) {
        event.preventDefault();
        zoomImagePreview(Number(previewZoomTarget.dataset.previewZoom));
        return;
    }

    const previewResetTarget = event.target.closest('[data-preview-reset]');
    if (previewResetTarget) {
        event.preventDefault();
        resetImagePreviewZoom();
        return;
    }

    const copyEmailTarget = event.target.closest('[data-copy-email]');
    if (copyEmailTarget) {
        event.preventDefault();

        if (typeof copyToClipboard === 'function') {
            copyToClipboard(copyEmailTarget.dataset.copyEmail, copyEmailTarget);
        } else if (navigator.clipboard) {
            navigator.clipboard.writeText(copyEmailTarget.dataset.copyEmail);
            copyEmailTarget.textContent = 'Αντιγράφηκε!';
        }

        return;
    }

    const copyTextTarget = event.target.closest('[data-copy-text]');
    if (copyTextTarget) {
        event.preventDefault();
        trackEvent('payment_copy', {
            ...getOpenOfferContext(),
            copy_type: 'account_name',
        });
        copyToClipboard(copyTextTarget.dataset.copyText, copyTextTarget);
        return;
    }

    const copyBeneficiaryTarget = event.target.closest('[data-copy-beneficiary]');
    if (copyBeneficiaryTarget) {
        event.preventDefault();
        trackEvent('payment_copy', {
            ...getOpenOfferContext(),
            copy_type: 'beneficiary_name',
        });
        copyIbanWithFeedback(copyBeneficiaryTarget.dataset.copyBeneficiary, copyBeneficiaryTarget);
        return;
    }

    const copyIbanTarget = event.target.closest('[data-copy-iban]');
    if (copyIbanTarget) {
        event.preventDefault();
        trackEvent('copy_iban', {
            ...getOpenOfferContext(),
            copy_type: 'iban',
        });
        copyIbanWithFeedback(copyIbanTarget.dataset.copyIban, copyIbanTarget);
        return;
    }

    const sidebarTarget = event.target.closest('[data-sidebar-target]');
    if (sidebarTarget) {
        event.preventDefault();
        const modalId = sidebarTarget.dataset.sidebarTarget;
        openModalFromSidebar(modalId);
        return;
    }

    const sidebarCategoryTarget = event.target.closest('[data-sidebar-category]');
    if (sidebarCategoryTarget) {
        event.preventDefault();
        const category = sidebarCategoryTarget.dataset.sidebarCategory || 'all';
        applySidebarOfferFilter(category, sidebarCategoryTarget);
        return;
    }

   const modalCloseTarget = event.target.closest('[data-modal-close]');
if (modalCloseTarget) {
    event.preventDefault();

    const modalToClose = modalCloseTarget.dataset.modalClose;
    const modalToOpen = modalCloseTarget.dataset.modalTarget;
    const replaceModalHistory = modalCloseTarget.dataset.modalHistory === 'replace';

    closeModal(modalToClose, !modalToOpen);


    if (modalToOpen) {
        trackEvent('offer_click', {
            offer_id: modalToOpen,
            offer_name: modalCloseTarget.dataset.offer || getOfferName(modalToOpen),
            category: modalCloseTarget.dataset.category,
        });
        openModal(modalToOpen, !replaceModalHistory);

        if (replaceModalHistory) {
            history.replaceState({ screen: 'offer', modalId: modalToOpen }, '', `#${modalToOpen}`);
        }

    }

    return;
}

    const modalTarget = event.target.closest('[data-modal-target]');
    if (modalTarget) {
        event.preventDefault();
        const targetModalId = modalTarget.dataset.modalTarget;
        trackEvent('offer_click', {
            offer_id: targetModalId,
            offer_name: modalTarget.dataset.offer || getOfferName(targetModalId),
            category: modalTarget.dataset.category,
        });
        openModal(targetModalId);
        return;
    }

    if (event.target.classList.contains('modal-backdrop')) closeModal(event.target.id);
    if (event.target.id === 'sidebarOverlay') toggleSidebar();
    if (event.target.id === 'imagePreviewModal') {
        closeModal('imagePreviewModal');
    }
}

function handleDocumentKeydown(event) {
    if (event.key === 'Escape') {
        const preview = document.getElementById('imagePreviewModal');
        if (preview && !preview.classList.contains('hidden')) {
            event.preventDefault();
            closeModal('imagePreviewModal');
            return;
        }

        const openModalElement = Array.from(document.querySelectorAll('.modal-backdrop:not(.hidden)')).pop();
        if (openModalElement?.id) {
            event.preventDefault();
            closeModal(openModalElement.id);
            return;
        }
    }

    if ((event.key !== 'Enter' && event.key !== ' ') || !event.target.matches('[role="button"][data-modal-target]')) {
        return;
    }

    event.preventDefault();
    openModal(event.target.dataset.modalTarget);
}

function initializeCookieConsentState() {
    let consent;
    try {
        consent = localStorage.getItem('cookieConsent');
    } catch (_error) {
        consent = null;
    }

    if (!consent) {
        document.documentElement.dataset.cookieConsent = 'pending';
    } else if (consent === 'accepted') {
        document.documentElement.dataset.cookieConsent = 'accepted';
        
        // ΕΛΕΓΧΟΣ ΑΣΦΑΛΕΙΑΣ: Εκτέλεση μόνο αν το script tracking είναι όντως διαθέσιμο
        if (typeof window.loadAllTracking === 'function') {
            window.loadAllTracking();
        } else {
            console.warn('Το tracking script δεν έχει φορτωθεί ακόμα ή έχει αποκλειστεί.');
        }
    } else if (consent === 'rejected') {
        document.documentElement.dataset.cookieConsent = 'rejected';
    }
}

function initializeImagePreviewControls() {
    const imagePreviewViewport = document.getElementById('imagePreviewViewport');
    if (imagePreviewViewport) {
        imagePreviewViewport.addEventListener('wheel', handleImagePreviewWheel, { passive: false });
        imagePreviewViewport.addEventListener('touchstart', handleImagePreviewTouchStart, { passive: true });
        imagePreviewViewport.addEventListener('touchmove', handleImagePreviewTouchMove, { passive: false });
        imagePreviewViewport.addEventListener('touchend', handleImagePreviewTouchEnd);
        imagePreviewViewport.addEventListener('touchcancel', handleImagePreviewTouchEnd);
        imagePreviewViewport.addEventListener('pointerdown', handleImagePreviewPointerDown);
        imagePreviewViewport.addEventListener('pointermove', handleImagePreviewPointerMove);
        imagePreviewViewport.addEventListener('pointerup', handleImagePreviewPointerUp);
        imagePreviewViewport.addEventListener('pointercancel', stopImagePreviewDrag);
        imagePreviewViewport.addEventListener('mouseleave', stopImagePreviewDrag);
    }

    window.addEventListener('keydown', (event) => {
        const modal = document.getElementById('imagePreviewModal');
        if (!modal || modal.classList.contains('hidden')) return;

        if (event.key === 'Escape') closeModal('imagePreviewModal');
        if (event.key === '+' || event.key === '=') zoomImagePreview(0.25);
        if (event.key === '-') zoomImagePreview(-0.25);
        if (event.key === '0') resetImagePreviewZoom();
    });
}

function initializeRevealAnimations() {
    const revealElements = Array.from(document.querySelectorAll('.reveal'));
    if (!revealElements.length) return;

    if (!('IntersectionObserver' in window)) {
        revealElements.forEach((element) => element.classList.add('active'));
        return;
    }

    revealElements.forEach((element) => element.classList.add('reveal-pending'));
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                entry.target.classList.remove('reveal-pending');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    revealElements.forEach((element, index) => {
        element.style.transitionDelay = index * 100 + 'ms';
        observer.observe(element);
    });
}

function initializeDocumentDelegates() {
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleDocumentKeydown);
    document.addEventListener('touchstart', handleSwipeBackTouchStart, { passive: true });
    document.addEventListener('touchend', handleSwipeBackTouchEnd, { passive: true });
    document.addEventListener('touchcancel', resetSwipeBackTracking, { passive: true });
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') {
            stopAllOfferViews({ beacon: true });
            stopAllOfferCardViews({ beacon: true });
        } else {
            resumeOpenOfferViews();
            window.App?.tracking?.refreshVisibleOfferCards?.();
        }
    });

    window.addEventListener('pagehide', () => {
        stopAllOfferViews({ beacon: true });
        stopAllOfferCardViews({ beacon: true });
    });

    window.addEventListener('hashchange', openModalFromHash);
}

/* MOBILE_MODAL_RETURN_TO_OPEN_POSITION */
function initializeMobileModalReturnPosition() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  let modalOpenScrollY = 0;

  function isMobile() {
    return window.innerWidth <= 768;
  }

  function getCurrentPageScrollY() {
    const bodyTop = document.body.style.top;

    // Αν το body είναι fixed, η πραγματική θέση βρίσκεται στο top: -1234px
    if (document.body.style.position === 'fixed' && bodyTop) {
      const parsedTop = parseInt(bodyTop, 10);
      if (!Number.isNaN(parsedTop)) {
        return Math.abs(parsedTop);
      }
    }

    return window.scrollY || window.pageYOffset || document.documentElement.scrollTop || 0;
  }

  function restorePageScrollY(scrollY) {
    if (!isMobile()) return;

    const html = document.documentElement;
    const body = document.body;
    const previousHtmlBehavior = html.style.scrollBehavior;
    const previousBodyBehavior = body.style.scrollBehavior;

    html.style.scrollBehavior = 'auto';
    body.style.scrollBehavior = 'auto';

    requestAnimationFrame(function () {
      window.scrollTo(0, scrollY);

      requestAnimationFrame(function () {
        window.scrollTo(0, scrollY);

        setTimeout(function () {
          window.scrollTo(0, scrollY);
          html.style.scrollBehavior = previousHtmlBehavior || '';
          body.style.scrollBehavior = previousBodyBehavior || '';
        }, 120);
      });
    });
  }

  // Πριν ανοίξει modal, αποθηκεύουμε τη θέση της σελίδας
  document.addEventListener('click', function (event) {
    const openButton = event.target.closest('[data-modal-target]');
    const closeButton = event.target.closest('[data-modal-close]');

    if (!openButton || closeButton || !isMobile()) return;

    modalOpenScrollY = getCurrentPageScrollY();
  }, true);

  // Όταν κλείνει modal, γυρίζουμε στη θέση από όπου άνοιξε
  document.addEventListener('click', function (event) {
    const closeButton = event.target.closest('[data-modal-close]');
    if (!closeButton || !isMobile()) return;

    const targetToOpen = closeButton.getAttribute('data-modal-target');

    // Αν το κουμπί κλείνει ένα modal και ανοίγει άλλο, μη γυρίσεις ακόμα τη σελίδα
    if (targetToOpen) return;

    const scrollY = modalOpenScrollY || getCurrentPageScrollY();

    setTimeout(function () {
      restorePageScrollY(scrollY);
    }, 0);
  }, true);

  // Και για κλείσιμο με Escape ή backdrop, αν υπάρχει τέτοια λειτουργία
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !isMobile()) return;

    const scrollY = modalOpenScrollY || getCurrentPageScrollY();

    setTimeout(function () {
      restorePageScrollY(scrollY);
    }, 0);
  }, true);
}

let uiInitialized = false;

function initializeUi() {
    if (uiInitialized) return;
    uiInitialized = true;

    initializeHeroIntroNavigation();
    initializeTypewriters();
    initializeCurrentYear();
    initializeChoiceMiniNav();
    initializeBottomNavOffersState();
    initializePremiumMenuActiveState();
    initializeCookieConsentState();
    openModalFromHash();
    setTimeout(openModalFromHash, 0);
    initializeDocumentDelegates();
    initializeImagePreviewControls();
    initializeRevealAnimations();
    initializeMobileModalReturnPosition();
    enhanceIbanWarnings();

}

window.App = window.App || {};
window.App.ui = {
    init: initializeUi,
    handleDocumentClick,
    handleDocumentKeydown,
};
