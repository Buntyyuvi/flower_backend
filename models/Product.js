const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  title: { type: String, required: true },
  subtitle: { type: String, default: 'Beautiful arrangement' },
  category: { type: String, required: true },
  price: { type: String, required: true },
  stock: { type: Number, required: true, default: 0 },
  status: { type: String, required: true, default: 'In Stock' },
  img: { type: String, required: true }
}, { timestamps: true });

module.exports = mongoose.model('Product', productSchema);
