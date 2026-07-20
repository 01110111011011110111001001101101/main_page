/* =========================================
   APP STATE / SHARED SETTINGS
   Γενικές μεταβλητές που χρησιμοποιούνται από πολλά JS αρχεία
========================================= */

const IMAGE_PREVIEW_MIN_ZOOM = 1;
const IMAGE_PREVIEW_MAX_ZOOM = 4;
const MIN_CARD_VIEW_SECONDS = 2;
const SWIPE_BACK_MIN_DISTANCE = 90;
const SWIPE_BACK_MAX_VERTICAL_DISTANCE = 70;
const SWIPE_BACK_MAX_DURATION_MS = 900;
const SWIPE_BACK_EDGE_GUARD = 24;
let pageScrollY = 0;
let imagePreviewZoom = 1;
let imagePreviewPinchDistance = 0;
let imagePreviewPinchZoom = 1;
let imagePreviewDragging = false;
let imagePreviewDragStartX = 0;
let imagePreviewDragStartY = 0;
let imagePreviewDragScrollLeft = 0;
let imagePreviewDragScrollTop = 0;
let swipeBackStartX = 0;
let swipeBackStartY = 0;
let swipeBackStartTime = 0;
let swipeBackTracking = false;
const activeOfferViews = {};
const offerCardViewStarts = new Map();
const offerCardViewed = new Set();
const offerCardVisibility = new WeakMap();
let trackedOfferCards = [];

const wizardStepViewedKeys = new Set();
const wizardCompletedKeys = new Set();
let activeCategory = 'all';
let activeSearchQuery = '';
const HERO_INTRO_DESKTOP_QUERY = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(min-width: 1024px)')
    : {
        matches: false,
        addEventListener() {},
        removeEventListener() {},
        addListener() {},
        removeListener() {},
    };

function getFileName(pathValue) {
    return (pathValue || '').split('/').pop() || pathValue || 'unknown';
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

window.App = window.App || {};
window.App.config = {
    getFileName,
    clamp,
};

window.App.state = {
    get pageScrollY() { return pageScrollY; },
    set pageScrollY(value) { pageScrollY = value; },
    get imagePreviewZoom() { return imagePreviewZoom; },
    set imagePreviewZoom(value) { imagePreviewZoom = value; },
    get imagePreviewPinchDistance() { return imagePreviewPinchDistance; },
    set imagePreviewPinchDistance(value) { imagePreviewPinchDistance = value; },
    get imagePreviewPinchZoom() { return imagePreviewPinchZoom; },
    set imagePreviewPinchZoom(value) { imagePreviewPinchZoom = value; },
    get imagePreviewDragging() { return imagePreviewDragging; },
    set imagePreviewDragging(value) { imagePreviewDragging = value; },
    get imagePreviewDragStartX() { return imagePreviewDragStartX; },
    set imagePreviewDragStartX(value) { imagePreviewDragStartX = value; },
    get imagePreviewDragStartY() { return imagePreviewDragStartY; },
    set imagePreviewDragStartY(value) { imagePreviewDragStartY = value; },
    get imagePreviewDragScrollLeft() { return imagePreviewDragScrollLeft; },
    set imagePreviewDragScrollLeft(value) { imagePreviewDragScrollLeft = value; },
    get imagePreviewDragScrollTop() { return imagePreviewDragScrollTop; },
    set imagePreviewDragScrollTop(value) { imagePreviewDragScrollTop = value; },
    get swipeBackStartX() { return swipeBackStartX; },
    set swipeBackStartX(value) { swipeBackStartX = value; },
    get swipeBackStartY() { return swipeBackStartY; },
    set swipeBackStartY(value) { swipeBackStartY = value; },
    get swipeBackStartTime() { return swipeBackStartTime; },
    set swipeBackStartTime(value) { swipeBackStartTime = value; },
    get swipeBackTracking() { return swipeBackTracking; },
    set swipeBackTracking(value) { swipeBackTracking = value; },
    activeOfferViews,
    offerCardViewStarts,
    offerCardViewed,
    offerCardVisibility,
    get trackedOfferCards() { return trackedOfferCards; },
    set trackedOfferCards(value) { trackedOfferCards = value; },
    wizardStepViewedKeys,
    wizardCompletedKeys,
    get activeCategory() { return activeCategory; },
    set activeCategory(value) { activeCategory = value; },
    get activeSearchQuery() { return activeSearchQuery; },
    set activeSearchQuery(value) { activeSearchQuery = value; },
};
