'use strict';

/**
 * Demo seed — creates the "Demo Owner" account and 7 clearly-labelled DEMO
 * properties (is_demo = 1, approved so they are visible, with a DEMO badge
 * in the UI). Run:  npm run seed
 * Re-run safely: existing demo properties are skipped.
 * Reset demos:  node server/seed.js --reset-demo   (deletes demo listings + demo owner)
 */

const crypto = require('node:crypto');
const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { db } = require('./db');
const { hashPassword } = require('./auth');
const config = require('./config');

const DEMO_EMAIL = 'demo.owner@propertydirect.local';

const DEMOS = [
  { title: 'Spacious 3 BHK House near Malviya Nagar', type: 'House', listing: 'sale', price: 4500000,
    state: 'Rajasthan', city: 'Jaipur', locality: 'Malviya Nagar', address: 'Demo address, Malviya Nagar, Jaipur',
    area: 1800, bedrooms: 3, bathrooms: 3, furnishing: 'Semi-Furnished', img: 'demo-house-jaipur',
    desc: 'A bright, well-ventilated independent house close to schools and the market. (Demo listing — sample data only.)',
    amenities: ['Water Supply 24x7', 'Garden', 'Near School', 'Vastu Compliant'], parking: 'Car' },
  { title: 'Residential Plot on Main Road', type: 'Plot', listing: 'sale', price: 1800000,
    state: 'Rajasthan', city: 'Jalore', locality: 'Main Road Area', address: 'Demo address, Main Road, Jalore',
    area: 2400, bedrooms: null, bathrooms: null, furnishing: 'Not Applicable', img: 'demo-plot-jalore',
    desc: 'Clear-title residential plot on a main road, suitable for building a home. (Demo listing — sample data only.)',
    amenities: ['Water Supply 24x7', 'Public Transport Nearby'], parking: 'None' },
  { title: 'Corner Shop in Busy Market', type: 'Shop', listing: 'rent', price: 25000,
    state: 'Rajasthan', city: 'Jaipur', locality: 'Raja Park', address: 'Demo address, Raja Park Market, Jaipur',
    area: 400, bedrooms: null, bathrooms: 1, furnishing: 'Unfurnished', img: 'demo-shop-rent',
    desc: 'High-footfall corner shop in a busy market, ideal for retail. Monthly rent listed. (Demo listing — sample data only.)',
    amenities: ['Near Market', 'Public Transport Nearby'], parking: 'Bike' },
  { title: 'Sunny 2 BHK Flat with Balcony', type: 'Flat', listing: 'sale', price: 3800000,
    state: 'Rajasthan', city: 'Jaipur', locality: 'Vaishali Nagar', address: 'Demo address, Vaishali Nagar, Jaipur',
    area: 1050, bedrooms: 2, bathrooms: 2, furnishing: 'Fully Furnished', img: 'demo-flat-2bhk',
    desc: 'Ready-to-move 2 BHK flat with lift, balcony and modular kitchen in a gated society. (Demo listing — sample data only.)',
    amenities: ['Lift', 'Power Backup', 'Balcony', 'Modular Kitchen', 'Gated Community', 'Security / CCTV'], parking: 'Bike + Car' },
  { title: 'Premium 4 BHK Villa with Private Garden', type: 'Villa', listing: 'sale', price: 12000000,
    state: 'Rajasthan', city: 'Udaipur', locality: 'Fateh Sagar Area', address: 'Demo address, Fateh Sagar, Udaipur',
    area: 3600, bedrooms: 4, bathrooms: 4, furnishing: 'Fully Furnished', img: 'demo-villa',
    desc: 'Premium villa with a private garden near the lake area. (Demo listing — sample data only.)',
    amenities: ['Garden', 'Power Backup', 'Security / CCTV', 'Pet Friendly'], parking: 'Bike + Car' },
  { title: 'Agricultural Land with Borewell', type: 'Agricultural Land', listing: 'sale', price: 3000000,
    state: 'Rajasthan', city: 'Jalore', locality: 'Village Road', address: 'Demo address, Village Road, Jalore',
    area: 43560, bedrooms: null, bathrooms: null, furnishing: 'Not Applicable', img: 'demo-agri-land',
    desc: 'Fertile agricultural land (1 acre = 43,560 sqft) with a borewell, on a village road. (Demo listing — sample data only.)',
    amenities: ['Water Supply 24x7'], parking: 'None' },
  { title: 'Modern 2 BHK Apartment for Rent', type: 'Apartment', listing: 'rent', price: 30000,
    state: 'Karnataka', city: 'Bengaluru', locality: 'Whitefield', address: 'Demo address, Whitefield, Bengaluru',
    area: 1200, bedrooms: 2, bathrooms: 2, furnishing: 'Semi-Furnished', img: 'demo-apartment',
    desc: 'Modern apartment near IT parks with lift and power backup. Monthly rent listed. (Demo listing — sample data only.)',
    amenities: ['Lift', 'Power Backup', 'Security / CCTV', 'Gated Community'], parking: 'Car' },
];

async function main() {
  if (process.argv.includes('--reset-demo')) {
    const owner = db.prepare('SELECT id FROM users WHERE email = ?').get(DEMO_EMAIL);
    if (owner) {
      db.prepare('DELETE FROM properties WHERE owner_id = ?').run(owner.id);
      db.prepare('DELETE FROM users WHERE id = ?').run(owner.id);
    }
    db.prepare('DELETE FROM properties WHERE is_demo = 1').run();
    console.log('Demo listings and Demo Owner removed.');
    return;
  }

  let owner = db.prepare('SELECT * FROM users WHERE email = ?').get(DEMO_EMAIL);
  if (!owner) {
    // The demo account is NOT a login account — its password is random and never disclosed.
    const randomPassword = crypto.randomBytes(24).toString('hex');
    const hash = await hashPassword(randomPassword);
    const info = db.prepare("INSERT INTO users (email, password_hash, name, role, is_demo) VALUES (?, ?, 'Demo Owner', 'owner', 1)")
      .run(DEMO_EMAIL, hash);
    owner = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    console.log('Created Demo Owner (not a login account).');
  }

  let created = 0;
  for (const d of DEMOS) {
    const existing = db.prepare('SELECT id FROM properties WHERE is_demo = 1 AND title = ?').get(d.title);
    if (existing) continue;
    const info = db.prepare(`INSERT INTO properties
      (owner_id, title, property_type, category, listing_type, price, state, city, locality, address, area_value, area_unit,
       bedrooms, bathrooms, furnishing, description, amenities, parking, contact_name, contact_email, show_email,
       show_phone, show_whatsapp, availability, status, is_demo)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sqft', ?, ?, ?, ?, ?, ?, 'Demo Owner', ?, 1, 0, 0, 'available', 'approved', 1)`)
      .run(owner.id, d.title, d.type, config.categoryForType[d.type], d.listing, d.price, d.state, d.city, d.locality,
        d.address, d.area, d.bedrooms, d.bathrooms, d.furnishing, d.desc, JSON.stringify(d.amenities), d.parking, DEMO_EMAIL);
    db.prepare('INSERT INTO property_photos (property_id, url) VALUES (?, ?)').run(info.lastInsertRowid, '/images/' + d.img + '.svg');
    created++;
  }
  console.log(`Seed complete: ${created} demo properties created, ${DEMOS.length - created} already existed.`);
  console.log('Demo listings are clearly badged DEMO in the UI. Delete them with: node server/seed.js --reset-demo');
}

main().catch((e) => { console.error(e); process.exit(1); });
