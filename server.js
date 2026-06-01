/* ============================================================
   LUXE ESTATES — Node.js + MongoDB Backend API
   Production-hardened: auth-gated writes, rate limiting,
   CORS lockdown, security headers, no open destructive routes.
   ============================================================ */

const express    = require('express');
const mongoose   = require('mongoose');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');
const crypto     = require('crypto');
const https      = require('https');
require('dotenv').config();

/* ── Firebase Admin SDK (npm install firebase-admin) ──────────────
   Used server-side to verify Firebase ID tokens sent from the client
   after Phone Auth OTP confirmation. This is the secure trust boundary:
   the client proves Firebase verified their phone → we issue our uuid.

   Required env vars:
     FIREBASE_PROJECT_ID      — e.g. "stellar-realty-abc"
     FIREBASE_CLIENT_EMAIL    — from service account JSON
     FIREBASE_PRIVATE_KEY     — from service account JSON (with literal \n)
   Or set GOOGLE_APPLICATION_CREDENTIALS to the path of your service
   account JSON file and remove the credential block below.
─────────────────────────────────────────────────────────────────── */
let firebaseAdmin = null;
try {
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey:  (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      })
    });
  }
  firebaseAdmin = admin;
  console.log('✓ Firebase Admin SDK initialised');
} catch (e) {
  console.warn('⚠ Firebase Admin SDK not available — OTP token verification will be skipped in dev mode.\n  Run: npm install firebase-admin and set FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY');
}

/* ── Env validation: refuse to start without required secrets ── */
if (process.env.NODE_ENV === 'production') {
  const required = ['MONGODB_URI', 'ADMIN_USERNAME', 'ADMIN_PASSWORD'];
  const missing  = required.filter(k => !process.env[k]);
  if (missing.length) {
    console.error(`✗ Missing required env vars: ${missing.join(', ')}`);
    process.exit(1);
  }
}

const app  = express();
const PORT = process.env.PORT || 5000;
const IS_PROD = process.env.NODE_ENV === 'production';

/* ════════════════════════════════════════════════════════════
   SECURITY HEADERS (Helmet-equivalent, no extra dependency)
   ════════════════════════════════════════════════════════════ */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
  next();
});

/* ── CORS: lock to your own origin in production ── */
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:5000', 'http://localhost:3000'];

app.use(cors({
  origin: (origin, cb) => {
    /* Allow same-origin requests (no Origin header) and whitelisted origins */
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-admin-token'],
  credentials: true
}));

/* ── Body parsers ── */
app.use(bodyParser.json({ limit: '20mb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '20mb' }));

/* ════════════════════════════════════════════════════════════
   RATE LIMITER (no extra dependency)
   Sliding window per IP stored in memory.
   ════════════════════════════════════════════════════════════ */
const rateLimitStore = new Map();

function rateLimit({ windowMs, max, message }) {
  return (req, res, next) => {
    const key = req.ip || req.connection.remoteAddress;
    const now  = Date.now();
    const rec  = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };

    if (now > rec.resetAt) {
      rec.count   = 0;
      rec.resetAt = now + windowMs;
    }

    rec.count++;
    rateLimitStore.set(key, rec);

    res.setHeader('X-RateLimit-Limit',     max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - rec.count));
    res.setHeader('X-RateLimit-Reset',     Math.ceil(rec.resetAt / 1000));

    if (rec.count > max) {
      return res.status(429).json({ success: false, error: message || 'Too many requests' });
    }
    next();
  };
}

/* Clean up stale rate-limit entries every 10 minutes */
setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of rateLimitStore) {
    if (now > rec.resetAt) rateLimitStore.delete(key);
  }
}, 10 * 60 * 1000);

/* ── Serve static frontend files ── */
app.use(express.static(path.join(__dirname, 'public')));

/* ── MongoDB Connection ── */
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/luxe_estates';

mongoose.connect(MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✓ MongoDB connected successfully'))
.catch(err => console.error('✗ MongoDB connection error:', err));

/* ════════════════════════════════════════════════════════════
   SCHEMAS & MODELS
   ════════════════════════════════════════════════════════════ */

/* Configuration sub-schema — one entry per unit type (e.g. 2BHK, 3BHK) */
const configurationSchema = new mongoose.Schema({
  bhk:       { type: Number, required: true },
  baths:     { type: Number, required: true },
  areaMin:   { type: Number, required: true },   // sq.ft lower bound
  areaMax:   { type: Number, required: true },   // sq.ft upper bound (= areaMin if single value)
  priceMin:  { type: Number, required: true },   // ₹ lower bound
  priceMax:  { type: Number, required: true },   // ₹ upper bound (= priceMin if single value)
  priceLabel:{ type: String, default: '' },      // display string e.g. "₹68L – ₹95L"
}, { _id: false });

/* Property Schema */
const propertySchema = new mongoose.Schema({
  title:    { type: String, required: true },
  locality: { type: String, required: true },
  city:     { type: String, default: 'Hyderabad' },

  /* Legacy single-config display fields — kept for backward compat with old documents.
     For new multi-config properties use the configurations[] array.
     price/priceRaw reflect the STARTING price of the cheapest configuration. */
  price:    { type: String, required: true },   // display: "₹68L onwards"
  priceRaw: { type: Number, required: true },   // numeric min price for filtering/sorting

  /* Type = Apartment, Villa, Penthouse, etc. */
  type:   { type: String, enum: ['apartment', 'villa', 'penthouse', 'plot', 'farmhouse'], required: true },

  /* Status = sale, underconstruction */
  status: { type: String, enum: ['sale', 'underconstruction'], required: true },

  /* Multi-configuration array — replaces single bhk/area/baths for new listings */
  configurations: { type: [configurationSchema], default: [] },

  /* Legacy single-config fields — kept for backward compat; populated from
     the cheapest configuration when configurations[] is present */
  bhk:   { type: Number, default: null },
  area:  { type: Number, default: null },
  baths: { type: Number, default: null },

  /* Range helpers (derived from configurations[], indexed for fast filtering) */
  priceMin: { type: Number, default: null },
  priceMax: { type: Number, default: null },
  areaMin:  { type: Number, default: null },
  areaMax:  { type: Number, default: null },

  constructionStatus: { type: String, required: true },
  rera:  { type: String, required: true },
  img:   { type: String, required: true },

  /* Badge for UI */
  badge:    { type: String, enum: ['new', 'featured', 'premium', null], default: null },
  featured: { type: Boolean, default: false },

  /* Multiple property images (first is hero) */
  images: [String],

  /* Floor plan images */
  floorPlanImages: [String],

  /* Geo-location for Google Maps embed */
  locationLat: { type: Number, default: null },
  locationLng: { type: Number, default: null },

  /* Downloadable brochure (URL or uploaded path) */
  brochureUrl: { type: String, default: null },

  /* Admin-overridable price per sq.ft — if null the frontend calculates it */
  pricePerSqft: { type: Number, default: null },

  amenities:   [String],
  description: { type: String, required: true },
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now }
});

const Property = mongoose.model('Property', propertySchema);

/* Conversation Schema */
const conversationSchema = new mongoose.Schema({
  customerName: { type: String, required: true },
  sessionId:    { type: String, required: true, unique: true },
  turns: [{
    question:   String,
    userChoice: String,
    response:   String,
    timestamp:  { type: Date, default: Date.now }
  }],
  filters: {
    status:   { type: String },
    budget:   [Number],
    location: String,
    bhk:      Number
  },
  conversationStatus: { type: String, enum: ['active', 'completed'], default: 'active' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Conversation = mongoose.model('Conversation', conversationSchema);

/* Contact Form Submission Schema */
const contactSchema = new mongoose.Schema({
  name:    { type: String, required: true },
  email:   { type: String, required: true },
  phone:   String,
  message: { type: String, required: true },
  status:  { type: String, enum: ['new', 'contacted', 'converted'], default: 'new' },
  uuid:    { type: String, default: null }, // links to User.uuid — null for legacy/unverified
  createdAt: { type: Date, default: Date.now }
});
contactSchema.index({ email: 1, message: 1 });

const Contact = mongoose.model('Contact', contactSchema);

/* Wishlist Schema */
const wishlistSchema = new mongoose.Schema({
  userId:      { type: String, required: true },
  propertyIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Property' }],
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now }
});

const Wishlist = mongoose.model('Wishlist', wishlistSchema);

/* User Schema — phone-verified anonymous identity
   phone_hash: SHA-256 of the normalised E.164 number (e.g. +919876543210)
   uuid:       stable anonymous ID returned to the client and used as wishlist key
*/
const userSchema = new mongoose.Schema({
  phoneHash: { type: String, required: true, unique: true }, // SHA-256 hex
  uuid:      { type: String, required: true, unique: true }, // random UUID v4
  phone:     { type: String, default: '' },   // normalised E.164 number for display
  blocked:   { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  lastSeenAt:{ type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

/* ════════════════════════════════════════════════════════════
   API ROUTES
   ════════════════════════════════════════════════════════════ */

/* ── Health Check ── */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Luxe Estates API is running' });
});

/* ════════════════════════════════════════════════════════════
   SEED ENDPOINT — POST /api/seed/properties
   Requires admin token. Disabled entirely in production.
   ════════════════════════════════════════════════════════════ */
app.post('/api/seed/properties', requireAdmin, async (req, res) => {
  if (IS_PROD) {
    return res.status(403).json({ success: false, error: 'Seed endpoint disabled in production' });
  }
  try {
    await Property.deleteMany({});

    const SEED_DATA = [
      {
        title: 'Prestige Skyline Tower', locality: 'Banjara Hills', city: 'Hyderabad',
        price: '₹2.85 Cr', priceRaw: 28500000,
        type: 'apartment', status: 'sale', bhk: 3, area: 1850, baths: 3,
        constructionStatus: 'Ready to Move', badge: 'premium', featured: true,
        rera: 'TSRERA/PRJ/2023/001234',
        img: 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&q=80',
        amenities: ['Swimming Pool', 'Gym', 'Covered Parking', 'Clubhouse', '24/7 Security'],
        description: 'A magnificent 3BHK residence offering panoramic city views from the 24th floor. Premium Italian marble flooring, modular kitchen, and 24×7 security.'
      },
      {
        title: 'Green Valley Residences', locality: 'Kondapur', city: 'Hyderabad',
        price: '₹68 L', priceRaw: 6800000,
        type: 'apartment', status: 'underconstruction', bhk: 2, area: 1180, baths: 2,
        constructionStatus: 'Under Construction', badge: 'new', featured: true,
        rera: 'TSRERA/PRJ/2023/005678',
        img: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80',
        amenities: ['Landscaped Garden', 'Gym', 'Parking', 'Children Play Area'],
        description: 'Thoughtfully designed 2BHK homes nestled within 5 acres of lush landscaping. RERA approved, possession by Dec 2025.'
      },
      {
        title: 'The Windsor Apartments', locality: 'Jubilee Hills', city: 'Hyderabad',
        price: '₹1.2 Cr', priceRaw: 12000000,
        type: 'apartment', status: 'sale', bhk: 3, area: 2100, baths: 3,
        constructionStatus: 'Ready to Move', badge: 'featured', featured: true,
        rera: 'TSRERA/PRJ/2022/009012',
        img: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&q=80',
        amenities: ['Swimming Pool', 'Gym', '24/7 Security', 'Covered Parking', 'Power Backup'],
        description: 'Semi-furnished luxury 3BHK in the heart of Jubilee Hills. Walking distance to top schools and hospitals.'
      },
      {
        title: 'Lotus Petal Villas', locality: 'Kokapet', city: 'Hyderabad',
        price: '₹1.4 Cr', priceRaw: 14000000,
        type: 'villa', status: 'sale', bhk: 4, area: 2800, baths: 4,
        constructionStatus: 'Ready to Move', badge: null, featured: false,
        rera: 'TSRERA/PRJ/2023/007890',
        img: 'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=600&q=80',
        amenities: ['Swimming Pool', 'Gym', 'Clubhouse', 'Private Garden', 'Gated Community'],
        description: 'Independent villas with private terrace and garden. Premium gated community with 24×7 security and club house.'
      },
      {
        title: 'Crystal Heights', locality: 'Gachibowli', city: 'Hyderabad',
        price: '₹95 L', priceRaw: 9500000,
        type: 'apartment', status: 'underconstruction', bhk: 3, area: 1600, baths: 2,
        constructionStatus: 'Under Construction', badge: 'new', featured: false,
        rera: 'TSRERA/PRJ/2024/001100',
        img: 'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=600&q=80',
        amenities: ['Gym', 'Parking', 'Clubhouse', 'Jogging Track'],
        description: 'Modern 3BHK flats in the IT corridor. Excellent connectivity to HITEC City and Financial District.'
      },
      {
        title: 'Serene Meadows', locality: 'Manikonda', city: 'Hyderabad',
        price: '₹62 L', priceRaw: 6200000,
        type: 'apartment', status: 'sale', bhk: 2, area: 1050, baths: 2,
        constructionStatus: 'Ready to Move', badge: null, featured: false,
        rera: 'TSRERA/PRJ/2022/003344',
        img: 'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=600&q=80',
        amenities: ['Children Play Area', 'Parking', 'Security', 'Landscaped Garden'],
        description: 'Affordable 2BHK homes for the growing family. Close to schools, metro, and shopping centres.'
      },
      {
        title: 'The Imperial Penthouse', locality: 'Banjara Hills', city: 'Hyderabad',
        price: '₹7.5 Cr', priceRaw: 75000000,
        type: 'penthouse', status: 'sale', bhk: 4, area: 5200, baths: 5,
        constructionStatus: 'Ready to Move', badge: 'premium', featured: true,
        rera: 'TSRERA/PRJ/2021/000789',
        img: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=80',
        amenities: ['Private Pool', 'Home Theatre', 'Gym', 'Smart Home', 'Concierge Service'],
        description: 'Ultra-luxury penthouse spanning two floors with private rooftop pool. Unobstructed views of Hussain Sagar. The pinnacle of refined living.'
      },
      {
        title: 'Emerald Gardens', locality: 'Nallagandla', city: 'Hyderabad',
        price: '₹74 L', priceRaw: 7400000,
        type: 'apartment', status: 'underconstruction', bhk: 2, area: 1230, baths: 2,
        constructionStatus: 'Under Construction', badge: 'new', featured: false,
        rera: 'TSRERA/PRJ/2024/002200',
        img: 'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=600&q=80',
        amenities: ['Gym', 'Swimming Pool', 'Parking', 'Clubhouse'],
        description: 'RERA-approved 2BHK homes near HITEC City. Excellent connectivity and green surroundings.'
      },
      {
        title: 'Oakwood Farms', locality: 'Shankarpally', city: 'Hyderabad',
        price: '₹1.8 Cr', priceRaw: 18000000,
        type: 'farmhouse', status: 'sale', bhk: 3, area: 6000, baths: 3,
        constructionStatus: 'Ready to Move', badge: null, featured: false,
        rera: 'TSRERA/PRJ/2020/009901',
        img: 'https://images.unsplash.com/photo-1464146072230-91cabc968266?w=600&q=80',
        amenities: ['Private Farm', 'Open Terrace', 'Borewell', 'Parking', 'Organic Garden'],
        description: 'Weekend getaway farmhouse on 600 sq.yards. Peaceful, green setting with fruit orchards and organic vegetable garden.'
      },
      {
        title: 'Pinnacle Heights', locality: 'Gachibowli', city: 'Hyderabad',
        price: '₹3.2 Cr', priceRaw: 32000000,
        type: 'penthouse', status: 'sale', bhk: 4, area: 3800, baths: 4,
        constructionStatus: 'Ready to Move', badge: 'featured', featured: true,
        rera: 'TSRERA/PRJ/2022/005511',
        img: 'https://images.unsplash.com/photo-1622866306950-81d17097d458?w=600&q=80',
        amenities: ['Private Terrace', 'Swimming Pool', 'Gym', 'Smart Home', 'Concierge'],
        description: 'Stunning penthouse with 360° city view. Smart home automation, private elevator, and premium finishing throughout.'
      },
      {
        title: 'Harmony Villas', locality: 'Puppalaguda', city: 'Hyderabad',
        price: '₹2.1 Cr', priceRaw: 21000000,
        type: 'villa', status: 'underconstruction', bhk: 4, area: 3200, baths: 4,
        constructionStatus: 'Under Construction', badge: 'new', featured: false,
        rera: 'TSRERA/PRJ/2024/003388',
        img: 'https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=600&q=80',
        amenities: ['Private Garden', 'Swimming Pool', 'Gym', 'Clubhouse', '24/7 Security'],
        description: 'Spacious 4BHK villas in a gated township. Each villa features a private garden and modern architecture.'
      },
      {
        title: 'Sunrise Residency', locality: 'Miyapur', city: 'Hyderabad',
        price: '₹55 L', priceRaw: 5500000,
        type: 'apartment', status: 'sale', bhk: 2, area: 980, baths: 2,
        constructionStatus: 'Ready to Move', badge: null, featured: false,
        rera: 'TSRERA/PRJ/2021/006655',
        img: 'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=600&q=80',
        amenities: ['Parking', 'Security', 'Children Play Area', 'Power Backup'],
        description: 'Affordable 2BHK homes with metro access. Perfect for first-time buyers looking for value in the western suburbs.'
      }
    ];

    const inserted = await Property.insertMany(SEED_DATA);
    res.json({ success: true, message: `✓ Seeded ${inserted.length} properties`, count: inserted.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   PROPERTIES ENDPOINTS
   ════════════════════════════════════════════════════════════ */

/* Get all properties with filters and pagination */
app.get('/api/properties', async (req, res) => {
  try {
    const {
      type, bhk, minPrice, maxPrice, minArea, maxArea, locality, badge, featured, sort, status,
      page = 1, limit = 9, q, amenities
    } = req.query;

    let query = {};

    /* Property type filter */
    if (type && type !== 'rent') query.type = type;

    /* Status filter (sale, underconstruction) */
    if (status) query.status = status;

    /* BHK — each filter gets its own $and clause so they don't bleed into each other */
    if (bhk) {
      const bhkVals = String(bhk).split(',').map(v => parseInt(v.trim())).filter(n => !isNaN(n));
      if (!query.$and) query.$and = [];
      query.$and.push({ $or: [
        { bhk: { $in: bhkVals } },
        { 'configurations.bhk': { $in: bhkVals } }
      ]});
    }
    if (badge)  query.badge  = badge;
    if (featured === 'true') query.featured = true;

    /* Locality / search */
    if (locality) query.locality = { $regex: `^${locality.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' };
    if (q) {
      if (!query.$and) query.$and = [];
      query.$and.push({ $or: [
        { title:       new RegExp(q, 'i') },
        { locality:    new RegExp(q, 'i') },
        { city:        new RegExp(q, 'i') },
        { description: new RegExp(q, 'i') }
      ]});
    }

    /* Price range — match if property price range overlaps the requested range */
    if (minPrice || maxPrice) {
      const mn = minPrice ? parseInt(minPrice) : 0;
      const mx = maxPrice ? parseInt(maxPrice) : Number.MAX_SAFE_INTEGER;
      if (!query.$and) query.$and = [];
      query.$and.push({ $or: [
        { priceMin: { $lte: mx }, priceMax: { $gte: mn } },
        { priceMin: null, priceRaw: { ...(minPrice ? { $gte: mn } : {}), ...(maxPrice ? { $lte: mx } : {}) } }
      ]});
    }

    /* Area range — match if property area range overlaps */
    if (minArea || maxArea) {
      const mn = minArea ? parseInt(minArea) : 0;
      const mx = maxArea ? parseInt(maxArea) : Number.MAX_SAFE_INTEGER;
      if (!query.$and) query.$and = [];
      query.$and.push({ $or: [
        { areaMin: { $lte: mx }, areaMax: { $gte: mn } },
        { areaMin: null, area: { ...(minArea ? { $gte: mn } : {}), ...(maxArea ? { $lte: mx } : {}) } }
      ]});
    }

    /* Amenities filter — match properties that have ALL selected amenities */
    if (amenities) {
      const amenityList = amenities.split(',').map(a => a.trim()).filter(Boolean);
      if (amenityList.length > 0) {
        query.amenities = { $all: amenityList };
      }
    }

    /* Pagination */
    const pageNum  = parseInt(page);
    const limitNum = parseInt(limit);
    const skip     = (pageNum - 1) * limitNum;

    /* Sorting */
    let sortObj = {};
    if      (sort === 'price-asc')  sortObj.priceRaw = 1;
    else if (sort === 'price-desc') sortObj.priceRaw = -1;
    else if (sort === 'area-desc')  sortObj.area     = -1;
    else                            sortObj.createdAt = -1;

    const total      = await Property.countDocuments(query);
    const rawProperties = await Property.find(query).sort(sortObj).skip(skip).limit(limitNum);
    const properties = rawProperties.map(p => { const o = p.toObject(); o.price = (o.price||'').replace(/\s*onwards\s*/i,'').trim(); return o; });

    res.json({
      success: true,
      properties,
      pagination: {
        page:       pageNum,
        limit:      limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNext:    pageNum < Math.ceil(total / limitNum),
        hasPrev:    pageNum > 1
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Get unique localities + amenities for the chat UI */
app.get('/api/properties/meta', async (req, res) => {
  try {
    const localities = await Property.distinct('locality');
    const allAmenities = await Property.distinct('amenities');
    res.json({
      success: true,
      localities: localities.filter(Boolean).sort(),
      amenities:  allAmenities.filter(Boolean).sort()
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* Get single property by ID */
app.get('/api/properties/:id', async (req, res) => {
  try {
    const doc = await Property.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: 'Property not found' });
    const property = doc.toObject();
    property.price = (property.price||'').replace(/\s*onwards\s*/i,'').trim();
    res.json({ success: true, property });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});
/* GET /api/properties/:id/wishlist-count — how many users have wishlisted this property */
app.get('/api/properties/:id/wishlist-count', async (req, res) => {
  try {
    const count = await Wishlist.countDocuments({ propertyIds: req.params.id });
    res.json({ success: true, count });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


/* Create new property — ADMIN ONLY (use /api/admin/properties) */
app.post('/api/properties', requireAdmin, async (req, res) => {
  try {
    const property = new Property(req.body);
    await property.save();
    res.status(201).json({ success: true, property });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* Update property — ADMIN ONLY */
app.put('/api/properties/:id', requireAdmin, async (req, res) => {
  try {
    req.body.updatedAt = Date.now();
    const property = await Property.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!property) return res.status(404).json({ success: false, error: 'Property not found' });
    res.json({ success: true, property });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* Delete property — ADMIN ONLY */
app.delete('/api/properties/:id', requireAdmin, async (req, res) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);
    if (!property) return res.status(404).json({ success: false, error: 'Property not found' });
    res.json({ success: true, message: 'Property deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   CONVERSATION / CHAT ENDPOINTS
   ════════════════════════════════════════════════════════════ */

app.post('/api/conversations', async (req, res) => {
  try {
    const { customerName, sessionId } = req.body;
    if (!customerName || !sessionId)
      return res.status(400).json({ success: false, error: 'customerName and sessionId required' });

    const conversation = new Conversation({ customerName, sessionId, turns: [], filters: {} });
    await conversation.save();
    res.status(201).json({ success: true, conversation });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.get('/api/conversations/:sessionId', requireAdmin, async (req, res) => {
  try {
    const conversation = await Conversation.findOne({ sessionId: req.params.sessionId });
    if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });
    res.json({ success: true, conversation });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/conversations/:sessionId/turns', async (req, res) => {
  try {
    const { question, userChoice, response } = req.body;
    const conversation = await Conversation.findOne({ sessionId: req.params.sessionId });
    if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });

    conversation.turns.push({ question, userChoice, response });
    conversation.updatedAt = Date.now();
    await conversation.save();
    res.json({ success: true, conversation });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/conversations/:sessionId/filters', async (req, res) => {
  try {
    const { status, budget, location, bhk } = req.body;
    const conversation = await Conversation.findOne({ sessionId: req.params.sessionId });
    if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });

    if (status   !== undefined) conversation.filters.status   = status;
    if (budget   !== undefined) conversation.filters.budget   = budget;
    if (location !== undefined) conversation.filters.location = location;
    if (bhk      !== undefined) conversation.filters.bhk      = bhk;

    conversation.updatedAt = Date.now();
    await conversation.save();
    res.json({ success: true, conversation });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

app.put('/api/conversations/:sessionId/complete', async (req, res) => {
  try {
    const conversation = await Conversation.findOneAndUpdate(
      { sessionId: req.params.sessionId },
      { conversationStatus: 'completed', updatedAt: Date.now() },
      { new: true }
    );
    if (!conversation) return res.status(404).json({ success: false, error: 'Conversation not found' });
    res.json({ success: true, conversation });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   CONTACT FORM ENDPOINTS
   ════════════════════════════════════════════════════════════ */

app.post('/api/contact',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 5, message: 'Too many submissions — please try again later' }),
  async (req, res) => {
  try {
    const { name, email, phone, message, uuid } = req.body;
    if (!name || !email || !message)
      return res.status(400).json({ success: false, error: 'Name, email, and message are required' });

    /* ── Require OTP-verified uuid ── */
    if (!uuid || typeof uuid !== 'string' || uuid.length < 10)
      return res.status(401).json({ success: false, error: 'Phone verification required before submitting.' });

    const user = await User.findOne({ uuid });
    if (!user)
      return res.status(401).json({ success: false, error: 'Verification not recognised. Please verify your phone again.' });

    if (user.blocked)
      return res.status(403).json({ success: false, error: 'This number has been restricted. Please contact support.' });

    // Reject if same email+message submitted within the last 10 minutes
    const tenMinsAgo = new Date(Date.now() - 10 * 60 * 1000);
    const duplicate = await Contact.findOne({ email, message, createdAt: { $gte: tenMinsAgo } });
    if (duplicate)
      return res.status(429).json({ success: false, error: 'You already sent this message recently. We will get back to you soon!' });

    const contact = new Contact({ name, email, phone, message, uuid });
    await contact.save();
    res.status(201).json({ success: true, message: 'Contact form submitted successfully' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* GET all contacts — ADMIN ONLY */
app.get('/api/contact', requireAdmin, async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};
    const contacts = await Contact.find(query).sort({ createdAt: -1 });
    res.json({ success: true, count: contacts.length, contacts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── Lead capture — called before showing search results ── */
app.post('/api/leads', rateLimit({ windowMs: 5 * 60 * 1000, max: 10, message: 'Too many requests' }), async (req, res) => {
  try {
    const { name, phone, email, filters, uuid } = req.body;
    if (!phone)
      return res.status(400).json({ success: false, error: 'Phone is required' });
    if (!uuid && (!name || !email))
      return res.status(400).json({ success: false, error: 'Name and email are required for new leads' });

    /* Build a descriptive message from all chat filter fields */
    const parts = [];
    if (filters) {
      if (filters.purpose)    parts.push(`Purpose: ${filters.purpose}`);
      if (filters.type)       parts.push(`Type: ${filters.type}`);
      if (filters.budget)     parts.push(`Budget: ₹${(filters.budget[0]/1e5).toFixed(0)}L – ₹${(filters.budget[1]/1e5).toFixed(0)}L`);
      if (filters.locality)   parts.push(`Area: ${filters.locality}`);
      else if (filters.zone)  parts.push(`Zone: ${filters.zone}`);
      if (filters.timeline)   parts.push(`Timeline: ${filters.timeline}`);
      if (filters.status)     parts.push(`Property: ${filters.status === 'sale' ? 'Ready to move' : filters.status === 'underconstruction' ? 'Under construction' : 'Flexible'}`);
      if (filters.possession) parts.push(`Possession: ${filters.possession}`);
      if (filters.bhk)        parts.push(`BHK: ${filters.bhk}`);
      if (filters.area)       parts.push(`Size: ${filters.area[0].toLocaleString()}–${filters.area[1] >= 99999 ? filters.area[0].toLocaleString() + '+' : filters.area[1].toLocaleString()} sqft`);
      if (filters.priority)   parts.push(`Priority: ${filters.priority}`);
    }
    const message = parts.length
      ? `[Chat Lead] ${parts.join(' | ')}`
      : '[Chat Lead]';

    /* Attach uuid if the user is already OTP-verified */
    const verifiedUuid = uuid && typeof uuid === 'string' && uuid.length > 10 ? uuid : null;

    /* Deduplicate: same search within 5 minutes — match by uuid if verified, else email+message */
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000);
    const dedupQuery  = verifiedUuid
      ? { uuid: verifiedUuid, message, createdAt: { $gte: fiveMinsAgo } }
      : { email, message, createdAt: { $gte: fiveMinsAgo } };
    const duplicate = await Contact.findOne(dedupQuery);
    if (duplicate)
      return res.json({ success: true, message: 'Lead already captured recently' });

    const contact = new Contact({ name, email, phone, message, uuid: verifiedUuid });
    await contact.save();
    res.status(201).json({ success: true, message: 'Lead saved' });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   WISHLIST ENDPOINTS
   userId = the uuid returned by POST /api/otp/verify
   ════════════════════════════════════════════════════════════ */

/* GET /api/wishlist/:userId — fetch full wishlist with property details */
app.get('/api/wishlist/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    if (!userId || userId.length < 10) {
      return res.status(400).json({ success: false, error: 'Invalid userId' });
    }

    /* Verify the userId was issued by this server — not just a guessed string */
    const userExists = await User.exists({ uuid: userId });
    if (!userExists) {
      return res.status(403).json({ success: false, error: 'Unauthorised' });
    }

    let wishlist = await Wishlist.findOne({ userId }).populate('propertyIds');
    if (!wishlist) {
      return res.json({ success: true, wishlist: { userId, propertyIds: [] } });
    }

    /* populate() replaces deleted property refs with null — filter them out
       and persist the clean list so stale IDs don't accumulate in the DB */
    const hadNulls = wishlist.propertyIds.some(p => p === null);
    if (hadNulls) {
      wishlist.propertyIds = wishlist.propertyIds.filter(p => p !== null);
      await wishlist.save();
    }

    res.json({ success: true, wishlist });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* POST /api/wishlist/:userId/add — add a property to wishlist */
app.post('/api/wishlist/:userId/add',
  rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many wishlist requests' }),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { propertyId } = req.body;

      if (!userId || userId.length < 10) {
        return res.status(400).json({ success: false, error: 'Invalid userId' });
      }
      if (!propertyId) {
        return res.status(400).json({ success: false, error: 'propertyId required' });
      }

      /* Verify the userId was issued by this server */
      const userExists = await User.exists({ uuid: userId });
      if (!userExists) {
        return res.status(403).json({ success: false, error: 'Unauthorised' });
      }

      /* Verify the property actually exists before adding */
      const propertyExists = await Property.exists({ _id: propertyId });
      if (!propertyExists) {
        return res.status(404).json({ success: false, error: 'Property not found' });
      }

      /* Atomic upsert — $addToSet prevents duplicates */
      const wishlist = await Wishlist.findOneAndUpdate(
        { userId },
        {
          $addToSet: { propertyIds: propertyId },
          $set:      { updatedAt: new Date() },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true, new: true }
      );

      res.json({ success: true, count: wishlist.propertyIds.length });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

/* POST /api/wishlist/:userId/remove — remove a property from wishlist */
app.post('/api/wishlist/:userId/remove',
  rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many wishlist requests' }),
  async (req, res) => {
    try {
      const { userId } = req.params;
      const { propertyId } = req.body;

      if (!userId || userId.length < 10) {
        return res.status(400).json({ success: false, error: 'Invalid userId' });
      }
      if (!propertyId) {
        return res.status(400).json({ success: false, error: 'propertyId required' });
      }

      /* Verify the userId was issued by this server */
      const userExists = await User.exists({ uuid: userId });
      if (!userExists) {
        return res.status(403).json({ success: false, error: 'Unauthorised' });
      }

      /* Atomic pull — safe even if the id wasn't in the list */
      const wishlist = await Wishlist.findOneAndUpdate(
        { userId },
        {
          $pull: { propertyIds: propertyId },
          $set:  { updatedAt: new Date() }
        },
        { new: true }
      );

      if (!wishlist) {
        return res.json({ success: true, count: 0 }); // nothing to remove
      }

      res.json({ success: true, count: wishlist.propertyIds.length });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  }
);

/* ════════════════════════════════════════════════════════════
   OTP VERIFICATION & ANONYMOUS USER IDENTITY
   POST /api/otp/verify
   ─ Client sends: { idToken, phone }
     idToken  = Firebase ID token obtained after signInWithPhoneNumber
                + confirmationResult.confirm(code)
     phone    = E.164 formatted number (e.g. "+919876543210")
   ─ Server verifies the Firebase ID token using Firebase Admin SDK.
     In development (no Admin SDK), it falls back to trusting the
     phone field directly — NEVER deploy this fallback to production.
   ─ On success: normalises number → SHA-256 hash → upserts User
     → returns stable uuid.
   ─ Rate limited: 10 calls / 15 min per IP to block enumeration.
   ════════════════════════════════════════════════════════════ */

/* Helper: generate a UUID v4 without external deps */
function generateUUID() {
  return crypto.randomBytes(16).toString('hex').replace(
    /^(.{8})(.{4})(.{4})(.{4})(.{12})$/,
    '$1-$2-4$3-a$4-$5'
  );
}

/* Helper: SHA-256 of a string → hex */
function sha256(str) {
  return crypto.createHash('sha256').update(str, 'utf8').digest('hex');
}

/* Helper: normalise a phone string to E.164-ish for consistent hashing.
   Strips all non-digit chars except a leading +, so "+91 98765 43210"
   and "+919876543210" both hash to the same value. */
function normalisePhone(raw) {
  const stripped = raw.replace(/[\s\-().]/g, '');
  return stripped.startsWith('+') ? stripped : '+' + stripped.replace(/^\+/, '');
}

const otpVerifyRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many verification attempts — please try again in 15 minutes'
});

app.post('/api/otp/verify', otpVerifyRateLimit, async (req, res) => {
  try {
    const { idToken, phone } = req.body;

    /* We always need a phone number */
    if (!phone || typeof phone !== 'string' || phone.trim().length < 6) {
      return res.status(400).json({ success: false, error: 'Valid phone number required' });
    }

    let verifiedPhone = normalisePhone(phone.trim());

    /* ── Production: verify Firebase ID token ── */
    if (firebaseAdmin) {
      if (!idToken || typeof idToken !== 'string') {
        return res.status(400).json({ success: false, error: 'Firebase ID token required' });
      }

      let decodedToken;
      try {
        decodedToken = await firebaseAdmin.auth().verifyIdToken(idToken);
      } catch (fbErr) {
        console.error('[OTP] Firebase token verification failed:', fbErr.code, fbErr.message);
        const friendly =
          fbErr.code === 'auth/id-token-expired'  ? 'Session expired — please verify again.' :
          fbErr.code === 'auth/argument-error'    ? 'Invalid verification token.' :
          fbErr.code === 'auth/id-token-revoked'  ? 'Token has been revoked — please verify again.' :
          'Phone verification failed. Please try again.';
        return res.status(401).json({ success: false, error: friendly });
      }

      /* Confirm the phone in the token matches what the client claims.
         Firebase stores the verified phone as decodedToken.phone_number in E.164 format. */
      const tokenPhone = decodedToken.phone_number || '';
      if (tokenPhone && normalisePhone(tokenPhone) !== verifiedPhone) {
        console.warn('[OTP] Token phone mismatch — token:', tokenPhone, 'claimed:', verifiedPhone);
        return res.status(401).json({ success: false, error: 'Phone number mismatch. Please try again.' });
      }
      /* Trust the E.164 number from the token as the authoritative value */
      if (tokenPhone) verifiedPhone = normalisePhone(tokenPhone);

    } else {
      /* ── Development fallback: no Firebase Admin SDK ── */
      if (IS_PROD) {
        return res.status(500).json({ success: false, error: 'Firebase Admin SDK not configured.' });
      }
      console.warn('[OTP] DEV MODE: skipping Firebase token verification. Set FIREBASE_* env vars for production.');
    }

    const phoneHash = sha256(verifiedPhone);

    /* Upsert: find existing user or create a new one */
    let user = await User.findOne({ phoneHash });
    if (!user) {
      user = new User({ phoneHash, uuid: generateUUID(), phone: verifiedPhone });
      await user.save();
    } else {
      user.lastSeenAt = new Date();
      user.phone      = verifiedPhone; /* keep in sync */
      await user.save();
    }

    /* Block check — after save so lastSeenAt is always updated */
    if (user.blocked) {
      return res.status(403).json({
        success: false,
        error: 'This number has been restricted. Please contact support.'
      });
    }

    res.json({ success: true, uuid: user.uuid });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ════════════════════════════════════════════════════════════
   ADMIN AUTH & PROTECTED ROUTES
   Token-based sessions with sliding expiry.
   Credentials must be set via environment variables.
   ════════════════════════════════════════════════════════════ */

/* Active admin sessions: token → expiry */
const adminSessions = new Map();
const SESSION_TTL   = 8 * 60 * 60 * 1000; // 8 hours

function genToken() { return crypto.randomBytes(32).toString('hex'); }

/* Timing-safe string comparison to prevent timing attacks */
function safeCompare(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  if (bufA.length !== bufB.length) {
    /* Still run timingSafeEqual with equal-length buffers to avoid leaking length */
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/* Middleware: verify admin token */
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (!token) return res.status(401).json({ success: false, error: 'Unauthorised' });
  const expiry = adminSessions.get(token);
  if (!expiry || Date.now() > expiry)
    return res.status(401).json({ success: false, error: 'Session expired — please log in again' });
  /* Slide session window */
  adminSessions.set(token, Date.now() + SESSION_TTL);
  next();
}

/* Clean up expired sessions every hour */
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of adminSessions) {
    if (now > expiry) adminSessions.delete(token);
  }
}, 60 * 60 * 1000);

/* Rate limit: 10 login attempts per 15 minutes per IP */
const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: 'Too many login attempts — please try again in 15 minutes'
});

/* POST /api/admin/login */
app.post('/api/admin/login', loginRateLimit, (req, res) => {
  const { username, password } = req.body;
  const validUser = process.env.ADMIN_USERNAME;
  const validPass = process.env.ADMIN_PASSWORD;

  if (!validUser || !validPass) {
    console.error('✗ ADMIN_USERNAME / ADMIN_PASSWORD not set in environment');
    return res.status(500).json({ success: false, error: 'Server misconfiguration' });
  }

  const userOk = safeCompare(username, validUser);
  const passOk = safeCompare(password, validPass);

  if (userOk && passOk) {
    const token = genToken();
    adminSessions.set(token, Date.now() + SESSION_TTL);
    return res.json({ success: true, token });
  }
  /* Generic message — don't reveal which field was wrong */
  res.status(401).json({ success: false, error: 'Invalid credentials' });
});

/* GET /api/admin/verify */
app.get('/api/admin/verify', requireAdmin, (req, res) => {
  res.json({ success: true });
});

/* ════════════════════════════════════════════════════════════
   ADMIN — USER BLOCK MANAGEMENT
   Phone numbers are stored only as SHA-256 hashes in phoneHash.
   The plain normalised number is stored in the `phone` field
   once the user has verified OTP at least once — that is what
   the admin panel displays (masked).
   ════════════════════════════════════════════════════════════ */

/* GET /api/admin/users — list all users with block status + linked contact submissions.
   Also surfaces uuid-less contacts (chat leads / legacy) as anonymous rows so nothing
   is invisible in the admin panel.                                                     */
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const users = await User.find({})
      .sort({ createdAt: -1 })
      .select('uuid phone blocked createdAt lastSeenAt');

    /* All contacts, sorted newest first */
    const allContacts = await Contact.find({})
      .select('uuid name email phone message status createdAt')
      .sort({ createdAt: -1 });

    /* Partition: contacts linked to a verified user vs anonymous (uuid null) */
    const contactsByUuid = {};
    const anonymousContacts = [];
    for (const c of allContacts) {
      if (c.uuid) {
        if (!contactsByUuid[c.uuid]) contactsByUuid[c.uuid] = [];
        contactsByUuid[c.uuid].push(c);
      } else {
        anonymousContacts.push(c);
      }
    }

    /* Verified users with their linked submissions */
    const enriched = users.map(u => ({
      uuid:       u.uuid,
      phone:      u.phone,
      blocked:    u.blocked,
      createdAt:  u.createdAt,
      lastSeenAt: u.lastSeenAt,
      contacts:   contactsByUuid[u.uuid] || [],
      anonymous:  false
    }));

    /* Anonymous leads (chat leads, legacy records) — appear as unverified rows */
    const anonRows = anonymousContacts.map(c => ({
      uuid:       null,
      phone:      c.phone || null,
      blocked:    false,
      createdAt:  c.createdAt,
      lastSeenAt: null,
      contacts:   [c],
      anonymous:  true   // flag so admin UI can label these differently
    }));

    res.json({ success: true, users: [...enriched, ...anonRows] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* POST /api/admin/users/block
   Body: { phone: '+919876543210' }  — block by phone number.
   If user hasn't verified yet, creates a pre-emptive stub so they
   are refused the moment they first try to verify.              */
app.post('/api/admin/users/block',
  requireAdmin,
  rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many requests' }),
  async (req, res) => {
    try {
      const { phone, uuid } = req.body;
      if (!phone && !uuid)
        return res.status(400).json({ success: false, error: 'Provide phone or uuid' });

      let user;
      if (uuid) {
        user = await User.findOne({ uuid });
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
      } else {
        const norm      = normalisePhone(phone.trim());
        const phoneHash = sha256(norm);
        user = await User.findOne({ phoneHash });
        if (!user) {
          user = new User({ phoneHash, uuid: generateUUID(), phone: norm, blocked: true });
          await user.save();
          return res.json({ success: true, user, preemptive: true });
        }
      }

      user.blocked = true;
      await user.save();
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* POST /api/admin/users/unblock — unblock by uuid */
app.post('/api/admin/users/unblock',
  requireAdmin,
  rateLimit({ windowMs: 60 * 1000, max: 60, message: 'Too many requests' }),
  async (req, res) => {
    try {
      const { uuid } = req.body;
      if (!uuid) return res.status(400).json({ success: false, error: 'uuid required' });
      const user = await User.findOne({ uuid });
      if (!user) return res.status(404).json({ success: false, error: 'User not found' });
      user.blocked = false;
      await user.save();
      res.json({ success: true, user });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/* GET /api/admin/wishlists — fetch all wishlists in one call for the export
   Returns a map of { uuid: ["Title (Price)", ...] }                        */
app.get('/api/admin/wishlists', requireAdmin, async (req, res) => {
  try {
    const wishlists = await Wishlist.find({}).populate('propertyIds', 'title price locality');
    const map = {};
    for (const wl of wishlists) {
      map[wl.userId] = (wl.propertyIds || [])
        .filter(p => p !== null)
        .map(p => `${p.title} (${p.price})`);
    }
    res.json({ success: true, map });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* GET /api/admin/users/:uuid/wishlist — full wishlist for the drawer in admin panel */
app.get('/api/admin/users/:uuid/wishlist', requireAdmin, async (req, res) => {
  try {
    const { uuid } = req.params;
    const user = await User.findOne({ uuid }).select('uuid phone');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    const wishlist = await Wishlist.findOne({ userId: uuid }).populate('propertyIds');
    if (!wishlist) return res.json({ success: true, properties: [], count: 0 });

    const properties = (wishlist.propertyIds || [])
      .filter(p => p !== null)
      .map(p => ({
        _id:      p._id,
        title:    p.title,
        locality: p.locality,
        price:    p.price,
        type:     p.type,
        bhk:      p.bhk,
        area:     p.area,
        badge:    p.badge,
        status:   p.status,
        img:      p.img
      }));

    res.json({ success: true, properties, count: properties.length });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* POST /api/admin/logout */
app.post('/api/admin/logout', (req, res) => {
  const token = req.headers['x-admin-token'];
  if (token) adminSessions.delete(token);
  res.json({ success: true });
});

/* ── Admin: image upload (returns data-URI back as URL — no disk write needed) ──
   The client sends a multipart with an "image" field.
   We decode it and return it as a data URI.
   For production, swap this for Cloudinary / S3.                              */
app.post('/api/admin/upload', requireAdmin, express.raw({ type: '*/*', limit: '20mb' }), (req, res) => {
  /* express.raw() captures the raw body before bodyParser can consume it */
  try {
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
    const contentType = req.headers['content-type'] || '';

    /* Extract boundary */
    const boundaryMatch = contentType.match(/boundary=([^\s;]+)/);
    if (!boundaryMatch) return res.status(400).json({ success: false, error: 'No boundary in multipart' });

    const boundary = '--' + boundaryMatch[1];
    const bodyStr  = body.toString('binary');
    const parts    = bodyStr.split(boundary);

    let imgBuffer  = null;
    let imgMime    = 'image/jpeg';

    for (const part of parts) {
      if (!part.includes('Content-Disposition')) continue;
      if (!part.includes('name="image"')) continue;

      const mimeMatch = part.match(/Content-Type:\s*([^\r\n]+)/i);
      if (mimeMatch) imgMime = mimeMatch[1].trim();

      /* Data starts after double CRLF */
      const dataStart = part.indexOf('\r\n\r\n');
      if (dataStart === -1) continue;
      const raw = part.slice(dataStart + 4, part.lastIndexOf('\r\n'));
      imgBuffer = Buffer.from(raw, 'binary');
      break;
    }

    if (!imgBuffer || imgBuffer.length === 0)
      return res.status(400).json({ success: false, error: 'No image data received' });

    const dataUri = `data:${imgMime};base64,${imgBuffer.toString('base64')}`;
    res.json({ success: true, url: dataUri });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── Admin: create property ── */
app.post('/api/admin/properties', requireAdmin, async (req, res) => {
  try {
    /* Map admin form fields → schema fields */
    const body = mapAdminToSchema(req.body);
    const property = new Property(body);
    await property.save();
    res.status(201).json({ success: true, property });
  } catch (err) {
    const code = err.code === 11000 ? 409 : 400;
    res.status(code).json({ success: false, error: err.message });
  }
});

/* ── Admin: update property ── */
app.put('/api/admin/properties/:id', requireAdmin, async (req, res) => {
  try {
    const body = mapAdminToSchema(req.body);
    body.updatedAt = Date.now();
    /* If no new image was supplied, keep the existing one so required validator doesn't fire */
    if (!body.img) {
      const existing = await Property.findById(req.params.id).select('img').lean();
      if (existing) body.img = existing.img;
    }
    const property = await Property.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!property) return res.status(404).json({ success: false, error: 'Property not found' });
    res.json({ success: true, property });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* ── Admin: delete property ── */
app.delete('/api/admin/properties/:id', requireAdmin, async (req, res) => {
  try {
    const property = await Property.findByIdAndDelete(req.params.id);
    if (!property) return res.status(404).json({ success: false, error: 'Property not found' });

    /* Remove the deleted property from every user's wishlist so stale
       ObjectIds never accumulate and populate() never returns nulls */
    await Wishlist.updateMany(
      { propertyIds: property._id },
      { $pull: { propertyIds: property._id }, $set: { updatedAt: new Date() } }
    );

    res.json({ success: true, message: 'Property deleted' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── Admin: get all contacts ── */
app.get('/api/admin/contacts', requireAdmin, async (req, res) => {
  try {
    const contacts = await Contact.find().sort({ createdAt: -1 });
    res.json({ success: true, contacts });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ── Admin: update contact status ── */
app.patch('/api/admin/contacts/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const contact = await Contact.findByIdAndUpdate(req.params.id, { status }, { new: true });
    if (!contact) return res.status(404).json({ success: false, error: 'Contact not found' });
    res.json({ success: true, contact });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
});

/* ── Map admin form payload → Property schema ──
   Admin form uses:
     house_type  → schema: type  (lowercase: apartment, villa, penthouse, plot, farmhouse)
     badge       → "sale" sets status=sale, badge=null; "new" sets status=sale, badge=new
                   "underconstruction" sets status=underconstruction, badge=null
                   "premium"/"featured" set status=sale + badge=premium/featured
     status      → constructionStatus (the display string: "Ready to Move" / "Under Construction")
*/
function mapAdminToSchema(body) {
  const houseTypeMap = {
    'apartment': 'apartment', 'Apartment': 'apartment',
    'villa':     'villa',     'Villa':     'villa',
    'penthouse': 'penthouse', 'Penthouse': 'penthouse',
    'plot':      'plot',      'Plot':      'plot',
    'farmhouse': 'farmhouse', 'Farmhouse': 'farmhouse',
    'Bungalow':  'villa',     'Row House': 'villa', 'Studio': 'apartment'
  };

  const schemaType = houseTypeMap[body.house_type] || body.type || 'apartment';

  /* Determine status + badge from the admin "badge" selector */
  let schemaStatus = 'sale';
  let schemaBadge  = null;

  switch (body.badge) {
    case 'underconstruction':
      schemaStatus = 'underconstruction';
      schemaBadge  = null;
      break;
    case 'sale':
      schemaStatus = 'sale';
      schemaBadge  = null;
      break;
    case 'new':
      schemaStatus = 'sale';
      schemaBadge  = 'new';
      break;
    case 'featured':
      schemaStatus = 'sale';
      schemaBadge  = 'featured';
      break;
    case 'premium':
      schemaStatus = 'sale';
      schemaBadge  = 'premium';
      break;
    default:
      schemaStatus = body.status && ['sale','underconstruction'].includes(body.status)
        ? body.status : 'sale';
      schemaBadge  = null;
  }

  /* Parse images array — admin sends comma-separated string or array */
  let images = [];
  if (Array.isArray(body.images)) {
    images = body.images.filter(Boolean);
  } else if (typeof body.images === 'string' && body.images.trim()) {
    images = body.images.split(',').map(s => s.trim()).filter(Boolean);
  }
  /* Ensure primary img is always first in images array */
  if (body.img && !images.includes(body.img)) images.unshift(body.img);

  let floorPlanImages = [];
  if (Array.isArray(body.floorPlanImages)) {
    floorPlanImages = body.floorPlanImages.filter(Boolean);
  } else if (typeof body.floorPlanImages === 'string' && body.floorPlanImages.trim()) {
    floorPlanImages = body.floorPlanImages.split(',').map(s => s.trim()).filter(Boolean);
  }

  /* Parse configurations array sent from admin form */
  let configurations = [];
  if (Array.isArray(body.configurations) && body.configurations.length) {
    configurations = body.configurations.map(c => {
      const bhk      = Number(c.bhk)      || 2;
      const baths    = Number(c.baths)    || 2;
      const areaMin  = Number(c.areaMin)  || Number(c.area) || 0;
      const areaMax  = Number(c.areaMax)  || areaMin;
      const priceMin = Number(c.priceMin) || Number(c.priceRaw) || 0;
      const priceMax = Number(c.priceMax) || priceMin;

      /* Build a display label like "₹68L – ₹95L" or "₹2.85 Cr" */
      const fmtINR = n => n >= 1e7
        ? '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr'
        : '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + 'L';
      const priceLabel = priceMin === priceMax
        ? (c.priceLabel || fmtINR(priceMin))
        : `${fmtINR(priceMin)} – ${fmtINR(priceMax)}`;

      return { bhk, baths, areaMin, areaMax, priceMin, priceMax, priceLabel };
    });
  }

  /* Derive aggregate range values and legacy fields from configurations */
  let priceMin = null, priceMax = null, areaMin = null, areaMax = null;
  let legacyBhk = Number(body.bhk) || 2;
  let legacyArea = Number(body.area) || 0;
  let legacyBaths = Number(body.baths) || 2;

  if (configurations.length) {
    priceMin = Math.min(...configurations.map(c => c.priceMin));
    priceMax = Math.max(...configurations.map(c => c.priceMax));
    areaMin  = Math.min(...configurations.map(c => c.areaMin));
    areaMax  = Math.max(...configurations.map(c => c.areaMax));
    // Legacy fields = cheapest config
    const cheapest = configurations.reduce((a, b) => a.priceMin <= b.priceMin ? a : b);
    legacyBhk   = cheapest.bhk;
    legacyArea  = cheapest.areaMin;
    legacyBaths = cheapest.baths;
  }

  /* Build display price: "₹68L – ₹2.85 Cr" or use provided body.price */
  const fmtINR = n => n >= 1e7
    ? '₹' + (n / 1e7).toFixed(2).replace(/\.?0+$/, '') + ' Cr'
    : '₹' + (n / 1e5).toFixed(2).replace(/\.?0+$/, '') + 'L';

  let displayPrice = (body.price || '').replace(/\s*onwards\s*/i, '').trim() || null;
  if (!displayPrice && configurations.length) {
    displayPrice = priceMin === priceMax
      ? fmtINR(priceMin)
      : `${fmtINR(priceMin)} – ${fmtINR(priceMax)}`;
  }

  return {
    title:              body.title,
    locality:           body.locality,
    city:               body.city || 'Hyderabad',
    price:              displayPrice || body.price,
    priceRaw:           priceMin || Number(body.priceRaw) || 0,
    type:               schemaType,
    status:             schemaStatus,
    configurations,
    bhk:                legacyBhk,
    area:               legacyArea,
    baths:              legacyBaths,
    priceMin,
    priceMax,
    areaMin,
    areaMax,
    constructionStatus: body.status || 'Ready to Move',
    rera:               body.rera || 'N/A',
    img:                body.img,
    images:             images,
    floorPlanImages:    floorPlanImages,
    locationLat:        body.locationLat  ? Number(body.locationLat)  : null,
    locationLng:        body.locationLng  ? Number(body.locationLng)  : null,
    brochureUrl:        body.brochureUrl  || null,
    badge:              schemaBadge,
    featured:           !!body.featured,
    amenities:          Array.isArray(body.amenities) ? body.amenities : [],
    description:        body.description,
    pricePerSqft:       body.pricePerSqft !== undefined && body.pricePerSqft !== ''
                          ? Number(body.pricePerSqft) || null
                          : null
  };
}

/* ── Global error handler ── */
app.use((err, req, res, next) => {
  /* CORS errors */
  if (err.message && err.message.startsWith('CORS:')) {
    return res.status(403).json({ success: false, error: err.message });
  }
  console.error('Unhandled error:', err);
  res.status(500).json({ success: false, error: IS_PROD ? 'Internal server error' : err.message });
});

/* ── Catch-all: serve index.html for any non-API, non-file route ── */
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  }
});

/* ── Self-ping: keeps Render free tier awake every 30 seconds ── */
const SELF_URL = process.env.RENDER_EXTERNAL_URL
  ? `${process.env.RENDER_EXTERNAL_URL}/api/health`
  : null;

if (IS_PROD && SELF_URL) {
  setInterval(() => {
    https.get(SELF_URL, (res) => {
      //console.log(`[self-ping] ${res.statusCode} at ${new Date().toISOString()}`);
    }).on('error', (err) => {
      console.warn('[self-ping] failed:', err.message);
    });
  }, 30 * 1000);
  console.log(`🔁 Self-ping enabled → ${SELF_URL} (every 30s)`);
}

/* ── Start Server ── */
app.listen(PORT, () => {
  console.log(`🚀 Luxe Estates API running on port ${PORT} [${IS_PROD ? 'PRODUCTION' : 'development'}]`);
  console.log(`📌 Health check: http://localhost:${PORT}/api/health`);
  console.log(`🌐 Frontend:     http://localhost:${PORT}`);
  if (!IS_PROD) console.log(`🌱 Seed data:    POST http://localhost:${PORT}/api/seed/properties  (admin token required)`);
});

module.exports = app;