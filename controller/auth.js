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
    .matches(/[A-Z]/).withMessage("Password must contain at least one uppercase character")
    .matches(/[0-9]/).withMessage("Password must contain at least one number")
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
    const {
      firstName, lastName, dob, email, password, userType,
      location, lat, lng, serviceName, serviceRadius,
      pricePerDay, pricePerMonth
    } = req.body;

    const dobString = new Date(dob).toISOString().split('T')[0];
    const editing = req.query.editing === 'true';
    const errors = validationResult(req);

    if (!errors.isEmpty()) {
      return res.status(422).render('store/signup', {
        title: "Sign-Up",
        isLogedIn: false,
        errorMessage: errors.array().map(err => err.msg),
        oldInput: {
          firstName,
          lastName,
          dob: dobString,
          email,
          password,
          userType,
          location,
          lat,
          lng,
          serviceName,
          serviceRadius,
          pricePerDay,
          pricePerMonth
        },
        editing,
        user: {}
      });
    }

    try {
      const files = req.files;
      let profilePictureUrl = '';
      let profilePicturePublicId = '';
      let bannerImageUrl = '';
      let bannerImagePublicId = '';

      // ✅ Upload profile picture
      if (files?.profilePicture && files.profilePicture.length > 0) {
        const profilePictureBuffer = files.profilePicture[0].buffer;
        const profilePictureResult = await fileUploadInCloudinary(profilePictureBuffer);
        profilePictureUrl = profilePictureResult.secure_url;
        profilePicturePublicId = profilePictureResult.public_id;
      }

      // ✅ Upload banner image (vendor only)
      if (userType === 'vender' && files?.bannerImage && files.bannerImage.length > 0) {
        const bannerBuffer = files.bannerImage[0].buffer;
        const bannerResult = await fileUploadInCloudinary(bannerBuffer);
        bannerImageUrl = bannerResult.secure_url;
        bannerImagePublicId = bannerResult.public_id;
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

      return res.redirect('/');
    } catch (err) {
      console.log("Signup Error:", err.message);
      return res.status(422).render('store/signup', {
        title: "Sign-Up",
        isLogedIn: false,
        errorMessage: [err.message],
        oldInput: {
          firstName,
          lastName,
          dob: dobString,
          email,
          password,
          userType,
          location,
          lat,
          lng,
          serviceName,
          serviceRadius,
          pricePerDay,
          pricePerMonth
        },
        editing,
        user: {}
      });
    }
  }
];


// GET the edit profile form
exports.getEditPage = async (req, res) => {
  const editing = req.query.editing === 'true';

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send('User not found');

    const vendorCount = await User.countDocuments({ userType: 'vender' });

    // Convert dob to YYYY-MM-DD for input
    const dobString = user.dob ? new Date(user.dob).toISOString().split("T")[0] : "";

    res.render('./store/signup', {
      title: "Edit Profile",
      isLogedIn: req.isLogedIn,
      editing,
      vendorExists: vendorCount > 0,
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
        pricePerMonth: user.userType === "vender" ? (user.pricePerMonth || "") : ""
      },
      errors: {}
    });
  } catch (err) {
    console.error('❌ Error fetching user or vendor count:', err);
    res.status(500).send('Error fetching user');
  }
};

// POST updated profile
exports.postEditPage = async (req, res) => {
  const {
    firstName,
    lastName,
    dob,
    email,
    password,
    confirmPassword,
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
    const user = await User.findById(id);
    if (!user) return res.status(404).send("User not found");

    // Build oldInput for re-render (always take current db values if empty)
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
      pricePerMonth: pricePerMonth || user.pricePerMonth || ""
    };

    // ✅ Profile picture update
    if (files?.profilePicture?.length > 0) {
      if (user.profilePicturePublicId) {
        await cloudinary.uploader.destroy(user.profilePicturePublicId).catch(err => console.warn(err.message));
      }
      const profileResult = await fileUploadInCloudinary(files.profilePicture[0].buffer);
      user.profilePicture = profileResult.secure_url;
      user.profilePicturePublicId = profileResult.public_id;
    }

    // ✅ Banner image update (vendor only)
    if (user.userType === "vender" && files?.bannerImage?.length > 0) {
      if (user.bannerImagePublicId) {
        await cloudinary.uploader.destroy(user.bannerImagePublicId).catch(err => console.warn(err.message));
      }
      const bannerResult = await fileUploadInCloudinary(files.bannerImage[0].buffer);
      user.bannerImage = bannerResult.secure_url;
      user.bannerImagePublicId = bannerResult.public_id;
    }

    // ✅ Update common fields
    user.firstName = firstName || user.firstName || "";
    user.lastName = lastName || user.lastName || "";
    user.dob = dob || user.dob || "";
    user.email = email || user.email || "";
    user.location = location || user.location || "";
    user.lat = lat || user.lat || "";
    user.lng = lng || user.lng || "";

    // ✅ Update password only if provided
    if (password && password.trim() !== "") {
      if (password !== confirmPassword) {
        return res.status(400).render('./store/signup', {
          title: "Edit Profile",
          isLogedIn: req.isLogedIn,
          editing: true,
          user,
          oldInput,
          errors: { password: "Passwords do not match." }
        });
      }
      const hashedPassword = await bcrypt.hash(password, 12);
      user.password = hashedPassword;
    }

    // ✅ Vendor-only fields
    if (user.userType === "vender") {
      user.serviceName = serviceName || user.serviceName || "";
      user.serviceRadius = serviceRadius || user.serviceRadius || "";
      user.pricePerDay = pricePerDay || user.pricePerDay || "";
      user.pricePerMonth = pricePerMonth || user.pricePerMonth || "";
    }

    await user.save();

    // ✅ Update session if editing self
    if (req.session.user && req.session.user._id === user._id.toString()) {
      req.session.user = user;
      await req.session.save();
    }

    res.redirect('/');
  } catch (err) {
    console.error('❌ Error updating user:', err);

    const user = await User.findById(req.body.id);
    const vendorCount = await User.countDocuments({ userType: 'vender' });

    // Re-render the edit page with oldInput in case of error
    res.status(500).render('./store/signup', {
      title: "Edit Profile",
      isLogedIn: req.isLogedIn,
      editing: true,
      vendorExists: vendorCount > 0,
      user,
      oldInput,
      errors: { general: "Something went wrong. Please try again." }
    });
  }
};

// GET the signup page
exports.getSignUpPage = async (req, res, next) => {
  const editing = req.query.editing === 'true';
  const { firstName, lastName, dob, email, password, userType } = req.body;

  const dobString = dob ? new Date(dob).toISOString().split('T')[0] : '';

  try {
    // ✅ Check if a vendor already exists
    const vendorCount = await User.countDocuments({ userType: 'vender' });

    res.render('./store/signup', {
      title: "Sign-UP Page",
      isLogedIn: req.isLogedIn,
      editing,
      vendorExists: vendorCount > 0, // ✅ important
      oldInput: {
        firstName,
        lastName,
        dob: dobString,
        email,
        password,
        userType
      }
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

    // 1. Fetch all vendors owned by user
    const userVenders = await vender.find({ vender: user._id });

    // 2. Delete Cloudinary images and related collections for each vendor
    for (const v of userVenders) {
      const promises = [];

      if (v.imagePublicId) promises.push(cloudinary.uploader.destroy(v.imagePublicId));
      if (v.MenuimagePublicId) promises.push(cloudinary.uploader.destroy(v.MenuimagePublicId));
      await Promise.all(promises);

      await Orders.deleteMany({ vender: v._id });
      await venderOptions.deleteMany({ vendorId: v._id });
      await userOptions.deleteMany({ vendor: v._id });
      await message.deleteMany({ vendorId: v._id });

      await vender.findByIdAndDelete(v._id);
    }

    // 3. Remove this user's ID from all users' `booked` arrays
    await User.updateMany({}, { $pull: { booked: { $in: userVenders.map(v => v._id) } } });

    // 4. Delete all user-related records
    await Orders.deleteMany({ guest: user._id });
    await message.deleteMany({ guestId: user._id });
    await venderOptions.deleteMany({ guest: user._id });
    await userOptions.deleteMany({ guest: user._id });

    if (user.profilePicturePublicId) {
      await cloudinary.uploader.destroy(user.profilePicturePublicId).catch(err => {
        console.warn("Error deleting profile image:", err.message);
      });
    }

    // 5. Delete the user
    await User.findByIdAndDelete(user._id);

    // 6. Clear session if needed
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
