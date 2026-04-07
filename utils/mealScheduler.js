const mongoose = require('mongoose');
const cron = require('node-cron');
const Order = require('../models/orders');
const Meals = require('../models/venders');
const sendEmail = require('../utils/sendEmail');

function getTodayIST() {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  now.setHours(0, 0, 0, 0);
  return now;
}

// ✅ Meal Email Sender
async function sendMealEmails(mealType) {
  try {
    const today = getTodayIST();
    const dayName = today.toLocaleDateString('en-US', { weekday: 'long' }).toLowerCase();

    const activeOrders = await Order.find({
      status: 'active',
      expireAt: { $gte: today },
      startingDate: { $lte: today }
    }).populate('guest vender');

    for (const order of activeOrders) {
      if (!order.guest || !order.vender) continue;

      const start = new Date(order.startingDate).getTime();
      const end = new Date(order.expireAt).getTime();
      const todayTime = today.getTime();
      if (todayTime < start || todayTime > end) continue;

      const orderMeals = Array.isArray(order.time_type) && order.time_type.length
        ? order.time_type.map(t => t.toLowerCase())
        : ['lunch', 'dinner'];

      if (!orderMeals.includes(mealType)) continue;

      const mealsDoc = await Meals.findOne({ vendor: order.vender._id });
      if (!mealsDoc || !mealsDoc.meals?.[dayName]?.[mealType]) continue;

      const mealItems = mealsDoc.meals[dayName][mealType].items || [];
      if (!mealItems.length) continue;

      const mealNames = mealItems.join(', ');
      const messageText = `Your ${mealType} for today: ${mealNames}`;

      if (order.guest.email) {
        await sendEmail({
          to: order.guest.email,
          subject: `🍽 Upcoming ${mealType} - Tiffin Seva`,
          html: `
            <div style="font-family: Arial; padding: 20px;">
              <h3>Hi ${order.guest.firstName || 'Customer'} 👋</h3>
              <p>${messageText}</p>
              <p>Delivery time: ${mealType === 'lunch' ? '12:00 PM - 3:00 PM' : '6:00 PM - 8:00 PM'}</p>
              <hr />
              <p style="font-size:12px; color:#888;">Tiffin Seva</p>
            </div>
          `,
        });
        console.log(`✅ Sent ${mealType} mail to ${order.guest.email} (Order: ${order._id})`);
      }
    }
  } catch (err) {
    console.error(`❌ Error sending ${mealType} emails:`, err);
  }
}

// ✅ Subscription Expiry Reminder
async function sendSubscriptionExpiryEmails() {
  try {
    const today = getTodayIST();
    const tomorrowStart = new Date(today);
    const tomorrowEnd = new Date(today);
    tomorrowStart.setDate(today.getDate() + 1);
    tomorrowEnd.setDate(today.getDate() + 1);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const expiringOrders = await Order.find({
      status: 'active',
      endingDate: { $gte: tomorrowStart, $lte: tomorrowEnd }
    }).populate('guest');

    for (const order of expiringOrders) {
      if (!order.guest || !order.guest.email) continue;

      const endingDateStr = new Date(order.endingDate).toLocaleDateString('en-US', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });

      await sendEmail({
        to: order.guest.email,
        subject: '⏰ Your Subscription is Ending Soon - Tiffin Seva',
        html: `
          <div style="font-family: Arial; padding: 25px; background-color: #fff3e0;">
            <h2>Hi ${order.guest.firstName || 'Customer'} 👋</h2>
            <p>Your subscription will <b>end on ${endingDateStr}</b>.</p>
            <p>Renew soon to continue enjoying your meals!</p>
            <hr />
            <p style="font-size: 12px; color: #888;">Tiffin Seva Team</p>
          </div>
        `,
      });

      console.log(`🔔 Sent subscription expiry mail to ${order.guest.email}`);
    }
  } catch (err) {
    console.error('❌ Error sending subscription expiry emails:', err);
  }
}

// ✅ Start CRON jobs *after MongoDB is ready*
mongoose.connection.once('open', () => {
  console.log('✅ MongoDB Connected - Starting cron jobs...');

  cron.schedule('0 11 * * *', () => {
    console.log('🕚 Running lunch scheduler...');
    sendMealEmails('lunch');
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 18 * * *', () => {
    console.log('🕕 Running dinner scheduler...');
    sendMealEmails('dinner');
  }, { timezone: 'Asia/Kolkata' });

  cron.schedule('0 9 * * *', () => {
    console.log('⏰ Running expiry reminder scheduler...');
    sendSubscriptionExpiryEmails();
  }, { timezone: 'Asia/Kolkata' });
});

module.exports = {};
