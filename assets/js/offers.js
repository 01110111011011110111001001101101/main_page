/* =========================================
   OFFERS / FILTERS / OFFER CARD BEHAVIOR
========================================= */

  const MOBILE_TITLES = Object.freeze({
    'Vodafone CU': 'Vodafone CU',
    'NOVA Q': 'NOVA Q',
    'Vodafone Σταθερή και Internet': 'Vodafone Internet',
    'Nova Σταθερό και Internet': 'Nova 5G Internet',
    'EON και Cosmote TV': 'EON + TV',
  });
  const VALID_OFFER_CATEGORIES = new Set(['all', 'mobile', 'internet', 'tv', 'guide', 'other']);
  const MOBILE_OFFERS_COLLAPSE_QUERY = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(max-width: 767px)')
    : { matches: false };

  let offerFilterTouched = false;

  function shouldCollapseOffersOnInitialLoad() {
    return MOBILE_OFFERS_COLLAPSE_QUERY.matches && window.location.hash !== '#offers';
  }

  function normalizeOfferCategory(category) {
    const normalized = String(category || 'all').trim().toLowerCase();
    return VALID_OFFER_CATEGORIES.has(normalized) ? normalized : 'all';
  }

  function syncFilterButtons(category) {
    const normalizedCategory = normalizeOfferCategory(category);
    document.querySelectorAll('[data-category-filter]').forEach((button) => {
        button.classList.toggle('is-active', button.dataset.categoryFilter === normalizedCategory);
    });
  }

  function ensureInitialOfferFilter() {
    const normalizedCategory = normalizeOfferCategory(activeCategory);
    activeCategory = offerFilterTouched ? normalizedCategory : 'all';
    syncFilterButtons(activeCategory);
  }

  function getCardTitle(card) {
    return card?.dataset?.offer || card?.querySelector('h3, .offer-title')?.textContent?.trim() || '';
  }

  function getPrimaryAction(card) {
    return card?.querySelector?.('.offer-actions [data-activation-guide-open], .offer-actions [data-modal-target]') || null;
  }

  function isInteractiveCardTarget(target, card) {
    if (!target || !card) return false;

    const interactive = target.closest([
      'a[href]',
      'button',
      'input',
      'select',
      'textarea',
      'summary',
      '[data-modal-target]',
      '[data-activation-guide-open]',
      '[data-preview-src]',
      '[data-copy-iban]',
      '[data-copy-beneficiary]',
      '[data-copy-email]',
      '[data-copy-text]',
    ].join(','));

    return Boolean(interactive && interactive !== card && card.contains(interactive));
  }

  function openOfferFromCard(card) {
    const primaryAction = getPrimaryAction(card);
    if (!primaryAction) return;

    primaryAction.click();
  }

  function handleOfferCardClick(event) {
    const card = event.currentTarget;
    if (isInteractiveCardTarget(event.target, card)) return;

    openOfferFromCard(card);
  }

  function makeOfferCardWholeClickTarget(card, primaryAction) {
    if (card.dataset.wholeCardAction === 'true') return;

    card.dataset.wholeCardAction = 'true';

    if (primaryAction.dataset.modalTarget) {
      card.dataset.cardModalTarget = primaryAction.dataset.modalTarget;
    }

    card.addEventListener('click', handleOfferCardClick);
  }

  function enhanceOfferCard(card) {
    const actions = card.querySelector('.offer-actions');
    const primaryAction = getPrimaryAction(card);
    if (!actions || !primaryAction) return;

    primaryAction.classList.add('offer-primary-cta');
    makeOfferCardWholeClickTarget(card, primaryAction);
    actions.classList.remove('offer-actions--card-trigger');
    actions.hidden = false;
    actions.removeAttribute('hidden');
    actions.removeAttribute('aria-hidden');

    const title = getCardTitle(card);
    if (title && MOBILE_TITLES[title] && !card.dataset.mobileTitle) {
      card.dataset.mobileTitle = MOBILE_TITLES[title];
    }

    actions.querySelectorAll('a[download]').forEach((link) => {
      link.classList.add('offer-download-cta');
    });
  }

  function enhanceMobileUi() {
    document.querySelectorAll('[data-offer-card]').forEach(enhanceOfferCard);
  }

function initializeOfferCardReveal() {
    const cards = Array.from(document.querySelectorAll('[data-offer-card]'));
    if (!cards.length || !('IntersectionObserver' in window)) {
        cards.forEach((card) => card.classList.add('is-visible'));
        return;
    }

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            const index = cards.indexOf(entry.target);
            entry.target.style.transitionDelay = `${Math.min(index * 80, 320)}ms`;
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        });
    }, { threshold: 0.18 });

    cards.forEach((card) => observer.observe(card));

    window.setTimeout(() => {
        if (cards.some((card) => card.classList.contains('is-visible'))) return;
        cards.forEach((card) => card.classList.add('is-visible'));
    }, 2400);
}

function getOfferCardSearchIndex(card) {
    if (!card) return '';
    if (card.dataset.searchIndex) return card.dataset.searchIndex;

    const title = card.querySelector('h3')?.textContent || '';
    const offer = card.dataset.offer || '';
    const category = card.dataset.category || '';
    const cardText = card.textContent || '';
    const index = `${title} ${offer} ${category} ${cardText}`
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    card.dataset.searchIndex = index;
    return index;
}

function updateOfferVisibility() {
    const normalizedQuery = (activeSearchQuery || '').toLowerCase().trim();

    if (!offerFilterTouched) {
        activeCategory = 'all';
    }

    const normalizedCategory = normalizeOfferCategory(activeCategory);
    const effectiveCategory = normalizedCategory || 'all';

    activeCategory = effectiveCategory;

    document.querySelectorAll('[data-offer-card]').forEach((card) => {
        const cardCategory = normalizeOfferCategory(card.dataset.category || '');
        const matchesCategory = effectiveCategory === 'all' || cardCategory === effectiveCategory;
        const matchesQuery = !normalizedQuery || getOfferCardSearchIndex(card).includes(normalizedQuery);
        const shouldShow = matchesCategory && matchesQuery;

        if (shouldShow) {
            card.hidden = false;
            card.removeAttribute('hidden');
            card.removeAttribute('aria-hidden');
        } else {
            card.hidden = true;
            card.setAttribute('aria-hidden', 'true');
            stopOfferCardView(card);
        }
    });

    syncFilterButtons(effectiveCategory);

    requestAnimationFrame(() => window.App?.tracking?.refreshVisibleOfferCards?.());

    if (typeof window.syncPremiumMenuActiveState === 'function') {
        window.syncPremiumMenuActiveState();
    }
}

function getOffersPanel() {
    return document.querySelector('[data-offers-panel]') || document.getElementById('offers');
}

function getStickyTopOffset() {
    const rootStyles = getComputedStyle(document.documentElement);
    const header = document.querySelector('.site-top-nav');
    const miniNav = document.querySelector('[data-choice-mini-nav]');
    const cssHeaderHeight = Number.parseFloat(rootStyles.getPropertyValue('--site-header-height')) || 0;
    const cssMiniNavHeight = Number.parseFloat(rootStyles.getPropertyValue('--choice-mini-nav-height')) || 0;
    const headerHeight = Math.ceil(header?.getBoundingClientRect().height || cssHeaderHeight || 0);
    const miniNavVisible = miniNav && !miniNav.hidden && document.body.classList.contains('choice-mini-nav-visible');
    const miniNavHeight = miniNavVisible ? Math.ceil(miniNav.getBoundingClientRect().height || cssMiniNavHeight || 0) : 0;

    return headerHeight + miniNavHeight + 8;
}

function scrollToOffersPanel(offersPanel = getOffersPanel(), behavior = 'auto') {
    if (!offersPanel) return;

    const scrollRoot = document.scrollingElement || document.documentElement;
    const currentTop = window.scrollY || scrollRoot.scrollTop || document.body.scrollTop || 0;
    const targetTop = offersPanel.getBoundingClientRect().top + currentTop - getStickyTopOffset();
    const safeTop = Math.max(0, Math.round(targetTop));

    window.scrollTo({
        top: safeTop,
        behavior,
    });

    if (behavior === 'auto') {
        scrollRoot.scrollTop = safeTop;
        document.documentElement.scrollTop = safeTop;
        document.body.scrollTop = safeTop;
    }
}

function scheduleOffersPanelScroll(offersPanel = getOffersPanel()) {
    if (!offersPanel) return;

    scrollToOffersPanel(offersPanel, 'auto');
    requestAnimationFrame(() => scrollToOffersPanel(offersPanel, 'auto'));
    window.setTimeout(() => scrollToOffersPanel(offersPanel, 'auto'), 180);
}

function getFirstVisibleOfferCard() {
    return Array.from(document.querySelectorAll('[data-offer-card]')).find((card) => !card.hidden) || null;
}

function scrollToOfferCard(card, behavior = 'auto') {
    if (!card) return;

    const scrollRoot = document.scrollingElement || document.documentElement;
    const currentTop = window.scrollY || scrollRoot.scrollTop || document.body.scrollTop || 0;
    const targetTop = card.getBoundingClientRect().top + currentTop - getStickyTopOffset() - 10;
    const safeTop = Math.max(0, Math.round(targetTop));

    window.scrollTo({
        top: safeTop,
        behavior,
    });

    if (behavior === 'auto') {
        scrollRoot.scrollTop = safeTop;
        document.documentElement.scrollTop = safeTop;
        document.body.scrollTop = safeTop;
    }
}

function scheduleFirstVisibleOfferCardScroll() {
    const scroll = () => scrollToOfferCard(getFirstVisibleOfferCard(), 'auto');

    requestAnimationFrame(scroll);
    window.setTimeout(scroll, 180);
}

function revealOffersPanel(options = {}) {
    const offersPanel = getOffersPanel();
    if (!offersPanel) return null;

    const wasHidden = offersPanel.hidden;
    offersPanel.hidden = false;
    offersPanel.classList.add('is-offers-open');

    if (wasHidden) {
        trackEvent('offers_panel_open', {
            label: options.source?.dataset?.label || options.label || 'offers',
            trigger: options.trigger || 'manual',
        });
    }

    if (options.scroll) {
        scheduleOffersPanelScroll(offersPanel);
    }

    return offersPanel;
}

function initializeOffersPanelState() {
    const offersPanel = getOffersPanel();
    if (!offersPanel) return;

    if (shouldCollapseOffersOnInitialLoad()) {
        offersPanel.hidden = true;
        offersPanel.classList.remove('is-offers-open');
        return;
    }

    offersPanel.hidden = false;
    offersPanel.classList.add('is-offers-open');

    if (window.location.hash === '#offers') {
        scheduleOffersPanelScroll(offersPanel);
    }
}

function getOffersAnchorFromEvent(event) {
    if (event.currentTarget?.matches?.('a[href="#offers"]')) {
        return event.currentTarget;
    }

    return event.target.closest?.('a[href="#offers"]') || null;
}

function handleOffersAnchorClick(event) {
    const offersLinkTarget = getOffersAnchorFromEvent(event);
    if (!offersLinkTarget) return;
    if (event.offersAnchorHandled) return;

    event.offersAnchorHandled = true;
    document.body?.classList.add('hero-nav-visible');

    const offersPanel = revealOffersPanel({
        source: offersLinkTarget,
        trigger: 'offers_link',
        scroll: false,
    });

    requestAnimationFrame(() => scheduleOffersPanelScroll(offersPanel));

    if (offersLinkTarget.dataset.track && !shouldSkipExplicitTracking(offersLinkTarget)) {
        trackEvent(offersLinkTarget.dataset.track, getExplicitTrackParams(offersLinkTarget));
    }
}

function initializeOffersAnchorLinks() {
    document.querySelectorAll('a[href="#offers"]').forEach((link) => {
        link.dataset.offersAnchorBound = 'true';
    });
}

function applyOfferFilter(category, source = null) {
    const normalizedCategory = normalizeOfferCategory(category || 'all');

    revealOffersPanel({
        source,
        trigger: source?.closest?.('.offer-filter-bar') ? 'filter_bar' : 'category_filter',
    });

    if (normalizedCategory === 'all') {
        resetOfferFilterToAll();

        trackEvent('category_filter_click', {
            category: 'all',
            label: source?.dataset?.label || 'all',
        });

        if (source && !source.closest('.offer-filter-bar')) {
            scheduleOffersPanelScroll();
        }

        requestAnimationFrame(() => window.App?.tracking?.refreshVisibleOfferCards?.());

        if (typeof window.syncPremiumMenuActiveState === 'function') {
            window.syncPremiumMenuActiveState();
        }

        return;
    }

    offerFilterTouched = true;
    activeCategory = normalizedCategory;
    activeSearchQuery = '';

    syncFilterButtons(normalizedCategory);
    updateOfferVisibility();

    trackEvent('category_filter_click', {
        category: normalizedCategory,
        label: source?.dataset?.label || normalizedCategory,
    });

    if (source && !source.closest('.offer-filter-bar')) {
        scheduleOffersPanelScroll();
    }

    scheduleFirstVisibleOfferCardScroll();
    requestAnimationFrame(() => window.App?.tracking?.refreshVisibleOfferCards?.());

    if (typeof window.syncPremiumMenuActiveState === 'function') {
        window.syncPremiumMenuActiveState();
    }
}


function enhanceIbanWarnings() {
    document.querySelectorAll('[data-copy-iban]').forEach((button) => {
        if (button.nextElementSibling?.classList?.contains('iban-security-note')) return;

        const warning = document.createElement('p');
        warning.className = 'iban-security-note';
        warning.textContent = 'Πριν από οποιαδήποτε κατάθεση, επιβεβαιώστε τα στοιχεία με τον Συνεταιρισμό.';
        button.insertAdjacentElement('afterend', warning);
    });
}

async function copyIbanWithFeedback(text, element) {
    if (!text || !element) return;

    const label = element.querySelector('span');
    const iconCopy = element.querySelector('.icon-copy');
    const iconCheck = element.querySelector('.icon-check');
    const originalLabel = element.dataset.copyLabel || label?.textContent?.trim() || 'Αντιγραφή IBAN';

    if (!element.dataset.copyLabel) {
        element.dataset.copyLabel = originalLabel;
    }

    try {
        if (typeof writeClipboard === 'function') {
            await writeClipboard(text);
        } else if (navigator.clipboard) {
            await navigator.clipboard.writeText(text);
        } else if (typeof copyIBAN === 'function') {
            await copyIBAN(text, element);
            return;
        } else {
            throw new Error('Clipboard API not available');
        }

        showToast('Αντιγράφηκε', 'success');

        if (iconCopy && iconCheck) {
            iconCopy.classList.add('hidden');
            iconCheck.classList.remove('hidden');
        }

        if (label) {
            label.textContent = 'Αντιγράφηκε ✓';
        }

        element.classList.add('border-green-500', 'bg-green-50');

        setTimeout(() => {
            if (iconCopy && iconCheck) {
                iconCopy.classList.remove('hidden');
                iconCheck.classList.add('hidden');
            }

            if (label) {
                label.textContent = element.dataset.copyLabel || originalLabel;
            }

            element.classList.remove('border-green-500', 'bg-green-50');
        }, 2000);
    } catch (_error) {
        showToast('Η αντιγραφή απέτυχε', 'error');
    }
}

function initializeMobileMenuOffersButton() {
    document.querySelectorAll('.js-menu-mobile-offers').forEach(function (button) {
        if (button.dataset.mobileOffersBound === 'true') return;
        button.dataset.mobileOffersBound = 'true';

        button.addEventListener('click', function (event) {
            event.preventDefault();

            if (typeof closeSidebarInstantly === 'function') {
                closeSidebarInstantly();
            }

            const mobileFilterButton =
                document.querySelector('.quick-action-mobile[data-category-filter="mobile"]') ||
                document.querySelector('.offer-filter-bar [data-category-filter="mobile"]');

            if (mobileFilterButton) {
                mobileFilterButton.click();
            }

            setTimeout(function () {
                const offersSection = document.querySelector('#offers');

                if (offersSection) {
                    scrollToOffersPanel(offersSection);
                }
            }, 150);
        });
    });
}

let offersInitialized = false;

function initializeOffers() {
    if (offersInitialized) return;
    offersInitialized = true;

    enhanceMobileUi();
    ensureInitialOfferFilter();
    initializeOffersPanelState();
    initializeOffersAnchorLinks();
    initializeMobileMenuOffersButton();
    updateOfferVisibility();
    initializeOfferCardReveal();
}

function resetOfferFilterToAll() {
    const offersPanel = getOffersPanel();

    offerFilterTouched = false;
    activeCategory = 'all';
    activeSearchQuery = '';

    if (offersPanel) {
        offersPanel.hidden = false;
        offersPanel.removeAttribute('hidden');
        offersPanel.classList.add('is-offers-open');
    }

    syncFilterButtons('all');

    document.querySelectorAll('#offersContainer [data-offer-card]').forEach((card, index) => {
        card.hidden = false;
        card.removeAttribute('hidden');
        card.removeAttribute('aria-hidden');
        card.classList.add('is-visible');
        card.style.transitionDelay = `${Math.min(index * 80, 320)}ms`;
    });

    requestAnimationFrame(() => {
        document.querySelectorAll('#offersContainer [data-offer-card]').forEach((card, index) => {
            card.hidden = false;
            card.removeAttribute('hidden');
            card.removeAttribute('aria-hidden');
            card.classList.add('is-visible');
            card.style.transitionDelay = `${Math.min(index * 80, 320)}ms`;
        });

        requestAnimationFrame(() => window.App?.tracking?.refreshVisibleOfferCards?.());
    });

    if (typeof window.syncPremiumMenuActiveState === 'function') {
        window.syncPremiumMenuActiveState();
    }
}

function syncOffersAfterRender() {
    enhanceMobileUi();
    updateOfferVisibility();
    initializeOfferCardReveal();
}

window.enhanceMobileUi = enhanceMobileUi;
window.App = window.App || {};
window.App.offers = {
    init: initializeOffers,
    applyFilter: applyOfferFilter,
    revealPanel: revealOffersPanel,
    syncAfterRender: syncOffersAfterRender,
    resetFilterToAll: resetOfferFilterToAll,
    updateVisibility: updateOfferVisibility,
    scrollToPanel: scrollToOffersPanel,
    schedulePanelScroll: scheduleOffersPanelScroll,
    handleOffersAnchorClick,
    enhanceIbanWarnings,
    copyIbanWithFeedback,
};
