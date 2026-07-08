const mongoose = require('mongoose');

const orderSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  phone: { type: String, required: true },
  address: { type: String, required: true },
  items: [{
    id: String,
    title: String,
    price: String,
    img: String,
    quantity: Number
  }],
  total: { type: Number, required: true },
  status: { type: String, default: 'Confirmed' }
}, { timestamps: true });

module.exports = mongoose.model('Order', orderSchema);
