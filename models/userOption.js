const mongoose = require('mongoose');

const guestOptionSchema = mongoose.Schema({
  guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  mealSelected: { type: String, required: true },
  Location: { type: String },
  vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'vender', required: true },
  createdAtU20: { type: Date, default: Date.now, expires: 60*60*6 }  // TTL set to 6 hours
});

module.exports = mongoose.model('GuestOption', guestOptionSchema, 'guestOptions');
