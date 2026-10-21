'use strict';

/**
 * Property Direct — static showcase page logic.
 * All data lives in this file (the 7 demo listings below, copied from the
 * project's demo seed data) and all searching/filtering happens here in
 * the browser. There is no server, no database and no network call:
 * accounts, posting and messaging exist only in the full server version.
 */

const LISTINGS = [
  { title: 'Spacious 3 BHK House near Malviya Nagar', type: 'House', category: 'Residential', listing: 'sale', price: 4500000,
    state: 'Rajasthan', city: 'Jaipur', locality: 'Malviya Nagar',
    area: 1800, bedrooms: 3, bathrooms: 3, furnishing: 'Semi-Furnished', parking: 'Car', img: 'demo-house-jaipur.svg',
    desc: 'A bright, well-ventilated independent house close to schools and the market. (Demo listing — sample data only.)',
    amenities: ['Water Supply 24x7', 'Garden', 'Near School', 'Vastu Compliant'] },
  { title: 'Residential Plot on Main Road', type: 'Plot', category: 'Plots', listing: 'sale', price: 1800000,
    state: 'Rajasthan', city: 'Jalore', locality: 'Main Road Area',
    area: 2400, bedrooms: null, bathrooms: null, furnishing: 'Not Applicable', parking: 'None', img: 'demo-plot-jalore.svg',
    desc: 'Clear-title residential plot on a main road, suitable for building a home. (Demo listing — sample data only.)',
    amenities: ['Water Supply 24x7', 'Public Transport Nearby'] },
  { title: 'Corner Shop in Busy Market', type: 'Shop', category: 'Commercial', listing: 'rent', price: 25000,
    state: 'Rajasthan', city: 'Jaipur', locality: 'Raja Park',
    area: 400, bedrooms: null, bathrooms: 1, furnishing: 'Unfurnished', parking: 'Bike', img: 'demo-shop-rent.svg',
    desc: 'High-footfall corner shop in a busy market, ideal for retail. Monthly rent listed. (Demo listing — sample data only.)',
    amenities: ['Near Market', 'Public Transport Nearby'] },
  { title: 'Sunny 2 BHK Flat with Balcony', type: 'Flat', category: 'Residential', listing: 'sale', price: 3800000,
    state: 'Rajasthan', city: 'Jaipur', locality: 'Vaishali Nagar',
    area: 1050, bedrooms: 2, bathrooms: 2, furnishing: 'Fully Furnished', parking: 'Bike + Car', img: 'demo-flat-2bhk.svg',
    desc: 'Ready-to-move 2 BHK flat with lift, balcony and modular kitchen in a gated society. (Demo listing — sample data only.)',
    amenities: ['Lift', 'Power Backup', 'Balcony', 'Modular Kitchen', 'Gated Community', 'Security / CCTV'] },
  { title: 'Premium 4 BHK Villa with Private Garden', type: 'Villa', category: 'Residential', listing: 'sale', price: 12000000,
    state: 'Rajasthan', city: 'Udaipur', locality: 'Fateh Sagar Area',
    area: 3600, bedrooms: 4, bathrooms: 4, furnishing: 'Fully Furnished', parking: 'Bike + Car', img: 'demo-villa.svg',
    desc: 'Premium villa with a private garden near the lake area. (Demo listing — sample data only.)',
    amenities: ['Garden', 'Power Backup', 'Security / CCTV', 'Pet Friendly'] },
  { title: 'Agricultural Land with Borewell', type: 'Agricultural Land', category: 'Agricultural Land', listing: 'sale', price: 3000000,
    state: 'Rajasthan', city: 'Jalore', locality: 'Village Road',
    area: 43560, bedrooms: null, bathrooms: null, furnishing: 'Not Applicable', parking: 'None', img: 'demo-agri-land.svg',
    desc: 'Fertile agricultural land (1 acre = 43,560 sqft) with a borewell, on a village road. (Demo listing — sample data only.)',
    amenities: ['Water Supply 24x7'] },
  { title: 'Modern 2 BHK Apartment for Rent', type: 'Apartment', category: 'Residential', listing: 'rent', price: 30000,
    state: 'Karnataka', city: 'Bengaluru', locality: 'Whitefield',
    area: 1200, bedrooms: 2, bathrooms: 2, furnishing: 'Semi-Furnished', parking: 'Car', img: 'demo-apartment.svg',
    desc: 'Modern apartment near IT parks with lift and power backup. Monthly rent listed. (Demo listing — sample data only.)',
    amenities: ['Lift', 'Power Backup', 'Security / CCTV', 'Gated Community'] },
];

const $ = (id) => document.getElementById(id);

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* Same price style as the full version: rent per month, Lakh / Cr for sale. */
function formatPrice(p) {
  if (p.listing === 'rent') return '₹' + p.price.toLocaleString('en-IN') + '/month';
  if (p.price >= 10000000) return '₹' + (p.price / 10000000).toFixed(p.price % 10000000 ? 2 : 0) + ' Cr';
  if (p.price >= 100000) return '₹' + (p.price / 100000).toFixed(p.price % 100000 ? 1 : 0) + ' Lakh';
  return '₹' + p.price.toLocaleString('en-IN');
}

function specLine(p) {
  const parts = [];
  if (p.bedrooms != null) parts.push(p.bedrooms + ' Bed');
  if (p.bathrooms != null) parts.push(p.bathrooms + ' Bath');
  parts.push(p.area.toLocaleString('en-IN') + ' sq ft');
  if (p.furnishing && p.furnishing !== 'Not Applicable') parts.push(p.furnishing);
  if (p.parking && p.parking !== 'None') parts.push('Parking: ' + p.parking);
  return parts.join(' · ');
}

function cardHtml(p) {
  const isRent = p.listing === 'rent';
  return '<article class="card">'
    + '<img src="images/' + esc(p.img) + '" alt="' + esc(p.title) + '">'
    + '<div class="body">'
    + '<div class="badges"><span class="badge demo">DEMO</span>'
    + '<span class="badge' + (isRent ? ' rent' : '') + '">' + (isRent ? 'For Rent' : 'For Sale') + '</span>'
    + '<span class="badge">' + esc(p.type) + '</span></div>'
    + '<h3>' + esc(p.title) + '</h3>'
    + '<div class="price">' + formatPrice(p) + '</div>'
    + '<div class="muted">' + esc(p.locality) + ', ' + esc(p.city) + ', ' + esc(p.state) + '</div>'
    + '<div>' + esc(specLine(p)) + '</div>'
    + '<p class="muted">' + esc(p.desc) + '</p>'
    + '<div class="amenities">' + p.amenities.map((a) => '<span class="amenity">' + esc(a) + '</span>').join('') + '</div>'
    + '</div></article>';
}

function currentFilters() {
  return {
    text: $('fText').value.trim().toLowerCase(),
    city: $('fCity').value,
    listing: $('fListing').value,
    type: $('fType').value,
    category: $('fCategory').value,
    maxBudget: $('fMaxBudget').value === '' ? null : Number($('fMaxBudget').value),
    sort: $('fSort').value,
  };
}

function applyFilters() {
  const f = currentFilters();
  let out = LISTINGS.filter((p) => {
    if (f.city && p.city !== f.city) return false;
    if (f.listing && p.listing !== f.listing) return false;
    if (f.type && p.type !== f.type) return false;
    if (f.category && p.category !== f.category) return false;
    if (f.maxBudget != null && p.price > f.maxBudget) return false;
    if (f.text) {
      const hay = (p.title + ' ' + p.type + ' ' + p.category + ' ' + p.city + ' ' + p.locality + ' ' + p.state).toLowerCase();
      if (!hay.includes(f.text)) return false;
    }
    return true;
  });
  if (f.sort === 'price_asc') out = out.slice().sort((a, b) => a.price - b.price);
  if (f.sort === 'price_desc') out = out.slice().sort((a, b) => b.price - a.price);
  if (f.sort === 'area_desc') out = out.slice().sort((a, b) => b.area - a.area);

  $('listingGrid').innerHTML = out.length
    ? out.map(cardHtml).join('')
    : '<div class="no-results"><h3>No demo listings match those filters</h3><p class="muted">Try a different city, type or budget — or clear the filters to see all 7 demo listings again.</p></div>';
  $('searchCount').textContent = 'Showing ' + out.length + ' of ' + LISTINGS.length + ' demo listings';
}

function fillSelect(id, values) {
  const sel = $(id);
  values.forEach((v) => {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = v;
    sel.appendChild(o);
  });
}

function init() {
  fillSelect('fCity', [...new Set(LISTINGS.map((p) => p.city))].sort());
  fillSelect('fType', [...new Set(LISTINGS.map((p) => p.type))].sort());

  ['fText', 'fCity', 'fListing', 'fType', 'fCategory', 'fMaxBudget', 'fSort'].forEach((id) => {
    $(id).addEventListener('input', applyFilters);
    $(id).addEventListener('change', applyFilters);
  });
  $('filterForm').addEventListener('submit', (e) => { e.preventDefault(); applyFilters(); });

  $('clearFilters').addEventListener('click', () => {
    $('filterForm').reset();
    $('heroText').value = '';
    $('heroListing').value = '';
    applyFilters();
  });

  $('heroSearch').addEventListener('submit', (e) => {
    e.preventDefault();
    $('fText').value = $('heroText').value;
    $('fListing').value = $('heroListing').value;
    applyFilters();
    $('listings').scrollIntoView({ behavior: 'smooth' });
  });

  document.querySelectorAll('[data-preset-listing]').forEach((a) => {
    a.addEventListener('click', () => {
      $('fListing').value = a.getAttribute('data-preset-listing');
      $('heroListing').value = a.getAttribute('data-preset-listing');
      applyFilters();
    });
  });

  document.querySelectorAll('[data-category]').forEach((b) => {
    b.addEventListener('click', () => {
      $('fCategory').value = b.getAttribute('data-category');
      applyFilters();
      $('listings').scrollIntoView({ behavior: 'smooth' });
    });
  });

  $('menuBtn').addEventListener('click', () => $('mainNav').classList.toggle('open'));
  document.querySelectorAll('#mainNav a').forEach((a) => {
    a.addEventListener('click', () => $('mainNav').classList.remove('open'));
  });

  applyFilters();
}

document.addEventListener('DOMContentLoaded', init);
