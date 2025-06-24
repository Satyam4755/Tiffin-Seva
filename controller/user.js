const { check, validationResult } = require("express-validator");
const venders = require('../models/venders')
const User = require('../models/user');
const UserOption = require('../models/userOption');
const VenderOption = require('../models/venderOption'); 
const Message = require('../models/message');
const Order = require('../models/orders');
// home PAGE
exports.homePage = async (req, res, next) => {
  let opacity = {};
  const locationQuery = req.query.location || '';
  let registervenders = [];
  let user = null;
  let showOptions = false;
  let ifLucknow = false;
  let birthdayMessage = null;

  if (locationQuery.trim().toLowerCase() === 'lucknow') {
    ifLucknow = true;
    registervenders = []; 
  } else if (locationQuery.trim()) {
    registervenders = await venders.find({
      Location: { $regex: locationQuery, $options: 'i' }
    });
  } else {
    registervenders = await venders.find();
  }

  if (req.isLogedIn && req.session.user) {
    user = await User.findById(req.session.user._id);

    // 🎂 Birthday ke liye
    if (user && user.dob) {
      function getISTDateOnly(date) {
        return new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
      }

      const todayIST = getISTDateOnly(new Date());
      const dobIST = getISTDateOnly(new Date(user.dob));

      const isBirthday = todayIST.getDate() === dobIST.getDate() &&
        todayIST.getMonth() === dobIST.getMonth();

      if (isBirthday && !req.session.birthdayWished) {
        birthdayMessage = `🎉 Happy Birthday, ${user.firstName}! 🎂`;
        req.session.birthdayWished = true;
      }

      if (
        (!isBirthday && req.session.birthdayWished) ||
        (dobIST.getDate() !== todayIST.getDate() || dobIST.getMonth() !== todayIST.getMonth())
      ) {
        req.session.birthdayWished = false;
      }
    }

    if (user.userType === 'guest') {
      showOptions = true;
      const favIds = user.favourites.map(fav => fav.toString());
      registervenders.forEach(vender => {
        opacity[vender._id.toString()] = favIds.includes(vender._id.toString()) ? 10 : 0;
      });
    } else {
      registervenders.forEach(vender => {
        opacity[vender._id.toString()] = 0;
      });
    }
  } else {
    registervenders.forEach(vender => {
      opacity[vender._id.toString()] = 0;
    });
  }

  // ⭐ Average Rating logic
  for (const vender of registervenders) {
    if (vender.reviews && vender.reviews.length > 0) {
      const validRatings = vender.reviews.filter(r => typeof r.rating === 'number' && !isNaN(r.rating));
      if (validRatings.length > 0) {
        const total = validRatings.reduce((sum, review) => sum + review.rating, 0);
        vender.averageRating = parseFloat((total / validRatings.length).toFixed(1));
      } else {
        vender.averageRating = 0;
      }
    } else {
      vender.averageRating = 0;
    }
  }

  const uniqueLocations = await venders.distinct("Location");

  res.render('./store/vender', {
    ifLucknow,
    venders: registervenders,
    title: "vender Page",
    opacity,
    currentPage: 'home',
    isLogedIn: req.isLogedIn,
    user: user || null,
    showOptions,
    searchQuery: locationQuery,
    availableLocations: uniqueLocations,
    birthdayMessage
  });
};

// vender DETAILS
exports.venderDetails = async (req, res, next) => {

  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');
  const venderId = req.params.venderId;
 
  const vender = await venders.findById(venderId)
    .populate('vender')
    .populate('reviews.user');

  if (!vender) return res.redirect('/user/vender-list');

  // ✅ Calculate average rating from reviews
  let averageRating = 0;
  const validRatings = vender.reviews.filter(r => typeof r.rating === 'number' && !isNaN(r.rating));
  if (validRatings.length > 0) {
    const total = validRatings.reduce((sum, review) => sum + review.rating, 0);
    averageRating = parseFloat((total / validRatings.length).toFixed(1));
  }

  const numberOfOrders = vender.orders || 0;
  let showOptions = false;
  let opacity = {};

  if (req.isLogedIn && req.session.user) {
    const user = await User.findById(req.session.user._id);

    if (user.userType === 'guest') {
      showOptions = true;
      const isFavourite = user.favourites.map(id => id.toString()).includes(vender._id.toString());
      opacity[vender._id.toString()] = isFavourite ? 10 : 0;
    } else {
      opacity[vender._id.toString()] = 0;
    }
  } else {
    opacity[vender._id.toString()] = 0;
  }

  res.render('./store/vender-details', {
    vender,
    title: "vender Details",
    opacity,
    isLogedIn: req.isLogedIn,
    user: req.session.user || null,
    showOptions,
    numberOfOrders,
    messages: req.flash(),
    reviews: vender.reviews || [],
    averageRating, // ✅ Pass to EJS
  });
};

// FAVOURITE LIST
exports.favouriteList = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  const user = await User.findById(req.session.user._id).populate('favourites');
  const favouriteVendors = user.favourites;

  // Add average rating to each favourite vendor
  for (const vender of favouriteVendors) {
    if (vender.reviews && vender.reviews.length > 0) {
      const validRatings = vender.reviews.filter(r => typeof r.rating === 'number' && !isNaN(r.rating));
      if (validRatings.length > 0) {
        const total = validRatings.reduce((sum, review) => sum + review.rating, 0);
        vender.averageRating = parseFloat((total / validRatings.length).toFixed(1));
      } else {
        vender.averageRating = 0;
      }
    } else {
      vender.averageRating = 0;
    }
  }

  res.render('./store/favourite_list', {
    venders: favouriteVendors,
    title: "favourite list",
    currentPage: 'favourite',
    isLogedIn: req.isLogedIn,
    user: req.session.user,
    messages: req.flash(),
  });
};

// ADD / REMOVE FAVOURITE
exports.postfavouriteList = async (req, res, next) => {
    if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

    const Id = req.body.venderId;
    const user = await User.findById(req.session.user._id);

    if (!user.favourites.includes(Id)) {
        user.favourites.push(Id);
    } else {
        user.favourites.pull(Id); 
    }

    await user.save();
    res.redirect('/user/favourite_list');
};

// UNFAVOURITE FROM FAV PAGE
exports.postUnfavourite = async (req, res, next) => {
    if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

    const venderId = req.params.venderId;
    const user = await User.findById(req.session.user._id);

    user.favourites.pull(venderId);
    await user.save();
    req.flash('success', 'Vendor removed from favourites successfully!');
    res.redirect('/user/favourite_list');
};

// BOOKING PAGE
exports.booking = async (req, res, next) => {
  const venderId = req.params.venderId;

  try {
    const vender = await venders.findById(venderId);
    if (!vender) {
      return res.redirect('/user/vender-list');
    }

    // Add average rating
    if (vender.reviews && vender.reviews.length > 0) {
      const validRatings = vender.reviews.filter(r => typeof r.rating === 'number' && !isNaN(r.rating));
      if (validRatings.length > 0) {
        const total = validRatings.reduce((sum, review) => sum + review.rating, 0);
        vender.averageRating = parseFloat((total / validRatings.length).toFixed(1));
      } else {
        vender.averageRating = 0;
      }
    } else {
      vender.averageRating = 0;
    }

    res.render('./store/booking', {
      vender: vender,
      title: "booking",
      isLogedIn: req.isLogedIn,
      currentPage: '',
      user: req.session.user || null,
    });

  } catch (err) {
    console.error('Error loading booking page:', err);
    res.redirect('/user/vender-list');
  }
};

// POST BOOKING
exports.Postbooking = [
  check('phone')
    .isNumeric()
    .withMessage('Phone number should be numeric')
    .isLength({ min: 10, max: 10 })
    .withMessage('Phone number should be 10 digits long'),

  async (req, res, next) => {
    if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

    const venderId = req.params.venderId;
    const {
      name,
      phone,
      subscription_model,
      startingDate,
      endingDate,
      payment,
      time_type,
      totalAmount,
      selectedMonths,
      address,
    } = req.body;

    try {
      const guestUser = await User.findById(req.session.user._id);
      const Selectedvender = await venders.findById(venderId).populate('vender');
      const venderh = Selectedvender?.vender;
      let numberOfOrders = Selectedvender?.orders || 0;

      if (!venderh) {
        req.flash('error', 'Vendor not found');
        return res.redirect('back');
      }

      // ✅ Address verification logic
      const vendorLocation = Selectedvender.Location;
      if (!address.toLowerCase().includes(vendorLocation.toLowerCase())) {
        req.flash(
          'Sorry',
          `This vendor is only available for addresses under: "${vendorLocation}"`
        );
        return res.redirect('back');
      }

      // ✅ Calculate expireAt properly
      if (subscription_model === 'Per Month') {
        const parsedStart = new Date(); // Default to today
        const totalDays = Number(selectedMonths) * 30;
        const expiryDate = new Date(parsedStart);
        expiryDate.setDate(parsedStart.getDate() + totalDays);
        expireAt = expiryDate;
      } else if (subscription_model === 'Per Day') {
        const parsedEnd = new Date(endingDate);
        if (!isNaN(parsedEnd)) {
          parsedEnd.setDate(parsedEnd.getDate() + 1); // buffer for 1 day
          expireAt = parsedEnd;
        } else {
          throw new Error('Invalid endingDate for Per Day');
        }
      }

      // ✅ Create new order
      const newOrder = new Order({
        guest: guestUser._id,
        vender: Selectedvender._id,
        name,
        phone,
        address,
        subscription_model,
        startingDate: subscription_model === 'Per Month' ? new Date() : subscription_model === 'Per Day' ? new Date(startingDate) : undefined,
        endingDate: subscription_model === 'Per Day' ? new Date(endingDate) : undefined,
        payment,
        totalAmount,
        time_type: subscription_model === 'Per Day' ? time_type : undefined,
        number_of_months: subscription_model === 'Per Month' ? selectedMonths : undefined,
        expireAt
      });

      await newOrder.save();
      numberOfOrders += 1;
      await venders.findByIdAndUpdate(venderId, { orders: numberOfOrders });

      // ✅ Add to user's booked vendors if not already added
      if (!guestUser.booked.includes(venderId)) {
        guestUser.booked.push(venderId);
        await guestUser.save();
        console.log(`✅ Vendor ${venderId} added to booked list of user ${guestUser._id}`);
      }

      res.redirect('/user/submit_booking');
    } catch (err) {
      console.error('❌ Booking Error:', err);
      req.flash('error', 'Something went wrong during booking');
      res.redirect('back');
    }
  }
];

// SUBMIT BOOKING PAGE
exports.submitBooking = (req, res, next) => {
    if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

    res.render('./store/submitBooking', {
        title: "submit booking",
        isLogedIn: req.isLogedIn,
        user: req.session.user
    });
};

// booked LIST

exports.booked = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const userId = req.session.user._id;
    const user = await User.findById(userId).populate('booked');

    const validBookedVendors = [];

    for (const vendor of user.booked) {
      const existingOrder = await Order.findOne({
        guest: userId,
        vender: vendor._id
      });

      if (existingOrder) {
        // Add average rating
        if (vendor.reviews && vendor.reviews.length > 0) {
          const validRatings = vendor.reviews.filter(r => typeof r.rating === 'number' && !isNaN(r.rating));
          if (validRatings.length > 0) {
            const total = validRatings.reduce((sum, review) => sum + review.rating, 0);
            vendor.averageRating = parseFloat((total / validRatings.length).toFixed(1));
          } else {
            vendor.averageRating = 0;
          }
        } else {
          vendor.averageRating = 0;
        }

        validBookedVendors.push(vendor);
      } else {
        await User.findByIdAndUpdate(userId, {
          $pull: { booked: vendor._id }
        });
      }
    }

    res.render('./store/booked', {
      venders: validBookedVendors,
      title: "Booked Vendor List",
      currentPage: 'reserve',
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      messages: req.flash(),
    });

  } catch (err) {
    console.error('Error loading booked vendors:', err);
    req.flash('error', 'Could not load your booked vendors');
    res.redirect('back');
  }
};

// POST CANCEL BOOKING
exports.postCancelBooking = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  const venderId = req.params.venderId;

  try {
    const userId = req.session.user._id;

    // ✅ Remove vendor from user's booked list
    await User.findByIdAndUpdate(userId, {
      $pull: { booked: venderId }
    });

    // ✅ Fetch the vendor document
    const venderh = await venders.findById(venderId);
    if (!venderh) {
      req.flash('error', 'Vendor not found');
      return res.redirect('/user/booked');
    }

    // ✅ Delete the related order from Order collection
    await Order.deleteOne({
      guest: userId,
      vender: venderId
    });

    // ✅ Clean up related documents
    await UserOption.deleteMany({ guest: userId, vendor: venderId });
    await VenderOption.deleteMany({ guest: userId, vendorId: venderId });
    await Message.deleteMany({ guest: userId, vendorId: venderId });

    req.flash('success', 'Booking cancelled!');
    res.redirect('/user/booked');

  } catch (err) {
    console.error('Cancel booking error:', err);
    req.flash('error', 'Something went wrong during cancellation');
    res.redirect('/user/booked');
  }
};



exports.getOption = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const user = await User.findById(req.session.user._id);
    const bookedVendorIds = user.booked;

    if (!bookedVendorIds || bookedVendorIds.length === 0) {
      return res.render('./store/options', {
        title: "Customer Choice",
        isLogedIn: req.isLogedIn,
        user: req.session.user,
        vendorOptionsList: [],
        currentPage: 'options',
      });
    }

    const vendorOptionsList = [];

    for (const vendorId of bookedVendorIds) {
      const vendor = await venders.findById(vendorId);
      if (!vendor) continue;

      const hostVender = await User.findById(vendor.vender);
      const vendorOption = await VenderOption.findOne({
        guest: user._id,
        vendorId: vendor._id
      });

      const userOption = await UserOption.findOne({
        guest: user._id,
        vendor: vendor._id
      });
      vendorOptionsList.push({
        vendorName: hostVender.firstName || "Vendor",
        vendorId: vendorId,
        vendor: vendor,
        option: vendorOption,
        isSent: !!userOption
      });
    }

    res.render('./store/options', {
      title: "Customer Choice",
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      vendorOptionsList,
      currentPage: 'options'
    });

  } catch (err) {
    console.error('Error fetching options:', err);
    req.flash('error', 'Could not load data');
    res.redirect(req.get('Referrer') || '/');
  }
};

exports.postOption = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const user = await User.findById(req.session.user._id);
    const { mealType, vendorId } = req.body;

    // ✅ Get selected vendor
    const vendor = await venders.findById(vendorId).populate('vender');
    if (!vendor) {
      req.flash('error', 'Invalid vendor.');
      return res.redirect('/user/options');
    }

    // ✅ Get the host (vender user)
    const hostVender = vendor.vender;
    if (!hostVender) {
      req.flash('error', 'Vendor not found.');
      return res.redirect('/user/options');
    }

    // ✅ Fetch address from Order collection (based on guest & vender)
    const order = await Order.findOne({
      guest: user._id,
      vender: vendorId,
    });

    const userAddress = order?.address || '';

    // ✅ Upsert into UserOption collection
    await UserOption.findOneAndUpdate(
      { guest: user._id, vendor: vendor._id },
      {
        guest: user._id,
        vendor: vendor._id,
        mealSelected: mealType,
        Location: userAddress,
      },
      { upsert: true, new: true }
    );

    req.flash('success', 'Meal option submitted successfully!');
    res.redirect('/user/options');

  } catch (err) {
    console.error('Error submitting option:', err);
    req.flash('error', 'Could not submit your choice');
    res.redirect(req.get('Referrer') || '/');
  }
}; 

exports.getMessage = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const user = await User.findById(req.session.user._id);
    const bookedVendorIds = user.booked;
    if (!bookedVendorIds || bookedVendorIds.length === 0) {
      return res.render('./store/message', {
        title: "Messages",
        isLogedIn: req.isLogedIn,
        user: req.session.user,
        messages: [],
        currentPage: 'messages'
      });
    }
    const messages = [];
    for (const vendorId of bookedVendorIds) {
      const vendor = await venders.findById(vendorId);
      if (!vendor) continue;

      const hostVender = await User.findById(vendor.vender);
      if (!hostVender) continue;

      const message = await Message.findOne({
        guest: user._id,
        vendorId: vendor._id
      });

      if (message) {
        messages.push({
          message: message.message,
          vendorId: vendor, // ✅ full vendor listing object (not just the ID)
          hostVendorName: hostVender.firstName || "Vendor"
        });
      }
    }
    res.render('./store/message', {
      title: "Messages",
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      messages: messages,
      currentPage: 'message'
    });
  }
  catch (err) {
    console.error('Error fetching messages:', err);
    req.flash('error', 'Could not load messages');
    res.redirect(req.get('Referrer') || '/');
  }
};

exports.postvenderDetails = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const user = await User.findById(req.session.user._id);
    const { venderId } = req.params;
    const { Review, Rating } = req.body;

    const vendor = await venders.findById(venderId);
    if (!vendor) {
      req.flash('error', 'Invalid vendor.');
      return res.redirect('/user/vender-list');
    }
    vendor.reviews.push({
      user: user._id,
      rating: parseInt(Rating, 10),
      comment: Review
    });
    await vendor.save();
    req.flash('success', 'Review submitted successfully!');
    res.redirect('/user/vender-list/' + venderId); // ✅ Remove the colon (:) before the ID
  } catch (err) {
    console.error('Error fetching vendor details:', err);
    req.flash('error', 'Could not load vendor details');
    res.redirect(req.get('Referrer') || '/');
  }
};


exports.postDeleteReview = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  const { venderId } = req.params;
  const { reviewId } = req.body;

  try {
    const vendor = await venders.findById(venderId);
    if (!vendor) {
      req.flash('error', 'Vendor not found.');
      return res.redirect('/user/vender-list');
    }

    const review = vendor.reviews.find(
      (rev) => rev._id.toString() === reviewId && rev.user.toString() === req.session.user._id.toString()
    );

    if (!review) {
      req.flash('error', 'Unauthorized or review not found.');
      return res.redirect('/user/vender-list/' + venderId);
    }

    // Filter out the review from the reviews array
    vendor.reviews = vendor.reviews.filter(
      (rev) => rev._id.toString() !== reviewId
    );

    await vendor.save();

    req.flash('success', 'Your review has been deleted successfully.');
    res.redirect('/user/vender-list/' + venderId);
  } catch (err) {
    console.error('Error deleting review:', err);
    req.flash('error', 'An error occurred while deleting the review.');
    res.redirect('/user/vender-list/' + venderId);
  }
};


// ✅ Controller: postHomePage
exports.postHomePage = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  const userId = req.session.user._id;
  const themeValue = req.body.theme === 'true'; // convert to boolean

  try {
    await User.findByIdAndUpdate(userId, { theme: themeValue });
    req.session.user.theme = themeValue; // update session also
    res.redirect('/');
  } catch (err) {
    console.error('Theme update failed:', err);
    res.status(500).send('Internal Server Error');
  }
};
