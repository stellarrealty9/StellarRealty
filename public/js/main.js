/* ============================================================
   LUXE ESTATES — main.js
   ▸ WhatsApp-style chat: Aria left, user answers right
   ▸ Lead capture modal before results
   ============================================================ */

const API = window.location.origin;

let customerName = '';
let userFilters  = {};
let META         = { localities: [], amenities: [] };

/* ── Wishlist — single source of truth, available on every page ─────────
   Stored as: { [id]: propertyObject } under key 'stellar_wishlist'
   Public API (window.wishlist):
     .has(id)           → boolean
     .toggle(id, prop)  → true if added, false if removed
     .getAll()          → array of saved property objects
     .get()             → alias for getAll()
   ──────────────────────────────────────────────────────────────────── */
window.wishlist = (function () {
  const KEY = 'stellar_wishlist';

  function load() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch { return {}; }
  }

  function save(data) {
    try { localStorage.setItem(KEY, JSON.stringify(data)); }
    catch (e) { console.warn('Wishlist: localStorage write failed', e); }
  }

  return {
    has(id) {
      return !!load()[String(id)];
    },
    toggle(id, propObj) {
      const data = load();
      const key  = String(id);
      if (data[key]) {
        delete data[key];
        save(data);
        return false; // removed
      } else {
        data[key] = propObj;
        save(data);
        return true;  // added
      }
    },
    getAll() {
      return Object.values(load()).filter(p => p && !p._stub);
    },
    get() {
      return this.getAll();
    }
  };
})();

/* ── DB wishlist sync helpers ───────────────────────────────────────────────
   All calls are fire-and-forget. localStorage stays the source of truth for
   UI — the DB is the persistent backup that survives device switches.
   ─────────────────────────────────────────────────────────────────────────── */

/* Push every locally saved property to the server (called once after OTP verify) */
function syncLocalWishlistToServer(userId) {
  const props = window.wishlist.getAll();
  if (!props.length) return;
  props.forEach(p => {
    const id = p._id || p.id;
    if (!id) return;
    fetch(`${API}/api/wishlist/${userId}/add`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ propertyId: id })
    }).catch(() => {});
  });
}

/* Pull server wishlist on load and merge into localStorage
   (handles "new device" case — user re-verified their phone)
   Stored as window._wishlistReady — a Promise listings.js awaits
   before its first render so hearts show correct state immediately. */
window._wishlistReady = (async function loadServerWishlist() {
  const userId = localStorage.getItem('stellar_user_id');
  if (!userId) return;
  try {
    const res  = await fetch(`${API}/api/wishlist/${userId}`);
    const data = await res.json();
    if (!data.success || !data.wishlist) return;

    const serverProps = data.wishlist.propertyIds || [];
    if (!serverProps.length) return;

    serverProps.forEach(p => {
      if (!p) return; /* skip nulls — deleted properties populate() as null */
      const id = (p._id || p.id || p).toString();
      if (id === 'null' || id === 'undefined') return; /* safety for bare bad primitives */
      /* Only store entries that have display data (title, price, img).
         Bare ID strings from the server are noted for heart-state only;
         the full object will be written when the user toggles or browses. */
      if (!window.wishlist.has(id) && typeof p === 'object' && p.title) {
        window.wishlist.toggle(id, p);
      } else if (!window.wishlist.has(id)) {
        /* Mark the ID so hearts light up, but store a flag rather than a
           broken stub — the wishlist view filters out entries without title. */
        window.wishlist.toggle(id, { _id: id, _stub: true });
      }
    });
  } catch (_) { /* network error — local wishlist is still intact */ }
})();

function showToast(msg, icon = '✦') {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; document.body.appendChild(el); }
  el.innerHTML = `<span class="toast-icon">${icon}</span> ${msg}`;
  el.classList.add('show');
  setTimeout(() => el.classList.remove('show'), 3000);
}

function initNav() {
  const nav = document.querySelector('.nav');
  if (!nav) return;
  window.addEventListener('scroll', () => nav.classList.toggle('scrolled', window.scrollY > 40), { passive: true });
  const hamburger  = document.querySelector('.nav-hamburger');
  const mobileMenu = document.querySelector('.nav-links');
  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const open = mobileMenu.style.display === 'flex';
      mobileMenu.style.cssText = open ? '' : 'display:flex;flex-direction:column;position:fixed;top:70px;left:0;right:0;background:rgba(13,13,14,0.97);padding:2rem;gap:1.5rem;border-bottom:1px solid var(--border);z-index:999;backdrop-filter:blur(20px);';
    });
  }
}

/* ════════════════════════════════════════════════════════════
   PHONE VALIDATION — no external library needed
   Each entry: [dialCode, minSubscriberDigits, maxSubscriberDigits, prefixRegex?]
   "subscriber digits" = digits after stripping dial code and trunk 0.
   prefixRegex: optional regex the stripped digits must start with.
   Sources: ITU E.164, Wikipedia national numbering plans, Ofcom, IMDA, TRAI.
════════════════════════════════════════════════════════════ */
const PHONE_RULES = {
  // ── South Asia ──────────────────────────────────────────────
  IN:  ['+91',  10, 10, '[6-9]'],      // TRAI: mobile 6–9; landlines rare on this form
  BD:  ['+880', 10, 10, '[1-9]'],      // 10 digits after trunk 0; mobiles start 01x → stripped 1x
  LK:  ['+94',   9,  9, '[1-9]'],      // 9 digits after trunk 0
  NP:  ['+977',  9, 10],               // 9–10; mobiles (98x,97x) and landlines (01x stripped)
  PK:  ['+92',  10, 10, '[2-9]'],      // 10 digits; mobiles 03xx → stripped 3xx; landlines 02x → stripped 2x

  // ── East / SE Asia ──────────────────────────────────────────
  CN:  ['+86',  11, 11, '[1]'],        // 11 digits; all subscriber numbers start 1
  JP:  ['+81',  10, 10],               // 10 digits after trunk 0; variable area codes
  MY:  ['+60',   9, 10, '[1-9]'],      // mobiles 01x (10 digits stripped), landlines 03x–09x (8–9 stripped)
  ID:  ['+62',   9, 12],               // wide range: Java landlines 7–8 digits, mobiles 09–12
  PH:  ['+63',  10, 10, '[289]'],      // mobiles 09xx → 9xx (10 digits); landlines 02/08 → 2/8
  SG:  ['+65',   8,  8, '[3689]'],     // IMDA: 8 digits; 3=VoIP, 6=landline, 8/9=mobile
  TH:  ['+66',   9,  9, '[2-9]'],      // 9 digits after trunk 0; mobile 06x/08x/09x → 6/8/9
  VN:  ['+84',   9,  9, '[1-9]'],      // not in dropdown but matches if added

  // ── Middle East / Gulf ──────────────────────────────────────
  AE:  ['+971',  8,  9, '[2-9]'],      // mobile 05x → 9 digits stripped; landlines 04/02/06 → 8 digits stripped
  SA:  ['+966',  9,  9, '[15]'],       // mobile 05x → 5x (9 digits); landlines 01x → 1x
  QA:  ['+974',  8,  8, '[3-7]'],      // closed plan; all 8 digits; start 3/4/5/6/7
  KW:  ['+965',  8,  8, '[12569]'],    // mobile 5/6/9; landlines 2; emergency short codes start 1
  BH:  ['+973',  8,  8, '[136]'],      // mobile 3x/6x; landlines 1x; 8 digits, no trunk 0
  OM:  ['+968',  8,  8, '[279]'],      // mobile 9x/7x; landlines 2x; 8 digits, no trunk 0

  // ── Africa ──────────────────────────────────────────────────
  ZA:  ['+27',   9,  9, '[1-9]'],      // 9 digits after trunk 0; mobiles 06x/07x/08x → 6/7/8
  NG:  ['+234',  8, 10, '[1-9]'],      // 8 digits (landlines) to 10 digits (mobiles 08xx/09xx → 8/9)
  KE:  ['+254',  9,  9, '[17]'],       // 9 digits after trunk 0; mobile 07x → 7x; landlines 02x → but stripped gives 2 — allow [1-9]

  // ── Oceania ─────────────────────────────────────────────────
  AU:  ['+61',   9,  9, '[2-9]'],      // 9 digits after trunk 0; mobiles 04xx → 4xx; landlines 02–08 → 2–8
  NZ:  ['+64',   8,  9, '[2-9]'],      // mobiles 02x (8 digits stripped); landlines 03–09 (7 digits + area) vary

  // ── Europe ──────────────────────────────────────────────────
  GB:  ['+44',  10, 10, '[1-9]'],      // Ofcom: 10 significant digits after trunk 0; almost all formats
  DE:  ['+49',   3, 12, '[1-9]'],      // highly variable: short city codes + long subscribers; total NSN 3–12
  FR:  ['+33',   9,  9, '[1-9]'],      // 9 digits after trunk 0; all formats 01–09 (stripped 1–9)

  // ── North America ───────────────────────────────────────────
  US:  ['+1',   10, 10, '[2-9]'],      // NANP: 10 digits; area code and exchange start 2–9
  CA:  ['+1',   10, 10, '[2-9]'],      // same NANP rules as US
};

function validatePhone(raw, code) {
  const rule = PHONE_RULES[code];
  if (!rule) return { valid: false, formatted: raw, error: 'Unsupported country selected.' };

  const [dialCode, minLen, maxLen, startPattern] = rule;

  // Strip spaces, dashes, parentheses — keep digits and a leading +
  let digits = raw.replace(/[\s\-().]/g, '');

  // If user typed international prefix (+971...), strip it down to subscriber digits
  if (digits.startsWith('+')) {
    const cc = dialCode.replace('+', '');
    if (digits.startsWith('+' + cc)) {
      digits = digits.slice(1 + cc.length);
    } else {
      return {
        valid: false, formatted: raw,
        error: 'Wrong country code — for ' + code + ' use ' + dialCode + '.'
      };
    }
  }

  // Strip trunk 0 if doing so brings the digit count into the valid range.
  // Most countries use a leading 0 for domestic dialling (e.g. 050-xxx in UAE,
  // 07xxx in UK, 04xx in AU). The international form drops it.
  if (digits.startsWith('0')) {
    const withoutZero = digits.slice(1);
    if (withoutZero.length >= minLen && withoutZero.length <= maxLen) {
      digits = withoutZero;
    }
  }

  // Must be all digits now
  if (!/^\d+$/.test(digits)) {
    return { valid: false, formatted: raw, error: 'Phone number must contain digits only.' };
  }

  // Length check
  if (digits.length < minLen || digits.length > maxLen) {
    const range = minLen === maxLen ? String(minLen) : minLen + '\u2013' + maxLen;
    return {
      valid: false, formatted: raw,
      error: 'Invalid phone number — expected ' + range + ' digits for ' + code + '.'
    };
  }

  // Optional prefix check (e.g. SG must start with 3/6/8/9; IN mobiles start 6–9)
  if (startPattern && !new RegExp('^(?:' + startPattern + ')').test(digits)) {
    return { valid: false, formatted: raw, error: 'Invalid phone number for ' + code + '.' };
  }

  return { valid: true, formatted: dialCode + ' ' + digits, error: '' };
}

/* ════════════════════════════════════════════════════════════
   LEAD CAPTURE MODAL
════════════════════════════════════════════════════════════ */
function showLeadModal(onSuccess) {
  /* If user already verified, post the lead silently then go straight to results */
  if (localStorage.getItem('luxe_otp_verified') === '1') {
    const uuid  = localStorage.getItem('stellar_user_id');
    const name  = localStorage.getItem('customer_name')  || '';
    const phone = localStorage.getItem('stellar_verified_phone') || '';
    /* email isn't stored in localStorage — pass empty string; server allows it for returning users */
    fetch(`${API}/api/leads`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ name, phone, email: '', filters: userFilters, uuid: uuid || undefined })
    }).catch(() => {});
    onSuccess();
    return;
  }

  /* Closure vars — set in submitLead(), consumed in verifyOtp()
     so /api/leads is posted AFTER uuid is known, never anonymous */
  let _leadName = '', _leadEmail = '', _leadPhone = '';

  const existing = document.getElementById('lead-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.id = 'lead-modal-overlay';
  overlay.style.cssText = [
    'position:fixed','inset:0','z-index:10001',
    'background:rgba(0,0,0,0.82)','backdrop-filter:blur(16px)',
    '-webkit-backdrop-filter:blur(16px)',
    'display:flex','align-items:center','justify-content:center',
    'padding:1rem','opacity:0','transition:opacity 0.3s ease'
  ].join(';');

  overlay.innerHTML = `
    <div id="lead-modal-box" style="
      background:#141416;
      border:1px solid rgba(201,169,110,0.35);
      border-radius:20px;
      padding:2.5rem 2rem;
      max-width:400px;width:100%;
      text-align:center;
      box-shadow:0 48px 120px rgba(0,0,0,0.85);
      transform:scale(0.9) translateY(16px);
      transition:transform 0.4s cubic-bezier(0.34,1.56,0.64,1);
    ">
      <div style="
        width:52px;height:52px;border-radius:50%;
        background:#1a1810;border:1.5px solid rgba(201,169,110,0.5);
        display:flex;align-items:center;justify-content:center;
        margin:0 auto 1rem;
        font-family:'Cormorant Garamond',Georgia,serif;
        color:#c9a96e;font-size:1rem;letter-spacing:0.04em;
      ">Aria</div>
      <p style="font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;color:#5a5752;margin-bottom:1.25rem">
        Luxe<span style="color:#c9a96e">.</span>Estates
      </p>
      <h3 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.65rem;font-weight:300;color:#f0ebe2;line-height:1.25;margin-bottom:0.5rem">
        Almost there!
      </h3>
      <p style="font-size:0.84rem;color:#5a5752;line-height:1.65;margin-bottom:1.75rem">
        Share your details so our agents can reach out with personalised options.
      </p>
      <div id="lead-error" style="display:none;background:rgba(220,60,60,0.12);border:1px solid rgba(220,60,60,0.3);color:#f08080;font-size:0.8rem;border-radius:8px;padding:0.65rem 0.9rem;margin-bottom:0.9rem;text-align:left"></div>
      <div style="display:flex;flex-direction:column;gap:0.75rem;margin-bottom:1.25rem">
        <input id="lead-name"  type="text"  placeholder="Full name *"     maxlength="80"
          style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(201,169,110,0.22);border-radius:10px;padding:0.85rem 1rem;color:#f0ebe2;font-family:'DM Sans',sans-serif;font-size:0.9rem;outline:none;box-sizing:border-box;transition:border-color 0.25s">
        <div class="phone-field-wrap" id="phone-field-wrap" style="display:flex;align-items:stretch;background:rgba(255,255,255,0.04);border:1px solid rgba(201,169,110,0.22);border-radius:10px;overflow:hidden;box-sizing:border-box;transition:border-color 0.25s,box-shadow 0.25s;">
          <select id="lead-phone-country" class="phone-country-select" style="background:rgba(201,169,110,0.07);border:none;border-right:1px solid rgba(201,169,110,0.18);color:#c9a96e;font-family:'DM Sans',sans-serif;font-size:0.85rem;padding:0 0.6rem;outline:none;cursor:pointer;flex-shrink:0;appearance:none;-webkit-appearance:none;min-width:96px;">
            <option value="IN">🇮🇳 +91</option>
            <option value="US">🇺🇸 +1</option>
            <option value="GB">🇬🇧 +44</option>
            <option value="AE">🇦🇪 +971</option>
            <option value="SG">🇸🇬 +65</option>
            <option value="AU">🇦🇺 +61</option>
            <option value="CA">🇨🇦 +1</option>
            <option value="DE">🇩🇪 +49</option>
            <option value="FR">🇫🇷 +33</option>
            <option value="JP">🇯🇵 +81</option>
            <option value="CN">🇨🇳 +86</option>
            <option value="SA">🇸🇦 +966</option>
            <option value="QA">🇶🇦 +974</option>
            <option value="KW">🇰🇼 +965</option>
            <option value="BH">🇧🇭 +973</option>
            <option value="OM">🇴🇲 +968</option>
            <option value="NZ">🇳🇿 +64</option>
            <option value="ZA">🇿🇦 +27</option>
            <option value="NG">🇳🇬 +234</option>
            <option value="KE">🇰🇪 +254</option>
            <option value="MY">🇲🇾 +60</option>
            <option value="ID">🇮🇩 +62</option>
            <option value="PH">🇵🇭 +63</option>
            <option value="TH">🇹🇭 +66</option>
            <option value="BD">🇧🇩 +880</option>
            <option value="PK">🇵🇰 +92</option>
            <option value="LK">🇱🇰 +94</option>
            <option value="NP">🇳🇵 +977</option>
          </select>
          <input id="lead-phone-number" type="tel" placeholder="Phone number *" maxlength="15" autocomplete="tel-national" style="flex:1;background:transparent;border:none;padding:0.85rem 1rem;color:#f0ebe2;font-family:'DM Sans',sans-serif;font-size:0.9rem;outline:none;width:100%;box-sizing:border-box;">
        </div>
        <input id="lead-email" type="email" placeholder="Email address *" maxlength="120"
          style="width:100%;background:rgba(255,255,255,0.04);border:1px solid rgba(201,169,110,0.22);border-radius:10px;padding:0.85rem 1rem;color:#f0ebe2;font-family:'DM Sans',sans-serif;font-size:0.9rem;outline:none;box-sizing:border-box;transition:border-color 0.25s">
      </div>
      <button id="lead-submit" style="
        width:100%;padding:0.95rem;
        background:#c9a96e;color:#0d0d0e;
        border:none;border-radius:10px;
        font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:600;
        letter-spacing:0.04em;cursor:pointer;
        display:flex;align-items:center;justify-content:center;gap:0.55rem;
        margin-bottom:0.75rem;
        transition:background 0.25s,transform 0.2s;
      ">
        <span id="lead-btn-text">Show My Properties</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
      </button>
    </div>`;

  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    document.getElementById('lead-modal-box').style.transform = 'scale(1) translateY(0)';
  });

  setTimeout(() => document.getElementById('lead-name')?.focus(), 350);

  ['lead-name','lead-email'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('focus', () => { el.style.borderColor = '#c9a96e'; el.style.boxShadow = '0 0 0 3px rgba(201,169,110,0.12)'; });
    el.addEventListener('blur',  () => { el.style.borderColor = 'rgba(201,169,110,0.22)'; el.style.boxShadow = 'none'; });
  });
  const phoneWrap  = document.getElementById('phone-field-wrap');
  const phoneInput = document.getElementById('lead-phone-number');
  const countrySelect = document.getElementById('lead-phone-country');

  /* Per-country placeholder hints so user knows the expected format */
  const PHONE_PLACEHOLDERS = {
    IN:'98765 43210', US:'201 555 0123', GB:'07700 900123', AE:'050 123 4567',
    SG:'8123 4567',   AU:'0412 345 678', CA:'204 555 0123', DE:'0151 23456789',
    FR:'06 12 34 56 78', JP:'090-1234-5678', CN:'131 2345 6789', SA:'050 123 4567',
    QA:'3312 3456',   KW:'5012 3456',    BH:'3600 0000',    OM:'9212 3456',
    NZ:'021 123 4567',ZA:'071 123 4567', NG:'0802 123 4567',KE:'0712 345 678',
    MY:'012-345 6789',ID:'0812-3456-789',PH:'0917 123 4567',TH:'081 234 5678',
    BD:'01712-345678',PK:'0301 2345678', LK:'071 234 5678', NP:'984-1234567',
  };

  /* Max digits vary by country — set maxlength generously to 16 to cover all */
  phoneInput.setAttribute('maxlength', '16');

  function updatePhonePlaceholder() {
    const cc = countrySelect.value;
    phoneInput.placeholder = PHONE_PLACEHOLDERS[cc] || 'Phone number *';
  }
  updatePhonePlaceholder();
  countrySelect.addEventListener('change', () => {
    updatePhonePlaceholder();
    phoneInput.value = ''; // clear stale number when country changes
    phoneInput.focus();
  });

  phoneInput.addEventListener('focus', () => { phoneWrap.classList.add('focused'); phoneWrap.style.borderColor = '#c9a96e'; phoneWrap.style.boxShadow = '0 0 0 3px rgba(201,169,110,0.12)'; });
  phoneInput.addEventListener('blur',  () => { phoneWrap.classList.remove('focused'); phoneWrap.style.borderColor = 'rgba(201,169,110,0.22)'; phoneWrap.style.boxShadow = 'none'; });
  /* Allow digits, spaces, hyphens, and + (for international format like +91 98765 43210) */
  phoneInput.addEventListener('input', () => {
    // Allow + only at the start
    let v = phoneInput.value;
    const hasPlus = v.startsWith('+');
    v = v.replace(/[^\d\s\-]/g, '');
    if (hasPlus) v = '+' + v;
    phoneInput.value = v;
  });

  async function submitLead() {
    const name    = document.getElementById('lead-name').value.trim();
    const country = document.getElementById('lead-phone-country').value;
    const phoneRaw= document.getElementById('lead-phone-number').value.trim();
    const email   = document.getElementById('lead-email').value.trim();
    const errEl   = document.getElementById('lead-error');
    const btn     = document.getElementById('lead-submit');
    const btnTxt  = document.getElementById('lead-btn-text');

    function shakeField(el) {
      el.style.animation = 'nmShake 0.38s ease';
      setTimeout(() => el.style.animation = '', 400);
    }
    function markError(el) { el.style.borderColor = '#e05a5a'; shakeField(el); }
    function clearError(el) { el.style.borderColor = 'rgba(201,169,110,0.22)'; }

    /* ── Empty check ── */
    if (!name || !phoneRaw || !email) {
      errEl.textContent = 'Please fill in all fields.';
      errEl.style.display = 'block';
      if (!name)     { markError(document.getElementById('lead-name')); setTimeout(() => clearError(document.getElementById('lead-name')), 400); }
      if (!phoneRaw) { document.getElementById('phone-field-wrap').classList.add('error'); shakeField(document.getElementById('lead-phone-number')); setTimeout(() => document.getElementById('phone-field-wrap').classList.remove('error'), 400); }
      if (!email)    { markError(document.getElementById('lead-email')); setTimeout(() => clearError(document.getElementById('lead-email')), 400); }
      return;
    }

    /* ── Email check ── */
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errEl.textContent = 'Please enter a valid email address.';
      errEl.style.display = 'block';
      markError(document.getElementById('lead-email'));
      setTimeout(() => clearError(document.getElementById('lead-email')), 600);
      return;
    }

    /* ── Phone check (built-in validator, no CDN library) ── */
    function phoneError(msg) {
      errEl.textContent = msg;
      errEl.style.display = 'block';
      document.getElementById('phone-field-wrap').classList.add('error');
      shakeField(document.getElementById('lead-phone-number'));
      setTimeout(() => document.getElementById('phone-field-wrap').classList.remove('error'), 600);
    }

    const { valid, formatted: phone, error: phoneErr } = validatePhone(phoneRaw, country);
    if (!valid) {
      phoneError(phoneErr || 'Invalid phone number.');
      return;
    }

    errEl.style.display = 'none';
    btn.disabled = true;
    btnTxt.textContent = 'Sending OTP…';

    /* Store details — lead posted after OTP so uuid is always known */
    _leadName  = name;
    _leadEmail = email;
    _leadPhone = phone;

    /* ── Send real SMS OTP via Firebase Phone Auth ── */
    let _confirmationResult = null;
    try {
      /* FirebaseOTP.init() is idempotent — safe to call even if already done */
      await FirebaseOTP.init();
      _confirmationResult = await FirebaseOTP.sendOTP(phone);
    } catch (fbErr) {
      errEl.textContent = FirebaseOTP.friendlyError(fbErr);
      errEl.style.display = 'block';
      btn.disabled = false;
      btnTxt.textContent = 'Show My Properties';
      return;
    }

    /* ── Transition to OTP screen inside the same modal box ── */
    const box = document.getElementById('lead-modal-box');
    box.style.transition = 'opacity 0.2s ease, transform 0.2s ease';
    box.style.opacity    = '0';
    box.style.transform  = 'scale(0.96) translateY(6px)';

    setTimeout(() => {
      box.innerHTML = `
        <div style="
          width:52px;height:52px;border-radius:50%;
          background:#1a1810;border:1.5px solid rgba(201,169,110,0.5);
          display:flex;align-items:center;justify-content:center;
          margin:0 auto 1rem;
          font-family:'Cormorant Garamond',Georgia,serif;
          color:#c9a96e;font-size:1rem;letter-spacing:0.04em;
        ">Aria</div>
        <p style="font-size:0.65rem;letter-spacing:0.18em;text-transform:uppercase;color:#5a5752;margin-bottom:1.25rem">
          Luxe<span style="color:#c9a96e">.</span>Estates
        </p>
        <h3 style="font-family:'Cormorant Garamond',Georgia,serif;font-size:1.65rem;font-weight:300;color:#f0ebe2;line-height:1.25;margin-bottom:0.5rem">
          Verify your number
        </h3>
        <p style="font-size:0.84rem;color:#5a5752;line-height:1.65;margin-bottom:0.35rem">
          We've sent a 6-digit OTP to
        </p>
        <p style="font-size:0.9rem;color:#c9a96e;font-weight:500;margin-bottom:1.75rem;letter-spacing:0.03em">
          ${phone}
        </p>

        <div id="otp-error" style="display:none;background:rgba(220,60,60,0.12);border:1px solid rgba(220,60,60,0.3);color:#f08080;font-size:0.8rem;border-radius:8px;padding:0.65rem 0.9rem;margin-bottom:0.9rem;text-align:left"></div>

        <!-- Six individual OTP digit boxes -->
        <div id="otp-boxes" style="display:flex;gap:0.55rem;justify-content:center;margin-bottom:1.5rem">
          ${[0,1,2,3,4,5].map(i => `
            <input
              id="otp-digit-${i}"
              type="text"
              inputmode="numeric"
              maxlength="1"
              data-idx="${i}"
              style="
                width:44px;height:52px;text-align:center;
                background:rgba(255,255,255,0.04);
                border:1px solid rgba(201,169,110,0.25);
                border-radius:10px;
                color:#f0ebe2;font-size:1.35rem;font-weight:600;
                font-family:'DM Sans',sans-serif;
                outline:none;caret-color:#c9a96e;
                transition:border-color 0.2s,box-shadow 0.2s,background 0.2s;
              "
            >`).join('')}
        </div>

        <button id="otp-verify-btn" style="
          width:100%;padding:0.95rem;
          background:#c9a96e;color:#0d0d0e;
          border:none;border-radius:10px;
          font-family:'DM Sans',sans-serif;font-size:0.88rem;font-weight:600;
          letter-spacing:0.04em;cursor:pointer;
          display:flex;align-items:center;justify-content:center;gap:0.55rem;
          margin-bottom:0.75rem;
          transition:background 0.25s,transform 0.2s;
        ">
          <span id="otp-btn-text">Verify & Show Properties</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>

        <p style="font-size:0.68rem;color:#2e2d2b">
          Didn't get the code? <button id="otp-resend" style="background:none;border:none;color:#c9a96e;font-size:0.68rem;cursor:pointer;padding:0;font-family:inherit;letter-spacing:inherit">Resend OTP</button>
        </p>`;

      box.style.opacity   = '1';
      box.style.transform = 'scale(1) translateY(0)';

      /* ── Focus first digit ── */
      setTimeout(() => document.getElementById('otp-digit-0')?.focus(), 200);

      /* ── OTP digit box keyboard navigation ── */
      for (let i = 0; i < 6; i++) {
        const inp = document.getElementById(`otp-digit-${i}`);
        inp.addEventListener('focus', () => {
          inp.style.borderColor  = '#c9a96e';
          inp.style.boxShadow    = '0 0 0 3px rgba(201,169,110,0.15)';
          inp.style.background   = 'rgba(201,169,110,0.06)';
        });
        inp.addEventListener('blur', () => {
          inp.style.borderColor  = 'rgba(201,169,110,0.25)';
          inp.style.boxShadow    = 'none';
          inp.style.background   = 'rgba(255,255,255,0.04)';
        });
        inp.addEventListener('keydown', e => {
          if (e.key === 'Backspace' && !inp.value && i > 0) {
            document.getElementById(`otp-digit-${i-1}`).focus();
          }
          if (e.key === 'ArrowLeft' && i > 0)   { e.preventDefault(); document.getElementById(`otp-digit-${i-1}`).focus(); }
          if (e.key === 'ArrowRight' && i < 5)  { e.preventDefault(); document.getElementById(`otp-digit-${i+1}`).focus(); }
          if (e.key === 'Enter') verifyOtp();
        });
        inp.addEventListener('input', () => {
          /* Allow only digits */
          inp.value = inp.value.replace(/\D/g, '').slice(-1);
          if (inp.value && i < 5) document.getElementById(`otp-digit-${i+1}`).focus();
        });
        inp.addEventListener('paste', e => {
          e.preventDefault();
          const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g,'').slice(0,6);
          pasted.split('').forEach((ch, j) => {
            const d = document.getElementById(`otp-digit-${j}`);
            if (d) d.value = ch;
          });
          const last = Math.min(pasted.length, 5);
          document.getElementById(`otp-digit-${last}`)?.focus();
        });
      }

      /* ── Verify OTP (Firebase) ── */
      async function verifyOtp() {
        const entered = [0,1,2,3,4,5].map(j => document.getElementById(`otp-digit-${j}`).value).join('');
        const errEl2  = document.getElementById('otp-error');
        const verBtn  = document.getElementById('otp-verify-btn');
        const verTxt  = document.getElementById('otp-btn-text');

        if (entered.length < 6) {
          errEl2.textContent = 'Please enter the complete 6-digit OTP.';
          errEl2.style.display = 'block';
          shakeOtpBoxes();
          return;
        }

        errEl2.style.display = 'none';
        verBtn.disabled = true;
        verTxt.textContent = 'Verifying…';

        /* ── Step 1: Confirm code with Firebase ── */
        let idToken;
        try {
          idToken = await FirebaseOTP.verifyOTP(_confirmationResult, entered);
        } catch (fbErr) {
          const msg = FirebaseOTP.friendlyError(fbErr);
          errEl2.textContent = msg;
          errEl2.style.display = 'block';
          verBtn.disabled = false;
          verTxt.textContent = 'Verify & Show Properties';
          shakeOtpBoxes();
          /* Clear digit boxes and refocus first */
          [0,1,2,3,4,5].forEach(j => {
            const d = document.getElementById(`otp-digit-${j}`);
            d.value = '';
            d.style.borderColor = '#e05a5a';
            setTimeout(() => { d.style.borderColor = 'rgba(201,169,110,0.25)'; }, 600);
          });
          setTimeout(() => document.getElementById('otp-digit-0')?.focus(), 100);
          return;
        }

        verBtn.style.background = '#4caf88';

        /* ── Step 2: Exchange Firebase ID token for our stable uuid ── */
        try {
          const verifyRes  = await fetch(`${API}/api/otp/verify`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ idToken, phone })
          });
          const verifyData = await verifyRes.json();

          /* ── Blocked number: show error, stop completely ── */
          if (!verifyData.success) {
            errEl2.textContent = verifyData.error || 'Verification failed. Please contact support.';
            errEl2.style.display = 'block';
            verBtn.disabled = false;
            verTxt.textContent = 'Verify & Show Properties';
            verBtn.style.background = '';
            shakeOtpBoxes();
            return; /* do NOT fall through — luxe_otp_verified must NOT be set */
          }

          if (verifyData.success && verifyData.uuid) {
            localStorage.setItem('stellar_user_id', verifyData.uuid);
            localStorage.setItem('stellar_verified_phone', phone);

            /* ★ POST LEAD NOW — uuid is guaranteed, never anonymous ★ */
            fetch(`${API}/api/leads`, {
              method:  'POST',
              headers: { 'Content-Type': 'application/json' },
              body:    JSON.stringify({
                name:    _leadName,
                phone:   _leadPhone,
                email:   _leadEmail,
                filters: userFilters,
                uuid:    verifyData.uuid
              })
            }).catch(() => {});

            /* Merge any properties already wishlisted locally into the DB */
            syncLocalWishlistToServer(verifyData.uuid);
            /* Re-run the server wishlist fetch now that we have a userId.
               _wishlistReady ran at page-load when userId was null, so this
               is the first real fetch. Store the new Promise so any other
               code that awaits _wishlistReady also gets the fresh data. */
            window._wishlistReady = (async function () {
              try {
                const wlRes  = await fetch(`${API}/api/wishlist/${verifyData.uuid}`);
                const wlData = await wlRes.json();
                if (!wlData.success || !wlData.wishlist) return;
                const serverProps = wlData.wishlist.propertyIds || [];
                serverProps.forEach(p => {
                  if (!p) return;
                  const id = (p._id || p.id || p).toString();
                  if (id === 'null' || id === 'undefined') return;
                  if (!window.wishlist.has(id) && typeof p === 'object' && p.title) {
                    window.wishlist.toggle(id, p);
                  } else if (!window.wishlist.has(id)) {
                    window.wishlist.toggle(id, { _id: id, _stub: true });
                  }
                });
              } catch (_) { /* non-blocking */ }
            })();
            /* After the fetch settles, refresh heart states on any already-
               rendered listing cards without triggering a full API reload */
            window._wishlistReady.finally(() => {
              document.querySelectorAll('.property-card[data-id]').forEach(card => {
                const id     = card.dataset.id;
                const heart  = card.querySelector('.wishlist-heart');
                const svg    = heart?.querySelector('svg');
                if (!heart || !svg) return;
                const saved  = window.wishlist.has(id);
                heart.classList.toggle('saved', saved);
                svg.setAttribute('fill',   saved ? '#c9a96e' : 'none');
                svg.setAttribute('stroke', saved ? '#c9a96e' : 'currentColor');
                heart.setAttribute('aria-label', saved ? 'Remove from wishlist' : 'Save to wishlist');
              });
              if (typeof updateWishlistBadge === 'function') updateWishlistBadge();
            });
          }
        } catch (_) { /* non-blocking — localStorage still works as fallback */ }

        verTxt.textContent = 'Verified! ✓';
        localStorage.setItem('luxe_otp_verified', '1');

        /* Show tick animation then close */
        setTimeout(() => {
          overlay.style.opacity = '0';
          box.style.transform   = 'scale(0.92) translateY(8px)';
          setTimeout(() => { overlay.remove(); onSuccess(); }, 300);
        }, 600);
      }

      function shakeOtpBoxes() {
        const wrap = document.getElementById('otp-boxes');
        wrap.style.animation = 'nmShake 0.38s ease';
        setTimeout(() => wrap.style.animation = '', 400);
      }

      document.getElementById('otp-verify-btn').addEventListener('click', verifyOtp);

      /* ── Resend OTP — 30 s cooldown, real Firebase call ── */
      let _resendCooldown = false;
      document.getElementById('otp-resend').addEventListener('click', async () => {
        if (_resendCooldown) return;
        const resendBtn = document.getElementById('otp-resend');
        _resendCooldown = true;
        resendBtn.disabled = true;
        resendBtn.textContent = 'Sending…';
        resendBtn.style.color = '#888';

        try {
          FirebaseOTP.resetRecaptcha();
          _confirmationResult = await FirebaseOTP.sendOTP(phone);
          resendBtn.textContent = 'Sent! ✓';
          resendBtn.style.color = '#4caf88';
          [0,1,2,3,4,5].forEach(j => {
            const d = document.getElementById('otp-digit-' + j);
            if (d) { d.value = ''; d.style.borderColor = 'rgba(201,169,110,0.25)'; }
          });
          document.getElementById('otp-digit-0')?.focus();
          document.getElementById('otp-error').style.display = 'none';
        } catch (fbErr) {
          resendBtn.textContent = 'Retry';
          resendBtn.style.color = '#e05a5a';
          const errEl2 = document.getElementById('otp-error');
          errEl2.textContent = FirebaseOTP.friendlyError(fbErr);
          errEl2.style.display = 'block';
          _resendCooldown = false;
          resendBtn.disabled = false;
          return;
        }

        /* 30 s cooldown before user can resend again */
        setTimeout(() => {
          _resendCooldown = false;
          if (document.getElementById('otp-resend')) {
            resendBtn.textContent = 'Resend OTP';
            resendBtn.style.color = '#c9a96e';
            resendBtn.disabled = false;
          }
        }, 30000);
      });

    }, 220);
  }

  document.getElementById('lead-submit').addEventListener('click', submitLead);
  ['lead-name','lead-phone-number','lead-email'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => { if (e.key === 'Enter') submitLead(); });
  });
}

/* ════════════════════════════════════════════════════════════
   PROGRESS BAR CONTROLLER
   Call setProgress(n) where n = 1–7 as each step starts.
   setProgress(0) hides the bar (e.g. on restart before step 1 loads).
════════════════════════════════════════════════════════════ */
/* Current step — readable by the conversation engine */
let _convStep = 0;
const _CONV_TOTAL = 10;
let _suppressProgress = false;

function setProgress(step) {
  _convStep = step || 0;

  /* Hide the old sticky bar — we use inline pie now */
  const bar = document.getElementById('conv-progress');
  if (bar) bar.style.display = 'none';
}

/* ════════════════════════════════════════════════════════════
   CONVERSATION ENGINE
════════════════════════════════════════════════════════════ */
function initConversation() {
  const section = document.getElementById('conversation-section');
  if (!section) return;

  function ariaAvatar() {
    return `<div class="aria-avatar"><span class="aria-avatar-initials">Aria</span></div>`;
  }

  /* Renders an inline progress bar with percentage inside Aria's bubble.
     typing=true  → shimmer on current progress (Aria is thinking)
     step=0       → only shown at the very start before Q1 loads */
  function buildPie(step, total, typing) {
    if (_suppressProgress) return '';
    const isStart = !step || step < 1;
    const pct     = isStart ? 0 : Math.round(((step - 1) / total) * 100);
    const isDone  = !isStart && step > total;
    const fillPct = isDone ? 100 : pct;

    if (typing) {
      const typingLabel = isDone ? 'Complete \u2736' : isStart ? 'Starting\u2026' : pct + '% complete';
      return '<div class="conv-prog-wrap conv-prog-typing">' +
        '<div class="conv-prog-track">' +
          '<div class="conv-prog-fill" style="width:' + fillPct + '%"></div>' +
          '<div class="conv-prog-shimmer"></div>' +
        '</div>' +
        '<span class="conv-prog-label">' + typingLabel + '</span>' +
      '</div>';
    }

    const label = isDone ? 'Complete \u2736' : isStart ? 'Starting\u2026' : pct + '% complete';
    return '<div class="conv-prog-wrap' + (isDone ? ' conv-prog-done' : '') + '">' +
      '<div class="conv-prog-track">' +
        '<div class="conv-prog-fill" style="width:' + fillPct + '%"></div>' +
      '</div>' +
      '<span class="conv-prog-label">' + label + '</span>' +
    '</div>';
  }

  function makeTurn(questionHTML, rightColHTML, isAnswered = false) {
    const turn = document.createElement('div');
    turn.className = 'conv-turn';
    turn.innerHTML = `
      <div class="conv-aria-row">
        ${ariaAvatar()}
        <div class="conv-aria-bubble">
          <div class="aria-label-tag"><span class="aria-dot"></span>Aria · Property Guide</div>
          <div class="conv-question">${questionHTML}</div>
          ${buildPie(_convStep, _CONV_TOTAL)}
        </div>
      </div>
      <div class="conv-user-row ${isAnswered ? 'is-answered' : ''}">
        <div class="conv-right">${rightColHTML}</div>
      </div>`;
    return turn;
  }

  function appendTurn(questionHTML, rightColHTML, delay = 0) {
    return new Promise(resolve => {
      const typingTurn = document.createElement('div');
      typingTurn.className = 'conv-turn';
      typingTurn.innerHTML = `
        <div class="conv-aria-row">
          ${ariaAvatar()}
          <div class="conv-aria-bubble">
            <div class="aria-label-tag"><span class="aria-dot"></span>Aria · Property Guide</div>
            <div class="conv-typing"><span></span><span></span><span></span></div>
            ${buildPie(_convStep, _CONV_TOTAL, true)}
          </div>
        </div>
        <div class="conv-user-row"></div>`;
      section.appendChild(typingTurn);
      requestAnimationFrame(() => requestAnimationFrame(() => typingTurn.classList.add('visible')));
      smoothScrollToBottom();

      setTimeout(() => {
        section.removeChild(typingTurn);
        const turn = makeTurn(questionHTML, rightColHTML);
        section.appendChild(turn);
        requestAnimationFrame(() => requestAnimationFrame(() => turn.classList.add('visible')));
        smoothScrollToBottom();
        resolve(turn);
      }, delay + 650);
    });
  }

  function smoothScrollToBottom() {
    setTimeout(() => {
      const last = section.lastElementChild;
      if (!last) return;
      window.scrollTo({ top: last.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' });
    }, 100);
  }

  function buildOpts(options) {
    return `<div class="conv-opts">${options.map((o, i) =>
      `<button class="conv-opt-btn" data-idx="${i}">
        <span class="opt-label-wrap">
          <span class="opt-label">${o.label}</span>
          ${o.subtext ? `<span class="opt-subtext">${o.subtext}</span>` : ''}
        </span>
        <svg class="opt-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </button>`
    ).join('')}</div>`;
  }

  function buildMultiSelect(options, submitLabel = 'Continue') {
    const useGrid = options.length > 4;
    return `
      <div class="conv-multi">
        <div class="conv-checks${useGrid ? ' grid-layout' : ''}">${options.map((o, i) =>
          `<button class="conv-toggle-btn" data-value="${o.value || o.label}" data-label="${o.label}" data-idx="${i}" type="button">
            <span class="toggle-label-wrap">
              <span class="toggle-label">${o.label}</span>
            </span>
            <svg class="toggle-check-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
          </button>`
        ).join('')}</div>
        <button class="conv-multi-submit">
          <span>${submitLabel}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
        </button>
      </div>`;
  }

  function lockTurn(turn, answerHTML) {
    const rightCol = turn.querySelector('.conv-right');
    const userRow  = turn.querySelector('.conv-user-row');
    rightCol.innerHTML = `<div class="conv-user-bubble">${answerHTML}</div>`;
    userRow.classList.add('is-answered');
  }

  /* ── STEP 1: Purpose ── */
  async function step_propertyType() {
    setProgress(1);
    const opts = [
      { label: 'For Myself / Family', value: 'self-use',   subtext: 'A home to live in & love' },
      { label: 'As an Investment',    value: 'investment', subtext: 'Rental income or appreciation' },
      { label: 'Both',                value: 'both',       subtext: 'Live in now, benefit later' }
    ];
    const turn = await appendTurn(
      `Welcome, <strong style="color:var(--gold)">${customerName}</strong>! I'm Aria, your property advisor.<br>What is your primary purpose for buying?`,
      buildOpts(opts), 200
    );
    turn.querySelectorAll('.conv-opt-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        userFilters.purpose = opts[i].value;
        lockTurn(turn, opts[i].label);
        step_type();
      });
    });
  }

  /* ── STEP 2: Property Type ── */
  async function step_type() {
    setProgress(2);
    const opts = [
      { label: 'Premium High-Rise', value: 'apartment', subtext: 'Luxury flats in gated towers' },
      { label: 'Villa',             value: 'villa',      subtext: 'Independent home with private space' },
      { label: 'Plot',              value: 'plot',       subtext: 'Land to build your dream home' }
    ];
    const turn = await appendTurn(
      `What type of property are you looking for?`,
      buildOpts(opts), 300
    );
    turn.querySelectorAll('.conv-opt-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        userFilters.type = opts[i].value;
        lockTurn(turn, opts[i].label);
        step_budget();
      });
    });
  }

  /* ── STEP 3: Budget ── */
  async function step_budget() {
    setProgress(3);
    const opts = [
      { label: '₹75L – ₹1 Cr',    value: [7500000,  10000000],  subtext: 'Smart entry-level luxury' },
      { label: '₹1 Cr – ₹1.5 Cr', value: [10000000, 15000000],  subtext: 'Wide choice of quality homes' },
      { label: '₹1.5 Cr – ₹2 Cr', value: [15000000, 20000000],  subtext: 'Premium & spacious' },
      { label: '₹2.5 Cr – ₹5 Cr', value: [25000000, 50000000],  subtext: 'High-end & exclusive' },
      { label: '₹5 Cr and above',  value: [50000000, 999999999], subtext: 'Ultra-luxury, no limits' }
    ];
    const turn = await appendTurn(
      `Noted! What is your total budget?`,
      buildOpts(opts), 300
    );
    turn.querySelectorAll('.conv-opt-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        userFilters.budget = opts[i].value;
        lockTurn(turn, opts[i].label);
        step_location();
      });
    });
  }

  /* ── STEP 4: Zone → Locality ── */

  const ZONE_MAP = {
    'West Hyderabad':    ['Gachibowli','HITEC City','Madhapur','Kondapur','Kokapet','Narsingi','Financial District','Puppalaguda','Nanakramguda','Raidurg','Manikonda','Khajaguda','Miyapur','Hafeezpet','Chandanagar','Lingampally','Tellapur','Osman Nagar','Kollur','Velimela','Patancheru','Bachupally','Nizampet','Pragathi Nagar','Kukatpally','Kothaguda','Serilingampally'],
    'Central Hyderabad': ['Jubilee Hills','Banjara Hills','Somajiguda','Ameerpet','Punjagutta','Khairatabad','Begumpet','Himayatnagar','Basheerbagh','Abids','Koti','Nampally','Lakdikapul','Masab Tank','Film Nagar','Yousufguda','Srinagar Colony','Erragadda','Sanath Nagar','SR Nagar','Panjagutta'],
    'East Hyderabad':    ['Uppal','Nagole','LB Nagar','Nacharam','Pocharam','Boduppal','Peerzadiguda','Medipally','Ghatkesar','Ramanthapur','Habsiguda','Tarnaka','Kothapet','Dilsukhnagar','Chaitanyapuri','Moosarambagh','Hayathnagar','Chengicherla'],
    'South Hyderabad':   ['Attapur','Rajendra Nagar','Bandlaguda Jagir','Sun City','Shamshabad','Adibatla','Maheshwaram','Tukkuguda','Kismatpur','Moinabad','Himayat Sagar','Shadnagar','Kothur','Falaknuma','Chandrayangutta','Barkas','Upparpally'],
    'North Hyderabad':   ['Kompally','Suchitra','Jeedimetla','Quthbullapur','Suraram','Alwal','Dulapally','Pet Basheerabad','Balanagar','Bowenpally','Bahadurpally','Gundlapochampally','Medchal','Kandlakoya'],
    'Secunderabad':      ['Malkajgiri','Sainikpuri','AS Rao Nagar','ECIL','Kapra','Trimulgherry','West Marredpally','East Marredpally','Karkhana','Bolarum','Rasoolpura','Paradise','Secunderabad','Padmarao Nagar','Sitaphalmandi','Bowenpally','Tarnaka']
  };

  function buildZonedLocalities(flatList) {
    const locToZone = {};
    for (const [zone, locs] of Object.entries(ZONE_MAP)) {
      locs.forEach(l => { locToZone[l.toLowerCase()] = zone; });
    }
    const zoned = {};
    for (const [zone, locs] of Object.entries(ZONE_MAP)) {
      const available = locs.filter(l => flatList.some(f => f.toLowerCase() === l.toLowerCase()));
      if (available.length) zoned[zone] = available;
    }
    const other = flatList.filter(l => !locToZone[l.toLowerCase()]);
    if (other.length) zoned['Other Areas'] = other;
    return zoned;
  }

  async function step_location() {
    setProgress(4);
    const zoned     = ZONE_MAP;
    const zoneNames = Object.keys(zoned);

    const zoneOpts = zoneNames.map(z => ({
      label:   z,
      subtext: zoned[z].join(', ')
    }));
    zoneOpts.push({ label: 'Open to all areas', subtext: 'Show me everything' });

    const zoneTurn = await appendTurn(
      `Which part of Hyderabad are you looking at?`,
      buildOpts(zoneOpts), 300
    );

    zoneTurn.querySelectorAll('.conv-opt-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        if (i === zoneOpts.length - 1) {
          userFilters.zone     = null;
          userFilters.locality = null;
          lockTurn(zoneTurn, 'Open to all areas');
          step_timeline();
          return;
        }
        const chosenZone     = zoneNames[i];
        userFilters.zone     = chosenZone;
        userFilters.locality = null;
        lockTurn(zoneTurn, chosenZone);
        step_timeline();
      });
    });
  }

  /* ── STEP 5: Buying Timeline ── */
  async function step_timeline() {
    setProgress(5);
    const opts = [
      { label: 'Immediately',      value: 'immediate', subtext: '0 – 3 months' },
      { label: 'Within 6 months',  value: '6months',   subtext: 'Actively shortlisting' },
      { label: 'Within 12 months', value: '12months',  subtext: 'Planning ahead' },
      { label: 'Just Exploring',   value: 'exploring', subtext: 'No rush, keeping options open' }
    ];
    const turn = await appendTurn(
      `When are you planning to buy?`,
      buildOpts(opts), 300
    );
    turn.querySelectorAll('.conv-opt-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        userFilters.timeline = opts[i].value;
        lockTurn(turn, opts[i].label);
        step_status();
      });
    });
  }

  /* ── STEP 6: Ready-to-move or Under Construction ── */
  async function step_status() {
    setProgress(6);
    const opts = [
      { label: 'Ready to Move',      value: 'sale',              subtext: 'Move in right away' },
      { label: 'Under Construction', value: 'underconstruction', subtext: 'Often better pricing & choice' },
      { label: 'Flexible',           value: null,                subtext: 'Show me both' }
    ];
    const turn = await appendTurn(
      `Are you looking for a ready-to-move home, or open to under-construction properties?`,
      buildOpts(opts), 300
    );
    turn.querySelectorAll('.conv-opt-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        userFilters.status = opts[i].value;
        lockTurn(turn, opts[i].label);
        opts[i].value === 'underconstruction' ? step_possession() : step_bhk();
      });
    });
  }

  /* ── STEP 7: Possession Timeline (under construction only) ── */
  async function step_possession() {
    setProgress(7);
    const opts = [
      { label: 'Within 1 year', value: '<1yr',  subtext: 'Near-complete projects' },
      { label: '1 – 3 years',   value: '1-3yr', subtext: 'Mid-stage construction' },
      { label: '3 – 5 years',   value: '3-5yr', subtext: 'Early-stage or new launches' },
      { label: 'No preference', value: null,    subtext: 'Show me all stages' }
    ];
    const turn = await appendTurn(
      `What is the acceptable possession timeline for you?`,
      buildOpts(opts), 300
    );
    turn.querySelectorAll('.conv-opt-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        userFilters.possession = opts[i].value;
        lockTurn(turn, opts[i].label);
        step_bhk();
      });
    });
  }

  /* ── STEP 8: BHK ── */
  async function step_bhk() {
    setProgress(8);
    const opts = [
      { label: '2 BHK',  value: '2', subtext: 'Ideal for couples & small families' },
      { label: '3 BHK',  value: '3', subtext: 'Most popular choice' },
      { label: '4 BHK',  value: '4', subtext: 'For larger families' },
      { label: '4+ BHK', value: '5', subtext: 'Grand, expansive homes' }
    ];
    const turn = await appendTurn(
      `How many bedrooms do you need? <span style="font-size:1rem;color:var(--text-muted);font-weight:400">(select all that apply)</span>`,
      buildMultiSelect(opts, 'Continue'), 300
    );

    /* Toggle active state on each button */
    turn.querySelectorAll('.conv-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => btn.classList.toggle('active'));
    });

    /* Submit handler */
    turn.querySelector('.conv-multi-submit').addEventListener('click', () => {
      const selected = [...turn.querySelectorAll('.conv-toggle-btn.active')];
      if (!selected.length) {
        /* Nudge: require at least one selection */
        turn.querySelector('.conv-checks').style.animation = 'nmShake 0.38s ease';
        setTimeout(() => turn.querySelector('.conv-checks').style.animation = '', 400);
        return;
      }
      const values = selected.map(b => Number(b.dataset.value));
      const labels = selected.map(b => b.dataset.label).join(', ');
      userFilters.bhk = values.length === 1 ? values[0] : values;
      lockTurn(turn, labels);
      step_area();
    });
  }

  /* ── STEP 9: Minimum Size ── */
  async function step_area() {
    setProgress(9);
    const opts = [
      { label: 'Under 1,000 sq ft',     value: [0,    1000],  subtext: 'Compact & efficient' },
      { label: '1,000 – 1,500 sq ft',   value: [1000, 1500],  subtext: 'Cosy family home' },
      { label: '1,500 – 2,500 sq ft',   value: [1500, 2500],  subtext: 'Comfortable & spacious' },
      { label: '2,500 sq ft and above', value: [2500, 99999], subtext: 'Grand & expansive' }
    ];
    const turn = await appendTurn(
      `What minimum size are you looking for?`,
      buildOpts(opts), 300
    );
    turn.querySelectorAll('.conv-opt-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        userFilters.area = opts[i].value;
        lockTurn(turn, opts[i].label);
        step_priority();
      });
    });
  }

  /* ── STEP 10: Top Priority → lead modal → results ── */
  async function step_priority() {
    setProgress(10);
    const opts = [
      { label: 'Price',        value: 'price',        subtext: 'Best value for money' },
      { label: 'Location',     value: 'location',     subtext: 'Neighbourhood & connectivity' },
      { label: 'Amenities',    value: 'amenities',    subtext: 'Facilities & lifestyle' },
      { label: 'Appreciation', value: 'appreciation', subtext: 'Long-term capital growth' },
      { label: 'Brand',        value: 'brand',        subtext: 'Trusted developer reputation' }
    ];
    const turn = await appendTurn(
      `Last one! What is your top priority when choosing a property?`,
      buildOpts(opts), 300
    );
    turn.querySelectorAll('.conv-opt-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        userFilters.priority = opts[i].value;
        lockTurn(turn, opts[i].label);
        showLeadModal(() => showResults());
      });
    });
  }

  /* ── Results ── */
  async function showResults() {
  setProgress(_CONV_TOTAL + 1); /* marks as fully complete → 100% bar */
    const loadTurn = await appendTurn(
      `Give me just a moment, ${customerName}…<br>
       <span style="font-size:0.8rem;color:var(--text-muted);font-family:var(--font-body)">Searching across ${META.localities.length} localities in Hyderabad</span>`,
      `<div class="conv-typing" style="padding-top:0.5rem"><span></span><span></span><span></span></div>`,
      300
    );

    function buildParams(filters, limit) {
      const p = new URLSearchParams({ limit });
      if (filters.type)              p.set('type',     filters.type);
      if (filters.bhk != null) {
        if (Array.isArray(filters.bhk)) p.set('bhk', filters.bhk.join(','));
        else                            p.set('bhk', filters.bhk);
      }
      if (filters.budget)            { p.set('minPrice', filters.budget[0]); p.set('maxPrice', filters.budget[1]); }
      if (filters.area)              { p.set('minArea',  filters.area[0]);   p.set('maxArea',  filters.area[1]); }
      if (filters.status)            p.set('status',   filters.status);
      if (filters.amenities?.length) p.set('amenities', filters.amenities.join(','));

      if (filters.locality) {
        /* Specific locality chosen — exact match */
        p.set('locality', filters.locality);
      } else if (filters.zone) {
        /* Zone chosen — expand to all localities in that zone as an OR-regex via q */
        const zoneLocs = ZONE_MAP[filters.zone] || [];
        if (zoneLocs.length) {
          /* Anchor each name so partial matches (e.g. "Uppal" ≠ "Uppal Kalan") are avoided */
          p.set('q', zoneLocs.map(l => `^${l}$`).join('|'));
        }
      }
      return p;
    }

    const params = buildParams(userFilters, 6);
    let properties = [], totalFound = 0, usedFallback = false;

    try {
      const res  = await fetch(`${API}/api/properties?${params}`);
      const data = await res.json();
      if (data.success && data.properties.length > 0) {
        properties = data.properties;
        totalFound = data.pagination.total;
      } else {
        const relaxed = { type: userFilters.type, locality: userFilters.locality, zone: userFilters.zone, budget: userFilters.budget, status: userFilters.status };
        const fp = buildParams(relaxed, 6);
        const fb = await fetch(`${API}/api/properties?${fp}`);
        const fd = await fb.json();
        properties   = fd.success ? fd.properties : [];
        totalFound   = fd.success ? fd.pagination.total : 0;
        usedFallback = true;
      }
    } catch (e) { console.error('Search failed:', e); }

    section.removeChild(loadTurn);

    if (properties.length === 0) {
      await appendTurn(
        `Nothing matched your exact criteria right now, ${customerName}.`,
        `<div class="conv-info-card">
          <p>Our inventory grows every week. Leave your details and we'll notify you the moment a matching property comes in.</p>
          <a href="contact.html" class="btn btn-gold" style="margin-top:1.25rem;display:inline-flex">Get Notified</a>
        </div>`, 0
      );
      showFollowUp();
      return;
    }

    const headline = usedFallback
      ? `Here are some wonderful options for you, ${customerName}!<br><span class="result-note">We broadened the search slightly to find you more choices</span>`
      : `Found <strong style="color:var(--gold)">${totalFound}</strong> ${totalFound === 1 ? 'property' : 'properties'} matching your preferences`;

    const viewAllHref = `listings.html?${params.toString()}`;
    const cardsHTML   = `
      <div class="result-headline">${headline}</div>
      <div class="result-cards-grid">${properties.map(p => buildPropertyCard(p)).join('')}</div>
      ${totalFound > 6 ? `<a href="${viewAllHref}" class="result-view-all">View all ${totalFound} matching properties</a>` : ''}`;

    const resultTurn = await appendTurn(`Here's what I found for you ✦`, cardsHTML, 0);
    resultTurn.classList.add('result-turn');

    /* Build a map so each heart button can look up its property object by id
       instead of relying on positional index (which breaks if the DOM order
       ever diverges from the properties array). */
    const propById = Object.fromEntries(properties.map(p => [String(p._id || p.id), p]));

    resultTurn.querySelectorAll('.card-wishlist').forEach((btn) => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const id   = btn.dataset.id;
        const prop = propById[String(id)];   // always the correct object, never undefined
        const added = wishlist.toggle(id, prop);
        btn.classList.toggle('active', added);
        btn.innerHTML = added ? '♥' : '♡';
        showToast(added ? 'Saved to wishlist' : 'Removed from wishlist', '♥');

        /* Sync to DB — fire-and-forget */
        const userId = localStorage.getItem('stellar_user_id');
        if (userId) {
          fetch(`${API}/api/wishlist/${userId}/${added ? 'add' : 'remove'}`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ propertyId: id })
          }).catch(() => {});
        }
      });
    });

    resultTurn.querySelectorAll('.property-card').forEach((card, i) => {
      card.addEventListener('click', e => {
        if (e.target.closest('.card-wishlist')) return;
        window.location.href = `property.html?id=${properties[i]._id}`;
      });
    });

    showFollowUp();
  }

  function buildPropertyCard(p) {
    const id           = p._id;
    const inWL         = wishlist.has(id);
    const badgeMap     = { new: 'New Launch', featured: 'Featured', premium: 'Premium' };
    const badgeLabel   = p.badge ? badgeMap[p.badge] : (p.status === 'underconstruction' ? 'Under Construction' : 'For Sale');
    const badgeClass   = p.badge || (p.status === 'underconstruction' ? 'new' : 'sale');
    const topAmenities = (p.amenities || []).slice(0, 3);

    return `
      <div class="property-card">
        <div class="card-image">
          <img src="${p.img}" alt="${p.title}" loading="lazy">
          <div class="card-overlay-gradient"></div>
          <div class="card-badge badge-${badgeClass}">${badgeLabel}</div>
          <button class="card-wishlist${inWL ? ' active' : ''}" data-id="${id}" title="Save to wishlist">${inWL ? '♥' : '♡'}</button>
          <div class="card-price-overlay">${p.price}</div>
        </div>
        <div class="card-body">
          <div class="card-title">${p.title}</div>
          <div class="card-location">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${p.locality}, ${p.city}
          </div>
          <div class="card-divider"></div>
          <div class="card-meta">
            <div class="card-meta-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span>${p.bhk} BHK</span>
            </div>
            <div class="card-meta-dot"></div>
            <div class="card-meta-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
              <span>${p.area.toLocaleString()} sq ft</span>
            </div>
            <div class="card-meta-dot"></div>
            <div class="card-meta-item">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M2 12h20"/></svg>
              <span>${p.baths} Bath${p.baths > 1 ? 's' : ''}</span>
            </div>
          </div>
          ${topAmenities.length ? `<div class="card-amenity-tags">${topAmenities.map(a => `<span class="amenity-tag">${a}</span>`).join('')}</div>` : ''}
        </div>
      </div>`;
  }

  async function showFollowUp() {
    _suppressProgress = true;
    const opts = [
      { label: 'Start a New Search',     subtext: 'Explore with different preferences', action: 'restart' },
      { label: 'Explore All Properties', subtext: 'Browse our full inventory',           action: 'listings' },
      { label: 'Talk to an Expert',      subtext: 'Get personalised guidance',           action: 'agent' }
    ];
    const turn = await appendTurn(
      `What would you like to do next, ${customerName}?`,
      buildOpts(opts), 400
    );
    turn.querySelectorAll('.conv-opt-btn').forEach((btn, i) => {
      btn.addEventListener('click', () => {
        lockTurn(turn, opts[i].label);
        const a = opts[i].action;
        if (a === 'restart')  { restartConversation(); return; }
        if (a === 'listings') { window.location.href = 'listings.html'; return; }
        if (a === 'agent')    { window.location.href = 'contact.html'; return; }
      });
    });
    setTimeout(() => {
      document.getElementById('page-footer').style.display = '';
      smoothScrollToBottom();
    }, 800);
  }

  /* ── Lifecycle ── */
  function startConversation(name) {
    section.innerHTML = '';
    userFilters = {};
    _suppressProgress = false;
    document.getElementById('page-footer').style.display = 'none';
    setProgress(0);
    step_propertyType();
  }

  function restartConversation() {
    customerName = customerName || localStorage.getItem('customer_name') || '';
    userFilters  = {};
    section.innerHTML = '';
    document.getElementById('page-footer').style.display = 'none';

    if (customerName) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      startConversation(customerName);
      return;
    }

    let overlay = document.getElementById('name-modal');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id        = 'name-modal';
      overlay.className = 'name-modal-overlay';
      overlay.innerHTML = `
        <div class="name-modal-box">
          <div class="nm-avatar" style="background:#1a1810;border:1.5px solid rgba(201,169,110,0.5);font-family:'Cormorant Garamond',serif;color:#c9a96e;font-size:1rem;letter-spacing:0.04em;display:flex;align-items:center;justify-content:center;width:60px;height:60px;border-radius:50%;margin:0 auto 1rem;">Aria</div>
          <div class="nm-brand">Luxe<span>.</span>Estates</div>
          <h3 class="nm-title">Welcome back! 👋</h3>
          <p class="nm-sub">Let's find you another perfect home. What should I call you?</p>
          <input id="modal-name-input" class="nm-input" type="text" placeholder="Your name…" autocomplete="given-name" maxlength="40">
          <button id="modal-start-btn" class="nm-btn">
            Start a New Search
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </button>
        </div>`;
      document.body.appendChild(overlay);
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => initNameModal(), 400);
  }

  function initNameModal() {
    const overlay  = document.getElementById('name-modal');
    const input    = document.getElementById('modal-name-input');
    const startBtn = document.getElementById('modal-start-btn');
    if (!overlay) return;

    const saved = localStorage.getItem('customer_name');
    if (saved) {
      customerName = saved;
      overlay.style.display = 'none';
      startConversation(customerName);
      return;
    }

    overlay.style.display = '';
    requestAnimationFrame(() => overlay.classList.add('visible'));
    setTimeout(() => input?.focus(), 400);

    const newBtn   = startBtn.cloneNode(true);
    startBtn.parentNode.replaceChild(newBtn, startBtn);
    const newInput = input.cloneNode(true);
    input.parentNode.replaceChild(newInput, input);

    function submit() {
      const nameVal = document.getElementById('modal-name-input').value.trim();
      if (!nameVal) {
        const inp = document.getElementById('modal-name-input');
        inp.classList.add('shake');
        setTimeout(() => inp.classList.remove('shake'), 400);
        return;
      }
      customerName = nameVal;
      localStorage.setItem('customer_name', nameVal);
      overlay.classList.remove('visible');
      setTimeout(() => { overlay.style.display = 'none'; startConversation(nameVal); }, 350);
    }

    document.getElementById('modal-start-btn').addEventListener('click', submit);
    document.getElementById('modal-name-input').addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  }

  const _qs       = new URLSearchParams(window.location.search);
  const _locality = _qs.get('locality');
  const _type     = _qs.get('type');
  if (_locality || _type) {
    userFilters  = {};
    customerName = customerName || 'you';
    if (_type)     userFilters.type     = _type;
    if (_locality) userFilters.locality = _locality;
    document.getElementById('page-footer').style.display = 'none';
    showResults();
  } else {
    initNameModal();
  }
}

/* ════════════════════════════════════════════════════════════
   CONTACT FORM
   Requires OTP verification before submission.
   If already verified (luxe_otp_verified=1 + stellar_user_id),
   the form submits directly. Otherwise the lead/OTP modal fires
   first, and on success the form submits automatically.
════════════════════════════════════════════════════════════ */
function initContactForm() {
  const form = document.querySelector('.contact-form');
  if (!form) return;

  /* Pre-fill name + phone if the user already verified this session */
  const savedName  = localStorage.getItem('customer_name');
  const savedPhone = localStorage.getItem('stellar_verified_phone'); // set after OTP success
  if (savedName  && form.querySelector('[name="name"]'))  form.querySelector('[name="name"]').value  = savedName;
  if (savedPhone && form.querySelector('[name="phone"]')) form.querySelector('[name="phone"]').value = savedPhone;

  /* Show a subtle "verified" badge next to the phone field if already verified */
  function showVerifiedBadge() {
    const phoneField = form.querySelector('[name="phone"]');
    if (!phoneField) return;
    if (form.querySelector('.otp-verified-badge')) return; // already added
    const badge = document.createElement('span');
    badge.className = 'otp-verified-badge';
    badge.innerHTML = '✓ Verified';
    badge.style.cssText = 'display:inline-block;margin-left:0.5rem;font-size:0.75rem;color:#6edf96;font-weight:500;letter-spacing:0.03em;vertical-align:middle';
    phoneField.insertAdjacentElement('afterend', badge);
  }
  if (localStorage.getItem('luxe_otp_verified') === '1') showVerifiedBadge();

  async function doSubmit() {
    const uuid    = localStorage.getItem('stellar_user_id');
    const name    = form.querySelector('[name="name"]')?.value.trim();
    const email   = form.querySelector('[name="email"]')?.value.trim();
    const phone   = form.querySelector('[name="phone"]')?.value.trim();
    const message = form.querySelector('[name="message"]')?.value.trim();

    if (!name || !email || !message) { showToast('Please fill in all required fields', '⚠'); return; }
    if (!uuid) { showToast('Phone verification required — please verify below', '⚠'); return; }

    const btn  = form.querySelector('button[type="submit"]');
    const orig = btn.textContent;
    btn.textContent = 'Sending…'; btn.disabled = true;
    try {
      const res  = await fetch(`${API}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, phone, message, uuid })
      });
      const data = await res.json();
      if (data.success) {
        showToast("Message sent! We'll be in touch shortly.", '✓');
        form.reset();
        /* Re-fill name/phone after reset */
        if (savedName  && form.querySelector('[name="name"]'))  form.querySelector('[name="name"]').value  = savedName;
        if (savedPhone && form.querySelector('[name="phone"]')) form.querySelector('[name="phone"]').value = savedPhone;
      } else {
        showToast(data.error || 'Something went wrong', '✗');
      }
    } catch { showToast('Network error — please try again', '✗'); }
    finally { btn.textContent = orig; btn.disabled = false; }
  }

  form.addEventListener('submit', async e => {
    e.preventDefault();

    /* Already verified — submit straight away */
    if (localStorage.getItem('luxe_otp_verified') === '1' && localStorage.getItem('stellar_user_id')) {
      doSubmit();
      return;
    }

    /* Not verified — collect details from the contact form and prefill
       the lead modal fields so the user doesn't have to retype them */
    const nameVal  = form.querySelector('[name="name"]')?.value.trim()  || '';
    const phoneVal = form.querySelector('[name="phone"]')?.value.trim() || '';
    const emailVal = form.querySelector('[name="email"]')?.value.trim() || '';

    if (nameVal) localStorage.setItem('customer_name', nameVal);

    showLeadModal(() => {
      /* OTP verified — save the phone for pre-fill, show badge, submit */
      const verifiedPhone = form.querySelector('[name="phone"]')?.value.trim() || phoneVal;
      if (verifiedPhone) localStorage.setItem('stellar_verified_phone', verifiedPhone);
      showVerifiedBadge();
      doSubmit();
    });

    /* Prefill the lead modal fields with what the user already typed */
    const leadName  = document.getElementById('lead-name');
    const leadPhone = document.getElementById('lead-phone-number');
    const leadEmail = document.getElementById('lead-email');
    if (leadName  && nameVal)  leadName.value  = nameVal;
    if (leadPhone && phoneVal) leadPhone.value = phoneVal;
    if (leadEmail && emailVal) leadEmail.value = emailVal;
  });
}

/* ════════════════════════════════════════════════════════════
   SCROLL REVEAL
════════════════════════════════════════════════════════════ */
function initScrollReveal() {
  const els = document.querySelectorAll('.reveal');
  if (!els.length) return;
  const io = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); io.unobserve(e.target); } });
  }, { threshold: 0.1 });
  els.forEach(el => io.observe(el));
}

/* ════════════════════════════════════════════════════════════
   BOOT
════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  initNav();
  initContactForm();
  initScrollReveal();

  /* Pre-warm Firebase + invisible reCAPTCHA so they're ready when the
     user opens the lead modal. FirebaseOTP.init() is idempotent. */
  FirebaseOTP.init().catch(e => console.warn('[Boot] FirebaseOTP pre-init warning:', e));
  /* window._wishlistReady is already running as an IIFE — no call needed here */

  if (document.getElementById('conversation-section')) {
    try {
      const res  = await fetch(`${API}/api/properties/meta`);
      const data = await res.json();
      if (data.success) META = { localities: data.localities, amenities: data.amenities };
    } catch {
      META = {
        localities: ['Gachibowli','HITEC City','Madhapur','Kondapur','Kokapet','Narsingi','Financial District','Puppalaguda','Nanakramguda','Raidurg','Manikonda','Khajaguda','Miyapur','Hafeezpet','Chandanagar','Lingampally','Tellapur','Osman Nagar','Kollur','Velimela','Patancheru','Bachupally','Nizampet','Pragathi Nagar','Kukatpally','Kothaguda','Serilingampally','Jubilee Hills','Banjara Hills','Somajiguda','Ameerpet','Punjagutta','Khairatabad','Begumpet','Himayatnagar','Basheerbagh','Abids','Koti','Nampally','Lakdikapul','Masab Tank','Film Nagar','Yousufguda','Srinagar Colony','Erragadda','Sanath Nagar','SR Nagar','Panjagutta','Uppal','Nagole','LB Nagar','Nacharam','Pocharam','Boduppal','Peerzadiguda','Medipally','Ghatkesar','Ramanthapur','Habsiguda','Tarnaka','Kothapet','Dilsukhnagar','Chaitanyapuri','Moosarambagh','Hayathnagar','Chengicherla','Attapur','Rajendra Nagar','Bandlaguda Jagir','Sun City','Shamshabad','Adibatla','Maheshwaram','Tukkuguda','Kismatpur','Moinabad','Himayat Sagar','Shadnagar','Kothur','Falaknuma','Chandrayangutta','Barkas','Upparpally','Kompally','Suchitra','Jeedimetla','Quthbullapur','Suraram','Alwal','Dulapally','Pet Basheerabad','Balanagar','Bowenpally','Bahadurpally','Gundlapochampally','Medchal','Kandlakoya','Malkajgiri','Sainikpuri','AS Rao Nagar','ECIL','Kapra','Trimulgherry','West Marredpally','East Marredpally','Karkhana','Bolarum','Rasoolpura','Paradise','Secunderabad','Padmarao Nagar','Sitaphalmandi','Tarnaka','Shankarpally','Nallagandla'],
        amenities:  ['24/7 Security','Children Play Area','Clubhouse','Covered Parking','Gym','Jogging Track','Landscaped Garden','Parking','Power Backup','Swimming Pool']
      };
    }
    initConversation();
  }
});