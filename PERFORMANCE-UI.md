# Βελτιώσεις απόδοσης & εμφάνισης

Μετρήσεις από το repo στις 2026-07-25. `npm run lint` περνάει καθαρό· `html-validate` βγάζει 8 errors (βλ. §3.4).

| Asset | Μέγεθος | Σχόλιο |
|---|---|---|
| `bundle.9f45ac3a.min.css` | **255 KB** (44 KB gzip) | το βαρύτερο αρχείο του site |
| `assets/js/*` (14 αρχεία) | **192 KB** (43 KB gzip) | **χωρίς minification** |
| `inter-latin.woff2` | 48 KB | |
| `space-grotesk-latin.woff2` | 22 KB | preloaded — δεν καλύπτει ελληνικά |
| `icons.svg` | 21 KB | 41 αναφορές `<use>` |
| `hero-logo.svg` | 20 KB | το LCP στοιχείο |
| `hero-banner.jpg` | 205 KB | **αχρησιμοποίητο** |
| `...report.html` | 597 KB | Lighthouse report, ανεβασμένο κατά λάθος |

---

## 1. Κρίσιμα — μεγάλο κέρδος, μικρή αλλαγή

### 1.1 Το λογότυπο του hero σπάει στο πρώτο paint (CLS + άσχημο flash)

`index.html:167` — `<img class="hero-logo-svg" ... width="1920" height="600">`

**Η κλάση `hero-logo-svg` δεν υπάρχει σε κανένα CSS.** Όλοι οι κανόνες (`critical.css:5,10` και `site.css:10933,11096`) στοχεύουν `.police-hero__logo`.

Το μόνο που το συγκρατεί είναι το `img,video{max-width:100%;height:auto}` του Tailwind preflight — που ζει **μόνο στο async bundle**, όχι στο `critical.css`. Άρα:

1. πρώτο paint → η εικόνα ζωγραφίζεται στα 1920px και τινάζει το layout του hero
2. φορτώνει το bundle → μαζεύεται στα ~190-260px

Είναι το LCP στοιχείο, οπότε χτυπάει και LCP και CLS.

**Διόρθωση (2 γραμμές):**
```html
<img class="police-hero__logo" src="assets/images/hero-logo.svg" ... fetchpriority="high">
```
και πρόσθεσε στο `critical.css` δίχτυ ασφαλείας:
```css
img,svg{max-width:100%;height:auto}
```

### 1.2 Λάθος γραμματοσειρά στο preload

Το `scripts/build-css-bundle.mjs:33` σβήνει το preload του `inter-greek` και ξαναβάζει **μόνο** το `space-grotesk-latin`.

- Το **Space Grotesk δεν έχει ελληνικούς χαρακτήρες** και το `@font-face` του δεν έχει `unicode-range` → κατεβαίνει 22 KB σε κάθε επίσκεψη, με τη μέγιστη προτεραιότητα, για να αποδώσει σχεδόν τίποτα (μόνο λατινικά μέσα σε τίτλους: «Vodafone CU», «EON»).
- Το **`inter-greek.woff2` (19 KB) αποδίδει ΟΛΟ το ελληνικό κείμενο** και ανακαλύπτεται καθυστερημένα, μετά το parse του CSS → FOUT στο κυρίως περιεχόμενο.

**Διόρθωση:** αντίστρεψέ τα στο build script — preload το `inter-greek`, και δώσε στο Space Grotesk `unicode-range: U+0000-00FF, U+0131, U+0152-0153;` ώστε ο browser να το κατεβάζει μόνο όταν χρειάζεται.

### 1.3 Το JS δεν περνάει καθόλου minification

Το build minifies CSS (lightningcss) αλλά τα 14 JS αρχεία σερβίρονται όπως είναι: **192 KB**, με ελληνικά σχόλια και ονόματα πλήρους μήκους.

**Διόρθωση:** πρόσθεσε ένα βήμα με `esbuild` (~40-50% μείωση, και bundle σε 1 αρχείο αντί για 14 requests):
```bash
npx esbuild assets/js/{config,clipboard,image-preview,ui,modals,offers,offer-renderer,wizard,tracking,office-closure.config,office-closure,pdf-preview,main}.js \
  --bundle=false --minify --outdir=assets/js/min
```
Επειδή τα αρχεία βασίζονται σε globals και σε συγκεκριμένη σειρά, το πιο ασφαλές είναι απλό concat + minify σε ένα `app.<hash>.min.js`.

### 1.4 255 KB CSS

Το `site.css` έχει **11.696 γραμμές, 1.262 `!important` και 95 media queries**. Το `.offers-section-catalog` εμφανίζεται 88 φορές ως αρχή selector, το `.police-hero` 21.

Δεν λύνεται σε ένα βήμα, αλλά:

- Τρέξε **PurgeCSS** πάνω στο `index.html` + `info.html` + `assets/modals/*.html`. Με τόσα layered overrides, ρεαλιστικά κόβεις 40-60%.
- Τα 1.262 `!important` είναι σύμπτωμα ότι νεότεροι κανόνες γράφτηκαν από πάνω αντί να αντικαταστήσουν τους παλιούς. Κάθε φορά που αγγίζεις ένα component, σβήσε το παλιό block.
- Το `tailwind.css` (39 KB) μπαίνει ολόκληρο στο bundle. Έλεγξε ότι το content scanning του Tailwind v4 πιάνει και τα `assets/modals/*.html`, αλλιώς είτε κρατάς αχρείαστα utilities είτε σου λείπουν.

### 1.5 Σβήσε ό,τι δεν σερβίρεται

```bash
git rm main-page-theta-bice.vercel.app_2026-07-15_15-59-34.report.html   # 597 KB
git rm assets/images/hero-banner.jpg                                      # 205 KB, καμία αναφορά
git rm assets/js/nameday-loader.js                                        # δεν φορτώνεται πια
```
Το `logo-source.png` κράτησέ το — είναι το input του `scripts/optimize-images.mjs`.

---

## 2. Απόδοση — δεύτερο επίπεδο

### 2.1 Το sprite των εικονιδίων καθυστερεί
41 `<use href="assets/icons/icons.svg#...">`. Ο browser δεν ζωγραφίζει **κανένα** εικονίδιο πριν κατέβει το εξωτερικό SVG → τα εικονίδια «σκάνε» μετά το πρώτο paint, ιδίως στο top nav.

**Διόρθωση:** inline μόνο τα 4-6 εικονίδια του above-the-fold (menu, phone, τα 4 του mini nav) ως `<symbol>` σε ένα κρυφό `<svg>` στην αρχή του `<body>`. Τα υπόλοιπα μένουν στο εξωτερικό sprite.

### 2.2 Το `offers.json` έρχεται μετά το JS
Οι κάρτες προσφορών —το κύριο περιεχόμενο— ζωγραφίζονται μόνο αφού: κατέβει το `offer-renderer.js` → τρέξει → κάνει fetch το `offers.json` → parse → render. Τρία σειριακά round-trips μέχρι να δει ο χρήστης προσφορά.

**Διόρθωση:** `<link rel="preload" href="assets/data/offers.json?v=20260711-1" as="fetch" crossorigin>` στο `<head>`. Κερδίζεις ένα ολόκληρο round-trip.

Σημείωση: το `vercel.json` δίνει στο `/assets/data/*` μόνο `max-age=300`. Επειδή το URL έχει ήδη `?v=` version, μπορείς να το ανεβάσεις σε `max-age=31536000, immutable` όπως τα υπόλοιπα assets.

### 2.3 Διπλός IntersectionObserver στις κάρτες
`offers.js:123` — το `initializeOfferCardReveal` καλείται από `initializeOffers` **και** από `syncAfterRender`, δημιουργώντας νέο observer κάθε φορά χωρίς `disconnect()` του προηγούμενου. Σε κάθε re-render συσσωρεύονται observers πάνω στα ίδια στοιχεία. Κράτα module-level reference και κάνε disconnect, όπως ήδη κάνεις σωστά στο `tracking.js:805`.

### 2.4 Πολλαπλοί scroll listeners
Τρέχουν ταυτόχρονα: `main.js:68` (sticky nav), `ui.js:49` (mini nav), `ui.js:257` (hero nav), `tracking.js:665` (analytics). Καθένας διαβάζει geometry σε κάθε scroll event.

**Διόρθωση:** ένας κοινός `scroll` listener που κάνει `requestAnimationFrame` και καλεί τους 4 handlers, ή μετάτρεψέ τους σε `IntersectionObserver` (το `.site-top-nav` και το mini nav είναι κλασικές περιπτώσεις για sentinel element).

### 2.5 Το ticker δεν σταματά ποτέ
`.announcement-ticker__track` — `animation: 28s linear infinite` σε `transform`. Είναι composited, οπότε φθηνό, αλλά κρατάει τη σελίδα μόνιμα «ζωντανή» (μπαταρία σε κινητά). Πρόσθεσε παύση όταν δεν φαίνεται:
```css
.announcement-ticker:not(:hover) .announcement-ticker__track { animation-play-state: running; }
```
ή απλά σταμάτα το με IntersectionObserver όταν ο χρήστης σκρολάρει κάτω από το hero. (Το `prefers-reduced-motion` το καλύπτεις ήδη σωστά.)

---

## 3. Εμφάνιση

### 3.1 Το κουμπί «Συνέχεια μόνο με τα απαραίτητα» είναι σχεδόν αόρατο
`index.html:381`:
```html
style="color: #65514c;" class="... bg-slate-900 ..."
```
Καφέ-γκρι κείμενο (`#65514c`) πάνω σε σχεδόν μαύρο φόντο (`#0f172a`) → contrast ratio **~1.6:1**. Το ελάχιστο του WCAG AA είναι 4.5:1. Πρακτικά ο χρήστης δεν βλέπει την επιλογή απόρριψης — που είναι και θέμα συμμόρφωσης GDPR (οι δύο επιλογές πρέπει να είναι ισότιμα ορατές).

**Διόρθωση:** σβήσε το inline style και βάλε `text-slate-300` (ή `text-white/80`). Λύνει και το `no-inline-style` error του html-validate.

### 3.2 Τα εικονίδια του `.icon` δεν έχουν σταθερό μέγεθος πριν το CSS
Το `.icon{width:1em;height:1em}` είναι στο `critical.css` — ΟΚ. Αλλά τα `.choice-card .icon{width:2.25rem}` είναι μόνο στο mobile block. Στο desktop τα εικονίδια των choice cards παίρνουν το προεπιλεγμένο 1em → πολύ μικρά μέχρι να φορτώσει το bundle.

### 3.3 Ο μοναδικός `<h1>` είναι οπτικά κρυμμένος
`critical.css` κρύβει το `.police-hero__title` με `clip:rect(0 0 0 0)`. Λειτουργικά σωστό για screen readers, αλλά ο τίτλος «Αρχική Π.Κ.Σ.Α.Α.» δεν λέει τίποτα. Κάν' τον περιγραφικό: «Προσφορές για τα μέλη του Συνεταιρισμού Αστυνομικών Αττικής» — βοηθάει και το SEO χωρίς οπτική αλλαγή.

### 3.4 html-validate: 8 errors
```
105,136,153,160,166,242  trailing whitespace
117:60                   aria-label σε <div> (δεν επιτρέπεται χωρίς role)
381:64                   inline style
```
Το `117` θέλει `role="group"` στο `.top-bar-mini-nav` για να είναι έγκυρο το `aria-label`.

### 3.5 Ασυνέπεια στα offer cards
Το `offers.json` ορίζει `recommendationBadge` και `isRecommended` σε δύο προσφορές, αλλά ο `offer-renderer.js` **δεν τα αποδίδει πουθενά** — μόνο το `badge` γίνεται `.offer-card__spec-pill`. Είτε λείπει markup, είτε νεκρά πεδία στο JSON.

Ομοίως το `appliesTo` και το `plans[].title` δεν εμφανίζονται ποτέ.

---

## 4. Κατάσταση υλοποίησης

### Εφαρμόστηκαν (2026-07-25)

| # | Τι έγινε |
|---|---|
| 1.1 | `class="police-hero__logo hero-logo-svg"` + `fetchpriority="high"` + `<link rel="preload" as="image">`. Δίχτυ ασφαλείας `img,svg,video{max-width:100%;height:auto}` στο `critical.css` **και** στο inline block. |
| 1.2 | `build-css-bundle.mjs` κάνει πλέον preload το `inter-greek`. Space Grotesk πήρε `unicode-range` (latin only) → δεν κατεβαίνει σε σελίδες με μόνο ελληνικούς τίτλους. |
| 1.5 | Διαγράφηκαν: Lighthouse report (597 KB), `hero-banner.jpg` (205 KB), `nameday-loader.js` (7 KB). |
| 2.2 | `<link rel="preload" as="fetch" crossorigin>` για το `offers.json` + `credentials:'omit'` στο fetch ώστε να ταιριάξει το preload. `vercel.json`: `max-age=3600, stale-while-revalidate=86400`. |
| 2.3 | `initializeOfferCardReveal` κάνει `disconnect()` του προηγούμενου observer και clear του timer. |
| 3.1 | Αφαιρέθηκε το inline `color:#65514c`. Τώρα `text-slate-200 hover:text-white` σε `bg-slate-900` → contrast ~15:1 (από 1.6:1). Μεγάλωσε και το mobile μέγεθος (.74rem → .85rem, padding .35 → .7rem). |
| 3.2 | `.choice-card .icon{width:2.45rem;height:2.45rem}` μπήκε στο critical CSS → σωστό μέγεθος από το πρώτο paint και στο desktop. |
| 3.4 | html-validate: **0 errors** (ήταν 8). Διορθώθηκε και το διπλό `?v=` στο `twitter:image`. |

**Επαλήθευση:** `eslint` καθαρό · `html-validate` καθαρό · `validate-offers` 5/5 · `check-static-assets` 26 αρχεία OK · `node --check` και στα 13 JS.

> Το `bundle.9f45ac3a.min.css` έγινε `bundle.02fbb8d3.min.css` (patch + rehash χειροκίνητα, γιατί το `lightningcss` έχει native binary μόνο για macOS στο δικό σου `node_modules`).
> **Τρέξε `npm run build` στο Mac σου πριν το commit** για να αναγεννηθεί κανονικά — το `check-performance-assets` δεν μπόρεσε να τρέξει εδώ για τον ίδιο λόγο.

### JavaScript: 13 requests → 1 (εφαρμόστηκε)

|  | raw | gzip |
|---|---|---|
| **Πριν** — 13 requests στο πρώτο paint | 189 KB | **49.5 KB** |
| **Τώρα** — 1 request (`app.<hash>.min.js`) | 103 KB | **24.1 KB** |
| κατ' απαίτηση (wizard + pdf-preview + office-closure) | 53 KB | 14.2 KB |

**−51% στο JavaScript του πρώτου paint.**

**Τι έγινε:**

- **`scripts/build-js-bundle.mjs`** (νέο, στο `npm run build`) — ενώνει τα 10 eager αρχεία με τη σωστή σειρά και τα περνά από esbuild. `minifyIdentifiers: false` σκόπιμα: τα lazy scripts καλούν globals που ορίζονται εδώ (`trackEvent`, `showToast`, `closeModal`, `lockPageScroll`, `openImagePreview`…) και θα έσπαγαν σιωπηλά με μετονομασία.
- **`window.App.loadLazyScript`** στο `config.js` — τα URLs με `?v=<hash>` ζουν στο `<script type="application/json" id="lazyScripts">`, ώστε να τα σφραγίζει κανονικά το `stamp-static-assets.mjs` (το `/assets/js/*` σερβίρεται `immutable` — χωρίς hash δεν θα ανανεωνόταν ποτέ).
- **`wizard.js` + `pdf-preview.js`** έρχονται μαζί με το fragment του `activationGuideModal`, παράλληλα, μέσα από το `ensureModalLoaded`.
- **`office-closure.js`** φορτώνεται μόνο αν το config λέει `mode: 'date'` ή `'on'`. Με το τρέχον `'off'` δεν κατεβαίνει καθόλου — ήταν 14.5 KB που έκαναν `return` στην πρώτη γραμμή.
- **`tools/smoke-test.mjs`** (νέο, `npm run test:smoke`) — φορτώνει το πραγματικό `index.html` σε jsdom, τρέχει το minified bundle, ελέγχει ότι renderάρουν οι 5 κάρτες, ότι τα lazy scripts **δεν** φορτώνονται στο πρώτο paint, και ότι μετά από κλικ στον οδηγό φορτώνονται, ανοίγει το modal και renderάρει το checklist. **15/15 PASS, μηδέν σφάλματα κονσόλας.**

> Το `image-preview.js` (6.7 KB) **δεν** έγινε lazy επίτηδες: το `ui.js` δένει τους handlers του στο init και το `modals.js` το καλεί σε κάθε `closeModal`/`popstate`. Το κέρδος δεν δικαιολογεί τα guards.

### Απομένουν

| # | Τι |
|---|---|
| 1.4 | **PurgeCSS στο site.css** — 592 KB CSS, 11.696 γραμμές, 1.262 `!important`. Ρεαλιστικά κόβεις 40-60%. Τώρα είναι το βαρύτερο asset με διαφορά. |
| 2.1 | **Inline sprite** για τα 4-6 above-the-fold εικονίδια. |
| 2.4 | **Ενοποίηση των 4 scroll listeners** σε έναν με rAF. |
| 2.5 | Παύση του ticker όταν βγαίνει εκτός viewport. |
| 3.3 | Περιγραφικός `<h1>` αντί για «Αρχική Π.Κ.Σ.Α.Α.». |
| 3.5 | `recommendationBadge`, `isRecommended`, `appliesTo`, `plans[].title` υπάρχουν στο `offers.json` αλλά δεν αποδίδονται πουθενά. |
