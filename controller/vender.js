const cloudinary = require('cloudinary').v2;
const Meals = require('../models/venders');
const { fileUploadInCloudinary } = require('../utils/cloudinary');
const User = require('../models/user');
const venderOption = require('../models/venderOption');
const GuestOption = require('../models/userOption');
const Message = require('../models/message');
const Order = require('../models/orders');
const { error } = require('console');

// for twillio
// const twilio = require('twilio');
// const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
// add vender 
exports.addMeals = async (req, res) => {
    try {
        // check if vendor already has meals
        const existingMeals = await Meals.findOne({ vendor: req.session.user._id });

        if (existingMeals) {
            // meals already exist -> show message + redirect button
            return res.render('./admin/editvenders', {
                editing: false,
                title: "Add Meals for the Week",
                currentPage: 'admin',
                isLogedIn: req.isLogedIn,
                user: req.session.user,
                alreadyAdded: true   // 👈 pass flag to EJS
            });
        }

        // no meals -> show form
        res.render('./admin/editvenders', {
            editing: false,
            title: "Add Meals for the Week",
            currentPage: 'admin',
            isLogedIn: req.isLogedIn,
            user: req.session.user,
            mealsDoc: {},  // empty doc for form fields
            alreadyAdded: false
        });

    } catch (err) {
        console.error("Error loading addMeals:", err);
        req.flash('error', 'Something went wrong');
        res.redirect('back');
    }
};

// Render form to add/edit meals
exports.editMeals = async (req, res) => {
    const mealId = req.params.mealId;
    const editing = req.query.editing === 'true';

    try {
        const mealsDoc = await Meals.findById(mealId);
        if (!mealsDoc) {
            console.log("Meals not found");
            return res.redirect('/vender/meals_list');
        }

        // If NOT editing, check if meals already exist
        const alreadyAdded = !editing && !!mealsDoc;

        res.render('./admin/editvenders', {
            mealsDoc,
            editing,
            alreadyAdded,   // ✅ used in EJS
            title: editing ? "Edit Meals" : "Add Meals",
            currentPage: 'admin',
            isLogedIn: req.isLogedIn,
            user: req.session.user
        });
    } catch (err) {
        console.error(err);
        res.redirect('/vender/meals_list');
    }
};


// List all meals of this vendor
exports.mealsList = async (req, res) => {
    try {
        const vendorId = req.session.user._id;
        const mealsList = await Meals.find({ vendor: vendorId });
        res.render('./admin/venders_list', {
            mealsList,
            title: "Weekly Meals List",
            currentPage: 'adminMeals',
            isLogedIn: req.isLogedIn,
            user: req.session.user
        });
    } catch (err) {
        console.error(err);
        res.redirect('/dashboard');
    }
};

exports.postAddMeals = async (req, res) => {
    const files = req.files;

    try {
        const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
        let meals = {};

        for (const day of days) {
            const lunchInput = req.body[`${day}_lunch_items`];
            const dinnerInput = req.body[`${day}_dinner_items`];

            meals[day] = {
                lunch: {
                    items: Array.isArray(lunchInput)
                        ? lunchInput
                        : typeof lunchInput === 'string'
                        ? lunchInput.split(',').map(item => item.trim())
                        : [],
                    image: files?.[`${day}_lunch_image`] 
                        ? (await fileUploadInCloudinary(files[`${day}_lunch_image`][0].buffer)).secure_url
                        : '',
                    imagePublicId: ''
                },
                dinner: {
                    items: Array.isArray(dinnerInput)
                        ? dinnerInput
                        : typeof dinnerInput === 'string'
                        ? dinnerInput.split(',').map(item => item.trim())
                        : [],
                    image: files?.[`${day}_dinner_image`] 
                        ? (await fileUploadInCloudinary(files[`${day}_dinner_image`][0].buffer)).secure_url
                        : '',
                    imagePublicId: ''
                }
            };
        }

        const newMeals = new Meals({
            meals,
            vendor: req.session.user._id
        });

        await newMeals.save();
        return res.redirect('/vender/meals_list');
    } catch (err) {
        console.error(err);
        res.status(500).send("Error saving meals: " + err.message);
    }
};

// Edit existing meals
exports.postEditMeals = async (req, res) => {
    const mealId = req.body.id;
    const files = req.files;

    try {
        // ✅ Find existing document
        const mealsDoc = await Meals.findById(mealId);
        if (!mealsDoc) {
            return res.status(404).send("Meals not found");
        }

        const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
        const mealTypes = ["lunch", "dinner"];

        for (const day of days) {
            for (const mealType of mealTypes) {
                const fieldName = `${day}_${mealType}_items`;

                // ✅ Handle items (string or array safely)
                let itemsInput = req.body[fieldName];
                if (typeof itemsInput === "string") {
                    itemsInput = itemsInput.split(",").map(i => i.trim());
                } else if (Array.isArray(itemsInput)) {
                    itemsInput = itemsInput.map(i => i.trim());
                } else {
                    itemsInput = []; // default
                }

                mealsDoc.meals[day][mealType].items = itemsInput;

                // ✅ Handle image update
                const imageField = `${day}_${mealType}_image`;
                if (files?.[imageField]) {
                    // delete old image if exists
                    if (mealsDoc.meals[day][mealType].imagePublicId) {
                        await cloudinary.uploader.destroy(mealsDoc.meals[day][mealType].imagePublicId);
                    }

                    const imgResult = await fileUploadInCloudinary(files[imageField][0].buffer);
                    mealsDoc.meals[day][mealType].image = imgResult.secure_url;
                    mealsDoc.meals[day][mealType].imagePublicId = imgResult.public_id;
                }
            }
        }

        await mealsDoc.save();
        res.redirect("/vender/meals_list");

    } catch (err) {
        console.error("❌ Error updating meals:", err);
        res.status(500).send("Error updating meals: " + err.message);
    }
};

// Delete meals
exports.deleteMeals = async (req, res) => {
    const mealId = req.params.mealId;

    try {
        const mealsDoc = await Meals.findById(mealId);
        if (!mealsDoc || mealsDoc.vendor.toString() !== req.session.user._id.toString()) {
            return res.status(403).send("Unauthorized");
        }

        // Delete images from Cloudinary
        const days = ["monday","tuesday","wednesday","thursday","friday","saturday","sunday"];
        for (const day of days) {
            for (const mealType of ['lunch','dinner']) {
                if (mealsDoc.meals[day][mealType].imagePublicId) {
                    await cloudinary.uploader.destroy(mealsDoc.meals[day][mealType].imagePublicId);
                }
            }
        }

        await Meals.findByIdAndDelete(mealId);
        res.redirect('/meals_list');
    } catch (err) {
        console.error(err);
        res.redirect('/meals_list');
    }
};

exports.getOrders = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const currentUser = await User.findById(req.session.user._id);

    // Check if the user is a vendor
    const isVender = currentUser.userType === 'vender';

    if (!isVender) {
      return res.render('./admin/orders', {
        title: "Orders",
        isLogedIn: req.isLogedIn,
        user: req.session.user,
        orders: [],
        currentPage: 'orders',
        isVender
      });
    }

    // Fetch all orders where this user is the vendor
    const orders = await Order.find({ vender: currentUser._id })
      .populate('guest') // Get guest details
      .populate('vender'); // Optional: current user

    res.render('./admin/orders', {
      title: "Orders",
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      orders,
      currentPage: 'orders',
      isVender
    });

  } catch (err) {
    console.error('Error fetching vendor orders:', err);
    req.flash('error', 'Could not load orders');
    res.redirect('back');
  }
};



// let isRequested;
// GET Customer Choices (Options)
exports.getOptions = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    // Fetch the logged-in vendor user
    const vendorUser = await User.findById(req.session.user._id);
    if (!vendorUser || vendorUser.userType !== 'vender') {
      req.flash('error', 'You are not a vendor');
      return res.redirect('back');
    }

    // Fetch orders for this vendor
    const orders = await Order.find({ vender: vendorUser._id })
      .populate('guest')
      .populate('vender');

    const guestData = [];
    for (const order of orders) {
      const guest = order.guest;
      const existingOption = await venderOption.findOne({
        guest: guest._id,
        vendorId: vendorUser._id,
      });

      const optionDetails = existingOption
        ? await GuestOption.findOne({ guest: guest._id, vendor: vendorUser._id })
            .populate('guest')
            .populate('vendor')
        : null;

      guestData.push({
        guest,
        order,
        optionSent: !!existingOption,
        optionDetails,
      });
    }

    res.render('./admin/modification', {
      title: "Customer Choice",
      isLogedIn: req.isLogedIn,
      user: vendorUser,
      listingsData: [{ vendor: vendorUser, guests: guestData }],
      currentPage: 'customerChoice',
      messages: req.flash(),
    });

  } catch (err) {
    console.error('Error fetching guest options:', err);
    req.flash('error', 'Could not load guest options');
    res.redirect('back');
  }
};

// POST Bulk Options
exports.postOptionsBulk = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  const { regular, optional } = req.body;

  try {
    const vendorUser = await User.findById(req.session.user._id);
    if (!vendorUser || vendorUser.userType !== 'vender') {
      req.flash('error', 'You are not a vendor');
      return res.redirect('back');
    }

    const orders = await Order.find({ vender: vendorUser._id });
    let totalUpdated = 0;

    for (const order of orders) {
      const guestId = order.guest._id;

      await venderOption.findOneAndUpdate(
        { guest: guestId, vendorId: vendorUser._id },
        { guest: guestId, vendorId: vendorUser._id, regular, optional },
        { upsert: true, new: true }
      );

      totalUpdated++;
    }

    req.flash('success', totalUpdated === 0
      ? 'No pending guests found. All options already sent.'
      : `Meal options sent to ${totalUpdated} guest(s)!`
    );

    res.redirect('/vender/customerChoice');

  } catch (err) {
    console.error('Error sending bulk options:', err);
    req.flash('error', 'Something went wrong.');
    res.redirect('back');
  }
};


// adding vendor details 
// (video description, product photos, detailed descriptions, social media links.)
// GET Add/Edit form
exports.getAddDetails = async (req, res) => {
  try {
    const vendorId = req.session.user._id;
    const vendor = await User.findById(vendorId);

    if (!vendor || vendor.userType !== 'vender') {
      req.flash('error', 'You are not authorized to access this page.');
      return res.redirect('/dashboard');
    }

    // Flags to control input visibility
    const hideVideoInput = !!vendor.videoDescription; // hide if video exists
    const hidePhotoInput = (vendor.photos && vendor.photos.length >= 5); // hide if 5+ photos

    return res.render('./admin/add_details', {
      title: "Add / Edit Details",
      currentPage: 'addDetails',
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      success: '',
      error: '',
      vendor,              // existing values
      hideVideoInput,
      hidePhotoInput
    });
  } catch (err) {
    console.error("Error in getAddDetails:", err);
    req.flash('error', 'Something went wrong.');
    return res.redirect('back');
  }
};

/// POST Add/Edit form
exports.postAddDetails = async (req, res) => {
  try {
    const vendorId = req.session.user._id;
    const vendor = await User.findById(vendorId);
    if (!vendor || vendor.userType !== 'vender') {
      req.flash('error', 'Unauthorized');
      return res.redirect('/dashboard');
    }

    // text fields
    const { detailedDescription, facebook, instagram, twitter } = req.body;
    const files = req.files;

    // keep old values if new value is empty
    vendor.detailedDescription = detailedDescription?.trim() !== ''
      ? detailedDescription
      : vendor.detailedDescription;

    // ensure socialMediaLinks object exists
    if (!vendor.socialMediaLinks) vendor.socialMediaLinks = {};

    vendor.socialMediaLinks.facebook =
      facebook?.trim() !== '' ? facebook : vendor.socialMediaLinks.facebook;

    vendor.socialMediaLinks.instagram =
      instagram?.trim() !== '' ? instagram : vendor.socialMediaLinks.instagram;

    vendor.socialMediaLinks.twitter =
      twitter?.trim() !== '' ? twitter : vendor.socialMediaLinks.twitter;

    // photos upload (append new photos to existing ones)
    if (files && files['photos']) {
      const newPhotoUrls = [];
      const newPhotoPublicIds = [];
      for (const file of files['photos']) {
        const uploadResult = await fileUploadInCloudinary(file.buffer);
        newPhotoUrls.push(uploadResult.secure_url);
        newPhotoPublicIds.push(uploadResult.public_id);
      }
      vendor.photos = vendor.photos
        ? [...vendor.photos, ...newPhotoUrls]
        : newPhotoUrls;
      vendor.photosPublicIds = vendor.photosPublicIds
        ? [...vendor.photosPublicIds, ...newPhotoPublicIds]
        : newPhotoPublicIds;
    }

    // video upload (replace if a new one is uploaded)
    if (files && files['video'] && files['video'][0]) {
      const videoFile = files['video'][0];
      const uploadResult = await fileUploadInCloudinary(videoFile.buffer, {
        resource_type: "video"
      });
      vendor.videoDescription = uploadResult.secure_url;
      vendor.videoDescriptionPublicId = uploadResult.public_id;
    }

    await vendor.save();

    req.flash('success', 'Details saved successfully!');
    return res.redirect('/vender/add_details');
  } catch (err) {
    console.error("Error in postAddDetails:", err);
    req.flash('error', 'Something went wrong.');
    return res.redirect('back');
  }
};


exports.deleteMedia = async (req, res) => {
  try {
    const { type, url } = req.body;
    const userId = req.session.user._id; // Logged-in vendor

    const user = await User.findById(userId);
    if (!user) {
      req.flash('error', 'User not found');
      return res.redirect('/vender/add_details');
    }

    if (type === 'photo') {
      // Find index of the photo to delete
      const photoIndex = user.photos.indexOf(url);
      if (photoIndex > -1) {
        // Remove photo URL
        user.photos.splice(photoIndex, 1);

        // Optional: delete from Cloudinary if public IDs are stored
        if (user.photosPublicIds && user.photosPublicIds[photoIndex]) {
          const publicId = user.photosPublicIds.splice(photoIndex, 1)[0];
          await cloudinary.uploader.destroy(publicId);
        }
      }

    } else if (type === 'video') {
      // Delete video URL
      user.videoDescription = undefined;

      // Optional: delete from Cloudinary if public ID exists
      if (user.videoDescriptionPublicId) {
        await cloudinary.uploader.destroy(user.videoDescriptionPublicId);
        user.videoDescriptionPublicId = undefined;
      }
    }

    await user.save();
    req.flash('success', `${type} deleted successfully`);
    res.redirect('/vender/add_details');

  } catch (err) {
    console.error(err);
    req.flash('error', 'Failed to delete media');
    res.redirect('/vender/add_details');
  }
};
