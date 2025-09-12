const { check,body, validationResult } = require("express-validator");
const User = require("../models/user");
const vender = require("../models/venders");
const message = require("../models/message");
const Orders = require("../models/orders");
const venderOptions = require("../models/venderOption");
const userOptions = require("../models/userOption");
const bcrypt = require("bcryptjs");
const cloudinary = require('cloudinary').v2;
const { fileUploadInCloudinary } = require('../utils/cloudinary');
exports.LoginPage = (req, res, next) => {
    // registervenders ka variable me, find() ko call karenge
    const { email, password } = req.body;
    res.render('./store/logIn', {
        title: "Log Page",
        currentPage: 'logIn',
        isLogedIn: req.isLogedIn,
        oldInput: { email, password },
        errorMessage: [],
        user: req.session.user,
    })

}
exports.PostLogin = async (req, res, next) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email })
    if (!user) {
        return res.status(422).render('./store/logIn', {
            title: "Login Page",
            isLogedIn: false,
            currentPage: 'logIn',
            errorMessage: ['Incorrect email or password'],
            oldInput: { email },
            user: {}
        })
    }
    const isMatched = await bcrypt.compare(password, user.password)
    if (!isMatched) {
        return res.status(422).render('./store/logIn', {
            title: "Login Page",
            isLogedIn: false,
            currentPage: 'logIn',
            errorMessage: ['Incorrect email or password'],
            oldInput: { email },
            user: {}
        })
    }
    req.session.isLogedIn = true;
    req.session.user = user;
    await req.session.save();
    if (user.userType === 'vender') {
        return res.redirect('/vender/meals_list')
    }
    res.redirect('/')
}
exports.PostLogout = (req, res, next) => {
    req.session.destroy(() => {
        res.redirect('/logIn')
    })

}
exports.postSignUpPage = [
  // ✅ Validations
  check('firstName')
    .notEmpty().withMessage("First name should not be empty")
    .trim().isLength({ min: 2 }).withMessage("Name should be greater than 1 character")
    .matches(/^[a-zA-Z]+$/).withMessage("Should be correct name"),

  check('lastName')
    .trim()
    .matches(/^[a-zA-Z]*$/).withMessage("Should be correct name"),

  check('dob')
    .notEmpty().withMessage("Date of birth is required")
    .isISO8601().toDate().withMessage("Invalid date format")
    .custom((dob) => {
      const minAge = 13;
      const today = new Date();
      const birthDate = new Date(dob);
      const age = today.getFullYear() - birthDate.getFullYear();
      if (age < minAge || birthDate > today) {
        throw new Error(`You must be at least ${minAge} years old`);
      }
      return true;
    }),

  check('email')
    .isEmail().withMessage("Email should be in email format")
    .normalizeEmail({ all_lowercase: false }),

  check('password')
    .isLength({ min: 6 }).withMessage("The password must be at least 6 characters")
    .trim(),

  check('confirmPassword')
    .trim()
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Passwords do not match");
      }
      return true;
    }),

  check('userType')
    .isIn(['guest', 'vender']).withMessage("Please select a valid user type"),

  // ✅ Location validation (for both)
  check('location').notEmpty().withMessage("Location is required"),
  check('lat').notEmpty().withMessage("Latitude is required"),
  check('lng').notEmpty().withMessage("Longitude is required"),

  // ✅ Vendor-only validation
  body('serviceName').if(body('userType').equals('vender'))
    .notEmpty().withMessage("Service name is required"),
  body('serviceRadius').if(body('userType').equals('vender'))
    .isNumeric().withMessage("Service radius must be a number")
    .notEmpty().withMessage("Service radius is required"),
  body('pricePerDay').if(body('userType').equals('vender'))
    .isNumeric().withMessage("Price per day must be a number")
    .notEmpty().withMessage("Price per day is required"),
  body('pricePerMonth').if(body('userType').equals('vender'))
    .isNumeric().withMessage("Price per month must be a number")
    .notEmpty().withMessage("Price per month is required"),

  check('terms')
    .custom(value => {
      if (value !== 'on') {
        throw new Error("Please accept the terms and conditions");
      }
      return true;
    }),

  // ✅ Handler
  async (req, res) => {
    console.log("---- New Signup Attempt ----");
    console.log("body:", req.body);
    console.log("files:", req.files);

    const {
      firstName, lastName, dob, email, password, confirmPassword, userType,
      location, lat, lng, serviceName, serviceRadius,
      pricePerDay, pricePerMonth,
      oldProfilePicture, oldBannerImage,
      oldProfilePicturePublicId, oldBannerImagePublicId // <== add hidden fields for IDs too
    } = req.body;

    const dobString = dob ? new Date(dob).toISOString().split('T')[0] : '';
    const editing = req.query.editing === 'true';
    const errors = validationResult(req);

    const files = req.files;

    // ✅ defaults to old values if no new file
    let profilePictureUrl = oldProfilePicture || '';
    let bannerImageUrl = oldBannerImage || '';
    let profilePicturePublicId = oldProfilePicturePublicId || '';
    let bannerImagePublicId = oldBannerImagePublicId || '';

    try {
      // ✅ Upload new profile picture only if provided
      if (files?.profilePicture && files.profilePicture.length > 0) {
        console.log("Uploading NEW profile picture to Cloudinary...");
        const profilePictureBuffer = files.profilePicture[0].buffer;
        const profilePictureResult = await fileUploadInCloudinary(profilePictureBuffer);
        profilePictureUrl = profilePictureResult.secure_url;
        profilePicturePublicId = profilePictureResult.public_id;
      }

      // ✅ Upload new banner image only if provided
      if (userType === 'vender' && files?.bannerImage && files.bannerImage.length > 0) {
        console.log("Uploading NEW banner image to Cloudinary...");
        const bannerBuffer = files.bannerImage[0].buffer;
        const bannerResult = await fileUploadInCloudinary(bannerBuffer);
        bannerImageUrl = bannerResult.secure_url;
        bannerImagePublicId = bannerResult.public_id;
      }

      // ✅ Validation error → keep old images
      if (!errors.isEmpty()) {
        const errorObject = {};
        errors.array().forEach(err => {
          errorObject[err.param] = err.msg;
        });
        console.log("Validation Errors:", errorObject);

        return res.status(422).render('store/signup', {
          title: "Sign-Up",
          isLogedIn: false,
          errorMessage: errors.array().map(err => err.msg),
          errors: errorObject,
          oldInput: {
            firstName,
            lastName,
            dob: dobString,
            email,
            password,
            confirmPassword,
            userType,
            location,
            lat,
            lng,
            serviceName,
            serviceRadius,
            pricePerDay,
            pricePerMonth,
            oldProfilePicture: profilePictureUrl,
            oldBannerImage: bannerImageUrl,
            oldProfilePicturePublicId: profilePicturePublicId,
            oldBannerImagePublicId: bannerImagePublicId
          },
          profilePicture: profilePictureUrl || null,
          bannerImage: bannerImageUrl || null,
          editing,
          user: {}
        });
      }

      // ✅ Hash password
      const hashedPassword = await bcrypt.hash(password, 8);

      // ✅ Save user
      const newUser = new User({
        profilePicture: profilePictureUrl,
        profilePicturePublicId,
        bannerImage: bannerImageUrl,
        bannerImagePublicId,
        firstName,
        lastName,
        dob: dobString,
        email,
        password: hashedPassword,
        userType,
        location,
        lat,
        lng,
        serviceName: userType === 'vender' ? serviceName : null,
        serviceRadius: userType === 'vender' ? serviceRadius : null,
        pricePerDay: userType === 'vender' ? pricePerDay : null,
        pricePerMonth: userType === 'vender' ? pricePerMonth : null,
      });

      const user = await newUser.save();
      req.session.isLogedIn = true;
      req.session.user = user;
      await req.session.save();

      console.log("Signup successful for:", email);
      return res.redirect('/');
    } catch (err) {
      console.error("Signup Error:", err);
      return res.status(422).render('store/signup', {
        title: "Sign-Up",
        isLogedIn: false,
        errorMessage: [err.message],
        errors: { general: err.message },
        oldInput: {
          firstName,
          lastName,
          dob: dobString,
          email,
          password,
          confirmPassword,
          userType,
          location,
          lat,
          lng,
          serviceName,
          serviceRadius,
          pricePerDay,
          pricePerMonth,
          oldProfilePicture: profilePictureUrl,
          oldBannerImage: bannerImageUrl,
          oldProfilePicturePublicId: profilePicturePublicId,
          oldBannerImagePublicId: bannerImagePublicId
        },
        profilePicture: profilePictureUrl || null,
        bannerImage: bannerImageUrl || null,
        editing,
        user: {}
      });
    }
  }
];


// GET the edit profile form
exports.getEditPage = async (req, res) => {
  const editing = req.query.editing === "true";

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send("User not found");

    const dobString = user.dob ? new Date(user.dob).toISOString().split("T")[0] : "";

    res.render("./store/signup", {
      title: "Edit Profile",
      isLogedIn: req.isLogedIn,
      editing,
      user,
      oldInput: {
        firstName: user.firstName || "",
        lastName: user.lastName || "",
        dob: dobString,
        email: user.email || "",
        userType: user.userType || "",
        location: user.location || "",
        lat: user.lat || "",
        lng: user.lng || "",
        serviceName: user.userType === "vender" ? (user.serviceName || "") : "",
        serviceRadius: user.userType === "vender" ? (user.serviceRadius || "") : "",
        pricePerDay: user.userType === "vender" ? (user.pricePerDay || "") : "",
        pricePerMonth: user.userType === "vender" ? (user.pricePerMonth || "") : "",
        profilePicture: user.profilePicture || "",
        profilePicturePublicId: user.profilePicturePublicId || "",
        bannerImage: user.bannerImage || "",
        bannerImagePublicId: user.bannerImagePublicId || ""
        // 🚫 no password, confirmPassword here
      },
      profilePicture: user.profilePicture || null,
      bannerImage: user.bannerImage || null,
      errors: {}
    });
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).send("Error fetching user");
  }
};
// POST the edit profile form
exports.postEditPage = async (req, res) => {
  console.log("----- POST EDIT PROFILE START -----");
  console.log("Body:", req.body);
  console.log("Files:", req.files);

  const {
    firstName,
    lastName,
    dob,
    email,
    id,
    location,
    lat,
    lng,
    serviceName,
    serviceRadius,
    pricePerDay,
    pricePerMonth
  } = req.body;

  const files = req.files;

  try {
    console.log("Looking for user with ID:", id);
    const user = await User.findById(id);
    if (!user) {
      console.log("User not found!");
      return res.status(404).send("User not found");
    }
    console.log("User found:", user.email);

    // Build oldInput (retain current DB values if no new input)
    const dobString = dob
      ? new Date(dob).toISOString().split("T")[0]
      : user.dob
      ? new Date(user.dob).toISOString().split("T")[0]
      : "";

    const oldInput = {
      firstName: firstName || user.firstName || "",
      lastName: lastName || user.lastName || "",
      dob: dobString,
      email: email || user.email || "",
      location: location || user.location || "",
      lat: lat || user.lat || "",
      lng: lng || user.lng || "",
      serviceName: serviceName || user.serviceName || "",
      serviceRadius: serviceRadius || user.serviceRadius || "",
      pricePerDay: pricePerDay || user.pricePerDay || "",
      pricePerMonth: pricePerMonth || user.pricePerMonth || "",
      profilePicture: user.profilePicture || "",
      profilePicturePublicId: user.profilePicturePublicId || "",
      bannerImage: user.bannerImage || "",
      bannerImagePublicId: user.bannerImagePublicId || ""
    };

    console.log("Old Input:", oldInput);

    // -------- Profile Picture Update --------
    if (files?.profilePicture?.length > 0) {
      console.log("Uploading new profile picture...");
      if (user.profilePicturePublicId) {
        console.log("Deleting old profile picture:", user.profilePicturePublicId);
        await cloudinary.uploader.destroy(user.profilePicturePublicId).catch(err =>
          console.warn(err.message)
        );
      }
      const profileResult = await fileUploadInCloudinary(files.profilePicture[0].buffer);
      user.profilePicture = profileResult.secure_url;
      user.profilePicturePublicId = profileResult.public_id;
      console.log("Profile picture updated:", user.profilePicture);

      oldInput.profilePicture = user.profilePicture;
      oldInput.profilePicturePublicId = user.profilePicturePublicId;
    }

    // -------- Banner Image Update (Vendor Only) --------
    if (user.userType === "vender" && files?.bannerImage?.length > 0) {
      console.log("Uploading new banner image...");
      if (user.bannerImagePublicId) {
        console.log("Deleting old banner image:", user.bannerImagePublicId);
        await cloudinary.uploader.destroy(user.bannerImagePublicId).catch(err =>
          console.warn(err.message)
        );
      }
      const bannerResult = await fileUploadInCloudinary(files.bannerImage[0].buffer);
      user.bannerImage = bannerResult.secure_url;
      user.bannerImagePublicId = bannerResult.public_id;
      console.log("Banner image updated:", user.bannerImage);

      oldInput.bannerImage = user.bannerImage;
      oldInput.bannerImagePublicId = user.bannerImagePublicId;
    }

    // -------- Update Common Fields --------
    user.firstName = firstName || user.firstName || "";
    user.lastName = lastName || user.lastName || "";
    user.dob = dob || user.dob || "";
    user.email = email || user.email || "";
    user.location = location || user.location || "";
    user.lat = lat || user.lat || "";
    user.lng = lng || user.lng || "";

    // ❌ No password update here anymore

    // -------- Vendor-Only Fields --------
    if (user.userType === "vender") {
      user.serviceName = serviceName || user.serviceName || "";
      user.serviceRadius = serviceRadius || user.serviceRadius || "";
      user.pricePerDay = pricePerDay || user.pricePerDay || "";
      user.pricePerMonth = pricePerMonth || user.pricePerMonth || "";
    }

    await user.save();
    console.log("User updated successfully.");

    // -------- Update Session --------
    if (req.session.user && req.session.user._id === user._id.toString()) {
      req.session.user = user;
      await req.session.save();
      console.log("Session updated.");
    }

    console.log("Redirecting to home page...");
    res.redirect("/");
  } catch (err) {
    console.error("❌ Error updating user:", err);

    const user = await User.findById(req.body.id);

    res.status(500).render("./store/signup", {
      title: "Edit Profile",
      isLogedIn: req.isLogedIn,
      editing: true,
      user,
      oldInput,
      errors: { general: "Something went wrong. Please try again." }
    });
  }
};

// GET the signup page
exports.getSignUpPage = async (req, res, next) => {
  const editing = req.query.editing === 'true';
  const { firstName, lastName, location, dob, email, password, userType } = req.body;

  const dobString = dob ? new Date(dob).toISOString().split('T')[0] : '';

  try {

    res.render('./store/signup', {
      title: "Sign-UP Page",
      isLogedIn: req.isLogedIn,
      editing,
      errors: {},
      user:{},
      oldInput: {
        firstName,
        lastName,
        location,
        dob: dobString,
        email,
        password,
        userType
      },
      profilePicture: null,  // ✅ added
      bannerImage: null      // ✅ added
    });

  } catch (err) {
    console.error('❌ Error checking vendor count for signup:', err);
    res.status(500).send('Server error');
  }
};

exports.deleteUserPage = async (req, res) => {
    const userId = req.params.id;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).send('User not found');
        const { email, password } = req.body;

        res.render('./store/delete', {
            title: "Delete Page",
            isLogedIn: req.isLogedIn,
            oldInput: { email, password },
            errorMessage: [],
            user: req.session.user,
        });
    } catch (err) {
        res.status(500).send('Error fetching user');
    }
};
exports.deleteUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    console.log('PROFILE PIC ID:', user.profilePicturePublicId);

    if (!user) return res.status(404).send('User not found');

    const isMatched = await bcrypt.compare(password, user.password);
    if (!isMatched) {
      return res.status(401).render('./store/delete', {
        title: "Delete Page",
        isLogedIn: req.isLogedIn,
        errorMessage: ['Incorrect password'],
        oldInput: { email },
        user: req.session.user
      });
    }

    // 1️⃣ Fetch all vendors owned by user
    const userVenders = await vender.find({ vender: user._id });

    // 2️⃣ Delete Cloudinary images and related collections for each vendor
    for (const v of userVenders) {
      const vendorDeletePromises = [];

      // main image
      if (v.imagePublicId) {
        vendorDeletePromises.push(
          cloudinary.uploader.destroy(v.imagePublicId)
            .then(r => console.log(`Vendor ${v._id} main image deleted:`, r))
            .catch(err => console.warn(`Error deleting vendor main image:`, err.message))
        );
      }

      // menu image
      if (v.MenuimagePublicId) {
        vendorDeletePromises.push(
          cloudinary.uploader.destroy(v.MenuimagePublicId)
            .then(r => console.log(`Vendor ${v._id} menu image deleted:`, r))
            .catch(err => console.warn(`Error deleting vendor menu image:`, err.message))
        );
      }

      // banner image (if you store it)
      if (v.bannerImagePublicId) {
        vendorDeletePromises.push(
          cloudinary.uploader.destroy(v.bannerImagePublicId)
            .then(r => console.log(`Vendor ${v._id} banner image deleted:`, r))
            .catch(err => console.warn(`Error deleting vendor banner image:`, err.message))
        );
      }

      await Promise.all(vendorDeletePromises);

      // delete all related docs for this vendor
      await Orders.deleteMany({ vender: v._id });
      await venderOptions.deleteMany({ vendorId: v._id });
      await userOptions.deleteMany({ vendor: v._id });
      await message.deleteMany({ vendorId: v._id });

      await vender.findByIdAndDelete(v._id);
    }

    // 3️⃣ Remove this user's ID from all users' booked arrays
    await User.updateMany(
      {},
      { $pull: { booked: { $in: userVenders.map(v => v._id) } } }
    );

    // 4️⃣ Delete all user-related records
    await Orders.deleteMany({ guest: user._id });
    await message.deleteMany({ guestId: user._id });
    await venderOptions.deleteMany({ guest: user._id });
    await userOptions.deleteMany({ guest: user._id });

    // 5️⃣ Delete user images from Cloudinary
    const userDeletePromises = [];
    if (user.profilePicturePublicId) {
      userDeletePromises.push(
        cloudinary.uploader.destroy(user.profilePicturePublicId)
          .then(r => console.log(`User profile image deleted:`, r))
          .catch(err => console.warn("Error deleting user profile image:", err.message))
      );
    }
    if (user.bannerImagePublicId) {
      userDeletePromises.push(
        cloudinary.uploader.destroy(user.bannerImagePublicId)
          .then(r => console.log(`User banner image deleted:`, r))
          .catch(err => console.warn("Error deleting user banner image:", err.message))
      );
    }
    await Promise.all(userDeletePromises);

    // 6️⃣ Delete the user itself
    await User.findByIdAndDelete(user._id);

    // 7️⃣ Clear session if needed
    if (req.session.user && req.session.user._id.toString() === user._id.toString()) {
      req.session.destroy(err => {
        if (err) {
          console.error('❌ Session destruction error:', err);
          return res.redirect('/');
        }
        return res.redirect('/logIn');
      });
    } else {
      return res.redirect('/');
    }

  } catch (err) {
    console.error('❌ Delete Error:', err);
    return res.status(500).send('Error deleting user');
  }
};
