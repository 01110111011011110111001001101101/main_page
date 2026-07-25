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

/* =========================================
   LAZY SCRIPT LOADER
   Τα βαριά features (οδηγός ενεργοποίησης, PDF viewer, θερινή άδεια)
   δεν χρειάζονται στο πρώτο paint. Τα URLs με το ?v=<hash> ζουν στο
   <script type="application/json" id="lazyScripts"> του index.html,
   ώστε να τα σφραγίζει κανονικά το scripts/stamp-static-assets.mjs.
========================================= */
const loadedScripts = new Map();
let lazyScriptUrls = null;

function getLazyScriptUrls() {
    if (lazyScriptUrls) return lazyScriptUrls;

    lazyScriptUrls = {};
    try {
        const node = document.getElementById('lazyScripts');
        if (node?.textContent?.trim()) {
            lazyScriptUrls = JSON.parse(node.textContent);
        }
    } catch (error) {
        console.error('Δεν διαβάστηκε το μητρώο lazy scripts', error);
        lazyScriptUrls = {};
    }

    return lazyScriptUrls;
}

function loadScript(src) {
    if (!src) return Promise.reject(new Error('loadScript: λείπει το src'));
    if (loadedScripts.has(src)) return loadedScripts.get(src);

    const promise = new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false;
        script.onload = () => resolve(src);
        script.onerror = () => {
            loadedScripts.delete(src);
            reject(new Error(`Αποτυχία φόρτωσης script: ${src}`));
        };
        document.head.appendChild(script);
    });

    loadedScripts.set(src, promise);
    return promise;
}

function loadLazyScript(name) {
    const src = getLazyScriptUrls()[name];
    if (!src) return Promise.reject(new Error(`Άγνωστο lazy script: ${name}`));
    return loadScript(src);
}

window.App = window.App || {};
window.App.config = {
    getFileName,
    clamp,
};

window.App.loadScript = loadScript;
window.App.loadLazyScript = loadLazyScript;

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
