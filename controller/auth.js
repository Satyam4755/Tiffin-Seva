const { check, body, validationResult } = require("express-validator");
const User = require("../models/user");
const vender = require("../models/venders");
const message = require("../models/message");
const Orders = require("../models/orders");
const venderOptions = require("../models/venderOption");
const userOptions = require("../models/userOption");
const bcrypt = require("bcryptjs");
const cloudinary = require('cloudinary').v2;
const { fileUploadInCloudinary } = require('../utils/cloudinary')
  ; const Admin = require("../models/Admin");
const { v4: uuidv4 } = require("uuid"); // for generating unique session IDs

const streamifier = require('streamifier');
const SibApiV3Sdk = require('sib-api-v3-sdk');


// Helper to generate a 6-character alphanumeric referral code
const generateReferralCode = async () => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code;
  let exists = true;

  while (exists) {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    // Check uniqueness in DB
    exists = await User.findOne({ referralCode: code });
  }
  return code;
};

// Initialize Brevo client
const client = SibApiV3Sdk.ApiClient.instance;
const apiKey = client.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;

const tranEmailApi = new SibApiV3Sdk.TransactionalEmailsApi();

require('dotenv').config();
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
    hasOrders: false,
    hasVendorOrders: false,
  })

}
exports.PostLogin = async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(422).render('./store/logIn', {
        title: "Login Page",
        isLogedIn: false,
        currentPage: 'logIn',
        errorMessage: ['Incorrect email or password'],
        oldInput: { email },
        user: {}
      });
    }

    const isMatched = await bcrypt.compare(password, user.password);
    if (!isMatched) {
      return res.status(422).render('./store/logIn', {
        title: "Login Page",
        isLogedIn: false,
        currentPage: 'logIn',
        errorMessage: ['Incorrect email or password'],
        oldInput: { email },
        user: {}
      });
    }

    // ✅ Set session
    req.session.isLogedIn = true;
    req.session.user = user;

    // ✅ Save session first, then redirect
    req.session.save(err => {
      if (err) {
        console.error("Session save error:", err);
        return res.status(500).render('./store/logIn', {
          title: "Login Page",
          isLogedIn: false,
          currentPage: 'logIn',
          errorMessage: ['Something went wrong. Please try again.'],
          oldInput: { email },
          user: {}
        });
      }

      // ✅ Redirect based on user type
      if (user.userType === 'vender') {
        return res.redirect('/'); // vendor dashboard
      } else {
        return res.redirect('/'); // normal user home
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    return res.status(500).render('./store/logIn', {
      title: "Login Page",
      isLogedIn: false,
      currentPage: 'logIn',
      errorMessage: ['Something went wrong. Please try again.'],
      oldInput: { email },
      user: {}
    });
  }
};
exports.PostLogout = (req, res, next) => {
  req.session.destroy(() => {
    res.redirect('/logIn')
  })

}



// ====================== CUSTOMER SIGNUP ======================
exports.getCustomerSignUpPage = (req, res) => {

  res.render('./store/signup_customer', {
    title: "Customer Sign-Up",
    isLogedIn: req.isLogedIn,
    errorMessage: {},
    oldInput: {},
    profilePicture: null,
    profilePicturePublicId: null,
    editing: null,
    currentPage: 'signup-customer',
    user: "",
    skipOtpStage: false,
    hasOrders: false,
    hasVendorOrders: false,
  });
};

exports.postCustomerSignUp = [
  // ========== Validation ==========
  check('firstName')
    .notEmpty().withMessage("Full name is required")
    .matches(/^[A-Za-z\s]+$/).withMessage("Name must contain only letters and spaces"),
  check('dob').notEmpty().withMessage("Date of birth required").isISO8601().toDate(),
  check('email').isEmail().withMessage("Valid email required"),
  check('password').isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  check('confirmPassword').custom((value, { req }) => {
    if (value !== req.body.password) throw new Error("Passwords do not match");
    return true;
  }),
  check('location').notEmpty().withMessage("Location required"),
  check('lat').notEmpty().withMessage("Latitude required"),
  check('lng').notEmpty().withMessage("Longitude required"),

  // ========== Controller ==========
  async (req, res) => {
    const errors = validationResult(req);
    const { firstName, dob, email, password, location, lat, lng, referralCode: inputReferralCode } = req.body;

    // Reusable dob string formatting
    let dobString = '';
    if (req.body.dob) {
      const dobDate = new Date(req.body.dob);
      if (!isNaN(dobDate)) dobString = dobDate.toISOString().split("T")[0];
    }

    if (!errors.isEmpty()) {
      const errorArray = Object.values(errors.mapped()).map(err => err.msg);

      return res.status(422).render('./store/signup_customer', {
        title: "Customer Sign-Up",
        isLogedIn: false,
        errorMessage: errorArray,
        oldInput: { ...req.body, dob: dobString },
        profilePicture: null,
        profilePicturePublicId: null,
        editing: null,
        user: "",
        currentPage: 'signup-customer',
        skipOtpStage: !!req.body.email
      });
    }

    try {
      // ✅ File size limit
      const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10 MB

      // ✅ Check profile picture size before uploading
      if (req.files?.profilePicture?.length > 0) {
        const profilePic = req.files.profilePicture[0];
        if (profilePic.size > MAX_IMAGE_SIZE) {
          return res.status(422).render('./store/signup_customer', {
            title: "Customer Sign-Up",
            isLogedIn: false,
            errorMessage: ["Profile picture must be less than 10 MB."],
            oldInput: { ...req.body, dob: dobString },
            profilePicture: null,
            profilePicturePublicId: null,
            editing: null,
            user: "",
            currentPage: 'signup-customer',
            skipOtpStage: !!req.body.email
          });
        }
      }

      // ✅ Upload Profile Picture
      let profilePictureUrl = '';
      let profilePicturePublicId = '';
      if (req.files?.profilePicture?.length > 0) {
        const result = await fileUploadInCloudinary(req.files.profilePicture[0].buffer);
        profilePictureUrl = result.secure_url;
        profilePicturePublicId = result.public_id;
      }

      const hashedPassword = await bcrypt.hash(password, 8);

      // ✅ Generate Unique Referral Code
      const newReferralCode = await generateReferralCode();

      // ✅ Check Referral Code Validity
      let welcomeOffer = { amount: 0, isUsed: false };
      let referredBy = null;

      if (inputReferralCode && inputReferralCode.trim() !== "") {
        const referrer = await User.findOne({ referralCode: inputReferralCode.trim() });

        if (referrer) {
          // ✅ Valid referral code → Give ₹100 welcome offer
          welcomeOffer = { amount: 100, isUsed: false };
          referredBy = inputReferralCode.trim();
          console.log(`🎁 Valid referral used! Offer applied for ${email}`);
        } else {
          console.warn(`⚠️ Invalid referral code entered by ${email}: ${inputReferralCode}`);
        }
      }

      // ✅ Create new guest user
      const newUser = new User({
        profilePicture: profilePictureUrl,
        profilePicturePublicId,
        firstName,
        dob,
        email,
        password: hashedPassword,
        userType: 'guest',
        location,
        lat,
        lng,
        serviceArea: null,
        welcomeOffer,
        referralCode: newReferralCode,
        referredBy,
        referralUsed: false
      });

      const user = await newUser.save();

      // ✅ Set Session
      req.session.user = {
        _id: user._id,
        firstName: user.firstName,
        email: user.email,
        userType: user.userType,
        location: user.location,
        lat: user.lat,
        lng: user.lng
      };
      req.session.isLogedIn = true;
      req.session.showWelcomeOffer = user.welcomeOffer.amount > 0;
      await req.session.save();

      res.redirect('/');
    } catch (err) {
      console.error("❌ Customer signup error:", err);
      return res.status(500).render('./store/signup_customer', {
        title: "Customer Sign-Up",
        isLogedIn: false,
        errorMessage: [err.message],
        oldInput: req.body,
        profilePicture: null,
        profilePicturePublicId: null,
        editing: null,
        user: "",
        currentPage: 'signup-customer',
        skipOtpStage: !!req.body.email
      });
    }
  }
];


// ====================== VENDOR SIGNUP ======================
exports.getVendorSignUpPage = (req, res) => {
  res.render('./store/signup_vendor', {
    title: "Vendor Sign-Up",
    isLogedIn: req.isLogedIn,
    errorMessage: {},
    oldInput: {},
    profilePicture: null,
    bannerImage: null,
    editing: null,
    user: "",
    currentPage: 'signup-vendor',
    skipOtpStage: false,

    // ✅ Prevent EJS ReferenceError
    profilePictureUrl: "",
    profilePicturePublicId: "",
    bannerImageUrl: "",
    bannerImagePublicId: "",
    fssaiUrl: "",
    fssaiPublicId: "",
    hasOrders: false,
    hasVendorOrders: false,
  });
};

// ✅ Upload file (image/pdf) to Cloudinary
async function uploadFileToCloudinary(buffer, mimetype) {
  return new Promise((resolve, reject) => {
    const options = {
      folder: "aadhaar_cards",
      resource_type: mimetype.includes("pdf") ? "raw" : "image",
    };
    const uploadStream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
}


// ✅ Helper for consistent re-rendering
function getVendorRenderData(req, extra = {}) {
  return {
    title: "Vendor Sign-Up",
    isLogedIn: false,
    errorMessage: extra.errorMessage || [],
    oldInput: {
      ...req.body,
      aadhaarCard: {
        url: extra.aadhaarUrl || req.body.aadhaarUrl || "",
        publicId: extra.aadhaarPublicId || req.body.aadhaarPublicId || "",
      },
      serviceArea: req.body.serviceArea || "",
    },
    profilePictureUrl:
      extra.profilePictureUrl || req.body.profilePictureUrl || "",
    profilePicturePublicId:
      extra.profilePicturePublicId || req.body.profilePicturePublicId || "",
    bannerImageUrl: extra.bannerImageUrl || req.body.bannerImageUrl || "",
    bannerImagePublicId:
      extra.bannerImagePublicId || req.body.bannerImagePublicId || "",
    aadhaarUrl: extra.aadhaarUrl || req.body.aadhaarUrl || "",
    aadhaarPublicId: extra.aadhaarPublicId || req.body.aadhaarPublicId || "",
    editing: null,
    user: "",
    currentPage: "signup-vendor",
    skipOtpStage: !!req.body.email,
  };
}

exports.postVendorSignUp = [
  // ✅ Validations
  check("firstName")
    .trim()
    .notEmpty().withMessage("Full name is required.")
    .matches(/^[a-zA-Z\s]+$/).withMessage("Full name must contain only alphabets and spaces."),

  check("email")
    .notEmpty().withMessage("Email is required.")
    .isEmail().withMessage("Please enter a valid email address."),

  check("password")
    .notEmpty().withMessage("Password is required.")
    .isLength({ min: 6 }).withMessage("Password must be at least 6 characters long."),

  check("confirmPassword").custom((v, { req }) => {
    if (v !== req.body.password) throw new Error("Passwords do not match.");
    return true;
  }),

  check("location").notEmpty().withMessage("Location is required."),
  check("lat").notEmpty().withMessage("Latitude is required."),
  check("lng").notEmpty().withMessage("Longitude is required."),

  check("serviceName")
    .trim()
    .notEmpty().withMessage("Service name is required.")
    .matches(/^[a-zA-Z0-9\s&\-\.,]+$/).withMessage("Service name may contain letters, numbers, and spaces only."),

  check("deliveryRadius")
    .notEmpty().withMessage("Delivery radius is required.")
    .isNumeric().withMessage("Delivery radius must be a number (KM)."),

  check("limitNorth").optional().isNumeric(),
  check("limitSouth").optional().isNumeric(),
  check("limitEast").optional().isNumeric(),
  check("limitWest").optional().isNumeric(),

  check("pricePerDay")
    .notEmpty().withMessage("Price per day is required.")
    .isNumeric().withMessage("Price per day must be a number."),

  check("pricePerMonthSingle")
    .notEmpty().withMessage("Price per month (single meal) is required.")
    .isNumeric().withMessage("Price per month (single meal) must be a number."),

  check("pricePerMonthBoth")
    .notEmpty().withMessage("Price per month (both meals) is required.")
    .isNumeric().withMessage("Price per month (both meals) must be a number."),

  // ✅ Phone number (still required)
  check("phoneNumber")
    .notEmpty().withMessage("Phone number is required.")
    .isNumeric().withMessage("Phone number must be numeric.")
    .isLength({ min: 10, max: 10 }).withMessage("Phone number must be exactly 10 digits."),

  // ✅ Optional bank fields (validate only if provided)
  check("bankAccountNumber")
    .optional({ checkFalsy: true })
    .isNumeric().withMessage("Bank account number must be numeric."),

  check("bankIFSC")
    .optional({ checkFalsy: true })
    .matches(/^[A-Z]{4}0[A-Z0-9]{6}$/).withMessage("Enter a valid IFSC code."),

  check("bankName")
    .optional({ checkFalsy: true })
    .matches(/^[a-zA-Z\s]+$/).withMessage("Bank name must contain only alphabets and spaces."),

  check("accountHolderName")
    .optional({ checkFalsy: true })
    .matches(/^[a-zA-Z\s]+$/).withMessage("Account holder name must contain only alphabets and spaces."),

  // ✅ Main Logic
  async (req, res) => {
    const errors = validationResult(req);
    const {
      firstName, email, password,
      serviceName,
      pricePerDay, pricePerMonthSingle, pricePerMonthBoth,
      bankAccountNumber, bankIFSC, phoneNumber, bankName, accountHolderName,
      deliveryRadius, limitNorth, limitSouth, limitEast, limitWest
    } = req.body;

    // 🧾 File placeholders
    let profilePictureUrl = req.body.profilePictureUrl || "";
    let bannerImageUrl = req.body.bannerImageUrl || "";
    let profilePicturePublicId = req.body.profilePicturePublicId || "";
    let bannerImagePublicId = req.body.bannerImagePublicId || "";
    let aadhaarUrl = req.body.aadhaarUrl || "";
    let aadhaarPublicId = req.body.aadhaarPublicId || "";
    let aadhaarNumber = "";
    let aadhaarVerified = false;

    // 🛑 Validation errors
    if (!errors.isEmpty()) {
      const formattedErrors = Object.values(errors.mapped()).map(e =>
        e.msg && e.msg !== "Invalid value" ? e.msg : "Please check all input fields carefully."
      );

      return res.status(422).render(
        "./store/signup_vendor",
        getVendorRenderData(req, {
          errorMessage: formattedErrors,
          profilePictureUrl,
          profilePicturePublicId,
          bannerImageUrl,
          bannerImagePublicId,
          aadhaarUrl,
          aadhaarPublicId,
        })
      );
    }

    try {
      const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

      // ✅ Upload Profile Picture
      if (req.files?.profilePicture?.length > 0) {
        const file = req.files.profilePicture[0];
        if (file.size > MAX_SIZE)
          throw new Error("Profile picture must be less than 10 MB.");
        const result = await uploadFileToCloudinary(file.buffer, file.mimetype);
        profilePictureUrl = result.secure_url;
        profilePicturePublicId = result.public_id;
      }

      // ✅ Upload Banner Image
      if (req.files?.bannerImage?.length > 0) {
        const file = req.files.bannerImage[0];
        if (file.size > MAX_SIZE)
          throw new Error("Banner image must be less than 10 MB.");
        const result = await uploadFileToCloudinary(file.buffer, file.mimetype);
        bannerImageUrl = result.secure_url;
        bannerImagePublicId = result.public_id;
      }

      // ✅ Aadhaar Upload (NO CHECKING, JUST UPLOAD)
      if (req.files?.aadhaarCard?.length > 0) {
        const aadhaarFile = req.files.aadhaarCard[0];

        if (aadhaarFile.size > MAX_SIZE) {
          throw new Error("Aadhaar file must be less than 10 MB.");
        }

        // Allow image + pdf
        const uploadResult = await uploadFileToCloudinary(
          aadhaarFile.buffer,
          aadhaarFile.mimetype
        );

        aadhaarUrl = uploadResult.secure_url;
        aadhaarPublicId = uploadResult.public_id;
        aadhaarVerified = false; // manual verification later
      } else if (!aadhaarUrl) {
        throw new Error("Aadhaar document upload is required.");
      }

      // ✅ Service Area (Polygon) is no longer used, but we keep DB compatible
      let parsedArea = { type: "Polygon", coordinates: [] };

      // ✅ Hash password
      const hashedPassword = await bcrypt.hash(password, 8);

      // ✅ Create vendor
      const newUser = new User({
        profilePicture: profilePictureUrl,
        profilePicturePublicId,
        bannerImage: bannerImageUrl,
        bannerImagePublicId,
        firstName,
        email,
        password: hashedPassword,
        userType: "vender",
        location,
        lat,
        lng,
        serviceName,
        serviceArea: parsedArea,
        deliveryRadius: deliveryRadius || 0,
        limitNorth: limitNorth || 0,
        limitSouth: limitSouth || 0,
        limitEast: limitEast || 0,
        limitWest: limitWest || 0,
        pricePerDay,
        pricePerMonthSingle,
        pricePerMonthBoth,
        bankAccountNumber: bankAccountNumber || null,
        bankIFSC: bankIFSC || null,
        phoneNumber,
        bankName: bankName || null,
        accountHolderName: accountHolderName || null,
        aadhaarCard: {
          url: aadhaarUrl,
          publicId: aadhaarPublicId,
          isVerified: false,
        },
      });

      const user = await newUser.save();

      // ✅ Store session properly before redirect
      req.session.isLogedIn = true;
      req.session.user = {
        _id: user._id,
        firstName: user.firstName,
        email: user.email,
        userType: user.userType,
      };

      req.session.save((err) => {
        if (err) console.error("Session save error:", err);
        console.log("✅ Vendor registered & logged in:", user.email);
        res.redirect("/");
      });
    } catch (err) {
      console.error("❌ Vendor signup error:", err);
      return res.status(500).render(
        "./store/signup_vendor",
        getVendorRenderData(req, {
          errorMessage: [err.message || "Something went wrong. Please try again."],
          profilePictureUrl,
          profilePicturePublicId,
          bannerImageUrl,
          bannerImagePublicId,
          aadhaarUrl,
          aadhaarPublicId,
        })
      );
    }
  },
];


// ====================== EDIT PROFILE (GET) ======================
exports.getEditPage = async (req, res) => {
  const editing = req.query.editing === "true";

  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).send("User not found");

    const template =
      user.userType === "vender"
        ? "./store/signup_vendor"
        : "./store/signup_customer";

    const dobString =
      user.userType !== "vender" && user.dob
        ? new Date(user.dob).toISOString().split("T")[0]
        : "";

    res.render(template, {
      title: "Edit Profile",
      isLogedIn: req.isLogedIn,
      editing,
      user,
      currentPage: editing
        ? "edit-profile"
        : user.userType === "vender"
          ? "signup-vendor"
          : "signup-customer",
      hasOrders: false,
      hasVendorOrders: false,

      oldInput: {
        firstName: user.firstName || "",
        dob: dobString,
        email: user.email || "",
        userType: user.userType || "",
        location: user.location || "",
        lat: user.lat || "",
        lng: user.lng || "",

        // ✅ Vendor-only fields
        serviceName:
          user.userType === "vender" ? user.serviceName || "" : "",
        serviceArea:
          user.userType === "vender"
            ? JSON.stringify(user.serviceArea || { type: "Polygon", coordinates: [] })
            : "",
        pricePerDay:
          user.userType === "vender" ? user.pricePerDay || "" : "",
        pricePerMonthSingle:
          user.userType === "vender" ? user.pricePerMonthSingle || "" : "",
        pricePerMonthBoth:
          user.userType === "vender" ? user.pricePerMonthBoth || "" : "",
        profilePicture: user.profilePicture || "",
        profilePicturePublicId: user.profilePicturePublicId || "",
        bannerImage: user.bannerImage || "",
        bannerImagePublicId: user.bannerImagePublicId || "",

        // ✅ New Radius Fields (Fix: Allow 0 to be shown)
        deliveryRadius: (user.userType === "vender" && user.deliveryRadius !== undefined) ? user.deliveryRadius : "",
        limitNorth: (user.userType === "vender" && user.limitNorth !== undefined) ? user.limitNorth : "",
        limitSouth: (user.userType === "vender" && user.limitSouth !== undefined) ? user.limitSouth : "",
        limitEast: (user.userType === "vender" && user.limitEast !== undefined) ? user.limitEast : "",
        limitWest: (user.userType === "vender" && user.limitWest !== undefined) ? user.limitWest : ""
      },

      // ✅ Images and Aadhaar info
      profilePicture: user.profilePicture || null,
      bannerImage: user.bannerImage || null,
      profilePictureUrl: user.profilePicture || "",
      profilePicturePublicId: user.profilePicturePublicId || "",
      bannerImageUrl: user.bannerImage || "",
      bannerImagePublicId: user.bannerImagePublicId || "",

      // ✅ Aadhaar fields (replaces FSSAI)
      aadhaarUrl: user.aadhaarCard?.url || "",
      aadhaarPublicId: user.aadhaarCard?.publicId || "",
      aadhaarNumber: user.aadhaarCard?.aadhaarNumber || "",
      aadhaarVerified: user.aadhaarCard?.verified || false,
      errorMessage: [],
      errors: {},
      skipOtpStage: !!user.email
    });
  } catch (err) {
    console.error("❌ Error fetching user:", err);
    res.status(500).send("Error fetching user");
  }
};


// ====================== EDIT PROFILE (POST with Aadhaar) ======================
exports.postEditPage = async (req, res) => {
  const {
    firstName, dob, email, id,
    location, lat, lng, serviceName,
    pricePerDay, pricePerMonthSingle, pricePerMonthBoth,
    deliveryRadius, limitNorth, limitSouth, limitEast, limitWest
  } = req.body;

  const files = req.files;
  let oldInput = {};

  try {
    const user = await User.findById(id);
    if (!user) return res.status(404).send("User not found");

    const isVendor = user.userType === "vender";

    // ====================== PARSE SERVICE AREA ======================
    let parsedArea = null;
    try {
      parsedArea = typeof serviceArea === "string" ? JSON.parse(serviceArea) : serviceArea;
      console.log("✅ Parsed serviceArea:", JSON.stringify(parsedArea, null, 2));
    } catch (parseErr) {
      console.warn("⚠️ Failed to parse serviceArea:", parseErr.message);
    }

    const dobString = !isVendor && dob
      ? new Date(dob).toISOString().split("T")[0]
      : !isVendor && user.dob
        ? new Date(user.dob).toISOString().split("T")[0]
        : "";

    oldInput = {
      firstName: firstName || user.firstName || "",
      dob: dobString,
      email: email || user.email || "",
      location: location || user.location || "",
      lat: lat || user.lat || "",
      lng: lng || user.lng || "",
      serviceName: serviceName || user.serviceName || "",
      deliveryRadius: deliveryRadius || user.deliveryRadius || "",
      limitNorth: limitNorth || user.limitNorth || "",
      limitSouth: limitSouth || user.limitSouth || "",
      limitEast: limitEast || user.limitEast || "",
      limitWest: limitWest || user.limitWest || "",
      pricePerDay: pricePerDay || user.pricePerDay || "",
      pricePerMonthSingle: pricePerMonthSingle || user.pricePerMonthSingle || "",
      pricePerMonthBoth: pricePerMonthBoth || user.pricePerMonthBoth || "",
      profilePicture: user.profilePicture || "",
      bannerImage: user.bannerImage || "",
      aadhaarCard: user.aadhaarCard || {}
    };

    // Helper function to re-render with error
    const renderError = (message) => {
      const template = isVendor ? "./store/signup_vendor" : "./store/signup_customer";
      return res.status(400).render(template, {
        title: "Edit Profile",
        isLogedIn: req.isLogedIn,
        editing: true,
        currentPage: "edit-profile",
        profilePictureUrl: user.profilePicture || "",
        profilePicturePublicId: user.profilePicturePublicId || "",
        bannerImageUrl: user.bannerImage || "",
        bannerImagePublicId: user.bannerImagePublicId || "",
        aadhaarUrl: user.aadhaarCard?.url || "",
        aadhaarPublicId: user.aadhaarCard?.publicId || "",
        user,
        errorMessage: [message],
        oldInput,
        errors: { aadhaar: message },
        profilePicture: user?.profilePicture || null,
        bannerImage: user?.bannerImage || null,
        skipOtpStage: !!user?.email
      });
    };

    // Max file size (10 MB)
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

    // ====================== UPDATE PROFILE PICTURE ======================
    if (files?.profilePicture?.length > 0) {
      const profileFile = files.profilePicture[0];
      if (profileFile.size > MAX_IMAGE_SIZE) {
        return renderError("Profile picture size must be less than 10 MB.");
      }
      try {
        if (user.profilePicturePublicId) {
          await cloudinary.uploader.destroy(user.profilePicturePublicId);
        }
        const result = await fileUploadInCloudinary(profileFile.buffer);
        user.profilePicture = result.secure_url;
        user.profilePicturePublicId = result.public_id;
        console.log("🖼️ Profile picture updated!");
      } catch (err) {
        console.warn("⚠️ Failed to upload profile picture:", err.message);
      }
    }

    // ====================== UPDATE BANNER IMAGE ======================
    if (files?.bannerImage?.length > 0) {
      const bannerFile = files.bannerImage[0];
      if (bannerFile.size > MAX_IMAGE_SIZE) {
        return renderError("Banner image size must be less than 10 MB.");
      }
      try {
        if (user.bannerImagePublicId) {
          await cloudinary.uploader.destroy(user.bannerImagePublicId);
        }
        const result = await fileUploadInCloudinary(bannerFile.buffer);
        user.bannerImage = result.secure_url;
        user.bannerImagePublicId = result.public_id;
        console.log("🎴 Banner image updated!");
      } catch (err) {
        console.warn("⚠️ Failed to upload banner image:", err.message);
      }
    }

    // ====================== UPDATE AADHAAR CARD (SIMPLE UPLOAD) ======================
    if (isVendor && files?.aadhaarCard?.length > 0) {
      const aadhaarFile = files.aadhaarCard[0];

      if (aadhaarFile.size > MAX_IMAGE_SIZE) {
        return renderError("Aadhaar image size must be less than 10 MB.");
      }

      try {
        // 🧹 Delete old Aadhaar if exists
        if (user.aadhaarCard?.publicId) {
          await cloudinary.uploader.destroy(user.aadhaarCard.publicId);
        }

        // ⬆️ Upload new Aadhaar image
        const uploadResult = await uploadFileToCloudinary(
          aadhaarFile.buffer,
          aadhaarFile.mimetype
        );

        // 💾 Save only URL + publicId (NO verification)
        user.aadhaarCard = {
          url: uploadResult.secure_url,
          publicId: uploadResult.public_id
        };

        console.log("🪪 Aadhaar card uploaded successfully!");
      } catch (err) {
        console.warn("⚠️ Aadhaar upload failed:", err.message);
        return renderError("Failed to upload Aadhaar card. Please try again.");
      }
    }

    // ================= VENDOR-ONLY FIELDS =================
    if (isVendor) {
      user.serviceName = serviceName || user.serviceName || "";
      user.pricePerDay = pricePerDay || user.pricePerDay || "";
      user.pricePerMonthSingle = pricePerMonthSingle || user.pricePerMonthSingle || "";
      user.pricePerMonthBoth = pricePerMonthBoth || user.pricePerMonthBoth || "";

      // ✅ Update Radius & Limits
      // ✅ Update Radius & Limits (Fix: Handle 0 and updates correctly)
      // ✅ Update Radius & Limits (Fix: Force Parse Float)
      if (deliveryRadius !== undefined && deliveryRadius !== null) user.deliveryRadius = parseFloat(deliveryRadius);
      if (limitNorth !== undefined && limitNorth !== null) user.limitNorth = parseFloat(limitNorth);
      if (limitSouth !== undefined && limitSouth !== null) user.limitSouth = parseFloat(limitSouth);
      if (limitEast !== undefined && limitEast !== null) user.limitEast = parseFloat(limitEast);
      if (limitWest !== undefined && limitWest !== null) user.limitWest = parseFloat(limitWest);
    }

    // ================= GENERAL FIELDS =================
    user.firstName = firstName || user.firstName;
    if (!isVendor && dob) user.dob = dob;
    user.email = email || user.email;
    user.location = location || user.location;
    user.lat = lat || user.lat;
    user.lng = lng || user.lng;

    // ================= SAVE & UPDATE SESSION =================
    await user.save();

    if (req.session.user && req.session.user._id === user._id.toString()) {
      req.session.user = user;
      await req.session.save();
    }

    res.redirect("/");

  } catch (err) {
    console.error("❌ Error updating user:", err);

    const user = await User.findById(req.body.id);
    const isVendor = user?.userType === "vender";
    const template = isVendor ? "./store/signup_vendor" : "./store/signup_customer";

    res.status(500).render(template, {
      title: "Edit Profile",
      isLogedIn: req.isLogedIn,
      editing: true,
      currentPage: "edit-profile",
      profilePictureUrl: user.profilePicture || "",
      profilePicturePublicId: user.profilePicturePublicId || "",
      bannerImageUrl: user.bannerImage || "",
      bannerImagePublicId: user.bannerImagePublicId || "",
      aadhaarUrl: user.aadhaarCard?.url || "",
      aadhaarPublicId: user.aadhaarCard?.publicId || "",
      user,
      errorMessage: [err.message],
      oldInput,
      errors: { aadhaar: err.message },
      profilePicture: user?.profilePicture || null,
      bannerImage: user?.bannerImage || null,
      skipOtpStage: !!user?.email
    });
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
      hasOrders: false,
      hasVendorOrders: false,
    });
  } catch (err) {
    res.status(500).send('Error fetching user');
  }
};
// ====================== DELETE USER ======================


exports.deleteUser = async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    console.log('PROFILE PIC ID:', user?.profilePicturePublicId);

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

    // 1️⃣ Fetch all vendors owned by this user
    const userVendors = await vender.find({ vender: user._id });

    // 2️⃣ Before deleting anything, find all vendors who had this user as a customer
    const affectedVendorIds = await Orders.distinct('vender', { guest: user._id });
    const affectedVendors = await User.find({
      userType: 'vender',
      _id: { $in: affectedVendorIds }
    });
    console.log("📩 Vendors to notify:", affectedVendors.map(v => v.email));

    // 3️⃣ Delete all Cloudinary images and related collections for each vendor
    for (const v of userVendors) {
      const vendorDeletePromises = [];

      // ✅ Delete main image
      if (v.imagePublicId) {
        vendorDeletePromises.push(
          cloudinary.uploader.destroy(v.imagePublicId)
            .then(r => console.log(`Vendor ${v._id} main image deleted:`, r))
            .catch(err => console.warn(`Error deleting vendor main image:`, err.message))
        );
      }

      // ✅ Delete menu image
      if (v.MenuimagePublicId) {
        vendorDeletePromises.push(
          cloudinary.uploader.destroy(v.MenuimagePublicId)
            .then(r => console.log(`Vendor ${v._id} menu image deleted:`, r))
            .catch(err => console.warn(`Error deleting vendor menu image:`, err.message))
        );
      }

      // ✅ Delete banner image
      if (v.bannerImagePublicId) {
        vendorDeletePromises.push(
          cloudinary.uploader.destroy(v.bannerImagePublicId)
            .then(r => console.log(`Vendor ${v._id} banner image deleted:`, r))
            .catch(err => console.warn(`Error deleting vendor banner image:`, err.message))
        );
      }

      // ✅ Delete FSSAI certificates
      if (v.fssaiCertificatePublicId) {
        vendorDeletePromises.push(
          cloudinary.uploader.destroy(v.fssaiCertificatePublicId)
            .then(r => console.log(`Vendor ${v._id} FSSAI certificate deleted:`, r))
            .catch(err => console.warn(`Error deleting FSSAI certificate:`, err.message))
        );
      }

      if (Array.isArray(v.fssaiCertificatesPublicIds)) {
        for (const certId of v.fssaiCertificatesPublicIds) {
          vendorDeletePromises.push(
            cloudinary.uploader.destroy(certId)
              .then(() => console.log(`Deleted FSSAI certificate:`, certId))
              .catch(err => console.warn(`Error deleting FSSAI cert ${certId}:`, err.message))
          );
        }
      }

      await Promise.all(vendorDeletePromises);

      // ✅ Delete all related data for this vendor
      await Orders.deleteMany({ vender: v._id });
      await venderOptions.deleteMany({ vendorId: v._id });
      await userOptions.deleteMany({ vendor: v._id });
      await message.deleteMany({ vendorId: v._id });

      await vender.findByIdAndDelete(v._id);
    }

    // 4️⃣ Remove this user's ID from all users' booked arrays
    await User.updateMany(
      {},
      { $pull: { booked: { $in: userVendors.map(v => v._id) } } }
    );

    // 5️⃣ Delete all user-related data
    await Orders.deleteMany({ guest: user._id });
    await message.deleteMany({ guestId: user._id });
    await venderOptions.deleteMany({ guest: user._id });
    await userOptions.deleteMany({ guest: user._id });

    // 7️⃣ Delete user’s Cloudinary images
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

    // 8️⃣ Finally, delete the user itself
    await User.findByIdAndDelete(user._id);

    // 9️⃣ Clear session if this user was logged in
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



// ✅ GET Admin Dashboard
exports.getAdmin = async (req, res) => {
  try {
    const sessionId = req.session.adminSessionId;

    // 🔐 Check admin session is valid
    const validSession = sessionId
      ? await Admin.findOne({
        sessionId,
        expiresAt: { $gt: new Date() }
      })
      : null;

    if (!validSession) {
      return res.render("./store/admin", { isAuthorised: false });
    }

    // -----------------------------
    // ✅ Fetch vendors
    // -----------------------------
    const vendors = await User.find({ userType: "vender" });

    // -----------------------------
    // ✅ Fetch all orders of all types
    // -----------------------------
    const orders = await Orders.find({
      status: { $in: ["active", "cancelled"] }
    })
      .populate("vender")
      .sort({ startingDate: 1 });

    // -----------------------------
    // ✅ Prepare admin view data
    // -----------------------------
    const adminData = vendors.map((vendor) => {
      const vendorOrders = orders.filter(
        (order) =>
          order.vender &&
          order.vender._id &&
          order.vender._id.equals(vendor._id)
      );

      let totalVendorShare = 0;
      let totalPaid = 0;
      const payoutDetails = [];

      vendorOrders.forEach((order) => {
        const vendorShare = order.vendorShare || 0;
        totalVendorShare += vendorShare;

        let status = "pending";
        let dueDate = new Date(order.startingDate);

        // -------------------------------------
        // 🔍 PER MONTH ORDERS (HAS payoutSchedule)
        // -------------------------------------
        if (order.subscription_model === "Per Month") {
          const payout = order.payoutSchedule?.[0];

          if (payout) {
            status = payout.status;
          }

          // 👇 FIXED: Per-month always due 7 days after starting date
          let d = new Date(order.startingDate);
          d.setDate(d.getDate() + 7);
          dueDate = d;
        }

        // -------------------------------------
        // 🔍 PER DAY ORDERS (NO payoutSchedule)
        // -------------------------------------
        else {
          status = order.paymentStatus || "unpaid";

          // dueDate = startingDate (same day)
          dueDate = new Date(order.startingDate);
        }

        // Count total paid
        if (status === "paid") {
          totalPaid += vendorShare;
        }

        payoutDetails.push({
          orderId: order._id,
          guestName: order.name,
          vendorShare: vendorShare.toFixed(2),
          status,
          dueDate,
          subscription_model: order.subscription_model,
          startingDate: order.startingDate
        });
      });

      return {
        vendorId: vendor._id,
        vendorName: vendor.serviceName,
        totalVendorShare: totalVendorShare.toFixed(2),
        totalPaid: totalPaid.toFixed(2),
        totalRemaining: (totalVendorShare - totalPaid).toFixed(2),

        payouts: payoutDetails,

        bankAccountNumber: vendor.bankAccountNumber,
        bankIFSC: vendor.bankIFSC,
        phoneNumber: vendor.phoneNumber,
        bankName: vendor.bankName,
        accountHolderName: vendor.accountHolderName
      };
    });

    // -----------------------------
    // Render Admin Dashboard
    // -----------------------------
    res.render("./store/admin", {
      isAuthorised: true,
      adminData,
      title: "Admin Dashboard",
    });

  } catch (error) {
    console.error("❌ Error loading admin data:", error);
    res.status(500).send("Server Error");
  }
};

// ✅ POST Admin Login
exports.postAdmin = async (req, res) => {
  try {
    const { password } = req.body;

    // 🔑 Verify admin password
    if (password !== process.env.ADMIN_PASSWORD) {
      req.flash("error", "Incorrect admin password");
      return res.redirect("/admin");
    }

    // ✅ Generate 1-hour session
    const sessionId = uuidv4();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour from now

    // Save session in DB
    await Admin.create({ sessionId, expiresAt });

    // Store session ID in express-session
    req.session.adminSessionId = sessionId;
    await req.session.save();

    res.redirect("/admin");
  } catch (error) {
    console.error("❌ Admin login error:", error);
    res.status(500).send("Server Error");
  }
};

exports.markPayoutAsPaid = async (req, res) => {
  try {
    const { orderId } = req.params;

    const order = await Orders.findById(orderId);
    if (!order) {
      req.flash('error', 'Order not found');
      return res.redirect('/admin');
    }

    const pendingPayout = order.payoutSchedule.find(p => p.status === 'pending');
    if (!pendingPayout) {
      req.flash('info', 'No pending payout found for this order');
      return res.redirect('/admin');
    }

    // Mark payout as paid
    pendingPayout.status = 'paid';
    pendingPayout.paidOn = new Date();

    // Mark payment status
    order.paymentStatus = "paid";

    // -----------------------------------
    // 📌 SMART AUTO-DELETE LOGIC
    // -----------------------------------
    if (order.subscription_model === 'Per Day') {
      // Per-day → delete after 2 days
      order.toBeDeletedAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    } else {
      // Per-month → delete 2 days AFTER subscription ends
      const end = new Date(order.endingDate);
      end.setDate(end.getDate() + 2);
      order.toBeDeletedAt = end;
    }

    await order.save({ validateBeforeSave: false });

    req.flash('success', 'Payout marked as paid! Deletion scheduled correctly based on subscription type.');
    res.redirect('/admin');

  } catch (error) {
    console.error('Error marking payout as paid:', error);
    req.flash('error', 'Server error while marking payout as paid');
    res.redirect('/admin');
  }
};


// Temporary OTP store (for demo purpose; better to use DB)
let otpStore = {};

// 1️⃣ Show forgot password page
exports.getForgotPassword = (req, res) => {
  res.render('./store/forgot-password', {
    oldInput: {}, errors: [], title: "Forgot Password", currentPage: 'forgot-password', isLogedIn: req.isLogedIn, user: req.session.user, hasOrders: false,
    hasVendorOrders: false,
  });

};

// 2️⃣ Handle forgot password form → send OTP
exports.postForgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    // 1️⃣ Check if user exists
    const user = await User.findOne({ email });


    if (!user) {
      req.flash('error', 'Email not found in our records.');
      return res.redirect('/forgot-password');
    }

    // 2️⃣ Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000); // 6-digit OTP
    otpStore[email] = otp; // store temporarily
    req.session.otpExpires = Date.now() + 5 * 60 * 1000; // expires in 5 mins

    // 3️⃣ Send OTP via Brevo API
    await tranEmailApi.sendTransacEmail({
      sender: { email: process.env.FROM_EMAIL, name: "Tiffin Seva" },
      to: [{ email }],
      subject: "Password Reset OTP",
      textContent: `Dear ${user.firstName},\n\nYou requested to reset your password. Your One-Time Password (OTP) is: ${otp}.\nIt will expire in 5 minutes.\n\nIf you did not request a password reset, please ignore this email.\n\nBest regards,\nTiffin Seva Team`,
      htmlContent: `
                <p>Dear <b>${user.firstName}</b>,</p>
                <p>You requested to reset your password. Your One-Time Password (OTP) is:</p>
                <h2>${otp}</h2>
                <p>This OTP will expire in 5 minutes.</p>
                <p>If you did not request a password reset, please ignore this email.</p>
                <br>
                <p>Best regards,<br>Tiffin Seva Team</p>
            `
    });

    // 4️⃣ Render OTP verification page
    res.render('./store/verify-otp', {
      email,
      errors: [],
      title: "Verify OTP",
      currentPage: 'verify-otp',
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      hasOrders: false,
      hasVendorOrders: false,
    });

  } catch (err) {
    console.error("❌ OTP sending failed:", err);
    req.flash('error', 'Failed to send OTP. Please try again.');
    res.redirect('/forgot-password');
  }
};

// 3️⃣ Show verify OTP page
exports.getVerifyOtp = (req, res) => {

  res.render('./store/verify-otp', {
    email: req.query.email, errors: [], title: "Verify OTP", currentPage: 'verify-otp', isLogedIn: req.isLogedIn, user: req.session.user, hasOrders: false,
    hasVendorOrders: false,
  });
};

// 4️⃣ Handle OTP verification
exports.postVerifyOtp = (req, res) => {
  const { email, otp } = req.body;

  if (otpStore[email] && parseInt(otp) === otpStore[email]) {
    delete otpStore[email]; // OTP verified, remove from store
    return res.redirect(`/reset-password?email=${email}`);
  } else {
    req.flash('error', 'Incorrect OTP');
    res.render('./store/verify-otp', {
      email, errors: ['Incorrect OTP'], title: "Verify OTP", currentPage: 'verify-otp', isLogedIn: req.isLogedIn, user: req.session.user, hasOrders: false,
      hasVendorOrders: false,
    });
  }
};

// 5️⃣ Show reset password page
exports.getResetPassword = (req, res) => {

  res.render('./store/reset-password', {
    email: req.query.email, errors: [], title: "Reset Password", currentPage: 'reset-password', isLogedIn: req.isLogedIn, user: req.session.user, hasOrders: false,
    hasVendorOrders: false,
  });
};

// 6️⃣ Handle reset password form
exports.postResetPassword = async (req, res) => {
  const { email, newPassword, confirmPassword } = req.body;

  if (newPassword !== confirmPassword) {
    req.flash('error', 'Passwords do not match');
    return res.render('./store/reset-password', {
      email,
      errors: ['Passwords do not match'],
      title: "Reset Password",
      currentPage: 'reset-password',
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      hasOrders: false,
      hasVendorOrders: false,
    });
  }

  try {
    const user = await User.findOne({ email });
    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/forgot-password');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    await user.save();

    // 🔑 Set session to log in user automatically
    req.session.user = {
      _id: user._id,
      firstName: user.firstName,
      email: user.email,
      userType: user.userType
    };
    req.session.isLogedIn = true;

    req.flash('success', 'Password reset successfully!');
    res.redirect('/');
  } catch (err) {
    console.error(err);
    req.flash('error', 'Error resetting password');
    res.redirect('/forgot-password');
  }
};
