import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const offersPath = resolve('assets/data/offers.json');
const allowedCategories = new Set(['mobile', 'internet', 'tv', 'guide', 'other']);
const allowedCtaTypes = new Set(['activation-guide', 'modal']);
const requiredFields = ['id', 'provider', 'title', 'category', 'price', 'benefits'];
const failures = [];

let data;
try {
  data = JSON.parse(readFileSync(offersPath, 'utf8'));
} catch (error) {
  console.error(`offers.json is not valid JSON: ${error.message}`);
  process.exit(1);
}

if (!data || typeof data !== 'object' || Array.isArray(data)) failures.push('Root value must be an object.');
if (!Array.isArray(data?.offers)) failures.push('Root object must contain an offers array.');

const modalSource = readFileSync(resolve('assets/js/modals.js'), 'utf8');
const registryMatch = modalSource.match(/const lazyModalFragments = Object\.freeze\(\{([\s\S]*?)\}\);/);
const lazyModalIds = new Set(
  Array.from((registryMatch?.[1] || '').matchAll(/^\s*([A-Za-z][A-Za-z0-9]*):\s*['"][^'"]+['"]/gm), (match) => match[1]),
);
const staticMarkup = [
  readFileSync(resolve('index.html'), 'utf8'),
  ...Array.from(modalSource.matchAll(/['"](assets\/modals\/[^'"]+\.html)['"]/g), (match) => {
    const file = resolve(match[1]);
    return existsSync(file) ? readFileSync(file, 'utf8') : '';
  }),
].join('\n');

if (/data-modal-target=["']offerDetailsModal["']/.test(staticMarkup)) {
  failures.push('offerDetailsModal must not be used as a static modal target.');
}
if (/data-offer-details-open=["']\s*["']/.test(staticMarkup)) {
  failures.push('Static markup contains an empty data-offer-details-open attribute.');
}

function validateLocalReferences(value, label, path = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateLocalReferences(item, label, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') return;
  Object.entries(value).forEach(([key, nestedValue]) => {
    const fieldPath = path ? `${path}.${key}` : key;
    if ((key === 'href' || key === 'previewSrc') && typeof nestedValue === 'string') {
      if (!/^(?:https?:|mailto:|tel:|viber:|data:|#)/i.test(nestedValue)) {
        const localPath = nestedValue.split('#')[0].split('?')[0];
        if (!existsSync(resolve(localPath))) failures.push(`${label}: missing local asset in ${fieldPath}: ${localPath}`);
      }
    } else {
      validateLocalReferences(nestedValue, label, fieldPath);
    }
  });
}

const seenIds = new Set();
const offers = Array.isArray(data?.offers) ? data.offers : [];
const activeOffers = offers.filter((offer) => offer?.active !== false);

activeOffers.forEach((offer, index) => {
  const label = offer?.id || `offer at index ${index}`;
  if (!offer || typeof offer !== 'object' || Array.isArray(offer)) {
    failures.push(`${label}: offer must be an object.`);
    return;
  }

  requiredFields.forEach((field) => {
    if (offer[field] === undefined || offer[field] === null || offer[field] === '') failures.push(`${label}: missing required field "${field}".`);
  });

  if (typeof offer.id !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(offer.id)) {
    failures.push(`${label}: id must be a non-empty lowercase slug.`);
  } else if (seenIds.has(offer.id)) {
    failures.push(`${label}: duplicate id "${offer.id}".`);
  } else {
    seenIds.add(offer.id);
  }

  if (offer.id === 'offerDetailsModal' || offer.modalId === 'offerDetailsModal' || offer.actionTarget?.modalId === 'offerDetailsModal') {
    failures.push(`${label}: offerDetailsModal cannot be used as an offer or modal target.`);
  }
  if (!Array.isArray(offer.benefits)) failures.push(`${label}: benefits must be an array.`);
  if (typeof offer.category !== 'string' || !allowedCategories.has(offer.category)) failures.push(`${label}: invalid category.`);
  if (!allowedCtaTypes.has(offer.ctaType)) failures.push(`${label}: invalid ctaType "${offer.ctaType || ''}".`);

  const actionTarget = offer.actionTarget;
  if (!actionTarget || typeof actionTarget !== 'object' || Array.isArray(actionTarget)) {
    failures.push(`${label}: actionTarget must be an object.`);
  } else {
    ['track', 'offer', 'category'].forEach((field) => {
      if (typeof actionTarget[field] !== 'string' || !actionTarget[field].trim()) failures.push(`${label}: actionTarget.${field} is required.`);
    });
  }

  if (offer.ctaType === 'modal') {
    const modalId = offer.modalId || actionTarget?.modalId;
    if (!modalId || !lazyModalIds.has(modalId)) failures.push(`${label}: modalId must exist in the lazy modal registry.`);
  }
  if (offer.ctaType === 'activation-guide') {
    if (!actionTarget?.activationProvider) failures.push(`${label}: activation-guide requires actionTarget.activationProvider.`);
    if (!actionTarget?.activationOffer) failures.push(`${label}: activation-guide requires actionTarget.activationOffer.`);
  }

  validateLocalReferences(offer, label);
});

if (failures.length) {
  console.error([...new Set(failures)].map((failure) => `- ${failure}`).join('\n'));
  process.exit(1);
}

console.log(`offers.json validation passed for ${activeOffers.length} active offers.`);
