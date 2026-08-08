/* =========================================
   Mobile activation guide wizard
   Reuses existing contact details, IBANs, and document assets.
========================================= */
(function () {
  const EMAIL = 'synetelas2011@gmail.com';
  const HELP_PHONE = '2105245210';
  const TOTAL_STEPS = 4;

  const STEP_TITLES = Object.freeze({
    1: 'Τύπος σύνδεσης',
    2: 'Δικαιολογητικά',
    3: 'Πληρωμή / αποστολή',
    4: 'Ενεργοποίηση SIM',
  });

  const TYPE_LABELS = Object.freeze({
    new: 'Νέος αριθμός',
    portability: 'Φορητότητα',
  });

  const TYPE_EMAIL_PHRASES = Object.freeze({
    new: 'νέο αριθμό',
    portability: 'φορητότητα αριθμού',
  });

  const GUIDE_CONFIG = Object.freeze({
    vodafone: Object.freeze({
      offer: 'Vodafone CU',
      simNumber: '1252',
      docs: Object.freeze({
        common: Object.freeze([
          Object.freeze({
            title: 'Υπεύθυνη Δήλωση',
            detail: 'Συμπλήρωση και επικύρωση υπογραφής μέσω gov.gr ή ΚΕΠ.',
            href: 'assets/docs/ypefthini_dilosi_Vodafone.pdf',
            previewHref: 'assets/docs/ypefthini_dilosi_Vodafone_paradeigma.pdf',
          }),
          Object.freeze({
            title: 'Χρήση προσωπικών δεδομένων',
            detail: 'Έντυπο δεδομένων συνδρομητή συμβολαίου καρτοκινητής.',
            href: 'assets/docs/xrisi_prosopikon_dedomenon_sindromiti_Vodafone.pdf',
          }),
          Object.freeze({
            title: 'Φωτοτυπία ταυτότητας μπρος-πίσω',
            detail: 'Καθαρή φωτογραφία ή σάρωση και των δύο όψεων.',
          }),
        ]),
        portability: Object.freeze([
          Object.freeze({
            title: 'Αίτημα ενεργοποίησης / φορητότητας',
            detail: 'Απαιτείται μόνο όταν μεταφέρεις υπάρχον αριθμό.',
            href: 'assets/docs/aitima_foritotitas_Vodafone.pdf',
          }),
        ]),
      }),
    }),
    nova: Object.freeze({
      offer: 'NOVA Q',
      simNumber: '12200',
      docs: Object.freeze({
        common: Object.freeze([
          Object.freeze({
            title: 'Υπεύθυνη Δήλωση',
            detail: 'Συμπλήρωση και επικύρωση υπογραφής μέσω gov.gr ή ΚΕΠ.',
            href: 'assets/docs/ypefthini_dilosi_Q.pdf',
            previewHref: 'assets/docs/ypefthini_dilosi_Q_paradeigma.pdf',
          }),
          Object.freeze({
            title: 'Φωτοτυπία ταυτότητας μπρος-πίσω',
            detail: 'Καθαρή φωτογραφία ή σάρωση και των δύο όψεων.',
          }),
        ]),
        portability: Object.freeze([
          Object.freeze({
            title: 'Αίτηση φορητότητας',
            detail: 'Απαιτείται μόνο όταν μεταφέρεις υπάρχον αριθμό.',
            href: 'assets/docs/aitisi_apodixi_foritotitas_kinitis_Q.pdf',
          }),
          Object.freeze({
            title: 'Χρήση προσωπικών δεδομένων',
            detail: 'Συμπλήρωσέ το όπου ζητείται για τη φορητότητα.',
          }),
        ]),
      }),
    }),
  });

  const state = {
    provider: 'vodafone',
    offer: GUIDE_CONFIG.vodafone.offer,
    type: 'new',
    step: 1,
    amount: '',
    amountNote: '',
    previousFocus: null,
  };

  let modal;

  /* --- Διατήρηση κατάστασης -------------------------------------------
     Η διαδικασία κρατάει μέρες: υπεύθυνη δήλωση στο gov.gr, κατάθεση στην
     τράπεζα, αποστολή email. Χωρίς αποθήκευση, κάθε άνοιγμα του οδηγού
     ξεκινούσε από το μηδέν και χάνονταν τα τσεκαρισμένα δικαιολογητικά.
  --------------------------------------------------------------------- */
  const STORAGE_KEY = 'activationGuideProgress';

  function readStoredProgress() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_error) {
      // Private mode ή μπλοκαρισμένα cookies: ο οδηγός δουλεύει, απλώς δεν θυμάται.
      return {};
    }
  }

  function writeStoredProgress(progress) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
    } catch (_error) {
      // Δεν είναι λόγος να σπάσει η ροή.
    }
  }

  function getChecklistKey() {
    return `${state.provider}:${state.type}`;
  }

  function getCheckedDocs() {
    const stored = readStoredProgress();
    const checked = stored.docs?.[getChecklistKey()];
    return Array.isArray(checked) ? checked : [];
  }

  function setDocChecked(index, checked) {
    const stored = readStoredProgress();
    stored.docs = stored.docs || {};

    const key = getChecklistKey();
    const current = new Set(Array.isArray(stored.docs[key]) ? stored.docs[key] : []);

    if (checked) current.add(index);
    else current.delete(index);

    stored.docs[key] = [...current];
    writeStoredProgress(stored);
  }

  function saveSession() {
    const stored = readStoredProgress();
    writeStoredProgress({
      ...stored,
      session: {
        provider: state.provider,
        type: state.type,
        step: state.step,
        savedAt: Date.now(),
      },
    });
  }

  function getConfig() {
    return GUIDE_CONFIG[state.provider] || GUIDE_CONFIG.vodafone;
  }

  function getFocusableElements() {
    if (!modal || modal.classList.contains('hidden')) return [];

    return Array.from(modal.querySelectorAll([
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
    ].join(','))).filter((element) => {
      return Boolean(element.offsetParent || element === document.activeElement);
    });
  }

  function trackActivationEvent(name, params) {
    if (typeof trackEvent === 'function') {
      trackEvent(name, {
        provider: state.provider,
        offer_name: state.offer,
        connection_type: state.type,
        ...params,
      });
    }
  }

  function inferProvider(trigger) {
    const explicitProvider = trigger?.dataset?.activationProvider;
    if (explicitProvider && GUIDE_CONFIG[explicitProvider]) return explicitProvider;

    const offerText = [
      trigger?.dataset?.activationOffer,
      trigger?.dataset?.offer,
      trigger?.closest?.('[data-offer-card]')?.dataset?.offer,
    ].filter(Boolean).join(' ').toLowerCase();

    return offerText.includes('nova') ? 'nova' : 'vodafone';
  }

  function setType(nextType) {
    state.type = nextType === 'portability' ? 'portability' : 'new';
    renderTypeSelector();
    renderChecklist();
    updateEmailLinks();
    updateNavigation();
  }

  function buildVisibleDocs() {
    const config = getConfig();
    const docs = [...config.docs.common];

    if (state.type === 'portability') {
      docs.splice(1, 0, ...config.docs.portability);
    }

    return docs;
  }

  function renderTypeSelector() {
    modal.querySelectorAll('[data-activation-type]').forEach((button) => {
      const isActive = button.dataset.activationType === state.type;
      button.setAttribute('aria-pressed', String(isActive));
    });

    const note = modal.querySelector('[data-activation-type-note]');
    if (!note) return;

    note.textContent = state.type === 'portability'
      ? 'Για φορητότητα προστίθενται τα έντυπα μεταφοράς αριθμού και τα στέλνεις μαζί με τα υπόλοιπα.'
      : 'Για νέο αριθμό χρειάζονται μόνο τα βασικά έντυπα και η ταυτότητα. Το αποδεικτικό κατάθεσης θα το δεις στο βήμα πληρωμής.';
  }

  function renderChecklist() {
    const checklist = modal.querySelector('[data-activation-checklist]');
    if (!checklist) return;

    checklist.textContent = '';

    const checkedDocs = getCheckedDocs();

    buildVisibleDocs().forEach((doc, index) => {
      const itemId = `activation-doc-${state.provider}-${state.type}-${index}`;
      const item = document.createElement('div');
      item.className = 'activation-checklist__item';

      const content = document.createElement('label');
      content.className = 'activation-checklist__label';
      content.htmlFor = itemId;

      // Πραγματικό checkbox: πριν ήταν απλή λίστα ανάγνωσης και ο χρήστης
      // δεν μπορούσε να σημειώσει τι έχει ήδη ετοιμάσει.
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.id = itemId;
      checkbox.className = 'activation-checklist__checkbox';
      checkbox.checked = checkedDocs.includes(index);
      checkbox.dataset.activationDoc = String(index);
      content.appendChild(checkbox);

      const textLabel = document.createElement('span');
      textLabel.className = 'activation-checklist__text';

      const title = document.createElement('strong');
      title.textContent = doc.title;
      textLabel.appendChild(title);

      if (doc.detail) {
        const detail = document.createElement('small');
        detail.textContent = doc.detail;
        textLabel.appendChild(detail);
      }

      content.appendChild(textLabel);
      item.classList.toggle('is-checked', checkbox.checked);

      if (doc.href) {
        const actions = document.createElement('span');
        actions.className = 'activation-checklist__actions';

        if (doc.href) {
          /*
           * Όταν υπάρχει previewHref, η προεπισκόπηση δείχνει το συμπληρωμένο
           * υπόδειγμα — ο χρήστης βλέπει πώς μπαίνουν τα στοιχεία πριν πιάσει
           * στυλό. Η λήψη μένει πάντα στο κενό έντυπο (doc.href).
           */
          const previewButton = document.createElement('button');
          previewButton.type = 'button';
          previewButton.dataset.pdfUrl = doc.previewHref || doc.href;
          previewButton.dataset.pdfDownloadUrl = doc.href;
          const baseTitle = doc.title || doc.href.split('/').pop();
          previewButton.dataset.pdfTitle = doc.previewHref
            ? `${baseTitle} — συμπληρωμένο υπόδειγμα`
            : baseTitle;
          previewButton.textContent = doc.previewHref ? 'Δες υπόδειγμα' : 'Προεπισκόπηση';
          actions.appendChild(previewButton);
        } else if (doc.previewSrc) {
          const previewButton = document.createElement('button');
          previewButton.type = 'button';
          previewButton.dataset.previewSrc = doc.previewSrc;
          previewButton.textContent = 'Προεπισκόπηση';
          actions.appendChild(previewButton);
        }

        const link = document.createElement('a');
        link.href = doc.href;
        link.download = '';
        link.dataset.track = 'pdf_download';
        link.dataset.label = doc.href.split('/').pop();
        link.dataset.offer = state.offer;
        link.textContent = 'Λήψη εντύπου';
        actions.appendChild(link);
        item.appendChild(actions);
      }

      item.insertBefore(content, item.firstChild);
      checklist.appendChild(item);
    });

    updateChecklistState();
  }

  // Οι κλάσεις --warning/--complete υπήρχαν στο CSS αλλά μόνο αφαιρούνταν εδώ.
  // Τώρα δείχνουν πραγματική πρόοδο.
  function updateChecklistState() {
    const hint = modal.querySelector('[data-activation-checklist-hint]');
    const total = buildVisibleDocs().length;
    const done = getCheckedDocs().filter((index) => index < total).length;

    modal.querySelectorAll('.activation-checklist__item').forEach((item) => {
      const checkbox = item.querySelector('.activation-checklist__checkbox');
      item.classList.toggle('is-checked', Boolean(checkbox?.checked));
    });

    if (hint) {
      hint.classList.toggle('activation-guide-note--complete', total > 0 && done === total);
      hint.classList.toggle('activation-guide-note--warning', done > 0 && done < total);

      if (total === 0) {
        hint.textContent = 'Δεν απαιτούνται επιπλέον έντυπα για αυτή την επιλογή.';
      } else if (done === total) {
        hint.textContent = `Έτοιμα και τα ${total} δικαιολογητικά. Μπορείς να προχωρήσεις στην πληρωμή.`;
      } else if (done > 0) {
        hint.textContent = `Έχεις ετοιμάσει ${done} από ${total}. Η πρόοδος αποθηκεύεται αυτόματα.`;
      } else {
        hint.textContent = `${total} δικαιολογητικά. Τσέκαρε όσα ετοιμάζεις — η πρόοδος αποθηκεύεται.`;
      }
    }

    updateNavigation();
  }

  /* --- Ποσό κατάθεσης --------------------------------------------------
     Το βήμα πληρωμής έδειχνε IBAN χωρίς ποσό. Η τιμή έρχεται από την κάρτα
     της προσφοράς (data-activation-amount) και, όταν ο οδηγός ανοίγει από
     την επιλογή παρόχου, από το offers.json μέσω του renderer.
  --------------------------------------------------------------------- */
  function findOfferAmount(offerName) {
    const offers = window.App?.offerRenderer?.getOffers?.() || [];
    const match = offers.find((offer) => (
      offer.actionTarget?.activationOffer === offerName || offer.title === offerName
    ));

    return match ? { amount: match.price || '', note: match.pricing?.note || '' } : { amount: '', note: '' };
  }

  function renderAmount() {
    const card = modal.querySelector('[data-activation-amount-card]');
    if (!card) return;

    const value = card.querySelector('[data-activation-amount-value]');
    const note = card.querySelector('[data-activation-amount-note]');
    const copy = card.querySelector('[data-activation-amount-copy]');

    if (!state.amount) {
      card.hidden = true;
      return;
    }

    card.hidden = false;
    if (value) value.textContent = state.amount;
    if (note) {
      note.textContent = state.amountNote || '';
      note.hidden = !state.amountNote;
    }
    // Αντιγράφουμε μόνο τους αριθμούς: το «100€» δεν επικολλάται σε πεδίο ποσού.
    if (copy) copy.dataset.activationCopy = state.amount.replace(/[^\d,.]/g, '');
  }

  function buildMailto(type, offer) {
    const subject = type === 'portability'
      ? 'Αίτημα φορητότητας αριθμού'
      : 'Αίτημα ενεργοποίησης νέου αριθμού';
    const body = [
      'Καλησπέρα σας,',
      '',
      `Θα ήθελα να προχωρήσω με ${TYPE_EMAIL_PHRASES[type]} για ${offer}.`,
      'Σας αποστέλλω συνημμένα τα δικαιολογητικά και το αποδεικτικό κατάθεσης.',
      '',
      'Ονοματεπώνυμο:',
      'Τηλέφωνο επικοινωνίας:',
      '',
      'Ευχαριστώ.',
    ].join('\n');

    return `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  function updateEmailLinks() {
    const emailLink = modal.querySelector('[data-activation-email-link]');
    if (emailLink) {
      emailLink.href = buildMailto(state.type, state.offer);
      emailLink.dataset.track = 'email_click';
      emailLink.dataset.label = `activation_guide_${state.provider}_${state.type}`;
    }

    const problemLink = modal.querySelector('[data-activation-problem-email]');
    if (problemLink) {
      const subject = `Πρόβλημα ενεργοποίησης SIM - ${state.offer}`;
      const body = [
        'Καλησπέρα σας,',
        '',
        `Χρειάζομαι βοήθεια με την ενεργοποίηση SIM για ${state.offer}.`,
        '',
        'Πρόβλημα που εμφανίζεται:',
        '',
        'Τηλέφωνο επικοινωνίας:',
        '',
        'Ευχαριστώ.',
      ].join('\n');
      problemLink.href = `mailto:${EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      problemLink.dataset.track = 'email_click';
      problemLink.dataset.label = `activation_guide_problem_${state.provider}`;
    }
  }

  function renderProvider() {
    const config = getConfig();
    const offer = modal.querySelector('[data-activation-offer]');
    const simNumber = modal.querySelector('[data-activation-sim-number]');

    modal.dataset.activationProvider = state.provider;
    if (offer) offer.textContent = state.offer || config.offer;
    if (simNumber) simNumber.textContent = config.simNumber;

    const helpLink = modal.querySelector(`a[href="tel:${HELP_PHONE}"]`);
    if (helpLink) {
      helpLink.href = `tel:${HELP_PHONE}`;
    }
  }

  function updateProgress() {
    const progress = modal.querySelector('[data-activation-progress]');
    const title = modal.querySelector('[data-activation-step-title]');
    const bar = modal.querySelector('[data-activation-progress-bar]');

    if (progress) progress.textContent = `Βήμα ${state.step} από ${TOTAL_STEPS}`;
    if (title) title.textContent = STEP_TITLES[state.step];
    if (bar) bar.style.width = `${(state.step / TOTAL_STEPS) * 100}%`;
  }

  function renderStep() {
    modal.querySelectorAll('[data-activation-step]').forEach((step) => {
      const isCurrent = Number(step.dataset.activationStep) === state.step;
      step.classList.toggle('hidden', !isCurrent);
      step.setAttribute('aria-hidden', String(!isCurrent));
    });

    updateProgress();
    updateNavigation();
    trackActivationEvent('activation_guide_step_view', { step: state.step });

    const body = modal.querySelector('.activation-guide__body');
    if (body) body.scrollTop = 0;
  }

  function updateNavigation() {
    const previous = modal.querySelector('[data-activation-prev]');
    const next = modal.querySelector('[data-activation-next]');

    if (previous) previous.disabled = state.step === 1;
    if (next) {
      next.disabled = false;
      next.textContent = state.step === TOTAL_STEPS ? 'Ολοκλήρωση' : 'Επόμενο';
    }
  }

  function goToStep(nextStep) {
    const clampedStep = Math.max(1, Math.min(TOTAL_STEPS, nextStep));

    state.step = clampedStep;
    renderStep();
    saveSession();

    const activePanel = modal.querySelector(`[data-activation-step="${state.step}"]`);
    const firstControl = activePanel?.querySelector('button, a, input');
    if (firstControl) firstControl.focus({ preventScroll: true });
  }

  async function copyActivationText(button) {
    const text = button?.dataset?.activationCopy;
    if (!text) return;

    const label = button.querySelector('span');
    const originalText = label?.textContent || button.dataset.activationCopyLabel || 'Αντιγραφή';

    try {
      if (typeof writeClipboard === 'function') {
        await writeClipboard(text);
      } else if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }

      button.classList.add('is-copied');
      if (label) label.textContent = 'Αντιγράφηκε';
      if (typeof showToast === 'function') showToast('Αντιγράφηκε', 'success');
      trackActivationEvent('activation_guide_copy', { copy_value: text.includes('@') ? 'email' : 'iban' });

      window.setTimeout(() => {
        button.classList.remove('is-copied');
        if (label) label.textContent = originalText;
      }, 1800);
    } catch (error) {
      if (typeof showToast === 'function') showToast('Η αντιγραφή απέτυχε', 'error');
    }
  }

  function closeSourceModal(trigger) {
    const closeModalId = trigger?.dataset?.activationCloseModal;
    const sourceModal = closeModalId
      ? document.getElementById(closeModalId)
      : trigger?.closest?.('.modal-backdrop:not(#activationGuideModal)');

    if (!sourceModal?.id) return;

    if (typeof closeModal === 'function') {
      closeModal(sourceModal.id, false);
    } else {
      sourceModal.classList.add('hidden');
    }

    if (window.location.hash === `#${sourceModal.id}` && window.history?.replaceState) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    }
  }

  function openGuide(trigger) {
    if (!modal) return;

    state.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    state.provider = inferProvider(trigger);
    state.offer = trigger?.dataset?.activationOffer || trigger?.dataset?.offer || getConfig().offer;
    state.step = 1;

    // Το ποσό από την κάρτα· αν λείπει (άνοιγμα από επιλογή παρόχου), από το offers.json.
    const fallbackAmount = findOfferAmount(state.offer);
    state.amount = trigger?.dataset?.activationAmount || fallbackAmount.amount;
    state.amountNote = trigger?.dataset?.activationAmountNote || fallbackAmount.note;

    // Επαναφορά από προηγούμενη επίσκεψη, μόνο για τον ίδιο πάροχο.
    const session = readStoredProgress().session;
    const resumeType = session && session.provider === state.provider ? session.type : null;
    const resumeStep = session && session.provider === state.provider ? Number(session.step) : 0;

    if (trigger?.closest?.('#sidebarMenu')) {
      if (typeof closeSidebarInstantly === 'function') {
        closeSidebarInstantly();
      } else if (typeof toggleSidebar === 'function') {
        toggleSidebar();
      }
    }

    closeSourceModal(trigger);
    setType(trigger?.dataset?.activationType || resumeType || 'new');
    renderProvider();
    renderAmount();
    updateEmailLinks();

    if (resumeStep > 1 && resumeStep <= TOTAL_STEPS) state.step = resumeStep;

    if (trigger?.dataset?.track && typeof trackEvent === 'function') {
      trackEvent(trigger.dataset.track, {
        offer_name: state.offer,
        category: trigger.dataset.category || 'mobile',
        source: trigger.dataset.activationSource || 'activation_guide',
      });
    }

    modal.classList.remove('hidden');
    if (typeof lockPageScroll === 'function') {
      lockPageScroll();
    } else {
      document.body.classList.add('overflow-hidden', 'mobile-bottom-nav-suppressed');
    }

    renderStep();
    trackActivationEvent('activation_guide_open', { source: trigger?.dataset?.activationSource || 'unknown' });

    requestAnimationFrame(() => {
      const firstType = modal.querySelector(`[data-activation-type="${state.type}"]`);
      (firstType || modal.querySelector('[data-activation-guide-close]') || modal).focus({ preventScroll: true });
    });
  }

  function closeGuide() {
    if (!modal || modal.classList.contains('hidden')) return;

    modal.classList.add('hidden');
    trackActivationEvent('activation_guide_close', { step: state.step });

    if (typeof unlockPageScrollIfIdle === 'function') {
      unlockPageScrollIfIdle();
    } else {
      document.body.classList.remove('overflow-hidden', 'mobile-bottom-nav-suppressed');
    }

    if (state.previousFocus && document.contains(state.previousFocus)) {
      state.previousFocus.focus({ preventScroll: true });
    }
  }

  function handleGuideClick(event) {
    const openButton = event.target.closest('[data-activation-guide-open]');
    if (openButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openGuide(openButton);
      return;
    }

    if (!modal || modal.classList.contains('hidden')) return;

    // Τσεκάρισμα δικαιολογητικού: αποθηκεύεται αμέσως.
    const docCheckbox = event.target.closest('[data-activation-doc]');
    if (docCheckbox) {
      setDocChecked(Number(docCheckbox.dataset.activationDoc), docCheckbox.checked);
      updateChecklistState();
      trackActivationEvent('activation_guide_doc_toggle', {
        document_index: Number(docCheckbox.dataset.activationDoc),
        checked: docCheckbox.checked,
      });
      return;
    }

    const pdfPreviewButton = event.target.closest('[data-pdf-url]');
    if (pdfPreviewButton) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (window.App?.pdfPreview?.open) {
        window.App.pdfPreview.open({
          url: pdfPreviewButton.dataset.pdfUrl,
          title: pdfPreviewButton.dataset.pdfTitle,
        });
      }

      return;
    }

    const previewButton = event.target.closest('[data-preview-src]');
    if (previewButton) {
      event.preventDefault();
      event.stopImmediatePropagation();

      if (typeof openImagePreview === 'function') {
        openImagePreview(previewButton.dataset.previewSrc, false);
      }

      return;
    }

    const closeButton = event.target.closest('[data-activation-guide-close]');
    if (closeButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeGuide();
      return;
    }

    const typeButton = event.target.closest('[data-activation-type]');
    if (typeButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      setType(typeButton.dataset.activationType);
      trackActivationEvent('activation_guide_type_select', { selected_type: state.type });
      return;
    }

    const previousButton = event.target.closest('[data-activation-prev]');
    if (previousButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      goToStep(state.step - 1);
      return;
    }

    const nextButton = event.target.closest('[data-activation-next]');
    if (nextButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (state.step === TOTAL_STEPS) {
        closeGuide();
      } else {
        goToStep(state.step + 1);
      }
      return;
    }

    const copyButton = event.target.closest('[data-activation-copy]');
    if (copyButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      copyActivationText(copyButton);
    }
  }

  function handleGuideKeydown(event) {
    if (!modal || modal.classList.contains('hidden')) return;

    const imagePreview = document.getElementById('imagePreviewModal');
    if (imagePreview && !imagePreview.classList.contains('hidden')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeGuide();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleGuideBackdrop(event) {
    if (event.target !== modal) return;

    event.preventDefault();
    event.stopPropagation();
    closeGuide();
  }

  function initializeActivationGuide() {
    modal = document.getElementById('activationGuideModal');
    if (!modal || modal.dataset.activationGuideInitialized === 'true') return;
    modal.dataset.activationGuideInitialized = 'true';

    renderProvider();
    renderTypeSelector();
    renderChecklist();
    updateEmailLinks();
    updateProgress();
    updateNavigation();

    document.addEventListener('click', handleGuideClick);
    document.addEventListener('keydown', handleGuideKeydown, true);
    modal.addEventListener('click', handleGuideBackdrop);
  }

  function initWizard() {
    initializeActivationGuide();
  }

  window.openActivationGuide = openGuide;
  window.initializeActivationGuide = initWizard;
  window.App = window.App || {};
  window.App.wizard = {
    init: initWizard,
    open: openGuide,
  };
})();
