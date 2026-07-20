/* =========================================
   PDF PREVIEW VIEWER
   Reusable PDF.js document preview modal.
========================================= */
(function () {
  'use strict';

  const PDF_JS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  const PDF_WORKER_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const MIN_ZOOM = 0.5;
  const MAX_ZOOM = 2.5;
  const ZOOM_STEP = 0.25;
  const FIT_PADDING = 28;
  const LOAD_ERROR_MESSAGE = 'Η προεπισκόπηση PDF δεν φορτώθηκε προσωρινά.';

  let modal = null;
  let canvas = null;
  let canvasContext = null;
  let statusEl = null;
  let fallbackEl = null;
  let fallbackLink = null;
  let titleEl = null;
  let zoomLabel = null;
  let pageLabel = null;
  let previousButton = null;
  let nextButton = null;
  let zoomOutButton = null;
  let zoomInButton = null;
  let downloadLink = null;
  let closeButton = null;
  let pdfJsPromise = null;
  let renderTask = null;
  let resizeTimer = 0;
  let initialized = false;

  const state = {
    pdf: null,
    url: '',
    title: '',
    pageNumber: 1,
    totalPages: 0,
    zoom: 1,
    fitScale: 1,
    previousFocus: null,
    renderId: 0,
  };
// Μεταβλητές για το touch
  let initialPinchDistance = null;
  let lastZoomTime = 0;

  function getDistance(touch1, touch2) {
    const dx = touch1.clientX - touch2.clientX;
    const dy = touch1.clientY - touch2.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function handleTouchStart(event) {
    if (!modal || modal.classList.contains('hidden')) return;
    // Αν έχουμε ακριβώς 2 δάχτυλα στην οθόνη (Pinch)
    if (event.touches.length === 2) {
      initialPinchDistance = getDistance(event.touches[0], event.touches[1]);
    }
  }

  function handleTouchMove(event) {
    if (!modal || modal.classList.contains('hidden') || event.touches.length !== 2 || !initialPinchDistance) return;
    
    // Throttle για να μην κολλήσει το render (60fps)
    const now = Date.now();
    if (now - lastZoomTime < 150) return;

    const currentDistance = getDistance(event.touches[0], event.touches[1]);
    const difference = currentDistance - initialPinchDistance;

    // Αν η διαφορά είναι σημαντική, κάνουμε zoom in ή zoom out
    if (difference > 30) {
      zoomPdf(ZOOM_STEP); // Ζουμ μέσα[cite: 2]
      initialPinchDistance = currentDistance;
      lastZoomTime = now;
    } else if (difference < -30) {
      zoomPdf(-ZOOM_STEP); // Ζουμ έξω[cite: 2]
      initialPinchDistance = currentDistance;
      lastZoomTime = now;
    }
  }

  function handleTouchEnd(event) {
    if (event.touches.length < 2) {
      initialPinchDistance = null;
    }
  }


  function createElement(tagName, className, text) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = String(text);
    return element;
  }

  function getFileName(url) {
    return String(url || '').split('/').pop()?.split('?')[0] || 'document.pdf';
  }

  function getDocumentTitle(trigger) {
    return (
      trigger.dataset.pdfTitle ||
      trigger.dataset.label ||
      trigger.getAttribute('aria-label') ||
      trigger.closest('.activation-checklist__item')?.querySelector('strong')?.textContent?.trim() ||
      getFileName(trigger.dataset.pdfUrl)
    );
  }

  function getPdfUrl(rawUrl) {
    if (!rawUrl) return '';
    return new URL(rawUrl, document.baseURI || window.location.href).href;
  }

  function buildModal() {
    if (modal) return modal;

    modal = createElement('div', 'pdf-preview-backdrop modal-backdrop hidden');
    modal.id = 'pdfPreviewModal';
    modal.setAttribute('role', 'presentation');

    const dialog = createElement('section', 'pdf-preview-dialog');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'pdfPreviewTitle');

    const header = createElement('header', 'pdf-preview-header');
    titleEl = createElement('h2', 'pdf-preview-title', 'Προεπισκόπηση εγγράφου');
    titleEl.id = 'pdfPreviewTitle';
    closeButton = createElement('button', 'pdf-preview-close', '×');
    closeButton.type = 'button';
    closeButton.dataset.pdfPreviewClose = '';
    closeButton.setAttribute('aria-label', 'Κλείσιμο προεπισκόπησης PDF');
    header.append(titleEl, closeButton);

    const body = createElement('div', 'pdf-preview-body');
    const stage = createElement('div', 'pdf-preview-stage');
    statusEl = createElement('p', 'pdf-preview-status', 'Φόρτωση PDF...');
    statusEl.setAttribute('role', 'status');
    canvas = createElement('canvas', 'pdf-preview-canvas');
    canvas.hidden = true;
    canvasContext = canvas.getContext('2d', { alpha: false });

    fallbackEl = createElement('div', 'pdf-preview-fallback');
    fallbackEl.hidden = true;
    const fallbackText = createElement('p', '', LOAD_ERROR_MESSAGE);
    fallbackLink = createElement('a', 'pdf-preview-fallback-link', 'Άνοιγμα PDF σε νέα καρτέλα');
    fallbackLink.target = '_blank';
    fallbackLink.rel = 'noopener';
    fallbackEl.append(fallbackText, fallbackLink);
    stage.append(statusEl, canvas, fallbackEl);
    body.appendChild(stage);

    const controls = createElement('footer', 'pdf-preview-controls');
    previousButton = createElement('button', 'pdf-preview-button', '‹');
    previousButton.type = 'button';
    previousButton.dataset.pdfPreviewPrevious = '';
    previousButton.setAttribute('aria-label', 'Προηγούμενη σελίδα');

    pageLabel = createElement('span', 'pdf-preview-page-label', 'Σελίδα - / -');
    pageLabel.setAttribute('aria-live', 'polite');

    nextButton = createElement('button', 'pdf-preview-button', '›');
    nextButton.type = 'button';
    nextButton.dataset.pdfPreviewNext = '';
    nextButton.setAttribute('aria-label', 'Επόμενη σελίδα');

    zoomOutButton = createElement('button', 'pdf-preview-button', '−');
    zoomOutButton.type = 'button';
    zoomOutButton.dataset.pdfPreviewZoomOut = '';
    zoomOutButton.setAttribute('aria-label', 'Σμίκρυνση PDF');

    zoomLabel = createElement('span', 'pdf-preview-zoom-label', '100%');
    zoomLabel.setAttribute('aria-live', 'polite');

    zoomInButton = createElement('button', 'pdf-preview-button', '+');
    zoomInButton.type = 'button';
    zoomInButton.dataset.pdfPreviewZoomIn = '';
    zoomInButton.setAttribute('aria-label', 'Μεγέθυνση PDF');

    downloadLink = createElement('a', 'pdf-preview-download', 'Λήψη PDF');
    downloadLink.download = '';
    downloadLink.dataset.track = 'pdf_download';

    controls.append(previousButton, pageLabel, nextButton, zoomOutButton, zoomLabel, zoomInButton, downloadLink);
    dialog.append(header, body, controls);
    modal.appendChild(dialog);
    document.body.appendChild(modal);
    return modal;
  }

  function loadPdfJs() {
    if (window.pdfjsLib?.getDocument) {
      return Promise.resolve(window.pdfjsLib);
    }

    if (pdfJsPromise) return pdfJsPromise;

    pdfJsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = PDF_JS_URL;
      script.async = true;
      script.onload = () => {
        if (!window.pdfjsLib?.getDocument) {
          reject(new Error('PDF.js did not initialize'));
          return;
        }

        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
        resolve(window.pdfjsLib);
      };
      script.onerror = () => reject(new Error('PDF.js could not be loaded'));
      document.head.appendChild(script);
    });

    return pdfJsPromise;
  }

  function setStatus(message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.hidden = !message;
  }

  function showFallback() {
    if (canvas) canvas.hidden = true;
    setStatus('');
    if (fallbackLink) fallbackLink.href = state.url;
    if (fallbackEl) fallbackEl.hidden = false;
  }

  function hideFallback() {
    if (fallbackEl) fallbackEl.hidden = true;
  }

  function updateControls() {
    const hasPdf = Boolean(state.pdf);
    const hasMultiplePages = state.totalPages > 1;
    const percent = Math.round(state.zoom * 100);

    if (titleEl) titleEl.textContent = state.title || 'Προεπισκόπηση εγγράφου';
    if (zoomLabel) zoomLabel.textContent = `${percent}%`;
    if (pageLabel) pageLabel.textContent = hasPdf ? `Σελίδα ${state.pageNumber} / ${state.totalPages}` : 'Σελίδα - / -';

    if (previousButton) {
      previousButton.disabled = !hasMultiplePages || state.pageNumber <= 1;
      previousButton.hidden = hasPdf && !hasMultiplePages;
    }

    if (nextButton) {
      nextButton.disabled = !hasMultiplePages || state.pageNumber >= state.totalPages;
      nextButton.hidden = hasPdf && !hasMultiplePages;
    }

    if (zoomOutButton) zoomOutButton.disabled = !hasPdf || state.zoom <= MIN_ZOOM;
    if (zoomInButton) zoomInButton.disabled = !hasPdf || state.zoom >= MAX_ZOOM;

    if (downloadLink) {
      downloadLink.href = state.url;
      downloadLink.dataset.label = getFileName(state.url);
      downloadLink.dataset.offer = state.title;
      downloadLink.setAttribute('aria-disabled', state.url ? 'false' : 'true');
    }
  }

  function lockScroll() {
    if (typeof lockPageScroll === 'function') {
      lockPageScroll();
      return;
    }

    document.body.classList.add('overflow-hidden');
  }

  function unlockScroll() {
    if (typeof unlockPageScrollIfIdle === 'function') {
      unlockPageScrollIfIdle();
      return;
    }

    document.body.classList.remove('overflow-hidden');
  }

  function calculateFitScale(page) {
    const body = modal?.querySelector('.pdf-preview-body');
    const measuredWidth = Math.max(body?.clientWidth || 0, window.innerWidth || 0);
    const availableWidth = Math.max(240, Math.min(1180, measuredWidth) - FIT_PADDING);
    const baseViewport = page.getViewport({ scale: 1 });
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, availableWidth / baseViewport.width));
  }

  async function renderCurrentPage() {
    if (!state.pdf || !canvasContext) return;

    const renderId = ++state.renderId;
    setStatus('Φόρτωση σελίδας...');
    hideFallback();

    if (renderTask) {
      renderTask.cancel();
      renderTask = null;
    }

    try {
      const page = await state.pdf.getPage(state.pageNumber);
      if (renderId !== state.renderId) return;

      if (!state.fitScale) {
        state.fitScale = calculateFitScale(page);
      }

      const outputScale = Math.max(1, window.devicePixelRatio || 1);
      const viewport = page.getViewport({ scale: state.fitScale * state.zoom });
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.setProperty('--pdf-preview-canvas-width', `${Math.floor(viewport.width)}px`);
      canvas.style.setProperty('--pdf-preview-canvas-height', `${Math.floor(viewport.height)}px`);
      canvas.classList.toggle('is-zoomed', state.zoom > 1);
      canvas.hidden = false;

      canvasContext.setTransform(outputScale, 0, 0, outputScale, 0, 0);
      renderTask = page.render({ canvasContext, viewport });
      await renderTask.promise;
      renderTask = null;

      if (renderId !== state.renderId) return;
      setStatus('');
      updateControls();
    } catch (error) {
      renderTask = null;
      if (error?.name === 'RenderingCancelledException') return;
      showFallback();
    }
  }

  async function openPdfPreview(options) {
    buildModal();

    state.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    state.url = getPdfUrl(options.url);
    state.title = options.title || getFileName(state.url);
    state.pageNumber = 1;
    state.totalPages = 0;
    state.zoom = 1;
    state.fitScale = 0;
    state.pdf = null;

    updateControls();
    hideFallback();
    if (canvas) canvas.hidden = true;
    setStatus('Φόρτωση PDF...');

    modal.classList.remove('hidden');
    lockScroll();
    closeButton?.focus({ preventScroll: true });

    try {
      const pdfjsLib = await loadPdfJs();
      const loadingTask = pdfjsLib.getDocument({ url: state.url });
      state.pdf = await loadingTask.promise;
      state.totalPages = state.pdf.numPages || 1;
      state.pageNumber = 1;
      updateControls();
      await renderCurrentPage();

      if (typeof trackEvent === 'function') {
        trackEvent('Documents', 'document_preview_open', getFileName(state.url), {
          document_name: getFileName(state.url),
          document_title: state.title,
        });
      }
    } catch (_error) {
      showFallback();
      updateControls();
    }
  }

  function closePdfPreview() {
    if (!modal || modal.classList.contains('hidden')) return;

    if (renderTask) {
      renderTask.cancel();
      renderTask = null;
    }

    state.renderId += 1;
    modal.classList.add('hidden');
    unlockScroll();

    if (state.previousFocus && document.contains(state.previousFocus)) {
      state.previousFocus.focus({ preventScroll: true });
    }
  }

  function zoomPdf(amount) {
    if (!state.pdf) return;
    state.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number((state.zoom + amount).toFixed(2))));
    updateControls();
    renderCurrentPage();
  }

  function goToPage(pageNumber) {
    if (!state.pdf) return;
    const nextPage = Math.min(state.totalPages, Math.max(1, pageNumber));
    if (nextPage === state.pageNumber) return;
    state.pageNumber = nextPage;
    updateControls();
    renderCurrentPage();
  }

  function handleDocumentClick(event) {
    const trigger = event.target.closest('[data-pdf-url]');
    if (trigger) {
      event.preventDefault();
      event.stopImmediatePropagation();
      openPdfPreview({
        url: trigger.dataset.pdfUrl,
        title: getDocumentTitle(trigger),
      });
      return;
    }

    if (!modal || modal.classList.contains('hidden')) return;

    if (event.target.closest('[data-pdf-preview-close]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closePdfPreview();
      return;
    }

    if (event.target.closest('[data-pdf-preview-zoom-out]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      zoomPdf(-ZOOM_STEP);
      return;
    }

    if (event.target.closest('[data-pdf-preview-zoom-in]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      zoomPdf(ZOOM_STEP);
      return;
    }

    if (event.target.closest('[data-pdf-preview-previous]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      goToPage(state.pageNumber - 1);
      return;
    }

    if (event.target.closest('[data-pdf-preview-next]')) {
      event.preventDefault();
      event.stopImmediatePropagation();
      goToPage(state.pageNumber + 1);
      return;
    }

    // Αποτροπή κλεισίματος αν το κλικ δεν είναι καθαρό ή προήλθε από drag/pinch
    if (event.target === modal) {
      // Έλεγχος αν το κλικ είναι "πραγματικό" (όχι ghost click από touch)
      if (event.pointerType === 'touch' && !event.isTrusted) return;
      
      event.preventDefault();
      event.stopImmediatePropagation();
      closePdfPreview();
    }
  }

  function handleKeydown(event) {
    if (!modal || modal.classList.contains('hidden')) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopImmediatePropagation();
      closePdfPreview();
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      event.stopImmediatePropagation();
      goToPage(state.pageNumber - 1);
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      event.stopImmediatePropagation();
      goToPage(state.pageNumber + 1);
    }
  }

  function handleResize() {
    if (!modal || modal.classList.contains('hidden') || !state.pdf) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      state.fitScale = 0;
      renderCurrentPage();
    }, 160);
  }

  function initializePdfPreview() {
    if (initialized) return;
    initialized = true;

    // Οι listeners που ήδη είχες
    document.addEventListener('click', handleDocumentClick, true);
    document.addEventListener('keydown', handleKeydown, true);
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    
    // ΕΔΩ μπαίνουν οι νέοι listeners για τα δάχτυλα!
    document.addEventListener('touchstart', handleTouchStart, { passive: false });
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleTouchEnd);
  }

  window.App = window.App || {};
  window.App.pdfPreview = {
    init: initializePdfPreview,
    open: openPdfPreview,
    close: closePdfPreview,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializePdfPreview, { once: true });
  } else {
    initializePdfPreview();
  }
})();
