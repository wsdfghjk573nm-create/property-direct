'use strict';

/**
 * Property Direct — server entry point.
 * Serves ../public, uploaded files at /uploads, and the JSON API under /api.
 * Config via environment variables — see .env.example.
 */

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const express = require('express');
const config = require('./config');
const routes = require('./routes');
const { ensureAdmin } = require('./auth');
const { UPLOAD_DIR } = require('./db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

app.use('/api', routes);
app.use('/api', (req, res) => res.status(404).json({ error: 'API endpoint not found.' }));

app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(PUBLIC_DIR));
app.get('*', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'index.html')));

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid request body.' });
  console.error('[property-direct] Server error:', err);
  return res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
});

ensureAdmin().then(() => {
  app.listen(PORT, () => {
    console.log(`${config.brandName} is running at http://localhost:${PORT}`);
    console.log(`Tagline: ${config.brandTagline}`);
    console.log(process.env.AI_API_KEY
      ? 'AI Assistant: database search + external AI summary configured.'
      : 'AI Assistant: database search (rule-based parser, no API key needed).');
  });
});
