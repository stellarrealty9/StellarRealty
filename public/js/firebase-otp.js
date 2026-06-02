/* ============================================================
   STELLAR REALTY — firebase-otp.js
   Wraps Firebase Phone Authentication with invisible reCAPTCHA.

   PUBLIC API (window.FirebaseOTP):
     .init()                                → call once on DOMContentLoaded
     .sendOTP(e164Phone)                    → Promise<confirmationResult>
     .verifyOTP(confirmationResult, code)   → Promise<idToken>
     .resetRecaptcha()                      → re-render verifier after error
     .isReady()                             → boolean

   Flow:
     1. FirebaseOTP.init()       — creates invisible RecaptchaVerifier
     2. FirebaseOTP.sendOTP()    — calls signInWithPhoneNumber → SMS sent
     3. FirebaseOTP.verifyOTP()  — confirms the code → returns Firebase ID token
     4. Your server receives the ID token → verifies with Firebase Admin SDK
        → upserts User → returns stable uuid

   reCAPTCHA notes:
   ─ "invisible" size means NO checkbox shown to the user.
   ─ reCAPTCHA challenge only appears if Google suspects a bot.
   ─ The verifier MUST be attached to a real DOM element that exists
     when init() runs. We use a hidden <div id="recaptcha-container">
     injected by this script so you don't need to touch HTML.
   ─ After any error (wrong code, timeout) call resetRecaptcha() before
     attempting sendOTP again, or Firebase throws auth/internal-error.
   ============================================================ */

(function (global) {
  'use strict';

  /* ── Firebase project config ─────────────────────────────────────
     Replace these values with your own from:
     Firebase Console → Project Settings → Your apps → Web app → Config
  ──────────────────────────────────────────────────────────────── */
  const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBw3B2jZpz1SFT-GA0_kZ4Zk9PdMzqEP1Y",
     authDomain: "stellarrealty-741ea.firebaseapp.com",
     projectId: "stellarrealty-741ea",
     storageBucket: "stellarrealty-741ea.firebasestorage.app",
     messagingSenderId: "197611655748",
     appId: "1:197611655748:web:8fe0c7ef21aaa004732211",
     measurementId: "G-JQLMBSQ6G6"
  };

  let _app             = null;
  let _auth            = null;
  let _recaptchaVerifier = null;
  let _ready           = false;
  let _initPromise     = null;

  /* ── Lazy-load Firebase SDK from CDN ── */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
      const s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload  = resolve;
      s.onerror = () => reject(new Error('Failed to load: ' + src));
      document.head.appendChild(s);
    });
  }

  async function loadFirebaseSDK() {
    /* Firebase v9 compat (CDN) — works without a bundler */
    const BASE = 'https://www.gstatic.com/firebasejs/10.12.2';
    await loadScript(`${BASE}/firebase-app-compat.js`);
    await loadScript(`${BASE}/firebase-auth-compat.js`);
  }

  /* ── Ensure the invisible reCAPTCHA container exists in the DOM ── */
  function ensureContainer() {
    if (!document.getElementById('recaptcha-container')) {
      const div = document.createElement('div');
      div.id = 'recaptcha-container';
      /* Truly invisible — zero size, off-screen */
      div.style.cssText = 'position:absolute;top:-9999px;left:-9999px;width:0;height:0;overflow:hidden;';
      document.body.appendChild(div);
    }
  }

  /* ── Create (or re-create) the RecaptchaVerifier ── */
  function createVerifier() {
    /* Clear any previous instance to avoid "reCAPTCHA has already been rendered" */
    if (_recaptchaVerifier) {
      try { _recaptchaVerifier.clear(); } catch (_) {}
      _recaptchaVerifier = null;
    }

    /* Wipe the container's children so reCAPTCHA can re-render into it */
    const container = document.getElementById('recaptcha-container');
    if (container) container.innerHTML = '';

    _recaptchaVerifier = new firebase.auth.RecaptchaVerifier('recaptcha-container', {
      size: 'invisible',               /* no UI shown to user unless bot suspected */
      badge: 'bottomright',
      callback: () => {
        /* reCAPTCHA solved (usually automatic for invisible) — no action needed here */
      },
      'expired-callback': () => {
        /* Token expired — reset so the next sendOTP call re-solves it */
        console.warn('[FirebaseOTP] reCAPTCHA token expired — resetting verifier');
        createVerifier();
      }
    });
  }

  /* ════════════════════════════════════════════════════════════
     PUBLIC API
  ════════════════════════════════════════════════════════════ */
  const FirebaseOTP = {

    /**
     * init() — must be called once, early (e.g. DOMContentLoaded).
     * Loads the Firebase SDK, initialises the app + auth,
     * and renders the invisible reCAPTCHA verifier.
     * Safe to call multiple times — subsequent calls return the
     * same promise.
     */
    init() {
      if (_initPromise) return _initPromise;

      _initPromise = (async () => {
        await loadFirebaseSDK();
        ensureContainer();

        /* Initialise Firebase app (idempotent) */
        if (!firebase.apps.length) {
          _app = firebase.initializeApp(FIREBASE_CONFIG);
        } else {
          _app = firebase.apps[0];
        }

        _auth = firebase.auth();

        /* Render invisible reCAPTCHA */
        createVerifier();

        /* Pre-render so the first sendOTP call is instant */
        try {
          await _recaptchaVerifier.render();
        } catch (e) {
          /* Non-fatal — will render on first sendOTP call */
          console.warn('[FirebaseOTP] Pre-render warning (non-fatal):', e.message);
        }

        _ready = true;
        console.log('[FirebaseOTP] Ready ✓');
      })();

      return _initPromise;
    },

    /** Returns true once init() has fully completed. */
    isReady() { return _ready; },

    /**
     * sendOTP(e164Phone) → Promise<ConfirmationResult>
     *
     * e164Phone must be in E.164 format: "+919876543210"
     * Firebase sends a real SMS OTP to that number.
     *
     * Throws on invalid number, quota exceeded, or reCAPTCHA failure.
     */
    async sendOTP(e164Phone) {
      if (!_ready) await this.init();

      /* Ensure verifier is fresh (important after a prior error) */
      if (!_recaptchaVerifier) createVerifier();

      try {
        const confirmationResult = await firebase.auth().signInWithPhoneNumber(
          e164Phone,
          _recaptchaVerifier
        );
        return confirmationResult;
      } catch (err) {
        /* Always reset verifier on failure so next attempt works */
        createVerifier();
        throw err;
      }
    },

    /**
     * verifyOTP(confirmationResult, code) → Promise<idToken>
     *
     * Confirms the 6-digit code entered by the user.
     * Returns a Firebase ID token string on success.
     * The ID token must be sent to your server for verification.
     *
     * Throws auth/invalid-verification-code on wrong code.
     */
    async verifyOTP(confirmationResult, code) {
      const credential = await confirmationResult.confirm(code);
      /* Get a short-lived ID token — valid 1 hour; server verifies it */
      const idToken = await credential.user.getIdToken();
      return idToken;
    },

    /**
     * resetRecaptcha() — call this any time you need to re-show the
     * phone entry form (e.g. "Change Number" button) so the next
     * sendOTP call gets a fresh reCAPTCHA verifier.
     */
    resetRecaptcha() {
      createVerifier();
    },

    /**
     * Translates Firebase auth error codes into human-readable messages.
     * Use in catch blocks inside main.js / lead-trigger.js.
     */
    friendlyError(err) {
      const MAP = {
        'auth/invalid-phone-number':         'Invalid phone number. Please check the number and try again.',
        'auth/too-many-requests':            'Too many attempts. Please wait a few minutes and try again.',
        'auth/quota-exceeded':               'SMS quota exceeded. Please try again later.',
        'auth/invalid-verification-code':    'Incorrect OTP. Please check the code and try again.',
        'auth/code-expired':                 'OTP has expired. Please request a new code.',
        'auth/session-expired':              'Session expired. Please request a new OTP.',
        'auth/missing-verification-code':    'Please enter the complete OTP.',
        'auth/captcha-check-failed':         'Security check failed. Please refresh and try again.',
        'auth/missing-phone-number':         'Phone number is required.',
        'auth/network-request-failed':       'Network error. Please check your connection.',
        'auth/user-disabled':                'This number has been restricted. Please contact support.',
        'auth/app-not-authorized':           'This domain is not authorised for Firebase — contact support.',
      };
      return MAP[err?.code] || err?.message || 'Something went wrong. Please try again.';
    }
  };

  global.FirebaseOTP = FirebaseOTP;

})(window);
