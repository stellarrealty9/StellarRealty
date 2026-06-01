/* ============================================================
   STELLAR REALTY — property.js
   Renders the full property detail page into #prop-root.
   Features: multi-image gallery, floor plans, Google Map,
             brochure download, EMI calculator.
   ============================================================ */

(function () {
  'use strict';

  const API  = "https://luxe-estates-ztev.onrender.com";
  const root = document.getElementById('prop-root');

  const AMENITY_ICONS = {
    'Swimming Pool':'🏊','Gym':'🏋️','Clubhouse':'🏛️','Covered Parking':'🚗',
    'Parking':'🚗','Private Parking':'🚗','24/7 Security':'🔒','Security':'🔒',
    'Landscaped Garden':'🌿','Private Garden':'🌿','Organic Garden':'🌿',
    'Children Play Area':'🛝','Power Backup':'⚡','Jogging Track':'🏃',
    'Home Theatre':'🎬','Smart Home':'🏠','Concierge Service':'🛎️','Concierge':'🛎️',
    'Private Pool':'🏊','Private Terrace':'🌇','Open Terrace':'🌇',
    'Private Farm':'🌾','Borewell':'💧','Gated Community':'🔐','Rooftop':'🌇',
    'EV Charging':'🔌','Co-working Space':'💻','Amphitheatre':'🎭',
    'Sky Lounge':'🌆','Meditation Garden':'🧘','Squash Court':'🎾',
    'Indoor Games':'🎮','Pet Park':'🐾','Senior Citizen Zone':'👴',
    'Yoga Deck':'🧘','Infinity Pool':'🏊','Helipad':'🚁','Private Lift':'🛗',
  };
  const amenityIcon = n => AMENITY_ICONS[n] || '✦';

  function getBadgeLabel(p) {
    if (p.status === 'underconstruction') return 'Under Construction';
    const m = { new:'New Launch', featured:'Featured', premium:'Premium' };
    return p.badge ? m[p.badge] : 'For Sale';
  }
  function getBadgeClass(p) {
    if (p.status === 'underconstruction') return 'badge-underconstruction';
    return p.badge ? 'badge-'+p.badge : 'badge-sale';
  }

  function esc(s) {
    return String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  /* ── Google Drive image URL rewriter ──
     Converts any Drive sharing/view URL to the thumbnail API endpoint
     which renders correctly as <img src> on all devices including mobile.
     Non-Drive URLs are returned unchanged.                              */
  function rewriteDriveImageUrl(url) {
    if (!url || !url.includes('drive.google.com')) return url;
    // https://drive.google.com/file/d/FILE_ID/...
    const fileMatch = url.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/);
    if (fileMatch) return `https://drive.google.com/thumbnail?id=${fileMatch[1]}&sz=w1200`;
    // https://drive.google.com/open?id=FILE_ID
    const openMatch = url.match(/drive\.google\.com\/open\?(?:[^&]*&)*id=([A-Za-z0-9_-]+)/);
    if (openMatch) return `https://drive.google.com/thumbnail?id=${openMatch[1]}&sz=w1200`;
    // https://drive.google.com/uc?export=view&id=FILE_ID
    const ucMatch = url.match(/drive\.google\.com\/uc\?(?:[^&]*&)*id=([A-Za-z0-9_-]+)/);
    if (ucMatch) return `https://drive.google.com/thumbnail?id=${ucMatch[1]}&sz=w1200`;
    return url;
  }

  /* ── Facing direction extracted from amenities ── */
  const FACING_LABELS = {
    'north':'North Facing','south':'South Facing','east':'East Facing','west':'West Facing',
    'north-east':'North-East Facing','north-west':'North-West Facing',
    'south-east':'South-East Facing','south-west':'South-West Facing',
  };
  function getFacing(amenities) {
    if (!amenities || !amenities.length) return null;
    // Strict pattern: the ENTIRE amenity string must be a direction phrase,
    // optionally followed by "facing" — nothing else.
    // e.g. "North Facing", "East-Facing", "North-West", "South West Facing"
    // Rejects: "North east side of the city", "Near East Gate", etc.
    const STRICT = /^(north[\s-]?east|north[\s-]?west|south[\s-]?east|south[\s-]?west|north|south|east|west)[\s-]?(facing)?$/i;
    for (const a of amenities) {
      const m = a.trim().match(STRICT);
      if (m) {
        const k = m[1].toLowerCase().replace(/\s+/g, '-');
        return { label: a, text: FACING_LABELS[k] || (k.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) + ' Facing'), key: k };
      }
    }
    return null;
  }

  /* ── Skeleton ── */
  function renderSkeleton() {
    root.innerHTML = `
      <div style="height:clamp(320px,55vw,580px);background:var(--bg-card);animation:shimmer 1.4s infinite"></div>
      <div class="container" style="padding-top:2.5rem">
        <div class="skel" style="height:14px;width:160px;margin-bottom:2rem"></div>
        <div class="prop-layout">
          <div>
            <div class="skel" style="height:28px;width:60%;margin-bottom:1rem"></div>
            <div class="skel" style="height:14px;width:40%;margin-bottom:2rem"></div>
            <div class="prop-stats">
              ${[1,2,3,4].map(()=>`<div class="prop-stat"><div class="skel" style="height:30px;margin-bottom:.5rem"></div><div class="skel" style="height:10px;width:60%;margin:0 auto"></div></div>`).join('')}
            </div>
            <div class="prop-block"><div class="skel" style="height:12px;width:30%;margin-bottom:1.5rem"></div><div class="skel" style="height:14px;margin-bottom:.75rem"></div><div class="skel" style="height:14px;width:80%"></div></div>
          </div>
          <div><div class="enquiry-card"><div style="padding:2rem"><div class="skel" style="height:200px"></div></div></div></div>
        </div>
      </div>`;
  }

  /* ── Error ── */
  function renderError(msg) {
    root.innerHTML = `
      <div class="container"><div class="prop-error">
        <div style="font-size:3rem;margin-bottom:1rem">🏚️</div>
        <h2 style="font-family:var(--font-body);font-weight:400;margin-bottom:0.75rem">Property Not Found</h2>
        <p style="color:var(--text-muted);margin-bottom:2rem">${msg||'This property may have been removed.'}</p>
        <a href="listings.html" class="btn btn-gold">Browse All Properties</a>
      </div></div>`;
  }

  /* ════════════════════════════════════════════
     HERO GALLERY
  ════════════════════════════════════════════ */
  function buildGallery(p) {
    let slides = [];
    if (p.images && p.images.length) {
      slides = [...p.images];
      if (p.img && !slides.includes(p.img)) slides.unshift(p.img);
    } else {
      slides = [p.img];
    }
    slides = slides.filter(Boolean);
    if (!slides.length) slides = [p.img];
    slides = slides.map(rewriteDriveImageUrl);

    const multi = slides.length > 1;

    const slidesHTML = slides.map((src,i) => `
      <div class="gallery-slide">
        <img src="${esc(src)}" alt="${esc(p.title)} photo ${i+1}" loading="${i===0?'eager':'lazy'}">
        <div class="gallery-overlay"></div>
      </div>`).join('');

    return `
      <div class="gallery-wrap" id="gallery-root">
        <div class="gallery-track" id="gal-track">${slidesHTML}</div>
        ${multi?`
        <button class="gallery-arrow prev" id="gal-prev" aria-label="Previous">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
        <button class="gallery-arrow next" id="gal-next" aria-label="Next">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 18l6-6-6-6"/></svg>
        </button>
        <div class="gallery-dots">${slides.map((_,i)=>`<button class="gallery-dot${i===0?' active':''}" data-idx="${i}" aria-label="Slide ${i+1}"></button>`).join('')}</div>
        <div class="gallery-counter" id="gal-counter">1 / ${slides.length}</div>`:''}
      </div>`;
  }

  /* ════════════════════════════════════════════
     FLOOR PLAN
  ════════════════════════════════════════════ */
  function buildFloorPlan(p) {
    const plans = (p.floorPlanImages||[]).filter(Boolean).map(rewriteDriveImageUrl);
    if (!plans.length) return '';
    const multi = plans.length > 1;
    return `
      <div class="prop-block">
        <div class="prop-block-title">Floor Plan</div>
        ${multi?`<div class="fp-tabs">${plans.map((_,i)=>`<button class="fp-tab${i===0?' active':''}" data-fp="${i}">Plan ${i+1}</button>`).join('')}</div>`:''}
        <div class="fp-viewer"><img id="fp-img" src="${esc(plans[0])}" alt="Floor plan 1"></div>
        ${multi?`
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:0.75rem;font-size:0.78rem;color:var(--text-muted)">
          <span id="fp-label">Plan 1 of ${plans.length}</span>
          <div style="display:flex;gap:0.5rem">
            <button id="fp-prev" style="padding:0.3rem 0.75rem;border:1px solid var(--border);border-radius:100px;background:none;color:var(--text-muted);cursor:pointer;font-size:0.78rem">← Prev</button>
            <button id="fp-next" style="padding:0.3rem 0.75rem;border:1px solid var(--border);border-radius:100px;background:none;color:var(--text-muted);cursor:pointer;font-size:0.78rem">Next →</button>
          </div>
        </div>`:''}
      </div>`;
  }

  /* ════════════════════════════════════════════
     LOCATION MAP
  ════════════════════════════════════════════ */
  function buildLocationMap(p) {
    const lat = p.locationLat, lng = p.locationLng;
    const hasCoords = lat != null && lng != null;
    const address   = (p.locality||'') + ', ' + (p.city||'Hyderabad') + ', India';
    const query     = hasCoords ? lat+','+lng : encodeURIComponent(address);
    const mapsLink  = hasCoords
      ? `https://www.google.com/maps?q=${lat},${lng}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;

    return `
      <div class="prop-block">
        <div class="prop-block-title">Location</div>
        <div class="location-map-wrap">
          <iframe src="https://maps.google.com/maps?q=${query}&z=15&output=embed"
            allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"
            title="Property location"></iframe>
        </div>
        <div class="map-footer">
          <div class="map-address">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            ${esc(p.locality)}, ${esc(p.city)}${hasCoords?` (${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)})`:''}
          </div>
          <a href="${mapsLink}" target="_blank" rel="noopener" class="map-open-link">Open in Google Maps ↗</a>
        </div>
      </div>`;
  }

  /* ════════════════════════════════════════════
     ZONE MAP — locality → compass zone
     Used by the "View similar properties" link
     to filter listings by zone rather than a
     single locality (wider, more useful results).
  ════════════════════════════════════════════ */
  const LOCALITY_ZONE = {
    // West
    'Gachibowli':        { zone: 'west',    label: 'West Hyderabad' },
    'Kondapur':          { zone: 'west',    label: 'West Hyderabad' },
    'Nallagandla':       { zone: 'west',    label: 'West Hyderabad' },
    'Manikonda':         { zone: 'west',    label: 'West Hyderabad' },
    'Kokapet':           { zone: 'west',    label: 'West Hyderabad' },
    'Puppalaguda':       { zone: 'west',    label: 'West Hyderabad' },
    'Financial District':{ zone: 'west',    label: 'West Hyderabad' },
    'Nanakramguda':      { zone: 'west',    label: 'West Hyderabad' },
    // North
    'Miyapur':           { zone: 'north',   label: 'North Hyderabad' },
    'Bachupally':        { zone: 'north',   label: 'North Hyderabad' },
    'Nizampet':          { zone: 'north',   label: 'North Hyderabad' },
    'Kompally':          { zone: 'north',   label: 'North Hyderabad' },
    'Medchal':           { zone: 'north',   label: 'North Hyderabad' },
    // South
    'Shankarpally':      { zone: 'south',   label: 'South Hyderabad' },
    'Rajendranagar':     { zone: 'south',   label: 'South Hyderabad' },
    'Shamshabad':        { zone: 'south',   label: 'South Hyderabad' },
    'Attapur':           { zone: 'south',   label: 'South Hyderabad' },
    // Central / East
    'Banjara Hills':     { zone: 'central', label: 'Central Hyderabad' },
    'Jubilee Hills':     { zone: 'central', label: 'Central Hyderabad' },
    'Somajiguda':        { zone: 'central', label: 'Central Hyderabad' },
    'Begumpet':          { zone: 'central', label: 'Central Hyderabad' },
    'Himayatnagar':      { zone: 'central', label: 'Central Hyderabad' },
    'Secunderabad':      { zone: 'east',    label: 'East Hyderabad'    },
    'Uppal':             { zone: 'east',    label: 'East Hyderabad'    },
    'LB Nagar':          { zone: 'east',    label: 'East Hyderabad'    },
  };

  /* Localities that belong to the same zone as the given locality */
  function zoneLocalities(locality) {
    const entry = LOCALITY_ZONE[locality];
    if (!entry) return [];
    return Object.entries(LOCALITY_ZONE)
      .filter(([, v]) => v.zone === entry.zone)
      .map(([k]) => k);
  }

  /* Friendly plural for property type */
  function typePlural(type) {
    const map = {
      apartment: 'Apartments', villa: 'Villas', penthouse: 'Penthouses',
      plot: 'Plots', farmhouse: 'Farmhouses'
    };
    return map[type] || (type.charAt(0).toUpperCase() + type.slice(1) + 's');
  }

  /* Build the "View similar …" link with zone-aware locality filter */
  function buildSimilarLink(p) {
    const zoneInfo  = LOCALITY_ZONE[p.locality];
    const zoneLabel = zoneInfo ? zoneInfo.label : p.locality;

    // Pass zone: prefix so listings.js expands it to all localities in the zone.
    // Falls back to exact locality if the locality isn't mapped to a zone.
    const url = new URL('listings.html', location.href);
    url.searchParams.set('type', p.type);
    if (zoneInfo) {
      url.searchParams.set('locality', 'zone:' + zoneInfo.zone);
    } else {
      url.searchParams.set('locality', p.locality);
    }

    const typeLabel = typePlural(p.type);
    const areaLabel = zoneInfo ? `in ${zoneLabel}` : `in ${esc(p.locality)}`;

    return `<a href="${url.pathname}${url.search}"
               style="font-size:0.82rem;color:var(--text-muted);text-decoration:none;transition:color 0.2s"
               onmouseover="this.style.color='var(--gold)'" onmouseout="this.style.color='var(--text-muted)'">
               View similar ${typeLabel} ${areaLabel} →
             </a>`;
  }

  /* ════════════════════════════════════════════
     MULTI-CONFIG HELPERS
  ════════════════════════════════════════════ */
  function fmtINR(n) {
    if (!n) return '—';
    return n >= 1e7
      ? '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr'
      : '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + 'L';
  }

  /* Deduplicate + sort a numeric array, return as "2, 3" or "2" */
  function rangeList(vals) {
    const uniq = [...new Set(vals.filter(Boolean))].sort((a, b) => a - b);
    return uniq.join(', ') || '—';
  }

  /* Build stats HTML — shows ranges across all configs (or legacy fields) */
  function buildStatsHTML(p, _cfg, facing) {
    let bhk, baths, area;

    if (p.configurations && p.configurations.length) {
      const cfgs = p.configurations;
      bhk   = rangeList(cfgs.map(c => c.bhk));
      baths = rangeList(cfgs.map(c => c.baths));
      const aMin = Math.min(...cfgs.map(c => c.areaMin));
      const aMax = Math.max(...cfgs.map(c => c.areaMax));
      area  = aMin === aMax ? aMin.toLocaleString() : `${aMin.toLocaleString()} – ${aMax.toLocaleString()}`;
    } else {
      bhk   = p.bhk   || '—';
      baths = p.baths  || '—';
      area  = (p.area  || 0).toLocaleString();
    }

    const areaFontSize = String(area).length > 9 ? '0.85rem' : '1.1rem';

    return `
      <div class="prop-stat"><div class="prop-stat-val">${bhk}</div><div class="prop-stat-label">BHK</div></div>
      <div class="prop-stat"><div class="prop-stat-val">${baths}</div><div class="prop-stat-label">Bathrooms</div></div>
      <div class="prop-stat"><div class="prop-stat-val" style="font-size:${areaFontSize}">${area}</div><div class="prop-stat-label">Sq. Ft.</div></div>
      <div class="prop-stat"><div class="prop-stat-val" style="font-size:1.05rem;padding-top:0.3rem">${(p.constructionStatus||'').split(' ').slice(0,2).join(' ')}</div><div class="prop-stat-label">Status</div></div>
      ${facing ? `<div class="prop-stat" style="grid-column:1/-1;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:0.65rem;border-top:1px solid var(--border);padding-top:0.85rem;margin-top:0.1rem"><span style="font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;color:var(--text-muted)">Facing</span><span style="width:1px;height:12px;background:var(--border-strong)"></span><span style="font-size:0.92rem;font-weight:600;color:var(--gold-light)">${facing.text}</span></div>` : ''}
    `;
  }

  /* No config tabs — removed in favour of static range display */
  function buildConfigTabs(_p) { return ''; }

  /* Build detail table configuration rows — no per-config Price row (price shown separately) */
  function buildConfigDetailRows(p) {
    if (!p.configurations || !p.configurations.length) {
      // Legacy single-value property
      return `
        <tr><td>Configuration</td><td>${p.bhk||'—'} BHK · ${p.baths||'—'} Bathrooms</td></tr>
        <tr><td>Carpet Area</td><td>${(p.area||0).toLocaleString()} sq.ft</td></tr>
        <tr><td>Price per sq.ft</td><td>₹${p.pricePerSqft != null ? p.pricePerSqft.toLocaleString() : (p.area ? Math.round((p.priceRaw||0)/p.area).toLocaleString() : '—')}</td></tr>`;
    }

    const cfgs = p.configurations;

    // BHK range: "2, 3 BHK"
    const bhkStr   = rangeList(cfgs.map(c => c.bhk)) + ' BHK';
    // Baths range: "2, 3 Bathrooms"
    const bathsStr = rangeList(cfgs.map(c => c.baths)) + ' Bathrooms';
    // Area range
    const aMin = Math.min(...cfgs.map(c => c.areaMin));
    const aMax = Math.max(...cfgs.map(c => c.areaMax));
    const areaStr = aMin === aMax
      ? `${aMin.toLocaleString()} sq.ft`
      : `${aMin.toLocaleString()} – ${aMax.toLocaleString()} sq.ft`;
    // Price range
    const pMin = Math.min(...cfgs.map(c => c.priceMin));
    const pMax = Math.max(...cfgs.map(c => c.priceMax));
    const priceStr = pMin === pMax ? fmtINR(pMin) : `${fmtINR(pMin)} – ${fmtINR(pMax)}`;
    // Price per sqft (use DB override if available, else calculate from midpoints)
    const avgArea  = (aMin + aMax) / 2;
    const avgPrice = (pMin + pMax) / 2;
    const psfStr   = p.pricePerSqft != null
      ? `₹${p.pricePerSqft.toLocaleString()}`
      : (avgArea ? `₹${Math.round(avgPrice / avgArea).toLocaleString()}` : '—');

    return `
      <tr><td>Configuration</td><td>${bhkStr} · ${bathsStr}</td></tr>
      <tr><td>Carpet Area</td><td>${areaStr}</td></tr>
      <tr><td>Price Range</td><td style="color:var(--gold-light)">${priceStr}</td></tr>
      <tr><td>Price per sq.ft</td><td>${psfStr}</td></tr>`;
  }

  /* Build price-per-sqft display for sidebar */
  function buildPsfDisplay(p, _cfg) {
    if (p.pricePerSqft != null) {
      return `₹${p.pricePerSqft.toLocaleString()} per sq.ft`;
    }
    if (p.configurations && p.configurations.length) {
      const cfgs  = p.configurations;
      const aMin  = Math.min(...cfgs.map(c => c.areaMin));
      const aMax  = Math.max(...cfgs.map(c => c.areaMax));
      const pMin  = Math.min(...cfgs.map(c => c.priceMin));
      const pMax  = Math.max(...cfgs.map(c => c.priceMax));
      const avgArea  = (aMin + aMax) / 2;
      const avgPrice = (pMin + pMax) / 2;
      return avgArea ? `₹${Math.round(avgPrice / avgArea).toLocaleString()} per sq.ft` : '';
    }
    return p.area ? `₹${Math.round((p.priceRaw||0) / p.area).toLocaleString()} per sq.ft` : '';
  }

  /* Sidebar mini-stats: BHK range + area range */
  function buildSidebarMiniStats(p, _cfg) {
    let bhk, area;
    if (p.configurations && p.configurations.length) {
      const cfgs = p.configurations;
      bhk  = rangeList(cfgs.map(c => c.bhk));
      const aMin = Math.min(...cfgs.map(c => c.areaMin));
      const aMax = Math.max(...cfgs.map(c => c.areaMax));
      area = aMin === aMax ? aMin.toLocaleString() : `${aMin.toLocaleString()}–${aMax.toLocaleString()}`;
    } else {
      bhk  = p.bhk  || '—';
      area = (p.area || 0).toLocaleString();
    }
    const areaLen = String(area).length;
    const areaFont = areaLen > 12 ? '0.78rem' : areaLen > 7 ? '0.95rem' : '1.4rem';
    return `
      <div>
        <div style="font-family:var(--font-display);font-size:1.4rem;color:var(--gold-light)">${bhk}</div>
        <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em">BHK</div>
      </div>
      <div>
        <div style="font-family:var(--font-display);font-size:${areaFont};color:var(--gold-light)">${area}</div>
        <div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em">Sq. Ft.</div>
      </div>`;
  }

  /* No config tabs needed any more — no-op */
  function initConfigTabs(_p, _facing) {}

  /* ════════════════════════════════════════════
     MAIN RENDER
  ════════════════════════════════════════════ */
  function renderProperty(p) {
    document.title = `${p.title} — Stellar Realty`;

    const backHref  = document.referrer.includes('listings')?'listings.html':document.referrer.includes('index')?'index.html':'listings.html';
    const backLabel = backHref==='index.html'?'Home':'All Listings';
    const badgeLabel= getBadgeLabel(p);
    const badgeClass= getBadgeClass(p);

    const plans = (p.floorPlanImages||[]).filter(Boolean).map(rewriteDriveImageUrl);

    const facing = getFacing(p.amenities);
    const displayAmenities = facing
      ? (p.amenities || []).filter(a => a !== facing.label)
      : (p.amenities || []);

    const amenitiesHTML = (displayAmenities && displayAmenities.length) ? `
      <div class="prop-block">
        <div class="prop-block-title">Amenities</div>
        <div class="amenities-grid">
          ${displayAmenities.map(a=>`<div class="amenity-chip"><span class="amenity-icon">${amenityIcon(a)}</span><span>${esc(a)}</span></div>`).join('')}
        </div>
      </div>` : '';

    /* Store brochure URL in a closure variable — never written into the DOM
       so it cannot be seen via DevTools element inspector or view-source.   */
    const _brochureUrl   = p.brochureUrl || null;
    const _brochureTitle = p.title || '';

    const brochureHTML = p.brochureUrl ? `
      <button type="button" id="brochure-open-btn" class="brochure-btn">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
        </svg>
        View Brochure
      </button>` : '';

    root.innerHTML = `
      <div class="container">
        <div style="padding-top:5.5rem;padding-bottom:0.5rem">
          <a href="${backHref}" class="back-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Back to ${backLabel}
          </a>
        </div>

        <div class="prop-layout">
          <div>
            <!-- Title -->
            <div style="margin-bottom:1.5rem">
              <h1 style="font-size:clamp(1.6rem,4vw,2.4rem);margin-bottom:0.5rem">${esc(p.title)}</h1>
              <div style="display:flex;align-items:center;flex-wrap:wrap;gap:0.5rem;color:var(--text-muted);font-size:0.88rem">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                ${esc(p.locality)}, ${esc(p.city)}
                <span style="color:var(--border-strong)">·</span>
                <span class="rera-pill">
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M9 12l2 2 4-4"/><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20z"/>
                  </svg>
                  RERA: ${esc(p.rera)}
                </span>
                <span class="${badgeClass}" style="font-size:0.68rem;padding:0.2rem 0.65rem;border-radius:4px;font-weight:600;letter-spacing:0.08em;text-transform:uppercase">${badgeLabel}</span>
              </div>
            </div>

            <!-- Gallery (after title) -->
            ${buildGallery(p)}

            <!-- Stats -->
            <div class="prop-stats" id="prop-stats-root">
              ${buildStatsHTML(p, p.configurations && p.configurations.length ? p.configurations[0] : null, facing)}
            </div>

            ${buildConfigTabs(p)}

            <!-- Description -->
            <div class="prop-block">
              <div class="prop-block-title">About this Property</div>
              <p style="line-height:1.85;color:var(--text-secondary);font-size:0.96rem">${esc(p.description)}</p>
            </div>

            ${amenitiesHTML}
            ${buildFloorPlan(p)}
            ${buildLocationMap(p)}

            <!-- EMI Calculator -->
            <div class="prop-block" id="emi-calculator">
              <div class="prop-block-title">EMI Calculator</div>
              <div class="emi-wrap">
                <div class="emi-inputs">
                  <div class="emi-field">
                    <div class="emi-label-row"><label for="emi-loan">Loan Amount</label><span class="emi-val-badge" id="emi-loan-display"></span></div>
                    <input type="number" id="emi-loan" class="emi-number-input" min="500000" max="100000000" step="100000" placeholder="e.g. 5000000">
                    <div class="emi-input-hint">Enter amount in ₹ (₹5L – ₹10Cr)</div>
                  </div>
                  <div class="emi-field">
                    <div class="emi-label-row"><label for="emi-rate">Interest Rate (% p.a.)</label><span class="emi-val-badge" id="emi-rate-display"></span></div>
                    <input type="number" id="emi-rate" class="emi-number-input" min="6" max="20" step="0.1" placeholder="e.g. 8.5">
                    <div class="emi-input-hint">Between 6% and 20%</div>
                  </div>
                  <div class="emi-field">
                    <div class="emi-label-row"><label for="emi-tenure">Loan Tenure (years)</label><span class="emi-val-badge" id="emi-tenure-display"></span></div>
                    <input type="number" id="emi-tenure" class="emi-number-input" min="1" max="30" step="1" placeholder="e.g. 20">
                    <div class="emi-input-hint">Between 1 and 30 years</div>
                  </div>
                </div>
                <div class="emi-results">
                  <div class="emi-pie-wrap">
                    <svg id="emi-pie" viewBox="0 0 200 200" width="170" height="170">
                      <circle cx="100" cy="100" r="80" fill="var(--bg-card)"/>
                      <path id="emi-arc-interest" d="" fill="#c9a96e"/>
                      <path id="emi-arc-principal" d="" fill="#2a3a2a"/>
                      <circle cx="100" cy="100" r="52" fill="var(--bg-card)"/>
                      <text x="100" y="94" text-anchor="middle" fill="var(--gold-light,#e8c97a)" font-size="12" font-family="inherit" opacity="0.7">Monthly</text>
                      <text id="emi-center" x="100" y="116" text-anchor="middle" fill="#e8c97a" font-size="13.5" font-weight="600" font-family="inherit">—</text>
                    </svg>
                    <div class="emi-legend">
                      <div class="emi-legend-item"><span class="emi-legend-dot" style="background:#c9a96e"></span><span>Interest</span></div>
                      <div class="emi-legend-item"><span class="emi-legend-dot" style="background:#2a3a2a;border:1.5px solid #4a7a4a"></span><span>Principal</span></div>
                    </div>
                  </div>
                  <div class="emi-numbers">
                    <div class="emi-num-card accent"><div class="emi-num-label">Monthly EMI</div><div class="emi-num-val" id="emi-monthly">—</div></div>
                    <div class="emi-num-card"><div class="emi-num-label">Total Interest</div><div class="emi-num-val" id="emi-interest">—</div></div>
                    <div class="emi-num-card"><div class="emi-num-label">Total Payment</div><div class="emi-num-val" id="emi-total">—</div></div>
                    <div class="emi-num-card"><div class="emi-num-label">Principal</div><div class="emi-num-val" id="emi-principal-val">—</div></div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Details table -->
            <div class="prop-block">
              <div class="prop-block-title">Property Details</div>
              <table class="detail-table">
                <tr><td>Property Type</td><td>${esc(p.type.charAt(0).toUpperCase()+p.type.slice(1))}</td></tr>
                ${buildConfigDetailRows(p)}
                <tr><td>Status</td><td>${esc(p.constructionStatus)}</td></tr>
                <tr><td>Locality</td><td>${esc(p.locality)}, ${esc(p.city)}</td></tr>
                <tr><td>RERA Number</td><td style="font-size:0.8rem;word-break:break-all">${esc(p.rera)}</td></tr>
                ${plans.length?`<tr><td>Floor Plans</td><td>${plans.length} plan${plans.length>1?'s':''} available</td></tr>`:''}
              </table>
            </div>
          </div>

          <!-- Sidebar -->
          <div class="prop-sidebar">
            <div class="enquiry-card">
              <div class="enquiry-card-head">
                <div style="font-size:0.72rem;letter-spacing:0.12em;text-transform:uppercase;color:var(--gold-dim);margin-bottom:0.4rem">Listed Price</div>
                <div style="font-family:var(--font-display);font-size:2rem;color:var(--gold-light)" id="sidebar-price">${esc(p.price)}</div>
                <div style="font-size:0.8rem;color:var(--text-muted);margin-top:0.25rem" id="sidebar-psf">${buildPsfDisplay(p, null)}</div>
              </div>
              <div class="enquiry-card-body">
                <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:1.25rem;line-height:1.6">
                  Interested in this property? Your advisor will get back to you for more curated insights.
                </p>
                <a href="contact.html?property=${encodeURIComponent(p.title)}&id=${p._id}"
                   class="btn btn-gold" style="width:100%;justify-content:center;padding:0.9rem">
                  Enquire About This Property
                </a>
                <a href="tel:+919876543210"
                   class="btn btn-outline" style="width:100%;justify-content:center;padding:0.85rem;margin-top:0.75rem">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.72 3.36 2 2 0 0 1 3.72 1h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.09a16 16 0 0 0 6 6l1.06-1.06a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
                  </svg>
                  Call +91 98765 43210
                </a>

                ${brochureHTML}

                <button onclick="shareProperty('${esc(p.title).replace(/'/g,"\\'")}','${esc(p.price).replace(/'/g,"\\'")}')"
                        class="btn share-property-btn" id="share-prop-btn">
                  <span class="share-btn-glow"></span>
                  <svg class="share-btn-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
                    <circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/>
                    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                  </svg>
                  <span class="share-btn-text">Share this Property</span>
                  <span class="share-btn-badge">↗</span>
                </button>

                <div style="margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid var(--border)">
                  <div id="sidebar-mini-stats" style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;text-align:center">
                    ${buildSidebarMiniStats(p, null)}
                  </div>
                </div>
              </div>
            </div>

            <div style="margin-top:1rem;text-align:center">
              ${buildSimilarLink(p)}
            </div>
          </div>
        </div>
      </div>`;

    /* Wire up interactivity */
    const slides = buildGallery._slides || [];
    const allSlides = (() => {
      let s = [];
      if (p.images && p.images.length) { s = [...p.images]; if (p.img && !s.includes(p.img)) s.unshift(p.img); }
      else s = [p.img];
      return s.filter(Boolean);
    })();
    if (allSlides.length > 1) initGallery(allSlides.length);
    if (plans.length > 1) initFloorPlan(plans);
    initConfigTabs(p, facing);

    /* Wire brochure button using closure — URL never touches the DOM */
    if (_brochureUrl) {
      const brochureBtn = document.getElementById('brochure-open-btn');
      if (brochureBtn) {
        brochureBtn.addEventListener('click', () => openBrochureViewer(_brochureUrl, _brochureTitle));
      }
    }

    /* Fetch and display wishlist count (fire-and-forget) */
    fetchWishlistCount(p._id);
  }

  /* ════════════════════════════════════════════
     WISHLIST COUNT BADGE
  ════════════════════════════════════════════ */
  async function fetchWishlistCount(propertyId) {
    if (!propertyId) return;
    try {
      const res  = await fetch(`${API}/api/properties/${propertyId}/wishlist-count`);
      const data = await res.json();
      if (!data.success || !data.count || data.count < 1) return;

      /* Build the badge HTML */
      const count = data.count;
      const label = count === 1
        ? '1 person has wishlisted this property'
        : `${count} people have wishlisted this property`;

      const badge = document.createElement('div');
      badge.id = 'wl-count-badge';
      badge.innerHTML = `
        <svg width="13" height="13" viewBox="0 0 24 24" fill="#c9a96e" stroke="#c9a96e" stroke-width="2" style="flex-shrink:0">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        <span>${label}</span>`;
      badge.style.cssText = `
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-top: 1rem;
        padding: 0.6rem 0.9rem;
        background: rgba(201,169,110,0.08);
        border: 1px solid rgba(201,169,110,0.22);
        border-radius: 8px;
        font-size: 0.8rem;
        color: var(--gold-light, #e8c97a);
        line-height: 1.4;
        animation: wlFadeIn 0.4s ease both;
      `;

      /* Inject a keyframe animation if not already present */
      if (!document.getElementById('wl-fade-style')) {
        const style = document.createElement('style');
        style.id = 'wl-fade-style';
        style.textContent = `@keyframes wlFadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:none; } }`;
        document.head.appendChild(style);
      }

      /* Insert after the "Share this Property" button, inside the enquiry card body */
      const shareBtn = document.querySelector('.enquiry-card-body button[onclick*="shareProperty"]');
      if (shareBtn) {
        shareBtn.insertAdjacentElement('afterend', badge);
      } else {
        /* Fallback: append to enquiry card body */
        const cardBody = document.querySelector('.enquiry-card-body');
        if (cardBody) cardBody.appendChild(badge);
      }
    } catch (_) { /* silent — don't break the page if count fails */ }
  }

  /* ════════════════════════════════════════════
     GALLERY CONTROLS
  ════════════════════════════════════════════ */
  function initGallery(count) {
    const track   = document.getElementById('gal-track');
    const counter = document.getElementById('gal-counter');
    const dots    = document.querySelectorAll('.gallery-dot');
    let cur = 0, autoTimer = null;

    function goTo(idx) {
      cur = ((idx % count) + count) % count;
      track.style.transform = `translateX(-${cur*100}%)`;
      if (counter) counter.textContent = `${cur+1} / ${count}`;
      dots.forEach((d,i) => d.classList.toggle('active', i===cur));
    }

    document.getElementById('gal-prev')?.addEventListener('click', () => { goTo(cur-1); resetAuto(); });
    document.getElementById('gal-next')?.addEventListener('click', () => { goTo(cur+1); resetAuto(); });
    dots.forEach(d => d.addEventListener('click', () => { goTo(+d.dataset.idx); resetAuto(); }));

    document.addEventListener('keydown', e => {
      if (e.key==='ArrowLeft')  { goTo(cur-1); resetAuto(); }
      if (e.key==='ArrowRight') { goTo(cur+1); resetAuto(); }
    });

    let tx = 0;
    const wrap = document.getElementById('gallery-root');
    wrap?.addEventListener('touchstart', e => { tx = e.touches[0].clientX; }, {passive:true});
    wrap?.addEventListener('touchend',   e => {
      const dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 40) { goTo(cur + (dx<0?1:-1)); resetAuto(); }
    }, {passive:true});

    function startAuto() { autoTimer = setInterval(() => goTo(cur+1), 5000); }
    function resetAuto()  { clearInterval(autoTimer); startAuto(); }
    startAuto();
  }

  /* ════════════════════════════════════════════
     FLOOR PLAN CONTROLS
  ════════════════════════════════════════════ */
  function initFloorPlan(plans) {
    const img = document.getElementById('fp-img');
    const lbl = document.getElementById('fp-label');
    let cur = 0;
    function show(i) {
      cur = ((i%plans.length)+plans.length)%plans.length;
      img.src = plans[cur]; img.alt = `Floor plan ${cur+1}`;
      if (lbl) lbl.textContent = `Plan ${cur+1} of ${plans.length}`;
      document.querySelectorAll('.fp-tab').forEach((t,ti) => t.classList.toggle('active', ti===cur));
    }
    document.querySelectorAll('.fp-tab').forEach(t => t.addEventListener('click', ()=>show(+t.dataset.fp)));
    document.getElementById('fp-prev')?.addEventListener('click', ()=>show(cur-1));
    document.getElementById('fp-next')?.addEventListener('click', ()=>show(cur+1));
  }

  /* ── Share Button Styles ── */
  (function injectShareStyles() {
    if (document.getElementById('share-prop-styles')) return;
    const s = document.createElement('style');
    s.id = 'share-prop-styles';
    s.textContent = `
      /* ── Share Button ── */
      .share-property-btn {
        position: relative; overflow: hidden;
        width: 100%; margin-top: 0.75rem;
        padding: 0.78rem 1rem;
        display: flex; align-items: center; justify-content: center; gap: 0.55rem;
        font-size: 0.84rem; font-weight: 600; letter-spacing: 0.04em;
        color: #c9a96e;
        background: linear-gradient(135deg, rgba(201,169,110,0.13) 0%, rgba(201,169,110,0.06) 100%);
        border: 1px solid rgba(201,169,110,0.45);
        border-radius: 10px;
        cursor: pointer;
        transition: transform 0.2s ease, box-shadow 0.25s ease, border-color 0.25s ease, background 0.25s ease;
      }
      .share-property-btn:hover {
        background: linear-gradient(135deg, rgba(201,169,110,0.22) 0%, rgba(201,169,110,0.10) 100%);
        border-color: rgba(201,169,110,0.75);
        box-shadow: 0 0 0 3px rgba(201,169,110,0.12), 0 8px 28px rgba(201,169,110,0.18);
        transform: translateY(-1px);
      }
      .share-property-btn:active { transform: translateY(0); }
      .share-btn-glow {
        position: absolute; inset: 0; pointer-events: none;
        background: linear-gradient(105deg, rgba(201,169,110,0) 40%, rgba(201,169,110,0.18) 50%, rgba(201,169,110,0) 60%);
        background-size: 200% 100%; background-position: 200% 0;
        transition: background-position 0.55s ease;
        border-radius: inherit;
      }
      .share-property-btn:hover .share-btn-glow { background-position: -200% 0; }
      .share-btn-icon { flex-shrink: 0; }
      .share-btn-text { flex: 1; text-align: center; }
      .share-btn-badge {
        font-size: 0.78rem; color: rgba(201,169,110,0.55);
        transition: color 0.2s, transform 0.2s;
      }
      .share-property-btn:hover .share-btn-badge {
        color: #c9a96e; transform: translateX(2px) translateY(-1px);
      }
    `;
    document.head.appendChild(s);
  })();

  /* ── Share ── */
  window.shareProperty = function(title, price) {
    const url = window.location.href;
    if (navigator.share) {
      navigator.share({ title, text: `${title} — ${price} | Stellar Realty`, url });
    } else {
      navigator.clipboard.writeText(url)
        .then(() => alert('Link copied to clipboard!'))
        .catch(() => prompt('Copy link:', url));
    }
  };


  function showToast(msg, icon) {
    if (typeof window.showToast==='function') { window.showToast(msg,icon); return; }
    const t = document.createElement('div');
    t.textContent = `${icon}  ${msg}`;
    Object.assign(t.style,{position:'fixed',bottom:'2rem',right:'2rem',zIndex:'9999',background:'var(--bg-card)',border:'1px solid var(--border)',color:'var(--text-primary)',padding:'0.75rem 1.25rem',borderRadius:'8px',fontSize:'0.85rem',pointerEvents:'none',boxShadow:'0 8px 32px rgba(0,0,0,0.4)',transition:'opacity 0.3s'});
    document.body.appendChild(t);
    setTimeout(()=>{t.style.opacity='0';setTimeout(()=>t.remove(),400);},2800);
  }

  /* ── Boot ── */
  async function init() {
    const id = new URLSearchParams(location.search).get('id');
    if (!id) { renderError('No property ID specified.'); return; }
    renderSkeleton();
    try {
      const res  = await fetch(`${API}/api/properties/${id}`);
      const data = await res.json();
      if (!data.success || !data.property) { renderError(data.error||'Property not found.'); return; }
      renderProperty(data.property);
      const prop = data.property;
      const emiBasePrice = (prop.configurations && prop.configurations.length)
        ? Math.min(...prop.configurations.map(c => c.priceMin))
        : (prop.priceRaw || 0);
      initEmiCalculator(emiBasePrice);
    } catch { renderError('Could not load property. Is the server running?'); }
  }

  document.addEventListener('DOMContentLoaded', init);

  /* ════════════════════════════════════════════
     PROTECTED BROCHURE VIEWER
     – Renders PDF page-by-page via canvas (pdf.js)
     – No download button, no direct PDF link exposed
     – Right-click, drag, text-select disabled inside viewer
     – "Stellar Realty Confidential" watermark overlay
  ════════════════════════════════════════════ */
  window.openBrochureViewer = function(url, title) {
    /* Inject modal only once */
    if (!document.getElementById('bv-modal')) _injectBrochureModal();
    const modal   = document.getElementById('bv-modal');
    const titleEl = document.getElementById('bv-title');
    const canvas  = document.getElementById('bv-canvas');
    const prevBtn = document.getElementById('bv-prev');
    const nextBtn = document.getElementById('bv-next');
    const pageEl  = document.getElementById('bv-page-info');
    const spinner = document.getElementById('bv-spinner');

    titleEl.textContent = title || 'Brochure';
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    /* Load pdf.js from CDN if not already loaded */
    function loadPdfJs(cb) {
      if (window.pdfjsLib) { cb(); return; }
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        cb();
      };
      document.head.appendChild(s);
    }

    let pdfDoc = null, curPage = 1, rendering = false;

    function renderPage(num) {
      if (rendering) return;
      rendering = true;
      spinner.style.display = 'flex';
      pdfDoc.getPage(num).then(page => {
        const vp     = page.getViewport({ scale: _bvScale(page) });
        const ctx    = canvas.getContext('2d');
        canvas.width  = vp.width;
        canvas.height = vp.height;
        page.render({ canvasContext: ctx, viewport: vp }).promise.then(() => {
          _drawWatermark(ctx, vp.width, vp.height);
          spinner.style.display = 'none';
          rendering = false;
          pageEl.textContent = `${num} / ${pdfDoc.numPages}`;
          prevBtn.disabled = num <= 1;
          nextBtn.disabled = num >= pdfDoc.numPages;
        });
      });
    }

    /* Google Drive PDFs can't be fetched cross-origin by pdf.js — use the
       Drive preview iframe instead, which renders natively in the browser. */
    function driveFileId(u) {
      const m = u.match(/drive\.google\.com\/(?:file\/d\/|uc\?(?:[^&]*&)*id=)([A-Za-z0-9_-]{10,})/);
      return m ? m[1] : null;
    }

    const fid = driveFileId(url);
    if (fid) {
      /* Swap canvas for an iframe — hide canvas, show iframe */
      canvas.style.display = 'none';
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
      pageEl.textContent = '';
      let wrapEl = document.getElementById('bv-drive-wrap');
      let iframeEl = document.getElementById('bv-drive-iframe');
      if (!wrapEl) {
        wrapEl = document.createElement('div');
        wrapEl.id = 'bv-drive-wrap';
        wrapEl.style.cssText = 'position:relative;width:100%;flex:1;min-height:70vh;';
        iframeEl = document.createElement('iframe');
        iframeEl.id = 'bv-drive-iframe';
        iframeEl.style.cssText = 'width:100%;height:100%;min-height:70vh;border:none;border-radius:8px;display:block;';
        /* Overlay covers the top toolbar where the popout button lives */
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:absolute;top:0;right:0;width:120px;height:60px;z-index:10;background:#202124;pointer-events:all;cursor:default;border-radius:0 8px 0 0;';
        /* SVG watermark overlay — sits on top of iframe, pointer-events:none so scrolling still works */
        const wmEl = document.createElement('div');
        wmEl.id = 'bv-drive-watermark';
        wmEl.style.cssText = 'position:absolute;inset:0;z-index:9;pointer-events:none;overflow:hidden;border-radius:8px;';
        wmEl.innerHTML = _buildDriveWatermarkSvg();
        wrapEl.appendChild(iframeEl);
        wrapEl.appendChild(wmEl);
        wrapEl.appendChild(overlay);
        canvas.parentNode.insertBefore(wrapEl, canvas);
      }
      wrapEl.style.display = 'flex';
      iframeEl.style.display = 'block';
      iframeEl.src = `https://drive.google.com/file/d/${fid}/preview`;
      iframeEl.onload = () => { spinner.style.display = 'none'; };
      iframeEl.onerror = () => { spinner.style.display = 'none'; pageEl.textContent = 'Failed to load brochure.'; };
    } else {
      /* Non-Drive URL — use pdf.js as before */
      if (document.getElementById('bv-drive-iframe')) {
        document.getElementById('bv-drive-iframe').style.display = 'none';
      }
      canvas.style.display = 'block';
      prevBtn.style.display = '';
      nextBtn.style.display = '';
      loadPdfJs(() => {
        spinner.style.display = 'flex';
        canvas.width = 0; canvas.height = 0;
        window.pdfjsLib.getDocument(url).promise.then(doc => {
          pdfDoc  = doc;
          curPage = 1;
          renderPage(curPage);
        }).catch(() => {
          spinner.style.display = 'none';
          pageEl.textContent = 'Failed to load brochure.';
        });
      });
    }

    prevBtn.onclick = () => { if (curPage > 1) { curPage--; renderPage(curPage); } };
    nextBtn.onclick = () => { if (pdfDoc && curPage < pdfDoc.numPages) { curPage++; renderPage(curPage); } };

    document.getElementById('bv-close').onclick = _closeBrochureViewer;
    modal.addEventListener('click', e => { if (e.target === modal) _closeBrochureViewer(); });
  };

  /* Build an SVG string for the Drive iframe watermark overlay.
     Uses a <pattern> for the repeating diagonal text — no canvas needed. */
  function _buildDriveWatermarkSvg() {
    const txt   = 'Stellar Realty';
    const angle = -30;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%"
              style="position:absolute;inset:0;width:100%;height:100%">
      <defs>
        <pattern id="wm-pat" x="0" y="0" width="220" height="120" patternUnits="userSpaceOnUse"
                 patternTransform="rotate(${angle})">
          <text x="110" y="70" text-anchor="middle" dominant-baseline="middle"
                font-family="serif" font-weight="bold" font-size="15"
                fill="#8a6a30" fill-opacity="0.13">${txt}</text>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#wm-pat)"/>
      <text x="99%" y="99%" text-anchor="end" dominant-baseline="auto"
            font-family="sans-serif" font-weight="600" font-size="12"
            fill="#8a6a30" fill-opacity="0.30">© Stellar Realty</text>
    </svg>`;
  }

  function _closeBrochureViewer() {
    const modal = document.getElementById('bv-modal');
    if (modal) modal.style.display = 'none';
    document.body.style.overflow = '';
    /* Clear iframe src so it stops loading/playing when closed */
    const wrapEl = document.getElementById('bv-drive-wrap');
    if (wrapEl) wrapEl.style.display = 'none';
    const iframeEl = document.getElementById('bv-drive-iframe');
    if (iframeEl) iframeEl.src = '';
    const canvas = document.getElementById('bv-canvas');
    if (canvas) canvas.style.display = 'block';
  }

  function _bvScale(page) {
    const vp0   = page.getViewport({ scale: 1 });
    const maxW  = Math.min(window.innerWidth  * 0.88, 820);
    const maxH  = Math.min(window.innerHeight * 0.80, 900);
    return Math.min(maxW / vp0.width, maxH / vp0.height, 2.0);
  }

  function _drawWatermark(ctx, w, h) {
    ctx.save();
    /* Diagonal repeating text watermark */
    ctx.globalAlpha    = 0.10;
    ctx.fillStyle      = '#8a6a30';
    ctx.font           = `bold ${Math.round(w * 0.035)}px serif`;
    ctx.textAlign      = 'center';
    ctx.textBaseline   = 'middle';
    const txt  = 'Stellar Realty';
    const step = Math.round(w * 0.38);
    const rows = Math.ceil(h / step) + 2;
    const cols = Math.ceil(w / step) + 2;
    ctx.translate(w / 2, h / 2);
    ctx.rotate(-Math.PI / 6);
    for (let r = -rows; r <= rows; r++) {
      for (let c = -cols; c <= cols; c++) {
        ctx.fillText(txt, c * step, r * step);
      }
    }
    ctx.restore();

    /* Corner badge */
    ctx.save();
    ctx.globalAlpha  = 0.22;
    ctx.fillStyle    = '#8a6a30';
    ctx.font         = `600 ${Math.round(w * 0.022)}px sans-serif`;
    ctx.textAlign    = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('© Stellar Realty', w - 10, h - 8);
    ctx.restore();
  }

  function _injectBrochureModal() {
    /* CSS */
    const style = document.createElement('style');
    style.textContent = `
      #bv-modal {
        display:none; position:fixed; inset:0; z-index:10000;
        background:rgba(8,7,6,0.92); backdrop-filter:blur(8px);
        align-items:center; justify-content:center; flex-direction:column;
        padding:1rem;
      }
      #bv-shell {
        display:flex; flex-direction:column;
        max-width:860px; width:100%; max-height:96vh;
        background:var(--bg-card,#141414); border:1px solid rgba(201,169,110,0.2);
        border-radius:12px; overflow:hidden;
        box-shadow:0 24px 80px rgba(0,0,0,0.7);
      }
      #bv-header {
        display:flex; align-items:center; justify-content:space-between;
        padding:0.85rem 1.25rem; border-bottom:1px solid rgba(201,169,110,0.12);
        background:rgba(201,169,110,0.04); flex-shrink:0;
      }
      #bv-header-left { display:flex; align-items:center; gap:0.6rem; }
      #bv-title {
        font-family:var(--font-display,serif); font-size:0.95rem;
        color:var(--gold-light,#e8c97a); max-width:340px;
        overflow:hidden; text-overflow:ellipsis; white-space:nowrap;
      }
      #bv-confidential {
        font-size:0.65rem; letter-spacing:0.1em; text-transform:uppercase;
        padding:0.2rem 0.6rem; border-radius:4px;
        background:rgba(201,169,110,0.12); color:var(--gold,#c9a96e);
        border:1px solid rgba(201,169,110,0.25);
      }
      #bv-close {
        width:32px; height:32px; display:flex; align-items:center; justify-content:center;
        background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.1);
        border-radius:6px; cursor:pointer; color:rgba(255,255,255,0.6);
        font-size:1.1rem; line-height:1; transition:background 0.2s, color 0.2s;
        flex-shrink:0;
      }
      #bv-close:hover { background:rgba(255,80,80,0.15); color:#ff6060; }
      #bv-canvas-wrap {
        flex:1; overflow:auto; display:flex; align-items:flex-start;
        justify-content:center; padding:1.25rem; background:#0d0d0d;
        /* Prevent all interaction that could exfiltrate content */
        user-select:none; -webkit-user-select:none;
        -webkit-touch-callout:none;
      }
      #bv-canvas { display:block; max-width:100%; border-radius:4px; }
      #bv-spinner {
        position:absolute; display:none;
        align-items:center; justify-content:center; inset:0;
        background:rgba(13,13,14,0.6); z-index:2;
      }
      #bv-spinner-ring {
        width:40px; height:40px; border-radius:50%;
        border:3px solid rgba(201,169,110,0.2);
        border-top-color:var(--gold,#c9a96e);
        animation:bv-spin 0.8s linear infinite;
      }
      @keyframes bv-spin { to { transform:rotate(360deg); } }
      #bv-footer {
        display:flex; align-items:center; justify-content:space-between;
        padding:0.7rem 1.25rem; border-top:1px solid rgba(201,169,110,0.12);
        background:rgba(201,169,110,0.03); flex-shrink:0; gap:1rem;
      }
      #bv-page-info { font-size:0.82rem; color:var(--text-muted,#888); }
      .bv-nav-btn {
        padding:0.4rem 1.1rem; font-size:0.82rem; border-radius:6px;
        border:1px solid rgba(201,169,110,0.3); background:rgba(201,169,110,0.07);
        color:var(--gold-light,#e8c97a); cursor:pointer; transition:all 0.2s;
      }
      .bv-nav-btn:hover:not(:disabled) { background:rgba(201,169,110,0.15); border-color:var(--gold,#c9a96e); }
      .bv-nav-btn:disabled { opacity:0.35; cursor:not-allowed; }
      #bv-notice {
        font-size:0.7rem; color:var(--text-muted,#666);
        display:flex; align-items:center; gap:0.35rem;
      }
    `;
    document.head.appendChild(style);

    /* HTML */
    const modal = document.createElement('div');
    modal.id = 'bv-modal';
    modal.setAttribute('role','dialog');
    modal.setAttribute('aria-modal','true');
    modal.setAttribute('aria-label','Brochure Viewer');
    modal.innerHTML = `
      <div id="bv-shell">
        <div id="bv-header">
          <div id="bv-header-left">
            <span id="bv-title">Brochure</span>
          </div>
          <button id="bv-close" aria-label="Close viewer">✕</button>
        </div>
        <div id="bv-canvas-wrap" style="position:relative">
          <div id="bv-spinner"><div id="bv-spinner-ring"></div></div>
          <canvas id="bv-canvas"></canvas>
        </div>
        <div id="bv-footer">
          <div style="display:flex;gap:0.5rem">
            <button id="bv-prev" class="bv-nav-btn" disabled>← Prev</button>
            <button id="bv-next" class="bv-nav-btn" disabled>Next →</button>
          </div>
          <span id="bv-page-info">Loading…</span>
          <span id="bv-notice">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
            View only — not for distribution
          </span>
        </div>
      </div>`;
    document.body.appendChild(modal);

    /* Block right-click and drag inside viewer */
    const wrap = modal.querySelector('#bv-canvas-wrap');
    wrap.addEventListener('contextmenu', e => e.preventDefault());
    wrap.addEventListener('dragstart',   e => e.preventDefault());
  }

  /* ════════════════════════════════════════════
     EMI CALCULATOR
  ════════════════════════════════════════════ */
  function initEmiCalculator(priceRaw) {
    const ls=document.getElementById('emi-loan'), rs=document.getElementById('emi-rate'), ts=document.getElementById('emi-tenure');
    if (!ls) return;
    ls.value = Math.min(Math.max(Math.round((priceRaw||5e6)*0.8/1e5)*1e5, 5e5), 1e8);
    rs.value = 8.5; ts.value = 20;
    const fmtINR = n => n>=1e7?'₹'+(n/1e7).toFixed(2)+' Cr':n>=1e5?'₹'+(n/1e5).toFixed(2)+' L':'₹'+Math.round(n).toLocaleString('en-IN');
    const calcEMI = (P,r,y) => { const mr=r/12/100,n=y*12; return mr===0?P/n:P*mr*Math.pow(1+mr,n)/(Math.pow(1+mr,n)-1); };
    const arc = (cx,cy,r,sa,ea) => { const f=a=>(a-90)*Math.PI/180; return `M ${cx} ${cy} L ${cx+r*Math.cos(f(sa))} ${cy+r*Math.sin(f(sa))} A ${r} ${r} 0 ${ea-sa>180?1:0} 1 ${cx+r*Math.cos(f(ea))} ${cy+r*Math.sin(f(ea))} Z`; };
    function clampInput(el) {
      let v = parseFloat(el.value);
      const mn = parseFloat(el.min), mx = parseFloat(el.max);
      if (isNaN(v)) return;
      if (v < mn) el.value = mn;
      if (v > mx) el.value = mx;
    }
    function update() {
      const P=+ls.value, rate=+rs.value, tenure=+ts.value;
      if (!P || !rate || !tenure) return;
      const emi=calcEMI(P,rate,tenure), total=emi*tenure*12, interest=total-P, ip=(interest/total)*100;
      document.getElementById('emi-loan-display').textContent   = fmtINR(P);
      document.getElementById('emi-rate-display').textContent   = rate.toFixed(1)+'% p.a.';
      document.getElementById('emi-tenure-display').textContent = tenure+(tenure===1?' year':' years');
      document.getElementById('emi-monthly').textContent        = fmtINR(emi);
      document.getElementById('emi-interest').textContent       = fmtINR(interest);
      document.getElementById('emi-total').textContent          = fmtINR(total);
      document.getElementById('emi-principal-val').textContent  = fmtINR(P);
      document.getElementById('emi-center').textContent         = fmtINR(emi);
      const ai=document.getElementById('emi-arc-interest'), ap=document.getElementById('emi-arc-principal');
      if (ip>=99.9)      { ai.setAttribute('d',arc(100,100,80,0,359.99)); ap.setAttribute('d',''); }
      else if (ip<=0.01) { ap.setAttribute('d',arc(100,100,80,0,359.99)); ai.setAttribute('d',''); }
      else { const e=ip*3.6; ai.setAttribute('d',arc(100,100,80,0,e)); ap.setAttribute('d',arc(100,100,80,e,360)); }
    }
    // Clamp only on blur so typing intermediate values (e.g. "8" before "8.5") isn't blocked
    [ls,rs,ts].forEach(s => {
      s.addEventListener('input', update);
      s.addEventListener('blur', () => { clampInput(s); update(); });
    });
    update();
  }
})();