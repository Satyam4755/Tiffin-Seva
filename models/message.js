const mongoose = require('mongoose');

const messageSchema = mongoose.Schema({
  guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'vender', required: true },
  message: String,
  createdAt30: { type: Date, default: Date.now, expires: 60*60*6 } // TTL of 6 hours
});
// ✅ Add compound unique index to prevent duplicate guest-vendor entries
messageSchema.index({ guest: 1, vendorId: 1 }, { unique: true });

module.exports = mongoose.model('Message', messageSchema, 'messages');