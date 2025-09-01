const mongoose = require('mongoose');

// Schema for a single meal
const mealSchema = mongoose.Schema({
    image: String,           // optional
    imagePublicId: String,   // Cloudinary image ID
    items: { type: [String], required: true } // at least one meal item
});

// Schema for all days
const dayMealsSchema = mongoose.Schema({
    monday: { lunch: mealSchema, dinner: mealSchema },
    tuesday: { lunch: mealSchema, dinner: mealSchema },
    wednesday: { lunch: mealSchema, dinner: mealSchema },
    thursday: { lunch: mealSchema, dinner: mealSchema },
    friday: { lunch: mealSchema, dinner: mealSchema },
    saturday: { lunch: mealSchema, dinner: mealSchema },
    sunday: { lunch: mealSchema, dinner: mealSchema },
});

// Main schema
const mealsSchema = mongoose.Schema({
    meals: dayMealsSchema,
    vendor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true } // owner of these meals
}, { timestamps: true });

module.exports = mongoose.model('Meals', mealsSchema, 'meals');
