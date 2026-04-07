const mongoose = require('mongoose');

// Define payout structure for each vendor payout
const payoutSchema = new mongoose.Schema({
  id: { type: String }, // e.g., 'firstHalf', 'final', 'refunded'
  dueDate: { type: Date, required: true },
  amount: { type: Number, required: true },
  status: {
    type: String,
    enum: ['pending', 'paid', 'refunded'],
    default: 'pending'
  },
  paidOn: { type: Date, default: null }
});

// Main Order Schema
const OrderSchema = new mongoose.Schema({
  guest: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  vender: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  name: { type: String, required: true },
  phone: { type: Number, required: true },
  address: { type: String, required: true },

  subscription_model: { type: String, required: true }, // Per Day / Per Month
  startingDate: { type: Date, required: true },
  endingDate: { type: Date, required: true },

  // 💥 NEW FIELD: Quantity of tiffins
  quantity: { type: Number, required: true, default: 1 },

  payment: { type: String, required: true },
  totalAmount: { type: Number, required: true },
  time_type: { type: [String], default: [] },

  number_of_months: { type: Number, default: 1 },

  // For auto expiry (Per Day subscriptions)
  expireAt: { type: Date, required: true },

  // Location coordinates
  lat: { type: Number, required: true },
  lng: { type: Number, required: true },

  // Admin / vendor system fields
  vendorShare: { type: Number, default: 0 }, 
  payoutSchedule: { type: [payoutSchema], default: [] },

  // Order status
  status: {
    type: String,
    enum: ['active', 'cancelled', 'expired'],
    default: 'active'
  },

  // Payment status from admin
  paymentStatus: {
    type: String,
    enum: ['paid', 'unpaid'],
    default: 'unpaid'
  },

  // 👇 Calculation Tracking Fields
  daysUsed: { type: Number, default: 0 },
  usedAmount: { type: Number, default: 0 }, // perDayPrice * 2 * daysUsed * quantity
  refundAmount: { type: Number, default: 0 },

  // Auto-delete when vendor has been paid
  toBeDeletedAt: {
    type: Date,
    default: null,
    index: { expires: 0 }
  }
});

// TTL indexes
OrderSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0, name: 'expireAtTTL' });
OrderSchema.index({ toBeDeletedAt: 1 }, { expireAfterSeconds: 0, name: 'autoDeleteTTL' });

module.exports = mongoose.model('Order', OrderSchema, 'orders');
