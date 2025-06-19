const { check, validationResult } = require("express-validator");
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
        return res.redirect('/vender/venders_list')
    }
    res.redirect('/')
}
exports.PostLogout = (req, res, next) => {
    req.session.destroy(() => {
        res.redirect('/logIn')
    })

}
// we can make middleware in array format also....
exports.postSignUpPage = [
    check('firstName')
        .notEmpty().withMessage("First name should not be empty")
        .trim().isLength({ min: 2 }).withMessage("Name should be greater than 1 character")
        .matches(/^[a-zA-Z]+$/).withMessage("Should be correct name"),

    check('lastName')
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
        .normalizeEmail(),

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

    check('terms')
        .custom(value => {
            if (value !== 'on') {
                throw new Error("Please accept the terms and conditions");
            }
            return true;
        }),

    async (req, res) => {
        const { firstName, lastName, dob, email, password, userType } = req.body;
        const editing = req.query.editing === 'true';
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(422).render('store/signup', {
                title: "Sign-Up",
                isLogedIn: false,
                errorMessage: errors.array().map(err => err.msg),
                oldInput: { firstName, lastName, email, password, userType },
                editing,
                user: {}
            });
        }

        try {
            const files = req.files;
            const profilePictureBuffer = files.profilePicture[0].buffer;

            const profilePictureResult = await fileUploadInCloudinary(profilePictureBuffer);

            if (!profilePictureResult?.secure_url) {
                throw new Error("Cloudinary upload failed");
            }

            const hashedPassword = await bcrypt.hash(password, 8);

            const newUser = new User({
                profilePicture: profilePictureResult.secure_url,
                profilePicturePublicId: profilePictureResult.public_id,
                firstName,
                lastName,
                dob, // ✅ Include dob here
                email,
                password: hashedPassword,
                userType,
            });

            const user = await newUser.save();

            // ✅ Auto-login after signup
            req.session.isLogedIn = true;
            req.session.user = user;
            await req.session.save();

            res.redirect('/');
        } catch (err) {
            console.log("Signup Error:", err.message);
            return res.status(422).render('store/signup', {
                title: "Sign-Up",
                isLogedIn: false,
                errorMessage: [err.message],
                oldInput: { firstName, lastName, dob, email, password, userType },
                editing,
                user: {}
            });
        }
    }
];
// ************************isme dikkat hai bhaiiii



// GET the edit profile form
exports.getEditPage = async (req, res) => {

    const editing = req.query.editing === 'true';
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).send('User not found');

        res.render('./store/signup', { 
            user,
            editing: editing, 
            title: "Edit Profile", 
            isLogedIn: req.isLogedIn, 
            oldInput: { 
                firstName: user.firstName, 
                lastName: user.lastName, 
                dob:user.dob,
                email: user.email 
            } 
        });
    } catch (err) {
        res.status(500).send('Error fetching user'); 
    }
};

// POST updated profile
exports.postEditPage = async (req, res) => {
        const { firstName, lastName,dob, email,id:id } = req.body;
    const files = req.files;
    try {
        const user = await User.findById(id);

        // ✅ IMAGE update
        if (files?.profilePicture) {
            if (user.profilePicturePublicId) {
                await cloudinary.uploader.destroy(user.profilePicturePublicId).catch(err => {
                    console.warn("Error deleting old image:", err.message);
                });
            }

            const imageBuffer = files.profilePicture[0].buffer;
            const imageResult = await fileUploadInCloudinary(imageBuffer);

            if (!imageResult?.secure_url) {
                throw new Error("Image upload failed");
            }

            user.profilePicture = imageResult.secure_url;
            user.profilePicturePublicId = imageResult.public_id;
        }

        // ✅ Update other fields
        user.firstName = firstName;
        user.lastName = lastName;
        user.dob=dob,
        user.email = email;

        await user.save();

        res.redirect('/');
    } catch (err) {
        res.status(500).send('Error updating user');
    }
};

exports.getSignUpPage = (req, res, next) => {
    const editing = req.query.editing === 'true';
    const { firstName, lastName, email, password, userType } = req.body;
    res.render('./store/signup', { title: "Sign-UP Page", isLogedIn: req.isLogedIn, oldInput: { firstName, lastName, email, password, userType }, editing: editing })
}

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
        isLogedIn: false,
        errorMessage: ['Incorrect password'],
        oldInput: { email },
        user: req.session.user
      });
    }

    // 🔁 Get all vendors owned by the user
    const userVenders = await vender.find({ vender: user._id });

    // 🔁 Delete all related vendor-based data
    for (const vender of userVenders) {
      // Delete cloudinary images for each vendor
      const cloudinaryDeletePromises = [];
      if (vender.imagePublicId)
        cloudinaryDeletePromises.push(cloudinary.uploader.destroy(vender.imagePublicId));
      if (vender.MenuimagePublicId)
        cloudinaryDeletePromises.push(cloudinary.uploader.destroy(vender.MenuimagePublicId));
      await Promise.all(cloudinaryDeletePromises);

      // Delete related collections
      await Orders.deleteMany({ vender: vender._id });
      await venderOptions.deleteMany({ vendorId: vender._id });
      await userOptions.deleteMany({ vendor: vender._id });
      await message.deleteMany({ vendorId: vender._id });

      // Delete the vendor itself
      await vender.findByIdAndDelete(vender._id);
    }

    // 🔁 Clean from other users' booked arrays
    await User.updateMany(
      { booked: user._id },
      { $pull: { booked: user._id } }
    );

    // Delete user's own orders, messages, options
    await Orders.deleteMany({ guest: user._id });
    await message.deleteMany({ guestId: user._id });
    await venderOptions.deleteMany({ guest: user._id });
    await userOptions.deleteMany({ guest: user._id });

    // 🔁 Delete profile picture from Cloudinary
    if (user.profilePicturePublicId) {
      await cloudinary.uploader.destroy(user.profilePicturePublicId).catch(err => {
        console.warn("Error deleting profile image:", err.message);
      });
    }

    // 🔁 Delete the user itself
    await User.findByIdAndDelete(user._id);

    // 🔁 Destroy session if the user is logged in
    if (req.session.user && req.session.user._id.toString() === user._id.toString()) {
      req.session.destroy(() => {
        res.redirect('/logIn');
      });
    } else {
      res.redirect('/');
    }

  } catch (err) {
    console.error('Delete Error:', err);
    res.status(500).send('Error deleting user');
  }
};
