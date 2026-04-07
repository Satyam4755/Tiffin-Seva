const express = require('express');
const router = express.Router();
const SibApiV3Sdk = require('sib-api-v3-sdk');
const User = require('../models/user'); // ✅ Import User model

// ✅ Configure Brevo client
const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const tranEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

router.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.json({ success: false, message: 'Email is required' });
  }

  try {
    // ✅ Step 1: Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.json({
        success: false,
        message: 'Email already registered. Please login instead.',
      });
    }

    // ✅ Step 2: Generate OTP
    const otp = Math.floor(1000 + Math.random() * 9000); // 4-digit OTP

    // ✅ Step 3: Store OTP in session with expiry
    req.session.otp = otp;
    req.session.otpEmail = email;
    req.session.otpExpires = Date.now() + 15 * 60 * 1000; // expires in 15 mins

    // ✅ Step 4: Send OTP Email
    await tranEmailApi.sendTransacEmail({
      sender: { email: process.env.FROM_EMAIL, name: "Tiffin Seva" },
      to: [{ email }],
      subject: "Your Signup OTP",
      textContent: `Your OTP is: ${otp}\n\nThis OTP will expire in 5 minutes.`,
    });

    res.json({ success: true, message: 'OTP sent to email' });

  } catch (err) {
    console.error("❌ OTP sending failed:", err);
    res.json({ success: false, message: 'Failed to send OTP. Please try again.' });
  }
});

module.exports = router;
