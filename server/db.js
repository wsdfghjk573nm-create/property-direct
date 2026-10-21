'use strict';

/**
 * Database layer — SQLite via Node's built-in `node:sqlite` (Node >= 22.5).
 * The database file is created automatically on first run in ../data/.
 * See README "Switching to PostgreSQL" for the production path.
 */

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'property-direct.db'));
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    phone         TEXT,
    whatsapp      TEXT,
    role          TEXT NOT NULL DEFAULT 'buyer'
                  CHECK (role IN ('owner','buyer','tenant','agent','admin')),
    is_admin      INTEGER NOT NULL DEFAULT 0,
    suspended     INTEGER NOT NULL DEFAULT 0,
    is_demo       INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS properties (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title          TEXT NOT NULL,
    property_type  TEXT NOT NULL,
    category       TEXT NOT NULL,
    listing_type   TEXT NOT NULL CHECK (listing_type IN ('sale','rent')),
    price          INTEGER NOT NULL,
    state          TEXT NOT NULL,
    city           TEXT NOT NULL,
    locality       TEXT,
    address        TEXT,
    area_value     REAL,
    area_unit      TEXT NOT NULL DEFAULT 'sqft',
    bedrooms       INTEGER,
    bathrooms      INTEGER,
    furnishing     TEXT,
    description    TEXT,
    amenities      TEXT NOT NULL DEFAULT '[]',
    parking        TEXT,
    contact_name   TEXT,
    contact_phone  TEXT,
    contact_email  TEXT,
    contact_whatsapp TEXT,
    show_phone     INTEGER NOT NULL DEFAULT 0,
    show_whatsapp  INTEGER NOT NULL DEFAULT 0,
    show_email     INTEGER NOT NULL DEFAULT 1,
    video_url      TEXT,
    video_file     TEXT,
    availability   TEXT NOT NULL DEFAULT 'available'
                   CHECK (availability IN ('available','sold','rented','unavailable')),
    status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected')),
    is_demo        INTEGER NOT NULL DEFAULT 0,
    is_featured    INTEGER NOT NULL DEFAULT 0,
    is_verified    INTEGER NOT NULL DEFAULT 0,
    views          INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS property_photos (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS favorites (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, property_id)
  );

  CREATE TABLE IF NOT EXISTS recent_views (
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    viewed_at   TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, property_id)
  );

  CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    buyer_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS visits (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    buyer_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    owner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    visit_at    TEXT NOT NULL,
    note        TEXT,
    status      TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','accepted','declined','cancelled')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reports (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason      TEXT NOT NULL,
    details     TEXT,
    status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type        TEXT NOT NULL,
    text        TEXT NOT NULL,
    property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
    is_read     INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS promotion_requests (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    property_id INTEGER REFERENCES properties(id) ON DELETE SET NULL,
    plan_id     TEXT NOT NULL,
    plan_name   TEXT NOT NULL,
    price_inr   INTEGER NOT NULL,
    note        TEXT,
    status      TEXT NOT NULL DEFAULT 'pending',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS support_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    email       TEXT NOT NULL,
    message     TEXT NOT NULL,
    status      TEXT NOT NULL DEFAULT 'open',
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_props_search ON properties(status, city, listing_type, property_type);
  CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(property_id, buyer_id, id);
`);

function notify(userId, type, text, propertyId) {
  db.prepare('INSERT INTO notifications (user_id, type, text, property_id) VALUES (?, ?, ?, ?)')
    .run(userId, type, text, propertyId || null);
}

module.exports = { db, notify, UPLOAD_DIR, DATA_DIR };
