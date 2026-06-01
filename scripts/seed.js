/* ============================================================
   LUXE ESTATES — seed.js
   Run:  node scripts/seed.js
   Drops all properties and inserts 12 fully-featured demo
   properties that exercise every new field: multiple images,
   floor plan images, GPS coordinates, brochure URL.
   ============================================================ */
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/luxe_estates';

const propertySchema = new mongoose.Schema({
  title: String, locality: String, city: String,
  price: String, priceRaw: Number,
  type:   String,
  status: String,
  bhk: Number, area: Number, baths: Number,
  constructionStatus: String, rera: String,
  img: String,
  images:          [String],
  floorPlanImages: [String],
  locationLat: Number, locationLng: Number,
  brochureUrl: String,
  badge:    String,
  featured: Boolean,
  amenities:   [String],
  description: String,
  createdAt:   { type: Date, default: Date.now },
  updatedAt:   { type: Date, default: Date.now },
}, { strict: false });

const Property = mongoose.model('Property', propertySchema);

/* Shared floor-plan images (architectural / blueprint style) */
const FP = [
  'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=900&q=80',
  'https://images.unsplash.com/photo-1580894732444-8ecded7900cd?w=900&q=80',
  'https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=900&q=80',
  'https://images.unsplash.com/photo-1528323273322-d81458248d40?w=900&q=80',
];

/* Dummy PDF for brochure demo */
const BROCHURE = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

const SEED_DATA = [
  {
    title: 'The Imperial Penthouse',
    locality: 'Banjara Hills', city: 'Hyderabad',
    price: '₹7.5 Cr', priceRaw: 75000000,
    type: 'penthouse', status: 'sale', bhk: 4, area: 5200, baths: 5,
    constructionStatus: 'Ready to Move',
    badge: 'premium', featured: true,
    rera: 'TSRERA/PRJ/2021/000789',
    img:  'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&q=85',
    images: [
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&q=85',
      'https://images.unsplash.com/photo-1560185009-dddecae3a8e1?w=900&q=80',
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=900&q=80',
      'https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=900&q=80',
      'https://images.unsplash.com/photo-1571939228382-b2f2b585ce15?w=900&q=80',
    ],
    floorPlanImages: [FP[0], FP[1]],
    locationLat: 17.4126, locationLng: 78.4435,
    brochureUrl: BROCHURE,
    amenities: ['Private Pool','Home Theatre','Gym','Smart Home','Concierge Service','Private Lift','Sky Lounge','Helipad'],
    description: 'Ultra-luxury penthouse spanning two floors with a private rooftop infinity pool overlooking Hussain Sagar. Features Crestron smart-home automation, Italian marble throughout, Sub-Zero kitchen appliances, private elevator, and dedicated concierge. The pinnacle of refined living in Hyderabad.',
  },
  {
    title: 'Prestige Skyline Tower',
    locality: 'Banjara Hills', city: 'Hyderabad',
    price: '₹2.85 Cr', priceRaw: 28500000,
    type: 'apartment', status: 'sale', bhk: 3, area: 1850, baths: 3,
    constructionStatus: 'Ready to Move',
    badge: 'premium', featured: true,
    rera: 'TSRERA/PRJ/2023/001234',
    img:  'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=900&q=85',
    images: [
      'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=900&q=85',
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&q=80',
      'https://images.unsplash.com/photo-1484154218962-a197022b5858?w=900&q=80',
      'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&q=80',
    ],
    floorPlanImages: [FP[0], FP[2]],
    locationLat: 17.4150, locationLng: 78.4478,
    brochureUrl: BROCHURE,
    amenities: ['Swimming Pool','Gym','Covered Parking','Clubhouse','24/7 Security','Power Backup','Jogging Track'],
    description: 'A magnificent 3BHK on the 24th floor of Banjara Hills\' most coveted tower. Premium Italian marble flooring, fully modular kitchen with Hettich hardware, floor-to-ceiling glass windows and panoramic city views. Move-in ready. No brokerage.',
  },
  {
    title: 'Pinnacle Heights',
    locality: 'Gachibowli', city: 'Hyderabad',
    price: '₹3.2 Cr', priceRaw: 32000000,
    type: 'penthouse', status: 'sale', bhk: 4, area: 3800, baths: 4,
    constructionStatus: 'Ready to Move',
    badge: 'featured', featured: true,
    rera: 'TSRERA/PRJ/2022/005511',
    img:  'https://images.unsplash.com/photo-1622866306950-81d17097d458?w=900&q=85',
    images: [
      'https://images.unsplash.com/photo-1622866306950-81d17097d458?w=900&q=85',
      'https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=900&q=80',
      'https://images.unsplash.com/photo-1600566752355-35792bedcfea?w=900&q=80',
      'https://images.unsplash.com/photo-1565182999561-18d7dc61c393?w=900&q=80',
    ],
    floorPlanImages: [FP[1], FP[3]],
    locationLat: 17.4401, locationLng: 78.3489,
    brochureUrl: BROCHURE,
    amenities: ['Private Terrace','Swimming Pool','Gym','Smart Home','Concierge','Co-working Space','EV Charging'],
    description: 'Stunning 4BHK penthouse with 360° city views and a sprawling private terrace. Smart home automation for lighting, AC, and security. Private elevator access and premium finishing by award-winning architects. RERA certified and ready to move.',
  },
  {
    title: 'Green Valley Residences',
    locality: 'Kondapur', city: 'Hyderabad',
    price: '₹68 L', priceRaw: 6800000,
    type: 'apartment', status: 'underconstruction', bhk: 2, area: 1180, baths: 2,
    constructionStatus: 'Under Construction — Dec 2026',
    badge: 'new', featured: true,
    rera: 'TSRERA/PRJ/2023/005678',
    img:  'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=900&q=85',
    images: [
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=900&q=85',
      'https://images.unsplash.com/photo-1616047006789-b7af5afb8c20?w=900&q=80',
      'https://images.unsplash.com/photo-1560185007-cde436f6a4d0?w=900&q=80',
    ],
    floorPlanImages: [FP[2], FP[0]],
    locationLat: 17.4607, locationLng: 78.3610,
    brochureUrl: BROCHURE,
    amenities: ['Landscaped Garden','Gym','Parking','Children Play Area','Amphitheatre','Pet Park','Meditation Garden'],
    description: 'Thoughtfully designed 2BHK homes within 5 acres of lush landscaping. RERA approved, Vaastu-compliant, with OC-ready possession in December 2026. Every apartment faces a green courtyard. Amenities include an amphitheatre, pet park, and meditation garden.',
  },
  {
    title: 'Lotus Petal Villas',
    locality: 'Kokapet', city: 'Hyderabad',
    price: '₹1.4 Cr', priceRaw: 14000000,
    type: 'villa', status: 'sale', bhk: 4, area: 2800, baths: 4,
    constructionStatus: 'Ready to Move',
    badge: 'featured', featured: true,
    rera: 'TSRERA/PRJ/2023/007890',
    img:  'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=900&q=85',
    images: [
      'https://images.unsplash.com/photo-1580587771525-78b9dba3b914?w=900&q=85',
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=900&q=80',
      'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=900&q=80',
      'https://images.unsplash.com/photo-1564013799919-ab600027ffc6?w=900&q=80',
    ],
    floorPlanImages: [FP[3], FP[1]],
    locationLat: 17.3996, locationLng: 78.3217,
    brochureUrl: BROCHURE,
    amenities: ['Swimming Pool','Gym','Clubhouse','Private Garden','Gated Community','EV Charging','Squash Court','Indoor Games'],
    description: 'Independent G+2 villas with private terrace, garden, and basement parking in a 12-acre gated township. Club membership included — pool, gym, squash court, and indoor games room. Premium location minutes from the Outer Ring Road and Financial District.',
  },
  {
    title: 'Crystal Heights',
    locality: 'Gachibowli', city: 'Hyderabad',
    price: '₹95 L', priceRaw: 9500000,
    type: 'apartment', status: 'underconstruction', bhk: 3, area: 1600, baths: 2,
    constructionStatus: 'Under Construction — Mar 2027',
    badge: 'new', featured: false,
    rera: 'TSRERA/PRJ/2024/001100',
    img:  'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=900&q=85',
    images: [
      'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=900&q=85',
      'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=900&q=80',
      'https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=900&q=80',
    ],
    floorPlanImages: [FP[0]],
    locationLat: 17.4400, locationLng: 78.3489,
    brochureUrl: null,
    amenities: ['Gym','Parking','Clubhouse','Jogging Track','Senior Citizen Zone','Yoga Deck'],
    description: 'Modern 3BHK apartments in the IT corridor with excellent connectivity to HITEC City, ISB, and the Financial District. Features a dedicated jogging track, yoga deck, and senior citizen zone. 72% carpet-area efficiency. Bank loan pre-approved with SBI and HDFC.',
  },
  {
    title: 'The Windsor Apartments',
    locality: 'Jubilee Hills', city: 'Hyderabad',
    price: '₹1.2 Cr', priceRaw: 12000000,
    type: 'apartment', status: 'sale', bhk: 3, area: 2100, baths: 3,
    constructionStatus: 'Ready to Move',
    badge: null, featured: false,
    rera: 'TSRERA/PRJ/2022/009012',
    img:  'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=900&q=85',
    images: [
      'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=900&q=85',
      'https://images.unsplash.com/photo-1600210491892-03d54c28bdfe?w=900&q=80',
      'https://images.unsplash.com/photo-1618221195710-dd6b41faaea6?w=900&q=80',
    ],
    floorPlanImages: [FP[2]],
    locationLat: 17.4325, locationLng: 78.4068,
    brochureUrl: BROCHURE,
    amenities: ['Swimming Pool','Gym','24/7 Security','Covered Parking','Power Backup','Clubhouse'],
    description: 'Semi-furnished luxury 3BHK in the heart of Jubilee Hills. Walking distance to top schools, hospitals, and the best restaurants in the city. Freshly renovated building with modern lift. A rare direct-from-owner sale — zero brokerage.',
  },
  {
    title: 'Harmony Villas',
    locality: 'Puppalaguda', city: 'Hyderabad',
    price: '₹2.1 Cr', priceRaw: 21000000,
    type: 'villa', status: 'underconstruction', bhk: 4, area: 3200, baths: 4,
    constructionStatus: 'Under Construction — Jun 2026',
    badge: 'new', featured: false,
    rera: 'TSRERA/PRJ/2024/003388',
    img:  'https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=900&q=85',
    images: [
      'https://images.unsplash.com/photo-1576941089067-2de3c901e126?w=900&q=85',
      'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?w=900&q=80',
      'https://images.unsplash.com/photo-1560185127-6a7b5aa36fc6?w=900&q=80',
    ],
    floorPlanImages: [FP[1], FP[3]],
    locationLat: 17.3853, locationLng: 78.3580,
    brochureUrl: BROCHURE,
    amenities: ['Private Garden','Swimming Pool','Gym','Clubhouse','24/7 Security','EV Charging','Pet Park'],
    description: 'Spacious duplex villas in a gated township adjacent to the Financial District. Each villa has a private garden, double-height living room, and rooftop terrace. Vastu-compliant. RERA approved with June 2026 possession.',
  },
  {
    title: 'Serene Meadows',
    locality: 'Manikonda', city: 'Hyderabad',
    price: '₹62 L', priceRaw: 6200000,
    type: 'apartment', status: 'sale', bhk: 2, area: 1050, baths: 2,
    constructionStatus: 'Ready to Move',
    badge: null, featured: false,
    rera: 'TSRERA/PRJ/2022/003344',
    img:  'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=900&q=85',
    images: [
      'https://images.unsplash.com/photo-1493809842364-78817add7ffb?w=900&q=85',
      'https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=900&q=80',
    ],
    floorPlanImages: [FP[0]],
    locationLat: 17.4040, locationLng: 78.3881,
    brochureUrl: null,
    amenities: ['Children Play Area','Parking','Security','Landscaped Garden'],
    description: 'Well-maintained 2BHK in a mature residential community close to DLF Cyber City, IKEA, and the PVNR Expressway. Active RWA with 24/7 security and a landscaped garden. Ideal first home or investment property with strong rental yield of 3.5%.',
  },
  {
    title: 'Emerald Gardens',
    locality: 'Nallagandla', city: 'Hyderabad',
    price: '₹74 L', priceRaw: 7400000,
    type: 'apartment', status: 'underconstruction', bhk: 2, area: 1230, baths: 2,
    constructionStatus: 'Under Construction — Sep 2026',
    badge: 'new', featured: false,
    rera: 'TSRERA/PRJ/2024/002200',
    img:  'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=900&q=85',
    images: [
      'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=900&q=85',
      'https://images.unsplash.com/photo-1494526585095-c41746248156?w=900&q=80',
    ],
    floorPlanImages: [FP[2], FP[1]],
    locationLat: 17.4530, locationLng: 78.3260,
    brochureUrl: null,
    amenities: ['Gym','Swimming Pool','Parking','Clubhouse','Meditation Garden','Yoga Deck'],
    description: 'RERA-approved 2BHK homes surrounded by 4 acres of natural green cover. Designed around wellness — meditation garden, outdoor yoga deck, and a nature walk trail. Close to HITEC City via ORR. Bank loans pre-cleared with SBI, HDFC, and ICICI.',
  },
  {
    title: 'Oakwood Farms',
    locality: 'Shankarpally', city: 'Hyderabad',
    price: '₹1.8 Cr', priceRaw: 18000000,
    type: 'farmhouse', status: 'sale', bhk: 3, area: 6000, baths: 3,
    constructionStatus: 'Ready to Move',
    badge: null, featured: false,
    rera: 'TSRERA/PRJ/2020/009901',
    img:  'https://images.unsplash.com/photo-1464146072230-91cabc968266?w=900&q=85',
    images: [
      'https://images.unsplash.com/photo-1464146072230-91cabc968266?w=900&q=85',
      'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?w=900&q=80',
      'https://images.unsplash.com/photo-1416331108676-a22ccb276e35?w=900&q=80',
    ],
    floorPlanImages: [],
    locationLat: 17.3558, locationLng: 78.0891,
    brochureUrl: null,
    amenities: ['Private Farm','Open Terrace','Borewell','Parking','Organic Garden'],
    description: 'Weekend retreat farmhouse on 600 sq.yards with a working organic vegetable garden and mango orchard. 40 km from HITEC City in serene Shankarpally village. Solar panels, clean borewell water, and a covered parking shed. Perfect weekend escape or quiet retirement home.',
  },
  {
    title: 'Sunrise Residency',
    locality: 'Miyapur', city: 'Hyderabad',
    price: '₹55 L', priceRaw: 5500000,
    type: 'apartment', status: 'sale', bhk: 2, area: 980, baths: 2,
    constructionStatus: 'Ready to Move',
    badge: null, featured: false,
    rera: 'TSRERA/PRJ/2021/006655',
    img:  'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&q=85',
    images: [
      'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=900&q=85',
      'https://images.unsplash.com/photo-1554995207-c18c203602cb?w=900&q=80',
    ],
    floorPlanImages: [FP[0]],
    locationLat: 17.4965, locationLng: 78.3559,
    brochureUrl: null,
    amenities: ['Parking','Security','Children Play Area','Power Backup'],
    description: 'Affordable 2BHK with direct metro access (Miyapur Yellow Line station, 5-minute walk). Ideal for IT professionals commuting to HITEC City or the Financial District. Well-maintained society with 24/7 security and backup power. Strong rental yield of ~4% p.a.',
  },
];

(async () => {
  try {
    console.log('🔌 Connecting to MongoDB…');
    await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
    console.log('✓ Connected');

    console.log('🗑  Dropping existing properties…');
    await Property.deleteMany({});

    console.log(`🌱 Inserting ${SEED_DATA.length} properties…`);
    const inserted = await Property.insertMany(SEED_DATA);
    console.log(`✅ Seeded ${inserted.length} properties.\n`);

    inserted.forEach((p, i) => {
      const imgs = (p.images||[]).length;
      const fps  = (p.floorPlanImages||[]).length;
      const loc  = p.locationLat ? `${p.locationLat.toFixed(4)},${p.locationLng.toFixed(4)}` : 'no-coords';
      console.log(`  ${String(i+1).padStart(2,'0')}. ${(p.title||'').padEnd(32)} ${(p.price||'').padEnd(10)} imgs:${imgs} fps:${fps} map:${loc}`);
    });

    await mongoose.disconnect();
    console.log('\n✓ Done. Start the server and visit http://localhost:5000');
    process.exit(0);
  } catch (err) {
    console.error('✗ Seed failed:', err.message);
    process.exit(1);
  }
})();