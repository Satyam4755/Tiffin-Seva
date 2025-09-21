// routes/paymentRoutes.js
const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config(); // load .env

// Create Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Route: Create Order
router.post('/create-order', async (req, res) => {
  try {
    const { amount, currency, receipt } = req.body; 
    if (!amount) return res.status(400).json({ error: 'Amount is required' });

    const options = {
      amount: amount * 100, // convert to paise
      currency: currency || 'INR',
      receipt: receipt || `rcpt_${Date.now()}`
    };

    const order = await razorpay.orders.create(options);
    res.json(order); // send order object back to frontend
  } catch (err) {
    console.error('Error creating order:', err);
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