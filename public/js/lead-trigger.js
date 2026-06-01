/* ============================================================
   LUXE ESTATES — lead-trigger.js
   Fires the shared lead-capture modal on non-chat pages.

   Strategy per page:
   ─ listings.html  → every 30 s while unverified (repeating interval)
   ─ property.html  → every 30 s while unverified + on enquiry/call clicks
   ─ contact.html   → main.js fully owns this page

   Skipped if luxe_otp_verified === '1'.
   Tab-visibility guard: timer only ticks when the tab is visible.
   ============================================================ */

(function () {
  'use strict';

  function whenReady(cb) {
    if (typeof showLeadModal === 'function') { cb(); return; }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        if (typeof showLeadModal === 'function') cb();
      });
    } else {
      let attempts = 0;
      const interval = setInterval(() => {
        if (typeof showLeadModal === 'function') { clearInterval(interval); cb(); return; }
        if (++attempts > 20) clearInterval(interval);
      }, 50);
    }
  }

  function isVerified() {
    return localStorage.getItem('luxe_otp_verified') === '1';
  }

  const INTERVAL_MS = 30 * 1000;

  /* Starts a repeating 30s timer. Each tick shows the modal if unverified
     and the tab is visible. Stops itself once the user verifies. */
  function startRepeatingPopup() {
    let modalOpen = false; /* prevent stacking if modal is still open */

    const timer = setInterval(() => {
      if (isVerified())      { clearInterval(timer); return; }
      if (document.hidden)   return; /* don't pop on background tabs */
      if (modalOpen)         return; /* modal already showing */

      modalOpen = true;
      showLeadModal(() => {
        /* onSuccess — verified: stop the interval */
        clearInterval(timer);
        modalOpen = false;
      });

      /* Also clear modalOpen if user dismisses without verifying,
         so the next tick can show it again */
      const observer = new MutationObserver(() => {
        if (!document.getElementById('lead-modal-overlay')) {
          observer.disconnect();
          modalOpen = false;
        }
      });
      observer.observe(document.body, { childList: true });

    }, INTERVAL_MS);
  }

  const page = (function () {
    const p = location.pathname;
    if (p.includes('listings')) return 'listings';
    if (p.includes('property')) return 'property';
    if (p.includes('contact'))  return 'contact';
    return 'other';
  })();

  /* ── LISTINGS ── */
  if (page === 'listings') {
    whenReady(() => {
      if (isVerified()) return;
      startRepeatingPopup();
    });
  }

  /* ── PROPERTY ── */
  if (page === 'property') {
    whenReady(() => {
      if (isVerified()) return;

      startRepeatingPopup();

      /* Also intercept enquiry / call button clicks */
      document.addEventListener('click', function onEnquire(e) {
        if (isVerified()) { document.removeEventListener('click', onEnquire); return; }

        const enquireBtn = e.target.closest('a[href*="contact.html"]');
        const callBtn    = e.target.closest('a[href^="tel:"]');
        const shareBtn   = e.target.closest('button[onclick*="shareProperty"]');

        if (!enquireBtn && !callBtn && !shareBtn) return;
        if (shareBtn) return; /* let share through */

        e.preventDefault();
        const dest = (enquireBtn || callBtn).getAttribute('href');

        showLeadModal(() => {
          document.removeEventListener('click', onEnquire);
          window.location.href = dest;
        });
      }, true);
    });
  }

  /* ── CONTACT: main.js fully owns this page ── */

})();