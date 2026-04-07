const express = require('express');
const venderRouter = express.Router();

// Import multer middleware for handling image uploads
const multiFileUpload = require('../middleware/multer');

// Controller methods
const { 
    addMeals, 
    mealsList, 
    editMeals, 
    postAddMeals, 
    postEditMeals, 
    deleteMeals,
    getOrders,
    getOptions,
    postOptionsBulk,
    getAddDetails,
    postAddDetails,
    deleteMedia,
    getProblems
} = require('../controller/vender');

// ---------------- GET ROUTES ---------------- //
venderRouter.get('/add_meals', addMeals);
venderRouter.get('/meals_list', mealsList);

// ✅ new edit route matches “/vender/:mealId/edit_meals”
venderRouter.get('/:mealId/edit_meals', editMeals);

venderRouter.get('/orders', getOrders);
venderRouter.get('/customerChoice', getOptions);
venderRouter.get('/add_details', getAddDetails);
venderRouter.get('/problems', getProblems);

// ---------------- POST ROUTES ---------------- //
// add new meals
venderRouter.post('/add_meals', multiFileUpload, postAddMeals);

// edit meals (uses hidden input “id” in form)
venderRouter.post('/edit_meals', multiFileUpload, postEditMeals);

// delete meal
venderRouter.post('/delete_meal/:mealId', deleteMeals);

// other vendor routes
venderRouter.post('/customerChoiceBulk/:venderId', postOptionsBulk);
venderRouter.post('/add_details', multiFileUpload, postAddDetails);
venderRouter.post('/delete_media', deleteMedia);

// Export router
exports.venderRouter = venderRouter;
