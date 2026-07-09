require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { put } = require('@vercel/blob');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');
const Product = require('./models/Product');
const Order = require('./models/Order');
const Admin = require('./models/Admin');
const { sendOrderNotification } = require('./services/telegram');

console.log('=== ENV CHECK ===');
console.log('VERCEL:', process.env.VERCEL);
console.log('MONGODB_URI exists:', !!process.env.MONGODB_URI);
console.log('MONGODB_URI prefix:', process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 20) + '...' : 'NOT SET');
console.log('JWT_SECRET exists:', !!process.env.JWT_SECRET);
console.log('FRONTEND_ORIGIN:', process.env.FRONTEND_ORIGIN);
console.log('PORT:', process.env.PORT);
console.log('=================');

const app = express();
app.use(cors({
  origin: process.env.FRONTEND_ORIGIN || true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

const uploadDir = path.join(__dirname, 'uploads');
let upload;

if (!process.env.VERCEL) {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, file, cb) => {
        const safeName = file.originalname.replace(/\s+/g, '-');
        cb(null, `${Date.now()}-${safeName}`);
      }
    })
  });

  app.use('/uploads', express.static(uploadDir));
} else {
  upload = multer({ storage: multer.memoryStorage() });
}

// Connect to MongoDB in a Vercel-friendly way
let cachedMongo = global.mongoose;

if (!cachedMongo) {
  cachedMongo = global.mongoose = { conn: null, promise: null };
}

async function connectToDatabase() {
  if (cachedMongo.conn) {
    return cachedMongo.conn;
  }

  if (!cachedMongo.promise) {
    let mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      console.warn('MONGODB_URI is not set. Skipping database connection.');
      return null;
    }

    // Support base64-encoded URI to avoid Vercel env var issues with special characters
    if (!mongoUri.startsWith('mongodb')) {
      try {
        const decoded = Buffer.from(mongoUri, 'base64').toString();
        if (decoded.startsWith('mongodb')) mongoUri = decoded;
      } catch {}
    }

    cachedMongo.promise = mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      maxPoolSize: 10
    }).then((mongooseInstance) => mongooseInstance);
  }

  cachedMongo.conn = await cachedMongo.promise;
  return cachedMongo.conn;
}

connectToDatabase()
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error (server continuing):', err));

mongoose.connection.on('disconnected', () => console.log('MongoDB disconnected'));
mongoose.connection.on('error', (err) => console.error('MongoDB error (server continuing):', err));

async function handleImageUpload(file) {
  if (!file) return null;

  if (process.env.VERCEL) {
    const blobName = `products/${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`;
    const result = await put(file.buffer, {
      pathname: blobName,
      access: 'public',
      contentType: file.mimetype,
      allowOverwrite: true
    });
    return result.url;
  }

  return `/uploads/${path.basename(file.path)}`;
}

async function handleBase64Image(dataUrl) {
  if (!dataUrl || !dataUrl.startsWith('data:image/')) return dataUrl;

  const matches = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
  if (!matches) return dataUrl;

  const contentType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');

  if (process.env.VERCEL) {
    const ext = contentType.split('/')[1];
    const blobName = `products/${Date.now()}.${ext}`;
    const result = await put(blobName, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: true
    });
    return result.url;
  }

  const ext = contentType.split('/')[1];
  const filename = `${Date.now()}.${ext}`;
  const filepath = path.join(uploadDir, filename);
  fs.writeFileSync(filepath, buffer);
  return `/uploads/${filename}`;
}

// Routes
app.get('/api/products', async (req, res) => {
  try {
    await connectToDatabase();
    const products = await Product.find().sort({ createdAt: 1 });
    // Convert _id to id to match frontend expectation
    const formatted = products.map(p => {
      const obj = p.toObject();
      obj.id = obj._id.toString();
      return obj;
    });
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create product (with optional image upload) - admin only
app.post('/api/products', verifyAdmin, async (req, res) => {
  try {
    await connectToDatabase();
    const img = await handleBase64Image(req.body.img);

    const newProduct = new Product({
      ...req.body,
      img
    });
    
    await newProduct.save();
    const obj = newProduct.toObject();
    obj.id = obj._id.toString();
    res.status(201).json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update product - admin only
app.put('/api/products/:id', verifyAdmin, async (req, res) => {
  try {
    await connectToDatabase();
    const updateData = { ...req.body };
    updateData.img = await handleBase64Image(updateData.img);

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id, 
      updateData, 
      { new: true }
    );
    if (!updatedProduct) return res.status(404).json({ error: 'Not found' });
    
    const obj = updatedProduct.toObject();
    obj.id = obj._id.toString();
    res.json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete product - admin only
app.delete('/api/products/:id', verifyAdmin, async (req, res) => {
  try {
    await connectToDatabase();
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete order - admin only
app.delete('/api/orders/:id', verifyAdmin, async (req, res) => {
  try {
    await connectToDatabase();
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all orders - admin only
app.get('/api/orders', verifyAdmin, async (req, res) => {
  try {
    await connectToDatabase();
    const orders = await Order.find().sort({ createdAt: -1 });
    const formatted = orders.map(o => {
      const obj = o.toObject();
      obj.id = obj._id.toString();
      return obj;
    });
    res.json(formatted);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create order
app.post('/api/orders', async (req, res) => {
  try {
    await connectToDatabase();
    const newOrder = new Order(req.body);
    await newOrder.save();
    sendOrderNotification(req.body);
    const obj = newOrder.toObject();
    obj.id = obj._id.toString();
    res.status(201).json(obj);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    await connectToDatabase();
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    const secret = process.env.JWT_SECRET || 'please_change_this_secret';
    const token = jwt.sign({ id: admin._id, role: 'admin' }, secret, { expiresIn: '24h' });

    // Set token as an HTTP-only cookie that expires in 24 hours
    res.cookie('token', token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000,
      sameSite: process.env.VERCEL ? 'none' : 'lax',
      secure: process.env.VERCEL ? true : false,
    });

    // Also return the token in JSON for frontend auth flows that send Authorization headers
    res.json({ success: true, token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Admin logout
app.post('/api/admin/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// Auth middleware for admin-protected routes
function verifyAdmin(req, res, next) {
  try {
    const secret = process.env.JWT_SECRET || 'please_change_this_secret';

    let token = null;
    if (req.cookies && req.cookies.token) token = req.cookies.token;
    if (!token && req.headers && req.headers.authorization) {
      const parts = req.headers.authorization.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') token = parts[1];
    }

    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const payload = jwt.verify(token, secret);
    // Optional: attach admin id to req for downstream handlers
    req.adminId = payload.id;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
}

// Global error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

// Prevent crashes from unhandled errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server will continue):', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (server will continue):', reason);
});

const PORT = process.env.PORT || 5000;

if (process.env.VERCEL) {
  module.exports = app;
} else {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}
