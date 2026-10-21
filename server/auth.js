'use strict';

/** Auth helpers — JWT + bcryptjs. Secret from JWT_SECRET env var. */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-insecure-secret-change-me';
const TOKEN_TTL = '30d';

if (!process.env.JWT_SECRET) {
  console.warn('[property-direct] WARNING: JWT_SECRET is not set — using a development fallback. Set it in .env before deploying.');
}

function hashPassword(plain) { return bcrypt.hash(plain, 10); }
function verifyPassword(plain, hash) { return hash ? bcrypt.compare(plain, hash) : Promise.resolve(false); }

function signToken(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name, isAdmin: !!user.is_admin }, JWT_SECRET, { expiresIn: TOKEN_TTL });
}

function publicUser(user) {
  return {
    id: user.id, email: user.email, name: user.name, phone: user.phone || null,
    whatsapp: user.whatsapp || null, role: user.role, isAdmin: !!user.is_admin,
    suspended: !!user.suspended,
  };
}

/** Loads the fresh user row so suspension takes effect immediately. */
function loadUser(payload) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.sub);
  return user || null;
}

function authRequired(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in to continue.' });
  try {
    const user = loadUser(jwt.verify(token, JWT_SECRET));
    if (!user) return res.status(401).json({ error: 'Account not found. Please log in again.' });
    if (user.suspended) return res.status(403).json({ error: 'This account has been suspended. Please contact support.' });
    req.user = user;
    return next();
  } catch {
    return res.status(401).json({ error: 'Your session has expired. Please log in again.' });
  }
}

function authOptional(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  req.user = null;
  if (token) {
    try {
      const user = loadUser(jwt.verify(token, JWT_SECRET));
      if (user && !user.suspended) req.user = user;
    } catch { req.user = null; }
  }
  return next();
}

function adminRequired(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access only.' });
  }
  return next();
}

/** Creates the admin account from env vars on first run. No defaults. */
async function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    console.log('Admin: not configured (set ADMIN_EMAIL + ADMIN_PASSWORD in .env to create an admin on first run).');
    return;
  }
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) { console.log('Admin: account already exists for ADMIN_EMAIL.'); return; }
  const hash = await hashPassword(password);
  db.prepare("INSERT INTO users (email, password_hash, name, role, is_admin) VALUES (?, ?, 'Administrator', 'admin', 1)")
    .run(email, hash);
  console.log('Admin: created admin account for ' + email + ' from environment variables.');
}

module.exports = { hashPassword, verifyPassword, signToken, publicUser, authRequired, authOptional, adminRequired, ensureAdmin };
