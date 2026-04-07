const { check, validationResult } = require("express-validator");
const Meals = require('../models/venders');
const User = require('../models/user');
const UserOption = require('../models/userOption');
const VenderOption = require('../models/venderOption');
const Message = require('../models/message');
const Order = require('../models/orders');
const sendEmail = require('../utils/sendEmail');
const Problem = require('../models/problem'); // import schema
const cloudinary = require('cloudinary').v2;
const crypto = require('crypto');




// ⭐ HOME PAGE
exports.homePage = async (req, res, next) => {
  let registervenders = [];
  let user = null;
  let showOptions = false;
  let birthdayMessage = null;
  let welcomeOfferMessage = null;
  let opacity = {};
  let guestAlert = null;
  let vendorAlert = null;
  let vendorArea = null;
  let customersInArea = [];

  let hasOrders = false;
  let hasVendorOrders = false;

  const todaysMealsForUI = { lunch: [], dinner: [] };

  // 🆕 Special Thali container
  const specialThaliForUI = [];

  const todayKey = new Date()
    .toLocaleDateString("en-US", { weekday: "long" })
    .toLowerCase();

  try {
    /* =====================================================
       1️⃣ FETCH ALL VENDORS
    ===================================================== */
    registervenders = await User.find({ userType: "vender" });

    /* =====================================================
       2️⃣ VENDORS WHO HAVE ADDED MEALS
    ===================================================== */
    const vendorIdsWithMeals = await Meals.distinct("vendor");
    const vendorsWithMealsSet = new Set(
      vendorIdsWithMeals.map(id => id.toString())
    );

    /* =====================================================
       3️⃣ LOGGED-IN USER SETUP
    ===================================================== */
    if (req.isLogedIn && req.session.user) {
      user = await User.findById(req.session.user._id);

      // 🔔 Notification dots
      if (user.userType === "guest") {
        hasOrders = await Order.exists({ guest: user._id });
      }

      if (user.userType === "vender") {
        hasVendorOrders = await Order.exists({ vender: user._id });
      }

      /* =================================================
         🧠 ALERT LOGIC (SHOW ONCE)
      ================================================= */
      const lastAlertSeen = req.session.lastAlertSeen || null;

      if (user.userType === "guest") {
        const latestVendorOption = await VenderOption.findOne({ guest: user._id })
          .sort({ updatedAt: -1 });

        if (latestVendorOption) {
          const latestTime = latestVendorOption.updatedAt.getTime();
          if (!lastAlertSeen || latestTime > lastAlertSeen) {
            guestAlert = {
              message: "🍱 Your vendor has added new meal options for you!",
              redirect: "/user/options",
              btnText: "View Now"
            };
            req.session.lastAlertSeen = latestTime;
          }
        }
      }

      if (user.userType === "vender") {
        const latestGuestOption = await UserOption.findOne({ vendor: user._id })
          .sort({ updatedAt: -1 });

        if (latestGuestOption) {
          const latestTime = latestGuestOption.updatedAt.getTime();
          if (!lastAlertSeen || latestTime > lastAlertSeen) {
            vendorAlert = {
              message: "💬 You have new meal selections from your customers!",
              redirect: "/vender/customerChoice",
              btnText: "View Choices"
            };
            req.session.lastAlertSeen = latestTime;
          }
        }

        /* =============================================
           🗺️ MAP + CUSTOMER AREA LOGIC
        ============================================= */
        if (user.serviceArea?.coordinates?.length) {
          vendorArea = { coordinates: user.serviceArea.coordinates };

          const allGuests = await User.find({
            userType: "guest",
            lat: { $exists: true },
            lng: { $exists: true }
          });

          const polygon = user.serviceArea.coordinates[0];
          const polygonCoords = polygon.map(([lng, lat]) => ({ lat, lng }));

          const guestsInsideArea = allGuests.filter(g => {
            return isPointInPolygon(
              { lat: +g.lat, lng: +g.lng },
              polygonCoords
            );
          });

          const bookedOrders = await Order.find({
            vender: user._id,
            status: { $ne: "cancelled" }
          }).populate("guest", "_id firstName lat lng");

          const bookedGuests = bookedOrders
            .map(o => o.guest)
            .filter(g => g?.lat && g?.lng)
            .map(g => ({
              _id: g._id.toString(),
              name: g.firstName || "Customer",
              lat: +g.lat,
              lng: +g.lng
            }));

          customersInArea = guestsInsideArea.map(g => ({
            _id: g._id.toString(),
            name: g.firstName || "Guest",
            lat: +g.lat,
            lng: +g.lng,
            userType: "guest"
          }));

          res.locals.bookedCustomers = [
            ...new Map(bookedGuests.map(g => [g._id, g])).values()
          ];
        }
      }

      /* =================================================
         🎂 BIRTHDAY BONUS
      ================================================= */
      if (user.userType === "guest" && user.dob) {
        const todayIST = new Date(
          new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
        );
        const dobIST = new Date(
          new Date(user.dob).toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
        );

        const isBirthday =
          todayIST.getDate() === dobIST.getDate() &&
          todayIST.getMonth() === dobIST.getMonth();

        if (isBirthday) {
          const activeOrder = await Order.findOne({
            guest: user._id,
            subscription_model: "Per Month",
            status: "active",
            startingDate: { $lte: todayIST },
            endingDate: { $gte: todayIST }
          });

          if (activeOrder) {
            user.welcomeOffer.amount += 100;
            birthdayMessage = `🎉 Happy Birthday ${user.firstName}! ₹100 added to your wallet 🎁`;
            await user.save();
          }
        }
      }

      /* =================================================
         🎁 WELCOME OFFER
      ================================================= */
      if (
        user.userType === "guest" &&
        user.welcomeOffer?.amount > 0 &&
        !user.welcomeOffer.isUsed &&
        !req.session.offerShown
      ) {
        welcomeOfferMessage = `🎁 Welcome ${user.firstName}! You have ₹${user.welcomeOffer.amount} OFF`;
        req.session.offerShown = true;
      }

      /* =================================================
         📍 LOCATION-BASED VENDOR FILTER
      ================================================= */
      if (user.lat && user.lng) {
        const userPoint = { lat: +user.lat, lng: +user.lng };

        registervenders = registervenders.filter(v => {
          if (!v.serviceArea?.coordinates?.length) return false;

          const polygonCoords = v.serviceArea.coordinates[0].map(
            ([lng, lat]) => ({ lat, lng })
          );

          return isPointInPolygon(userPoint, polygonCoords);
        });
      }
    }

    /* =====================================================
       4️⃣ ELIGIBLE VENDORS SET (ONLY IF LOGGED IN)
    ===================================================== */
    let eligibleVendorIds = null;
    if (req.isLogedIn && user?.lat && user?.lng) {
      eligibleVendorIds = new Set(
        registervenders.map(v => v._id.toString())
      );
    }

    /* =====================================================
       5️⃣ FETCH TODAY'S MEALS
    ===================================================== */
    const allMealsDocs = await Meals.find({})
      .populate("vendor", "serviceName")
      .lean();

    allMealsDocs.forEach(m => {
      if (!m.vendor) return;

      const vendorId = m.vendor._id.toString();

      // 🔐 eligibility check
      if (eligibleVendorIds && !eligibleVendorIds.has(vendorId)) return;

      /* ===============================
         🍱 TODAY’S MEALS (DAY BASED)
      =============================== */
      const dayMeals = m.meals?.[todayKey];

      if (dayMeals?.lunch?.items?.length) {
        todaysMealsForUI.lunch.push({
          vendorId,
          vendorName: m.vendor.serviceName,
          image: dayMeals.lunch.image || "/tiffin.png",
          mealName: dayMeals.lunch.items.slice(0, 3).join(" • ")
        });
      }

      if (dayMeals?.dinner?.items?.length) {
        todaysMealsForUI.dinner.push({
          vendorId,
          vendorName: m.vendor.serviceName,
          image: dayMeals.dinner.image || "/tiffin.png",
          mealName: dayMeals.dinner.items.slice(0, 3).join(" • ")
        });
      }
    });

    /* =====================================================
       6️⃣ FAVOURITES + MENU FLAGS
    ===================================================== */
    if (user?.userType === "guest") {
      showOptions = true;
      const favIds = user.favourites.map(f => f.toString());

      registervenders = registervenders.map(v => {
        const id = v._id.toString();
        const isFav = favIds.includes(id);
        opacity[id] = isFav ? 10 : 0;

        return {
          ...v.toObject(),
          vendorClass: isFav ? "fav-vendor" : "",
          hasMenu: vendorsWithMealsSet.has(id)
        };
      });
    } else {
      registervenders = registervenders.map(v => {
        const id = v._id.toString();
        opacity[id] = 0;
        return {
          ...v.toObject(),
          vendorClass: "",
          hasMenu: vendorsWithMealsSet.has(id)
        };
      });
    }

    const errorMessage = req.flash("error");


    // 4️⃣ Render
    res.render("./store/vender", {
      venders: registervenders,
      title: "Tiffsi",
      currentPage: "home",
      isLogedIn: req.isLogedIn,
      user: user || null,
      showOptions,
      birthdayMessage,
      welcomeOfferMessage,
      opacity,
      guestAlert,
      vendorAlert,
      errorMessage: errorMessage.length ? errorMessage[0] : null,
      vendorArea,
      customersInArea,
      hasOrders,
      hasVendorOrders,
      bookedCustomers: res.locals.bookedCustomers || [],   // ✅ added line
      todaysMealsForUI,
      todayKey,
      specialThaliForUI
    });

  } catch (err) {
    console.error("❌ Home page error:", err);
    res.status(500).send("Server error");
  }
};

// Utility: Point in Polygon
function isPointInPolygon(point, polygon) {
  const x = point.lat, y = point.lng;
  let inside = false;

  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lat, yi = polygon[i].lng;
    const xj = polygon[j].lat, yj = polygon[j].lng;

    const intersect =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

    if (intersect) inside = !inside;
  }

  return inside;
}
// ⭐ VENDOR DETAILS
exports.venderDetails = async (req, res, next) => {
  const venderId = req.params.venderId;

  try {
    // 👉 Fetch vendor with populated reviews
    const vender = await User.findById(venderId).populate('reviews.user');
    if (!vender) return res.redirect('/');

    // 🔥 Notification flags (default)
    let hasOrders = false;
    let hasVendorOrders = false;

    // 👉 Calculate ratings
    let averageRating = 0;
    const validRatings = (vender.reviews || []).filter(
      r => typeof r.rating === 'number' && !isNaN(r.rating)
    );
    if (validRatings.length > 0) {
      const total = validRatings.reduce((sum, review) => sum + review.rating, 0);
      averageRating = parseFloat((total / validRatings.length).toFixed(1));
    }

    const numberOfOrders = vender.orders || 0;

    // ---------------------------------------
    // 🔥 Safe notification dot logic
    // ---------------------------------------
    if (req.isLogedIn && req.session.user) {
      const loggedUser = await User.findById(req.session.user._id);

      if (loggedUser.userType === "guest") {
        hasOrders = await Order.exists({ guest: loggedUser._id });
      }

      if (loggedUser.userType === "vender") {
        hasVendorOrders = await Order.exists({ vender: loggedUser._id });
      }
    }

    // ---------------------------------------
    // ACTIVE customers list
    // ---------------------------------------
    const activeOrders = await Order.find({
      vender: venderId,
      status: 'active'
    }).populate('guest', 'firstName profilePicture');

    const guestUsers = activeOrders
      .filter(order => order.guest)
      .map(order => ({
        firstName: order.guest.firstName,
        profilePicture: order.guest.profilePicture,
        status: order.status,
      }));

    // ---------------------------------------
    // FAVORITES + OPACITY LOGIC
    // ---------------------------------------
    let showOptions = false;
    let opacity = {};

    if (req.isLogedIn && req.session.user) {
      const user = await User.findById(req.session.user._id);

      if (user.userType === "guest") {
        showOptions = true;

        const isFavourite = user.favourites
          .map(id => id.toString())
          .includes(vender._id.toString());

        opacity[vender._id.toString()] = isFavourite ? 10 : 0;
      } else {
        opacity[vender._id.toString()] = 0;
      }
    } else {
      opacity[vender._id.toString()] = 0;
    }

    // ---------------------------------------
    // Weekly menu
    // ---------------------------------------
    const mealsDoc = await Meals.findOne({ vendor: venderId });
    const menuByDay = mealsDoc ? mealsDoc.meals : {};

    console.log(vender.reviews)
    // ---------------------------------------
    // Render
    // ---------------------------------------
    res.render('./store/vender-details', {
      vender,
      title: "Vendor Details",
      isLogedIn: req.isLogedIn,
      currentPage: "home",
      user: req.session.user || null,
      averageRating,
      showOptions,
      opacity,
      numberOfOrders,
      guestUsers,
      reviews: vender.reviews || [],
      menuByDay,
      messages: req.flash(),
      hasOrders,          // 🔥 for guest notification dot
      hasVendorOrders     // 🔥 for vendor notification dot
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
    const hasOrders = await Order.exists({ guest: req.session.user._id });

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
      vender.pricePerMonthSingle = vender.pricePerMonthSingle || 0;
      vender.pricePerMonthBoth = vender.pricePerMonthBoth || 0;
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
      hasOrders
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
  const bookingType = req.query.type || "normal";

  try {
    const vender = await User.findById(venderId);
    if (!vender) return res.redirect('/user/vender-list');
    const hasOrders = await Order.exists({ guest: req.session.user._id });

    // ✅ Check if vendor has added meals
    const mealsDoc = await Meals.findOne({ vendor: venderId });
    let specialThaliData = null;

    if (bookingType === "special-thali" && mealsDoc.specialThali) {
      specialThaliData = {
        price: mealsDoc.specialThali.price || 0,
        items: mealsDoc.specialThali.items || [],
        image: mealsDoc.specialThali.image || "",
      };
    }
    if (!mealsDoc) {
      req.flash(
        'error',
        `The Vendor ${vender.firstName || vender.Name || 'This vendor'} has not added their meals yet. Please choose another vendor.`
      );
      return res.redirect('/');
    }

    // ✅ Calculate average rating
    let averageRating = 0;
    if (vender.reviews && vender.reviews.length > 0) {
      const validRatings = vender.reviews.filter(
        (r) => typeof r.rating === 'number' && !isNaN(r.rating)
      );
      if (validRatings.length > 0) {
        const total = validRatings.reduce((sum, review) => sum + review.rating, 0);
        averageRating = parseFloat((total / validRatings.length).toFixed(1));
      }
    }
    vender.averageRating = averageRating;

    // ✅ Check welcome offer for logged-in user
    let welcomeOfferData = null;
    if (req.isLogedIn && req.session.user?._id) {
      const loggedInUser = await User.findById(req.session.user._id).lean();
      if (loggedInUser && loggedInUser.welcomeOffer && !loggedInUser.welcomeOffer.isUsed) {
        welcomeOfferData = {
          amount: loggedInUser.welcomeOffer.amount || 0,
          available: loggedInUser.welcomeOffer.amount > 0 && !loggedInUser.welcomeOffer.isUsed
        };
      }
    }
    const user = await User.findById(req.session.user._id);
    // ✅ Render booking page and send offer data
    res.render('./store/booking', {
      vender,
      title: 'Booking',
      isLogedIn: req.isLogedIn,
      user: user || null,
      currentPage: 'reserve',
      RAZORPAY_KEY_ID: process.env.RAZORPAY_KEY_ID,
      welcomeOffer: welcomeOfferData, // 👈 sent to frontend
      hasOrders,
      bookingType,
      specialThali: specialThaliData
    });

  } catch (err) {
    console.error('❌ Error loading booking page:', err);
    res.redirect('/user/vender-list');
  }
};

exports.Postbooking = [
  // ✅ Phone validation
  check('phone')
    .isNumeric().withMessage('Phone number should be numeric')
    .isLength({ min: 10, max: 10 }).withMessage('Phone number should be 10 digits long'),

  async (req, res, next) => {
    const wantsJSON = req.headers['content-type']?.includes('application/json');

    try {
      // -------------------------
      //  VALIDATION
      // -------------------------
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        const msg = errors.array()[0].msg;
        return wantsJSON
          ? res.status(400).json({ success: false, message: msg })
          : (req.flash('error', msg), res.redirect('back'));
      }

      // -------------------------
      //  LOGIN CHECK
      // -------------------------
      if (!req.isLogedIn || !req.session.user) {
        return wantsJSON
          ? res.status(401).json({ success: false, message: 'Login required' })
          : res.redirect('/login');
      }

      // -------------------------
      //  Extract Data
      // -------------------------
      const venderId = req.params.venderId;
      const {
        name,
        phone,
        subscription_model,
        startingDate,
        endingDate,
        payment,
        time_type,
        selectedMonths,
        address,
        totalAmount,
        quantity,
        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature
      } = req.body;

      // ❗ If Razorpay payment fields exist, DO NOT create order here
      if (
        razorpay_payment_id &&
        razorpay_order_id &&
        razorpay_signature
      ) {
        return res.json({
          success: true,
          message: "Payment verified. Order will be confirmed via Razorpay webhook."
        });
      }

      // -------------------------
      //  FETCH USER + VENDOR
      // -------------------------
      const guestUser = await User.findById(req.session.user._id);
      const Selectedvender = await User.findById(venderId);

      if (!Selectedvender || Selectedvender.userType !== 'vender') {
        const msg = 'Vendor not found';
        return wantsJSON
          ? res.status(404).json({ success: false, message: msg })
          : (req.flash('error', msg), res.redirect('back'));
      }

      // -------------------------
      //  VALIDATE QUANTITY
      // -------------------------
      const q = Number(quantity || 1);
      if (isNaN(q) || q < 1 || q > 10) {
        const msg = 'Quantity must be between 1 and 10';
        return wantsJSON
          ? res.status(400).json({ success: false, message: msg })
          : (req.flash('error', msg), res.redirect('back'));
      }

      // -------------------------
      //  ADDRESS VALIDATION
      // -------------------------
      const vendorLocation = Selectedvender.location || '';
      const locationKeywords = vendorLocation.toLowerCase().split(/[^a-zA-Z0-9]+/).filter(Boolean);
      const userAddress = (address || '').toLowerCase();

      const isMatch = locationKeywords.length === 0
        ? true
        : locationKeywords.some(k => userAddress.includes(k));

      if (!isMatch) {
        const msg = `This vendor is only available for addresses under: "${vendorLocation}"`;
        return wantsJSON
          ? res.status(400).json({ success: false, message: msg })
          : (req.flash('error', msg), res.redirect('back'));
      }

      // -------------------------
      // TIME_TYPE ARRAY
      // -------------------------
      let timeTypeArray = [];
      if (time_type) {
        timeTypeArray = Array.isArray(time_type) ? time_type : [time_type];
      }
      const mealsCount = timeTypeArray.length || 0;

      // -------------------------
      // PRICE CALCULATIONS
      // -------------------------
      let calculatedTotal = 0;
      let originalCalculatedTotal = 0;
      const pricePerDay = Selectedvender.pricePerDay || 0;
      const MS_PER_DAY = 86400000;

      if (subscription_model === 'Per Day') {
        const start = new Date(startingDate);
        const end = new Date(endingDate);

        if (isNaN(start) || isNaN(end) || end < start) {
          const msg = 'Invalid date selection';
          return wantsJSON
            ? res.status(400).json({ success: false, message: msg })
            : (req.flash('error', msg), res.redirect('back'));
        }

        const days = Math.floor((end - start) / MS_PER_DAY) + 1;
        const effMeals = mealsCount || 1;

        originalCalculatedTotal = days * pricePerDay * effMeals * q;
        calculatedTotal = originalCalculatedTotal;

      } else if (subscription_model === 'Per Month') {
        let pricePerMonth = 0;

        if (mealsCount === 1) pricePerMonth = Selectedvender.pricePerMonthSingle || 0;
        else if (mealsCount === 2) pricePerMonth = Selectedvender.pricePerMonthBoth || 0;
        else {
          const msg = 'Invalid number of meals selected';
          return wantsJSON
            ? res.status(400).json({ success: false, message: msg })
            : (req.flash('error', msg), res.redirect('back'));
        }

        originalCalculatedTotal = Number(selectedMonths || 0) * pricePerMonth * q;
        calculatedTotal = originalCalculatedTotal;

      } else {
        const msg = 'Subscription model required';
        return wantsJSON
          ? res.status(400).json({ success: false, message: msg })
          : (req.flash('error', msg), res.redirect('back'));
      }

      // -------------------------
      // APPLY WELCOME OFFER
      // -------------------------
      if (subscription_model === 'Per Month' && guestUser.welcomeOffer && !guestUser.welcomeOffer.isUsed) {
        let offerAmount = guestUser.welcomeOffer.amount || 0;

        if (offerAmount > 0) {
          if (offerAmount >= calculatedTotal) {
            guestUser.welcomeOffer.amount = offerAmount - calculatedTotal;
            calculatedTotal = 0;
            if (guestUser.welcomeOffer.amount <= 0) guestUser.welcomeOffer.isUsed = true;
          } else {
            calculatedTotal -= offerAmount;
            guestUser.welcomeOffer.amount = 0;
            guestUser.welcomeOffer.isUsed = true;
          }
          await guestUser.save();
        }
      }

      // -------------------------
      // VERIFY TOTAL
      // -------------------------
      if (typeof totalAmount !== 'undefined') {
        const clientTotal = Number(totalAmount);
        const almostEqual = (a, b) => Math.abs(a - b) <= 0.01;

        if (!almostEqual(clientTotal, calculatedTotal) &&
          !almostEqual(clientTotal, originalCalculatedTotal)) {
          const msg = 'Total amount mismatch';
          return wantsJSON
            ? res.status(400).json({ success: false, message: msg })
            : (req.flash('error', msg), res.redirect('back'));
        }
      }

      // -------------------------
      // DATE CALCULATIONS
      // -------------------------
      let startDateForOrder;
      let expireAt;

      if (subscription_model === 'Per Month') {
        const nowIST = new Date(new Date().getTime() + 19800000);
        startDateForOrder = new Date(nowIST);
        if (nowIST.getHours() >= 11) startDateForOrder.setDate(startDateForOrder.getDate() + 1);
        startDateForOrder.setHours(0, 0, 0, 0);

        expireAt = new Date(startDateForOrder.getTime() + Number(selectedMonths) * 30 * MS_PER_DAY);

      } else {
        startDateForOrder = new Date(startingDate);
        expireAt = new Date(endingDate);
        expireAt.setDate(expireAt.getDate() + 1);
      }

      // -------------------------
      // PAYMENT VERIFICATION
      // -------------------------
      let paymentStatus = payment || 'Pending';

      if (razorpay_payment_id && razorpay_order_id && razorpay_signature) {
        const generatedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
          .update(razorpay_order_id + '|' + razorpay_payment_id)
          .digest('hex');

        if (generatedSignature !== razorpay_signature) {
          const msg = 'Payment verification failed';
          return wantsJSON
            ? res.status(400).json({ success: false, message: msg })
            : (req.flash('error', msg), res.redirect('back'));
        }

        paymentStatus = 'Paid';
      }

      // -------------------------
      // PAYOUT SCHEDULE
      // -------------------------
      let payoutSchedule = [];

      if (subscription_model === 'Per Month') {
        const half = calculatedTotal / 2;
        payoutSchedule = [
          { id: 'firstHalf', dueDate: startDateForOrder, amount: half, status: 'pending' },
          { id: 'final', dueDate: expireAt, amount: calculatedTotal - half, status: 'pending' }
        ];
      } else {
        payoutSchedule = [
          { id: 'full', dueDate: startDateForOrder, amount: calculatedTotal, status: 'pending' }
        ];
      }

      // -------------------------
      // END DATE FIX
      // -------------------------
      let endingDateValue;
      if (subscription_model === 'Per Month') {
        endingDateValue = new Date(expireAt);
        endingDateValue.setDate(endingDateValue.getDate() - 1);
      } else {
        endingDateValue = new Date(endingDate);
      }

      // -------------------------
      // CALCULATE VENDOR SHARE
      // -------------------------
      const vendorShare = originalCalculatedTotal * 0.9;

      // -------------------------
      // CREATE ORDER
      // -------------------------
      const newOrder = new Order({
        guest: guestUser._id,
        vender: Selectedvender._id,
        name,
        phone,
        address,
        lat: guestUser.lat || 0,
        lng: guestUser.lng || 0,
        quantity: q,
        subscription_model,
        startingDate: startDateForOrder,
        endingDate: endingDateValue,
        payment: paymentStatus,

        totalAmount: originalCalculatedTotal,
        vendorShare,
        time_type: timeTypeArray,
        number_of_months: subscription_model === 'Per Month' ? selectedMonths : undefined,

        expireAt,
        payoutSchedule,

        razorpay_payment_id,
        razorpay_order_id,
        razorpay_signature
      });

      await newOrder.save();

      // -------------------------
      // REFERRAL LOGIC (Restored)
      // -------------------------
      if (subscription_model === 'Per Month' && guestUser.referredBy && !guestUser.referralUsed) {
        const referrer = await User.findOne({
          referralCode: guestUser.referredBy,
          userType: 'guest'
        });

        if (referrer) {
          referrer.welcomeOffer.amount += 100;
          await referrer.save();

          guestUser.referralUsed = true;
          await guestUser.save();

          // Email referrer
          await sendEmail({
            to: referrer.email,
            subject: "🎉 Referral Bonus Added!",
            html: `
              <p>Hello <b>${referrer.firstName}</b>,</p>
              <p>Your friend <b>${guestUser.firstName}</b> has subscribed to a monthly plan.</p>
              <p>🎁 You earned a bonus of <b>₹100</b>.</p>
              <br/>
              <a href="${process.env.BASE_URL}/user/wallet"
                 style="
                   padding:10px 18px;
                   background:#2ecc71;
                   color:white;
                   font-weight:bold;
                   border-radius:6px;
                   text-decoration:none;
                 ">💰 View Wallet Balance</a>
            `
          });
        }
      }

      // -------------------------
      // EMAIL TO VENDOR (Restored)
      // -------------------------
      await sendEmail({
        to: Selectedvender.email,
        subject: `🚨 New Order Alert!`,
        html: `
          <p>You received a new order from <b>${guestUser.firstName}</b></p>
          <p><b>Quantity:</b> ${q}</p>
          <p><b>Total Amount:</b> ₹${originalCalculatedTotal}</p>
          <p><b>Subscription:</b> ${subscription_model}</p>

          <br/>
          <a href="https://tiffin-seva.com/vender/orders"
             style="
               padding:10px 18px;
               background:#1a73e8;
               color:white;
               font-weight:bold;
               border-radius:6px;
               text-decoration:none;
             ">🔍 View Order Details</a>
        `
      });

      // -------------------------
      // UPDATE VENDOR STATS
      // -------------------------
      Selectedvender.orders = (Selectedvender.orders || 0) + 1;
      await Selectedvender.save();

      // -------------------------
      // UPDATE USER BOOKED LIST
      // -------------------------
      if (!guestUser.booked.includes(venderId)) {
        guestUser.booked.push(venderId);
        await guestUser.save();
      }

      // -------------------------
      // SUCCESS RESPONSE
      // -------------------------
      return wantsJSON
        ? res.json({
          success:
            true, message: 'Booking created successfully'
        })
        : res.redirect('/user/submit_booking');

    } catch (err) {
      console.error('❌ Booking Error:', err);
      return wantsJSON
        ? res.status(500).json({ success: false, message: 'Something went wrong during booking' })
        : (req.flash('error', 'Something went wrong during booking'), res.redirect('back'));
    }
  }
];

// POST CANCEL BOOKING (with pro-rated refund for monthly subscription + birthday month check)
exports.postCancelBooking = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  const orderId = req.params.orderId;
  const userId = req.session.user._id;
  const quantity = req.body.quantity ? Number(req.body.quantity) : 1;
  console.log(quantity);

  // ---- TIME HELPERS (IST safe) ----
  const toIST = (d) =>
    new Date(new Date(d).toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));

  const startOfDayIST = (d) => {
    const x = toIST(d);
    x.setHours(0, 0, 0, 0);
    return x;
  };

  try {
    // ---- FETCH ORDER ----
    const order = await Order.findOne({ _id: orderId, guest: userId }).populate('vender');
    if (!order) {
      req.flash('error', 'Order not found');
      return res.redirect('/user/booked');
    }

    const vendor = order.vender;
    const user = await User.findById(userId);

    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/user/booked');
    }

    const venderId = vendor._id;

    // ---------------------------------------------------------
    // 🎂 **BIRTHDAY MONTH SPECIAL LOGIC (unchanged)**
    // ---------------------------------------------------------
    if (user.dob) {
      const nowIST = toIST(new Date());
      const dobIST = toIST(new Date(user.dob));

      const currentMonth = nowIST.getMonth();
      const birthMonth = dobIST.getMonth();
      const currentDay = nowIST.getDate();
      const birthDay = dobIST.getDate();

      if (currentMonth === birthMonth && currentDay >= birthDay) {
        let alreadyDeducted = false;

        if (user.birthdayCancellationDeductedAt) {
          const last = toIST(user.birthdayCancellationDeductedAt);
          alreadyDeducted =
            last.getFullYear() === nowIST.getFullYear() &&
            last.getMonth() === birthMonth;
        }

        if (!alreadyDeducted) {
          user.welcomeOffer = user.welcomeOffer || { amount: 0, isUsed: false };

          if ((user.welcomeOffer.amount || 0) >= 100) {
            user.welcomeOffer.amount -= 100;
            user.birthdayCancellationDeductedAt = nowIST;
            await user.save();
          }
        }
      }
    }

    // ---------------------------------------------------------
    // 🔥 **MAIN CANCELLATION CALCULATION**
    // EXACT SAME AS FRONTEND POPUP
    // ---------------------------------------------------------

    const totalAmountPaise = Math.round(order.totalAmount * 100);
    const perDayPricePaise = Math.round(vendor.pricePerDay * 100);

    // ALWAYS 2 meals per day (Lunch + Dinner)
    const mealsPerDay = order.time_type?.length || 1;

    const nowIST = toIST(new Date());
    const cancelDayIST = startOfDayIST(nowIST);
    const startDayIST = startOfDayIST(order.startingDate);

    let daysUsed = 0;

    // 1️⃣ BEFORE START DATE → no usage
    if (cancelDayIST < startDayIST) {
      daysUsed = 0;
    }

    // 2️⃣ SAME DAY → Check 12:30 PM cutoff
    else if (cancelDayIST.getTime() === startDayIST.getTime()) {
      const cutoff = toIST(order.startingDate);
      cutoff.setHours(12, 30, 0, 0);

      daysUsed = nowIST > cutoff ? 1 : 0;
    }

    // 3️⃣ AFTER START DATE → Normal calculation
    else {
      const diffDays = Math.ceil((cancelDayIST - startDayIST) / (1000 * 60 * 60 * 24));
      daysUsed = Math.max(1, diffDays);
    }

    // ---- USED AMOUNT ----
    const usedAmountPaise = perDayPricePaise * mealsPerDay * daysUsed * quantity;

    order.daysUsed = daysUsed;
    order.usedAmount = Number((usedAmountPaise / 100).toFixed(2));

    // ---- 2% PENALTY ----
    const penaltyPaise = Math.round(totalAmountPaise * 0.02);

    const totalDeductionPaise = usedAmountPaise + penaltyPaise;

    const refundPaise = Math.max(0, totalAmountPaise - totalDeductionPaise);
    const refundAmount = Number((refundPaise / 100).toFixed(2));

    // ---------------------------------------------------------
    // 💰 UPDATE USER WALLET
    // ---------------------------------------------------------
    user.welcomeOffer = user.welcomeOffer || { amount: 0, isUsed: false };

    let walletPaise = Math.round((user.welcomeOffer.amount || 0) * 100);

    // update wallet in paise only
    walletPaise += refundPaise;

    // convert ONCE to rupees (no toFixed, no float math)
    user.welcomeOffer.amount = walletPaise / 100;

    await user.save();

    // ---------------------------------------------------------
    // 💵 VENDOR SHARE = 90% of USED amount
    // ---------------------------------------------------------
    const vendorSharePaise = Math.round(usedAmountPaise * 0.9);
    order.vendorShare = Number((vendorSharePaise / 100).toFixed(2));

    // Save refund for vendor dashboard
    order.refundAmount = refundAmount;

    // ---------------------------------------------------------
    // 🧾 UPDATE ORDER STATUS
    // ---------------------------------------------------------
    order.payoutSchedule = [
      {
        id: 'refunded',
        dueDate: nowIST,
        amount: refundAmount,
        status: 'pending'
      }
    ];

    order.status = 'cancelled';
    await order.save();

    // ---------------------------------------------------------
    // 📧 Notify Vendor (same as before)
    // ---------------------------------------------------------
    await sendEmail({
      to: vendor.email,
      subject: `Booking Cancelled`,
      text: `Hi ${vendor.firstName},

The booking from ${user.firstName} has been cancelled.

Refund Amount: ₹${refundAmount}
Used Days: ${daysUsed}
Penalty: ₹${(penaltyPaise / 100).toFixed(2)}

Thanks,
tiffsi`
    });

    // ---------------------------------------------------------
    // 📉 VENDOR STATS + Cleanup
    // ---------------------------------------------------------
    vendor.orders = Math.max(0, (vendor.orders || 1) - 1);
    await vendor.save();

    const remainingOrders = await Order.countDocuments({ guest: userId, vender: venderId });

    if (remainingOrders === 0) {
      await User.findByIdAndUpdate(userId, { $pull: { booked: venderId } });
    }

    // Delete user-vendor meal selections
    await UserOption.deleteMany({ guest: userId, vendor: venderId, orderId }).catch(() => { });
    await VenderOption.deleteMany({ guest: userId, vendorId: venderId, orderId }).catch(() => { });

    if (remainingOrders === 0) {
      await UserOption.deleteMany({ guest: userId, vendor: venderId }).catch(() => { });
      await VenderOption.deleteMany({ guest: userId, vendorId: venderId }).catch(() => { });
    }

    req.flash('success', `Booking cancelled! Refund: ₹${refundAmount} added to your wallet`);
    return res.redirect('/user/booked');

  } catch (err) {
    console.error("Cancel booking error:", err);
    req.flash('error', 'Something went wrong during cancellation');
    return res.redirect('/user/booked');
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
    const hasOrders = await Order.exists({ guest: req.session.user._id });

    // Fetch all orders placed by the user, newest first
    const orders = await Order.find({ guest: userId })
      .populate('vender') // vendor is a User document
      .sort({ createdAt: -1 })
      .lean(); // ✅ returns plain JS objects so we can safely attach new fields

    // Filter & enrich orders
    const validOrders = orders
      .filter(order => order.vender) // skip deleted vendors
      .map(order => {
        const vendor = order.vender;

        // ✅ Compute average rating for vendor
        if (vendor.reviews && vendor.reviews.length > 0) {
          const validRatings = vendor.reviews.filter(
            r => typeof r.rating === 'number' && !isNaN(r.rating)
          );
          vendor.averageRating =
            validRatings.length > 0
              ? parseFloat(
                (
                  validRatings.reduce((sum, r) => sum + r.rating, 0) /
                  validRatings.length
                ).toFixed(1)
              )
              : 0;
        } else {
          vendor.averageRating = 0;
        }

        // ✅ Add pre-formatted date range (optional)
        if (order.startingDate) {
          order.startingDateFormatted = new Date(order.startingDate).toDateString();
        }
        if (order.endingDate) {
          order.endingDateFormatted = new Date(order.endingDate).toDateString();
        }

        // ✅ If Per Month subscription, compute end date automatically
        if (
          order.subscription_model === 'Per Month' &&
          order.number_of_months &&
          order.startingDate
        ) {
          const start = new Date(order.startingDate);
          const end = new Date(start);
          end.setDate(start.getDate() + 30 * order.number_of_months);
          order.monthRange = `${start.toDateString()} - ${end.toDateString()}`;
        }

        // ✅ Add cancelAllowed flag & cancelNote based on 7-day rule
        if (order.startingDate) {
          const startDate = new Date(order.startingDate);
          const now = new Date();
          const diffInDays = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));

          order.cancelAllowed = diffInDays <= 7; // true if within 7 days
          order.cancelNote = order.cancelAllowed
            ? "NOTE: You can cancel your order & get remaining amount refunded only within 7 days"
            : "You cannot cancel your order now, because 7 days have passed";
        } else {
          order.cancelAllowed = false;
          order.cancelNote = "No starting date found for this order";
        }

        return order;
      });

    res.render('./store/booked', {
      orders: validOrders,
      title: 'Booked Vendor List',
      currentPage: 'reserve',
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      messages: req.flash(),
      hasOrders
    });
  } catch (err) {
    console.error('❌ Error loading booked orders:', err);
    req.flash('error', 'Could not load your booked vendors');
    res.redirect('back');
  }
};

// for postProblem
exports.postProblem = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { problemText } = req.body;

    // Save problem to DB
    const newProblem = new Problem({
      order: orderId,
      user: req.session.user._id, // assuming you're using authentication
      description: problemText
    });

    await newProblem.save();
    req.flash('success', 'Your problem has been submitted successfully.');
    res.redirect('back'); // go back to the same page
  } catch (error) {
    console.error('Error saving problem:', error);
    req.flash('error', 'Failed to submit problem. Try again.');
    res.redirect('back');
  }
};

// ✅ Get Options
exports.getOption = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const user = await User.findById(req.session.user._id);
    const bookedVendorIds = user.booked;
    const hasOrders = await Order.exists({ guest: req.session.user._id });

    if (!bookedVendorIds || bookedVendorIds.length === 0) {
      return res.render('./store/options', {
        title: "Customer Choice",
        isLogedIn: req.isLogedIn,
        user: req.session.user,
        vendorOptionsList: [],
        currentPage: 'options',
        hasOrders
      });
    }

    const vendorOptionsList = [];
    const now = new Date();

    for (const vendorId of bookedVendorIds) {
      const vendor = await User.findById(vendorId);
      if (!vendor) continue;

      // 🔥 Fetch the ACTIVE order for this vendor
      const order = await Order.findOne({
        guest: user._id,
        vender: vendor._id,   // your order field name
        status: "active"
      });

      // ❌ If no ACTIVE order → skip this vendor entirely
      if (!order) continue;

      const vendorOption = await VenderOption.findOne({
        guest: user._id,
        vendorId: vendor._id
      });

      const userOption = await UserOption.findOne({
        guest: user._id,
        vendor: vendor._id
      });

      // 🎯 Filter lunch/dinner based on current time
      let availableMeals = [];
      if (Array.isArray(vendorOption?.mealOptions) && vendorOption.mealOptions.length) {
        availableMeals = vendorOption.mealOptions.filter(meal => {
          const m = meal.toLowerCase();
          if (m === "lunch") return now.getHours() < 12;
          if (m === "dinner") return now.getHours() < 18;
          return true;
        });
      }

      vendorOptionsList.push({
        vendorName: vendor.firstName,
        vendorId: vendor._id,
        vendor,
        option: vendorOption,
        isSent: !!userOption,
        availableMeals,
        order   // 🔥 new field included
      });
    }

    res.render('./store/options', {
      title: "Customer Choice",
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      vendorOptionsList,
      currentPage: 'options',
      hasOrders
    });

  } catch (err) {
    console.error("Error loading options:", err);
    req.flash('error', 'Unable to load meal options');
    res.redirect('/user/booked');
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


// ✅ Get Messages (Dynamic based on pending meals) + email
exports.getMessage = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) {
    return res.redirect('/login');
  }

  try {
    const user = await User.findById(req.session.user._id);
    if (!user) return res.redirect('/login');
    const hasOrders = await Order.exists({ guest: req.session.user._id });

    const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);

    const hour = now.getHours();
    let allowedMeals = [];
    if (hour >= 11 && hour < 15) allowedMeals.push('lunch');
    if (hour >= 18) allowedMeals.push('dinner');

    // ✅ Only active orders
    const orders = await Order.find({
      guest: user._id,
      expireAt: { $gte: today },
      status: 'active'
    }).populate('vender');

    const messages = [];

    for (const order of orders) {
      if (!order.vender) continue;

      const mealsDoc = await Meals.findOne({ vendor: order.vender._id });
      if (!mealsDoc) continue;

      const todayTime = today.getTime();
      let start, end, inRange = false;

      if (order.subscription_model === 'Per Day') {
        start = new Date(order.startingDate).getTime();
        end = new Date(order.endingDate).getTime();
        inRange = todayTime >= start && todayTime <= end;
      } else if (order.subscription_model === 'Per Month') {
        start = new Date(order.startingDate).getTime();
        end = new Date(order.expireAt).getTime();
        inRange = todayTime >= start && todayTime <= end;
      }
      if (!inRange) continue;

      let orderTypes = Array.isArray(order.time_type) && order.time_type.length
        ? order.time_type.map(t => t.toLowerCase())
        : ['lunch', 'dinner'];
      const activeMeals = orderTypes.filter(t => allowedMeals.includes(t));
      if (!activeMeals.length) continue;

      const dayName = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

      for (const type of activeMeals) {
        const mealForDay = mealsDoc.meals?.[dayName]?.[type];
        if (!mealForDay || !mealForDay.items?.length) continue;

        const mealNames = mealForDay.items.join(', ');
        const messageText = `Your ${type} for today: ${mealNames}`;

        try {
          // ✅ Save message (if not already present)
          const savedMsg = await Message.findOneAndUpdate(
            {
              guest: user._id,
              vendorId: order.vender._id,
              mealDate: today,
              mealType: type
            },
            {
              $setOnInsert: {
                guest: user._id,
                vendorId: order.vender._id,
                message: messageText,
                mealType: type,
                mealDate: today,
                createdAt: new Date(),
                expiresAt: order.expireAt
              }
            },
            { upsert: true, new: true }
          ).populate('vendorId', 'Name firstName');

          // ✅ Push message to array (for UI)
          messages.push({
            message: savedMsg.message,
            vendorName: savedMsg.vendorId?.Name || savedMsg.vendorId?.firstName || 'Vendor',
            mealType: savedMsg.mealType,
            mealDate: savedMsg.mealDate
          });

          // 🛑 Removed email sending functionality
          // No more sendEmail() here

        } catch (err) {
          console.error('Meal message saving error:', err);
        }
      }
    }

    res.render('./store/message', {
      title: 'Messages',
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      messages,
      currentPage: 'message',
      hasOrders
    });
  } catch (err) {
    console.error('Error in getMessage:', err);
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

  try {
    // 🔹 CASE 1: Location update form posted
    if (req.body.location && req.body.lat && req.body.lng) {
      const { location, lat, lng } = req.body;

      await User.findByIdAndUpdate(userId, { location, lat, lng });

      // update session so next page load sees new data
      req.session.user.location = location;
      req.session.user.lat = lat;
      req.session.user.lng = lng;

      // if you want JSON (AJAX):
      // return res.json({ success: true });

      return res.redirect('/'); // if standard form post
    }

    // 🔹 CASE 2: Theme update form posted
    if (typeof req.body.theme !== 'undefined') {
      const themeValue = req.body.theme === 'true'; // convert to boolean

      await User.findByIdAndUpdate(userId, { theme: themeValue });
      req.session.user.theme = themeValue;

      return res.redirect('/');
    }

    // 🔹 CASE 3: Unknown form post
    return res.status(400).send('Invalid form submission');
  } catch (err) {
    console.error('Error in postHomePage:', err);
    res.status(500).send('Internal Server Error');
  }
};


exports.deleteProfilePicture = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (!user.profilePicturePublicId)
      return res.status(400).json({ success: false, message: "No profile picture to delete" });

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(user.profilePicturePublicId);

    // Remove from database
    user.profilePicture = "";
    user.profilePicturePublicId = "";
    await user.save();

    res.json({ success: true, message: "Profile picture deleted" });
  } catch (err) {
    console.error("Error deleting profile picture:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};


exports.deleteBannerPicture = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });

    if (!user.bannerImagePublicId)
      return res.status(400).json({ success: false, message: "No banner image to delete" });

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(user.bannerImagePublicId);

    // Remove from database
    user.bannerImage = "";
    user.bannerImagePublicId = "";
    await user.save();

    res.json({ success: true, message: "Banner image deleted" });
  } catch (err) {
    console.error("Error deleting banner image:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
};

exports.getReferral = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const user = await User.findById(req.session.user._id);
    const hasOrders = await Order.exists({ guest: req.session.user._id });

    res.render('./store/referral', {
      title: "Referral Program",
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      referralCode: user.referralCode || '',
      currentPage: 'referral',
      hasOrders
    });
  } catch (err) {
    console.error('Error loading referral page:', err);
    req.flash('error', 'Could not load referral page');
    res.redirect(req.get('Referrer') || '/');
  }
};

exports.developer= async (req, res) => {
  res.render('./store/developer', {
    title: "Developer Page",
    currentPage: 'developer'
  });
}