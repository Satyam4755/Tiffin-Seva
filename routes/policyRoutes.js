// routes/policyRoutes.js
const express = require('express');
const router = express.Router();

// Privacy Policy
router.get('/privacy-policy', (req, res) => {
  res.render('privacy');
});

// Terms & Conditions
router.get('/terms-and-conditions', (req, res) => {
  res.render('terms');
});

// Cancellation & Refund
router.get('/cancellation-refund-policy', (req, res) => {
  res.render('refund');
});

// Shipping & Delivery
router.get('/shipping-delivery-policy', (req, res) => {
  res.render('shipping');
});

// Contact Us
router.get('/contact-us', (req, res) => {
  res.render('contact');
});

module.exports = router;
