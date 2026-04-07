// routes/auth.js
const express = require('express');
const authRouter = express.Router();
const multiFileUpload = require('../middleware/multer');
const auth = require('../controller/auth');

// Login / Logout
authRouter.get('/logIn', auth.LoginPage);
authRouter.post('/logIn', auth.PostLogin);
authRouter.post('/logout', auth.PostLogout);

// Customer SignUp
authRouter.get('/signup-customer', auth.getCustomerSignUpPage);
authRouter.post('/signup-customer', multiFileUpload, auth.postCustomerSignUp);

// Vendor SignUp 
authRouter.get('/signup-vendor', auth.getVendorSignUpPage);
authRouter.post('/signup-vendor', multiFileUpload, auth.postVendorSignUp);

// Edit user profile
authRouter.get('/edit_details/:id', auth.getEditPage);
authRouter.post('/edit_details', multiFileUpload, auth.postEditPage);

// Delete user
authRouter.get('/delete_user/:id', auth.deleteUserPage);
authRouter.post('/delete_user', auth.deleteUser);



// for admin portal
authRouter.get('/admin', auth.getAdmin);
authRouter.post('/admin', auth.postAdmin);
// Mark payout as paid
authRouter.post('/admin/mark-paid/:orderId', auth.markPayoutAsPaid);


// Forgot password flow
authRouter.get('/forgot-password', auth.getForgotPassword);
authRouter.post('/forgot-password', auth.postForgotPassword);

authRouter.get('/verify-otp', auth.getVerifyOtp);
authRouter.post('/verify-otp', auth.postVerifyOtp);

authRouter.get('/reset-password', auth.getResetPassword);
authRouter.post('/reset-password', auth.postResetPassword);

module.exports = authRouter;