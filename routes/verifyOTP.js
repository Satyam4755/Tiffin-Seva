const express = require('express');
const router = express.Router();

router.post('/verify-otp', (req, res) => {
  const { otp } = req.body;

  if (!req.session.otp || Date.now() > req.session.otpExpires) {
    return res.json({ success: false, message: 'OTP expired' });
  }

  if (parseInt(otp) === req.session.otp) {
    req.session.otp = null; // clear OTP
    return res.json({ success: true, message: 'OTP verified' });
  }

  res.json({ success: false, message: 'Invalid OTP' });
});

module.exports = router;