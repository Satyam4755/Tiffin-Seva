const mongoose = require('mongoose');

const guestOptionSchema = new mongoose.Schema(
  {
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mealSelected: { type: String, required: true },
    Location: { type: String },
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 6 } // TTL: 6 hours
  },
  { timestamps: true } // ✅ correct place
);

module.exports = mongoose.model('GuestOption', guestOptionSchema, 'guestOptions');
