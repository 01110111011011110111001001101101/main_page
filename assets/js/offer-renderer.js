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

  /*
   * Τα ανά-πάροχο χρώματα (PROVIDER_COLORS / PRICE_TONES) αφαιρέθηκαν με το
   * σχέδιο «Γ3»: κάθε κάρτα έχει πλέον την ίδια βαθιά κεφαλίδα και ο πάροχος
   * δηλώνεται με ετικέτα. Οι αποχρώσεις ζουν στις σταθερές CARD_* παρακάτω,
   * όπου συνοδεύονται από μετρημένες αντιθέσεις.
   */

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
      // Ποια προσφορά άνοιξε το modal: επιτρέπει σε ένα κοινό modal να δείχνει
      // διαφορετικό τίτλο και διαφορετικά έντυπα ανά προσφορά.
      if (offer.id) button.dataset.modalOffer = offer.id;
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

  /*
   * Κεφαλίδα κάρτας: πάροχος και spec σε μία μικρή γραμμή, και από κάτω ο
   * τίτλος του πακέτου σε μεγάλα γράμματα.
   *
   * Πριν, ο τίτλος ήταν τρίτος στη σειρά — ανάμεσα στη χρωματιστή κορδέλα και
   * στη μεγάλη τιμή — και χανόταν. Τώρα είναι το πρώτο πράγμα που διαβάζεται,
   * σε δική του ζώνη, οπότε δεν ανταγωνίζεται την τιμή.
   */
  /*
   * ΚΕΦΑΛΙΔΑ ΚΑΡΤΑΣ — σχέδιο «Γ3».
   *
   * Μία σκούρα ζώνη μαζεύει όλα όσα κρίνουν την απόφαση: τίτλος, χαρακτηριστικό,
   * τιμή και όρος προπληρωμής. Το σώμα από κάτω μένει λευκό, μόνο με τα οφέλη
   * και τις ενέργειες.
   *
   * Γιατί σκούρο και όχι στο χρώμα του παρόχου: με χρωματιστές κεφαλίδες οι
   * κάρτες διαβάζονταν ως διαφημίσεις Vodafone/Nova. Με μία κοινή απόχρωση —
   * τη βαθιά του hero — ο κατάλογος ανήκει στον Συνεταιρισμό και ο πάροχος
   * μένει ως ετικέτα. Κερδίζουμε και ~45% ύψος στο κινητό, γιατί η περιγραφή
   * και το ξεχωριστό πλαίσιο τιμής καταργούνται.
   *
   * Τα χρώματα ΔΕΝ μπαίνουν εδώ ως inline styles. Το αρχείο CSS έχει γενικούς
   * legacy κανόνες με !important (π.χ. «section article p { color: … }») που
   * νικούν ένα inline style χωρίς !important — ο όρος προπληρωμής έβγαινε γκρι
   * πάνω στο σκούρο. Οι αποχρώσεις ζουν στο site.css, σε ένα σημείο, μαζί με τις
   * μετρημένες αντιθέσεις τους.
   */
  function renderCardRibbon(offer) {
    const ribbon = createElement('div', 'new-premium-ribbon');

    const providerLabel = offer.provider || getCategoryLabel(offer.category);
    const top = createElement('div', 'new-premium-ribbon-meta');
    appendTextElement(top, 'h3', 'new-premium-title', offer.title || offer.id || 'Προσφορά');

    /*
     * Η ετικέτα δείχνει το χαρακτηριστικό του πακέτου (π.χ. «300GB κάθε μήνα»),
     * με τον πάροχο ως εφεδρεία. Ό,τι επαναλαμβάνει τον τίτλο παραλείπεται:
     * στο «EON + Cosmote TV» και ο πάροχος και το badge λένε το ίδιο πράγμα με
     * τον τίτλο, και η κάρτα θα το έγραφε δύο φορές στην ίδια γραμμή.
     */
    const title = offer.title || offer.id || 'Προσφορά';
    const isEcho = (text) => !text || normalizeBadgeText(text) === normalizeBadgeText(title);
    const flag = [offer.badge, offer.recommendationBadge, providerLabel].find((text) => !isEcho(text));
    appendTextElement(top, 'span', 'new-premium-ribbon-flag', flag);

    ribbon.appendChild(top);
    ribbon.appendChild(renderPriceRow(offer));

    // Ο όρος προπληρωμής ανεβαίνει μέσα στην κεφαλίδα, δίπλα στην τιμή που
    // εξηγεί. Στον πάτο της κάρτας διαβαζόταν σαν ψιλά γράμματα.
    const { note } = getPricing(offer);
    appendTextElement(ribbon, 'p', 'new-premium-note-banner', note);

    // Ο πάροχος μένει διαθέσιμος για φίλτρα και tracking χωρίς να καταλαμβάνει
    // οπτικό χώρο όταν τον λέει ήδη ο τίτλος («Vodafone CU»).
    ribbon.dataset.provider = providerLabel;

    return ribbon;
  }

  function renderPriceRow(offer) {
    const { prefix, amount, unit } = getPricing(offer);

    const priceRow = createElement('div', 'new-premium-price-row');
    appendTextElement(priceRow, 'span', 'new-premium-price-prefix', prefix);
    appendTextElement(priceRow, 'span', 'new-premium-price-num', amount);
    appendTextElement(priceRow, 'span', 'new-premium-price-unit', unit);

    return priceRow;
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
      // Οι λεπτομέρειες γίνονται τετράγωνο εικονίδιο δίπλα στο βασικό κουμπί,
      // αντί για δεύτερη γραμμή από κάτω: γλιτώνουμε ~40px ανά κάρτα. Το tap σε
      // ολόκληρη την κάρτα είναι σκόπιμα κλειστό, οπότε αυτό είναι ο μόνος
      // δρόμος προς τις λεπτομέρειες και πρέπει να παραμείνει ορατός.
      const label = mapCtaText(offer.ctaSecondaryText || 'Δες λεπτομέρειες');
      const secondary = createElement('button', 'offer-secondary-cta new-premium-icon-link');
      const icon = window.createIcon?.('circle-info') || window.createIcon?.('file-lines');
      if (icon) {
        icon.setAttribute('aria-hidden', 'true');
        secondary.appendChild(icon);
      } else {
        secondary.textContent = label;
      }
      secondary.setAttribute('aria-label', `${label}: ${getCardOfferName(offer)}`);
      secondary.title = label;
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
    body.appendChild(renderBenefits(offer));

    const actions = renderCardActions(offer);
    if (actions.childElementCount > 0) body.appendChild(actions);

    card.append(renderCardRibbon(offer), body);

    return card;
  }

  /*
   * Κοινό modal, διαφορετικό περιεχόμενο ανά προσφορά.
   *
   * Το Nova 5G και το Nova fiber μοιράζονται το ίδιο modal (novaLinePhone),
   * αλλά χρειάζονται δικό τους τίτλο και δικά τους έντυπα. Αντί για δύο
   * αντίγραφα του ίδιου fragment 144 γραμμών, το modal γεμίζει από το
   * offers.json: αρκεί να αλλάξει ο πίνακας documents της κάθε προσφοράς.
   */
  function fillModalForOffer(modal, offerId) {
    const offer = offersById.get(offerId);
    if (!modal || !offer) return false;

    modal.querySelectorAll('[data-modal-offer-title]').forEach((element) => {
      element.textContent = offer.title || element.textContent;
    });

    const docsHost = modal.querySelector('[data-modal-offer-docs]');
    const documents = Array.isArray(offer.documents) ? offer.documents.filter((item) => item?.href) : [];
    if (!docsHost) return true;

    if (!documents.length) {
      docsHost.hidden = true;
      return true;
    }

    docsHost.hidden = false;
    docsHost.textContent = '';

    documents.forEach((item) => {
      const link = createElement('a', 'modal-offer-doc');
      link.href = item.href;
      link.download = '';
      link.dataset.track = 'pdf_download';
      link.dataset.label = item.href.split('/').pop();
      link.dataset.offer = getCardOfferName(offer);

      const iconWrap = createElement('span', 'modal-offer-doc__icon');
      const icon = window.createIcon?.('file-pdf');
      if (icon) iconWrap.appendChild(icon);
      link.appendChild(iconWrap);

      appendTextElement(link, 'span', 'modal-offer-doc__label', item.title || item.href.split('/').pop());
      docsHost.appendChild(link);
    });

    return true;
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

  /* --- Μετρητής προσφορών στα φίλτρα ------------------------------------
     Οι αριθμοί βγαίνουν από τις προσφορές που όντως αποδόθηκαν, όχι από
     χειρόγραφη λίστα: αν προστεθεί ή αποσυρθεί προσφορά στο offers.json, οι
     μετρητές ακολουθούν μόνοι τους.
  --------------------------------------------------------------------- */
  const FILTER_LABELS = Object.freeze({
    all: 'Όλες', mobile: 'Κινητή', internet: 'Internet', tv: 'TV',
  });

  function countOffersByCategory(offers) {
    const counts = new Map([['all', offers.length]]);

    offers.forEach((offer) => {
      const category = offer.category || 'other';
      counts.set(category, (counts.get(category) || 0) + 1);
    });

    return counts;
  }

  function setFilterCount(button, category, counts) {
    const total = counts.get(category) || 0;
    let badge = button.querySelector('.offer-filter-count');

    /*
     * Το «Όλες» δεν παίρνει αριθμό. Δίπλα στα 2 / 3 / 1 των κατηγοριών, ένα 6
     * διαβάζεται σαν τέταρτη κατηγορία αντί για άθροισμα και μπερδεύει.
     */
    if (category === 'all') {
      if (badge) badge.remove();
      button.removeAttribute('aria-label');
      button.hidden = false;
      return;
    }

    if (!badge) {
      badge = createElement('span', 'offer-filter-count');
      // Ο αριθμός κρύβεται από τους αναγνώστες οθόνης· το πλήρες νόημα
      // περνά από το aria-label, αλλιώς ακούγεται σκέτο «Κινητή 2».
      badge.setAttribute('aria-hidden', 'true');
      button.appendChild(badge);
    }

    badge.textContent = String(total);
    button.hidden = total === 0 && category !== 'all';

    const label = FILTER_LABELS[category] || button.dataset.label || '';
    const noun = total === 1 ? 'προσφορά' : 'προσφορές';
    button.setAttribute('aria-label', `${label}: ${total} ${noun}`);
  }

  /*
   * ΠΡΟΣΟΧΗ στο εύρος: το [data-category-filter] το φοράνε και οι μεγάλες
   * κάρτες της «Γρήγορης εκκίνησης» («Θέλω προσφορά κινητής» κ.λπ.), που έχουν
   * ήδη δικό τους περιγραφικό κείμενο και aria-label. Ο μετρητής μπαίνει μόνο
   * στα μικρά chips: τη μπάρα φίλτρων και το πλαϊνό μενού.
   */
  function updateFilterCounts(offers) {
    const counts = countOffersByCategory(offers);

    document.querySelectorAll('.offer-filter-bar [data-category-filter]').forEach((button) => {
      setFilterCount(button, button.dataset.categoryFilter, counts);
    });

    document.querySelectorAll('.premium-menu-chip[data-sidebar-category]').forEach((button) => {
      setFilterCount(button, button.dataset.sidebarCategory, counts);
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

    updateFilterCounts(offers);
    revealRenderedOfferCards(container);
    runPostRenderEnhancements();

    requestAnimationFrame(() => {
        if (typeof window.App?.offers?.syncAfterRender === 'function') {
            window.App.offers.syncAfterRender();
        }

        revealRenderedOfferCards(container);
    });
}

  /* --- ΠΕΡΙΕΧΟΜΕΝΟ ΤΟΥ PANEL ΛΕΠΤΟΜΕΡΕΙΩΝ -------------------------------
     Το panel απαντά τρεις ερωτήσεις: τι παίρνεις, τι πρέπει να ξέρεις, τι
     χρειάζεσαι για να το κάνεις.

     Πριν είχε επτά ισοδύναμες ενότητες που έλεγαν σε μεγάλο βαθμό το ίδιο
     πράγμα: για τη Vodafone CU το «300 GB και απεριόριστη ομιλία» εμφανιζόταν
     πέντε φορές, ενώ το roaming — η μόνη πληροφορία που δεν υπήρχε στην κάρτα —
     ήταν θαμμένο στην τρίτη ενότητα.
  --------------------------------------------------------------------- */

  // Κανονικοποίηση για σύγκριση: πεζά, χωρίς τόνους και σημεία στίξης. Έτσι το
  // «Απεριόριστη ομιλία προς όλους σταθερά και κινητά» και το «...σε σταθερά
  // και κινητά» αναγνωρίζονται ως το ίδιο.
  const ACCENTS = /[̀-ͯ]/g;

  function normalizeText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(ACCENTS, '')
      .replace(/[^a-z0-9α-ω\s]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  // Λέξεις χωρίς νόημα για τη σύγκριση· αν μείνουν μέσα, δύο άσχετες φράσεις
  // μοιάζουν όμοιες επειδή μοιράζονται «και», «σε», «για».
  const STOP_WORDS = new Set(['και', 'σε', 'για', 'με', 'το', 'τα', 'της', 'του', 'των', 'στον', 'στη', 'στην', 'προς', 'ολους', 'καθε']);

  function contentWords(value) {
    return normalizeText(value).split(' ').filter((word) => word.length > 2 && !STOP_WORDS.has(word));
  }

  /*
   * Πόσο από το `candidate` λέγεται ήδη μέσα στο `pool`. Επιστρέφει 0..1.
   * Χρησιμοποιείται με κατώφλι 0,8: μια γραμμή που επαναλαμβάνει σχεδόν όλα τα
   * ουσιαστικά της λόγια δεν προσθέτει τίποτα και παραλείπεται.
   */
  function coverage(candidate, pool) {
    const words = contentWords(candidate);
    if (!words.length) return 1;

    const known = new Set(pool.flatMap(contentWords));
    return words.filter((word) => known.has(word)).length / words.length;
  }

  const DUPLICATE_THRESHOLD = 0.8;

  // Ενοποιεί benefits + includes κρατώντας την πιο περιγραφική εκδοχή κάθε
  // στοιχείου. Τα δεδομένα δεν χρειάζεται να καθαριστούν χειροκίνητα.
  function mergeOfferHighlights(offer) {
    const candidates = [
      ...(Array.isArray(offer.includes) ? offer.includes : []),
      ...(Array.isArray(offer.benefits) ? offer.benefits : []),
    ].map((value) => String(value || '').trim()).filter(Boolean);

    const kept = [];
    candidates.forEach((candidate) => {
      const twin = kept.findIndex((existing) => (
        coverage(candidate, [existing]) >= DUPLICATE_THRESHOLD ||
        coverage(existing, [candidate]) >= DUPLICATE_THRESHOLD
      ));

      if (twin === -1) {
        kept.push(candidate);
        return;
      }

      // Κρατάμε τη μακρύτερη διατύπωση: λέει τα ίδια συν κάτι παραπάνω.
      if (contentWords(candidate).length > contentWords(kept[twin]).length) kept[twin] = candidate;
    });

    return kept;
  }

  // Ό,τι δεν λέει ήδη η λίστα: όροι, roaming, σε ποιον απευθύνεται.
  function collectOfferNotes(offer, highlights) {
    const notes = [];

    (Array.isArray(offer.details) ? offer.details : []).forEach((detail) => {
      const value = String(detail?.value || '').trim();
      if (!value || coverage(value, highlights) >= DUPLICATE_THRESHOLD) return;
      notes.push({ label: String(detail?.label || '').trim(), value });
    });

    (Array.isArray(offer.notes) ? offer.notes : []).forEach((note) => {
      const value = String(note || '').trim();
      if (value) notes.push({ label: '', value });
    });

    /*
     * Το appliesTo υπάρχει και στις έξι προσφορές αλλά δεν αποδιδόταν πουθενά.
     * Σε μερικές όμως το ίδιο κείμενο υπάρχει ήδη ως γραμμή «Ισχύει για» στα
     * details — χωρίς έλεγχο θα γραφόταν δύο φορές στην ίδια ενότητα.
     */
    const appliesTo = String(offer.appliesTo || '').trim();
    const alreadySaid = notes.map((note) => note.value);
    if (appliesTo && coverage(appliesTo, alreadySaid) < DUPLICATE_THRESHOLD) {
      notes.push({ label: 'Για ποιον είναι', value: appliesTo });
    }

    return notes;
  }

  function appendHighlightsSection(parent, highlights) {
    if (!highlights.length) return;

    const section = createElement('section', 'offer-details-block');
    appendTextElement(section, 'h3', '', 'Τι παίρνεις');
    const list = createElement('ul', 'offer-details-highlights');
    highlights.forEach((value) => {
      const item = createElement('li');
      const icon = window.createIcon?.('check');
      if (icon) {
        icon.setAttribute('aria-hidden', 'true');
        item.appendChild(icon);
      }
      appendTextElement(item, 'span', '', value);
      list.appendChild(item);
    });
    section.appendChild(list);
    parent.appendChild(section);
  }

  function appendPlansSection(parent, offer) {
    const plans = Array.isArray(offer.plans) ? offer.plans : [];
    if (!plans.length) return;

    const section = createElement('section', 'offer-details-block');
    appendTextElement(section, 'h3', '', 'Πακέτα');
    const grid = createElement('div', 'offer-details-plans');
    plans.forEach((plan) => {
      const card = createElement('article', 'offer-details-plan');
      appendTextElement(card, 'span', '', plan.name);
      appendTextElement(card, 'strong', '', plan.price);
      appendTextElement(card, 'small', '', [plan.speed, plan.period, plan.ribbon].filter(Boolean).join(' · '));
      grid.appendChild(card);
    });
    section.appendChild(grid);
    parent.appendChild(section);
  }

  function appendNotesSection(parent, notes) {
    if (!notes.length) return;

    const section = createElement('section', 'offer-details-block');
    appendTextElement(section, 'h3', '', 'Καλό να ξέρεις');
    const list = createElement('dl', 'offer-details-notes');
    notes.forEach((note) => {
      const row = createElement('div', 'offer-details-note');
      appendTextElement(row, 'dt', '', note.label);
      appendTextElement(row, 'dd', '', note.value);
      list.appendChild(row);
    });
    section.appendChild(list);
    parent.appendChild(section);
  }

  function appendDocumentsSection(parent, offer) {
    const documents = Array.isArray(offer.documents) ? offer.documents.filter((item) => item?.href) : [];
    if (!documents.length) return;

    const section = createElement('section', 'offer-details-block');
    appendTextElement(section, 'h3', '', 'Τι χρειάζεσαι');
    const list = createElement('div', 'offer-details-documents');
    documents.forEach((documentItem) => {
      const link = createElement('a', 'offer-details-document', documentItem.title || documentItem.href);
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

    // Ίδια βαθιά κεφαλίδα με την κάρτα, ώστε να είναι σαφές ότι πρόκειται για
    // την προσφορά που μόλις πατήθηκε.
    const header = createElement('div', 'offer-details-header');
    const headingGroup = createElement('div', 'offer-details-heading');
    const title = createElement('h2', 'offer-details-title');
    title.id = 'offerDetailsTitle';
    const price = createElement('p', 'offer-details-price');
    const note = createElement('p', 'offer-details-note');
    headingGroup.append(title, price, note);

    const closeButton = createElement('button', 'offer-json-details-close', '×');
    closeButton.type = 'button';
    closeButton.dataset.modalClose = modal.id;
    closeButton.setAttribute('aria-label', 'Κλείσιμο λεπτομερειών προσφοράς');
    header.append(headingGroup, closeButton);

    const body = createElement('div', 'offer-json-details-body custom-scroll');

    // Το CTA μένει καρφωμένο στον πάτο: πριν, ο χρήστης διάβαζε τις
    // λεπτομέρειες, έκλεινε το panel και ξανάψαχνε την κάρτα για να ενεργήσει.
    const footer = createElement('div', 'offer-details-footer');

    panel.append(header, body, footer);
    modal.appendChild(panel);
    document.body.appendChild(modal);
    return modal;
  }

  function populateDetailsModal(modal, offer) {
    const title = modal.querySelector('#offerDetailsTitle');
    const price = modal.querySelector('.offer-details-price');
    const note = modal.querySelector('.offer-details-note');
    const body = modal.querySelector('.offer-json-details-body');
    const footer = modal.querySelector('.offer-details-footer');
    if (!body) return;

    if (title) title.textContent = offer.title || 'Προσφορά';

    const pricing = getPricing(offer);
    if (price) {
      price.textContent = '';
      appendTextElement(price, 'span', 'offer-details-price-prefix', pricing.prefix);
      appendTextElement(price, 'strong', 'offer-details-price-num', pricing.amount);
      appendTextElement(price, 'span', 'offer-details-price-unit', pricing.unit);
    }
    if (note) note.textContent = pricing.note || '';

    body.textContent = '';
    const highlights = mergeOfferHighlights(offer);
    appendHighlightsSection(body, highlights);
    appendPlansSection(body, offer);
    appendNotesSection(body, collectOfferNotes(offer, highlights));
    appendDocumentsSection(body, offer);

    if (footer) {
      footer.textContent = '';
      const cta = createPrimaryCta(offer);
      cta.classList.add('offer-details-cta');
      footer.appendChild(cta);
    }
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
    getOffer: (offerId) => offersById.get(offerId) || null,
    fillModalForOffer,
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
