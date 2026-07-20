/* =========================================
   UI MODALS / SIDEBAR HELPERS
   Μεταφέρθηκε από το main.js
========================================= */

function closeSidebarInstantly() {
    const menu = document.getElementById('sidebarMenu');
    const overlay = document.getElementById('sidebarOverlay');

    if (menu) menu.classList.add('-translate-x-full');
    if (overlay) {
        overlay.classList.add('opacity-0');
        overlay.classList.add('hidden');
    }

    syncMobileBottomNavState();
    unlockPageScrollIfIdle();
}


function goHomeFromHeader() {
    const preview = document.getElementById('imagePreviewModal');

    document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((modal) => {
        if (modal.id) stopOfferView(modal.id);
        modal.classList.add('hidden');
    });

    if (preview) {
        preview.classList.add('hidden');
        stopImagePreviewDrag();
        resetImagePreviewZoom(false);
    }

    closeSidebarInstantly();

    if (window.location.hash) {
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }

    unlockPageScrollIfIdle();

    requestAnimationFrame(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
        window.App?.tracking?.refreshVisibleOfferCards?.();
    });

    trackEvent('Navigation', 'header_home_click', 'top_bar');
}


function hasOpenBlockingLayer() {
    const sidebar = document.getElementById('sidebarMenu');
    const preview = document.getElementById('imagePreviewModal');

    return Boolean(
        document.querySelector('.modal-backdrop:not(.hidden)') ||
        (preview && !preview.classList.contains('hidden')) ||
        (sidebar && !sidebar.classList.contains('-translate-x-full'))
    );
}

function setMobileBottomNavSuppressed(shouldSuppress) {
    document.body.classList.toggle('mobile-bottom-nav-suppressed', Boolean(shouldSuppress));
}

function syncMobileBottomNavState() {
    setMobileBottomNavSuppressed(hasOpenBlockingLayer());
}

function shouldUseFixedScrollLock() {
    return window.matchMedia('(pointer: coarse)').matches &&
        window.matchMedia('(hover: none)').matches;
}


function lockPageScroll() {
    setMobileBottomNavSuppressed(true);

    if (document.body.dataset.scrollLocked === 'true') return;
    pageScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    document.body.dataset.scrollLocked = 'true';
    document.documentElement.classList.add('scroll-locked');
    document.body.classList.add('overflow-hidden', 'scroll-locked');

    if (!shouldUseFixedScrollLock()) {
        document.body.dataset.scrollLockMode = 'overflow';
        return;
    }

    document.body.dataset.scrollLockMode = 'fixed';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${pageScrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    document.body.style.width = '100%';
}


function unlockPageScrollIfIdle() {
    if (hasOpenBlockingLayer()) {
        setMobileBottomNavSuppressed(true);
        return;
    }

    setMobileBottomNavSuppressed(false);

    if (document.body.dataset.scrollLocked !== 'true') return;

    const lockMode = document.body.dataset.scrollLockMode;

    document.documentElement.classList.remove('scroll-locked');
    document.body.classList.remove('overflow-hidden', 'scroll-locked');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.left = '';
    document.body.style.right = '';
    document.body.style.width = '';
    document.body.removeAttribute('data-scroll-locked');
    document.body.removeAttribute('data-scroll-lock-mode');

    if (lockMode === 'fixed') {
        window.scrollTo(0, pageScrollY);
    }
}


function loadDeferredIframes(root) {
    root.querySelectorAll('iframe[data-src]').forEach((iframe) => {
        if (!iframe.getAttribute('src')) {
            iframe.setAttribute('src', iframe.dataset.src);
        }
    });
}

const lazyModalFragments = Object.freeze({
    activationProviderChoiceModal: 'assets/modals/activation-provider-choice.html',
    activationGuideModal: 'assets/modals/activation-guide.html',
    novaLinePhone: 'assets/modals/nova-line-phone.html',
    novaEonModal: 'assets/modals/eon-tv.html',
    internetChoiceModal: 'assets/modals/internet-choice.html',
    vodafoneFixedModal: 'assets/modals/vodafone-fixed.html',
    infoCoopModal: 'assets/modals/info-coop.html',
});
const lazyModalPromises = new Map();

async function ensureModalLoaded(modalId) {
    if (document.getElementById(modalId)) return document.getElementById(modalId);

    const fragmentPath = lazyModalFragments[modalId];
    const root = document.getElementById('lazyModalRoot');
    if (!fragmentPath || !root) throw new Error(`Unknown lazy modal: ${modalId}`);
    if (lazyModalPromises.has(modalId)) return lazyModalPromises.get(modalId);

    const loadPromise = fetch(fragmentPath).then(async (response) => {
        if (!response.ok) throw new Error(`Modal request failed (${response.status})`);
        const template = document.createElement('template');
        template.innerHTML = (await response.text()).trim();
        const modal = template.content.firstElementChild;
        if (!modal || modal.id !== modalId) throw new Error(`Invalid modal fragment: ${modalId}`);
        root.appendChild(template.content);

        if (modalId === 'activationGuideModal') window.initializeActivationGuide?.();
        return document.getElementById(modalId);
    }).catch((error) => {
        lazyModalPromises.delete(modalId);
        unlockPageScrollIfIdle();
        if (typeof showToast === 'function') showToast('Η φόρτωση απέτυχε. Δοκιμάστε ξανά.', 'error');
        console.error(`Failed to load modal ${modalId}`, error);
        throw error;
    });

    lazyModalPromises.set(modalId, loadPromise);
    return loadPromise;
}


function openModal(id, updateHistory = true) {
    const modal = document.getElementById(id);
    if (!modal && lazyModalFragments[id]) {
        return ensureModalLoaded(id).then(() => openModal(id, updateHistory)).catch(() => undefined);
    }
    if (!modal) return undefined;
    const wasHidden = modal.classList.contains('hidden');

    if (wasHidden) stopAllOfferCardViews();
    modal.classList.remove('hidden');
    loadDeferredIframes(modal);
    if (wasHidden) {
        lockPageScroll();
        startOfferView(id);
    }
    
    if (updateHistory && window.location.hash !== `#${id}`) {
        history.pushState({ screen: 'offer', modalId: id }, '', `#${id}`);
    }
}


function openModalFromHash() {
    if (window.location.hash.startsWith('#offer=')) {
        window.App?.offerRenderer?.syncFromLocation?.();
        return;
    }
    const modalId = decodeURIComponent(window.location.hash.replace('#', ''));
    if (!modalId) return;

    if (document.getElementById(modalId)?.classList.contains('modal-backdrop') || lazyModalFragments[modalId]) {
        openModal(modalId, false);
    }
}


function closeModal(id, updateHistory = true) {
    const modal = document.getElementById(id);
    const wasOpen = modal && !modal.classList.contains('hidden');
    if (modal) modal.classList.add('hidden');
    if (wasOpen) stopOfferView(id);
    if (id === 'offerDetailsModal' && updateHistory) {
        const navigatingBack = window.App?.offerRenderer?.closeDetailsRoute?.() === true;
        if (navigatingBack) return;
    }
        if (id === 'imagePreviewModal') {
        stopImagePreviewDrag();
        resetImagePreviewZoom(false);

        if (wasOpen && history.state && (history.state.imagePreview || history.state.screen === 'image-preview')) {
            history.back();
            return;
        }
    }
    
    if (updateHistory && window.location.hash === `#${id}`) {
        history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }

    if (wasOpen) {
        unlockPageScrollIfIdle();
        if (!hasOpenBlockingLayer()) requestAnimationFrame(() => window.App?.tracking?.refreshVisibleOfferCards?.());
    }
}


function toggleSidebar() {
  const menu = document.getElementById('sidebarMenu');
  const overlay = document.getElementById('sidebarOverlay');

  if (!menu || !overlay) return;

  const isClosed = menu.classList.contains('-translate-x-full');

  if (isClosed) {
    overlay.classList.remove('hidden');
    setMobileBottomNavSuppressed(true);
    lockPageScroll();

    requestAnimationFrame(() => {
      overlay.classList.remove('opacity-0');
      menu.classList.remove('-translate-x-full');
      syncMobileBottomNavState();
    });
  } else {
    menu.classList.add('-translate-x-full');
    overlay.classList.add('opacity-0');

    setTimeout(() => {
      overlay.classList.add('hidden');
      syncMobileBottomNavState();
      unlockPageScrollIfIdle();
    }, 300);
  }
}

function resetModalScrollPosition(modalId) {
    const modal = document.getElementById(modalId);
    if (!modal) return;

    modal.scrollTop = 0;
    modal.querySelectorAll('.overflow-y-auto, .custom-scroll, [class*="overflow-y-auto"], .info-coop-scroll').forEach((element) => {
        element.scrollTop = 0;
    });
}

function openModalFromSidebar(modalId) {
    if (!modalId) return;

    if (typeof closeSidebarInstantly === 'function') {
        closeSidebarInstantly();
    } else {
        toggleSidebar();
    }

    window.setTimeout(() => {
        openModal(modalId);
        requestAnimationFrame(() => resetModalScrollPosition(modalId));
    }, 80);
}

function applySidebarOfferFilter(category, source) {
    if (typeof closeSidebarInstantly === 'function') {
        closeSidebarInstantly();
    } else {
        toggleSidebar();
    }

    window.setTimeout(() => applyOfferFilter(category, source), 80);
}

function handlePopState(event) {
    const state = event.state || {};

    const preview = document.getElementById('imagePreviewModal');
    if (preview) {
        preview.classList.add('hidden');
        if (typeof stopImagePreviewDrag === 'function') stopImagePreviewDrag();
        if (typeof resetImagePreviewZoom === 'function') resetImagePreviewZoom(false);
    }

    document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach((modal) => {
        if (modal.id) stopOfferView(modal.id);
        modal.classList.add('hidden');
    });

    if (window.location.hash.startsWith('#offer=')) {
        window.App?.offerRenderer?.syncFromLocation?.();
        return;
    }

    if (state.screen === 'image-preview' && state.previewSrc) {
        if (state.parentModalId) {
            openModal(state.parentModalId, false);
        }

        if (typeof openImagePreview === 'function') openImagePreview(state.previewSrc, false);
        return;
    }

    if ((state.screen === 'offer' || state.modalId) && state.modalId) {
        openModal(state.modalId, false);
        return;
    }

    unlockPageScrollIfIdle();
    requestAnimationFrame(() => window.App?.tracking?.refreshVisibleOfferCards?.());
}

let modalsInitialized = false;

function initializeModals() {
    if (modalsInitialized) return;
    modalsInitialized = true;
    window.addEventListener('popstate', handlePopState);
    document.addEventListener('click', async (event) => {
        const activationTrigger = event.target.closest('[data-activation-guide-open]');
        if (activationTrigger && !document.getElementById('activationGuideModal')) {
            event.preventDefault();
            event.stopImmediatePropagation();
            try {
                await ensureModalLoaded('activationGuideModal');
                window.openActivationGuide?.(activationTrigger);
            } catch (_error) {
                // ensureModalLoaded exposes the retryable error state to the user.
            }
            return;
        }

        const trigger = event.target.closest('[data-modal-target]');
        if (!trigger || !lazyModalFragments[trigger.dataset.modalTarget] || document.getElementById(trigger.dataset.modalTarget)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
            await ensureModalLoaded(trigger.dataset.modalTarget);
            const modalToClose = trigger.dataset.modalClose;
            const replaceModalHistory = trigger.dataset.modalHistory === 'replace';
            if (modalToClose) closeModal(modalToClose, false);
            openModal(trigger.dataset.modalTarget, !replaceModalHistory);
            if (replaceModalHistory) {
                history.replaceState(
                    { screen: 'offer', modalId: trigger.dataset.modalTarget },
                    '',
                    `#${trigger.dataset.modalTarget}`,
                );
            }
        } catch (_error) {
            // ensureModalLoaded exposes the retryable error state to the user.
        }
    }, true);
}

window.App = window.App || {};
window.App.modals = {
    init: initializeModals,
    open: openModal,
    close: closeModal,
    goHomeFromHeader,
    openFromHash: openModalFromHash,
    openFromSidebar: openModalFromSidebar,
    applySidebarOfferFilter,
    toggleSidebar,
    closeSidebarInstantly,
    lockPageScroll,
    unlockPageScrollIfIdle,
    hasOpenBlockingLayer,
    ensureLoaded: ensureModalLoaded,
};
