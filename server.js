require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const { put } = require('@vercel/blob');
const bcrypt = require('bcryptjs');
const Product = require('./models/Product');
const Order = require('./models/Order');
const Admin = require('./models/Admin');
const { sendOrderNotification } = require('./services/telegram');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

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
    const mongoUri = process.env.MONGODB_URI;

    if (!mongoUri) {
      console.warn('MONGODB_URI is not set. Skipping database connection.');
      return null;
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

// Routes
app.get('/api/products', async (req, res) => {
  try {
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

// Create product (with optional image upload)
app.post('/api/products', upload.single('image'), async (req, res) => {
  try {
    let img = req.body.img;
    if (req.file) {
      img = await handleImageUpload(req.file);
    }

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

// Update product
app.put('/api/products/:id', upload.single('image'), async (req, res) => {
  try {
    const updateData = { ...req.body };
    
    if (req.file) {
      updateData.img = await handleImageUpload(req.file);
    }

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

// Delete product
app.delete('/api/products/:id', async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: 'Product deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete order
app.delete('/api/orders/:id', async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all orders
app.get('/api/orders', async (req, res) => {
  try {
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
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

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
