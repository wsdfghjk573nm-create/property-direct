'use strict';

/**
 * API routes for Property Direct.
 *
 * Public:    /api/config, /api/properties (search), /api/properties/:id,
 *            /api/assistant, /api/plans, /api/support
 * Accounts:  /api/auth/register, /api/auth/login, /api/me
 * Owner:     POST/PUT/DELETE /api/properties, /api/my/*
 * Social:    favorites, messages (threads), visits, reports, notifications
 * Business:  /api/promotions (stores a request — never charges anyone)
 * Admin:     /api/admin/* (admin role only)
 */

const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const multer = require('multer');
const config = require('./config');
const { db, notify, UPLOAD_DIR } = require('./db');
const { hashPassword, verifyPassword, signToken, publicUser, authRequired, authOptional, adminRequired } = require('./auth');
const { assistantSearch } = require('./assistant');

const router = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const now = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

/* ── Uploads (photos + optional video, validated by type + size) ───────── */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = path.extname(file.originalname || '').toLowerCase().replace(/[^.a-z0-9]/g, '');
    cb(null, Date.now() + '-' + Math.random().toString(36).slice(2, 9) + safe);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024, files: 9 },
  fileFilter: (req, file, cb) => {
    if (file.fieldname === 'photos') {
      if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) return cb(null, true);
      return cb(new Error('Photos must be JPG, PNG, WebP or GIF images.'));
    }
    if (file.fieldname === 'video') {
      if (/^video\/(mp4|webm|quicktime)$/.test(file.mimetype)) return cb(null, true);
      return cb(new Error('Video must be MP4, WebM or MOV.'));
    }
    return cb(new Error('Unexpected file field.'));
  },
});
const uploadFields = upload.fields([{ name: 'photos', maxCount: 8 }, { name: 'video', maxCount: 1 }]);
function withUpload(req, res, next) {
  uploadFields(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Upload failed.' });
    // Photo size cap (5 MB each) — multer's global cap is for the video.
    for (const f of (req.files && req.files.photos) || []) {
      if (f.size > 5 * 1024 * 1024) {
        fs.unlink(f.path, () => {});
        return res.status(400).json({ error: 'Each photo must be 5 MB or smaller.' });
      }
    }
    return next();
  });
}

/* ── Serialising ───────────────────────────────────────────────────────── */
function photosFor(id) {
  return db.prepare('SELECT url FROM property_photos WHERE property_id = ? ORDER BY id').all(id).map((r) => r.url);
}

function serialize(row, viewer) {
  if (!row) return null;
  const owner = db.prepare('SELECT id, name, role FROM users WHERE id = ?').get(row.owner_id);
  const isOwner = viewer && viewer.id === row.owner_id;
  const isAdmin = viewer && viewer.is_admin;
  const full = isOwner || isAdmin;
  let amenities = [];
  try { amenities = JSON.parse(row.amenities || '[]'); } catch { amenities = []; }
  return {
    id: row.id, ownerId: row.owner_id, ownerName: owner ? owner.name : 'Owner',
    title: row.title, propertyType: row.property_type, category: row.category,
    listingType: row.listing_type, price: row.price,
    state: row.state, city: row.city, locality: row.locality, address: full ? row.address : (row.address ? row.address : null),
    areaValue: row.area_value, areaUnit: row.area_unit,
    bedrooms: row.bedrooms, bathrooms: row.bathrooms, furnishing: row.furnishing,
    description: row.description, amenities, parking: row.parking,
    photos: photosFor(row.id), videoUrl: row.video_url || null, videoFile: row.video_file || null,
    availability: row.availability, status: row.status,
    isDemo: !!row.is_demo, isFeatured: !!row.is_featured, isVerified: !!row.is_verified,
    views: row.views, createdAt: row.created_at, updatedAt: row.updated_at,
    contact: {
      name: row.contact_name || (owner ? owner.name : null),
      phone: (row.show_phone || full) ? row.contact_phone : null,
      whatsapp: (row.show_whatsapp || full) ? row.contact_whatsapp : null,
      email: (row.show_email || full) ? row.contact_email : null,
      showPhone: !!row.show_phone, showWhatsapp: !!row.show_whatsapp, showEmail: !!row.show_email,
    },
  };
}

const bool = (v) => v === true || v === 'true' || v === '1' || v === 1 || v === 'on';
const intOrNull = (v) => { if (v === undefined || v === null || v === '') return null; const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };

/* ── Config ────────────────────────────────────────────────────────────── */
router.get('/config', (req, res) => {
  res.json({
    brandName: config.brandName, tagline: config.brandTagline,
    propertyTypes: config.propertyTypes, categories: config.categories,
    furnishingOptions: config.furnishingOptions, areaUnits: config.areaUnits,
    amenities: config.amenities, parkingOptions: config.parkingOptions,
    roles: config.roles, plans: config.plans, glossary: config.glossary,
  });
});
router.get('/plans', (req, res) => res.json({ plans: config.plans }));

/* ── Auth ──────────────────────────────────────────────────────────────── */
router.post('/auth/register', async (req, res) => {
  const { name, email, password, phone, whatsapp, role } = req.body || {};
  const cleanEmail = String(email || '').trim().toLowerCase();
  if (!name || !String(name).trim()) return res.status(400).json({ error: 'Please enter your name.' });
  if (!EMAIL_RE.test(cleanEmail)) return res.status(400).json({ error: 'Please enter a valid email address.' });
  if (!password || String(password).length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  const cleanRole = config.roles.includes(role) ? role : 'buyer';
  if (db.prepare('SELECT id FROM users WHERE email = ?').get(cleanEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists. Please log in.' });
  }
  const hash = await hashPassword(String(password));
  const info = db.prepare('INSERT INTO users (email, password_hash, name, phone, whatsapp, role) VALUES (?, ?, ?, ?, ?, ?)')
    .run(cleanEmail, hash, String(name).trim().slice(0, 80), phone || null, whatsapp || null, cleanRole);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  return res.status(201).json({ token: signToken(user), user: publicUser(user) });
});

router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(email || '').trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'No account found with this email. Please register first.' });
  if (user.suspended) return res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
  if (!(await verifyPassword(String(password || ''), user.password_hash))) {
    return res.status(401).json({ error: 'Incorrect password. Please try again.' });
  }
  return res.json({ token: signToken(user), user: publicUser(user) });
});

router.get('/me', authRequired, (req, res) => res.json({ user: publicUser(req.user) }));

router.patch('/me', authRequired, (req, res) => {
  const { name, phone, whatsapp, role } = req.body || {};
  const cleanRole = config.roles.includes(role) ? role : req.user.role;
  db.prepare('UPDATE users SET name = ?, phone = ?, whatsapp = ?, role = ? WHERE id = ?')
    .run(name ? String(name).trim().slice(0, 80) : req.user.name, phone ?? req.user.phone, whatsapp ?? req.user.whatsapp, cleanRole, req.user.id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  return res.json({ user: publicUser(user) });
});

/* ── Property search (public — approved listings only) ─────────────────── */
router.get('/properties', authOptional, (req, res) => {
  const q = req.query;
  const where = ["status = 'approved'"];
  const params = [];
  if (q.listingType && config.listingTypes.includes(q.listingType)) { where.push('listing_type = ?'); params.push(q.listingType); }
  if (q.category && config.categories.includes(q.category)) { where.push('category = ?'); params.push(q.category); }
  if (q.type && config.propertyTypes.includes(q.type)) { where.push('property_type = ?'); params.push(q.type); }
  if (q.city) { where.push('LOWER(city) = LOWER(?)'); params.push(String(q.city).trim()); }
  if (q.furnishing) { where.push('furnishing = ?'); params.push(String(q.furnishing)); }
  if (q.text) {
    where.push('(LOWER(locality) LIKE ? OR LOWER(title) LIKE ? OR LOWER(address) LIKE ? OR LOWER(city) LIKE ?)');
    const like = '%' + String(q.text).trim().toLowerCase() + '%';
    params.push(like, like, like, like);
  }
  if (q.minPrice && Number.isFinite(+q.minPrice)) { where.push('price >= ?'); params.push(+q.minPrice); }
  if (q.maxPrice && Number.isFinite(+q.maxPrice)) { where.push('price <= ?'); params.push(+q.maxPrice); }
  if (q.bedrooms && Number.isFinite(+q.bedrooms)) { where.push('bedrooms = ?'); params.push(+q.bedrooms); }
  if (q.minArea && Number.isFinite(+q.minArea)) { where.push('area_value >= ?'); params.push(+q.minArea); }
  if (q.maxArea && Number.isFinite(+q.maxArea)) { where.push('area_value <= ?'); params.push(+q.maxArea); }
  if (q.featured === '1') where.push('is_featured = 1');
  if (q.includeUnavailable !== '1') where.push("availability = 'available'");
  const sort = { newest: 'created_at DESC', price_asc: 'price ASC', price_desc: 'price DESC' }[q.sort] || 'is_featured DESC, created_at DESC';
  const rows = db.prepare(`SELECT * FROM properties WHERE ${where.join(' AND ')} ORDER BY ${sort} LIMIT 200`).all(...params);
  const cities = db.prepare("SELECT DISTINCT city FROM properties WHERE status = 'approved' ORDER BY city").all().map((r) => r.city);
  return res.json({ properties: rows.map((r) => serialize(r, req.user)), cities, count: rows.length });
});

/* ── Property detail ───────────────────────────────────────────────────── */
router.get('/properties/:id', authOptional, (req, res) => {
  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Property not found.' });
  const isOwner = req.user && req.user.id === row.owner_id;
  const isAdmin = req.user && req.user.is_admin;
  if (row.status !== 'approved' && !isOwner && !isAdmin) return res.status(404).json({ error: 'Property not found.' });
  if (!isOwner) {
    db.prepare('UPDATE properties SET views = views + 1 WHERE id = ?').run(row.id);
    row.views += 1;
  }
  if (req.user) {
    db.prepare('INSERT INTO recent_views (user_id, property_id, viewed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, property_id) DO UPDATE SET viewed_at = excluded.viewed_at')
      .run(req.user.id, row.id, now());
  }
  const similar = db.prepare(
    "SELECT * FROM properties WHERE status = 'approved' AND availability = 'available' AND id != ? AND (LOWER(city) = LOWER(?) OR property_type = ?) ORDER BY is_featured DESC, created_at DESC LIMIT 4"
  ).all(row.id, row.city, row.property_type);
  return res.json({ property: serialize(row, req.user), similar: similar.map((r) => serialize(r, req.user)) });
});

/* ── Create / edit / delete properties ─────────────────────────────────── */
function propertyFields(body) {
  const amenities = Array.isArray(body.amenities) ? body.amenities.filter((a) => config.amenities.includes(a))
    : (typeof body.amenities === 'string' && body.amenities ? body.amenities.split(',').map((s) => s.trim()).filter((a) => config.amenities.includes(a)) : []);
  const type = config.propertyTypes.includes(body.property_type) ? body.property_type : null;
  return {
    title: String(body.title || '').trim().slice(0, 140),
    property_type: type,
    category: type ? config.categoryForType[type] : null,
    listing_type: config.listingTypes.includes(body.listing_type) ? body.listing_type : null,
    price: intOrNull(body.price),
    state: String(body.state || '').trim().slice(0, 60),
    city: String(body.city || '').trim().slice(0, 60),
    locality: String(body.locality || '').trim().slice(0, 120) || null,
    address: String(body.address || '').trim().slice(0, 300) || null,
    area_value: body.area_value === '' || body.area_value == null ? null : Number(body.area_value),
    area_unit: config.areaUnits.includes(body.area_unit) ? body.area_unit : 'sqft',
    bedrooms: intOrNull(body.bedrooms), bathrooms: intOrNull(body.bathrooms),
    furnishing: config.furnishingOptions.includes(body.furnishing) ? body.furnishing : 'Not Applicable',
    description: String(body.description || '').trim().slice(0, 5000) || null,
    amenities: JSON.stringify(amenities),
    parking: config.parkingOptions.includes(body.parking) ? body.parking : 'None',
    contact_name: String(body.contact_name || '').trim().slice(0, 80) || null,
    contact_phone: String(body.contact_phone || '').trim().slice(0, 30) || null,
    contact_email: String(body.contact_email || '').trim().slice(0, 120) || null,
    contact_whatsapp: String(body.contact_whatsapp || '').trim().slice(0, 30) || null,
    show_phone: bool(body.show_phone) ? 1 : 0,
    show_whatsapp: bool(body.show_whatsapp) ? 1 : 0,
    show_email: body.show_email === undefined ? 1 : (bool(body.show_email) ? 1 : 0),
    video_url: String(body.video_url || '').trim().slice(0, 500) || null,
    availability: ['available', 'sold', 'rented', 'unavailable'].includes(body.availability) ? body.availability : 'available',
  };
}

function validateFields(f) {
  if (!f.title) return 'Property title is required.';
  if (!f.property_type) return 'Please choose a valid property type.';
  if (!f.listing_type) return 'Please choose For Sale or For Rent.';
  if (!f.price || f.price <= 0) return 'Please enter a valid price / rent (a positive number).';
  if (!f.state) return 'State is required.';
  if (!f.city) return 'City is required.';
  if (f.area_value !== null && (!Number.isFinite(f.area_value) || f.area_value < 0)) return 'Area must be a valid number.';
  return null;
}

function duplicateOf(ownerId, f, excludeId) {
  const rows = db.prepare("SELECT id, title, address, city FROM properties WHERE owner_id = ? AND status != 'rejected' AND LOWER(city) = LOWER(?)").all(ownerId, f.city);
  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return rows.find((r) => r.id !== excludeId && (norm(r.title) === norm(f.title) || (f.address && norm(r.address) === norm(f.address)))) || null;
}

router.post('/properties', authRequired, withUpload, (req, res) => {
  const f = propertyFields(req.body || {});
  const err = validateFields(f);
  if (err) return res.status(400).json({ error: err });
  const dup = duplicateOf(req.user.id, f, null);
  if (dup) return res.status(409).json({ error: 'Duplicate listing detected: you already have a similar property with the same title or address in this city. Please edit that listing instead of creating a duplicate.', duplicateId: dup.id });
  const info = db.prepare(`INSERT INTO properties
    (owner_id, title, property_type, category, listing_type, price, state, city, locality, address, area_value, area_unit,
     bedrooms, bathrooms, furnishing, description, amenities, parking, contact_name, contact_phone, contact_email,
     contact_whatsapp, show_phone, show_whatsapp, show_email, video_url, video_file, availability, status)
    VALUES (@owner_id, @title, @property_type, @category, @listing_type, @price, @state, @city, @locality, @address,
     @area_value, @area_unit, @bedrooms, @bathrooms, @furnishing, @description, @amenities, @parking, @contact_name,
     @contact_phone, @contact_email, @contact_whatsapp, @show_phone, @show_whatsapp, @show_email, @video_url,
     @video_file, @availability, 'pending')`)
    .run({ ...f, owner_id: req.user.id, video_file: req.files && req.files.video ? '/uploads/' + path.basename(req.files.video[0].path) : null });
  for (const file of (req.files && req.files.photos) || []) {
    db.prepare('INSERT INTO property_photos (property_id, url) VALUES (?, ?)').run(info.lastInsertRowid, '/uploads/' + path.basename(file.path));
  }
  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(info.lastInsertRowid);
  return res.status(201).json({ property: serialize(row, req.user), message: 'Property submitted. It will appear in search after admin approval (moderation).' });
});

function loadOwned(req, res) {
  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(Number(req.params.id));
  if (!row) { res.status(404).json({ error: 'Property not found.' }); return null; }
  if (row.owner_id !== req.user.id && !req.user.is_admin) { res.status(403).json({ error: 'You can only manage your own properties.' }); return null; }
  return row;
}

router.put('/properties/:id', authRequired, withUpload, (req, res) => {
  const row = loadOwned(req, res); if (!row) return;
  const f = propertyFields({ ...row, ...(req.body || {}),
    property_type: (req.body && req.body.property_type) || row.property_type,
    listing_type: (req.body && req.body.listing_type) || row.listing_type,
    amenities: req.body && req.body.amenities !== undefined ? req.body.amenities : JSON.parse(row.amenities || '[]') });
  const err = validateFields(f); if (err) return res.status(400).json({ error: err });
  const dup = duplicateOf(req.user.id, f, row.id);
  if (dup) return res.status(409).json({ error: 'Duplicate listing detected: another of your listings has the same title or address in this city.', duplicateId: dup.id });
  db.prepare(`UPDATE properties SET title=@title, property_type=@property_type, category=@category, listing_type=@listing_type,
    price=@price, state=@state, city=@city, locality=@locality, address=@address, area_value=@area_value, area_unit=@area_unit,
    bedrooms=@bedrooms, bathrooms=@bathrooms, furnishing=@furnishing, description=@description, amenities=@amenities,
    parking=@parking, contact_name=@contact_name, contact_phone=@contact_phone, contact_email=@contact_email,
    contact_whatsapp=@contact_whatsapp, show_phone=@show_phone, show_whatsapp=@show_whatsapp, show_email=@show_email,
    video_url=@video_url, availability=@availability, status='pending', updated_at=datetime('now') WHERE id=@id`)
    .run({ ...f, id: row.id });
  if (req.files && req.files.photos && req.files.photos.length) {
    db.prepare('DELETE FROM property_photos WHERE property_id = ?').run(row.id);
    for (const file of req.files.photos) db.prepare('INSERT INTO property_photos (property_id, url) VALUES (?, ?)').run(row.id, '/uploads/' + path.basename(file.path));
  }
  const updated = db.prepare('SELECT * FROM properties WHERE id = ?').get(row.id);
  return res.json({ property: serialize(updated, req.user), message: 'Property updated. Changes go back to moderation (pending) until an admin approves them.' });
});

router.patch('/properties/:id/availability', authRequired, (req, res) => {
  const row = loadOwned(req, res); if (!row) return;
  const a = req.body && req.body.availability;
  if (!['available', 'sold', 'rented', 'unavailable'].includes(a)) return res.status(400).json({ error: 'Invalid availability status.' });
  db.prepare("UPDATE properties SET availability = ?, updated_at = datetime('now') WHERE id = ?").run(a, row.id);
  return res.json({ property: serialize(db.prepare('SELECT * FROM properties WHERE id = ?').get(row.id), req.user) });
});

router.post('/properties/:id/renew', authRequired, (req, res) => {
  const row = loadOwned(req, res); if (!row) return;
  db.prepare("UPDATE properties SET updated_at = datetime('now') WHERE id = ?").run(row.id);
  return res.json({ property: serialize(db.prepare('SELECT * FROM properties WHERE id = ?').get(row.id), req.user), message: 'Listing renewed — its date has been refreshed.' });
});

router.delete('/properties/:id', authRequired, (req, res) => {
  const row = loadOwned(req, res); if (!row) return;
  db.prepare('DELETE FROM properties WHERE id = ?').run(row.id);
  return res.json({ ok: true });
});

/* ── Seller / buyer dashboards ─────────────────────────────────────────── */
router.get('/my/properties', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM properties WHERE owner_id = ? ORDER BY updated_at DESC').all(req.user.id);
  return res.json({ properties: rows.map((r) => serialize(r, req.user)) });
});

router.get('/my/stats', authRequired, (req, res) => {
  const mine = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(views),0) v FROM properties WHERE owner_id = ?').get(req.user.id);
  const inquiries = db.prepare('SELECT COUNT(DISTINCT property_id || \'-\' || buyer_id) c FROM messages WHERE owner_id = ?').get(req.user.id);
  const visits = db.prepare("SELECT COUNT(*) c FROM visits WHERE owner_id = ? AND status = 'pending'").get(req.user.id);
  return res.json({ stats: { listings: mine.c, totalViews: mine.v, inquiryThreads: inquiries.c, pendingVisitRequests: visits.c } });
});

router.post('/favorites/:id', authRequired, (req, res) => {
  const prop = db.prepare("SELECT * FROM properties WHERE id = ? AND status = 'approved'").get(Number(req.params.id));
  if (!prop) return res.status(404).json({ error: 'Property not found.' });
  const existing = db.prepare('SELECT 1 FROM favorites WHERE user_id = ? AND property_id = ?').get(req.user.id, prop.id);
  if (existing) {
    db.prepare('DELETE FROM favorites WHERE user_id = ? AND property_id = ?').run(req.user.id, prop.id);
    return res.json({ favorite: false });
  }
  db.prepare('INSERT INTO favorites (user_id, property_id) VALUES (?, ?)').run(req.user.id, prop.id);
  return res.json({ favorite: true });
});

router.get('/favorites', authRequired, (req, res) => {
  const rows = db.prepare('SELECT p.* FROM favorites f JOIN properties p ON p.id = f.property_id WHERE f.user_id = ? ORDER BY f.created_at DESC').all(req.user.id);
  return res.json({ properties: rows.map((r) => serialize(r, req.user)) });
});

router.get('/my/recent', authRequired, (req, res) => {
  const rows = db.prepare('SELECT p.* FROM recent_views rv JOIN properties p ON p.id = rv.property_id WHERE rv.user_id = ? ORDER BY rv.viewed_at DESC LIMIT 20').all(req.user.id);
  return res.json({ properties: rows.map((r) => serialize(r, req.user)) });
});

router.get('/my/favorite-ids', authRequired, (req, res) => {
  const rows = db.prepare('SELECT property_id FROM favorites WHERE user_id = ?').all(req.user.id);
  return res.json({ ids: rows.map((r) => r.property_id) });
});

/* ── Messaging, visits, reports, notifications ─────────────────────────── */
function approvedProperty(req, res) {
  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(Number(req.params.id));
  if (!row || row.status !== 'approved') { res.status(404).json({ error: 'Property not found.' }); return null; }
  return row;
}

router.post('/properties/:id/contact', authRequired, (req, res) => {
  const prop = approvedProperty(req, res); if (!prop) return;
  if (prop.owner_id === req.user.id) return res.status(400).json({ error: 'This is your own property — you cannot message yourself.' });
  const body = String((req.body && req.body.body) || '').trim().slice(0, 2000);
  if (!body) return res.status(400).json({ error: 'Please type a message first.' });
  const info = db.prepare('INSERT INTO messages (property_id, buyer_id, owner_id, sender_id, body) VALUES (?, ?, ?, ?, ?)')
    .run(prop.id, req.user.id, prop.owner_id, req.user.id, body);
  notify(prop.owner_id, 'message', `${req.user.name} is interested in "${prop.title}" and sent you a message.`, prop.id);
  return res.status(201).json({ message: db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid) });
});

router.get('/threads', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT m.property_id, m.buyer_id, p.title AS property_title, p.city,
      (SELECT body FROM messages WHERE property_id = m.property_id AND buyer_id = m.buyer_id ORDER BY id DESC LIMIT 1) AS last_body,
      (SELECT created_at FROM messages WHERE property_id = m.property_id AND buyer_id = m.buyer_id ORDER BY id DESC LIMIT 1) AS last_at,
      (SELECT name FROM users WHERE id = m.buyer_id) AS buyer_name,
      (SELECT name FROM users WHERE id = m.owner_id) AS owner_name
    FROM messages m JOIN properties p ON p.id = m.property_id
    WHERE m.buyer_id = ? OR m.owner_id = ?
    GROUP BY m.property_id, m.buyer_id ORDER BY last_at DESC`).all(req.user.id, req.user.id);
  return res.json({ threads: rows });
});

function loadThread(req, res) {
  const propertyId = Number(req.params.propertyId);
  const buyerId = Number(req.params.buyerId);
  const thread = db.prepare('SELECT * FROM messages WHERE property_id = ? AND buyer_id = ? ORDER BY id LIMIT 1').get(propertyId, buyerId);
  if (!thread) { res.status(404).json({ error: 'Conversation not found.' }); return null; }
  if (req.user.id !== thread.buyer_id && req.user.id !== thread.owner_id && !req.user.is_admin) {
    res.status(403).json({ error: 'You can only read your own conversations.' }); return null;
  }
  return { propertyId, buyerId, ownerId: thread.owner_id };
}

router.get('/threads/:propertyId/:buyerId', authRequired, (req, res) => {
  const t = loadThread(req, res); if (!t) return;
  const messages = db.prepare('SELECT * FROM messages WHERE property_id = ? AND buyer_id = ? ORDER BY id').all(t.propertyId, t.buyerId);
  return res.json({ messages });
});

router.post('/threads/:propertyId/:buyerId/messages', authRequired, (req, res) => {
  const t = loadThread(req, res); if (!t) return;
  const body = String((req.body && req.body.body) || '').trim().slice(0, 2000);
  if (!body) return res.status(400).json({ error: 'Please type a message first.' });
  const info = db.prepare('INSERT INTO messages (property_id, buyer_id, owner_id, sender_id, body) VALUES (?, ?, ?, ?, ?)')
    .run(t.propertyId, t.buyerId, t.ownerId, req.user.id, body);
  const other = req.user.id === t.buyerId ? t.ownerId : t.buyerId;
  const prop = db.prepare('SELECT title FROM properties WHERE id = ?').get(t.propertyId);
  notify(other, 'message', `${req.user.name} replied about "${prop ? prop.title : 'a property'}".`, t.propertyId);
  return res.status(201).json({ message: db.prepare('SELECT * FROM messages WHERE id = ?').get(info.lastInsertRowid) });
});

router.post('/properties/:id/visits', authRequired, (req, res) => {
  const prop = approvedProperty(req, res); if (!prop) return;
  if (prop.owner_id === req.user.id) return res.status(400).json({ error: 'This is your own property.' });
  const visitAt = String((req.body && req.body.visitAt) || '').trim();
  if (!visitAt) return res.status(400).json({ error: 'Please choose a date and time for the visit.' });
  const info = db.prepare('INSERT INTO visits (property_id, buyer_id, owner_id, visit_at, note) VALUES (?, ?, ?, ?, ?)')
    .run(prop.id, req.user.id, prop.owner_id, visitAt.slice(0, 40), String((req.body && req.body.note) || '').trim().slice(0, 500) || null);
  notify(prop.owner_id, 'visit', `${req.user.name} requested a visit to "${prop.title}" on ${visitAt}.`, prop.id);
  return res.status(201).json({ visit: db.prepare('SELECT * FROM visits WHERE id = ?').get(info.lastInsertRowid) });
});

router.get('/visits', authRequired, (req, res) => {
  const rows = db.prepare(`
    SELECT v.*, p.title AS property_title, p.city,
      (SELECT name FROM users WHERE id = v.buyer_id) AS buyer_name,
      (SELECT name FROM users WHERE id = v.owner_id) AS owner_name
    FROM visits v JOIN properties p ON p.id = v.property_id
    WHERE v.buyer_id = ? OR v.owner_id = ? ORDER BY v.created_at DESC`).all(req.user.id, req.user.id);
  return res.json({ visits: rows });
});

router.patch('/visits/:id', authRequired, (req, res) => {
  const visit = db.prepare('SELECT * FROM visits WHERE id = ?').get(Number(req.params.id));
  if (!visit) return res.status(404).json({ error: 'Visit request not found.' });
  const status = req.body && req.body.status;
  if (visit.owner_id === req.user.id && ['accepted', 'declined'].includes(status)) {
    db.prepare('UPDATE visits SET status = ? WHERE id = ?').run(status, visit.id);
    notify(visit.buyer_id, 'visit', `Your visit request was ${status} by the owner.`, visit.property_id);
  } else if (visit.buyer_id === req.user.id && status === 'cancelled') {
    db.prepare('UPDATE visits SET status = ? WHERE id = ?').run('cancelled', visit.id);
  } else {
    return res.status(403).json({ error: 'You cannot change this visit request.' });
  }
  return res.json({ visit: db.prepare('SELECT * FROM visits WHERE id = ?').get(visit.id) });
});

router.post('/properties/:id/report', authRequired, (req, res) => {
  const prop = approvedProperty(req, res); if (!prop) return;
  const reason = String((req.body && req.body.reason) || '').trim().slice(0, 200);
  if (!reason) return res.status(400).json({ error: 'Please choose / type a reason for reporting.' });
  const info = db.prepare('INSERT INTO reports (property_id, reporter_id, reason, details) VALUES (?, ?, ?, ?)')
    .run(prop.id, req.user.id, reason, String((req.body && req.body.details) || '').trim().slice(0, 1000) || null);
  return res.status(201).json({ report: db.prepare('SELECT * FROM reports WHERE id = ?').get(info.lastInsertRowid), message: 'Report submitted. Our admin team will review this listing.' });
});

router.get('/notifications', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 50').all(req.user.id);
  return res.json({ notifications: rows, unread: rows.filter((r) => !r.is_read).length });
});

router.post('/notifications/read', authRequired, (req, res) => {
  if (req.body && req.body.id) db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(Number(req.body.id), req.user.id);
  else db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  return res.json({ ok: true });
});

/* ── AI Property Assistant ─────────────────────────────────────────────── */
router.post('/assistant', async (req, res) => {
  const result = await assistantSearch(req.body && req.body.query);
  if (result.error) return res.status(400).json(result);
  return res.json({
    ...result,
    properties: result.properties.map((r) => serialize(r, req.user || null)),
    note: 'Search runs on the live Property Direct database. Only real, approved listings are shown — the assistant never invents properties.',
  });
});

/* ── Business: promotion requests (no charging) ────────────────────────── */
router.post('/promotions', authRequired, (req, res) => {
  const plan = config.plans.find((p) => p.id === (req.body && req.body.planId));
  if (!plan) return res.status(400).json({ error: 'Please choose a valid plan.' });
  let propertyId = req.body && req.body.propertyId ? Number(req.body.propertyId) : null;
  if (propertyId) {
    const prop = db.prepare('SELECT * FROM properties WHERE id = ?').get(propertyId);
    if (!prop) return res.status(404).json({ error: 'Property not found.' });
    if (prop.owner_id !== req.user.id && !req.user.is_admin) return res.status(403).json({ error: 'You can only promote your own properties.' });
  }
  const info = db.prepare('INSERT INTO promotion_requests (user_id, property_id, plan_id, plan_name, price_inr, note) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.user.id, propertyId, plan.id, plan.name, plan.priceInr, String((req.body && req.body.note) || '').trim().slice(0, 500) || null);
  return res.status(201).json({
    request: db.prepare('SELECT * FROM promotion_requests WHERE id = ?').get(info.lastInsertRowid),
    message: `Request saved for ${plan.name} (displayed price ₹${plan.priceInr}). No payment has been charged — our team will contact you. The platform never charges a broker commission.`,
  });
});

router.get('/my/promotions', authRequired, (req, res) => {
  const rows = db.prepare('SELECT * FROM promotion_requests WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  return res.json({ requests: rows });
});

/* ── Support / contact ─────────────────────────────────────────────────── */
router.post('/support', (req, res) => {
  const { name, email, message } = req.body || {};
  if (!name || !EMAIL_RE.test(String(email || '')) || !message) {
    return res.status(400).json({ error: 'Please fill your name, a valid email and a message.' });
  }
  const info = db.prepare('INSERT INTO support_messages (name, email, message) VALUES (?, ?, ?)')
    .run(String(name).trim().slice(0, 80), String(email).trim().toLowerCase(), String(message).trim().slice(0, 2000));
  return res.status(201).json({ ok: true, id: info.lastInsertRowid, message: 'Message saved. Our team will reply by email.' });
});

/* ── Admin ─────────────────────────────────────────────────────────────── */
router.use('/admin', authRequired, adminRequired);

router.get('/admin/stats', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const byStatus = db.prepare('SELECT status, COUNT(*) c FROM properties GROUP BY status').all();
  const reports = db.prepare("SELECT COUNT(*) c FROM reports WHERE status = 'open'").get().c;
  const promotions = db.prepare('SELECT COUNT(*) c FROM promotion_requests').get().c;
  return res.json({ stats: { users, listingsByStatus: byStatus, openReports: reports, promotionRequests: promotions } });
});

router.get('/admin/properties', (req, res) => {
  const status = req.query.status;
  const rows = status && ['pending', 'approved', 'rejected'].includes(status)
    ? db.prepare('SELECT * FROM properties WHERE status = ? ORDER BY created_at DESC').all(status)
    : db.prepare('SELECT * FROM properties ORDER BY created_at DESC').all();
  return res.json({ properties: rows.map((r) => serialize(r, req.user)) });
});

router.patch('/admin/properties/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Property not found.' });
  const b = req.body || {};
  const status = ['pending', 'approved', 'rejected'].includes(b.status) ? b.status : row.status;
  const featured = b.isFeatured === undefined ? row.is_featured : (b.isFeatured ? 1 : 0);
  const verified = b.isVerified === undefined ? row.is_verified : (b.isVerified ? 1 : 0);
  db.prepare("UPDATE properties SET status = ?, is_featured = ?, is_verified = ?, updated_at = datetime('now') WHERE id = ?")
    .run(status, featured, verified, row.id);
  if (status !== row.status) {
    notify(row.owner_id, 'listing', `Your listing "${row.title}" is now ${status} by the admin.`, row.id);
  }
  return res.json({ property: serialize(db.prepare('SELECT * FROM properties WHERE id = ?').get(row.id), req.user) });
});

router.delete('/admin/properties/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM properties WHERE id = ?').get(Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Property not found.' });
  db.prepare('DELETE FROM properties WHERE id = ?').run(row.id);
  return res.json({ ok: true });
});

router.get('/admin/reports', (req, res) => {
  const rows = db.prepare(`SELECT r.*, p.title AS property_title,
    (SELECT name FROM users WHERE id = r.reporter_id) AS reporter_name
    FROM reports r JOIN properties p ON p.id = r.property_id ORDER BY r.id DESC`).all();
  return res.json({ reports: rows });
});

router.patch('/admin/reports/:id', (req, res) => {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(req.params.id));
  if (!report) return res.status(404).json({ error: 'Report not found.' });
  db.prepare("UPDATE reports SET status = 'resolved' WHERE id = ?").run(report.id);
  return res.json({ report: db.prepare('SELECT * FROM reports WHERE id = ?').get(report.id) });
});

router.get('/admin/users', (req, res) => {
  const rows = db.prepare('SELECT * FROM users ORDER BY id DESC').all();
  return res.json({ users: rows.map(publicUser) });
});

router.patch('/admin/users/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!user) return res.status(404).json({ error: 'User not found.' });
  if (user.is_admin) return res.status(400).json({ error: 'Admin accounts cannot be suspended here.' });
  const suspended = req.body && req.body.suspended ? 1 : 0;
  db.prepare('UPDATE users SET suspended = ? WHERE id = ?').run(suspended, user.id);
  return res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) });
});

router.get('/admin/promotions', (req, res) => {
  const rows = db.prepare(`SELECT pr.*, (SELECT name FROM users WHERE id = pr.user_id) AS user_name,
    (SELECT title FROM properties WHERE id = pr.property_id) AS property_title
    FROM promotion_requests pr ORDER BY pr.id DESC`).all();
  return res.json({ requests: rows });
});

router.get('/admin/support', (req, res) => {
  const rows = db.prepare('SELECT * FROM support_messages ORDER BY id DESC').all();
  return res.json({ messages: rows });
});

module.exports = router;
