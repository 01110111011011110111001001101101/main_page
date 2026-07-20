/* ΡΥΘΜΙΣΕΙΣ ΘΕΡΙΝΗΣ ΑΔΕΙΑΣ ΓΡΑΦΕΙΟΥ
 *
 * Για να ενεργοποιηθεί ή να απενεργοποιηθεί η ειδοποίηση, αλλάξτε ΜΟΝΟ το mode:
 * - "off"  = πλήρως ανενεργό
 * - "date" = ενεργό μόνο από startDate έως endDate
 * - "on"   = πάντα ενεργό χειροκίνητα, ανεξάρτητα από ημερομηνία
 *
 * Οι ημερομηνίες παρακάτω είναι ΕΝΔΕΙΚΤΙΚΕΣ και θέλουν χειροκίνητη ενημέρωση.
 * Μορφή ημερομηνίας: YYYY-MM-DD, π.χ. "2026-08-01".
 */
(function () {
  const officeClosureConfig = Object.freeze({
    mode: 'off',
    startDate: '2026-08-01',
    endDate: '2026-08-20',
    returnDateText: '21/08/2026',
    title: 'Θερινή άδεια γραφείου',
    message: 'Το γραφείο του Συνεταιρισμού είναι κλειστό λόγω θερινής άδειας. Θα είμαστε ξανά διαθέσιμοι από [returnDateText]. Για γραπτό αίτημα, μπορείτε να στείλετε email.',
    showAutoNotice: true,
    autoNoticeDelaySeconds: 30,
    autoNoticeDurationSeconds: 15,
    interceptCalls: true,
    emailFallback: 'synetelas2011@gmail.com',
  });

  window.OFFICE_CLOSURE_CONFIG = officeClosureConfig;
  window.PKSAA_OFFICE_CLOSURE_CONFIG = officeClosureConfig;
})();
