require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Product = require('./models/Product');
const Admin = require('./models/Admin');

const ALL_IMAGES = [
  '/images/WhatsApp Image 2026-07-08 at 18.47.01.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.47.17.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.47.29.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.47.41.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.47.52.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.48.06.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.48.17.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.48.30.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.48.54.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.49.08.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.49.20.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.49.34.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.49.46.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.50.00.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.50.11.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.50.26.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.50.37.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.50.48.jpeg',
  '/images/WhatsApp Image 2026-07-08 at 18.50.57.jpeg',
];

const generateInitialProducts = () => {
  const products = [];
  
  // Specific data for the first 4 products to match the user's design image precisely
  const specificProducts = [
    {
      img: ALL_IMAGES[3],
      title: 'Hello Kitty Pink Bouquet',
      subtitle: 'Best seller arrangement',
      category: 'Character Favorites',
      price: '₹1,299',
      stock: 24,
      status: 'In Stock'
    },
    {
      img: ALL_IMAGES[4],
      title: 'My Melody Blossom Bouquet',
      subtitle: 'Soft pastel collection',
      category: 'Character Favorites',
      price: '₹1,199',
      stock: 18,
      status: 'In Stock'
    },
    {
      img: ALL_IMAGES[5],
      title: 'Cinnamoroll Blue Bouquet',
      subtitle: 'Seasonal favorite',
      category: 'Character Favorites',
      price: '₹1,299',
      stock: 6,
      status: 'Low Stock'
    },
    {
      img: ALL_IMAGES[6],
      title: 'Kuromi Purple Bouquet',
      subtitle: 'Gift-ready packaging',
      category: 'Character Favorites',
      price: '₹1,199',
      stock: 0,
      status: 'Out of Stock'
    }
  ];

  products.push(...specificProducts);

  // Seasonal Delights (7-10) — shifted to avoid overlap with specific products (3-6)
  for (let i = 7; i < 11; i++) {
    products.push({
      img: ALL_IMAGES[i],
      title: `Seasonal Blossom Bouquet ${i - 6}`,
      subtitle: 'Seasonal favorite',
      category: 'Seasonal Delights',
      price: `₹${(1199 + ((i-7) * 100)).toLocaleString()}`,
      stock: 6,
      status: 'Low Stock'
    });
  }

  // All Time Classics — wrap unused images 0-2 first, then continue from 11-18
  const classicsIndices = [0, 1, 2, 11, 12, 13, 14, 15, 16, 17, 18];
  classicsIndices.forEach((imgIdx, idx) => {
    products.push({
      img: ALL_IMAGES[imgIdx],
      title: `Classic Rose Bouquet ${idx + 1}`,
      subtitle: 'Soft pastel collection',
      category: 'All Time Classics',
      price: `₹${(1199 + (idx * 100)).toLocaleString()}`,
      stock: imgIdx === 0 ? 0 : 18 + imgIdx,
      status: imgIdx === 0 ? 'Out of Stock' : 'In Stock'
    });
  });

  return products;
};

const seedAdmin = async () => {
  const existing = await Admin.findOne({ username: 'payalsanapMohite' });
  if (existing) {
    console.log('Admin user already exists, skipping...');
    return;
  }
  const hashedPassword = await bcrypt.hash('Payalmohite@2222', 10);
  await Admin.create({ username: 'payalsanapMohite', password: hashedPassword });
  console.log('Admin user created.');
};

const seedDB = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB for seeding...');

    // Clear existing products to prevent duplicates
    await Product.deleteMany({});
    console.log('Cleared existing products.');

    const initialData = generateInitialProducts();
    await Product.insertMany(initialData);
    
    console.log(`Successfully seeded ${initialData.length} products.`);

    await seedAdmin();

    process.exit(0);
  } catch (error) {
    console.error('Error seeding data:', error);
    process.exit(1);
  }
};

seedDB();
