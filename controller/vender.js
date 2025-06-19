const cloudinary = require('cloudinary').v2;
const venders = require('../models/venders');
const { fileUploadInCloudinary } = require('../utils/cloudinary');
const User = require('../models/user');
const venderOption = require('../models/venderOption');
const GuestOption = require('../models/userOption');
const Message = require('../models/message');
const Order = require('../models/orders');

// for twillio
const twilio = require('twilio');
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
// add vender
exports.addVender = (req, res, next) => {
    res.render('./admin/editvenders', { 
        editing: false,
        title: "Add vender details",
        currentPage: 'admin',
        isLogedIn: req.isLogedIn,
        user: req.session.user
    });
};

// get edit vender
exports.editvender = (req, res, next) => {
    const venderId = req.params.venderId;
    const editing = req.query.editing === 'true';

    venders.findById(venderId).then(vender => {
        if (!vender) {
            console.log("vender not found");
            return res.redirect('/vender/venders_list');
        }

        console.log("vender vender:", vender.vender); // ✅ Now it's a real value

        res.render('./admin/editvenders', {
            vender: vender,
            editing: editing,
            title: "Edit vender details",
            currentPage: 'admin',
            isLogedIn: req.isLogedIn,
            user: req.session.user
        });
    });
};

// admin vender list
exports.vendersList = async (req, res, next) => {
    const venderId = req.session.user._id;
    const vendervenders = await venders.find({ vender: venderId }).populate('vender');
    res.render('./admin/venders_list', {
        venders: vendervenders,
        title: "Admin venderList Page",
        currentPage: 'adminvender',
        isLogedIn: req.isLogedIn,
        user: req.session.user
    });
};

exports.postaddVender = async (req, res) => {
    const { id, Name, PricePerday, PricePerMonth, Location, Description, Rating } = req.body;
    const files = req.files;

    if (!files || !files.image || !files.Menuimage) {
        console.log("One or more required files are missing or not valid");
        return res.status(400).send("Missing image or menu image.");
    }

    try {
        const imageBuffer = files.image[0].buffer;
        const menuImageBuffer = files.Menuimage[0].buffer;

        const imageResult = await fileUploadInCloudinary(imageBuffer);
        const menuImageResult = await fileUploadInCloudinary(menuImageBuffer);

        if (!imageResult?.secure_url || !menuImageResult?.secure_url) {
            throw new Error("Cloudinary upload failed");
        }

        const venderh = new venders({ 
            id,
            image: imageResult.secure_url,
            imagePublicId: imageResult.public_id,
            Menuimage: menuImageResult.secure_url,
            MenuimagePublicId: menuImageResult.public_id,
            Name,
            PricePerday,
            PricePerMonth,
            Location,
            Description,
            Rating,
            vender: req.session.user._id
        });
        console.log("✅ Menu Image Cloudinary URL:", menuImageResult.secure_url);
        await venderh.save();
        console.log("✅ Saved Menuimage in DB:", venderh.Menuimage);
        // ✅ Redirect to /venders_list after successful addition
        return res.redirect('/vender/venders_list');

    
    } catch (err) {
        console.error("Error during vender upload:", err.message);
        return res.status(500).send("Internal server error: " + err.message);
    }
};

// Post edit vender

exports.Posteditvender = async (req, res) => {
    const { Name, PricePerday,PricePerMonth, Location, Description, Rating, id: venderId } = req.body;
    const files = req.files;

    try {
        const vender = await venders.findById(venderId);
        if (!vender || vender.vender.toString() !== req.session.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized to edit this vender" });
        }

        // ✅ IMAGE update
        if (files?.image) {
            if (vender.imagePublicId) {
                await cloudinary.uploader.destroy(vender.imagePublicId).catch(err => {
                    console.warn("Error deleting old image:", err.message);
                });
            }

            const imageBuffer = files.image[0].buffer;
            const imageResult = await fileUploadInCloudinary(imageBuffer);

            if (!imageResult?.secure_url) {
                throw new Error("Image upload failed");
            }

            vender.image = imageResult.secure_url;
            vender.imagePublicId = imageResult.public_id;
        }

        // ✅ MENU IMAGE update
        if (files?.Menuimage) {
            if (vender.MenuimagePublicId) {
                await cloudinary.uploader.destroy(vender.MenuimagePublicId).catch(err => {
                    console.warn("Error deleting old image:", err.message);
                });
            }

            const menuImageBuffer = files.Menuimage[0].buffer;
            const menuImageResult = await fileUploadInCloudinary(menuImageBuffer);

            if (!menuImageResult?.secure_url) {
                throw new Error("Image upload failed");
            }

            vender.Menuimage = menuImageResult.secure_url;
            vender.MenuimagePublicId = menuImageResult.public_id;
        }

        // ✅ Update other fields
        vender.Name = Name;
        vender.PricePerday = PricePerday;
        vender.PricePerMonth = PricePerMonth;
        vender.Location = Location;
        vender.Description = Description;
        vender.Rating = Rating;

        await vender.save();
        // ✅ Redirect to /venders_list after successful addition
        return res.redirect('/vender/venders_list');

    } catch (error) {
        console.error("Error during vender update:", error.message);
        return res.status(500).json({ success: false, message: "Internal server error: " + error.message });
    }
};

exports.deletevender = async (req, res, next) => {
  const venderId = req.params.venderId;

  try {
    const vender = await venders.findById(venderId);
    if (!vender) return res.status(404).send("Vendor not found");

    // 🔒 Authorization check
    if (vender.vender.toString() !== req.session.user._id.toString()) {
      return res.status(403).send('Unauthorized');
    }

    const hostVender = await User.findById(req.session.user._id);

    if (hostVender) {
      // ✅ Clean any custom fields if needed in User (optional now since orders are separate)
      await GuestOption.deleteMany({ vendor: hostVender._id }); // optional, as per schema
    }

    // ✅ Pull vendorId from all users' `booked` arrays
    await User.updateMany(
      { booked: venderId },
      { $pull: { booked: venderId } }
    );

    // ✅ Delete all GuestOptions related to this vendor
    await GuestOption.deleteMany({ vendor: venderId });

    // ✅ Delete all VenderOptions related to this vendor
    await venderOption.deleteMany({ vendorId: venderId });

    // ✅ Delete all Messages related to this vendor
    await Message.deleteMany({ vendorId: venderId });

    // ✅ Delete all Orders associated with this vendor
    await Order.deleteMany({ vender: venderId });

    // ✅ Delete vendor images from Cloudinary
    const cloudinaryDeletePromises = [];
    if (vender.imagePublicId)
      cloudinaryDeletePromises.push(cloudinary.uploader.destroy(vender.imagePublicId));
    if (vender.MenuimagePublicId)
      cloudinaryDeletePromises.push(cloudinary.uploader.destroy(vender.MenuimagePublicId));

    await Promise.all(cloudinaryDeletePromises);

    // ✅ Finally, delete the vendor document
    await venders.findByIdAndDelete(venderId);

    res.redirect('/vender/venders_list');
  } catch (err) {
    console.log("Error deleting vendor:", err);
    res.redirect('/vender/venders_list');
  }
};

exports.getOrders = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    // ✅ Get all listings created by this vendor user
    const allVenders = await venders.find({ vender: req.session.user._id });
    const isVender = allVenders.length > 0;

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

    // ✅ Get all orders where 'vender' is one of this user's listings
    const venderIds = allVenders.map(v => v._id);
    const orders = await Order.find({ vender: { $in: venderIds } })
      .populate('guest')
      .populate('vender');

    // ✅ Render once
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
exports.getOptions = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const vendorListings = await venders.find({ vender: req.session.user._id }).populate('vender');

    const listingsData = [];

    for (const listing of vendorListings) {
      const orders = await Order.find({ vender: listing._id })
        .populate('guest')
        .populate('vender');

      const guestData = [];

      for (const order of orders) {
        const guest = order.guest;
        const existingOption = await venderOption.findOne({
          guest: guest._id,
          vendorId: listing._id,
        });

        const optionDetails = existingOption
          ? await GuestOption.findOne({ guest: guest._id, vendor: listing._id })
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

      listingsData.push({
        vendor: listing,
        guests: guestData,
      });
    }

    res.render('./admin/modification', {
      title: "Customer Choice",
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      listingsData,
      currentPage: 'customerChoice',
      messages: req.flash(),
    });

  } catch (err) {
    console.error('Error fetching guest options:', err);
    req.flash('error', 'Could not load guest options');
    res.redirect('back');
  }
};
exports.postOptionsBulk = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  const vendorId = req.params.venderId;
  console.log("Vendor ID from URL:", vendorId); // ✅ Check if this is correct
  const { regular, optional } = req.body;

  try {
    // ✅ Fetch the vendor using vendorId
    const vendor = await venders.findById(vendorId);
    if (!vendor) {
      req.flash('error', 'Vendor not found');
      return res.redirect('/vender/customerChoice');
    }
    let totalUpdated = 0;
    const orders = await Order.find({ vender: vendor._id });
    console.log("Orders for this vendor:", orders); // ✅ Check if this is correct
    // ✅ Loop over all orders from this vendor
    for (const order of orders) {
      const guestId = order.guest._id;

      // ✅ Save to venderOption
      await venderOption.findOneAndUpdate(
        { guest: guestId, vendorId: vendorId },
        { guest: guestId, vendorId: vendorId, regular, optional },
        { upsert: true, new: true } // 👈 THIS is necessary
      );

      totalUpdated++;
    }

    // ✅ Show success message
    if (totalUpdated === 0) {
      req.flash('success', 'No pending guests found. All options already sent.');
    } else {
      req.flash('success', `Meal options sent to ${totalUpdated} guest(s)!`);
    }

    res.redirect('/vender/customerChoice');

  } catch (err) {
    console.error('Error sending bulk options:', err);
    req.flash('error', 'Something went wrong.');
    res.redirect('back');
  }
};

exports.getSendMessage = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  try {
    const vendorListings = await venders.find({ vender: req.session.user._id }).populate('vender');


    const listingsData = [];

    for (const listing of vendorListings) {
      const orders = await Order.find({ vender: listing._id })
        .populate('guest')
        .populate('vender');

      const guestMessages = [];

      for (const order of orders) {
        const guest = order.guest;

        const existingMessage = await Message.findOne({
          guest: guest._id,
          vendorId: listing._id,
        });

        guestMessages.push({
          guest,
          order,
          messageSent: !!existingMessage,
          messageDetails: existingMessage || null,
        });
      }

      listingsData.push({
        vendor: listing,
        guests: guestMessages,
      });
    }

    res.render('./admin/message', {
      title: "Send Message",
      isLogedIn: req.isLogedIn,
      user: req.session.user,
      messages: req.flash(),
      currentPage: 'send_message',
      listingsData,
    });

  } catch (err) {
    console.error('Error fetching send message data:', err);
    req.flash('error', 'Could not load message page');
    res.redirect('back');
  }
};

exports.postSendMessage = async (req, res, next) => {
  if (!req.isLogedIn || !req.session.user) return res.redirect('/login');

  const vendorId = req.params.venderId; // ⬅️ from URL
  const { message } = req.body;

  try {

    const vendor = await venders.findById(vendorId);
    if (!vendor || vendor.length === 0) {
      req.flash('error', 'Vendor listing not found');
      return res.redirect('/vender/send_message');
    }

    const orders = await Order.find({ vender: vendor._id });
    // ✅ Loop over all orders from this vendor
    for (const order of orders) {
      const guestId = order.guest._id;
      await Message.findOneAndUpdate(
        { guest: guestId, vendorId: vendorId },
        { guest: guestId, vendorId: vendorId, message },
        { upsert: true, new: true } // 👈 THIS is necessary
      );
    }

    req.flash('success', 'Message sent successfully!');
    res.redirect('/vender/send_message');
  } catch (err) {
    console.error('Error sending message:', err);
    req.flash('error', 'Something went wrong.');
    res.redirect('back');
  }
};