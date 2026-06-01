/* ============================================================
   LUXE ESTATES — listings.js
   Fetches properties from /api/properties with:
   ▸ Filters: type, bhk, status, badge, locality, budget, q
   ▸ Sort: price-asc | price-desc | area-desc | newest
   ▸ Pagination: server-side, 9 per page
   ▸ Grid / List view toggle
   ▸ Property cards are clickable — navigate to property.html?id=:id
   No hardcoded property data.
   ============================================================ */

/* window.wishlist is defined in main.js (loaded first on every page) */

(function () {
  'use strict';

  function bhkLabel(p) {
    if (p.configurations && p.configurations.length) {
      const vals = [...new Set(p.configurations.map(c => c.bhk).filter(Boolean))].sort((a,b)=>a-b);
      if (vals.length) return vals.join(', ') + ' BHK';
    }
    return (p.bhk || '—') + ' BHK';
  }

  const API       = window.location.origin;
  const PER_PAGE  = 9;

  /* ── State ── */
  let currentPage      = 1;
  let currentView      = 'grid';
  let activeStatus     = 'all';   // all | sale | underconstruction
  let activeBadge      = 'all';   // all | new | featured | premium
  let isLoading        = false;
  let isWishlistView   = false;   // true when "My Wishlist" tab is active

  /* ── DOM refs — assigned after DOMContentLoaded ── */
  let grid, emptyState, resultCount, paginationEl;
  let searchInput, filterType, filterBhk, filterBudget, filterSort, filterLocality;

  /* ── Read URL params on first load ── */
  function getParams() {
    const p = new URLSearchParams(location.search);
    return {
      q:        p.get('q')        || '',
      type:     p.get('type')     || '',
      locality: p.get('locality') || '',
      status:   p.get('status')   || '',   // for-sale / underconstruction
      badge:    p.get('badge')    || ''    // new / featured / premium
    };
  }

  /* ── Build query string from current UI state ── */
  function buildQuery() {
    const q        = searchInput.value.trim();
    const type     = filterType.value;
    const bhk      = filterBhk.value;
    const budget   = filterBudget.value;
    const sort     = filterSort.value || 'newest';
    const locality = filterLocality ? filterLocality.value : '';

    const params = new URLSearchParams();
    params.set('page',  currentPage);
    params.set('limit', PER_PAGE);
    params.set('sort',  sort);

    if (type) params.set('type', type);
    if (bhk)  params.set('bhk',  bhk);

    /* Locality / zone filter */
    if (locality && locality.indexOf('zone:') === 0) {
      /* Zone selected — send localities as OR-regex in q against the locality field.
         The server does: new RegExp(q, 'i') on locality, so "Gachibowli|Kondapur|..."
         correctly matches any property whose locality is in that zone. */
      const zoneKey  = locality.replace('zone:', '');
      const zoneLocs = (window._ZONE_LOCALITIES || {})[zoneKey] || [];
      /* Anchor each name so "Uppal" doesn't match "Uppal Kalan" etc */
      const zoneQ = zoneLocs.map(function(l){ return '^' + l + '$'; }).join('|');
      if (zoneQ) params.set('q', zoneQ);
      else if (q) params.set('q', q);
    } else {
      if (q)        params.set('q',        q);
      if (locality) params.set('locality', locality);
    }

    /* Status filter (sale / underconstruction) — sent as 'status' to API */
    if (activeStatus !== 'all') params.set('status', activeStatus);

    /* Badge filter (new / featured / premium) — sent as 'badge' to API */
    if (activeBadge !== 'all') params.set('badge', activeBadge);

    if (budget) {
      const parts = budget.split('-');
      params.set('minPrice', parts[0]);
      params.set('maxPrice', parts[1]);
    }

    return params;
  }

  /* ── Fetch & render ── */
  async function loadProperties() {
    if (isLoading) return;

    /* ── Wishlist view: render locally, no API call ── */
    if (isWishlistView) {
      renderWishlistView();
      return;
    }

    isLoading = true;
    showSkeleton();

    try {
      const res  = await fetch(`${API}/api/properties?${buildQuery()}`);
      const data = await res.json();

      if (!data.success) throw new Error(data.error);

      render(data.properties, data.pagination);
    } catch (err) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem 1rem;color:var(--text-muted)">
        <div style="font-size:2rem;margin-bottom:1rem">⚠️</div>
        <p>Could not load properties. Is the server running?</p>
        <p style="font-size:0.78rem;margin-top:0.5rem">${err.message}</p>
      </div>`;
      paginationEl.innerHTML = '';
      resultCount.textContent = '';
    } finally {
      isLoading = false;
    }
  }

  /* ── Wishlist-only render (from localStorage, no API) ── */
  function renderWishlistView() {
    const props = (typeof wishlist !== 'undefined') ? wishlist.getAll() : [];
    resultCount.textContent = `${props.length} saved propert${props.length === 1 ? 'y' : 'ies'}`;
    emptyState.style.display = 'none';
    paginationEl.innerHTML   = '';

    if (!props.length) {
      grid.innerHTML = '';
      emptyState.style.display = 'block';
      /* customise the empty-state message for wishlist */
      const h = document.querySelector('#empty-state h3');
      const p = document.querySelector('#empty-state p');
      if (h) h.textContent = 'Your wishlist is empty';
      if (p) p.textContent = 'Tap the ♡ on any property to save it here.';
      return;
    }

    if (currentView === 'list') {
      grid.style.gridTemplateColumns = '1fr';
      grid.innerHTML = props.map(renderListCard).join('');
    } else {
      grid.style.gridTemplateColumns = '';
      grid.innerHTML = props.map(p => renderGridCard(p)).join('');
    }
  }

  /* ── Render cards ── */
  function render(properties, pagination) {
    /* Result count */
    resultCount.textContent = `Showing ${pagination.total} propert${pagination.total === 1 ? 'y' : 'ies'}`;

    emptyState.style.display = 'none';

    if (!properties.length) {
      grid.innerHTML = '';
      emptyState.style.display = 'block';
      paginationEl.innerHTML   = '';
      return;
    }

    if (currentView === 'list') {
      grid.style.gridTemplateColumns = '1fr';
      grid.innerHTML = properties.map(renderListCard).join('');
    } else {
      grid.style.gridTemplateColumns = '';
      grid.innerHTML = properties.map(p => renderGridCard(p)).join('');
    }

    renderPagination(pagination);
  }

  /* ── Badge label helper ── */
  function getBadgeLabel(p) {
    if (p.status === 'underconstruction') return 'Under Construction';
    if (p.badge === 'new')               return 'New Launch';
    if (p.badge === 'featured')          return 'Featured';
    if (p.badge === 'premium')           return 'Premium';
    return 'For Sale';
  }

  function getBadgeClass(p) {
    if (p.status === 'underconstruction') return 'badge-underconstruction';
    if (p.badge)                          return `badge-${p.badge}`;
    return 'badge-sale';
  }

  /* ── Grid-view card (clickable — navigates to property detail page) ── */
  function renderGridCard(p) {
    const badgeLabel = getBadgeLabel(p);
    const badgeClass = getBadgeClass(p);
    const propId = p._id || p.id;
    const isSaved = (typeof wishlist !== 'undefined') && wishlist.has(propId);
    const cfgs = p.configurations && p.configurations.length ? p.configurations : null;
    const areaDisplay = cfgs
      ? (() => { const mn = Math.min(...cfgs.map(c => c.areaMin)); const mx = Math.max(...cfgs.map(c => c.areaMax)); return (mn === mx ? mn.toLocaleString() : mn.toLocaleString() + '–' + mx.toLocaleString()) + ' sq.ft'; })()
      : (p.area || 0).toLocaleString() + ' sq.ft';

    const amenitiesHtml = (p.amenities && p.amenities.length)
      ? `<div class="card-amenities">
          ${p.amenities.slice(0, 3).map(a => `<span class="amenity-tag">${a}</span>`).join('')}
        </div>`
      : '';

    return `
    <div class="property-card" style="cursor:pointer;position:relative" data-id="${propId}" data-href="property.html?id=${propId}"
         onclick="if(event.target.closest('.wishlist-heart'))return;window.location.href='property.html?id=${propId}'"
         onmouseenter="this.style.transform='translateY(-4px)';this.style.boxShadow='0 12px 40px rgba(0,0,0,0.5)'"
         onmouseleave="this.style.transform='';this.style.boxShadow=''"
         role="link" tabindex="0" aria-label="View ${p.title}"
         onkeydown="if(event.key==='Enter'||event.key===' ')window.location.href='property.html?id=${propId}'"
         style="cursor:pointer;transition:transform 0.22s ease,box-shadow 0.22s ease">
      <div class="card-image">
        <img src="${p.img}" alt="${p.title}" loading="lazy">
        <span class="card-badge ${badgeClass}">${badgeLabel}</span>
        <button class="wishlist-heart ${isSaved ? 'saved' : ''}"
          data-id="${propId}"
          data-prop="${JSON.stringify(p).replace(/"/g, '&quot;')}"
          aria-label="${isSaved ? 'Remove from wishlist' : 'Save to wishlist'}"
          onclick="event.stopPropagation();event.stopImmediatePropagation();toggleWishlist(this,'${propId}',JSON.parse(this.dataset.prop))">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${isSaved ? '#c9a96e' : 'none'}" stroke="${isSaved ? '#c9a96e' : 'currentColor'}" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
      <div class="card-body">
        <div class="card-price">${p.price}</div>
        <div class="card-title">${p.title}</div>
        <div class="card-location">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 21c-4-4-7-7.75-7-11a7 7 0 0 1 14 0c0 3.25-3 7-7 11z"/>
            <circle cx="12" cy="10" r="2"/>
          </svg>
          ${p.locality}, ${p.city}
        </div>
        <div class="card-meta">
          <div class="card-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            </svg>
            ${bhkLabel(p)}
          </div>
          <div class="card-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="7" width="20" height="14" rx="2"/>
              <path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2"/>
            </svg>
            ${p.baths} Bath
          </div>
          <div class="card-meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
            </svg>
            ${areaDisplay}
          </div>
        </div>
        ${amenitiesHtml}
      </div>
    </div>`;
  }

  /* ── List-view card (clickable — navigates to property detail page) ── */
  function renderListCard(p) {
    const badgeLabel = getBadgeLabel(p);
    const badgeClass = getBadgeClass(p);
    const propId = p._id || p.id;
    const isSaved = (typeof wishlist !== 'undefined') && wishlist.has(propId);
    const cfgs = p.configurations && p.configurations.length ? p.configurations : null;
    const areaDisplay = cfgs
      ? (() => { const mn = Math.min(...cfgs.map(c => c.areaMin)); const mx = Math.max(...cfgs.map(c => c.areaMax)); return (mn === mx ? mn.toLocaleString() : mn.toLocaleString() + '–' + mx.toLocaleString()) + ' sq.ft'; })()
      : (p.area || 0).toLocaleString() + ' sq.ft';

    return `
    <div class="property-card"
         style="display:grid;grid-template-columns:260px 1fr;min-height:160px;cursor:pointer;transition:transform 0.22s ease,box-shadow 0.22s ease;position:relative"
         data-id="${propId}"
         data-href="property.html?id=${propId}"
          onclick="if(event.target.closest('.wishlist-heart'))return;window.location.href='property.html?id=${propId}'"
         onmouseenter="this.style.transform='translateY(-3px)';this.style.boxShadow='0 10px 32px rgba(0,0,0,0.45)'"
         onmouseleave="this.style.transform='';this.style.boxShadow=''"
         role="link" tabindex="0" aria-label="View ${p.title}"
         onkeydown="if(event.key==='Enter'||event.key===' ')window.location.href='property.html?id=${propId}'">
      <div class="card-image" style="height:160px">
        <img src="${p.img}" alt="${p.title}" loading="lazy" style="height:100%;object-fit:cover">
        <span class="card-badge ${badgeClass}">${badgeLabel}</span>
        <button class="wishlist-heart ${isSaved ? 'saved' : ''}"
          data-id="${propId}"
          data-prop="${JSON.stringify(p).replace(/"/g, '&quot;')}"
          aria-label="${isSaved ? 'Remove from wishlist' : 'Save to wishlist'}"
          onclick="event.stopPropagation();event.stopImmediatePropagation();toggleWishlist(this,'${propId}',JSON.parse(this.dataset.prop))">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${isSaved ? '#c9a96e' : 'none'}" stroke="${isSaved ? '#c9a96e' : 'currentColor'}" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </button>
      </div>
      <div class="card-body" style="display:flex;flex-direction:column;justify-content:space-between">
        <div>
          <div class="card-price">${p.price}</div>
          <div class="card-title" style="white-space:normal">${p.title}</div>
          <div class="card-location">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 21c-4-4-7-7.75-7-11a7 7 0 0 1 14 0c0 3.25-3 7-7 11z"/>
              <circle cx="12" cy="10" r="2"/>
            </svg>
            ${p.locality}, ${p.city}
          </div>
        </div>
        <div class="card-meta">
          <div class="card-meta-item">${bhkLabel(p)}</div>
          <div class="card-meta-item">${p.baths} Bath</div>
          <div class="card-meta-item">${areaDisplay}</div>
        </div>
      </div>
    </div>`;
  }

  /* ── Skeleton loader ── */
  function showSkeleton() {
    const skeletons = Array(PER_PAGE).fill(0).map(() => `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);overflow:hidden;animation:shimmer 1.4s infinite">
        <div style="height:200px;background:rgba(255,255,255,0.04)"></div>
        <div style="padding:1.25rem">
          <div style="height:0.9rem;background:rgba(255,255,255,0.06);border-radius:4px;margin-bottom:0.6rem;width:40%"></div>
          <div style="height:1.1rem;background:rgba(255,255,255,0.06);border-radius:4px;margin-bottom:0.4rem;width:75%"></div>
          <div style="height:0.8rem;background:rgba(255,255,255,0.04);border-radius:4px;width:55%"></div>
        </div>
      </div>`).join('');

    grid.style.gridTemplateColumns = '';
    grid.innerHTML = skeletons;
  }

  /* ── Pagination ── */
  function renderPagination(p) {
    if (p.totalPages <= 1) { paginationEl.innerHTML = ''; return; }

    const btns = [];

    btns.push(`<button class="page-btn ${!p.hasPrev ? 'disabled' : ''}"
      onclick="goToPage(${p.page - 1})" ${!p.hasPrev ? 'disabled' : ''}>
      ‹ Prev
    </button>`);

    const range = buildPageRange(p.page, p.totalPages);
    range.forEach(n => {
      if (n === '…') {
        btns.push(`<span class="page-ellipsis">…</span>`);
      } else {
        btns.push(`<button class="page-btn ${n === p.page ? 'active' : ''}" onclick="goToPage(${n})">${n}</button>`);
      }
    });

    btns.push(`<button class="page-btn ${!p.hasNext ? 'disabled' : ''}"
      onclick="goToPage(${p.page + 1})" ${!p.hasNext ? 'disabled' : ''}>
      Next ›
    </button>`);

    paginationEl.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;gap:0.4rem;flex-wrap:wrap;margin-top:3rem">
        ${btns.join('')}
      </div>
      <p style="text-align:center;font-size:0.75rem;color:var(--text-muted);margin-top:0.75rem">
        Page ${p.page} of ${p.totalPages} · ${p.total} properties
      </p>`;
  }

  function buildPageRange(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const range = [1];
    if (current > 3) range.push('…');
    for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) range.push(i);
    if (current < total - 2) range.push('…');
    range.push(total);
    return range;
  }

  window.goToPage = function (n) {
    currentPage = n;
    loadProperties();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  /* ── Wishlist heart toggle (called from inline onclick) ── */
  window.toggleWishlist = function (btn, id, propObj) {
    /* propObj comes from JSON.parse(this.dataset.prop) — already a plain object */
    const added = wishlist.toggle(id, propObj);
    const svg   = btn.querySelector('svg');

    if (added) {
      btn.classList.add('saved');
      svg.setAttribute('fill', '#c9a96e');
      svg.setAttribute('stroke', '#c9a96e');
      btn.setAttribute('aria-label', 'Remove from wishlist');
      if (typeof showToast !== 'undefined') showToast('Saved to wishlist ♡', '♡');
    } else {
      btn.classList.remove('saved');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      btn.setAttribute('aria-label', 'Save to wishlist');
      if (typeof showToast !== 'undefined') showToast('Removed from wishlist', '✕');
      /* If in wishlist view, remove the card from grid immediately */
      if (isWishlistView) {
        const card = btn.closest('.property-card');
        if (card) {
          card.style.transition = 'opacity 0.25s,transform 0.25s';
          card.style.opacity = '0';
          card.style.transform = 'scale(0.95)';
          setTimeout(() => { card.remove(); renderWishlistView(); }, 260);
        }
      }
    }

    /* ── Sync to DB (fire-and-forget — localStorage is source of truth) ── */
    const userId = localStorage.getItem('stellar_user_id');
    if (userId) {
      const action = added ? 'add' : 'remove';
      fetch(`${API}/api/wishlist/${userId}/${action}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ propertyId: id })
      }).catch(() => {}); /* silent fail — won't affect UI */
    }

    /* Update count badge on the wishlist tab */
    updateWishlistBadge();
  };

  /* ── Keep wishlist count badge on the tab in sync ── */
  function updateWishlistBadge() {
    const tab = document.querySelector('[data-badge="wishlist"]');
    if (!tab) return;
    const count = (typeof wishlist !== 'undefined') ? wishlist.get().length : 0;
    const badge = tab.querySelector('.wl-count');
    if (badge) badge.textContent = count || '';
  }
  /* Expose so main.js can call it after post-OTP wishlist sync */
  window.updateWishlistBadge = updateWishlistBadge;

  /* ── Filter change ── */
  function onFilterChange() {
    currentPage = 1;
    loadProperties();
  }

  /* ── Clear all filters ── */
  window.clearFilters = function () {
    searchInput.value  = '';
    filterType.value   = '';
    filterBhk.value    = '';
    filterBudget.value = '';
    filterSort.value   = 'newest';
    if (filterLocality) filterLocality.value = '';
    if (typeof window._resetLocalityDropdown === 'function') window._resetLocalityDropdown();
    activeStatus       = 'all';
    activeBadge        = 'all';
    isWishlistView     = false;
    currentPage        = 1;
    document.querySelectorAll('[data-badge]').forEach(t =>
      t.classList.toggle('active', t.dataset.badge === 'all'));
    history.replaceState({}, '', 'listings.html');
    loadProperties();
  };

  /* ── Update active tag highlights ── */
  function updateTagHighlight() {
    document.querySelectorAll('[data-badge]').forEach(t => {
      const val = t.dataset.badge;
      if (val === 'wishlist') { t.classList.remove('active'); return; }
      let isActive = false;
      if (val === 'all')               isActive = activeStatus === 'all' && activeBadge === 'all';
      else if (val === 'sale')         isActive = activeStatus === 'sale';
      else if (val === 'underconstruction') isActive = activeStatus === 'underconstruction';
      else                             isActive = activeBadge === val;
      t.classList.toggle('active', isActive);
    });
  }

  /* ── Init ── */
  document.addEventListener('DOMContentLoaded', () => {
    grid         = document.getElementById('listings-grid');
    emptyState   = document.getElementById('empty-state');
    resultCount  = document.getElementById('result-count');
    paginationEl = document.getElementById('pagination');
    searchInput  = document.getElementById('search-input');
    filterType   = document.getElementById('filter-type');
    filterBhk    = document.getElementById('filter-bhk');
    filterBudget = document.getElementById('filter-budget');
    filterSort   = document.getElementById('filter-sort');
    filterLocality = document.getElementById('filter-locality');

    if (!grid) return; /* Not on listings page */

    /* Apply URL params */
    const params = getParams();
    if (params.q)        searchInput.value = params.q;
    if (params.type)     filterType.value  = params.type;
    if (params.locality && filterLocality) filterLocality.value = params.locality;

    /* Handle ?status= param (from footer links like "For Sale", "Under Construction") */
    if (params.status) {
      activeStatus = params.status;
      activeBadge  = 'all';
      updateTagHighlight();
    }

    /* Handle ?badge= param (from footer links like "New Launches") */
    if (params.badge) {
      activeBadge  = params.badge;
      activeStatus = 'all';
      updateTagHighlight();
    }

    /* Default highlight if nothing set */
    if (!params.status && !params.badge) {
      updateTagHighlight();
    }

    /* Event listeners */
    let searchTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(onFilterChange, 350);
    });

    [filterType, filterBhk, filterBudget, filterSort].forEach(el =>
      el.addEventListener('change', onFilterChange));
    if (filterLocality) filterLocality.addEventListener('change', onFilterChange);

    /* Badge / Status filter tag clicks */
    document.querySelectorAll('[data-badge]').forEach(tag =>
      tag.addEventListener('click', function () {
        const val = this.dataset.badge;

        /* ── Wishlist tab ── */
        if (val === 'wishlist') {
          isWishlistView = true;
          activeStatus   = 'all';
          activeBadge    = 'all';
          document.querySelectorAll('[data-badge]').forEach(t =>
            t.classList.toggle('active', t.dataset.badge === 'wishlist'));
          currentPage = 1;
          loadProperties();
          return;
        }

        /* ── Normal filter tabs ── */
        isWishlistView = false;
        activeStatus = 'all';
        activeBadge  = 'all';

        if (val === 'sale')               activeStatus = 'sale';
        else if (val === 'underconstruction') activeStatus = 'underconstruction';
        else if (val !== 'all')           activeBadge  = val;

        updateTagHighlight();
        onFilterChange();
      })
    );

    /* View toggle */
    document.querySelectorAll('.view-btn').forEach(btn =>
      btn.addEventListener('click', function () {
        currentView = this.dataset.view;
        document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        loadProperties();
      })
    );

    /* Initial load — wait for the server wishlist merge to finish first so
       that heart states are correct on the very first render.
       window._wishlistReady is the Promise set by loadServerWishlist() in
       main.js; it resolves immediately when there is no logged-in user. */
    (window._wishlistReady || Promise.resolve()).finally(() => {
      loadProperties();
      updateWishlistBadge();
    });
  });
})();