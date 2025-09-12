const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
  profilePicture: String,
  profilePicturePublicId: String,

  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
  },
  lastName: String,
  dob: {
    type: Date,
    required: [true, 'Date of Birth is required']
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    trim: true,
    unique: true
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
  },
  userType: {
    type: String,
    enum: ['guest', 'vender'],
    default: 'guest'
  },

  // ✅ Location (for both)
  location: { type: String, trim: true },
  lat: Number,
  lng: Number,

  // ✅ Vendor-only fields
  serviceName: { type: String, trim: true },
  serviceRadius: { type: Number, min: 0 },   // in KM
  bannerImage: String,
  bannerImagePublicId: String,

  // ✅ Price fields
  pricePerDay: { type: Number, min: 0 },
  pricePerMonth: { type: Number, min: 0 },

  favourites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  booked: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

  theme: { type: Boolean, default: false },

  // ✅ Vendor reviews (only for vendors)
  reviews: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, required: true },
    comment: { type: String, required: true }
  }],

  // ✅ Orders count (only for vendors)
  orders: { type: Number, default: 0 },
  // video description, photos, detailed description, social media links
  videoDescription: String,
  videoDescriptionPublicId: String,
  photos: [String],
  photosPublicIds: [String],
  detailedDescription: String,
  socialMediaLinks: {
    facebook: String,
    instagram: String,
    twitter: String,
  },
});

module.exports = mongoose.model('User', userSchema, 'user');
