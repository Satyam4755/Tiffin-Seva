const mongoose = require('mongoose');

const messageSchema = mongoose.Schema({
  guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // ref to User
  message: { type: String, required: true },
  mealType: { type: String },          // lunch/dinner
  mealDate: { type: Date, required: true }, // the date of the meal
  subscription_model: { type: String }, // optional: 'Per Day' or 'Per Month'
  createdAt: { type: Date, default: Date.now }, // timestamp of creation
  expiresAt: { type: Date }            // optional TTL field
});

// ✅ Compound unique index to avoid duplicate messages for same guest/vendor/date/meal
messageSchema.index({ guest: 1, vendorId: 1, mealDate: 1, mealType: 1 }, { unique: true });

// Optional TTL index if you want messages to auto-delete after expireAt
messageSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('Message', messageSchema, 'messages');
