(function () {
  'use strict';

  const CONFIG_NAMES = ['OFFICE_CLOSURE_CONFIG', 'PKSAA_OFFICE_CLOSURE_CONFIG'];
  const VALID_MODES = new Set(['off', 'date', 'on']);
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const OFFICE_PHONE_DIGITS = new Set(['2105245210', '6985177202']);
  const DEFAULT_TITLE = 'Θερινή άδεια γραφείου';
  const DEFAULT_MESSAGE = 'Το γραφείο του Συνεταιρισμού είναι κλειστό λόγω θερινής άδειας. Θα είμαστε ξανά διαθέσιμοι από [returnDateText]. Για γραπτό αίτημα, μπορείτε να στείλετε email.';
  const FALLBACK_EMAIL = 'synetelas2011@gmail.com';
  const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
  const TOAST_TRANSITION_MS = 260;

  let activeConfig = null;
  let elements = null;
  let pendingCallHref = '';
  let lastFocusedElement = null;
  let autoNoticeTimer = 0;
  let autoHideTimer = 0;
  let initialized = false;

  function safeString(value, fallback) {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || fallback;
  }

  function safeBoolean(value, fallback) {
    return typeof value === 'boolean' ? value : fallback;
  }

  function safeSeconds(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : fallback;
  }

  function getConfig() {
    const rawConfig = CONFIG_NAMES
      .map((name) => window[name])
      .find((config) => config && typeof config === 'object');

    if (!rawConfig || typeof rawConfig !== 'object') return null;

    const mode = safeString(rawConfig.mode, 'off').toLowerCase();
    if (!VALID_MODES.has(mode)) return null;

    const startDate = safeString(rawConfig.startDate, '');
    const endDate = safeString(rawConfig.endDate, '');

    return {
      mode,
      startDate,
      endDate,
      returnDateText: safeString(rawConfig.returnDateText, ''),
      title: safeString(rawConfig.title, DEFAULT_TITLE),
      message: safeString(rawConfig.message, DEFAULT_MESSAGE),
      showAutoNotice: safeBoolean(rawConfig.showAutoNotice, true),
      autoNoticeDelaySeconds: safeSeconds(rawConfig.autoNoticeDelaySeconds, 30),
      autoNoticeDurationSeconds: safeSeconds(rawConfig.autoNoticeDurationSeconds, 15),
      interceptCalls: safeBoolean(rawConfig.interceptCalls, true),
      emailFallback: safeString(rawConfig.emailFallback, FALLBACK_EMAIL),
    };
  }

  function getAthensDateKey() {
    try {
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Athens',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(new Date());

      const lookup = {};
      parts.forEach((part) => {
        lookup[part.type] = part.value;
      });

      return `${lookup.year}-${lookup.month}-${lookup.day}`;
    } catch (_error) {
      return new Date().toISOString().slice(0, 10);
    }
  }

  function isDateRangeValid(config) {
    return DATE_PATTERN.test(config.startDate) &&
      DATE_PATTERN.test(config.endDate) &&
      config.startDate <= config.endDate;
  }

  function isClosureActive(config) {
    if (!config || config.mode === 'off') return false;
    if (config.mode === 'on') return true;
    if (!isDateRangeValid(config)) return false;

    const today = getAthensDateKey();
    return today >= config.startDate && today <= config.endDate;
  }

  function formatMessage(config) {
    const returnDateText = config.returnDateText || 'την ημερομηνία επιστροφής';
    return config.message.replace(/\[returnDateText\]/g, returnDateText);
  }

  function getStorageKey(config) {
    return [
      'pksaaOfficeClosureAutoNoticeShown',
      config.mode,
      config.startDate,
      config.endDate,
      config.returnDateText,
    ].join(':');
  }

  function wasAutoNoticeShown(config) {
    try {
      return sessionStorage.getItem(getStorageKey(config)) === '1';
    } catch (_error) {
      return false;
    }
  }

  function markAutoNoticeShown(config) {
    try {
      sessionStorage.setItem(getStorageKey(config), '1');
    } catch (_error) {
      // Storage can fail in private browsing. The notice still works safely.
    }
  }

  function trackClosureEvent(name, payload) {
    if (typeof window.trackEvent === 'function') {
      window.trackEvent(name, payload || {});
    }
  }

  function getSiteEmail(config) {
    const configuredEmail = safeString(config.emailFallback, FALLBACK_EMAIL);
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(configuredEmail)) return configuredEmail;

    const emailLink = document.querySelector('a[href^="mailto:"]');
    if (!emailLink) return FALLBACK_EMAIL;

    return emailLink.getAttribute('href').replace(/^mailto:/i, '').split('?')[0] || FALLBACK_EMAIL;
  }

  function normalizePhoneDigits(href) {
    const digits = String(href || '').replace(/^tel:/i, '').replace(/[^\d]/g, '');
    return digits.startsWith('0030') ? digits.slice(4) : digits;
  }

  function isOfficeTelLink(link) {
    const href = link?.getAttribute?.('href') || '';
    if (!href.toLowerCase().startsWith('tel:')) return false;

    const digits = normalizePhoneDigits(href);
    if (OFFICE_PHONE_DIGITS.has(digits)) return true;
    if (digits.startsWith('30') && OFFICE_PHONE_DIGITS.has(digits.slice(2))) return true;
    return false;
  }

  function prefersReducedMotion() {
    return window.matchMedia?.(REDUCED_MOTION_QUERY).matches === true;
  }

  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
  }

  function createButton(className, text, ariaLabel) {
    const button = createElement('button', className, text);
    button.type = 'button';
    if (ariaLabel) button.setAttribute('aria-label', ariaLabel);
    return button;
  }

  function ensureElements(config) {
    if (elements) return elements;

    const toast = createElement('aside', 'office-closure-toast');
    toast.hidden = true;
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');

    const toastAccent = createElement('span', 'office-closure-toast__accent');
    toastAccent.setAttribute('aria-hidden', 'true');

    const toastCopy = createElement('div', 'office-closure-toast__copy');
    const toastTitle = createElement('strong', 'office-closure-toast__title', config.title);
    const toastText = createElement('span', 'office-closure-toast__text', formatMessage(config));
    toastCopy.append(toastTitle, toastText);

    const toastClose = createButton('office-closure-toast__close', '×', 'Κλείσιμο ειδοποίησης θερινής άδειας');
    toastClose.addEventListener('click', closeAutoNotice);
    toast.append(toastAccent, toastCopy, toastClose);

    const modal = createElement('div', 'office-closure-call-modal');
    modal.hidden = true;
    modal.setAttribute('role', 'presentation');

    const backdrop = createElement('div', 'office-closure-call-modal__backdrop');
    backdrop.setAttribute('data-office-closure-dismiss', 'true');

    const panel = createElement('section', 'office-closure-call-modal__panel');
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'true');
    panel.setAttribute('aria-labelledby', 'officeClosureCallTitle');
    panel.setAttribute('aria-describedby', 'officeClosureCallText');

    const modalHeader = createElement('div', 'office-closure-call-modal__header');
    const modalIcon = createElement('span', 'office-closure-call-modal__icon', '!');
    modalIcon.setAttribute('aria-hidden', 'true');
    const modalHeadingGroup = createElement('div', 'office-closure-call-modal__heading');
    const modalTitle = createElement('h2', '', config.title);
    modalTitle.id = 'officeClosureCallTitle';
    const modalEyebrow = createElement('span', '', 'Πριν την κλήση');
    modalHeadingGroup.append(modalEyebrow, modalTitle);
    const modalClose = createButton('office-closure-call-modal__close', '×', 'Κλείσιμο προειδοποίησης κλήσης');
    modalClose.addEventListener('click', closeCallWarning);
    modalHeader.append(modalIcon, modalHeadingGroup, modalClose);

    const modalText = createElement('p', 'office-closure-call-modal__text', formatMessage(config));
    modalText.id = 'officeClosureCallText';

    const actions = createElement('div', 'office-closure-call-modal__actions');
    const continueButton = createButton('office-closure-call-modal__button office-closure-call-modal__button--primary', 'Συνέχεια κλήσης');
    const cancelButton = createButton('office-closure-call-modal__button office-closure-call-modal__button--secondary', 'Άκυρο');
    const emailButton = createButton('office-closure-call-modal__button office-closure-call-modal__button--email', 'Στείλε Email');

    continueButton.addEventListener('click', continuePendingCall);
    cancelButton.addEventListener('click', closeCallWarning);
    emailButton.addEventListener('click', sendClosureEmail);
    actions.append(continueButton, cancelButton, emailButton);

    panel.append(modalHeader, modalText, actions);
    modal.append(backdrop, panel);
    modal.addEventListener('click', handleModalBackdropClick);

    document.body.append(toast, modal);

    elements = {
      toast,
      toastTitle,
      toastText,
      toastClose,
      modal,
      modalTitle,
      modalText,
      continueButton,
      cancelButton,
      emailButton,
    };

    return elements;
  }

  function refreshText(config) {
    const nodes = ensureElements(config);
    nodes.toastTitle.textContent = config.title;
    nodes.toastText.textContent = formatMessage(config);
    nodes.modalTitle.textContent = config.title;
    nodes.modalText.textContent = formatMessage(config);
  }

  function showAutoNotice() {
    if (!activeConfig || !activeConfig.showAutoNotice || wasAutoNoticeShown(activeConfig)) return;

    const nodes = ensureElements(activeConfig);
    refreshText(activeConfig);
    markAutoNoticeShown(activeConfig);
    clearTimeout(autoHideTimer);

    nodes.toast.hidden = false;
    requestAnimationFrame(() => {
      nodes.toast.classList.add('is-visible');
      trackClosureEvent('office_closure_auto_notice_show', {
        mode: activeConfig.mode,
        start_date: activeConfig.startDate,
        end_date: activeConfig.endDate,
      });
    });

    autoHideTimer = window.setTimeout(closeAutoNotice, activeConfig.autoNoticeDurationSeconds * 1000);
  }

  function closeAutoNotice() {
    if (!elements?.toast || elements.toast.hidden) return;

    clearTimeout(autoHideTimer);
    elements.toast.classList.remove('is-visible');

    const delay = prefersReducedMotion() ? 0 : TOAST_TRANSITION_MS;
    window.setTimeout(() => {
      if (!elements?.toast.classList.contains('is-visible')) {
        elements.toast.hidden = true;
      }
    }, delay);
  }

  function setCallWarningOpen(open) {
    document.documentElement.classList.toggle('office-closure-lock', open);
    document.body.classList.toggle('office-closure-lock', open);
  }

  function showCallWarning(telHref) {
    if (!activeConfig) return;

    const nodes = ensureElements(activeConfig);
    refreshText(activeConfig);
    pendingCallHref = telHref;
    lastFocusedElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    nodes.modal.hidden = false;
    setCallWarningOpen(true);
    requestAnimationFrame(() => {
      nodes.modal.classList.add('is-visible');
      nodes.cancelButton.focus();
      trackClosureEvent('office_closure_call_warning_show', {
        phone_href: telHref,
        mode: activeConfig.mode,
      });
    });
  }

  function closeCallWarning() {
    if (!elements?.modal || elements.modal.hidden) return;

    elements.modal.classList.remove('is-visible');
    setCallWarningOpen(false);

    const delay = prefersReducedMotion() ? 0 : TOAST_TRANSITION_MS;
    window.setTimeout(() => {
      if (!elements?.modal.classList.contains('is-visible')) {
        elements.modal.hidden = true;
      }
    }, delay);

    if (lastFocusedElement?.focus) {
      lastFocusedElement.focus({ preventScroll: true });
    }

    pendingCallHref = '';
  }

  function continuePendingCall() {
    const href = pendingCallHref;
    if (!href) return;

    trackClosureEvent('office_closure_call_continue', { phone_href: href });
    closeCallWarning();
    window.setTimeout(() => {
      window.location.href = href;
    }, 0);
  }

  function sendClosureEmail() {
    if (!activeConfig) return;

    const email = getSiteEmail(activeConfig);
    trackClosureEvent('office_closure_email_click', { email });
    closeCallWarning();
    window.setTimeout(() => {
      window.location.href = `mailto:${email}`;
    }, 0);
  }

  function handleModalBackdropClick(event) {
    if (event.target?.hasAttribute?.('data-office-closure-dismiss')) {
      closeCallWarning();
    }
  }

  function handleKeydown(event) {
    if (event.key === 'Escape' && elements?.modal && !elements.modal.hidden) {
      closeCallWarning();
    }
  }

  function handleTelClick(event) {
    if (!activeConfig?.interceptCalls) return;

    const link = event.target?.closest?.('a[href^="tel:"]');
    if (!link || !isOfficeTelLink(link)) return;

    event.preventDefault();
    event.stopPropagation();
    if (typeof event.stopImmediatePropagation === 'function') {
      event.stopImmediatePropagation();
    }

    showCallWarning(link.getAttribute('href'));
  }

  function scheduleAutoNotice(config) {
    if (!config.showAutoNotice || wasAutoNoticeShown(config)) return;

    clearTimeout(autoNoticeTimer);
    autoNoticeTimer = window.setTimeout(showAutoNotice, config.autoNoticeDelaySeconds * 1000);
  }

  function initOfficeClosure() {
    if (initialized) return;
    initialized = true;

    const config = getConfig();
    if (!isClosureActive(config)) return;

    activeConfig = config;
    ensureElements(config);
    scheduleAutoNotice(config);

    if (config.interceptCalls) {
      document.addEventListener('click', handleTelClick, true);
      document.addEventListener('keydown', handleKeydown);
    }
  }

  window.App = window.App || {};
  window.App.officeClosure = {
    init: initOfficeClosure,
    getConfig,
    isActive: () => isClosureActive(getConfig()),
  };
})();
