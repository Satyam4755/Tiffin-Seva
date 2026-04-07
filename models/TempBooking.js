const mongoose = require("mongoose");

const tempBookingSchema = new mongoose.Schema(
  {
    razorpay_order_id: String,
    data: Object,
  },
  { timestamps: true }
);

module.exports = mongoose.model("TempBooking", tempBookingSchema);