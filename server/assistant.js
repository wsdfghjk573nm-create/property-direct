'use strict';

/**
 * AI Property Assistant — rule-based natural-language search over the REAL
 * property database. It never invents a property: every listing it returns
 * comes from a SQL query against approved listings.
 *
 * It understands (English + common Indian usage):
 *   "Find a house in Jaipur under ₹50 lakh"
 *   "Show me residential plots in Jalore"
 *   "Find a shop for rent in my city"   ("my city" = no city filter)
 *   "Show two-bedroom flats within my budget"  (2 BHK / two-bedroom)
 *   "What is carpet area?"              (labelled glossary)
 *
 * If AI_API_KEY is configured (OpenAI-compatible endpoint), it is used ONLY
 * to write a one-line summary of the real results. With no key, a plain
 * rule-based summary is produced. Search itself never depends on the key.
 */

const { db } = require('./db');
const config = require('./config');

const WORD_NUMBERS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

function parseBudget(text) {
  // Returns { maxPrice } in rupees, or null.
  let m = text.match(/(?:under|below|max(?:imum)?|within|upto|up to|budget(?:\s*of)?)\s*(?:₹|rs\.?|inr)?\s*([\d,]+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/i);
  if (!m) m = text.match(/₹\s*([\d,]+(?:\.\d+)?)\s*(crore|cr|lakh|lac|l)?/i);
  if (!m) return null;
  const value = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  const unit = (m[2] || '').toLowerCase();
  if (unit.startsWith('cr')) return Math.round(value * 10000000);
  if (unit.startsWith('l')) return Math.round(value * 100000);
  return Math.round(value);
}

function parseBedrooms(text) {
  let m = text.match(/(\d+)\s*(?:bhk|bed(?:room)?s?)/i);
  if (m) return parseInt(m[1], 10);
  m = text.match(/\b(one|two|three|four|five|six)[-\s]?bed(?:room)?s?\b/i);
  if (m) return WORD_NUMBERS[m[1].toLowerCase()] || null;
  return null;
}

function parseType(text) {
  const t = text.toLowerCase();
  const checks = [
    ['Agricultural Land', /\bagricultural\b|\bfarm\s*lands?\b|\bkhet\b/],
    ['Commercial Building', /\bcommercial buildings?\b/],
    ['Apartment', /\bapartments?\b/],
    ['Flat', /\bflats?\b/],
    ['Villa', /\bvillas?\b/],
    ['Shop', /\bshops?\b|\bshowrooms?\b/],
    ['Office', /\boffices?\b/],
    ['Plot', /\bplots?\b|\bland\b/],
    ['House', /\bhouses?\b|\bhome\b|\bbungalows?\b/],
  ];
  for (const [type, re] of checks) if (re.test(t)) return type;
  if (/\bresidential\b/.test(t)) return null; // category handled separately
  return null;
}

function knownCities() {
  const rows = db.prepare("SELECT DISTINCT city FROM properties WHERE status = 'approved'").all();
  return rows.map((r) => r.city).filter(Boolean);
}

function parseCity(text, cities) {
  const t = text.toLowerCase();
  for (const city of cities) {
    if (t.includes(city.toLowerCase())) return city;
  }
  // Generic "in <City>" fallback — only used if it matches a real city in DB.
  const m = text.match(/\bin\s+([A-Z][a-zA-Z]+)/);
  if (m) {
    const found = cities.find((c) => c.toLowerCase() === m[1].toLowerCase());
    if (found) return found;
  }
  return null;
}

function glossaryAnswer(text) {
  const t = text.toLowerCase();
  for (const term of Object.keys(config.glossary)) {
    if (t.includes(term)) return { term, text: config.glossary[term] };
  }
  if (/\bbhk\b/.test(t) && /(what|mean)/.test(t)) return { term: 'bhk', text: config.glossary.bhk };
  return null;
}

async function maybeAiSummary(listings, query) {
  const key = process.env.AI_API_KEY;
  if (!key || !listings.length) return null;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const resp = await fetch(process.env.AI_API_BASE_URL || 'https://api.openai.com/v1/chat/completions', {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Summarise these real property search results in one short friendly sentence. Do not add any property that is not in the list.' },
          { role: 'user', content: 'Query: ' + query + '\nResults: ' + JSON.stringify(listings.map((p) => ({ title: p.title, city: p.city, price: p.price }))) },
        ],
        temperature: 0.3,
      }),
    });
    clearTimeout(timer);
    if (!resp.ok) return null;
    const data = await resp.json();
    const s = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    return s ? String(s).trim() : null;
  } catch { return null; }
}

async function assistantSearch(rawQuery) {
  const query = String(rawQuery || '').trim();
  if (!query) return { error: 'Please type what you are looking for.' };

  const glossary = glossaryAnswer(query.toLowerCase());
  const lower = query.toLowerCase();

  const parsedType = parseType(query);
  const parsed = {
    city: parseCity(query, knownCities()),
    maxPrice: parseBudget(query),
    bedrooms: parseBedrooms(query),
    propertyType: parsedType,
    // A specific type (e.g. Plot) is more precise than a broad category word
    // ("residential plots") — the type wins, otherwise both filters conflict.
    category: parsedType ? null : (/\bresidential\b/.test(lower) ? 'Residential'
      : /\bcommercial\b/.test(lower) ? 'Commercial'
      : /\bagricultural\b/.test(lower) ? 'Agricultural Land' : null),
    listingType: /\brent\b|\brental\b|\bkiraye\b/.test(lower) ? 'rent'
      : /\bbuy\b|\bsale\b|\bpurchase\b|\bkharid/.test(lower) ? 'sale' : null,
  };

  const where = ["status = 'approved'", "availability = 'available'"];
  const params = [];
  if (parsed.city) { where.push('LOWER(city) = LOWER(?)'); params.push(parsed.city); }
  if (parsed.maxPrice) { where.push('price <= ?'); params.push(parsed.maxPrice); }
  if (parsed.bedrooms) { where.push('bedrooms = ?'); params.push(parsed.bedrooms); }
  if (parsed.propertyType) { where.push('property_type = ?'); params.push(parsed.propertyType); }
  if (parsed.category) { where.push('category = ?'); params.push(parsed.category); }
  if (parsed.listingType) { where.push('listing_type = ?'); params.push(parsed.listingType); }

  const rows = db.prepare(
    `SELECT * FROM properties WHERE ${where.join(' AND ')} ORDER BY is_featured DESC, created_at DESC LIMIT 12`
  ).all(...params);

  const bits = [];
  if (parsed.propertyType) bits.push(parsed.propertyType);
  else if (parsed.category) bits.push(parsed.category + ' properties');
  else bits.push('properties');
  if (parsed.bedrooms) bits.push(parsed.bedrooms + ' BHK');
  if (parsed.city) bits.push('in ' + parsed.city);
  if (parsed.listingType) bits.push(parsed.listingType === 'rent' ? 'for rent' : 'for sale');
  if (parsed.maxPrice) bits.push('under ₹' + parsed.maxPrice.toLocaleString('en-IN'));

  const summary = rows.length
    ? `I searched the live ${config.brandName} database and found ${rows.length} ${bits.join(' ')}. These are real listings — click any result to see full details and contact the owner directly.`
    : `I searched the live ${config.brandName} database and found no ${bits.join(' ')} right now. Try a higher budget, a different city, or remove some filters. I never invent properties — if it is not in the database, I will not show it.`;

  const aiSummary = rows.length ? await maybeAiSummary(rows, query) : null;

  return { parsed, count: rows.length, summary: aiSummary || summary, aiEnhanced: Boolean(aiSummary), glossary, properties: rows };
}

module.exports = { assistantSearch, parseBudget, parseBedrooms, parseType };
