// routes/policyRoutes.js
const express = require('express');
const router = express.Router();

// Privacy Policy
router.get('/privacy-policy', (req, res) => {
  res.render('privacy-policy');
});

// Terms & Conditions
router.get('/terms-and-conditions', (req, res) => {
  res.render('terms-and-conditions');
});

// Cancellation & Refund
router.get('/cancellation-refund-policy', (req, res) => {
  res.render('cancellation-refund-policy');
});

// Shipping & Delivery
router.get('/shipping-delivery-policy', (req, res) => {
  res.render('shipping-delivery-policy');
});

// Contact Us
router.get('/contact-us', (req, res) => {
  res.render('contact-us');
});

module.exports = router;