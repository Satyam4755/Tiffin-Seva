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
    getSendMessage,
    postSendMessage
} = require('../controller/vender');

// ---------------- GET ROUTES ---------------- //
venderRouter.get('/add_meals', addMeals);
venderRouter.get('/meals_list', mealsList);
venderRouter.get('/meals_list/:mealId', editMeals);
venderRouter.get('/orders', getOrders);
venderRouter.get('/customerChoice', getOptions);

// ---------------- POST ROUTES ---------------- //
// ⚠️ Add multer upload middleware to handle 'image' and 'Menuimage'
venderRouter.post('/add_meals', multiFileUpload, postAddMeals);
venderRouter.post('/edit_meals', multiFileUpload, postEditMeals);

venderRouter.post('/delete_meal/:mealId', deleteMeals);
venderRouter.post('/customerChoiceBulk/:venderId', postOptionsBulk);

// Export router
exports.venderRouter = venderRouter;
