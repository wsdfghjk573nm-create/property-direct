# Property Direct — Real Estate Marketplace

**Buy Direct. Sell Direct. No Middlemen.**

Property Direct is a complete, working real estate marketplace that connects
property owners **directly** with buyers and renters — no broker is needed to
reach an owner, and the platform never charges a broker commission.

> The brand name is **temporary**. The name and tagline live in ONE place —
> `.env` (`BRAND_NAME`, `BRAND_TAGLINE`) and `server/config.js` — and the
> frontend reads them from `GET /api/config`. Rename the site by editing
> `.env` only.

## Features (all wired to real APIs — no fake buttons)

- **Home** — hero search, categories (Residential / Commercial / Plots /
  Agricultural Land), featured + recent listings, "Post Your Property for
  Free" and "Find Your Dream Property".
- **Accounts** — register as Owner / Buyer / Tenant / Authorized Agent (one
  account can both buy and sell), login/logout, profile view/update.
  Passwords are bcrypt-hashed; sessions are JWTs. Suspended accounts cannot
  log in.
- **Listings** — full create/edit form (type, sale/rent, price, state/city/
  locality/address, area + unit, bedrooms/bathrooms, furnishing, description,
  up to 8 photos uploaded to the server with type/size validation, video file
  upload or video URL, amenities, parking, contact details with per-field
  public show/hide privacy settings, availability status).
  New and edited listings go to **moderation (pending)** and only appear in
  search after an admin approves them. **Duplicate detection:** same owner +
  same city + same title or same address is rejected with a clear message.
- **Search & filters** — city, locality/keyword text, min/max budget, type,
  category, sale/rent, bedrooms, area range, furnishing, sort by newest /
  price low→high / high→low. Cards show photo, price, location, key details.
- **Property pages** — photo gallery (+ video), all details, listing date,
  view counter, owner contact shown **only per the owner's privacy
  settings**, Contact Owner (in-app message), Call (tel:) and WhatsApp
  (wa.me) buttons only when the owner enabled them, Schedule a Visit,
  Report Listing, similar properties, fraud-warning text, "Open in Maps"
  external link. A property is labelled **Verified only when an admin has
  set the verification flag** after an actual document check.
- **Dashboards** — Seller: my listings (edit/delete/mark sold or rented/
  renew), stats (listing count, total views, inquiries, pending visits),
  inquiries received, visit requests (accept/decline). Buyer: favorites,
  recently viewed, compare 2–3 favorites side by side, my inquiries, my
  visit requests, notifications.
- **Messaging** — in-app buyer↔owner threads tied to a property, with
  notifications on new messages, visit requests and listing decisions.
  Users can only read their own threads; owners can only manage their own
  listings (enforced server-side, 403/404).
- **AI Property Assistant** — plain-language search over the **live
  database** ("Find a house in Jaipur under ₹50 lakh", "2 BHK flats",
  "shop for rent in Jalore"). A rule-based parser extracts city, budget
  (lakh/crore/₹), bedrooms, type and sale/rent, then runs a real SQL query.
  It **never invents a property**. It also explains terms from a small
  labelled glossary (carpet area, BHK, registry, stamp duty, super
  built-up area). If `AI_API_KEY` is set (OpenAI-compatible endpoint), the
  assistant additionally uses it to summarise the real results in one
  sentence — search itself works with **no key**.
- **Admin dashboard** (admin role only) — site stats, listing review queue
  (approve/reject/remove), set featured, set verification flag, reports
  review/resolve, users list with suspend/activate, promotion requests,
  support messages.
- **Business model** — searching is free for buyers. Optional seller
  services with clearly displayed prices (featured listing ₹499, premium
  seller plan ₹1499/month, promotion ₹299, photography ₹1999, verification
  service ₹999 — all configurable in `server/config.js`). The "Request"
  action **stores a request for the admin — it never charges anyone and
  there is no fake checkout.**
- **Trust & safety** — moderation, duplicate detection, report-a-listing,
  admin suspension, fraud warnings on property pages.

## Tech stack

| Part | Technology |
|---|---|
| Frontend | Vanilla HTML/CSS/JS (single `public/` app, no build step), responsive for Android/iPhone/tablet/desktop |
| Backend | Node.js + Express |
| Database | SQLite via Node's built-in `node:sqlite` (no native dependency) |
| Auth | bcryptjs + JWT |
| Uploads | multer, stored on server disk (`uploads/`) with type/size validation |

## 1. Run locally

```bash
cd property-direct
npm install
cp .env.example .env     # then edit .env (see below)
npm run seed             # optional demo listings (clearly badged DEMO)
npm start
```

Open **http://localhost:3000**. Requires Node.js 22.5+ (Node 24 works).

## 2. Database setup

No manual setup: SQLite creates `data/property-direct.db` automatically on
first run, including all tables.

**Switching to PostgreSQL (production):** all SQL lives in `server/db.js`
(schema), `server/routes.js`, `server/assistant.js` and `server/seed.js`
and uses standard SQL with `?` placeholders. Replace `server/db.js` with a
`pg` Pool wrapper exposing the same `.prepare(...).get/all/run` shape (or
port the queries), set `DATABASE_URL`, and keep the schema equivalent
(column names are already portable). Upload storage (`uploads/`) should
move to object storage (S3-compatible) at the same time, with
`property_photos.url` storing the public URL.

## 3. Configuration (.env)

| Variable | Purpose |
|---|---|
| `BRAND_NAME` / `BRAND_TAGLINE` | Site name + tagline (ONE place to rename) |
| `JWT_SECRET` | Long random secret for login tokens — **set in production** |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | On first start, an admin account is created from these. There is **no default admin password** and none is hardcoded. Leave empty for no admin. |
| `AI_API_KEY`, `AI_API_BASE_URL`, `AI_MODEL` | Optional external AI used only to summarise assistant results. Keys live server-side only. |
| `PORT` | Server port (default 3000) |

## 4. Demo listings + admin

```bash
npm run seed                          # creates "Demo Owner" + 7 DEMO properties
node server/seed.js --reset-demo      # removes all demo listings + demo owner
```

Demo properties are sample data, flagged `is_demo` in the database and
badged **DEMO** on every card and detail page: a house for sale in Jaipur
under ₹50 lakh, a residential plot in Jalore, a shop for rent in Jaipur, a
2 BHK flat in Jaipur, a villa in Udaipur, agricultural land in Jalore, and
an apartment for rent in Bengaluru. Search never mixes them up with real
listings silently — the badge is always visible. Skip `npm run seed` on a
real deployment if you don't want them.

The Demo Owner account is **not a login account** (its password is random
and never disclosed).

## 5. How to test

1. **Upload + moderation:** register → Post Property (add photos) → it is
   created as *pending* and invisible in search → log in as admin →
   Admin → Approve → it now appears in search and on the homepage.
2. **Search:** use the filters on Buy/Rent pages (city, budget, BHK…) —
   try Jaipur + max ₹50,00,000.
3. **AI Assistant:** open "AI Assistant" and ask
   `Find a house in Jaipur under ₹50 lakh` — it must return the demo house
   from the database. Ask `What is carpet area?` for the glossary.
4. **Buyer flow:** with a second account — favorite a property, compare
   favorites, message the owner, schedule a visit, report a listing; the
   owner sees notifications and can reply / accept the visit in Dashboard.
5. **Duplicate check:** post the same title + city + address twice with
   one owner — the second is rejected as a duplicate.

## 6. Deploy online

You need a host that runs Node.js and lets you set environment variables,
**with a persistent disk/volume** — both the SQLite database (`data/`) and
uploaded photos (`uploads/`) must survive restarts.

### Render
1. Push the project to GitHub. Render → New → Web Service → connect repo.
2. Build: `npm install` · Start: `npm start`.
3. Environment: set all `.env` variables in the dashboard (never upload `.env`).
4. Add a **Persistent Disk** mounted so it covers `data/` and `uploads/`
   (or move DB/uploads to hosted services as described above).

### Railway
1. New Project → Deploy from GitHub repo (Node detected, start `npm start`).
2. Variables tab: set the environment variables.
3. Add a **Volume** for `data/` and `uploads/`.

### Custom domain
1. In your host's dashboard, add the custom domain (e.g. `www.yourdomain.in`).
2. At your domain registrar, create the DNS record the host shows you
   (usually a CNAME to the host's address, or A records for the root domain).
3. Wait for DNS + automatic HTTPS certificate (hosts issue it automatically),
   then open the domain and confirm the site loads over `https://`.

## 7. Maps

No maps API key is bundled (none was available), so property pages show
the locality/city text plus an **"Open in Maps"** external link (a Google
Maps search for the address) — nothing is embedded that could break.
To enable embedded maps later, get a Google Maps (or Mapbox) API key, add
it as a server env var, expose only the public embed key via `/api/config`,
and replace the link in the detail view with an embed iframe centred on a
geocode of the address.

## Notes & honest limits

- Phone/email OTP verification is **not** implemented; accounts are
  email + password. Add an OTP provider (e.g. an SMS/email service) before
  a public launch if you need verified phone numbers.
- Promotion requests are **requests only** — no payment gateway is
  integrated, by design. Connect a payment provider (with prices shown
  before charging) if you want real payments.
- The contact/support form stores messages for the admin; it does not send
  email.
- Property "verification" is an admin flag only — the site never claims a
  property is legally verified unless an admin sets it after checking
  documents.
