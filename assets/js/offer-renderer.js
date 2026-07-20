/* =========================================
   JSON OFFER RENDERER
   Renders active offer cards from assets/data/offers.json.
========================================= */
(function () {
  'use strict';

  const OFFERS_URL = 'assets/data/offers.json';
  const OFFERS_VERSION = '20260711-1';
  const FALLBACK_MESSAGE = 'Οι προσφορές δεν φορτώθηκαν προσωρινά. Παρακαλώ δοκιμάστε ξανά ή επικοινωνήστε με τον Συνεταιρισμό.';
  const CATEGORY_LABELS = Object.freeze({
    mobile: 'Κινητή',
    internet: 'Internet',
    tv: 'TV',
    guide: 'Οδηγός',
    other: 'Άλλο',
  });

  let rendererPromise = null;
  let offersById = new Map();

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function appendTextElement(parent, tagName, className, text) {
    if (text === undefined || text === null || text === '') return null;
    const element = createElement(tagName, className, text);
    parent.appendChild(element);
    return element;
  }

  function getOffersContainer() {
    return document.getElementById('offersContainer');
  }

  function getOffersUrl() {
    const url = new URL(OFFERS_URL, document.baseURI || window.location.href);
    url.searchParams.set('v', OFFERS_VERSION);
    return url;
  }

  function getCardOfferName(offer) {
    return offer.cardOfferName || offer.actionTarget?.offer || offer.title || offer.id || '';
  }

  function getCategoryLabel(category) {
    return CATEGORY_LABELS[category] || category || CATEGORY_LABELS.other;
  }

  function getStyleClasses(offer, key) {
    return Array.isArray(offer.style?.[key]) ? offer.style[key].filter(Boolean) : [];
  }

  function buildCardClasses(offer) {
    return Array.from(new Set([
      'offer-card',
      ...getStyleClasses(offer, 'cardClasses'),
      offer.brandSkin ? `offer-card--${offer.brandSkin}` : '',
    ].filter(Boolean)));
  }

  function buildPriceClasses(offer) {
    const classes = getStyleClasses(offer, 'priceClasses');
    return classes.length ? classes : ['offer-price', 'offer-card__price-panel'];
  }

  function setTrackingDataset(element, offer) {
    const actionTarget = offer.actionTarget || {};
    element.dataset.track = actionTarget.track || 'offer_interest_click';
    element.dataset.offer = actionTarget.offer || getCardOfferName(offer);
    element.dataset.category = actionTarget.category || offer.category || '';
  }

  function configurePrimaryCta(button, offer) {
    const actionTarget = offer.actionTarget || {};
    const ctaType = offer.ctaType || (offer.modalId ? 'modal' : '');

    if (ctaType === 'activation-guide') {
      button.dataset.activationGuideOpen = '';
      if (actionTarget.activationProvider) button.dataset.activationProvider = actionTarget.activationProvider;
      if (actionTarget.activationOffer) button.dataset.activationOffer = actionTarget.activationOffer;
      if (actionTarget.activationSource) button.dataset.activationSource = actionTarget.activationSource;
    } else if (offer.modalId || actionTarget.modalId) {
      button.dataset.modalTarget = offer.modalId || actionTarget.modalId;
    } else if (actionTarget.href) {
      button.dataset.actionHref = actionTarget.href;
    }

    setTrackingDataset(button, offer);
  }

  function createBenefitItem(text) {
    const item = createElement('li');
    const icon = window.createIcon('check');
    item.appendChild(icon);
    appendTextElement(item, 'span', '', text);
    return item;
  }

  function renderBenefits(offer) {
    const list = createElement('ul', 'offer-benefits offer-card__benefits');
    const benefits = Array.isArray(offer.benefits) ? offer.benefits.slice(0, 3) : [];

    benefits.forEach((benefit) => {
      list.appendChild(createBenefitItem(benefit));
    });

    return list;
  }

  function renderPricePanel(offer) {
    const pricePanel = createElement('div', buildPriceClasses(offer).join(' '));
    appendTextElement(pricePanel, 'strong', '', offer.price || '');

    if (offer.period) {
      appendTextElement(pricePanel, 'span', '', `/ ${offer.period}`);
    }

    appendTextElement(pricePanel, 'small', '', offer.monthly);
    return pricePanel;
  }

  function renderOfferCard(offer) {
    const card = createElement('article', buildCardClasses(offer).join(' '));
    card.dataset.offerCard = '';
    card.dataset.offerId = offer.id || '';
    card.dataset.offer = getCardOfferName(offer);
    card.dataset.category = offer.category || 'other';
    card.dataset.provider = offer.provider || '';
    if (offer.brandSkin) card.dataset.brandSkin = offer.brandSkin;

    const top = createElement('div', 'offer-card-top offer-card__glass-top');
    appendTextElement(top, 'span', 'offer-card__spec-pill', offer.badge);
    card.appendChild(top);

    const titleRow = createElement('div', 'offer-card__title-row');
    appendTextElement(titleRow, 'h3', '', offer.title || offer.id || 'Προσφορά');
    appendTextElement(titleRow, 'span', 'offer-card__type', getCategoryLabel(offer.category));
    card.appendChild(titleRow);

    card.appendChild(renderPricePanel(offer));
    card.appendChild(renderBenefits(offer));

    const actions = createElement('div', 'offer-actions');

    if (offer.showPrimaryCta !== false) {
      const primary = createElement('button', 'offer-primary-cta', offer.ctaPrimaryText || 'Κάνε αίτηση');
      primary.type = 'button';
      configurePrimaryCta(primary, offer);
      actions.appendChild(primary);
    }

    if (offer.showSecondaryCta !== false) {
      const secondary = createElement('button', 'offer-secondary-cta', offer.ctaSecondaryText || 'Δες λεπτομέρειες');
      secondary.type = 'button';
      secondary.dataset.offerDetailsOpen = offer.id || '';
      secondary.dataset.track = 'offer_details_click';
      secondary.dataset.offer = getCardOfferName(offer);
      secondary.dataset.category = offer.category || '';
      actions.appendChild(secondary);
    }

    if (actions.childElementCount > 0) card.appendChild(actions);

    return card;
  }

  function renderFallback(container) {
    container.textContent = '';
    container.classList.add('offer-grid');
    container.dataset.offerLoadState = 'failed';

    const message = createElement('p', 'offers-load-fallback', FALLBACK_MESSAGE);
    message.setAttribute('role', 'status');

    const retryButton = createElement('button', 'offers-load-retry', 'Δοκιμή ξανά');
    retryButton.type = 'button';
    retryButton.dataset.offersRetry = '';

    container.appendChild(message);
    container.appendChild(retryButton);
  }

  function runPostRenderEnhancements() {
    window.requestAnimationFrame(() => {
      if (typeof window.enhanceMobileUi === 'function') {
        window.enhanceMobileUi();
      }
      window.App?.tracking?.initializeOfferCardTracking?.();
      window.App?.tracking?.refreshVisibleOfferCards?.();
    });
  }

  function normalizeOffers(data) {
    const offers = Array.isArray(data?.offers) ? data.offers : [];
    return offers
      .filter((offer) => offer && offer.active !== false)
      .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0));
  }

  function revealRenderedOfferCards(container) {
    const cards = Array.from(container.querySelectorAll('[data-offer-card]'));

    cards.forEach((card, index) => {
        card.hidden = false;
        card.removeAttribute('hidden');
        card.removeAttribute('aria-hidden');
        card.classList.add('is-visible');
        card.style.transitionDelay = `${Math.min(index * 80, 320)}ms`;
    });
}

  function renderOffers(container, offers) {
    offersById = new Map(offers.map((offer) => [offer.id, offer]));

    container.textContent = '';
    container.classList.add('offer-grid');
    container.dataset.renderedFromOffersJson = 'true';

    if (!offers.length) {
        renderFallback(container);
        return;
    }

    const fragment = document.createDocumentFragment();

    offers.forEach((offer) => {
        fragment.appendChild(renderOfferCard(offer));
    });

    container.appendChild(fragment);
    container.dataset.offerLoadState = 'loaded';

    revealRenderedOfferCards(container);
    runPostRenderEnhancements();

    requestAnimationFrame(() => {
        if (typeof window.App?.offers?.syncAfterRender === 'function') {
            window.App.offers.syncAfterRender();
        }

        revealRenderedOfferCards(container);
    });
}

  function createDetailPair(label, value) {
    if (!label && !value) return null;
    const row = createElement('div', 'offer-json-detail-row');
    appendTextElement(row, 'dt', '', label);
    appendTextElement(row, 'dd', '', value);
    return row;
  }

  function appendListSection(parent, title, values) {
    const items = Array.isArray(values) ? values.filter(Boolean) : [];
    if (!items.length) return;

    const section = createElement('section', 'offer-json-details-section');
    appendTextElement(section, 'h3', '', title);
    const list = createElement('ul', 'offer-json-details-list');
    items.forEach((value) => {
      const item = createElement('li');
      item.textContent = typeof value === 'string' ? value : value.title || value.name || value.description || '';
      if (item.textContent) list.appendChild(item);
    });
    section.appendChild(list);
    parent.appendChild(section);
  }

  function appendDetailsSection(parent, offer) {
    const rows = Array.isArray(offer.details) ? offer.details : [];
    if (!rows.length) return;

    const section = createElement('section', 'offer-json-details-section');
    appendTextElement(section, 'h3', '', 'Λεπτομέρειες');
    const list = createElement('dl', 'offer-json-details-dl');
    rows.forEach((detail) => {
      const row = createDetailPair(detail?.label, detail?.value);
      if (row) list.appendChild(row);
    });
    section.appendChild(list);
    parent.appendChild(section);
  }

  function appendPlansSection(parent, offer) {
    const plans = Array.isArray(offer.plans) ? offer.plans : [];
    if (!plans.length) return;

    const section = createElement('section', 'offer-json-details-section');
    appendTextElement(section, 'h3', '', 'Πακέτα');
    const grid = createElement('div', 'offer-json-plans');
    plans.forEach((plan) => {
      const card = createElement('article', 'offer-json-plan');
      appendTextElement(card, 'span', '', plan.name);
      appendTextElement(card, 'strong', '', plan.price);
      appendTextElement(card, 'small', '', [plan.speed, plan.period, plan.ribbon].filter(Boolean).join(' · '));
      grid.appendChild(card);
    });
    section.appendChild(grid);
    parent.appendChild(section);
  }

  function appendDocumentsSection(parent, offer) {
    const documents = Array.isArray(offer.documents) ? offer.documents.filter((documentItem) => documentItem?.href) : [];
    if (!documents.length) return;

    const section = createElement('section', 'offer-json-details-section');
    appendTextElement(section, 'h3', '', 'Έγγραφα');
    const list = createElement('div', 'offer-json-documents');
    documents.forEach((documentItem) => {
      const link = createElement('a', 'offer-json-document-link', documentItem.title || documentItem.href);
      link.href = documentItem.href;
      link.download = '';
      link.dataset.track = 'pdf_download';
      link.dataset.label = documentItem.href.split('/').pop();
      link.dataset.offer = getCardOfferName(offer);
      list.appendChild(link);
    });
    section.appendChild(list);
    parent.appendChild(section);
  }

  function appendContactLinks(parent, offer) {
    const links = Array.isArray(offer.modal?.contactLinks) ? offer.modal.contactLinks : [];
    if (!links.length) return;

    const section = createElement('section', 'offer-json-details-section');
    appendTextElement(section, 'h3', '', 'Επικοινωνία');
    const actions = createElement('div', 'offer-json-contact-links');
    links.forEach((item) => {
      if (!item.href) return;
      const link = createElement('a', 'offer-json-contact-link', item.label || item.href);
      link.href = item.href;
      link.dataset.track = item.href.startsWith('tel:') ? 'phone_click' : 'email_click';
      link.dataset.label = item.label || item.href;
      actions.appendChild(link);
    });
    section.appendChild(actions);
    parent.appendChild(section);
  }

  function ensureDetailsModal() {
    let modal = document.getElementById('offerDetailsModal');
    if (modal) return modal;

    modal = createElement('div', 'offer-json-details-modal modal-backdrop hidden fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4');
    modal.id = 'offerDetailsModal';
    modal.setAttribute('role', 'presentation');

    const panel = createElement('section', 'offer-json-details-panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'offerDetailsTitle');

    const header = createElement('div', 'offer-json-details-header');
    const headingGroup = createElement('div');
    const category = createElement('span', 'offer-json-details-category');
    const title = createElement('h2');
    title.id = 'offerDetailsTitle';
    headingGroup.append(category, title);

    const closeButton = createElement('button', 'offer-json-details-close', '×');
    closeButton.type = 'button';
    closeButton.dataset.modalClose = modal.id;
    closeButton.setAttribute('aria-label', 'Κλείσιμο λεπτομερειών προσφοράς');
    header.append(headingGroup, closeButton);

    const body = createElement('div', 'offer-json-details-body custom-scroll');
    panel.append(header, body);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    return modal;
  }

  function populateDetailsModal(modal, offer) {
    const category = modal.querySelector('.offer-json-details-category');
    const title = modal.querySelector('#offerDetailsTitle');
    const body = modal.querySelector('.offer-json-details-body');
    if (!body) return;

    if (category) category.textContent = getCategoryLabel(offer.category);
    if (title) title.textContent = offer.title || 'Προσφορά';

    body.textContent = '';
    const summary = createElement('div', 'offer-json-details-summary');
    appendTextElement(summary, 'strong', '', offer.price || '');
    appendTextElement(summary, 'span', '', offer.period ? `/ ${offer.period}` : '');
    appendTextElement(summary, 'small', '', offer.monthly);
    appendTextElement(summary, 'p', '', offer.shortDescription);
    body.appendChild(summary);

    appendListSection(body, 'Βασικά οφέλη', offer.benefits);
    appendDetailsSection(body, offer);
    appendListSection(body, 'Περιλαμβάνει', offer.includes);
    appendPlansSection(body, offer);
    appendDocumentsSection(body, offer);
    appendListSection(body, 'Σημειώσεις', offer.notes);
    appendContactLinks(body, offer);
  }

  function getOfferIdFromHash() {
    if (!window.location.hash.startsWith('#offer=')) return '';
    try {
      return new URLSearchParams(window.location.hash.slice(1)).get('offer') || '';
    } catch (_error) {
      return '';
    }
  }

  function getLocationWithoutHash() {
    return `${window.location.pathname}${window.location.search}`;
  }

  function openOfferDetails(offerId, options = {}) {
    const offer = offersById.get(offerId);
    if (!offer) return false;

    const modal = ensureDetailsModal();
    populateDetailsModal(modal, offer);
    modal.dataset.offerId = offer.id;

    const modalApi = window.App?.modals;
    if (typeof modalApi?.open === 'function') {
      modalApi.open(modal.id, false);
    } else if (typeof openModal === 'function') {
      openModal(modal.id, false);
    } else {
      modal.classList.remove('hidden');
    }

    if (options.updateHistory !== false) {
      history.pushState(
        { screen: 'offer-details', offerId: offer.id, offerDetailsDirect: false },
        '',
        `#offer=${encodeURIComponent(offer.id)}`,
      );
    }
    return true;
  }

  function syncOfferDetailsFromLocation() {
    if (window.location.hash === '#offerDetailsModal') {
      history.replaceState(null, '', getLocationWithoutHash());
      return false;
    }

    const offerId = getOfferIdFromHash();
    if (!offerId) return false;
    if (!offersById.has(offerId)) {
      history.replaceState(null, '', getLocationWithoutHash());
      return false;
    }

    const currentState = history.state || {};
    const isExistingOfferEntry = currentState.screen === 'offer-details' && currentState.offerId === offerId;
    history.replaceState(
      {
        ...currentState,
        screen: 'offer-details',
        offerId,
        offerDetailsDirect: isExistingOfferEntry ? currentState.offerDetailsDirect === true : true,
      },
      '',
      `#offer=${encodeURIComponent(offerId)}`,
    );
    return openOfferDetails(offerId, { updateHistory: false });
  }

  function closeOfferDetailsRoute() {
    if (!getOfferIdFromHash()) return false;
    const state = history.state || {};
    if (state.screen === 'offer-details' && state.offerDetailsDirect === false) {
      history.back();
      return true;
    }
    history.replaceState(null, '', getLocationWithoutHash());
    return false;
  }

  function initializeDetailsListener() {
    if (document.body.dataset.offerDetailsListenerBound === 'true') return;
    document.body.dataset.offerDetailsListenerBound = 'true';

    document.addEventListener('click', (event) => {
      const trigger = event.target.closest('[data-offer-details-open]');
      if (!trigger) return;

      event.preventDefault();
      openOfferDetails(trigger.dataset.offerDetailsOpen);
    });
  }

  function initializeRetryListener() {
    if (document.body.dataset.offersRetryListenerBound === 'true') return;
    document.body.dataset.offersRetryListenerBound = 'true';

    document.addEventListener('click', (event) => {
      const retry = event.target.closest('[data-offers-retry]');
      if (!retry) return;

      event.preventDefault();
      initializeOfferRenderer({ force: true });
    });
  }

  async function initializeOfferRenderer(options = {}) {
    if (options.force) {
      rendererPromise = null;
    }

    if (rendererPromise) return rendererPromise;

    rendererPromise = (async () => {
      const container = getOffersContainer();
      if (!container) return false;

      initializeDetailsListener();
      initializeRetryListener();

      try {
        const response = await fetch(getOffersUrl(), { cache: 'default' });
        if (!response.ok) throw new Error('offers.json not available');
        const data = await response.json();
        renderOffers(container, normalizeOffers(data));
        syncOfferDetailsFromLocation();
        return true;
      } catch (_error) {
        renderFallback(container);
        return false;
      }
    })();

    return rendererPromise;
  }

  function initializeWhenReady() {
    initializeOfferRenderer();
  }

  window.App = window.App || {};
  window.App.offerRenderer = {
    init: initializeOfferRenderer,
    openDetails: openOfferDetails,
    syncFromLocation: syncOfferDetailsFromLocation,
    closeDetailsRoute: closeOfferDetailsRoute,
    getOffers: () => Array.from(offersById.values()),
  };

  window.addEventListener('hashchange', () => {
    if (rendererPromise) rendererPromise.then(() => syncOfferDetailsFromLocation());
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeWhenReady, { once: true });
  } else {
    initializeWhenReady();
  }
})();
