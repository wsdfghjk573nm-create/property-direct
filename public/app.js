'use strict';
/* Property Direct frontend — all buttons call real APIs. No fake actions. */

const state = {
  token: localStorage.getItem('pd_token') || null,
  user: JSON.parse(localStorage.getItem('pd_user') || 'null'),
  config: null, favIds: new Set(), cities: [],
  editingId: null, currentProperty: null, currentThread: null,
  compareIds: new Set(), searchPreset: {},
};

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function toast(msg) { const t = $('toast'); t.textContent = msg; t.classList.remove('hidden'); setTimeout(() => t.classList.add('hidden'), 3400); }

async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (state.token) headers.Authorization = 'Bearer ' + state.token;
  let body = opts.body;
  if (body && !(body instanceof FormData)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
  const res = await fetch('/api' + path, { ...opts, headers, body });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (!res.ok) throw new Error(data.error || ('Request failed (' + res.status + ')'));
  return data;
}

function setAuth(token, user) {
  state.token = token; state.user = user;
  if (token) { localStorage.setItem('pd_token', token); localStorage.setItem('pd_user', JSON.stringify(user)); }
  else { localStorage.removeItem('pd_token'); localStorage.removeItem('pd_user'); state.favIds = new Set(); }
  syncNav();
}
function syncNav() {
  $('navAuth').classList.toggle('hidden', !!state.user);
  $('navLogout').classList.toggle('hidden', !state.user);
  $('navDashboard').classList.toggle('hidden', !state.user);
  $('navAdmin').classList.toggle('hidden', !(state.user && state.user.isAdmin));
}
function requireLogin(msg) {
  if (state.user) return true;
  toast(msg || 'Please log in first.'); show('auth'); return false;
}

function formatPrice(p) {
  if (p.listingType === 'rent') return '₹' + p.price.toLocaleString('en-IN') + '/month';
  if (p.price >= 10000000) return '₹' + (p.price / 10000000).toFixed(p.price % 10000000 ? 2 : 0) + ' Cr';
  if (p.price >= 100000) return '₹' + (p.price / 100000).toFixed(p.price % 100000 ? 1 : 0) + ' Lakh';
  return '₹' + p.price.toLocaleString('en-IN');
}

function show(name) {
  document.querySelectorAll('.view').forEach((v) => v.classList.add('hidden'));
  const map = { home: 'view-home', search: 'view-search', detail: 'view-detail', sell: 'view-post', auth: 'view-auth', favorites: 'view-favorites', assistant: 'view-assistant', pricing: 'view-pricing', dashboard: 'view-dashboard', admin: 'view-admin' };
  $(map[name] || 'view-home').classList.remove('hidden');
  $('mainNav').classList.remove('open');
  window.scrollTo({ top: 0 });
  if (name === 'favorites') loadFavorites();
  if (name === 'dashboard') loadDashboard();
  if (name === 'admin') loadAdmin();
  if (name === 'pricing') loadPromoProperties();
  if (name === 'sell' && !state.editingId) resetPostForm();
}

function badges(p) {
  let b = '';
  if (p.isDemo) b += '<span class="badge demo">DEMO</span>';
  if (p.isFeatured) b += '<span class="badge featured">FEATURED</span>';
  if (p.isVerified) b += '<span class="badge verified">✓ VERIFIED</span>';
  if (p.status && p.status !== 'approved') b += '<span class="badge status">' + esc(p.status.toUpperCase()) + '</span>';
  if (p.availability !== 'available') b += '<span class="badge status">' + esc(p.availability.toUpperCase()) + '</span>';
  return b;
}

function cardHTML(p, opts = {}) {
  const fav = state.favIds.has(p.id);
  const photo = p.photos && p.photos.length ? p.photos[0] : '/images/hero-banner.svg';
  return `<article class="card">
    <img src="${esc(photo)}" alt="${esc(p.title)}" loading="lazy">
    <div class="body">
      <div class="badges">${badges(p)}</div>
      <h3>${esc(p.title)}</h3>
      <div class="price">${formatPrice(p)}</div>
      <div class="muted">${esc(p.propertyType)} · ${p.listingType === 'rent' ? 'For Rent' : 'For Sale'}${p.bedrooms ? ' · ' + p.bedrooms + ' BHK' : ''}${p.areaValue ? ' · ' + p.areaValue + ' ' + esc(p.areaUnit) : ''}</div>
      <div class="muted">📍 ${esc(p.locality ? p.locality + ', ' : '')}${esc(p.city)}, ${esc(p.state)}</div>
      <div class="actions">
        <button class="btn small primary" data-view-prop="${p.id}">View Details</button>
        ${state.user ? `<button class="btn small" data-fav="${p.id}">${fav ? '♥ Saved' : '♡ Favorite'}</button>` : ''}
        ${opts.compare ? `<label class="muted"><input type="checkbox" data-compare="${p.id}" ${state.compareIds.has(p.id) ? 'checked' : ''}> Compare</label>` : ''}
        ${opts.mine ? `<button class="btn small" data-edit="${p.id}">Edit</button>
          <button class="btn small" data-avail="${p.id}">${p.availability === 'available' ? 'Mark Sold/Rented' : 'Mark Available'}</button>
          <button class="btn small" data-renew="${p.id}">Renew</button>
          <button class="btn small danger" data-del="${p.id}">Delete</button>` : ''}
      </div>
    </div></article>`;
}

function bindCards(root) {
  root.querySelectorAll('[data-view-prop]').forEach((b) => b.addEventListener('click', () => openProperty(+b.dataset.viewProp)));
  root.querySelectorAll('[data-fav]').forEach((b) => b.addEventListener('click', async () => {
    try { const r = await api('/favorites/' + b.dataset.fav, { method: 'POST' }); r.favorite ? state.favIds.add(+b.dataset.fav) : state.favIds.delete(+b.dataset.fav); toast(r.favorite ? 'Saved to favorites.' : 'Removed from favorites.'); refreshCurrentLists(); }
    catch (e) { toast(e.message); }
  }));
  root.querySelectorAll('[data-compare]').forEach((c) => c.addEventListener('change', () => { c.checked ? state.compareIds.add(+c.dataset.compare) : state.compareIds.delete(+c.dataset.compare); }));
  root.querySelectorAll('[data-edit]').forEach((b) => b.addEventListener('click', () => startEdit(+b.dataset.edit)));
  root.querySelectorAll('[data-del]').forEach((b) => b.addEventListener('click', async () => {
    if (!confirm('Delete this property permanently?')) return;
    try { await api('/properties/' + b.dataset.del, { method: 'DELETE' }); toast('Property deleted.'); loadDashboard(); } catch (e) { toast(e.message); }
  }));
  root.querySelectorAll('[data-renew]').forEach((b) => b.addEventListener('click', async () => {
    try { await api('/properties/' + b.dataset.renew + '/renew', { method: 'POST' }); toast('Listing renewed.'); loadDashboard(); } catch (e) { toast(e.message); }
  }));
  root.querySelectorAll('[data-avail]').forEach((b) => b.addEventListener('click', async () => {
    const p = findCached(+b.dataset.avail); const next = p && p.availability === 'available' ? (p.listingType === 'rent' ? 'rented' : 'sold') : 'available';
    try { await api('/properties/' + b.dataset.avail + '/availability', { method: 'PATCH', body: { availability: next } }); toast('Availability updated to ' + next + '.'); loadDashboard(); } catch (e) { toast(e.message); }
  }));
}
let cache = new Map();
function cacheProps(list) { (list || []).forEach((p) => cache.set(p.id, p)); }
function findCached(id) { return cache.get(id); }
function refreshCurrentLists() { loadHome(); if (!$('view-favorites').classList.contains('hidden')) loadFavorites(); }

/* ── Home + search ─────────────────────────────────────────────────────── */
async function loadHome() {
  try {
    const featured = await api('/properties?featured=1');
    cacheProps(featured.properties);
    $('featuredGrid').innerHTML = featured.properties.length ? featured.properties.map((p) => cardHTML(p)).join('') : '<p class="muted">No featured properties yet.</p>';
    bindCards($('featuredGrid'));
    const recent = await api('/properties?sort=newest');
    cacheProps(recent.properties);
    $('recentGrid').innerHTML = recent.properties.slice(0, 8).map((p) => cardHTML(p)).join('') || '<p class="muted">No properties yet. Be the first to post one — it is free.</p>';
    bindCards($('recentGrid'));
    fillCitySelects(recent.cities || []);
  } catch (e) { $('featuredGrid').innerHTML = '<p class="muted">' + esc(e.message) + '</p>'; }
}
function fillCitySelects(cities) {
  state.cities = cities;
  for (const id of ['heroCity', 'fCity']) {
    const sel = $(id); const cur = sel.value;
    sel.innerHTML = '<option value="">All Cities</option>' + cities.map((c) => `<option ${c === cur ? 'selected' : ''}>${esc(c)}</option>`).join('');
  }
}
async function runSearch(preset = {}) {
  const q = new URLSearchParams();
  const vals = {
    text: $('fText').value, city: $('fCity').value, type: $('fType').value, listingType: $('fListing').value,
    category: $('fCategory').value, minPrice: $('fMinPrice').value, maxPrice: $('fMaxPrice').value,
    bedrooms: $('fBedrooms').value, minArea: $('fMinArea').value, maxArea: $('fMaxArea').value,
    furnishing: $('fFurnishing').value, sort: $('fSort').value, ...preset,
  };
  for (const [k, v] of Object.entries(vals)) if (v) q.set(k, v);
  try {
    const r = await api('/properties?' + q.toString());
    cacheProps(r.properties);
    $('searchCount').textContent = r.count + ' propert' + (r.count === 1 ? 'y' : 'ies') + ' found. DEMO badges mark sample listings.';
    $('searchGrid').innerHTML = r.properties.map((p) => cardHTML(p)).join('') || '<p class="muted">No properties match these filters. Try widening your budget or city.</p>';
    bindCards($('searchGrid'));
    fillCitySelects(r.cities || []);
  } catch (e) { toast(e.message); }
}
function goSearch(preset, title) {
  if (preset.listingType !== undefined) $('fListing').value = preset.listingType || '';
  if (preset.category) $('fCategory').value = preset.category;
  if (preset.type) $('fType').value = preset.type;
  if (preset.city) $('fCity').value = preset.city;
  if (preset.text !== undefined) $('fText').value = preset.text || '';
  $('searchTitle').textContent = title || 'Search Properties';
  show('search'); runSearch(preset);
}

/* ── Property detail ───────────────────────────────────────────────────── */
async function openProperty(id) {
  try {
    const r = await api('/properties/' + id);
    const p = r.property; state.currentProperty = p; cacheProps([p, ...r.similar]);
    const phone = p.contact.phone, wa = p.contact.whatsapp;
    const waNum = wa ? String(wa).replace(/[^0-9]/g, '') : '';
    $('detailWrap').innerHTML = `
      <button class="btn" onclick="history.length?history.back():show('home')">← Back</button>
      <div class="detail-head"><div><div class="badges">${badges(p)}</div><h1>${esc(p.title)}</h1>
      <p class="muted">📍 ${esc(p.locality || '')}${p.locality ? ', ' : ''}${esc(p.city)}, ${esc(p.state)} · Listed ${esc((p.createdAt || '').slice(0, 10))} · ${p.views} views</p></div>
      <div class="price" style="font-size:26px">${formatPrice(p)}</div></div>
      <div class="gallery">${(p.photos.length ? p.photos : ['/images/hero-banner.svg']).map((u) => `<img src="${esc(u)}" alt="Property photo">`).join('')}
      ${p.videoFile ? `<video controls src="${esc(p.videoFile)}"></video>` : ''}${p.videoUrl ? `<p><a href="${esc(p.videoUrl)}" target="_blank" rel="noopener">▶ Watch property video</a></p>` : ''}</div>
      <div class="kv">
        <div><b>Type</b>${esc(p.propertyType)} (${esc(p.category)})</div>
        <div><b>For</b>${p.listingType === 'rent' ? 'Rent' : 'Sale'}</div>
        ${p.areaValue ? `<div><b>Area</b>${p.areaValue} ${esc(p.areaUnit)}</div>` : ''}
        ${p.bedrooms ? `<div><b>Bedrooms</b>${p.bedrooms}</div>` : ''}${p.bathrooms ? `<div><b>Bathrooms</b>${p.bathrooms}</div>` : ''}
        <div><b>Furnishing</b>${esc(p.furnishing || '—')}</div><div><b>Parking</b>${esc(p.parking || '—')}</div>
        <div><b>Availability</b>${esc(p.availability)}</div>
        <div><b>Verification</b>${p.isVerified ? 'Verified by admin document check' : 'Not verified — verify documents yourself'}</div>
      </div>
      ${p.amenities.length ? '<p><b>Amenities:</b> ' + p.amenities.map(esc).join(', ') + '</p>' : ''}
      <p>${esc(p.description || '')}</p>
      <p><b>Owner / Seller:</b> ${esc(p.ownerName)}${p.contact.name && p.contact.name !== p.ownerName ? ' · Contact: ' + esc(p.contact.name) : ''}
      ${p.contact.email ? ' · ✉ ' + esc(p.contact.email) : ''}${phone ? ' · ☎ ' + esc(phone) : ''}</p>
      <p><a class="btn" href="https://www.google.com/maps/search/${encodeURIComponent([p.locality, p.city, p.state].filter(Boolean).join(', '))}" target="_blank" rel="noopener">Open in Maps</a></p>
      <div class="warning"><b>Fraud warning:</b> Visit the property and verify ownership documents (registry, seller ID) yourself before paying any amount. Never transfer an advance to an unknown account. ${p.isVerified ? '' : 'This property has NOT been verified by us.'}</div>
      <div class="actions" style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn primary" id="dContact">Contact Owner (Message)</button>
        ${phone ? `<a class="btn ok" href="tel:${esc(phone)}">Call Owner</a>` : ''}
        ${wa ? `<a class="btn ok" target="_blank" rel="noopener" href="https://wa.me/${waNum}">WhatsApp Owner</a>` : ''}
        <button class="btn" id="dVisit">Schedule Property Visit</button>
        <button class="btn" id="dReport">Report Listing</button>
        ${state.user ? `<button class="btn" id="dFav">${state.favIds.has(p.id) ? '♥ Saved' : '♡ Save to Favorites'}</button>` : ''}
      </div>
      <div id="detailAction"></div>
      <h2 class="section-title">Similar Properties</h2>
      <div class="cards">${r.similar.map((s) => cardHTML(s)).join('') || '<p class="muted">No similar properties right now.</p>'}</div>`;
    bindCards($('detailWrap'));
    $('dContact').addEventListener('click', () => detailForm('message'));
    $('dVisit').addEventListener('click', () => detailForm('visit'));
    $('dReport').addEventListener('click', () => detailForm('report'));
    const favBtn = $('dFav');
    if (favBtn) favBtn.addEventListener('click', async () => { const r2 = await api('/favorites/' + p.id, { method: 'POST' }); r2.favorite ? state.favIds.add(p.id) : state.favIds.delete(p.id); favBtn.textContent = r2.favorite ? '♥ Saved' : '♡ Save to Favorites'; });
    show('detail');
  } catch (e) { toast(e.message); }
}
function detailForm(kind) {
  if (!requireLogin('Please log in to contact the owner, schedule a visit or report a listing.')) return;
  const p = state.currentProperty; const w = $('detailAction');
  if (kind === 'message') {
    w.innerHTML = `<form class="dialog-form" id="df"><label>Your message to the owner<textarea id="dfText" rows="3" required placeholder="Namaste, I am interested in this property…"></textarea></label><button class="btn primary">Send Message</button></form>`;
    $('df').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/properties/' + p.id + '/contact', { method: 'POST', body: { body: $('dfText').value } }); w.innerHTML = '<p class="assistant-answer">Message sent. The owner can reply — see Dashboard → Inquiries &amp; Messages.</p>'; } catch (err) { toast(err.message); } });
  } else if (kind === 'visit') {
    w.innerHTML = `<form class="dialog-form" id="df"><label>Visit date &amp; time<input id="dfWhen" type="datetime-local" required></label><label>Note (optional)<input id="dfNote"></label><button class="btn primary">Request Visit</button></form>`;
    $('df').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/properties/' + p.id + '/visits', { method: 'POST', body: { visitAt: $('dfWhen').value, note: $('dfNote').value } }); w.innerHTML = '<p class="assistant-answer">Visit request sent. The owner can accept or decline it — track it in your Dashboard.</p>'; } catch (err) { toast(err.message); } });
  } else {
    w.innerHTML = `<form class="dialog-form" id="df"><label>Reason<select id="dfReason"><option>Fake / duplicate listing</option><option>Wrong price or details</option><option>Property already sold / rented</option><option>Fraud / asking advance payment</option><option>Other</option></select></label><label>Details (optional)<input id="dfDetails"></label><button class="btn danger">Submit Report</button></form>`;
    $('df').addEventListener('submit', async (e) => { e.preventDefault(); try { await api('/properties/' + p.id + '/report', { method: 'POST', body: { reason: $('dfReason').value, details: $('dfDetails').value } }); w.innerHTML = '<p class="assistant-answer">Report submitted. Our admin team will review this listing.</p>'; } catch (err) { toast(err.message); } });
  }
}

/* ── Post / edit property ──────────────────────────────────────────────── */
function resetPostForm() {
  state.editingId = null; $('postTitle').textContent = 'Post Your Property for Free'; $('postSubmit').textContent = 'Submit Property';
  $('postForm').reset(); $('pShowEmail').checked = true; $('postResult').textContent = '';
}
async function startEdit(id) {
  try {
    const mine = await api('/my/properties');
    const p = mine.properties.find((x) => x.id === id); if (!p) return toast('Property not found in your listings.');
    if (p.isDemo) return toast('Demo listings cannot be edited here.');
    state.editingId = id; show('sell');
    $('postTitle').textContent = 'Edit Property (changes go back to moderation)'; $('postSubmit').textContent = 'Save Changes';
    $('pTitle').value = p.title; $('pType').value = p.propertyType; $('pListing').value = p.listingType;
    $('pPrice').value = p.price; $('pState').value = p.state; $('pCity').value = p.city;
    $('pLocality').value = p.locality || ''; $('pAddress').value = p.address || '';
    $('pArea').value = p.areaValue ?? ''; $('pAreaUnit').value = p.areaUnit; $('pBedrooms').value = p.bedrooms ?? ''; $('pBathrooms').value = p.bathrooms ?? '';
    $('pFurnishing').value = p.furnishing || 'Not Applicable'; $('pParking').value = p.parking || 'None'; $('pAvailability').value = p.availability;
    $('pVideoUrl').value = p.videoUrl || ''; $('pDesc').value = p.description || '';
    $('pContactName').value = p.contact.name || ''; $('pContactPhone').value = p.contact.phone || ''; $('pContactWhatsapp').value = p.contact.whatsapp || ''; $('pContactEmail').value = p.contact.email || '';
    $('pShowPhone').checked = p.contact.showPhone; $('pShowWhatsapp').checked = p.contact.showWhatsapp; $('pShowEmail').checked = p.contact.showEmail;
    document.querySelectorAll('#pAmenities input').forEach((c) => { c.checked = p.amenities.includes(c.value); });
    toast('Editing — uploading new photos will replace the old ones.');
  } catch (e) { toast(e.message); }
}
$('postForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!requireLogin('Please log in to post a property.')) return;
  const fd = new FormData();
  const fields = { title: $('pTitle').value, property_type: $('pType').value, listing_type: $('pListing').value, price: $('pPrice').value,
    state: $('pState').value, city: $('pCity').value, locality: $('pLocality').value, address: $('pAddress').value,
    area_value: $('pArea').value, area_unit: $('pAreaUnit').value, bedrooms: $('pBedrooms').value, bathrooms: $('pBathrooms').value,
    furnishing: $('pFurnishing').value, parking: $('pParking').value, availability: $('pAvailability').value, video_url: $('pVideoUrl').value,
    description: $('pDesc').value, contact_name: $('pContactName').value, contact_phone: $('pContactPhone').value,
    contact_whatsapp: $('pContactWhatsapp').value, contact_email: $('pContactEmail').value,
    show_phone: $('pShowPhone').checked, show_whatsapp: $('pShowWhatsapp').checked, show_email: $('pShowEmail').checked };
  for (const [k, v] of Object.entries(fields)) fd.append(k, v);
  document.querySelectorAll('#pAmenities input:checked').forEach((c) => fd.append('amenities', c.value));
  for (const f of $('pPhotos').files) fd.append('photos', f);
  if ($('pVideo').files[0]) fd.append('video', $('pVideo').files[0]);
  try {
    const path = state.editingId ? '/properties/' + state.editingId : '/properties';
    const r = await api(path, { method: state.editingId ? 'PUT' : 'POST', body: fd });
    $('postResult').textContent = '✅ ' + (r.message || 'Saved.');
    toast('Property saved — pending admin approval.');
    state.editingId = null; setTimeout(() => show('dashboard'), 900);
  } catch (err) { $('postResult').textContent = '⚠ ' + err.message; }
});

/* ── Auth ──────────────────────────────────────────────────────────────── */
$('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { const r = await api('/auth/login', { method: 'POST', body: { email: $('lEmail').value, password: $('lPass').value } });
    setAuth(r.token, r.user); await loadFavIds(); toast('Welcome back, ' + r.user.name + '!'); show('dashboard');
  } catch (err) { $('loginResult').textContent = '⚠ ' + err.message; }
});
$('registerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { const r = await api('/auth/register', { method: 'POST', body: { name: $('rName').value, email: $('rEmail').value, phone: $('rPhone').value, password: $('rPass').value, role: $('rRole').value } });
    setAuth(r.token, r.user); toast('Account created. Welcome, ' + r.user.name + '!'); show('dashboard');
  } catch (err) { $('registerResult').textContent = '⚠ ' + err.message; }
});
$('navLogout').addEventListener('click', () => { setAuth(null, null); toast('Logged out.'); show('home'); loadHome(); });
async function loadFavIds() { if (!state.user) return; try { const r = await api('/my/favorite-ids'); state.favIds = new Set(r.ids); } catch { /* ignore */ } }

/* ── Favorites + compare ───────────────────────────────────────────────── */
async function loadFavorites() {
  if (!requireLogin('Please log in to see your favorites.')) return;
  try { const r = await api('/favorites'); cacheProps(r.properties);
    $('favGrid').innerHTML = r.properties.map((p) => cardHTML(p, { compare: true })).join('') || '<p class="muted">No favorites yet. Tap “♡ Favorite” on any property.</p>';
    bindCards($('favGrid')); $('compareWrap').innerHTML = '';
  } catch (e) { toast(e.message); }
}
$('compareBtn').addEventListener('click', () => {
  const ids = [...state.compareIds].slice(0, 3);
  if (ids.length < 2) return toast('Select at least 2 properties (tick Compare on their cards).');
  const props = ids.map(findCached).filter(Boolean);
  const rows = [['Price', formatPrice], ['Type', (p) => p.propertyType], ['For', (p) => p.listingType], ['City', (p) => p.city + ', ' + p.state],
    ['Locality', (p) => p.locality || '—'], ['Area', (p) => p.areaValue ? p.areaValue + ' ' + p.areaUnit : '—'], ['Bedrooms', (p) => p.bedrooms ?? '—'],
    ['Bathrooms', (p) => p.bathrooms ?? '—'], ['Furnishing', (p) => p.furnishing || '—'], ['Parking', (p) => p.parking || '—'],
    ['Amenities', (p) => p.amenities.join(', ') || '—'], ['Verified', (p) => p.isVerified ? 'Yes' : 'No']];
  $('compareWrap').innerHTML = '<table><tr><th></th>' + props.map((p) => '<th>' + esc(p.title) + '</th>').join('') + '</tr>' +
    rows.map(([label, fn]) => '<tr><th>' + label + '</th>' + props.map((p) => '<td>' + esc(fn(p)) + '</td>').join('') + '</tr>').join('') + '</table>';
});

/* ── Assistant ─────────────────────────────────────────────────────────── */
$('assistantForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('assistantAnswer').textContent = 'Searching the live database…';
  try { const r = await api('/assistant', { method: 'POST', body: { query: $('assistantInput').value } });
    cacheProps(r.properties);
    let txt = r.summary;
    if (r.glossary) txt = '📖 Glossary — ' + r.glossary.term + ': ' + r.glossary.text + (r.count ? '\n\n' + txt : '');
    $('assistantAnswer').textContent = txt + '\n\n' + r.note;
    $('assistantGrid').innerHTML = r.properties.map((p) => cardHTML(p)).join('');
    bindCards($('assistantGrid'));
  } catch (err) { $('assistantAnswer').textContent = '⚠ ' + err.message; }
});

/* ── Pricing / promotions ──────────────────────────────────────────────── */
async function loadPromoProperties() {
  if (!state.config) return;
  $('planGrid').innerHTML = state.config.plans.map((pl) => `<article class="card"><div class="body"><h3>${esc(pl.name)}</h3>
    <div class="price">₹${pl.priceInr.toLocaleString('en-IN')}</div><div class="muted">${esc(pl.unit)}</div><p>${esc(pl.description)}</p></div></article>`).join('');
  $('promoPlan').innerHTML = state.config.plans.map((pl) => `<option value="${pl.id}">${esc(pl.name)} — ₹${pl.priceInr}</option>`).join('');
  if (state.user) { try { const mine = await api('/my/properties'); $('promoProperty').innerHTML = '<option value="">— General / Premium plan (no single property) —</option>' + mine.properties.map((p) => `<option value="${p.id}">${esc(p.title)}</option>`).join(''); } catch { /* ignore */ } }
}
$('promoForm').addEventListener('submit', async (e) => {
  e.preventDefault(); if (!requireLogin('Please log in to request a service.')) return;
  try { const r = await api('/promotions', { method: 'POST', body: { planId: $('promoPlan').value, propertyId: $('promoProperty').value || null, note: $('promoNote').value } });
    $('promoResult').textContent = '✅ ' + r.message;
  } catch (err) { $('promoResult').textContent = '⚠ ' + err.message; }
});

/* ── Dashboard ─────────────────────────────────────────────────────────── */
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active')); t.classList.add('active');
  document.querySelectorAll('.tabpane').forEach((p) => p.classList.add('hidden'));
  $('tab-' + t.dataset.tab).classList.remove('hidden');
}));
async function loadDashboard() {
  if (!requireLogin('Please log in to see your dashboard.')) return;
  try {
    const mine = await api('/my/properties'); cacheProps(mine.properties);
    $('myGrid').innerHTML = mine.properties.map((p) => cardHTML(p, { mine: true })).join('') || '<p class="muted">You have not listed any property yet.</p>';
    bindCards($('myGrid'));
    const s = await api('/my/stats');
    $('sellerStats').textContent = `Your listings: ${s.stats.listings} · Total views: ${s.stats.totalViews} · Inquiry conversations: ${s.stats.inquiryThreads} · Pending visit requests: ${s.stats.pendingVisitRequests}`;
    const threads = await api('/threads');
    $('threadList').innerHTML = threads.threads.map((t) => `<div class="thread-item"><div><b>${esc(t.property_title)}</b> (${esc(t.city)})<br>
      <span class="muted">With: ${esc(state.user.id === t.buyer_id ? t.owner_name : t.buyer_name)} · ${esc((t.last_at || '').slice(0, 16))}</span><br>${esc(t.last_body || '')}</div>
      <button class="btn small primary" data-thread="${t.property_id}:${t.buyer_id}">Open</button></div>`).join('') || '<p class="muted">No conversations yet. Contact an owner from any property page.</p>';
    $('threadList').querySelectorAll('[data-thread]').forEach((b) => b.addEventListener('click', () => openThread(...b.dataset.thread.split(':').map(Number))));
    const visits = await api('/visits');
    $('visitList').innerHTML = visits.visits.map((v) => `<div class="list-row"><div><b>${esc(v.property_title)}</b> · ${esc(v.city)}<br>
      <span class="muted">${v.buyer_id === state.user.id ? 'Your visit' : 'Requested by ' + esc(v.buyer_name)} · ${esc(v.visit_at)} · Status: <b>${esc(v.status)}</b>${v.note ? ' · ' + esc(v.note) : ''}</span></div>
      ${v.owner_id === state.user.id && v.status === 'pending' ? `<span><button class="btn small ok" data-visit="${v.id}:accepted">Accept</button> <button class="btn small danger" data-visit="${v.id}:declined">Decline</button></span>` : ''}
      ${v.buyer_id === state.user.id && v.status === 'pending' ? `<button class="btn small" data-visit="${v.id}:cancelled">Cancel</button>` : ''}</div>`).join('') || '<p class="muted">No visit requests yet.</p>';
    $('visitList').querySelectorAll('[data-visit]').forEach((b) => b.addEventListener('click', async () => {
      const [id, status] = b.dataset.visit.split(':');
      try { await api('/visits/' + id, { method: 'PATCH', body: { status } }); toast('Visit ' + status + '.'); loadDashboard(); } catch (err) { toast(err.message); }
    }));
    const notifs = await api('/notifications');
    $('notifList').innerHTML = notifs.notifications.map((n) => `<div class="list-row"><div>${n.is_read ? '' : '🔵 '}${esc(n.text)}<br><span class="muted">${esc((n.created_at || '').slice(0, 16))} · ${esc(n.type)}</span></div></div>`).join('') || '<p class="muted">No notifications yet.</p>';
    $('profName').value = state.user.name || ''; $('profEmail').value = state.user.email; $('profPhone').value = state.user.phone || '';
    $('profWhatsapp').value = state.user.whatsapp || ''; $('profRole').value = state.user.role;
    const promos = await api('/my/promotions');
    $('myPromos').innerHTML = promos.requests.map((r) => `<div class="list-row"><div><b>${esc(r.plan_name)}</b> — ₹${r.price_inr} · ${esc(r.status)} · ${esc((r.created_at || '').slice(0, 10))}</div></div>`).join('') || '<p class="muted">No service requests yet.</p>';
    const recent = await api('/my/recent'); cacheProps(recent.properties);
    $('recentDashGrid').innerHTML = recent.properties.map((p) => cardHTML(p)).join('') || '<p class="muted">Nothing viewed yet.</p>';
    bindCards($('recentDashGrid'));
  } catch (e) { toast(e.message); }
}
async function openThread(propertyId, buyerId) {
  state.currentThread = { propertyId, buyerId };
  try { const r = await api('/threads/' + propertyId + '/' + buyerId);
    $('threadList').classList.add('hidden'); $('threadView').classList.remove('hidden');
    $('threadMessages').innerHTML = r.messages.map((m) => `<div class="msg ${m.sender_id === state.user.id ? 'mine' : ''}">${esc(m.body)}<small>${esc((m.created_at || '').slice(0, 16))}</small></div>`).join('');
    $('threadMessages').scrollTop = 1e6;
  } catch (e) { toast(e.message); }
}
$('threadBack').addEventListener('click', () => { $('threadView').classList.add('hidden'); $('threadList').classList.remove('hidden'); loadDashboard(); });
$('threadReply').addEventListener('submit', async (e) => {
  e.preventDefault(); const t = state.currentThread; if (!t) return;
  try { await api('/threads/' + t.propertyId + '/' + t.buyerId + '/messages', { method: 'POST', body: { body: $('threadReplyText').value } }); $('threadReplyText').value = ''; openThread(t.propertyId, t.buyerId); }
  catch (err) { toast(err.message); }
});
$('markReadBtn').addEventListener('click', async () => { try { await api('/notifications/read', { method: 'POST', body: {} }); loadDashboard(); } catch (e) { toast(e.message); } });
$('profileForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { const r = await api('/me', { method: 'PATCH', body: { name: $('profName').value, phone: $('profPhone').value, whatsapp: $('profWhatsapp').value, role: $('profRole').value } });
    state.user = r.user; localStorage.setItem('pd_user', JSON.stringify(r.user)); $('profileResult').textContent = '✅ Profile saved.';
  } catch (err) { $('profileResult').textContent = '⚠ ' + err.message; }
});

/* ── Admin ─────────────────────────────────────────────────────────────── */
async function loadAdmin() {
  if (!state.user || !state.user.isAdmin) { toast('Admin access only.'); show('home'); return; }
  try {
    const s = await api('/admin/stats');
    const byStatus = s.stats.listingsByStatus.map((x) => x.status + ': ' + x.c).join(', ');
    $('adminStats').textContent = `Users: ${s.stats.users} · Listings (${byStatus}) · Open reports: ${s.stats.openReports} · Promotion requests: ${s.stats.promotionRequests}`;
    const status = $('adminStatusFilter').value;
    const r = await api('/admin/properties' + (status ? '?status=' + status : ''));
    $('adminProps').innerHTML = r.properties.map((p) => `<div class="list-row"><div><b>${esc(p.title)}</b> ${badges(p)}<br>
      <span class="muted">${esc(p.city)} · ${formatPrice(p)} · Status: <b>${esc(p.status)}</b> · Owner: ${esc(p.ownerName)}</span></div>
      <span>
        ${p.status !== 'approved' ? `<button class="btn small ok" data-a="${p.id}:approve">Approve</button>` : ''}
        ${p.status !== 'rejected' ? `<button class="btn small" data-a="${p.id}:reject">Reject</button>` : ''}
        <button class="btn small" data-a="${p.id}:featured">${p.isFeatured ? 'Unfeature' : 'Feature'}</button>
        <button class="btn small" data-a="${p.id}:verified">${p.isVerified ? 'Unverify' : 'Mark Verified'}</button>
        <button class="btn small danger" data-a="${p.id}:delete">Remove</button>
      </span></div>`).join('') || '<p class="muted">No listings.</p>';
    $('adminProps').querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', async () => {
      const [id, action] = b.dataset.a.split(':');
      try {
        if (action === 'delete') { if (confirm('Remove this listing permanently?')) await api('/admin/properties/' + id, { method: 'DELETE' }); }
        else if (action === 'approve') await api('/admin/properties/' + id, { method: 'PATCH', body: { status: 'approved' } });
        else if (action === 'reject') await api('/admin/properties/' + id, { method: 'PATCH', body: { status: 'rejected' } });
        else if (action === 'featured') { const cur = r.properties.find((x) => x.id === +id); await api('/admin/properties/' + id, { method: 'PATCH', body: { isFeatured: !cur.isFeatured } }); }
        else if (action === 'verified') { const cur = r.properties.find((x) => x.id === +id); await api('/admin/properties/' + id, { method: 'PATCH', body: { isVerified: !cur.isVerified } }); }
        loadAdmin();
      } catch (err) { toast(err.message); }
    }));
    const reports = await api('/admin/reports');
    $('adminReports').innerHTML = reports.reports.map((x) => `<div class="list-row"><div><b>${esc(x.property_title)}</b> — ${esc(x.reason)}<br><span class="muted">By ${esc(x.reporter_name)} · ${esc(x.status)} ${x.details ? '· ' + esc(x.details) : ''}</span></div>
      ${x.status === 'open' ? `<button class="btn small ok" data-report="${x.id}">Resolve</button>` : ''}</div>`).join('') || '<p class="muted">No reports.</p>';
    $('adminReports').querySelectorAll('[data-report]').forEach((b) => b.addEventListener('click', async () => { await api('/admin/reports/' + b.dataset.report, { method: 'PATCH', body: {} }); loadAdmin(); }));
    const users = await api('/admin/users');
    $('adminUsers').innerHTML = users.users.map((u) => `<div class="list-row"><div><b>${esc(u.name)}</b> · ${esc(u.email)} · ${esc(u.role)}${u.isAdmin ? ' · ADMIN' : ''}${u.suspended ? ' · SUSPENDED' : ''}</div>
      ${!u.isAdmin ? `<button class="btn small ${u.suspended ? 'ok' : 'danger'}" data-user="${u.id}:${u.suspended ? 0 : 1}">${u.suspended ? 'Activate' : 'Suspend'}</button>` : ''}</div>`).join('');
    $('adminUsers').querySelectorAll('[data-user]').forEach((b) => b.addEventListener('click', async () => {
      const [id, susp] = b.dataset.user.split(':');
      await api('/admin/users/' + id, { method: 'PATCH', body: { suspended: susp === '1' } }); loadAdmin();
    }));
    const promos = await api('/admin/promotions');
    $('adminPromos').innerHTML = promos.requests.map((x) => `<div class="list-row"><div><b>${esc(x.plan_name)}</b> — ₹${x.price_inr} · by ${esc(x.user_name)}${x.property_title ? ' · ' + esc(x.property_title) : ''} · ${esc(x.status)}</div></div>`).join('') || '<p class="muted">No requests.</p>';
    const support = await api('/admin/support');
    $('adminSupport').innerHTML = support.messages.map((x) => `<div class="list-row"><div><b>${esc(x.name)}</b> (${esc(x.email)})<br>${esc(x.message)}</div></div>`).join('') || '<p class="muted">No support messages.</p>';
  } catch (e) { toast(e.message); }
}
$('adminRefresh').addEventListener('click', loadAdmin);
$('adminStatusFilter').addEventListener('change', loadAdmin);

/* ── Nav + misc wiring ─────────────────────────────────────────────────── */
document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => {
  const n = b.dataset.nav;
  if (n === 'buy') return goSearch({ listingType: 'sale' }, 'Buy Property');
  if (n === 'rent') return goSearch({ listingType: 'rent' }, 'Rent Property');
  if (n === 'sell') { if (!requireLogin('Please log in to post a property.')) return; state.editingId = null; return show('sell'); }
  if (n === 'favorites' && !state.user) return requireLogin('Please log in to see favorites.');
  if (n === 'dashboard' && !state.user) return requireLogin();
  if (n === 'admin' && !(state.user && state.user.isAdmin)) return toast('Admin access only.');
  show(n);
}));
$('menuBtn').addEventListener('click', () => $('mainNav').classList.toggle('open'));
$('heroSearch').addEventListener('submit', (e) => { e.preventDefault(); goSearch({ text: $('heroText').value, city: $('heroCity').value, type: $('heroType').value, listingType: $('heroListing').value }, 'Search Results'); });
$('filterForm').addEventListener('submit', (e) => { e.preventDefault(); runSearch(); });
$('clearFilters').addEventListener('click', () => { $('filterForm').reset(); runSearch(); });
$('supportForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  try { await api('/support', { method: 'POST', body: { name: $('supName').value, email: $('supEmail').value, message: $('supMsg').value } }); $('supportResult').textContent = '✅ Message sent to support.'; $('supportForm').reset(); }
  catch (err) { $('supportResult').textContent = '⚠ ' + err.message; }
});

/* ── Init ──────────────────────────────────────────────────────────────── */
(async function init() {
  try {
    const cfg = await api('/config'); state.config = cfg;
    $('brandName').textContent = cfg.brandName; $('brandTagline').textContent = cfg.tagline;
    $('heroTagline').textContent = cfg.tagline; $('footBrand').textContent = cfg.brandName; $('footTagline').textContent = cfg.tagline;
    document.title = cfg.brandName + ' — ' + cfg.tagline;
    $('heroType').innerHTML = '<option value="">All Types</option>' + cfg.propertyTypes.map((t) => `<option>${esc(t)}</option>`).join('');
    $('fType').innerHTML = $('heroType').innerHTML;
    $('pType').innerHTML = cfg.propertyTypes.map((t) => `<option>${esc(t)}</option>`).join('');
    $('fCategory').innerHTML = '<option value="">All Categories</option>' + cfg.categories.map((c) => `<option>${esc(c)}</option>`).join('');
    $('fFurnishing').innerHTML = '<option value="">Any Furnishing</option>' + cfg.furnishingOptions.map((f) => `<option>${esc(f)}</option>`).join('');
    $('pFurnishing').innerHTML = cfg.furnishingOptions.map((f) => `<option>${esc(f)}</option>`).join('');
    $('pParking').innerHTML = cfg.parkingOptions.map((f) => `<option>${esc(f)}</option>`).join('');
    $('pAmenities').innerHTML = cfg.amenities.map((a) => `<label><input type="checkbox" value="${esc(a)}"> ${esc(a)}</label>`).join('');
    const icons = { Residential: '🏠', Commercial: '🏢', Plots: '🗺️', 'Agricultural Land': '🌾' };
    $('categoryGrid').innerHTML = cfg.categories.map((c) => `<button class="cat" data-cat="${esc(c)}"><span class="ic">${icons[c] || '🏘️'}</span><b>${esc(c)}</b><span class="muted">Browse ${esc(c.toLowerCase())} properties →</span></button>`).join('');
    $('categoryGrid').querySelectorAll('[data-cat]').forEach((b) => b.addEventListener('click', () => goSearch({ category: b.dataset.cat }, b.dataset.cat + ' Properties')));
  } catch (e) { toast('Could not load site config: ' + e.message); }
  syncNav();
  if (state.user) { try { const me = await api('/me'); state.user = me.user; syncNav(); } catch { setAuth(null, null); } await loadFavIds(); }
  loadHome();
})();
