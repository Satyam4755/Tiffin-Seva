const express = require('express');
const authRouter = express.Router();
const multiFileUpload = require('../middleware/multer');
const auth = require('../controller/auth');

authRouter.get('/logIn', auth.LoginPage);
authRouter.post('/logIn', auth.PostLogin);
authRouter.post('/logout', auth.PostLogout);
authRouter.get('/signUP', auth.getSignUpPage);
authRouter.post('/signUP', multiFileUpload, auth.postSignUpPage);

// 👇 NEW ROUTES for editing user profile
authRouter.get('/edit_details/:id', auth.getEditPage);
authRouter.post('/edit_details', multiFileUpload, auth.postEditPage);

// routes for deleting user
authRouter.get('/delete_user/:id', auth.deleteUserPage);
authRouter.post('/delete_user', auth.deleteUser);

module.exports = authRouter;