const express = require("express");
const crypto = require("crypto");
const router = express.Router();
const Order = require("../models/orders");
const User = require("../models/user");
const sendEmail = require("../utils/sendEmail");
const TempBooking = require("../models/TempBooking");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

router.post(
  "/rzp_webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {


      
      const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;

      const receivedSignature = req.headers["x-razorpay-signature"];
      const expectedSignature = crypto
        .createHmac("sha256", webhookSecret)
        .update(req.body.toString())
        .digest("hex");

      console.log("🔥 Webhook hit! Raw body:", req.body.toString());

      if (receivedSignature !== expectedSignature) {
        console.log("❌ Invalid webhook signature");
        return res.status(400).send("Invalid signature");
      }

      const payload = JSON.parse(req.body.toString());
      const event = payload.event;

      console.log("🔔 Webhook event received:", event);

      if (event !== "payment.captured") {
        return res.status(200).send("Ignored event");
      }

      const payment = payload.payload.payment.entity;

      const payment_id = payment.id;
const order_id = payment.order_id;
const amount = payment.amount / 100;

// 🚫 PREVENT DUPLICATE ORDERS
const exists = await Order.findOne({ razorpay_payment_id: payment_id });
if (exists) {
  console.log("⚠️ Duplicate webhook received, order already exists");
  await TempBooking.deleteOne({ razorpay_order_id: order_id }); // cleanup leftover temp
  return res.status(200).send("Already processed");
}


      // 1️⃣ FIND TEMP BOOKING BY RAZORPAY ORDER ID
      const tempBooking = await TempBooking.findOne({
        razorpay_order_id: order_id,
      });

      if (!tempBooking) {
        console.log("❌ No temp data found for order:", order_id);
        return res.status(200).send("No booking found");
      }

      const bookingData = tempBooking.data;
      console.log("📦 bookingData from TempBooking:", bookingData);

      // 2️⃣ LOAD USER & VENDOR
      const guestUser = await User.findById(bookingData.userId);
      const Selectedvender = await User.findById(bookingData.venderId);

      if (!guestUser || !Selectedvender) {
        console.log("❌ Guest or vendor not found");
        return res.status(200).send("User or vendor missing");
      }

      // 3️⃣ EXTRACT CORE FIELDS
      const subscription_model = bookingData.subscription_model;
      const quantity = Number(bookingData.quantity || 1);
      const time_type = Array.isArray(bookingData.time_type)
        ? bookingData.time_type
        : bookingData.time_type
        ? [bookingData.time_type]
        : [];
      const mealsCount = time_type.length || 0;

      const pricePerDay = Selectedvender.pricePerDay || 0;
      const pricePerMonthSingle = Selectedvender.pricePerMonthSingle || 0;
      const pricePerMonthBoth = Selectedvender.pricePerMonthBoth || 0;

      let originalCalculatedTotal = 0;
      let calculatedTotal = 0;

      let startDateForOrder;
      let expireAt;
      let endingDateValue;
      let payoutSchedule = [];

      // 4️⃣ PRICE + DATE CALCULATIONS (same idea as Postbooking)

      if (subscription_model === "Per Day") {
        const start = new Date(bookingData.startingDate);
        const end = new Date(bookingData.endingDate);

        if (isNaN(start) || isNaN(end) || end < start) {
          console.log("❌ Invalid dates in temp booking");
          return res.status(200).send("Invalid dates");
        }

        const days = Math.floor((end - start) / MS_PER_DAY) + 1;
        const effMeals = mealsCount || 1;

        originalCalculatedTotal = days * pricePerDay * effMeals * quantity;
        calculatedTotal = originalCalculatedTotal;

        // Dates
        startDateForOrder = new Date(start);
        endingDateValue = new Date(end);
        expireAt = new Date(end);
        expireAt.setDate(expireAt.getDate() + 1);

        // Payout
        payoutSchedule = [
          {
            id: "full",
            dueDate: startDateForOrder,
            amount: calculatedTotal,
            status: "pending",
          },
        ];
      } else if (subscription_model === "Per Month") {
        const months = Number(bookingData.selectedMonths || 0);

        let pricePerMonth = 0;
        if (mealsCount === 1) pricePerMonth = pricePerMonthSingle;
        else if (mealsCount === 2) pricePerMonth = pricePerMonthBoth;
        else {
          console.log("❌ Invalid mealsCount in temp booking");
          return res.status(200).send("Invalid meal count");
        }

        originalCalculatedTotal = months * pricePerMonth * quantity;
        calculatedTotal = originalCalculatedTotal;

        // Start date logic (IST, after 11 → next day)
        const nowIST = new Date(new Date().getTime() + 19800000);
        startDateForOrder = new Date(nowIST);
        if (nowIST.getHours() >= 11) {
          startDateForOrder.setDate(startDateForOrder.getDate() + 1);
        }
        startDateForOrder.setHours(0, 0, 0, 0);

        expireAt = new Date(
          startDateForOrder.getTime() + months * 30 * MS_PER_DAY
        );

        endingDateValue = new Date(expireAt);
        endingDateValue.setDate(endingDateValue.getDate() - 1);

        // Payout 50–50
        const half = calculatedTotal / 2;
        payoutSchedule = [
          {
            id: "firstHalf",
            dueDate: startDateForOrder,
            amount: half,
            status: "pending",
          },
          {
            id: "final",
            dueDate: expireAt,
            amount: calculatedTotal - half,
            status: "pending",
          },
        ];
      } else {
        console.log("❌ Unknown subscription_model in webhook:", subscription_model);
        return res.status(200).send("Unknown subscription model");
      }

      // 5️⃣ BUILD ORDER USING SERVER-CALCULATED FIELDS
      const vendorShare = originalCalculatedTotal * 0.9;

      const newOrder = new Order({
        guest: guestUser._id,
        vender: Selectedvender._id,
        name: bookingData.name,
        phone: bookingData.phone,
        address: bookingData.address,
        lat: guestUser.lat || 0,
        lng: guestUser.lng || 0,
        quantity: quantity,
        subscription_model,

        startingDate: startDateForOrder,
        endingDate: endingDateValue,

        payment: "Paid via Razorpay",

        totalAmount: originalCalculatedTotal,
        vendorShare,
        time_type,
        number_of_months:
          subscription_model === "Per Month"
            ? bookingData.selectedMonths
            : undefined,

        expireAt,
        payoutSchedule,

        razorpay_payment_id: payment_id,
        razorpay_order_id: order_id,
      });

      await newOrder.save();

      // 6️⃣ EMAIL VENDOR
      await sendEmail({
        to: Selectedvender.email,
        subject: "New Order via Razorpay (Webhook)",
        html: `
          <p>New Order from <b>${guestUser.firstName}</b></p>
          <p><b>Total Amount:</b> ₹${originalCalculatedTotal}</p>
        `,
      });

      // 7️⃣ UPDATE VENDOR STATS
      Selectedvender.orders = (Selectedvender.orders || 0) + 1;
      await Selectedvender.save();

      // 8️⃣ UPDATE USER BOOKED LIST
      if (!guestUser.booked.includes(Selectedvender._id)) {
        guestUser.booked.push(Selectedvender._id);
        await guestUser.save();
      }

      console.log("✅ Webhook booking saved");

      // 9️⃣ DELETE TEMP BOOKING
      await TempBooking.deleteOne({ _id: tempBooking._id });

      return res.status(200).send("Webhook processed");
    } catch (err) {
      console.error("❌ Webhook error:", err);
      return res.status(500).send("Webhook error");
    }
  }
);

module.exports = router;
