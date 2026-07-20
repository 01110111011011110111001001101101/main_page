/* =========================================
   IMAGE PREVIEW / ZOOM HELPERS
   Μεταφέρθηκε από το main.js
========================================= */

function openImagePreview(imgName, updateHistory = true) {
    const modal = document.getElementById('imagePreviewModal');
    const img = document.getElementById('previewImageTarget');
    if (!modal || !img) return;
    
    img.onload = () => {
        resetImagePreviewZoom(false);
        storeImagePreviewBaseWidth();
    };
    img.src = imgName;
    modal.classList.remove('hidden');
    lockPageScroll();

    if (updateHistory) {
        history.pushState({
            screen: 'image-preview',
            imagePreview: true,
            previewSrc: imgName,
            parentModalId: getOpenTrackedModalId(),
        }, '', window.location.href);
    }
    trackEvent('Documents', 'document_preview_open', getFileName(imgName), {
        ...getOpenOfferContext(),
        document_name: getFileName(imgName),
    });
    resetImagePreviewZoom(false);
    requestAnimationFrame(storeImagePreviewBaseWidth);
}


function storeImagePreviewBaseWidth() {
    const img = document.getElementById('previewImageTarget');
    if (!img) return;

    img.style.width = '';
    img.style.maxWidth = 'min(94vw, 1100px)';
    img.style.maxHeight = '86dvh';

    requestAnimationFrame(() => {
        const width = img.getBoundingClientRect().width;
        if (width > 0) img.dataset.baseWidth = String(width);
    });
}


function updateImagePreviewZoom() {
    const img = document.getElementById('previewImageTarget');
    const viewport = document.getElementById('imagePreviewViewport');
    const label = document.getElementById('imagePreviewZoomLabel');
    if (!img) return;

    if (imagePreviewZoom <= IMAGE_PREVIEW_MIN_ZOOM) {
        img.style.width = '';
        img.style.maxWidth = 'min(94vw, 1100px)';
        img.style.maxHeight = '86dvh';
        img.style.cursor = 'zoom-in';
        if (viewport) viewport.classList.remove('is-zoomed', 'is-dragging');
    } else {
        const baseWidth = Number(img.dataset.baseWidth) || img.getBoundingClientRect().width || img.naturalWidth;
        img.style.width = `${baseWidth * imagePreviewZoom}px`;
        img.style.maxWidth = 'none';
        img.style.maxHeight = 'none';
        img.style.cursor = 'grab';
        if (viewport) viewport.classList.add('is-zoomed');
    }

    if (label) label.textContent = `${Math.round(imagePreviewZoom * 100)}%`;
}


function zoomImagePreview(amount) {
    const viewport = document.getElementById('imagePreviewViewport');
    const wasAtMinimum = imagePreviewZoom <= IMAGE_PREVIEW_MIN_ZOOM;

    imagePreviewZoom = clamp(imagePreviewZoom + amount, IMAGE_PREVIEW_MIN_ZOOM, IMAGE_PREVIEW_MAX_ZOOM);
    updateImagePreviewZoom();

    if (viewport && wasAtMinimum && imagePreviewZoom > IMAGE_PREVIEW_MIN_ZOOM) {
        requestAnimationFrame(() => {
            viewport.scrollLeft = (viewport.scrollWidth - viewport.clientWidth) / 2;
            viewport.scrollTop = 0;
        });
    }
}


function resetImagePreviewZoom(scrollToTop = true) {
    imagePreviewZoom = 1;
    updateImagePreviewZoom();

    if (scrollToTop) {
        const viewport = document.getElementById('imagePreviewViewport');
        if (viewport) viewport.scrollTo({ top: 0, left: 0, behavior: 'smooth' });
    }
}


function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
}


function handleImagePreviewWheel(event) {
    const modal = document.getElementById('imagePreviewModal');
    if (!modal || modal.classList.contains('hidden')) return;

    event.preventDefault();
    zoomImagePreview(event.deltaY < 0 ? 0.25 : -0.25);
}


function handleImagePreviewTouchStart(event) {
    if (event.touches.length !== 2) return;
    stopImagePreviewDrag();
    imagePreviewPinchDistance = getTouchDistance(event.touches);
    imagePreviewPinchZoom = imagePreviewZoom;
}


function handleImagePreviewTouchMove(event) {
    if (event.touches.length !== 2 || imagePreviewPinchDistance <= 0) return;
    event.preventDefault();

    const currentDistance = getTouchDistance(event.touches);
    imagePreviewZoom = clamp(
        imagePreviewPinchZoom * (currentDistance / imagePreviewPinchDistance),
        IMAGE_PREVIEW_MIN_ZOOM,
        IMAGE_PREVIEW_MAX_ZOOM
    );
    updateImagePreviewZoom();
}


function handleImagePreviewTouchEnd() {
    imagePreviewPinchDistance = 0;
}


function stopImagePreviewDrag() {
    const viewport = document.getElementById('imagePreviewViewport');
    imagePreviewDragging = false;
    if (viewport) viewport.classList.remove('is-dragging');
}


function handleImagePreviewPointerDown(event) {
    const viewport = document.getElementById('imagePreviewViewport');
    if (!viewport || imagePreviewZoom <= IMAGE_PREVIEW_MIN_ZOOM || event.button > 0) return;

    imagePreviewDragging = true;
    imagePreviewDragStartX = event.clientX;
    imagePreviewDragStartY = event.clientY;
    imagePreviewDragScrollLeft = viewport.scrollLeft;
    imagePreviewDragScrollTop = viewport.scrollTop;
    viewport.classList.add('is-dragging');
    viewport.setPointerCapture?.(event.pointerId);
}


function handleImagePreviewPointerMove(event) {
    const viewport = document.getElementById('imagePreviewViewport');
    if (!viewport || !imagePreviewDragging) return;

    event.preventDefault();
    viewport.scrollLeft = imagePreviewDragScrollLeft - (event.clientX - imagePreviewDragStartX);
    viewport.scrollTop = imagePreviewDragScrollTop - (event.clientY - imagePreviewDragStartY);
}


function handleImagePreviewPointerUp(event) {
    const viewport = document.getElementById('imagePreviewViewport');
    if (viewport) viewport.releasePointerCapture?.(event.pointerId);
    stopImagePreviewDrag();
}


function isImagePreviewOpen() {
    const modal = document.getElementById('imagePreviewModal');
    return Boolean(modal && !modal.classList.contains('hidden'));
}

window.App = window.App || {};
window.App.imagePreview = {
    open: openImagePreview,
    zoom: zoomImagePreview,
    resetZoom: resetImagePreviewZoom,
    isOpen: isImagePreviewOpen,
    stopDrag: stopImagePreviewDrag,
    controls: {
        handleWheel: handleImagePreviewWheel,
        handleTouchStart: handleImagePreviewTouchStart,
        handleTouchMove: handleImagePreviewTouchMove,
        handleTouchEnd: handleImagePreviewTouchEnd,
        handlePointerDown: handleImagePreviewPointerDown,
        handlePointerMove: handleImagePreviewPointerMove,
        handlePointerUp: handleImagePreviewPointerUp,
    },
};

window.openImagePreview = openImagePreview;
