// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const TempBooking = require("../models/TempBooking");
require('dotenv').config(); // load .env

// Create Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Route: Create Order
router.post('/create-order', async (req, res) => {
  try {
    const { amount, bookingData } = req.body;

    const options = {
      amount: amount * 100,
      currency: "INR",
      receipt: `rcpt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);

    // SAVE TEMP BOOKING DATA
    await TempBooking.create({
      razorpay_order_id: order.id,
      data: bookingData,
    });

    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error creating order' });
  }
});

// Route: Verify Payment
router.post('/verify-payment', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Generate signature for verification
    const hmac = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET);
    hmac.update(razorpay_order_id + '|' + razorpay_payment_id);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature === razorpay_signature) {
      // Payment is authentic
      // TODO: Save payment info to DB (Booking model)
      return res.json({ status: 'success', message: 'Payment verified successfully' });
    } else {
      return res.status(400).json({ status: 'failure', message: 'Payment verification failed' });
    }
  } catch (err) {
    console.error('Error verifying payment:', err);
    res.status(500).json({ error: 'Error verifying payment' });
  }
});

module.exports = router;
