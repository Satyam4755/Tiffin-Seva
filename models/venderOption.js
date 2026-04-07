const mongoose = require('mongoose');

const venderOptionSchema = new mongoose.Schema(
  {
    guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // 🔹 ref should be 'User', not 'vender'
    regular: { type: String },
    optional: { type: String },
    createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 6 } // TTL: 6 hours
  },
  { timestamps: true } // ✅ correctly placed
);

// ✅ Prevent duplicate guest-vendor pair
venderOptionSchema.index({ guest: 1, vendorId: 1 }, { unique: true });

module.exports = mongoose.model('VenderOption', venderOptionSchema, 'venderOptions');
