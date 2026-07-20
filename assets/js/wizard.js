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
    previousFocus: null,
  };

  let modal;

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

    buildVisibleDocs().forEach((doc, index) => {
      const itemId = `activation-doc-${state.provider}-${state.type}-${index}`;
      const item = document.createElement('div');
      item.className = 'activation-checklist__item';

      const content = document.createElement('span');
      const textLabel = document.createElement('span');
      textLabel.id = itemId;

      const title = document.createElement('strong');
      title.textContent = doc.title;
      textLabel.appendChild(title);

      if (doc.detail) {
        const detail = document.createElement('small');
        detail.textContent = doc.detail;
        textLabel.appendChild(detail);
      }

      content.appendChild(textLabel);

      if (doc.href) {
        const actions = document.createElement('span');
        actions.className = 'activation-checklist__actions';

        if (doc.href) {
          const previewButton = document.createElement('button');
          previewButton.type = 'button';
          previewButton.dataset.pdfUrl = doc.href;
          previewButton.dataset.pdfTitle = doc.title || doc.href.split('/').pop();
          previewButton.textContent = 'Προεπισκόπηση';
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
        content.appendChild(actions);
      }

      item.appendChild(content);
      checklist.appendChild(item);
    });

    updateChecklistState();
  }

  function updateChecklistState() {
    const hint = modal.querySelector('[data-activation-checklist-hint]');

    if (hint) {
      hint.classList.remove('activation-guide-note--warning');
      hint.classList.remove('activation-guide-note--complete');
      hint.textContent = 'Τα δικαιολογητικά είναι ενημερωτική λίστα. Μπορείς να συνεχίσεις χωρίς τσεκάρισμα.';
    }

    updateNavigation();
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

    if (trigger?.closest?.('#sidebarMenu')) {
      if (typeof closeSidebarInstantly === 'function') {
        closeSidebarInstantly();
      } else if (typeof toggleSidebar === 'function') {
        toggleSidebar();
      }
    }

    closeSourceModal(trigger);
    setType(trigger?.dataset?.activationType || 'new');
    renderProvider();
    updateEmailLinks();

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
