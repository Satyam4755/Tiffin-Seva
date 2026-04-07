require('dotenv').config();
require('./utils/mealScheduler');

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const flash = require('connect-flash');
const app = express();

// trial
const Message = require('./models/message');

// -----------------------------
//  0️⃣ FLASH
// -----------------------------
app.use(flash());

// -----------------------------
//  1️⃣ RAW WEBHOOK — MUST BE FIRST
// -----------------------------
const razorpayWebhook = require('./routes/razorpayWebhook');
app.use('/payment', razorpayWebhook);     // <-- /payment/rzp_webhook works

// -----------------------------
//  2️⃣ BODY PARSERS (NORMAL)
// -----------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// -----------------------------
//  3️⃣ ROUTERS IMPORT
// -----------------------------
const userRouter = require('./routes/user');
const authRouter = require('./routes/auth');
const policyRoutes = require('./routes/policyRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const { venderRouter } = require('./routes/vender');
const sendOtpRouter = require('./routes/sendOTP');
const verifyOtpRouter = require('./routes/verifyOTP');

// -----------------------------
//  4️⃣ MIDDLEWARE IMPORTS
// -----------------------------
const createSession = require('./middleware/session');
const loginFlag = require('./middleware/loginFlag');
const protectUserRoutes = require('./middleware/protectUserRoutes');
const protectvenderRoutes = require('./middleware/protectvenderRoutes');

// -----------------------------
//  5️⃣ ENV
// -----------------------------
const dbPath = process.env.MONGO_URI;
const sessionSecret = process.env.SESSION_SECRET;
const PORT = process.env.PORT || 3407;

// -----------------------------
//  6️⃣ SITEMAP
// -----------------------------
app.get('/sitemap.xml', (req, res) => {
    res.type('application/xml');
    res.sendFile(path.join(__dirname, 'public', 'sitemap.xml'));
});

// -----------------------------
//  7️⃣ SESSIONS + LOGIN FLAG
// -----------------------------
app.use(createSession(dbPath, sessionSecret));
app.use(loginFlag);

// -----------------------------
//  8️⃣ PUBLIC STATIC FILES
// -----------------------------
app.use(express.static(path.join(__dirname, 'public')));

// -----------------------------
//  9️⃣ PROTECTED USER ROUTES
// -----------------------------
const chekingRoutes = [
    '/user/favourite_list',
    '/user/booked',
    '/user/booking/:venderId',
    '/user/submit_booking',
    '/user/referral',
];
app.use(chekingRoutes, protectUserRoutes);

// -----------------------------
// 🔟 ALL ROUTES
// -----------------------------
app.use(userRouter);
app.use(authRouter);

// OTP API routes
app.use('/api', sendOtpRouter);
app.use('/api', verifyOtpRouter);

// Vendor protected routes
app.use('/vender', protectvenderRoutes, venderRouter);

// Policies
app.use('/', policyRoutes);

// Payment routes (NOT webhook)
app.use('/payment', paymentRoutes);

// -----------------------------
// 1️⃣1️⃣ EJS VIEW ENGINE
// -----------------------------
app.set('view engine', 'ejs');
app.set('views', 'views');

// -----------------------------
// 1️⃣2️⃣ 404 HANDLER (MUST BE LAST)
// -----------------------------
app.use((req, res) => {
    res.status(404).render('error', { title: "error", isLogedIn: req.isLogedIn });
});

app.use((req, res, next) => {
  res.locals.hasVendorOrders = false;
  res.locals.hasOrders = false;
  next();
});

// -----------------------------
// 1️⃣3️⃣ DATABASE CONNECTION
// -----------------------------
mongoose.connect(dbPath).then(async () => {
    console.log('Connected to MongoDB');

    // TTL INDEX FIXES
    try {
        await mongoose.connection.db.collection('sessions').createIndex(
            { expiresAt: 1 },
            { expireAfterSeconds: 0 }
        );
    } catch (err) {
        console.error('Session TTL error:', err);
    }

    try {
        await mongoose.connection.db.collection('venderOptions').dropIndex('createdAtV20_1');
    } catch {}
    try {
        await mongoose.connection.db.collection('venderOptions').createIndex(
            { createdAtV20: 1 },
            { expireAfterSeconds: 60 * 60 * 6 }
        );
    } catch (err) {
        console.error('venderOptions TTL error:', err);
    }

    try {
        await mongoose.connection.db.collection('guestOptions').dropIndex('createdAtU20_1');
    } catch {}
    try {
        await mongoose.connection.db.collection('guestOptions').createIndex(
            { createdAtU20: 1 },
            { expireAfterSeconds: 60 * 60 * 6 }
        );
    } catch (err) {
        console.error('guestOptions TTL error:', err);
    }

    try {
        await mongoose.connection.db.collection('messages').dropIndex('createdAt30_1');
    } catch {}
    try {
        await mongoose.connection.db.collection('messages').createIndex(
            { createdAt30: 1 },
            { expireAfterSeconds: 60 * 60 * 6 }
        );
    } catch (err) {
        console.error('messages TTL error:', err);
    }

    // START SERVER
    app.listen(PORT, () => {
        console.log(`Server started at port ${PORT}`);
    });
});
