const mongoose = require('mongoose');
const user = require('./user');

const venderSchema = mongoose.Schema({
  imagePublicId: {
    type: String
  },
  image: String,
  Menuimage: {
    type: String
  },
  MenuimagePublicId: {
    type: String
  },
  Name: {
    type: String,
    required: true
  },
  PricePerday: {
    type: Number,
    required: true
  },
  PricePerMonth: {
    type: Number,
    required: true
  },
  Location: {
    type: String,
    required: true
  },
  Description: String,
  rules: String,

  vender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviews:[{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    rating: {
      type: Number,
      required: true
    },
    comment: {
      type: String,
      required: true
    },
  }],
    orders:Number,
});

module.exports = mongoose.model('vender', venderSchema, 'venders');
