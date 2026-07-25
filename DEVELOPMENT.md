# Ανάπτυξη

Στατικό site για το `synetairismos-astynomikon.gr`. Χωρίς framework:
απλά HTML, CSS και JavaScript, με build scripts για bundling και hashing.

## Εντολές

| Εντολή | Τι κάνει |
|---|---|
| `npm run build` | Πλήρες build: εικόνες, Tailwind, icon sprite, CSS bundle, JS bundle, asset stamping |
| `npm run check` | Όλα τα quality gates + unit tests. **Τρέξ' το πριν από κάθε commit** |
| `npm test` | Μόνο τα unit tests (`node --test`) |
| `npm run validate:offers` | Έλεγχος του `assets/data/offers.json` |
| `npm run audit:css` | Αναφορά για νεκρό CSS, χωρίς να γράψει τίποτα |
| `npm run dev` | Tailwind σε watch mode |

## Δομή

```
assets/
  css/
    site.css        ← η κύρια πηγή CSS
    critical.css    ← above-the-fold, ενσωματώνεται inline (δες προειδοποίηση)
    tailwind.css    ← παραγόμενο, μην το επεξεργάζεσαι
  js/               ← πηγαία scripts (δες σειρά φόρτωσης παρακάτω)
  data/offers.json  ← οι προσφορές· δες ΟΔΗΓΟΣ-ΠΡΟΣΦΟΡΩΝ.md
  modals/           ← lazy-loaded HTML fragments
scripts/            ← build και checks
tests/              ← unit tests σε jsdom
tools/              ← audits (dead code, dead CSS, smoke test)
```

## Δύο πράγματα που πρέπει να ξέρεις

**1. Το `critical.css` είναι χειροκίνητο και αντιγράφει κανόνες από το `site.css`.**
Αν αλλάξεις κάτι above-the-fold (πάνω μπάρα, hero, γρήγορη εκκίνηση) πρέπει να
το αλλάξεις **και στα δύο** αρχεία. Έχουν ήδη αποκλίνει στο παρελθόν.

**2. Τα scripts μοιράζονται global scope, δεν είναι ES modules.**
Η σειρά στο `scripts/build-js-bundle.mjs` έχει σημασία. Αν προσθέσεις αρχείο,
βάλ' το στη λίστα `EAGER_SCRIPTS`. Τα lazy scripts (wizard, pdf-preview,
office-closure) φορτώνονται κατ' απαίτηση μέσω του μητρώου `#lazyScripts`.

## Scroll

Υπάρχει **ένας** scroll/resize listener για όλη τη σελίδα, στο
`assets/js/scroll-coordinator.js`. Μην προσθέτεις καινούριο — κάνε συνδρομή:

```js
const unsubscribe = window.App.scroll.subscribe(({ scrollY, direction }) => {
  // τρέχει μία φορά ανά requestAnimationFrame
});
```

## Πάνω μπάρα — ποιος ελέγχει τι

| Κλάση | Ιδιοκτήτης | Σημασία |
|---|---|---|
| `is-scrolled` | `main.js` | Ο χρήστης έχει κάνει scroll πάνω από 50px |
| `site-top-nav-hidden` | `ui.js` | Κινητό: φαίνεται το mini nav, άρα κρύβεται η μπάρα |
| `hero-nav-visible` | `ui.js` | Hero intro |

Μία συμπεριφορά, ένας ιδιοκτήτης. Μην προσθέτεις δεύτερο σύστημα στο ίδιο στοιχείο.

## CSS specificity

Το `site.css` έχει ιστορικό από πολλά `!important`. Πριν προσθέσεις κανόνα που
δεν «πιάνει», έλεγξε ποιος κερδίζει — συνήθως υπάρχει legacy κανόνας με
μεγαλύτερη specificity. Τα σχόλια στους κανόνες `.new-premium-*` και
`site-top-nav-hidden` εξηγούν συγκεκριμένες τέτοιες μάχες.

## Tests

`node --test` με jsdom. Καλύπτουν το render των καρτών, τη λογική
scroll/navigation και τον scroll coordinator. Το `npm run check` τα τρέχει.
Νέα συμπεριφορά → νέο test, ειδικά αν διορθώνεις bug.

## Τεκμηρίωση

- `ΟΔΗΓΟΣ-ΠΡΟΣΦΟΡΩΝ.md` — πώς προσθέτεις ή αλλάζεις προσφορά
- `CODE-REVIEW-SENIOR.md` — τεχνικό χρέος και τι μένει
