const { check, validationResult } = require("express-validator");
const Meals = require('../models/venders');
const User = require('../models/user');
const UserOption = require('../models/userOption');
const VenderOption = require('../models/venderOption'); 
const Message = require('../models/message');
const Order = require('../models/orders');

// Utility: Haversine formula to calculate distance in km
function getDistanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
} 

// ⭐ HOME PAGE
exports.homePage = async (req, res, next) => {
  let registervenders = [];
  let user = null;
  let showOptions = false;
  let birthdayMessage = null;
  let opacity = {};

  try {
    // 1️⃣ Get all vendors only
    registervenders = await User.find({ userType: 'vender' });

    // 2️⃣ Get all vendor IDs who have added meals
    const vendorIdsWithMeals = await Meals.distinct('vendor');
    const vendorsWithMealsSet = new Set(vendorIdsWithMeals.map(id => id.toString()));

    // 3️⃣ If logged in, filter vendors within radius
    if (req.isLogedIn && req.session.user) {
      user = await User.findById(req.session.user._id);

      // 🎂 Birthday logic
      if (user && user.dob) {
        function getISTDateOnly(date) {
          return new Date(date.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        }
        const todayIST = getISTDateOnly(new Date());
        const dobIST = getISTDateOnly(new Date(user.dob));
        const isBirthday =
          todayIST.getDate() === dobIST.getDate() &&
          todayIST.getMonth() === dobIST.getMonth();

        if (isBirthday && !req.session.birthdayWished) {
          birthdayMessage = `🎉 Happy Birthday, ${user.firstName}! 🎂`;
          req.session.birthdayWished = true;
        }
        if (!isBirthday && req.session.birthdayWished) {
          req.session.birthdayWished = false;
        }
      }

      // ⭐ FILTER: Vendors within vendor's service area
      if (user.lat && user.lng) {
        const uLat = parseFloat(user.lat);
        const uLng = parseFloat(user.lng);

        registervenders = registervenders.filter((vender) => {
          if (!vender.lat || !vender.lng || !vender.serviceRadius) return false;

          const vLat = parseFloat(vender.lat);
          const vLng = parseFloat(vender.lng);
          const vRadius = parseFloat(vender.serviceRadius);

          const dist = getDistanceKm(uLat, uLng, vLat, vLng);
          return dist <= vRadius;
        });
      }

      // ⭐ Mark favourites for guests and attach hasMenu + opacity
      if (user.userType === "guest") {
        showOptions = true;
        const favIds = (user.favourites || []).map((fav) => fav.toString());

        registervenders = registervenders.map((vender) => {
          const vId = vender._id.toString();
          const isFav = favIds.includes(vId);
          const hasMenu = vendorsWithMealsSet.has(vId);

          // opacity map used in EJS
          opacity[vId] = isFav ? 10 : 0;

          return {
            ...vender.toObject(),
            vendorClass: isFav ? "fav-vendor" : "",
            hasMenu,
          };
        });
      } else {
        // logged in but not a guest (e.g., vendor)
        registervenders = registervenders.map((vender) => {
          const vId = vender._id.toString();
          const hasMenu = vendorsWithMealsSet.has(vId);
          opacity[vId] = 0; // no favs for non-guest
          return {
            ...vender.toObject(),
            vendorClass: "",
            hasMenu,
          };
        });
      }
    } else {
      // not logged in — still attach hasMenu, keep opacity 0
      registervenders = registervenders.map((vender) => {
        const vId = vender._id.toString();
        const hasMenu = vendorsWithMealsSet.has(vId);
        opacity[vId] = 0;
        return {
          ...vender.toObject(),
          vendorClass: "",
          hasMenu,
        };
      });
    }

    // 4️⃣ Render page
    res.render("./store/vender", {
      venders: registervenders,
      title: "Vendor Page",
      currentPage: "home",
      isLogedIn: req.isLogedIn,
      user: user || null,
      showOptions,
      birthdayMessage,
      opacity, // ← back as requested
    });
  } catch (err) {
    console.error("❌ Home page error:", err);
    res.status(500).send("Server error");
  }
};
// ⭐ VENDOR DETAILS
exports.venderDetails = async (req, res, next) => {
  const venderId = req.params.venderId;

  try {
    // 👉 Fetch vendor with populated reviews
    const vender = await User.findById(venderId).populate('reviews.user');
    if (!vender) return res.redirect('/');
 
    // ✅ Calculate average rating
    let averageRating = 0;
    const validRatings = (vender.reviews || []).filter(
      r => typeof r.rating === 'number' && !isNaN(r.rating)
    );
    if (validRatings.length > 0) {
      const total = validRatings.reduce((sum, review) => sum + review.rating, 0);
      averageRating = parseFloat((total / validRatings.length).toFixed(1));
    }

    // ✅ Get total orders from vendor's User.orders field
    const numberOfOrders = vender.orders || 0;

    // ✅ Fetch related guest users (optional, still using Order collection)
    const guestOrders = await Order.find({ vender: venderId }).populate('guest');
    const guestUsers = guestOrders.map(order => order.guest);

    // for checking customer
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

    // ✅ Fetch vendor's menu (from Meals model)
    const mealsDoc = await Meals.findOne({ vendor: venderId });
    const menuByDay = mealsDoc ? mealsDoc.meals : {};

    // ✅ Render view with all required data
    res.render('./store/vender-details', {
      vender,
      title: "Vendor Details",
      isLogedIn: req.isLogedIn,
      user: req.session.user || null,
      averageRating,
      showOptions,
      opacity,
      numberOfOrders,    // ✅ Now from User.orders
      guestUsers,
      reviews: vender.reviews || [],
      menuByDay,
      messages: req.flash()
    });

  } catch (err) {
    console.error("❌ Vendor details error:", err);
    req.flash('error', 'Something went wrong while fetching vendor details.');
    res.redirect('/');
  }
};
// ⭐ FAVOURITE LIST
exports.favouriteList = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    // Fetch logged-in user with populated favourites
    const user = await User.findById(req.session.user._id).populate('favourites');
    const favouriteVendors = user.favourites || [];

    // Add average rating to each favourite vendor
    favouriteVendors.forEach(vender => {
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

      // Ensure all required fields exist for template
      vender.bannerImage = vender.bannerImage || '/default-banner.jpg';
      vender.serviceName = vender.serviceName || 'Service Name';
      vender.pricePerDay = vender.pricePerDay || 0;
      vender.pricePerMonth = vender.pricePerMonth || 0;
      vender.location = vender.location || 'Location not specified';
    });

    // Render favourite list page
    res.render('./store/favourite_list', {
      venders: favouriteVendors,
      title: "Favourite List",
      currentPage: 'favourite',
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      messages: req.flash(),
    });
  } catch (err) {
    console.error("❌ Favourite list error:", err);
    req.flash('error', 'Something went wrong while fetching your favourite list.');
    res.redirect('/');
  }
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
    const vender = await User.findById(venderId); // ✅ switched to User model
    if (!vender) {
      return res.redirect('/user/vender-list');
    }

    // ✅ Calculate average rating
    let averageRating = 0;
    if (vender.reviews && vender.reviews.length > 0) {
      const validRatings = vender.reviews.filter(r => typeof r.rating === 'number' && !isNaN(r.rating));
      if (validRatings.length > 0) {
        const total = validRatings.reduce((sum, review) => sum + review.rating, 0);
        averageRating = parseFloat((total / validRatings.length).toFixed(1));
      }
    }
    vender.averageRating = averageRating;

    res.render('./store/booking', {
      vender,
      title: "Booking",
      isLogedIn: req.isLogedIn,
      user: req.session.user || null,
      currentPage: 'reserve',
    });

  } catch (err) {
    console.error('❌ Error loading booking page:', err);
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
      const Selectedvender = await User.findById(venderId);

      if (!Selectedvender || Selectedvender.userType !== 'vender') {
        req.flash('error', 'Vendor not found');
        return res.redirect('back');
      }

      // ✅ Address verification
      const vendorLocation = Selectedvender.location || '';
      const locationKeywords = vendorLocation
        .toLowerCase()
        .split(/[^a-zA-Z0-9]+/)
        .map(loc => loc.trim())
        .filter(loc => loc.length > 0);

      const userAddress = address.toLowerCase();
      const isMatch = locationKeywords.some(loc => userAddress.includes(loc));

      if (!isMatch) {
        req.flash(
          'error',
          `This vendor is only available for addresses under: "${vendorLocation}"`
        );
        return res.redirect('back');
      }

      // ✅ Calculate totalAmount
      let calculatedTotal = 0;
      if (subscription_model === 'Per Day') {
        const start = new Date(startingDate);
        const end = new Date(endingDate);
        if (isNaN(start) || isNaN(end) || end < start) {
          req.flash('error', 'Invalid date selection');
          return res.redirect('back');
        }

        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
        const mealsCount = Array.isArray(time_type) ? time_type.length : (time_type ? 1 : 0);
        calculatedTotal = days * Selectedvender.pricePerDay * mealsCount;
      } else if (subscription_model === 'Per Month') {
        calculatedTotal = Number(selectedMonths) * Selectedvender.pricePerMonth;
      }

      // ✅ Calculate expireAt
      let expireAt;
      if (subscription_model === 'Per Month') {
        const start = new Date();
        expireAt = new Date(start.setDate(start.getDate() + Number(selectedMonths) * 30));
      } else if (subscription_model === 'Per Day') {
        expireAt = new Date(new Date(endingDate).setDate(new Date(endingDate).getDate() + 1));
      }

      // ✅ Create new order
      const newOrder = new Order({
        guest: guestUser._id,
        vender: Selectedvender._id,
        name,
        phone,
        address,
        subscription_model,
        startingDate: subscription_model === 'Per Month' ? new Date() : new Date(startingDate),
        endingDate: subscription_model === 'Per Day' ? new Date(endingDate) : undefined,
        payment,
        totalAmount: calculatedTotal,
        time_type: subscription_model === 'Per Day' ? time_type : undefined,
        number_of_months: subscription_model === 'Per Month' ? selectedMonths : undefined,
        expireAt
      });

      await newOrder.save();

      // ✅ Increment vendor orders
      Selectedvender.orders = (Selectedvender.orders || 0) + 1;
      await Selectedvender.save();

      // ✅ Add to user's booked list if not already included
      if (!guestUser.booked.some(id => id.toString() === venderId)) {
        guestUser.booked.push(venderId);
        await guestUser.save();
      }

      // ✅ Do NOT pre-create messages anymore
      // Messages will be generated dynamically in getMessage

      res.redirect('/user/submit_booking');
    } catch (err) {
      console.error('❌ Booking Error:', err);
      req.flash('error', 'Something went wrong during booking');
      res.redirect('back');
    }
  }
];

// ✅ POST CANCEL BOOKING
exports.postCancelBooking = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  const venderId = req.params.venderId;
  const userId = req.session.user._id;

  try {
    // Remove vendor from user's booked list
    await User.findByIdAndUpdate(userId, { $pull: { booked: venderId } });

    // Fetch vendor from User model
    const venderh = await User.findById(venderId);
    if (!venderh || venderh.userType !== 'vender') {
      req.flash('error', 'Vendor not found');
      return res.redirect('/user/booked');
    }

    // Delete related order
    await Order.deleteOne({ guest: userId, vender: venderId });

    // Clean up related documents
    await UserOption.deleteMany({ guest: userId, vendor: venderId });
    await VenderOption.deleteMany({ guest: userId, vendorId: venderId });
    // No need to delete Message since it's dynamic now

    req.flash('success', 'Booking cancelled!');
    res.redirect('/user/booked');

  } catch (err) {
    console.error('Cancel booking error:', err);
    req.flash('error', 'Something went wrong during cancellation');
    res.redirect('/user/booked');
  }
};

// SUBMIT BOOKING PAGE
exports.submitBooking = (req, res, next) => {
    if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

    res.render('./store/submitBooking', {
        title: "submit booking",
        isLogedIn: req.isLogedIn,
        user: req.session.user
    });
};

exports.booked = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const userId = req.session.user._id;

    // Fetch all orders placed by the user, newest first
    const orders = await Order.find({ guest: userId })
      .populate('vender') // vendor is a User document
      .sort({ createdAt: -1 });

    // Filter out orders with deleted vendors and calculate average rating
    const validOrders = orders.filter(order => {
      if (!order.vender) return false; // skip if vendor deleted

      const vendor = order.vender;

      // Calculate average rating
      if (vendor.reviews && vendor.reviews.length > 0) {
        const validRatings = vendor.reviews.filter(r => typeof r.rating === 'number' && !isNaN(r.rating));
        vendor.averageRating = validRatings.length > 0
          ? parseFloat((validRatings.reduce((sum, r) => sum + r.rating, 0) / validRatings.length).toFixed(1))
          : 0;
      } else {
        vendor.averageRating = 0;
      }

      return true;
    });

    res.render('./store/booked', {
      orders: validOrders,
      title: "Booked Vendor List",
      currentPage: 'reserve',
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      messages: req.flash(),
    });

  } catch (err) {
    console.error('❌ Error loading booked orders:', err);
    req.flash('error', 'Could not load your booked vendors');
    res.redirect('back');
  }
};


// ✅ Get Options
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
      const vendor = await User.findById(vendorId); // ✅ vendor is directly a User
      if (!vendor) continue;

      const vendorOption = await VenderOption.findOne({
        guest: user._id,
        vendorId: vendor._id
      });

      const userOption = await UserOption.findOne({
        guest: user._id,
        vendor: vendor._id
      });

      vendorOptionsList.push({
        vendorName: vendor.firstName || "Vendor", // ✅ directly from User
        vendorId: vendor._id,
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


// ✅ Post Option
exports.postOption = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const user = await User.findById(req.session.user._id);
    const { mealType, vendorId } = req.body;

    // ✅ vendor is a User (no more venders collection)
    const vendor = await User.findById(vendorId);
    if (!vendor) {
      req.flash('error', 'Invalid vendor.');
      return res.redirect('/user/options');
    }

    // ✅ Fetch address from Order collection (based on guest & vendor)
    const order = await Order.findOne({
      guest: user._id,
      vendor: vendorId,   // was `vender` earlier
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


// ✅ Get Messages (Dynamic based on pending meals)
exports.getMessage = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) {
    return res.redirect('/login');
  }

  try {
    const user = await User.findById(req.session.user._id);
    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/login');
    }

    // ✅ Normalize today (start of day)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ✅ Fetch all active (non-expired) orders for this guest
    const orders = await Order.find({
      guest: user._id,
      expireAt: { $gte: today }
    }).populate('vender'); // include vendor details

    const messages = [];

    for (const order of orders) {
      if (!order.vender) continue; // skip if vendor missing

      const mealsDoc = await Meals.findOne({ vendor: order.vender._id });
      if (!mealsDoc) continue;

      let checkDates = [];

      // ✅ Handle subscriptions
      if (order.subscription_model === 'Per Day') {
        const start = new Date(order.startingDate);
        const end = new Date(order.endingDate);

        if (today >= start && today <= end) {
          checkDates.push({ date: today, time_type: order.time_type || [] });
        }
      } else if (order.subscription_model === 'Per Month') {
        const start = new Date(order.startingDate);
        const end = new Date(order.expireAt);

        if (today >= start && today <= end) {
          checkDates.push({ date: today, time_type: ['lunch', 'dinner'] });
        }
      }

      // ✅ Generate messages for each eligible date + type
      for (const { date, time_type: types } of checkDates) {
        const dayName = date.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

        for (const type of types) {
          const mealForDay = mealsDoc.meals?.[dayName]?.[type];
          if (!mealForDay || !mealForDay.items?.length) continue;

          const mealNames = mealForDay.items.join(', ');
          const messageText = `Your meal for today (${type}) is: ${mealNames}`;

          try {
            // ✅ Insert only if not exists (unique constraint handles duplicates)
            const savedMsg = await Message.findOneAndUpdate(
              {
                guest: user._id,
                vendorId: order.vender._id,
                mealDate: date,
                mealType: type
              },
              {
                $setOnInsert: {
                  guest: user._id,
                  vendorId: order.vender._id,
                  message: messageText,
                  mealType: type,
                  mealDate: date,
                  createdAt: new Date(),
                  expiresAt: order.expireAt
                }
              },
              { upsert: true, new: true }
            ).populate('vendorId', 'Name firstName');

            messages.push({
              message: savedMsg.message,
              vendor: savedMsg.vendorId,
              vendorName:
                savedMsg.vendorId?.Name ||
                savedMsg.vendorId?.firstName ||
                'Vendor',
              mealType: savedMsg.mealType,
              mealDate: savedMsg.mealDate
            });
          } catch (err) {
            if (err.code !== 11000) {
              console.error('❌ Error saving message:', err);
            }
          }
        }
      }
    }

    // ✅ Render message view
    res.render('./store/message', {
      title: 'Messages',
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      messages,
      currentPage: 'message'
    });
  } catch (err) {
    console.error('❌ Error fetching messages:', err);
    req.flash('error', 'Could not load messages');
    res.redirect(req.get('Referrer') || '/');
  }
};

// ⭐ ADD REVIEW
exports.postvenderDetails = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const user = await User.findById(req.session.user._id);
    const { venderId } = req.params;
    const { Review, Rating } = req.body;

    const vendor = await User.findById(venderId);

    if (!vendor /*|| vendor.role !== 'vendor'*/) {
      req.flash('error', 'Invalid vendor.');
      return res.redirect('/user/vender-list');
    }

    if (!Array.isArray(vendor.reviews)) {
      vendor.reviews = []; // ensure array
    }

    vendor.reviews.push({
      user: user._id,
      rating: parseInt(Rating, 10),
      comment: Review
    });

    await vendor.save();

    req.flash('success', 'Review submitted successfully!');
    res.redirect('/user/vender-list/' + venderId);

  } catch (err) {
    console.error('❌ Error posting review:', err);
    req.flash('error', 'Could not submit review.');
    res.redirect(req.get('Referrer') || '/');
  }
};


// ⭐ DELETE REVIEW
exports.postDeleteReview = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  const { venderId } = req.params;
  const { reviewId } = req.body;

  try {
    // ✅ Vendor comes from User model
    const vendor = await User.findById(venderId);
    if (!vendor || vendor.role !== 'vendor') {
      req.flash('error', 'Vendor not found.');
      return res.redirect('/user/vender-list');
    }

    // ✅ Check review belongs to logged-in user
    const review = vendor.reviews.find(
      rev =>
        rev._id.toString() === reviewId &&
        rev.user.toString() === req.session.user._id.toString()
    );

    if (!review) {
      req.flash('error', 'Unauthorized or review not found.');
      return res.redirect('/user/vender-list/' + venderId);
    }

    // ✅ Remove the review
    vendor.reviews = vendor.reviews.filter(
      rev => rev._id.toString() !== reviewId
    );

    await vendor.save();

    req.flash('success', 'Your review has been deleted successfully.');
    res.redirect('/user/vender-list/' + venderId);
  } catch (err) {
    console.error('❌ Error deleting review:', err);
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
