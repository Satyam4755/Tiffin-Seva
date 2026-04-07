const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema({
  sessionId: { type: String, required: true, unique: true },
  loginTime: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true }
});

// Automatically remove expired sessions
adminSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Admin", adminSchema);