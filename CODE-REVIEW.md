# Έλεγχος κώδικα — main_page

Τελευταίος έλεγχος: 2026-07-25 (δεύτερο πέρασμα, μετά τις διορθώσεις).

**Κατάσταση:** `eslint` καθαρό · `html-validate` καθαρό (ήταν 8 errors) · `validate-offers` 5/5 · `check-static-assets` 26/26 · `check-javascript` 13/13.

---

## Α. Νέα ευρήματα του δεύτερου περάσματος

### Α.1 — ΣΟΒΑΡΟ: το `info.html` δεν σκανάρεται από το Tailwind ⚠️ θέλει `npm run build`

Το `assets/css/tailwind.input.css` δήλωνε:

```css
@source "../../index.html";
@source "../js/**/*.js";
@source "../modals/**/*.html";
```

**Το `info.html` έλειπε.** Αποτέλεσμα: **15 κλάσεις που χρησιμοποιεί η σελίδα δεν παράγονταν ποτέ** στο `tailwind.css`:

```
bg-[#0f2b5c]  text-[#0f2b5c]  bg-white/15  shadow-blue-600/20
md:py-14  md:p-10  md:p-8  md:text-5xl  md:text-3xl  md:grid-cols-3  sm:flex-row
hover:bg-blue-50  hover:bg-blue-700  hover:bg-slate-50  hover:text-white
```

Το χειρότερο: το `<header class="bg-[#0f2b5c] text-white">` έμενε **χωρίς φόντο** → λευκά γράμματα σε λευκό. Και όλα τα `md:` breakpoints έλειπαν, άρα καμία desktop διάταξη.

**Διορθώθηκε:** προστέθηκε το `@source "../../info.html";`.
**Απαιτεί `npm run build` στο Mac** για να ξαναπαραχθεί το `tailwind.css` — δεν μπόρεσα να το τρέξω εδώ (το `lightningcss`/`@tailwindcss/cli` έχουν native binary μόνο για macOS στο `node_modules`).

### Α.2 — Το `info.html` κατέβαζε 41 KB γραμματοσειρές που δεν χρησιμοποιούσε

Έκανε preload τα `inter-greek.woff2` + `space-grotesk-latin.woff2`, αλλά φορτώνει **μόνο** το `tailwind.css`, που έχει **0 `@font-face`** — τα `@font-face` ζουν αποκλειστικά στο inline critical CSS του `index.html`.

Άρα οι δύο γραμματοσειρές κατέβαιναν με προτεραιότητα preload και **δεν δηλώνονταν πουθενά**· η σελίδα έπεφτε στη system-ui. (Ο Chrome βγάζει και warning «preloaded but not used».)

**Διορθώθηκε:** μπήκαν inline τα `@font-face` του Inter + `--font-sans` override, και αφαιρέθηκε το preload του Space Grotesk (δεν το χρησιμοποιεί κανένας κανόνας στη σελίδα).

### Α.3 — Το `tailwind.css` σερβιρόταν ως `immutable` χωρίς hash

Το `vercel.json` έδινε σε όλο το `/assets/css/*` `max-age=31536000, immutable`. Το `bundle.<hash>.min.css` το αντέχει· το `tailwind.css` **δεν έχει hash**, οπότε μια αλλαγή του δεν θα έφτανε ποτέ σε επισκέπτη με cache — για έναν χρόνο.

**Διορθώθηκε:** το `immutable` περιορίστηκε στο `bundle.*`· `tailwind.css` και `site.css` πήραν `max-age=3600, must-revalidate`.

### Α.4 — Το primary CTA ως `<a>` θα εμφανιζόταν λάθος

Μετά τη διόρθωση του `actionTarget.href`, το primary CTA μπορεί να είναι `<a>`. Όμως το `site.css` έχει:

```css
.offer-actions button { background: var(--primary); color:#fff }   /* σκούρο */
.offer-actions a      { background: var(--surface-soft); ... }      /* ανοιχτό */
```

Άρα ένα link-CTA θα έπαιρνε το **δευτερεύον** ανοιχτό στυλ. Επιπλέον το `enhanceOfferCard` πρόσθετε `offer-download-cta` σε κάθε `a[download]`, ξεπλένοντας το primary styling.

**Διορθώθηκε:** νέος κανόνας `.offer-actions a.offer-primary-cta` + `a[download]:not(.offer-primary-cta)` στο `enhanceOfferCard`.

---

## Β. Διορθώθηκαν στο πρώτο πέρασμα

| Θέμα | Λύση |
|---|---|
| `contactInfoModal` ανύπαρκτο (2 νεκρά κουμπιά) | έγιναν `<a href="#contact">` + delegated handler που κλείνει πρώτα το sidebar |
| `data-action-href` που κανείς δεν διάβαζε | ο renderer φτιάχνει πραγματικό `<a>` (auto `download` σε PDF, `target=_blank` σε εξωτερικά) |
| `getPrimaryAction` δεν έβρισκε link-CTA | επεκτάθηκε ο selector → η κάρτα ξαναγίνεται clickable |
| Εορτολόγιο χωρίς `.ics` και χωρίς markup | αφαιρέθηκε το script + το αρχείο |
| Διπλό `?v=` στο `twitter:image` | διορθώθηκε |
| Contrast 1.6:1 στο «Συνέχεια μόνο με τα απαραίτητα» | ~15:1 (`text-slate-200` σε `bg-slate-900`), μεγαλύτερο mobile μέγεθος |
| Hero logo με κλάση που δεν υπήρχε σε κανένα CSS | `police-hero__logo` + `fetchpriority` + preload + `img{max-width:100%}` στο critical CSS |
| Preload λάθος γραμματοσειράς | preload `inter-greek`· Space Grotesk πήρε `unicode-range` |
| `offers.json` σε 3ο σειριακό round-trip | preload + `credentials:'omit'` για να ταιριάξει |
| Observer leak στις κάρτες | `disconnect()` + clear timer |
| 8 html-validate errors | 0 |
| 809 KB νεκρά αρχεία | διαγράφηκαν |

---

## Γ. Ανοιχτά — νεκρός κώδικας

JS που ψάχνει markup που δεν υπάρχει πουθενά. Δεν σπάει τίποτα, αλλά είναι κώδικας που συντηρείς χωρίς λόγο:

| Selector | Πού | Τι χάνεται |
|---|---|---|
| `.reveal` | `ui.js:593` `initializeRevealAnimations` | **ολόκληρο το σύστημα reveal animations είναι ανενεργό** |
| `[data-wizard-step]` | `tracking.js:878` | τα events `wizard_step_view` / `wizard_completed` **δεν στέλνονται ποτέ** |
| `[data-copy-iban]` | `ui.js:443`, `offers.js:409` | ο οδηγός χρησιμοποιεί `data-activation-copy`· το `enhanceIbanWarnings` δεν κάνει τίποτα |
| `.hero-actions` | `ui.js:237` | |
| `.mobile-nav-offers-link` | `ui.js:171` | |
| `.premium-menu-link-internet`, `.premium-menu-link-tv` | `ui.js:189-190` | |
| `.js-menu-mobile-offers`, `.quick-action-mobile` | `offers.js:475,487` | |
| `gprotasisModal` | `tracking.js:15` `TRACKED_OFFERS` | |
| `internetChoiceModal`, `infoCoopModal` | `assets/modals/*.html` | fragments που κανείς δεν ανοίγει |

## Δ. Ανοιχτά — μικρότερα

- **`index.html:415`** — το κουμπί «Προσφορές» (`data-sidebar-category="all"`) έχει κλάση `premium-menu-link-mobile`. Το `ui.js:188` το χαρτογραφεί ως «Κινητή» → λάθος active highlight.
- **`clipboard.js:28`** — το error toast δείχνει μπλε `circle-info`. Θέλει δικό του branch.
- **`wizard.js:200-217`** — το `else if (doc.previewSrc)` είναι μη προσπελάσιμο (το εξωτερικό `if` απαιτεί ήδη `doc.href`).
- **`offers.json:58`** — `ομιλιίας` → `ομιλίας`.
- **`offers.json`** — τα `recommendationBadge`, `isRecommended`, `appliesTo`, `plans[].title` δεν αποδίδονται πουθενά.
- **`assets/images/hero-logo.svg`** — δεν παίρνει `?v=` από το `stamp-static-assets.mjs` (το pattern καλύπτει μόνο `png|webp`), ενώ σερβίρεται με 30ήμερο cache. Αν αλλάξει το λογότυπο, αργεί να φανεί.
- **`offers.js:535-553`** — ο ίδιος βρόχος τρέχει δύο φορές (μία απευθείας, μία σε rAF).
- **`pdf-preview.js:77,81`** — υπολείμματα `[cite: 2]` στα σχόλια.

---

## Ε. Πριν το commit

```bash
npm run build     # ΑΠΑΡΑΙΤΗΤΟ: ξαναχτίζει το tailwind.css με τις κλάσεις του info.html (Α.1)
npm run check
```
