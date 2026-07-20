/* =========================================
   ANALYTICS / TRACKING
   Μεταφέρθηκε από το main.js
========================================= */

/* =========================================
   1. CORE SETTINGS & TRACKING
   ========================================= */
const GA_MEASUREMENT_ID = 'G-LHQ9SHKY6J';
const TRACKED_OFFERS = Object.freeze({
    novaLinePhone: 'Σταθερό και Internet',
    internetChoiceModal: 'Επιλογή Σταθερής & Internet',
    vodafoneFixedModal: 'Vodafone Σταθερή & Internet',
    novaEonModal: 'NOVA EON TV',
    gprotasisModal: 'GProtasis',
});

const ANALYTICS_SCROLL_THRESHOLDS = [25, 50, 75, 90, 100];
const ANALYTICS_ACTIVE_FLUSH_SECONDS = 15;
const ANALYTICS_ACTIVITY_IDLE_MS = 60000;
const ANALYTICS_SECTION_MIN_SECONDS = 2;
const ANALYTICS_DEAD_CLICK_COOLDOWN_MS = 5000;
const ANALYTICS_RAGE_CLICK_WINDOW_MS = 1200;
const ANALYTICS_RAGE_CLICK_DISTANCE_PX = 36;

const behaviorAnalyticsState = {
    initialized: false,
    sessionId: '',
    sectionObserver: null,
    modalObserver: null,
    visibleSectionStarts: new Map(),
    seenSections: new Set(),
    modalStarts: new Map(),
    sentScrollDepths: new Set(),
    maxScrollPercent: 0,
    activeMs: 0,
    lastActiveSampleAt: Date.now(),
    lastActivityAt: Date.now(),
    lastActiveFlushSeconds: 0,
    activeIntervalId: null,
    lastDeadClickAt: 0,
    recentClicks: [],
};

function runWhenIdle(callback) {
    if ('requestIdleCallback' in window) {
        window.requestIdleCallback(callback, { timeout: 2000 });
    } else {
        window.setTimeout(callback, 200);
    }
}

function loadAllTracking() {
    if (window.trackingLoaded) {
        scheduleTrackingFeatures();
        return;
    }
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () {
        window.dataLayer.push(arguments);
    };

    const script = document.createElement('script');
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
    script.async = true;
    document.head.appendChild(script);

    window.gtag('js', new Date());
    window.gtag('config', GA_MEASUREMENT_ID, {
        anonymize_ip: true,
        send_page_view: false,
    });
    window.trackingLoaded = true;
    trackEvent('page_view', {
        page_title: document.title,
        page_location: window.location.href,
        page_path: window.location.pathname,
    });
    scheduleTrackingFeatures();
}

function hasAnalyticsConsent() {
    try {
        return localStorage.getItem('cookieConsent') === 'accepted';
    } catch (_) {
        return false;
    }
}

function trackEvent(eventName, params = {}, legacyLabel, legacyParams = {}) {
    let normalizedEventName = eventName;
    let normalizedParams = params;

    if (typeof params === 'string') {
        normalizedEventName = params;
        normalizedParams = {
            event_category: eventName,
            event_label: legacyLabel,
            ...legacyParams,
        };
    }

    if (!hasAnalyticsConsent() || typeof window.gtag !== 'function') return;

    const finalParams = sanitizeAnalyticsParams({
        ...getAnalyticsBaseParams(),
        ...(normalizedParams || {}),
    });

    window.__pksaaAnalyticsEvents = window.__pksaaAnalyticsEvents || [];
    window.__pksaaAnalyticsEvents.push({
        event: normalizedEventName,
        params: finalParams,
        sent_at: new Date().toISOString(),
    });
    if (window.__pksaaAnalyticsEvents.length > 80) {
        window.__pksaaAnalyticsEvents.shift();
    }

    window.gtag('event', normalizedEventName, finalParams);
}

function getOfferName(modalId) {
    return TRACKED_OFFERS[modalId] || '';
}

function getOpenOfferContext() {
    const openOffer = Object.keys(TRACKED_OFFERS).find((modalId) => {
        const modal = document.getElementById(modalId);
        return modal && !modal.classList.contains('hidden');
    });

    return openOffer ? { offer_id: openOffer, offer_name: getOfferName(openOffer) } : {};
}

function getOpenTrackedModalId() {
    return Object.keys(TRACKED_OFFERS).find((modalId) => {
        const modal = document.getElementById(modalId);
        return modal && !modal.classList.contains('hidden');
    }) || '';
}

function getAnalyticsSessionId() {
    if (behaviorAnalyticsState.sessionId) return behaviorAnalyticsState.sessionId;

    try {
        const existing = sessionStorage.getItem('pksaaAnalyticsSessionId');
        if (existing) {
            behaviorAnalyticsState.sessionId = existing;
            return existing;
        }

        const generated = `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
        sessionStorage.setItem('pksaaAnalyticsSessionId', generated);
        behaviorAnalyticsState.sessionId = generated;
        return generated;
    } catch (_) {
        behaviorAnalyticsState.sessionId = behaviorAnalyticsState.sessionId || `s_${Date.now().toString(36)}`;
        return behaviorAnalyticsState.sessionId;
    }
}

function getDeviceType() {
    if (window.matchMedia?.('(pointer: coarse)').matches || window.innerWidth < 768) return 'mobile';
    if (window.innerWidth < 1024) return 'tablet';
    return 'desktop';
}

function getAnalyticsBaseParams() {
    return {
        site_session_id: getAnalyticsSessionId(),
        page_path: window.location.pathname || '/',
        page_hash: window.location.hash || '',
        viewport_width: window.innerWidth || 0,
        viewport_height: window.innerHeight || 0,
        device_type: getDeviceType(),
        language: document.documentElement.lang || navigator.language || 'el',
    };
}

function sanitizeAnalyticsValue(value, key = '') {
    if (value === undefined || value === null || value === '') return undefined;

    if (typeof value === 'number') {
        return Number.isFinite(value) ? value : undefined;
    }

    if (typeof value === 'boolean') return value ? 'true' : 'false';

    const maxLength = key === 'page_location' ? 300 : 120;
    return String(value)
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, maxLength);
}

function sanitizeAnalyticsParams(params = {}) {
    return Object.entries(params).reduce((result, [key, value]) => {
        const sanitized = sanitizeAnalyticsValue(value, key);
        if (sanitized !== undefined) result[key] = sanitized;
        return result;
    }, {});
}

function getElementText(element) {
    if (!element) return '';
    return (
        element.dataset?.label ||
        element.getAttribute?.('aria-label') ||
        element.querySelector?.('h1, h2, h3, strong, span')?.textContent ||
        element.textContent ||
        ''
    ).replace(/\s+/g, ' ').trim();
}

function getSectionId(section) {
    if (!section) return 'unknown';
    if (section.id) return section.id;
    if (section.classList.contains('landing-hero')) return 'hero';
    if (section.classList.contains('choice-hub')) return 'choice_hub';
    if (section.classList.contains('viber-community-section')) return 'viber_community';
    if (section.classList.contains('contact-section')) return 'contact';
    if (section.classList.contains('offers-section')) return 'offers';
    return Array.from(section.classList).find(Boolean) || section.tagName.toLowerCase();
}

function getSectionName(section) {
    if (!section) return '';
    return section.querySelector('h1, h2, [aria-label]')?.textContent?.replace(/\s+/g, ' ').trim() ||
        section.getAttribute('aria-label') ||
        getSectionId(section);
}

function getClosestSection(element) {
    return element?.closest?.('main > section, section[id], #siteLegalBar, footer, nav') || null;
}

function getSectionContext(element) {
    const section = getClosestSection(element);
    return {
        section_id: getSectionId(section),
        section_name: getSectionName(section),
    };
}

function getOfferContextFromElement(element) {
    const card = element?.closest?.('[data-offer-card]');
    const modal = element?.closest?.('.modal-backdrop');
    const modalId = modal?.id || element?.dataset?.modalTarget || card?.querySelector?.('[data-modal-target]')?.dataset?.modalTarget || '';
    const offerName = element?.dataset?.offer ||
        element?.dataset?.activationOffer ||
        card?.dataset?.offer ||
        getOfferName(modalId);
    const category = element?.dataset?.category || card?.dataset?.category || '';

    return {
        offer_id: modalId || offerName || '',
        offer_name: offerName || '',
        category,
    };
}

function getClickZone(event) {
    const horizontal = event.clientX < window.innerWidth / 3
        ? 'left'
        : event.clientX > (window.innerWidth * 2) / 3
            ? 'right'
            : 'center';
    const vertical = event.clientY < window.innerHeight / 3
        ? 'top'
        : event.clientY > (window.innerHeight * 2) / 3
            ? 'bottom'
            : 'middle';

    return `${vertical}_${horizontal}`;
}

function getLinkType(element) {
    const href = element?.getAttribute?.('href') || '';
    if (!href) return '';
    if (href.startsWith('tel:')) return 'phone';
    if (href.startsWith('mailto:')) return 'email';
    if (href.includes('invite.viber.com')) return 'viber';
    if (href.includes('.pdf') || element.hasAttribute('download')) return 'document';
    if (href.startsWith('#')) return 'anchor';
    if (/^https?:\/\//.test(href)) return 'external';
    return 'internal';
}

function getInteractionType(element) {
    if (!element) return 'unknown';
    if (element.dataset.activationGuideOpen !== undefined) return 'activation_guide_open';
    if (element.dataset.categoryFilter) return 'category_filter';
    if (element.dataset.cookieConsent) return 'cookie_consent';
    if (element.dataset.modalClose) return 'modal_close';
    if (element.dataset.modalTarget || element.dataset.sidebarTarget) return 'modal_open';
    if (element.classList.contains('offer-primary-cta')) return 'offer_primary_cta';
    if (element.hasAttribute('download')) return 'document_download';
    return getLinkType(element) || element.tagName.toLowerCase();
}

function getActionableElement(target) {
    return target.closest?.([
        'a[href]',
        'button',
        'summary',
        '[role="button"]',
        '[data-modal-target]',
        '[data-modal-close]',
        '[data-category-filter]',
        '[data-activation-guide-open]',
        '[data-cookie-consent]',
        '[data-preview-src]',
        '[data-copy-iban]',
        '[data-copy-text]',
        '[data-copy-email]',
        '[data-copy-beneficiary]',
    ].join(','));
}

function getModalName(modal) {
    if (!modal) return '';
    return getOfferName(modal.id) ||
        modal.querySelector('h1, h2, h3, [data-activation-offer]')?.textContent?.replace(/\s+/g, ' ').trim() ||
        modal.getAttribute('aria-label') ||
        modal.id;
}

function getModalType(modal) {
    if (!modal) return 'unknown';
    if (modal.id === 'activationGuideModal') return 'activation_guide';
    if (TRACKED_OFFERS[modal.id]) return 'offer';
    if (modal.id?.toLowerCase().includes('cookie')) return 'cookies';
    if (modal.id?.toLowerCase().includes('privacy')) return 'privacy';
    if (modal.id?.toLowerCase().includes('contact')) return 'contact';
    if (modal.id?.toLowerCase().includes('image')) return 'document_preview';
    return 'info';
}

function hasAnalyticsBlockingLayer() {
    const sidebar = document.getElementById('sidebarMenu');
    return Boolean(
        document.querySelector('.modal-backdrop:not(.hidden)') ||
        (sidebar && !sidebar.classList.contains('-translate-x-full'))
    );
}

function getVisibleRatio(element) {
    if (!element || element.hidden) return 0;
    const rect = element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return 0;
    const visibleWidth = Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0);
    const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    const visibleArea = Math.max(0, visibleWidth) * Math.max(0, visibleHeight);
    return visibleArea / Math.max(1, rect.width * rect.height);
}

function getTrackedSections() {
    return Array.from(new Set([
        ...document.querySelectorAll('main > section'),
        ...document.querySelectorAll('#siteLegalBar'),
    ]));
}

function getCurrentSectionId() {
    let bestSection = null;
    let bestRatio = 0;

    getTrackedSections().forEach((section) => {
        const ratio = getVisibleRatio(section);
        if (ratio > bestRatio) {
            bestRatio = ratio;
            bestSection = section;
        }
    });

    return getSectionId(bestSection);
}

function startSectionView(section) {
    if (!section || behaviorAnalyticsState.visibleSectionStarts.has(section) || hasAnalyticsBlockingLayer()) return;

    behaviorAnalyticsState.visibleSectionStarts.set(section, Date.now());
    const sectionId = getSectionId(section);

    if (!behaviorAnalyticsState.seenSections.has(sectionId)) {
        behaviorAnalyticsState.seenSections.add(sectionId);
        trackEvent('section_view', {
            section_id: sectionId,
            section_name: getSectionName(section),
        });
    }
}

function stopSectionView(section, options = {}) {
    const startedAt = behaviorAnalyticsState.visibleSectionStarts.get(section);
    if (!startedAt) return;

    behaviorAnalyticsState.visibleSectionStarts.delete(section);
    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    if (seconds < ANALYTICS_SECTION_MIN_SECONDS && !options.force) return;

    trackEvent('section_time_spent', {
        section_id: getSectionId(section),
        section_name: getSectionName(section),
        engagement_time_msec: seconds * 1000,
        engagement_time_sec: seconds,
        value: seconds,
        ...(options.beacon ? { transport_type: 'beacon' } : {}),
    });
}

function stopAllSectionViews(options = {}) {
    Array.from(behaviorAnalyticsState.visibleSectionStarts.keys()).forEach((section) => {
        stopSectionView(section, options);
    });
}

function refreshVisibleSections() {
    if (!behaviorAnalyticsState.initialized) return;

    if (hasAnalyticsBlockingLayer() || document.visibilityState === 'hidden') {
        stopAllSectionViews();
        return;
    }

    getTrackedSections().forEach((section) => {
        if (getVisibleRatio(section) >= 0.45) startSectionView(section);
        else stopSectionView(section);
    });
}

function getScrollPercent() {
    const scrollable = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    return Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)));
}

function checkScrollDepth() {
    const percent = getScrollPercent();
    behaviorAnalyticsState.maxScrollPercent = Math.max(behaviorAnalyticsState.maxScrollPercent, percent);

    ANALYTICS_SCROLL_THRESHOLDS.forEach((threshold) => {
        if (percent < threshold || behaviorAnalyticsState.sentScrollDepths.has(threshold)) return;
        behaviorAnalyticsState.sentScrollDepths.add(threshold);
        trackEvent('scroll_depth', {
            scroll_percent: threshold,
            max_scroll_percent: percent,
            current_section: getCurrentSectionId(),
        });
    });
}

function markAnalyticsActivity() {
    behaviorAnalyticsState.lastActivityAt = Date.now();
}

function sampleActiveTime() {
    const now = Date.now();
    const elapsed = now - behaviorAnalyticsState.lastActiveSampleAt;
    const isActive = document.visibilityState !== 'hidden' &&
        now - behaviorAnalyticsState.lastActivityAt <= ANALYTICS_ACTIVITY_IDLE_MS;

    if (isActive && elapsed > 0) {
        behaviorAnalyticsState.activeMs += elapsed;
    }

    behaviorAnalyticsState.lastActiveSampleAt = now;
}

function flushActiveTime(reason = 'heartbeat', options = {}) {
    sampleActiveTime();
    const activeSeconds = Math.round(behaviorAnalyticsState.activeMs / 1000);
    const deltaSeconds = activeSeconds - behaviorAnalyticsState.lastActiveFlushSeconds;

    if (!options.force && deltaSeconds < ANALYTICS_ACTIVE_FLUSH_SECONDS) return;

    behaviorAnalyticsState.lastActiveFlushSeconds = activeSeconds;
    trackEvent('page_active_time', {
        reason,
        active_time_sec: activeSeconds,
        interval_sec: Math.max(0, deltaSeconds),
        max_scroll_percent: behaviorAnalyticsState.maxScrollPercent,
        current_section: getCurrentSectionId(),
        open_modal_id: getOpenTrackedModalId(),
        ...(options.beacon ? { transport_type: 'beacon' } : {}),
    });
}

function trackModalOpen(modal) {
    if (!modal?.id || behaviorAnalyticsState.modalStarts.has(modal.id)) return;

    behaviorAnalyticsState.modalStarts.set(modal.id, Date.now());
    stopAllSectionViews();
    trackEvent('modal_open', {
        modal_id: modal.id,
        modal_name: getModalName(modal),
        modal_type: getModalType(modal),
        ...getOfferContextFromElement(modal),
    });
}

function trackModalClose(modal, options = {}) {
    if (!modal?.id) return;

    const startedAt = behaviorAnalyticsState.modalStarts.get(modal.id);
    behaviorAnalyticsState.modalStarts.delete(modal.id);

    if (!startedAt) {
        refreshVisibleSections();
        return;
    }

    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    trackEvent('modal_close', {
        modal_id: modal.id,
        modal_name: getModalName(modal),
        modal_type: getModalType(modal),
        engagement_time_msec: seconds * 1000,
        engagement_time_sec: seconds,
        value: seconds,
        ...(options.beacon ? { transport_type: 'beacon' } : {}),
    });

    if (seconds > 0) {
        trackEvent('modal_time_spent', {
            modal_id: modal.id,
            modal_name: getModalName(modal),
            modal_type: getModalType(modal),
            engagement_time_msec: seconds * 1000,
            engagement_time_sec: seconds,
            value: seconds,
            ...(options.beacon ? { transport_type: 'beacon' } : {}),
        });
    }

    requestAnimationFrame(refreshVisibleSections);
}

function initializeModalAnalytics() {
    const modals = Array.from(document.querySelectorAll('.modal-backdrop[id]'));
    if (!modals.length || behaviorAnalyticsState.modalObserver) return;

    behaviorAnalyticsState.modalObserver = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.attributeName !== 'class') return;
            const modal = mutation.target;
            if (!modal.classList.contains('modal-backdrop')) return;

            if (modal.classList.contains('hidden')) trackModalClose(modal);
            else trackModalOpen(modal);
        });
    });

    modals.forEach((modal) => {
        behaviorAnalyticsState.modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
        if (!modal.classList.contains('hidden')) trackModalOpen(modal);
    });
}

function trackRageClick(event, context) {
    const now = Date.now();
    const recentClicks = behaviorAnalyticsState.recentClicks.filter((click) => {
        return now - click.time <= ANALYTICS_RAGE_CLICK_WINDOW_MS &&
            Math.hypot(click.x - event.clientX, click.y - event.clientY) <= ANALYTICS_RAGE_CLICK_DISTANCE_PX;
    });

    recentClicks.push({ x: event.clientX, y: event.clientY, time: now });
    behaviorAnalyticsState.recentClicks = recentClicks;

    if (recentClicks.length !== 3) return;

    trackEvent('rage_click', {
        ...context,
        click_zone: getClickZone(event),
        click_count: recentClicks.length,
    });
}

function trackBehaviorClick(event) {
    markAnalyticsActivity();

    const actionable = getActionableElement(event.target);
    const context = {
        ...getSectionContext(event.target),
        ...getOfferContextFromElement(event.target),
        click_zone: getClickZone(event),
    };

    trackRageClick(event, context);

    if (!actionable) {
        const now = Date.now();
        if (now - behaviorAnalyticsState.lastDeadClickAt < ANALYTICS_DEAD_CLICK_COOLDOWN_MS) return;
        behaviorAnalyticsState.lastDeadClickAt = now;
        trackEvent('dead_click', {
            ...context,
            element_text: getElementText(event.target),
        });
        return;
    }

    trackEvent('ui_click', {
        ...context,
        interaction_type: getInteractionType(actionable),
        element_label: getElementText(actionable),
        element_tag: actionable.tagName.toLowerCase(),
        target_modal: actionable.dataset.modalTarget || actionable.dataset.sidebarTarget || actionable.dataset.modalClose || '',
        tracked_event: actionable.dataset.track || '',
        link_type: getLinkType(actionable),
    });
}

function initializeSectionAnalytics() {
    const sections = getTrackedSections();
    if (!sections.length || behaviorAnalyticsState.sectionObserver) return;

    if ('IntersectionObserver' in window) {
        behaviorAnalyticsState.sectionObserver = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.intersectionRatio >= 0.45) startSectionView(entry.target);
                else stopSectionView(entry.target);
            });
        }, { threshold: [0, 0.25, 0.45, 0.7, 1] });

        sections.forEach((section) => behaviorAnalyticsState.sectionObserver.observe(section));
    }

    refreshVisibleSections();
}

function handleBehaviorVisibilityChange() {
    if (document.visibilityState === 'hidden') {
        flushActiveTime('visibility_hidden', { force: true, beacon: true });
        stopAllSectionViews({ force: true, beacon: true });
        Array.from(behaviorAnalyticsState.modalStarts.keys()).forEach((modalId) => {
            const modal = document.getElementById(modalId);
            if (modal) trackModalClose(modal, { beacon: true });
        });
        return;
    }

    behaviorAnalyticsState.lastActiveSampleAt = Date.now();
    markAnalyticsActivity();
    refreshVisibleSections();
}

function initializeBehaviorAnalytics() {
    if (behaviorAnalyticsState.initialized || !hasAnalyticsConsent()) return;

    behaviorAnalyticsState.initialized = true;
    behaviorAnalyticsState.sessionId = getAnalyticsSessionId();
    behaviorAnalyticsState.lastActiveSampleAt = Date.now();
    behaviorAnalyticsState.lastActivityAt = Date.now();

    initializeSectionAnalytics();
    initializeModalAnalytics();
    checkScrollDepth();

    ['click', 'keydown', 'touchstart', 'mousemove', 'scroll'].forEach((eventName) => {
        const listener = eventName === 'click' ? trackBehaviorClick : markAnalyticsActivity;
        const options = eventName === 'scroll' || eventName === 'touchstart' ? { passive: true } : undefined;
        document.addEventListener(eventName, listener, options);
    });

    window.addEventListener('scroll', () => {
        markAnalyticsActivity();
        window.requestAnimationFrame(checkScrollDepth);
        window.requestAnimationFrame(refreshVisibleSections);
    }, { passive: true });
    window.addEventListener('resize', () => {
        checkScrollDepth();
        refreshVisibleSections();
    }, { passive: true });
    document.addEventListener('visibilitychange', handleBehaviorVisibilityChange);
    window.addEventListener('pagehide', () => {
        flushActiveTime('pagehide', { force: true, beacon: true });
        stopAllSectionViews({ force: true, beacon: true });
        Array.from(behaviorAnalyticsState.modalStarts.keys()).forEach((modalId) => {
            const modal = document.getElementById(modalId);
            if (modal) trackModalClose(modal, { beacon: true });
        });
    });

    behaviorAnalyticsState.activeIntervalId = window.setInterval(() => {
        flushActiveTime('heartbeat');
    }, ANALYTICS_ACTIVE_FLUSH_SECONDS * 1000);

    window.PKSAA_ANALYTICS = {
        flush: () => flushActiveTime('manual', { force: true }),
        refresh: refreshVisibleSections,
        getDebugEvents: () => window.__pksaaAnalyticsEvents || [],
    };
}

/* =========================================
   OFFER AND LINK TRACKING
========================================= */

function startOfferView(modalId, options = {}) {
    const offerName = getOfferName(modalId);
    if (!offerName || activeOfferViews[modalId]) return;

    activeOfferViews[modalId] = Date.now();
    if (options.trackOpen !== false) {
        trackEvent('Offer Engagement', 'offer_open', offerName, {
            offer_id: modalId,
            offer_name: offerName,
        });
    }
}

function stopOfferView(modalId, options = {}) {
    const offerName = getOfferName(modalId);
    const startedAt = activeOfferViews[modalId];
    if (!offerName || !startedAt) return;

    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    delete activeOfferViews[modalId];

    trackEvent('Offer Engagement', 'offer_close', offerName, {
        offer_id: modalId,
        offer_name: offerName,
        engagement_time_sec: seconds,
        ...(options.beacon ? { transport_type: 'beacon' } : {}),
    });

    if (seconds > 0) {
        trackEvent('Offer Engagement', 'offer_time_spent', offerName, {
            offer_id: modalId,
            offer_name: offerName,
            engagement_time_sec: seconds,
            value: seconds,
            ...(options.beacon ? { transport_type: 'beacon' } : {}),
        });
    }
}

function stopAllOfferViews(options = {}) {
    Object.keys(activeOfferViews).forEach((modalId) => stopOfferView(modalId, options));
}

function resumeOpenOfferViews() {
    Object.keys(TRACKED_OFFERS).forEach((modalId) => {
        const modal = document.getElementById(modalId);
        if (modal && !modal.classList.contains('hidden')) startOfferView(modalId, { trackOpen: false });
    });
}

function getOfferCardContext(card) {
    const modalId = card?.dataset?.modalTarget || card?.querySelector?.('[data-modal-target]')?.dataset?.modalTarget || '';
    const offerName = card?.dataset?.offer || getOfferName(modalId);
    const category = card?.dataset?.category || '';
    return offerName ? { offer_id: modalId || offerName, offer_name: offerName, category } : null;
}

function startOfferCardView(card) {
    const context = getOfferCardContext(card);
    if (!context || offerCardViewStarts.has(card) || hasOpenBlockingLayer()) return;
    offerCardViewStarts.set(card, Date.now());

    if (!offerCardViewed.has(context.offer_id)) {
        offerCardViewed.add(context.offer_id);
        trackEvent('offer_view', context);
    }
}

function stopOfferCardView(card, options = {}) {
    const context = getOfferCardContext(card);
    const startedAt = offerCardViewStarts.get(card);
    if (!context || !startedAt) return;

    offerCardViewStarts.delete(card);
    const seconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
    if (seconds < MIN_CARD_VIEW_SECONDS) return;

    trackEvent('offer_card_time_spent', {
        ...context,
        engagement_time_sec: seconds,
        value: seconds,
        ...(options.beacon ? { transport_type: 'beacon' } : {}),
    });
}

function stopAllOfferCardViews(options = {}) {
    Array.from(offerCardViewStarts.keys()).forEach((card) => stopOfferCardView(card, options));
}

function refreshVisibleOfferCards() {
    if (!hasAnalyticsConsent() || hasOpenBlockingLayer()) {
        stopAllOfferCardViews();
        return;
    }
    trackedOfferCards.forEach((card) => {
        if (!card.hidden && (offerCardVisibility.get(card) || 0) >= 0.5) startOfferCardView(card);
        else stopOfferCardView(card);
    });
}

let offerCardObserver;
function initializeOfferCardTracking() {
    if (!hasAnalyticsConsent()) return;
    trackedOfferCards = Array.from(document.querySelectorAll('[data-offer-card]'));
    if (!trackedOfferCards.length || !('IntersectionObserver' in window)) return;

    offerCardObserver?.disconnect();
    offerCardObserver = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            offerCardVisibility.set(entry.target, entry.intersectionRatio);
            if (entry.intersectionRatio >= 0.5) startOfferCardView(entry.target);
            else stopOfferCardView(entry.target);
        });
    }, { threshold: [0, 0.5] });

    trackedOfferCards.forEach((card) => offerCardObserver.observe(card));
}

function trackLinkClick(link) {
    const href = link.getAttribute('href') || '';
    const context = getOpenOfferContext();

    if (href.startsWith('assets/docs/')) {
        const documentName = getFileName(href);
        trackEvent('pdf_download', {
            ...context,
            document_name: documentName,
            label: link.dataset.label || documentName,
            offer_name: link.dataset.offer || context.offer_name,
        });
        return;
    }

    if (href.startsWith('tel:')) {
        trackEvent('phone_click', {
            ...context,
            contact_type: 'phone',
            label: link.dataset.label || 'phone',
        });
        return;
    }

    if (href.startsWith('mailto:')) {
        trackEvent('email_click', {
            ...context,
            contact_type: 'email',
            label: link.dataset.label || 'email',
        });
        return;
    }

    if (href.includes('invite.viber.com')) {
        trackEvent('viber_click', {
            destination: 'viber_community',
            label: link.dataset.label || 'Viber Community',
        });
    }
}

function getExplicitTrackParams(target) {
    return {
        label: target.dataset.label || target.textContent.trim().replace(/\s+/g, ' ').slice(0, 80),
        offer_name: target.dataset.offer || undefined,
        category: target.dataset.category || undefined,
    };
}

function shouldSkipExplicitTracking(target) {
    if (!target) return true;
    const link = target.closest('a[href]');
    if (!link) return false;

    const href = link.getAttribute('href') || '';
    return href.startsWith('tel:') ||
        href.startsWith('mailto:') ||
        href.startsWith('assets/docs/') ||
        href.includes('invite.viber.com');
}

function initializeLandingStepTracking() {
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            const step = entry.target.dataset.wizardStep || '';
            const key = `landing:${step}`;
            if (!wizardStepViewedKeys.has(key)) {
                wizardStepViewedKeys.add(key);
                trackEvent('wizard_step_view', {
                    wizard_id: 'landing_process',
                    step_number: step,
                    step_title: entry.target.querySelector('h3')?.textContent?.trim() || '',
                });
            }

            if (step === '4' && !wizardCompletedKeys.has('landing_process')) {
                wizardCompletedKeys.add('landing_process');
                trackEvent('wizard_completed', { wizard_id: 'landing_process' });
            }
        });
    }, { threshold: 0.55 });

    document.querySelectorAll('[data-wizard-step]').forEach((step) => observer.observe(step));
}


let trackingInitialized = false;
let trackingFeaturesScheduled = false;

function scheduleTrackingFeatures() {
    if (!hasAnalyticsConsent() || trackingFeaturesScheduled) return;
    trackingFeaturesScheduled = true;
    runWhenIdle(() => {
        initializeBehaviorAnalytics();
        initializeLandingStepTracking();
        initializeOfferCardTracking();
    });
}

function initializeTracking() {
    if (trackingInitialized) return;
    trackingInitialized = true;
    scheduleTrackingFeatures();
}

window.App = window.App || {};
window.App.tracking = {
    init: initializeTracking,
    loadAll: loadAllTracking,
    trackEvent,
    trackLinkClick,
    getOfferName,
    getOpenOfferContext,
    getOpenTrackedModalId,
    getExplicitTrackParams,
    shouldSkipExplicitTracking,
    startOfferView,
    stopOfferView,
    stopAllOfferViews,
    resumeOpenOfferViews,
    startOfferCardView,
    stopOfferCardView,
    stopAllOfferCardViews,
    refreshVisibleOfferCards,
    initializeOfferCardTracking,
};

window.trackEvent = trackEvent;
window.loadAllTracking = loadAllTracking;
