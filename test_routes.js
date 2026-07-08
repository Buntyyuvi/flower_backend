// Quick test to verify routes are registered
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());

// Copy the exact route definitions from server.js
const Order = require('./models/Order');
const Product = require('./models/Product');

app.get('/api/products', async (req, res) => {
  const products = await Product.find().sort({ createdAt: 1 });
  const formatted = products.map(p => { const obj = p.toObject(); obj.id = obj._id.toString(); return obj; });
  res.json(formatted);
});

app.delete('/api/products/:id', async (req, res) => {
  await Product.findByIdAndDelete(req.params.id);
  res.json({ message: 'Product deleted' });
});

app.get('/api/orders', async (req, res) => {
  const orders = await Order.find().sort({ createdAt: -1 });
  const formatted = orders.map(o => { const obj = o.toObject(); obj.id = obj._id.toString(); return obj; });
  res.json(formatted);
});

app.post('/api/orders', async (req, res) => {
  const newOrder = new Order(req.body);
  await newOrder.save();
  const obj = newOrder.toObject();
  obj.id = obj._id.toString();
  res.status(201).json(obj);
});

app.listen(5005, () => {
  console.log('Test server on 5005, routes registered');
});
