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

  // Χρώμα του πάνω badge ανά πάροχο / brand skin (νέα accordion κάρτα).
  const PROVIDER_COLORS = Object.freeze({
    vodafone: '#e60000',
    nova: '#0a2896',
    cosmote: '#7ac143',
    wind: '#0067b1',
    'eon / cosmote tv': '#089414',
    eon: '#069266',
    q: '#ff8d13',
  });
  const DEFAULT_PROVIDER_COLOR = '#fff586';

  // Ζητούμενες αντικαταστάσεις κειμένου στα CTA της νέας κάρτας.
  const CTA_TEXT_OVERRIDES = Object.freeze({
    'Οδηγός ενεργοποίησης': 'Ενεργοποίηση',
    Περισσότερα: 'Λεπτομέρειες',
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

  function getProviderColor(offer) {
    const key = String(offer.provider || '').trim().toLowerCase();
    if (PROVIDER_COLORS[key]) return PROVIDER_COLORS[key];

    const match = Object.keys(PROVIDER_COLORS).find((name) => key.includes(name));
    return match ? PROVIDER_COLORS[match] : DEFAULT_PROVIDER_COLOR;
  }

  function mapCtaText(text) {
    const value = String(text || '').trim();
    return CTA_TEXT_OVERRIDES[value] || value;
  }

  // "από 16,00€" -> { prefix: 'από', amount: '16,00€' } ώστε ο αριθμός να πάρει
  // το tabular-nums styling και το υπόλοιπο να μείνει κανονικό κείμενο.
  function splitPrice(price) {
    const value = String(price || '').trim();
    const match = value.match(/^(.*?)([\d][\d.,]*\s*[€%]?)(.*)$/);
    if (!match) return { prefix: '', amount: value, suffix: '' };
    return { prefix: match[1].trim(), amount: match[2].trim(), suffix: match[3].trim() };
  }

  // Προτιμάμε το ρητό offer.pricing από το offers.json. Το fallback κρατά
  // συμβατότητα με προσφορές που δεν το έχουν ακόμη.
  function getPricing(offer) {
    const pricing = offer.pricing;
    if (pricing && pricing.amount) {
      return {
        prefix: pricing.prefix || '',
        amount: pricing.amount,
        unit: pricing.unit || '',
        note: pricing.note || offer.monthly || '',
      };
    }

    const { prefix, amount, suffix } = splitPrice(offer.price);
    return {
      prefix,
      amount,
      unit: [suffix, offer.period ? `/ ${offer.period}` : ''].filter(Boolean).join(' '),
      note: offer.monthly || '',
    };
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

      // Το ποσό κατάθεσης το ξέρει μόνο η κάρτα. Χωρίς αυτό, ο οδηγός έφτανε
      // στο βήμα πληρωμής δείχνοντας IBAN αλλά κανένα ποσό.
      if (offer.price) button.dataset.activationAmount = offer.price;
      if (offer.pricing?.note) button.dataset.activationAmountNote = offer.pricing.note;
    } else if (offer.modalId || actionTarget.modalId) {
      button.dataset.modalTarget = offer.modalId || actionTarget.modalId;
    }

    setTrackingDataset(button, offer);
  }

  function usesLinkCta(offer) {
    const actionTarget = offer.actionTarget || {};
    const ctaType = offer.ctaType || (offer.modalId ? 'modal' : '');

    return ctaType !== 'activation-guide' &&
      !offer.modalId &&
      !actionTarget.modalId &&
      Boolean(actionTarget.href);
  }

  // Όταν η προσφορά δείχνει σε URL (PDF, εξωτερική σελίδα, tel:/mailto:) φτιάχνουμε
  // πραγματικό <a>. Έτσι το κλικ δουλεύει χωρίς extra handler και το trackLinkClick
  // το πιάνει αυτόματα.
  function createPrimaryCtaLink(offer) {
    const actionTarget = offer.actionTarget || {};
    const href = actionTarget.href;
    const link = createElement('a', 'offer-primary-cta new-premium-btn', mapCtaText(offer.ctaPrimaryText || 'Κάνε αίτηση'));

    link.href = href;

    if (actionTarget.download === true || /\.pdf(\?|#|$)/i.test(href)) {
      link.download = '';
    }

    if (/^https?:\/\//i.test(href)) {
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
    }

    setTrackingDataset(link, offer);
    return link;
  }

  function createPrimaryCta(offer) {
    if (usesLinkCta(offer)) return createPrimaryCtaLink(offer);

    const button = createElement('button', 'offer-primary-cta new-premium-btn', mapCtaText(offer.ctaPrimaryText || 'Κάνε αίτηση'));
    button.type = 'button';
    configurePrimaryCta(button, offer);
    return button;
  }

  function createBenefitItem(text) {
    const item = createElement('li', 'new-premium-perk');
    const icon = window.createIcon?.('check');
    if (icon) {
      icon.classList.add('new-premium-perk-icon');
      icon.setAttribute('aria-hidden', 'true');
      item.appendChild(icon);
    }
    appendTextElement(item, 'span', '', text);
    return item;
  }

  // Τρία οφέλη το πολύ: πάνω από αυτό η κάρτα γίνεται τοίχος κειμένου και
  // χάνεται η σύγκριση μεταξύ των προσφορών.
  function renderBenefits(offer) {
    // ΠΡΟΣΟΧΗ: χωρίς την κλάση offer-benefits. Στα κινητά το legacy CSS την
    // μετατρέπει σε 2-στηλο grid και χαλάει η νέα κάρτα.
    const list = createElement('ul', 'new-premium-perks');
    const benefits = Array.isArray(offer.benefits) ? offer.benefits.slice(0, 3) : [];

    benefits.forEach((benefit) => {
      list.appendChild(createBenefitItem(benefit));
    });

    return list;
  }

  // "EON / Cosmote TV" και "EON + Cosmote TV" θεωρούνται ίδια -> ένα μόνο badge.
  function normalizeBadgeText(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[/+&·-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Χρωματιστή κορδέλα παρόχου: δίνει ταυτότητα στην κάρτα με μια ματιά.
  function renderCardRibbon(offer) {
    // Το χρώμα περνά ως color: η γραμμή στην κορυφή είναι currentColor και το
    // όνομα του παρόχου κληρονομεί το ίδιο χρώμα.
    const ribbon = createElement('div', 'new-premium-ribbon');
    ribbon.style.color = getProviderColor(offer);

    const providerLabel = offer.provider || getCategoryLabel(offer.category);
    appendTextElement(ribbon, 'span', 'new-premium-ribbon-name', providerLabel);

    // Προτιμάμε το σύντομο badge (specs) από το μακροσκελές recommendationBadge.
    const flag = offer.badge || offer.recommendationBadge;
    const isDuplicate = normalizeBadgeText(flag) === normalizeBadgeText(providerLabel);
    if (flag && !isDuplicate) {
      appendTextElement(ribbon, 'span', 'new-premium-ribbon-flag', flag);
    }

    return ribbon;
  }

  // Κεντραρισμένη κεφαλίδα: τίτλος, υπότιτλος και η μηνιαία τιμή ως ήρωας.
  function renderCardHeader(offer) {
    const header = createElement('div', 'new-premium-head');
    appendTextElement(header, 'h3', 'new-premium-title', offer.title || offer.id || 'Προσφορά');
    appendTextElement(header, 'p', 'new-premium-desc', offer.shortDescription);

    const { prefix, amount, unit, note } = getPricing(offer);
    const priceRow = createElement('div', 'new-premium-price-row');
    appendTextElement(priceRow, 'span', 'new-premium-price-prefix', prefix);
    appendTextElement(priceRow, 'span', 'new-premium-price-num', amount);
    appendTextElement(priceRow, 'span', 'new-premium-price-unit', unit);
    header.appendChild(priceRow);

    appendTextElement(header, 'p', 'new-premium-price-note', note);
    return header;
  }

  function renderCardActions(offer) {
    // Χωρίς την κλάση offer-actions: όλα τα legacy κουμπί-styles κρέμονται από
    // αυτήν και ξαναγράφουν τα νέα CTA στα κινητά. Η κλάση offer-primary-cta
    // μένει, γιατί την διαβάζει το tracking.js για το label του event.
    const actions = createElement('div', 'new-premium-actions');

    if (offer.showPrimaryCta !== false) {
      actions.appendChild(createPrimaryCta(offer));
    }

    if (offer.showSecondaryCta !== false) {
      // Δευτερεύουσα ενέργεια ως διακριτικό link, ώστε να μην ανταγωνίζεται
      // οπτικά το βασικό CTA.
      const secondary = createElement(
        'button',
        'offer-secondary-cta new-premium-link',
        mapCtaText(offer.ctaSecondaryText || 'Δες λεπτομέρειες'),
      );
      secondary.type = 'button';
      secondary.dataset.offerDetailsOpen = offer.id || '';
      secondary.dataset.track = 'offer_details_click';
      secondary.dataset.offer = getCardOfferName(offer);
      secondary.dataset.category = offer.category || '';
      actions.appendChild(secondary);
    }

    return actions;
  }

  function renderOfferCard(offer) {
    const card = createElement('article', 'new-premium-card');
    card.dataset.offerCard = '';
    card.dataset.offerId = offer.id || '';
    card.dataset.offer = getCardOfferName(offer);
    card.dataset.category = offer.category || 'other';
    card.dataset.provider = offer.provider || '';

    // Το σώμα της κάρτας είναι αναγνώσιμο περιεχόμενο. Το flag κάνει το
    // enhanceOfferCard του offers.js να ΜΗΝ δέσει whole-card click, ώστε ένα
    // tap στο κείμενο να μην ανοίγει το modal.
    card.dataset.wholeCardAction = 'true';

    const body = createElement('div', 'new-premium-body');
    body.appendChild(renderCardHeader(offer));
    body.appendChild(renderBenefits(offer));

    const actions = renderCardActions(offer);
    if (actions.childElementCount > 0) body.appendChild(actions);

    card.append(renderCardRibbon(offer), body);
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
        // Σκέτο same-origin request, ΧΩΡΙΣ credentials: 'omit'. Το 'omit' έκανε
        // το αίτημα CORS-mode και ο browser έστελνε header Origin ακόμη και για
        // same-origin, που το WAF του host απαντούσε με 403. Πρέπει να ταιριάζει
        // με το <link rel="preload" as="fetch"> στο <head> (χωρίς crossorigin),
        // αλλιώς το αρχείο κατεβαίνει δύο φορές.
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
