# Luxe Estates

Hyderabad luxury real estate platform — Express + MongoDB backend serving a static frontend.

## Folder Structure

```
luxe-estates/
├── server.js              ← Express API + static file server
├── package.json
├── .env.example           ← Copy to .env and fill in
├── .gitignore
│
├── scripts/
│   └── seed.js            ← Seed DB with 12 sample properties
│
└── public/                ← All frontend files (served as static)
    ├── index.html         ← Home page (chat conversation UI)
    ├── listings.html      ← Listings page (API-driven, paginated)
    ├── contact.html       ← Contact form (posts to /api/contact)
    ├── css/
    │   ├── style.css
    │   └── chat.css
    └── js/
        ├── main.js        ← Nav, chat flow, name modal, wishlist, contact form
        └── listings.js    ← Listings fetch, filters, pagination
```

## Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env — set MONGODB_URI if not using localhost

# 3. Seed the database
node scripts/seed.js

# 4. Start the server
npm run dev        # development (nodemon)
npm start          # production
```

Open http://localhost:5000

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/properties` | List properties (filter + sort + paginate) |
| GET | `/api/properties/:id` | Single property |
| POST | `/api/contact` | Submit contact form |
| POST | `/api/seed/properties` | Re-seed DB (dev only) |

### GET /api/properties — Query Params

| Param | Example | Notes |
|-------|---------|-------|
| `type` | `sale` \| `rent` | |
| `bhk` | `2` \| `3` \| `4` | |
| `badge` | `sale` \| `rent` \| `new` | |
| `locality` | `Banjara Hills` | Partial, case-insensitive |
| `minPrice` | `5000000` | Raw number |
| `maxPrice` | `15000000` | Raw number |
| `q` | `kondapur` | Search title + locality |
| `sort` | `price-asc` \| `price-desc` \| `area-desc` \| `newest` | |
| `page` | `1` | Default 1 |
| `limit` | `9` | Default 9, max 50 |

### Response Shape

```json
{
  "success": true,
  "properties": [...],
  "pagination": {
    "total": 12,
    "page": 1,
    "limit": 9,
    "totalPages": 2,
    "hasNext": true,
    "hasPrev": false
  }
}
```

## Design Decisions

- **No user sessions** — the name modal stores the customer name in `localStorage` only. Nothing is sent to the server.
- **No conversation storage** — chat selections happen entirely in the browser. The only server call during chat is `GET /api/properties` to fetch matching listings when the user completes their filters.
- **Wishlist in localStorage** — no server-side wishlist. Fast, private, zero backend complexity.
- **Contact form → MongoDB** — the only write from a visitor. Submissions land in the `contacts` collection.
