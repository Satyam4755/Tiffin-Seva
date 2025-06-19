const express = require('express');
const userRouter = express.Router();
const {
  homePage,
  venderDetails,
  favouriteList,
  booking,
  booked,
  postfavouriteList,
  postUnfavourite,
  Postbooking,
  submitBooking,
  postCancelBooking,
  getOption,
  postOption,
  getMessage,
  postvenderDetails,
  postDeleteReview
} = require('../controller/user');

// GET routes
userRouter.get('/', homePage);
userRouter.get('/user/vender-list/:venderId', venderDetails);
userRouter.get('/user/favourite_list', favouriteList);
userRouter.get('/user/booking/:venderId', booking);
userRouter.get('/user/booked', booked);
userRouter.get('/user/submit_booking', submitBooking);
userRouter.get('/user/options',getOption)
userRouter.get('/user/message', getMessage); // ✅ added

// POST routes
userRouter.post('/user/favourite_list', postfavouriteList);
userRouter.post('/user/unfavourite/:venderId', postUnfavourite);
userRouter.post('/user/submit_booking/:venderId', Postbooking);
userRouter.post('/user/cancel_booking/:venderId', postCancelBooking); // ✅ added
userRouter.post('/user/options',postOption)
userRouter.post('/user/vender-list/:venderId', postvenderDetails); 
userRouter.post('/user/delete-review/:venderId', postDeleteReview);

module.exports = userRouter;