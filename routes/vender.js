const express = require('express');
const venderRouter = express.Router();

// Import multer middleware for handling image uploads
const multiFileUpload = require('../middleware/multer');

// Controller methods
const { 
    addVender, 
    vendersList, 
    editvender, 
    postaddVender, 
    Posteditvender, 
    deletevender,
    getOrders,
    getOptions,
    postOptionsBulk,
    getSendMessage,
    postSendMessage
} = require('../controller/vender');

// ---------------- GET ROUTES ---------------- //
venderRouter.get('/addVenderShip', addVender);
venderRouter.get('/venders_list', vendersList);  
venderRouter.get('/venders_list/:venderId', editvender);
venderRouter.get('/orders', getOrders);
venderRouter.get('/edit_vender/:venderId', editvender);
venderRouter.get('/customerChoice',getOptions);

// routes for sending message
venderRouter.get('/send_message', getSendMessage);

// ---------------- POST ROUTES ---------------- //
// ⚠️ Add multer upload middleware to handle 'image' and 'Menuimage'
venderRouter.post('/addVenderShip', multiFileUpload, postaddVender);
venderRouter.post('/edit_vender', multiFileUpload, Posteditvender);

venderRouter.post('/delete_vender/:venderId', deletevender);
venderRouter.post('/customerChoiceBulk/:venderId', postOptionsBulk);
venderRouter.post('/send_message/:venderId', postSendMessage);

// Export router
exports.venderRouter = venderRouter;