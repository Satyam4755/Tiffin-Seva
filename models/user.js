const mongoose = require('mongoose');

const userSchema = mongoose.Schema({
  profilePicture: String,
  profilePicturePublicId: String,

  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
  },

  dob: {
    type: Date,
    required: function () {
      return this.userType !== 'vender';
    }
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

  location: { type: String, trim: true },
  lat: Number,
  lng: Number,

  // ✅ Vendor-only fields
  serviceName: { type: String, trim: true },

  // ✅ New Radius & Directional Limits
  deliveryRadius: { type: Number, default: 0 }, // in KM
  limitNorth: { type: Number, default: 0 },
  limitSouth: { type: Number, default: 0 },
  limitEast: { type: Number, default: 0 },
  limitWest: { type: Number, default: 0 },

  // Deprecated Polygon (keeping just in case transition is needed, but hidden)
  serviceArea: {
    type: { type: String, enum: ['Polygon'], default: 'Polygon' },
    coordinates: { type: [[[Number]]], default: [] }
  },

  bannerImage: String,
  bannerImagePublicId: String,
  pricePerDay: { type: Number, min: 0 },
  pricePerMonthSingle: { type: Number, min: 0 },
  pricePerMonthBoth: { type: Number, min: 0 },

  favourites: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  booked: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  theme: { type: Boolean, default: false },

  reviews: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rating: { type: Number, required: true },
    comment: { type: String, required: true }
  }],

  orders: { type: Number, default: 0 },
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

  // ✅ Bank details for vendors (optional if UPI is linked)
  bankAccountNumber: {
    type: String,
    required: false, // optional
    trim: true,
  },
  bankIFSC: {
    type: String,
    required: false, // optional
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: function () {
      // phone number is always required for vendors
      return this.userType === 'vender';
    },
    trim: true,
  },
  bankName: {
    type: String,
    required: false, // optional
    trim: true,
  },
  accountHolderName: {
    type: String,
    required: false, // optional
    trim: true,
  },

  // ✅ Aadhaar Card info (replaces FSSAI)
  aadhaarCard: {
    url: { type: String, default: '' },
    publicId: { type: String, default: '' },
    number: { type: String, default: '' },
    isVerified: { type: Boolean, default: false }
  },

  // ✅ Welcome offer
  welcomeOffer: {
    amount: { type: Number, default: 0 },
    isUsed: { type: Boolean, default: false }
  },

  // ✅ Referral system
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: String,
    default: null
  },
  referralUsed: {
    type: Boolean,
    default: false
  },
  // ✅ Birthday gift tracking
  birthdayBonusGiven: {
    type: Boolean,
    default: false
  },
  birthdayBonusGivenAt: {
    type: Date,
    default: null
  },
  birthdayCancellationDeductedAt: {
    type: Date,
    default: null
  }
});

// 🔍 2dsphere index for geospatial queries
userSchema.index({ serviceArea: '2dsphere' });

module.exports = mongoose.model('User', userSchema, 'user');
