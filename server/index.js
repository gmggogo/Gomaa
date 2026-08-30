require("dotenv").config();

const fetch =
require("node-fetch");
const express = require("express");
const mongoose = require("mongoose");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");
const path = require("path");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const crypto = require("crypto");

const companyServerRoutes =
require("./routes/companyServerRoutes");

const CompanyCoreEngine =
require("./routes/CompanyCoreEngine");

const GetQuoteEngine =
require("./routes/GetQuoteEngine");
const app = express();

app.use(
  "/uploads",
  express.static(
    path.join(
      __dirname,
      "public/uploads"
    )
  )
);

const SystemDesign =
require("./models/SystemDesign");
const serviceRoutes =
require("./routes/serviceRoutes");
const driverScheduleRoutes =
require("./routes/driverScheduleRoutes");

const smartDispatchEngineRoutes =
require("./routes/smartDispatchEngineRoutes");



const Service =
require("./models/Service");const {
  sendTripStatusEmail
} = require(
  "./utils/tripEmailEngine"
);

const {
  prepareConfirmRoute,
  lockConfirmedTrip,
  finalizeIndividualTrip,
  finalizeSharedPassenger
} = require(
  "./utils/trip-finalizer"
);

const {
  resolveTripPricing
} = require(
  "./utils/finalPricingResolver"
);

const routeMapEngine =
require("./utils/routeMapEngine");

const DispatchAssignment =
require("./models/DispatchAssignment"
);

const BillingHistory =
require("./models/BillingHistory"
);

const TenantPaymentAccount =
require("./models/TenantPaymentAccount"
);
const FacilityPricingOverride =
require("./models/FacilityPricingOverride");

/* =========================
   ENV
========================= */
const PORT = process.env.PORT || 10000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

/* =========================
   MIDDLEWARE (FINAL CLEAN)
========================= */

app.use(cors());

app.use(express.static(
  path.join(__dirname, "public")
));

/* =========================
   STRIPE WEBHOOK
========================= */

// 🔥 مهم: webhook قبل أي json

app.post(
  "/api/stripe-webhook",
  express.raw({
    type: "application/json"
  }),

  async (req, res) => {

    let event;

    /* =========================
       VERIFY WEBHOOK
    ========================= */

    try {

      const sig =
        req.headers["stripe-signature"];

      event =
        stripe.webhooks.constructEvent(
          req.body,
          sig,
          process.env.STRIPE_WEBHOOK_SECRET
        );

    } catch (err) {

      console.log(
        "❌ Webhook Error:",
        err.message
      );

      return res.sendStatus(400);

    }

    /* =========================
       HANDLE EVENTS
    ========================= */

    try {

/* =========================
   STRIPE HOSTED CHECKOUT
   SAVE CARD WITHOUT CHARGING
========================= */

if(
  event.type ===
  "checkout.session.completed"
){

  const session =
    event.data.object;

  if(session.mode !== "setup"){
    return res.sendStatus(200);
  }

  const tripId =
    session.metadata?.tripId ||
    session.client_reference_id;

  if(!tripId){
    return res.sendStatus(200);
  }

  const trip =
    await Trip.findById(tripId);

  if(!trip){
    return res.sendStatus(200);
  }

  if(
    trip.stripeCustomerId &&
    String(session.customer || "") !==
    String(trip.stripeCustomerId)
  ){
    console.log(
      "STRIPE CHECKOUT CUSTOMER MISMATCH:",
      trip.tripNumber
    );

    return res.sendStatus(400);
  }

  const setupIntent =
    await stripe.setupIntents.retrieve(
      session.setup_intent
    );

  if(
    setupIntent.status !== "succeeded" ||
    String(setupIntent.metadata?.tripId || "") !==
    String(trip._id)
  ){
    return res.sendStatus(400);
  }

  trip.stripeCustomerId =
    String(
      session.customer ||
      setupIntent.customer ||
      ""
    );

  trip.stripePaymentMethodId =
    String(
      setupIntent.payment_method ||
      ""
    );

  trip.setupIntentId =
    setupIntent.id;

  trip.paymentStatus =
    "PAYMENT_METHOD_SAVED";

  /*
    The card was saved successfully and the Get Quote booking is now ready
    for Admin Trips / Dispatch. This is confirmation, not a charge.
  */
  trip.dispatchSelected = true;

  const checkoutStatus =
    String(trip.status || "")
      .trim()
      .toLowerCase();

  if(
    !checkoutStatus ||
    checkoutStatus === "booked" ||
    checkoutStatus === "scheduled" ||
    checkoutStatus === "pending payment"
  ){
    trip.status = "Confirmed";
  }

  trip.paymentFailureCode = "";
  trip.paymentFailureMessage = "";
  trip.paymentRequiredEmailSentAt = null;

  if(!trip.cancelToken){
    trip.cancelToken =
      crypto
        .randomBytes(32)
        .toString("hex");
  }

  await trip.save();

  if(!trip.confirmationEmailSent){
    const sent =
      await sendTripStatusEmail(
        trip,
        "CONFIRMED"
      );

    if(sent){
      trip.confirmationEmailSent = true;
      await trip.save();
    }
  }

  console.log(
    "STRIPE CARD SAVED:",
    trip.tripNumber
  );

  return res.sendStatus(200);
}

   /* =========================
   PAYMENT SUCCESS
========================= */

if (
  event.type ===
  "payment_intent.succeeded"
) {

  const paymentIntent =
    event.data.object;

  const tripId =

    paymentIntent.metadata?.tripId ||

    paymentIntent.client_reference_id;

  if (!tripId) {
    return res.sendStatus(200);
  }

  const trip =
    await Trip.findById(tripId);

  if (!trip) {
    return res.sendStatus(200);
  }

  /*
    Deferred-payment trips are finalized by tripPaymentEngine/trip-finalizer.
    A successful capture must never overwrite Completed with Paid or resend the
    original confirmation email.
  */
  if(trip.stripePaymentMethodId){
    trip.paymentStatus = "PAID";
    trip.capturedAmount = Number(
      ((paymentIntent.amount_received || 0) / 100).toFixed(2)
    );
    trip.paymentCapturedAt = new Date();
    await trip.save();
    return res.sendStatus(200);
  }

  /* =========================
     ALREADY PROCESSED
  ========================= */

  if (
    trip.status === "Paid" &&
    trip.confirmationEmailSent === true
  ){
    return res.sendStatus(200);
  }

  /* =========================
     CANCEL TOKEN
  ========================= */

  if (!trip.cancelToken) {

    trip.cancelToken =
      crypto
        .randomBytes(32)
        .toString("hex");

  }

  /* =========================
     STATUS
  ========================= */

  if (

    trip.type === "individual"

    ||

    trip.type === "reserved"

    ||

    trip.type === "quote"

  ) {

    trip.status = "Paid";

  }

/* =========================
   SAVE DATA
========================= */

trip.paymentIntentId =

  paymentIntent.id ||

  paymentIntent.payment_intent ||

  "";

trip.dispatchSelected = true;

await trip.save();

sendTripStatusEmail(
  trip,
  "CONFIRMED"
).catch(err=>{

  console.log(
    "EMAIL ERROR:",
    err
  );

});

console.log(
  "✅ Trip Paid:",
  trip.tripNumber
);

/* =========================
   SUCCESS
========================= */

return res.sendStatus(200);

}

} catch (err) {

   console.log(
  "Webhook Processing Error:",
  err
);

      return res.sendStatus(500);

    }

  }

);

/* =========================
   JSON MIDDLEWARE AFTER WEBHOOK
========================= */

app.use(express.json({
  limit:"50mb"
}));

app.use(express.urlencoded({
  extended:true,
  limit:"50mb"
}));


/* =========================
   GH MOBILITY SaaS BILLING
   Super Admin subscription payment
   Platform Admin subscription control
========================= */

const tenantSubscriptionRoutes =
  require("./routes/tenantSubscriptionRoutes");

const platformSubscriptionRoutes =
  require("./routes/platformSubscriptionRoutes");

app.use(
  "/api/tenant-subscription",
  tenantSubscriptionRoutes
);

app.use(
  "/api/platform-subscription",
  platformSubscriptionRoutes
);

console.log(
  "✅ tenantSubscriptionRoutes mounted on /api/tenant-subscription"
);

console.log(
  "✅ platformSubscriptionRoutes mounted on /api/platform-subscription"
);

/* =========================
   PLATFORM STRIPE ACCOUNT
========================= */

const platformStripeRoutes =
  require("./routes/platformStripeRoutes");

app.use(
  "/api/platform-stripe",
  platformStripeRoutes
);

console.log(
  "✅ platformStripeRoutes mounted on /api/platform-stripe"
);

/* =========================
   DRIVER / DISPATCH CHAT
========================= */

const driverChatRoutes =
require("./routes/driverChatRoutes");

app.use(
  "/api/driver-chat",
  driverChatRoutes
);

console.log(
  "✅ driverChatRoutes mounted on /api/driver-chat"
);

/* =========================
   LIVE DRIVER ROUTES
========================= */

const liveDriverRoutes =
require("./routes/liveDriverRoutes");

app.use(
  "/api",
  liveDriverRoutes
);
app.use(
  "/api/driver-schedule",
  driverScheduleRoutes
);

app.use(
  "/api/company-core",
  CompanyCoreEngine
);

app.use(
  "/api/getquote-core",
  GetQuoteEngine
);

app.use(
  "/api/company-services",
  companyServerRoutes
);

app.use(
  "/api/smart-dispatch-engine",
  smartDispatchEngineRoutes
);
app.use(
  "/api/system-design",
  require("./routes/system-design")
);

app.use(
  "/api/services",
  serviceRoutes
);

/* =========================
   PUBLIC TENANT ROUTES
========================= */

const publicTenantRoutes =
require("./routes/publicTenantRoutes");

app.use(
  "/api/public/tenant",
  publicTenantRoutes
);

/* =========================
   TENANT STRIPE CONNECT
========================= */

const tenantStripeRoutes =
require("./routes/tenantStripeRoutes");

app.use(
  "/api/tenant-stripe",
  tenantStripeRoutes
);

console.log(
  "✅ tenantStripeRoutes mounted on /api/tenant-stripe"
);


/* =========================
   SHARED CURRENT LOCATION
   Companies + Reservation + Get Quote
   Uses GOOGLE_SERVER_KEY
========================= */

const locationRoutes =
require("./routes/locationRoutes");

app.use(
  "/api/location",
  locationRoutes
);

console.log(
  "✅ locationRoutes mounted on /api/location"
);

/* =========================
   PAYMENT SUCCESS
========================= */

app.post(
  "/api/payment-success",
  async (req, res) => {

    try {

      const {
        tripId,
        paymentIntentId
      } = req.body;

      if(!tripId){

        return res.status(400).json({
          message:"Missing tripId"
        });

      }

      const trip =
        await Trip.findById(tripId);

      if(!trip){

        return res.status(404).json({
          message:"Trip not found"
        });

      }

      if(paymentIntentId){

        trip.paymentIntentId =
          paymentIntentId;

      }

      trip.dispatchSelected =
        true;

      const currentStatus =
        String(trip.status || "")
          .trim()
          .toLowerCase();

      if(
        !currentStatus ||
        currentStatus === "booked" ||
        currentStatus === "scheduled" ||
        currentStatus === "pending payment"
      ){
        trip.status = "Confirmed";
      }

      if(!trip.cancelToken){

        trip.cancelToken =
          crypto
          .randomBytes(32)
          .toString("hex");

      }

  await trip.save();

console.log(
  "✅ PAYMENT SUCCESS:",
  trip.tripNumber
);

      return res.json({
        success:true
      });

    } catch(err){

      console.log(
        "PAYMENT SUCCESS ERROR:",
        err
      );

      return res.status(500).json({
        message:"Server error"
      });

    }

  }
);

/* =========================
   PUBLIC CONFIG - GOOGLE KEY
========================= */
app.get("/api/config", (req, res) => {
  res.json({
    googleKey: process.env.GOOGLE_KEY,
    publishableKey: process.env.STRIPE_PUBLISHABLE_KEY
  });
});

/* =========================
   MONGO CONNECT
========================= */
mongoose.connect(MONGO_URI)

.then(async () => {

  await loadSystemTimezone();

  console.log("✅ Mongo Connected");

})

.catch(err =>

  console.log(
    "❌ Mongo Error:",
    err
  )

);
/* =========================
   USER MODEL
========================= */

const User =
  require("./models/User");

const Tenant =
  require("./models/Tenant");

global.User = User;

/* =========================
   FACILITY PRICING OVERRIDE
========================= */

const facilityPricingOverrideRoutes =
  require("./routes/facilityPricingOverrideRoutes");

app.use(
  "/api/facility-pricing-override",
  facilityPricingOverrideRoutes
);
/* =========================
   TRIP MODEL (FINAL PRO VERSION + SHARED SUPPORT)
========================= */
const tripSchema = new mongoose.Schema({

  tripNumber: { type: String, unique: true, sparse: true },

  /* =========================
     MULTI-TENANT OWNER
  ========================= */
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Tenant",
    default: null,
    index: true
  },

  tenantSlug: {
    type: String,
    default: "",
    trim: true,
    lowercase: true,
    index: true
  },

  type: { type: String, default: "company" },
  company: { type: String, default: "" },

  entryName: { type: String, default: "" },
  entryPhone: { type: String, default: "" },

  clientName: { type: String, default: "" },
  clientPhone: { type: String, default: "" },

  // 💰 PRICE
  clientEmail: { type: String, default: "" },

  priceAmount: { type: Number, default: 0 },

  // 🚗 ROUTE DATA
  miles: { type: Number, default: 0 },

  estimatedMinutes: { type: Number, default: 0 },

  durationSeconds: { type: Number, default: 0 },

  distanceMeters: { type: Number, default: 0 },

 googleRoute: {
  type: Object,
  default: {}
},

optimizedRoute: {
  type: Object,
  default: {}
},

routePoints: {
  type: [String],
  default: []
},

routePath: {
  type: [{
    lat: { type: Number, default: null },
    lng: { type: Number, default: null }
  }],
  default: []
},

overviewPolyline: {
  type: String,
  default: ""
},

routeLocked: {
  type: Boolean,
  default: false
},

routeFinalized: {
  type: Boolean,
  default: false
},

routeSource: {
  type: String,
  default: ""
},

routeUpdatedAt: {
  type: Date,
  default: null
},

confirmedAt: {
  type: Date,
  default: null
},

pricePerPassenger: {
  type: Number,
  default: 0
},

sharedStopsCount: {
  type: Number,
  default: 0
},

sharedStopTotal: {
  type: Number,
  default: 0
},

sharedStopShare: {
  type: Number,
  default: 0
},

sharedRouteMeta: {
  type: Object,
  default: {}
},

finalPrice: {
  type: Number,
  default: 0
},

/* =========================
   DRIVER END AT INTERMEDIATE STOP
========================= */

stopExecution: {
  type: Object,
  default: null
},

endedAtStop: {
  type: Boolean,
  default: false
},

stopEndReason: {
  type: String,
  default: ""
},

stopEndAt: {
  type: Date,
  default: null
},

stopEndIndex: {
  type: Number,
  default: -1
},

stopEndAddress: {
  type: String,
  default: ""
},

stopEndMiles: {
  type: Number,
  default: 0
},

stopEndMinutes: {
  type: Number,
  default: 0
},

stopFeeApplied: {
  type: Number,
  default: 0
},

stopPricingSource: {
  type: String,
  default: ""
},

completionType: {
  type: String,
  default: ""
},

isFinalized: {
  type: Boolean,
  default: false
},

confirmationEmailSent: {
  type: Boolean,
  default: false
},

  // 🚗 VEHICLE
  vehicleTypeFromQuote: { type: String, default: "X" },

serviceType: { type: String, default: "" },

serviceKey: { type: String, default: "" },

serviceCode: { type: String, default: "" },

 // 📍 LOCATIONS
pickup: { type: String, default: "" },
dropoff: { type: String, default: "" },
stops: { type: [String], default: [] },

  // 📍 COORDINATES
  pickupLat: { type: Number, default: null },
  pickupLng: { type: Number, default: null },
  dropoffLat: { type: Number, default: null },
  dropoffLng: { type: Number, default: null },

  stopCoords: {
    type: [{
      address: { type: String, default: "" },
      lat: { type: Number, default: null },
      lng: { type: Number, default: null }
    }],
    default: []
  },

  /* =========================
     🔥 SHARED SUPPORT (IMPORTANT)
  ========================= */

  isShared: { type: Boolean, default: false },

  // 🔗 بيربط كل الركاب في نفس الرحلة
  groupId: { type: String, default: "" },

  // نوع الرحلة
  tripType: {
    type: String,
    enum: ["INDIVIDUAL", "SHARED"],
    default: "INDIVIDUAL"
  },

  // suffix يظهر في الرقم
  sharedSuffix: { type: String, default: "" },

  // ترتيب الراكب داخل الشير
  passengerIndex: { type: Number, default: 0 },

  // عدد الركاب في الجروب
  totalPassengers: { type: Number, default: 1 },

  /* =========================
     🧍 PASSENGERS (🔥 أهم إضافة)
  ========================= */

passengers: {
  type: [
    {
      passengerId: { type: String, default: "" },

      name: { type: String, default: "" },
      phone: { type: String, default: "" },

      clientName: { type: String, default: "" },
      clientPhone: { type: String, default: "" },

pickup: { type: String, default: "" },
dropoff: { type: String, default: "" },
      pickupLat: { type: Number, default: null },
      pickupLng: { type: Number, default: null },
      dropoffLat: { type: Number, default: null },
      dropoffLng: { type: Number, default: null },

      status: { type: String, default: "Scheduled" },

driverReportedFinalStatus: {
  type: Boolean,
  default: false
},

finalStatusConfirmed: {
  type: Boolean,
  default: false
},

finalStatusConfirmedAt: {
  type: Date,
  default: null
},

finalStatusConfirmedBy: {
  type: String,
  default: ""
},

reservationStatus: { type: String, default: "" },
reviewOnly: { type: Boolean, default: false },
source: { type: String, default: "" },
bookingSource: { type: String, default: "" },

      priceAmount: { type: Number, default: 0 },

      finalPrice: { type: Number, default: 0 },

cancelFee: { type: Number, default: 0 },

noShowFee: { type: Number, default: 0 },

cancelledByRole: { type: String, default: "" },

cancellationChargeable: {
  type: Boolean,
  default: null
},

/* DRIVER FINAL COMMENT */
cancelReason: { type: String, default: "" },
noShowReason: { type: String, default: "" },

pickupOrder: {
  type: Number,
  default: 0
},

dropoffOrder: {
  type: Number,
  default: 0
},

routeOrder: {
  type: Number,
  default: 0
},

passengerMiles: {
  type: Number,
  default: 0
},

passengerMinutes: {
  type: Number,
  default: 0
},

passengerDistanceMeters: {
  type: Number,
  default: 0
},

passengerDurationSeconds: {
  type: Number,
  default: 0
}
    }
  ],
  default: []
},

  /* =========================
     💳 PAYMENT
  ========================= */

  paymentIntentId: { type: String, default: "" },

  // Deferred card payment: save now, authorize 24h before, capture at finish.
  stripeCustomerId: { type: String, default: "" },
  stripePaymentMethodId: { type: String, default: "" },
  setupIntentId: { type: String, default: "" },
  authorizationPaymentIntentId: { type: String, default: "" },
  paymentStatus: {
    type: String,
    enum: [
      "NONE",
      "SETUP_PENDING",
      "PAYMENT_METHOD_SAVED",
      "PAYMENT_REQUIRED",
      "AUTHORIZED",
      "CAPTURE_FAILED",
      "PAID",
      "VOIDED"
    ],
    default: "NONE"
  },
  authorizedAmount: { type: Number, default: 0 },
  capturedAmount: { type: Number, default: 0 },
  paymentAuthorizedAt: { type: Date, default: null },
  paymentCapturedAt: { type: Date, default: null },
  authorizationExpiresAt: { type: Date, default: null },
  paymentFailureCode: { type: String, default: "" },
  paymentFailureMessage: { type: String, default: "" },
  paymentRequiredEmailSentAt: { type: Date, default: null },

  /* =========================
     🔗 CANCEL
  ========================= */

  cancelToken: { type: String, default: "" },

  /* =========================
     💰 REFUND SYSTEM
  ========================= */

  refundId: { type: String, default: "" },
  simpleRefundId: { type: String, default: "" },
  refundAmount: { type: Number, default: 0 },
  cancelFee: { type: Number, default: 0 },
  noShowFee: { type: Number, default: 0 },

  cancelDateTime: { type: Date, default: null },

  cancelledByRole: {
    type: String,
    default: ""
  },

  cancellationChargeable: {
    type: Boolean,
    default: null
  },

  refundStatus: {
    type: String,
    enum: ["none", "processing", "refunded", "failed"],
    default: "none"
  },

  /* =========================
     📅 TIME
  ========================= */

  tripDate: { type: String, default: "" },
  tripTime: { type: String, default: "" },

  notes: { type: String, default: "" },

  /* DRIVER FINAL COMMENT
     Written by the driver before Cancel / No Show.
     Separate from normal client/trip notes.
  */
  cancelReason: { type: String, default: "" },
  noShowReason: { type: String, default: "" },

  /* =========================
     🚗 DISPATCH
  ========================= */

  dispatchSelected: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },

  driverId: { type: String, default: "" },
  driverName: { type: String, default: "" },
  vehicle: { type: String, default: "" },
  driverAddress: { type: String, default: "" },
  dispatchNote: { type: String, default: "" },

  status: { type: String, default: "Scheduled" },

billingPaid: {
  type:Boolean,
  default:false
},

  /* =========================
     🔔 REMINDER
  ========================= */

 reminderSent: { type: Boolean, default: false },

/* =========================
   ROUTE CHANGE / ADD STOP REQUEST
========================= */

addStopRequest: {
  type: Object,
  default: null
},

routeChangePending: {
  type: Boolean,
  default: false
},

routeChangeStatus: {
  type: String,
  default: ""
},

finalPageEnteredAt: {
  type: Date,
  default: null
},

dispatchFinalPageEnteredAt: {
  type: Date,
  default: null
},

finalStatusConfirmed: {
  type: Boolean,
  default: false
},

finalStatusConfirmedAt: {
  type: Date,
  default: null
},

dispatchFinalConfirmedAt: {
  type: Date,
  default: null
},

sharedFinalConfirmed: {
  type: Boolean,
  default: false
},

sharedFinalConfirmedAt: {
  type: Date,
  default: null
},

finalStatusConfirmedBy: {
  type: String,
  default: ""
},

historyAt: {
  type: Date,
  default: null
},

bookedAt: { type: Date, default: Date.now },
createdAt: { type: Date, default: Date.now }

}, { minimize: false });

/* =========================
   INDEXES
========================= */
tripSchema.index({ tripNumber: 1 }, { unique: true, sparse: true });
tripSchema.index({ tenantId: 1, createdAt: -1 });
tripSchema.index({ company: 1 });
tripSchema.index({ createdAt: -1 });
tripSchema.index({ dispatchSelected: 1, disabled: 1, tripDate: 1, tripTime: 1 });
tripSchema.index({ driverId: 1, status: 1, tripDate: 1, tripTime: 1 });

const Trip =
  mongoose.models.Trip ||
  mongoose.model("Trip", tripSchema);

global.Trip = Trip;
global.User = User;


/* =========================
   TAX REPORT ROUTES
   Super Admin tax data report
========================= */

const taxReportRoutes =
  require("./routes/taxReportRoutes");

app.use(
  "/api/tax-report",
  taxReportRoutes
);

console.log(
  "✅ taxReportRoutes mounted on /api/tax-report"
);

/* =========================
   PAYROLL & EARNINGS ROUTES
========================= */

const payrollRoutes =
  require("./routes/payrollRoutes");

app.use(
  "/api/payroll",
  payrollRoutes
);

console.log(
  "✅ payrollRoutes mounted on /api/payroll"
);

/* =========================
   DEFERRED TRIP PAYMENTS
   Save card now -> Hold 24h before -> Capture after trip
========================= */

const tripPaymentRoutes =
  require("./routes/tripPaymentRoutes");

app.use(
  "/api/trip-payment",
  tripPaymentRoutes
);

tripPaymentRoutes.startTripAuthorizationScheduler();

/* =========================
   CUSTOMER ADD STOP ROUTES
========================= */

const customerAddStopRoutes =
  require("./routes/customerAddStopRoutes");

app.use(
  "/api/customer-add-stop",
  customerAddStopRoutes
);

console.log(
  "customerAddStopRoutes mounted on /api/customer-add-stop"
);

/* ==============================
   COMPANY REVIEW CONFIRM ROUTES
   Company shared confirm
   Server route ordering + company/facility pricing
============================== */

const companyReviewConfirmRoutes =
  require("./routes/companyReviewConfirmRoutes");

app.use(
  "/api/company-review",
  companyReviewConfirmRoutes
);

console.log(
  "✅ companyReviewConfirmRoutes mounted on /api/company-review"
);

/* ==============================
   DISPATCH RESERVED CONFIRM ROUTES
   Server-side route ordering + pricing lock
============================== */

const dispatchReservedConfirmRoutes =
  require("./routes/dispatchReservedConfirmRoutes");

app.use(
  "/api/dispatch-reserved-confirm",
  dispatchReservedConfirmRoutes
);

console.log(
  "✅ dispatchReservedConfirmRoutes mounted on /api/dispatch-reserved-confirm"
);

/* ==============================
   DISPATCH FINAL CONFIRMATION ROUTES
============================== */

const dispatchFinalConfirmationRoutes =
  require("./routes/dispatchFinalConfirmationRoutes");

app.use(
  "/api/dispatch-final-confirmation",
  dispatchFinalConfirmationRoutes
);

/* ==============================
   DISPATCH REVIEW ROUTES
============================== */

const dispatchReviewRoutes =
  require("./routes/dispatchReviewRoutes");

app.use(
  "/api/dispatch-review",
  dispatchReviewRoutes
);
/* =========================
   ADMIN SUMMARY ROUTES
   لازم بعد Trip model
========================= */

const adminSummaryRoutes =
  require("./routes/adminSummaryRoutes");

app.use(
  "/api/admin-summary",
  adminSummaryRoutes
);

console.log("✅ adminSummaryRoutes mounted on /api/admin-summary");

/* =========================
   COMPANY ADD STOP ROUTES
   لازم بعد Trip model
========================= */

const companyAddStopRoutes =
  require("./routes/companyAddStopRoutes");

app.use(
  "/api/company",
  companyAddStopRoutes
);

console.log("✅ companyAddStopRoutes mounted on /api/company");

/* =========================
   RESERVED ADD STOP ROUTES
   Must stay after Trip model
========================= */

const reservedAddStopRoutes =
  require("./routes/reservedAddStopRoutes");

app.use(
  "/api/reserved",
  reservedAddStopRoutes
);

console.log("✅ reservedAddStopRoutes mounted on /api/reserved");
/* ==============================
   DISPATCH ROUTES
============================== */

const dispatchRoutes =
  require("./routes/dispatchRoutes");

app.use(
  "/api/dispatch",
  dispatchRoutes
);

/* =========================
   GEO CACHE
========================= */
const geoCache = new Map();

/* =========================
   HELPERS
========================= */
function getArizonaTime() {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "America/Phoenix" })
  );
}

function normalizeTripType(rawType) {
  const t = String(rawType || "").trim().toLowerCase();

  if (t === "reserved") return "reserved";
  if (t === "individual") return "individual";
  if (t === "company") return "company";
  if (t === "shared") return "shared";
  if (t === "quote") return "quote";

  return "company";
}

function normalizeText(v) {
  return String(v || "").trim();
}

function normalizeNumber(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/* =========================
   TENANT AUTH - STAGE 1
   Used by secure tenant-only APIs.
========================= */

function readBearerToken(req){

  const header =
    String(
      req.headers?.authorization || ""
    ).trim();

  if(
    !header.toLowerCase().startsWith(
      "bearer "
    )
  ){
    return "";
  }

  return header.slice(7).trim();
}

function requireTenantApi(
  req,
  res,
  next
){

  const token =
    readBearerToken(req);

  if(!token){

    return res.status(401).json({
      message:"Access Denied"
    });

  }

  try{

    const verified =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.authUser = {
      id:
        verified.id || null,

      role:
        verified.role || "",

      tenantId:
        verified.tenantId || null
    };

    if(
      req.authUser.role ===
      "PLATFORM_ADMIN"
    ){
      return next();
    }

    if(!req.authUser.tenantId){

      return res.status(403).json({
        message:"Tenant Required"
      });

    }

    next();

  }catch(err){

    return res.status(401).json({
      message:"Invalid Token"
    });

  }
}


/* =========================
   TENANT QUERY HELPERS
========================= */

function tenantFilter(
  req,
  extra = {}
){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){

    const requestedTenantId =
      String(
        req.query?.tenantId ||
        req.body?.tenantId ||
        ""
      ).trim();

    if(requestedTenantId){

      return {
        ...extra,
        tenantId:requestedTenantId
      };
    }

    return {
      ...extra
    };
  }

  return {
    ...extra,
    tenantId:
      req.authUser?.tenantId
  };
}

function tenantIdForCreate(req){

  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){

    return String(
      req.body?.tenantId ||
      req.query?.tenantId ||
      ""
    ).trim();
  }

  return String(
    req.authUser?.tenantId ||
    ""
  ).trim();
}


/* =========================
   OPTIONAL TENANT AUTH
   Used by /api/trips so both:
   - logged-in staff bookings
   - public tenant Get Quote bookings
   can use the same endpoint safely.
========================= */

function optionalTenantApi(
  req,
  res,
  next
){

  const token =
    readBearerToken(req);

  req.authUser = null;

  if(!token){
    return next();
  }

  try{

    const verified =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.authUser = {
      id:
        verified.id || null,

      role:
        verified.role || "",

      tenantId:
        verified.tenantId || null
    };

    return next();

  }catch(err){

    return res.status(401).json({
      message:"Invalid Token"
    });

  }
}

function cleanTenantSlug(value){

  return String(value || "")
    .trim()
    .toLowerCase();

}

function normalizeTenantServiceCode(value){

  const c =
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[_-]+/g," ")
      .replace(/\s+/g," ");

  if(
    c === "ST" ||
    c === "STANDARD" ||
    c.includes("STANDARD")
  ){
    return "ST";
  }

  if(
    c === "WH" ||
    c === "WC" ||
    c === "WHEELCHAIR" ||
    c === "WHEEL CHAIR" ||
    c.includes("WHEELCHAIR") ||
    c.includes("WHEEL CHAIR")
  ){
    return "WH";
  }

  if(
    c === "SH" ||
    c === "SHARED" ||
    c.includes("SHARED")
  ){
    return "SH";
  }

  if(
    c === "LM" ||
    c === "LIMO" ||
    c === "LIMOUSINE" ||
    c.includes("LIMOUSINE") ||
    c.startsWith("LIMO ")
  ){
    return "LM";
  }

  if(
    c === "TX" ||
    c === "TAXI" ||
    c.includes("TAXI")
  ){
    return "TX";
  }

  if(
    c === "XL" ||
    c === "XL SERVICE" ||
    c.startsWith("XL ")
  ){
    return "XL";
  }

  return c;
}

async function resolveTripTenant(req){

  /*
    Logged-in tenant users:
    tenantId comes ONLY from JWT.
  */
  if(
    req.authUser &&
    req.authUser.role !==
    "PLATFORM_ADMIN"
  ){

    const tenantId =
      String(
        req.authUser.tenantId ||
        ""
      ).trim();

    if(!tenantId){

      throw Object.assign(
        new Error("Tenant Required"),
        { statusCode:403 }
      );
    }

    const tenant =
      await Tenant.findOne({
        _id:tenantId,
        enabled:true,
        subscriptionStatus:{
          $in:["ACTIVE","TRIAL"]
        }
      })
      .lean();

    if(!tenant){

      throw Object.assign(
        new Error(
          "Organization unavailable"
        ),
        { statusCode:403 }
      );
    }

    return tenant;
  }

  /*
    PLATFORM_ADMIN may explicitly provide tenantId.
  */
  if(
    req.authUser?.role ===
    "PLATFORM_ADMIN"
  ){

    const requestedTenantId =
      String(
        req.body?.tenantId ||
        ""
      ).trim();

    if(!requestedTenantId){

      throw Object.assign(
        new Error("Tenant Required"),
        { statusCode:403 }
      );
    }

    const tenant =
      await Tenant.findOne({
        _id:requestedTenantId,
        enabled:true
      })
      .lean();

    if(!tenant){

      throw Object.assign(
        new Error(
          "Organization not found"
        ),
        { statusCode:404 }
      );
    }

    return tenant;
  }

  /*
    PUBLIC BOOKING:
    NEVER trust tenantId from browser.
    Only accept tenantSlug, then resolve the real
    tenantId on the server.
  */
  const tenantSlug =
    cleanTenantSlug(
      req.body?.tenantSlug ||
      req.body?.tenant ||
      ""
    );

  if(
    !tenantSlug ||
    !/^[a-z0-9-]+$/.test(
      tenantSlug
    )
  ){

    throw Object.assign(
      new Error(
        "Tenant Required"
      ),
      { statusCode:400 }
    );
  }

  const tenant =
    await Tenant.findOne({
      slug:tenantSlug,
      enabled:true,
      subscriptionStatus:{
        $in:["ACTIVE","TRIAL"]
      }
    })
    .lean();

  if(!tenant){

    throw Object.assign(
      new Error(
        "Organization not found or inactive"
      ),
      { statusCode:404 }
    );
  }

  return tenant;
}

function parseStops(stops) {
  if (!Array.isArray(stops)) return [];
  return stops.map(s => normalizeText(s)).filter(Boolean);
}

function parseStopCoords(stopCoords) {
  if (!Array.isArray(stopCoords)) return [];
  return stopCoords.map(sc => ({
    address: normalizeText(sc?.address),
    lat: normalizeNumber(sc?.lat),
    lng: normalizeNumber(sc?.lng)
  }));
}

function getFreshLiveDriversArray() {

  const now = Date.now();
  const maxAge = 1000 * 60 * 5;

  return Array.from(global.liveDrivers.values())
    .filter(driver => {
      return now - driver.time <= maxAge;
    });

}

function toRad(v) {
  return v * Math.PI / 180;
}

function calcDistanceKm(lat1, lng1, lat2, lng2) {
  if (
    lat1 === null || lng1 === null ||
    lat2 === null || lng2 === null ||
    lat1 === undefined || lng1 === undefined ||
    lat2 === undefined || lng2 === undefined
  ) {
    return Number.MAX_SAFE_INTEGER;
  }

  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/* =========================
   GLOBAL TIMEZONE ENGINE
========================= */

let SYSTEM_TIMEZONE =
  "America/Phoenix";

/* =========================
   LOAD SYSTEM TIMEZONE
========================= */

async function loadSystemTimezone(){

  try{

    const settings =
      await SystemDesign.findOne({});

    SYSTEM_TIMEZONE =

      settings?.timezone ||

      "America/Phoenix";

    console.log(
      "🌍 SYSTEM TIMEZONE:",
      SYSTEM_TIMEZONE
    );

  }catch(err){

    console.log(
      "TIMEZONE LOAD ERROR:",
      err?.message || err
    );

    SYSTEM_TIMEZONE =
      "America/Phoenix";

  }

}

/* =========================
   SYSTEM NOW
========================= */

function getSystemNow(){

  return new Date(

    new Date().toLocaleString(
      "en-US",
      {
        timeZone:
          SYSTEM_TIMEZONE
      }
    )

  );

}

/* =========================
   PARSE TRIP DATE TIME
========================= */

function parseTripDateTime(
  tripDate,
  tripTime
){

  const d =
    normalizeText(tripDate);

  if(!d){
    return null;
  }

  const t =
    normalizeText(tripTime)
    || "00:00";

  const iso =
    `${d}T${t}`;

  const dt =
    new Date(iso);

  if(
    Number.isNaN(
      dt.getTime()
    )
  ){
    return null;
  }

  return dt;

}

/* =========================
   SORT TRIPS
========================= */

function sortTripsByDateTime(
  trips
){

  return [...trips].sort(
    (a,b)=>{

      const da =
        parseTripDateTime(
          a.tripDate,
          a.tripTime
        );

      const db =
        parseTripDateTime(
          b.tripDate,
          b.tripTime
        );

      const ta =
        da
        ? da.getTime()
        : 0;

      const tb =
        db
        ? db.getTime()
        : 0;

      if(ta !== tb){

        return ta - tb;

      }

      const aNum =
        normalizeText(
          a.tripNumber
        );

      const bNum =
        normalizeText(
          b.tripNumber
        );

      return aNum.localeCompare(
        bNum
      );

    }
  );

}

/* =========================
   GET DAY SHORT
========================= */

function getDayShort(dateStr){

  const d =
    normalizeText(dateStr);

  if(!d){
    return "";
  }

  const dt =
    new Date(
      `${d}T12:00:00`
    );

  if(
    Number.isNaN(
      dt.getTime()
    )
  ){
    return "";
  }

  return dt.toLocaleDateString(
    "en-US",
    {
      weekday:"short",
      timeZone:
        SYSTEM_TIMEZONE
    }
  );

}

function isDriverEnabledBySchedule(driverId, schedule) {
  const s = schedule[String(driverId)] || null;
  if (!s) return true;
  return s.enabled === true;
}

function isDriverWorkingThatDay(driverId, tripDate, schedule) {
  const s = schedule[String(driverId)] || null;
  if (!s) return true;
  if (s.enabled !== true) return false;

  const days = s.days || {};
  const dayShort = getDayShort(tripDate);

  if (!dayShort) return true;

  if (Object.keys(days).length === 0) return true;

  return days[dayShort] === true;
}

function buildDriverAddress(driver, scheduleRow) {
  const scheduleAddress = normalizeText(scheduleRow?.address);
  const userAddress = normalizeText(driver?.address);
  return scheduleAddress || userAddress || "";
}

function buildDriverVehicle(driver, scheduleRow) {
  const scheduleVehicle = normalizeText(scheduleRow?.vehicleNumber);
  const userVehicle = normalizeText(driver?.vehicleNumber);
  return scheduleVehicle || userVehicle || "";
}

function buildDriverPhone(driver, scheduleRow) {
  const schedulePhone = normalizeText(scheduleRow?.phone);
  const userPhone = normalizeText(driver?.phone);
  return schedulePhone || userPhone || "";
}

async function geocodeAddress(address) {
  const q = normalizeText(address);
  if (!q) return { lat: null, lng: null };

  const cacheKey = q.toLowerCase();
  if (geoCache.has(cacheKey)) {
    return geoCache.get(cacheKey);
  }

  try {
    if (typeof fetch !== "function") {
      return { lat: null, lng: null };
    }

    const GOOGLE_KEY = process.env.GOOGLE_KEY;

const settings =
  await SystemDesign.findOne({});

const region =
  settings?.region || "";

const country =
  settings?.country || "";

const searchAddress =
  [
    q,
    region,
    country
  ]
  .filter(Boolean)
  .join(", ");

const url =
`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(searchAddress)}&key=${GOOGLE_KEY}`;

    const resp = await fetch(url);
    const data = await resp.json();

    const first = data?.results?.[0];

    const result = {
      lat: first?.geometry?.location?.lat ?? null,
      lng: first?.geometry?.location?.lng ?? null
    };

    geoCache.set(cacheKey, result);
    return result;
  } catch (err) {
    console.log("Geocode error:", err?.message || err);
    return { lat: null, lng: null };
  }
}

async function ensureTripCoords(trip) {

  if(!trip){
    return trip;
  }

  function coordOk(lat,lng){

    const a =
      normalizeNumber(lat);

    const b =
      normalizeNumber(lng);

    return (
      a !== null &&
      b !== null &&
      a >= -90 &&
      a <= 90 &&
      b >= -180 &&
      b <= 180 &&
      !(a === 0 && b === 0)
    );
  }

  function addressKey(v){

    return normalizeText(v)
      .toLowerCase()
      .replace(/[.,#]/g," ")
      .replace(/\s+/g," ")
      .trim();
  }

  function readLat(v){

    if(v === undefined || v === null){
      return null;
    }

    if(typeof v === "function"){
      try{
        return normalizeNumber(v());
      }catch{
        return null;
      }
    }

    return normalizeNumber(v);
  }

  function readLng(v){

    if(v === undefined || v === null){
      return null;
    }

    if(typeof v === "function"){
      try{
        return normalizeNumber(v());
      }catch{
        return null;
      }
    }

    return normalizeNumber(v);
  }

  function pointFromLocation(location){

    if(!location){
      return null;
    }

    const lat =
      readLat(
        location.lat ??
        location.latitude
      );

    const lng =
      readLng(
        location.lng ??
        location.lon ??
        location.longitude
      );

    return coordOk(lat,lng)
      ? {lat,lng}
      : null;
  }

  function getSavedRouteLegs(){

    const candidates = [

      trip?.googleRoute?.legs,

      trip?.googleRoute?.routes?.[0]?.legs,

      trip?.optimizedRoute?.legs,

      trip?.optimizedRoute?.routes?.[0]?.legs

    ];

    for(const rows of candidates){

      if(
        Array.isArray(rows) &&
        rows.length
      ){
        return rows;
      }
    }

    return [];
  }

  function extractLegPoint(
    leg,
    side
  ){

    if(!leg){
      return null;
    }

    const prefix =
      side === "start"
        ? "start"
        : "end";

    const directLat =
      normalizeNumber(
        leg?.[`${prefix}Lat`] ??
        leg?.[`${prefix}_lat`]
      );

    const directLng =
      normalizeNumber(
        leg?.[`${prefix}Lng`] ??
        leg?.[`${prefix}Lon`] ??
        leg?.[`${prefix}_lng`]
      );

    if(
      coordOk(
        directLat,
        directLng
      )
    ){
      return {
        lat:directLat,
        lng:directLng
      };
    }

    return (
      pointFromLocation(
        leg?.[`${prefix}Location`]
      ) ||
      pointFromLocation(
        leg?.[`${prefix}_location`]
      ) ||
      pointFromLocation(
        leg?.[`${prefix}Point`]
      )
    );
  }

  function extractLegAddress(
    leg,
    side
  ){

    const prefix =
      side === "start"
        ? "start"
        : "end";

    return normalizeText(
      leg?.[`${prefix}Address`] ??
      leg?.[`${prefix}_address`] ??
      ""
    );
  }

  /*
    IMPORTANT:
    First use the saved Google route already stored on the Trip.
    This costs ZERO new Directions / Geocode requests.
  */
  const savedLegs =
    getSavedRouteLegs();

  const savedCoordMap =
    new Map();

  if(savedLegs.length){

    savedLegs.forEach(
      leg=>{

        const startAddress =
          extractLegAddress(
            leg,
            "start"
          );

        const endAddress =
          extractLegAddress(
            leg,
            "end"
          );

        const startPoint =
          extractLegPoint(
            leg,
            "start"
          );

        const endPoint =
          extractLegPoint(
            leg,
            "end"
          );

        if(
          startAddress &&
          startPoint
        ){
          savedCoordMap.set(
            addressKey(startAddress),
            {
              address:startAddress,
              ...startPoint
            }
          );
        }

        if(
          endAddress &&
          endPoint
        ){
          savedCoordMap.set(
            addressKey(endAddress),
            {
              address:endAddress,
              ...endPoint
            }
          );
        }
      }
    );
  }

  function findSavedPoint(address){

    const key =
      addressKey(
        address
      );

    if(
      key &&
      savedCoordMap.has(key)
    ){
      return savedCoordMap.get(key);
    }

    return null;
  }

  async function resolvePoint(
    address,
    lat,
    lng
  ){

    let finalLat =
      normalizeNumber(lat);

    let finalLng =
      normalizeNumber(lng);

    if(
      coordOk(
        finalLat,
        finalLng
      )
    ){
      return {
        lat:finalLat,
        lng:finalLng,
        source:"trip"
      };
    }

    const saved =
      findSavedPoint(
        address
      );

    if(
      saved &&
      coordOk(
        saved.lat,
        saved.lng
      )
    ){
      return {
        lat:saved.lat,
        lng:saved.lng,
        source:"saved-route"
      };
    }

    /*
      Last fallback only:
      server geocodes one time if the Trip has never stored coordinates
      and no saved route contains them.
    */
    const cleanAddress =
      normalizeText(
        address
      );

    if(!cleanAddress){
      return {
        lat:null,
        lng:null,
        source:"missing"
      };
    }

    const geo =
      await geocodeAddress(
        cleanAddress
      );

    finalLat =
      normalizeNumber(
        geo?.lat
      );

    finalLng =
      normalizeNumber(
        geo?.lng
      );

    return {
      lat:finalLat,
      lng:finalLng,
      source:
        coordOk(
          finalLat,
          finalLng
        )
          ? "server-geocode"
          : "missing"
    };
  }

  let changed = false;

  /* =========================
     TRIP PICKUP
  ========================= */

  const pickup =
    await resolvePoint(
      trip.pickup,
      trip.pickupLat,
      trip.pickupLng
    );

  if(
    normalizeNumber(
      trip.pickupLat
    ) !== pickup.lat ||
    normalizeNumber(
      trip.pickupLng
    ) !== pickup.lng
  ){
    changed = true;
  }

  trip.pickupLat =
    pickup.lat;

  trip.pickupLng =
    pickup.lng;

  /* =========================
     TRIP DROPOFF
  ========================= */

  const dropoff =
    await resolvePoint(
      trip.dropoff,
      trip.dropoffLat,
      trip.dropoffLng
    );

  if(
    normalizeNumber(
      trip.dropoffLat
    ) !== dropoff.lat ||
    normalizeNumber(
      trip.dropoffLng
    ) !== dropoff.lng
  ){
    changed = true;
  }

  trip.dropoffLat =
    dropoff.lat;

  trip.dropoffLng =
    dropoff.lng;

  /* =========================
     NORMAL STOPS
  ========================= */

  const stops =
    Array.isArray(
      trip.stops
    )
      ? trip.stops
          .map(normalizeText)
          .filter(Boolean)
      : [];

  const oldStopCoords =
    Array.isArray(
      trip.stopCoords
    )
      ? trip.stopCoords
      : [];

  const oldByAddress =
    new Map();

  oldStopCoords.forEach(
    row=>{

      const key =
        addressKey(
          row?.address
        );

      if(key){
        oldByAddress.set(
          key,
          row
        );
      }
    }
  );

  const nextStopCoords = [];

  for(
    let i=0;
    i<stops.length;
    i++
  ){

    const stopAddress =
      stops[i];

    const old =
      oldByAddress.get(
        addressKey(
          stopAddress
        )
      ) ||
      oldStopCoords[i] ||
      {};

    const point =
      await resolvePoint(
        stopAddress,
        old?.lat,
        old?.lng
      );

    nextStopCoords.push({
      address:stopAddress,
      lat:point.lat,
      lng:point.lng
    });
  }

  if(
    JSON.stringify(
      parseStopCoords(
        oldStopCoords
      )
    ) !==
    JSON.stringify(
      nextStopCoords
    )
  ){
    changed = true;
  }

  trip.stopCoords =
    nextStopCoords;

  /* =========================
     SHARED PASSENGERS
  ========================= */

  if(
    Array.isArray(
      trip.passengers
    ) &&
    trip.passengers.length
  ){

    const nextPassengers = [];

    for(
      let i=0;
      i<trip.passengers.length;
      i++
    ){

      const source =
        trip.passengers[i];

      const p =
        source?.toObject
          ? source.toObject()
          : {
              ...source
            };

      const passengerPickup =
        normalizeText(
          p.pickup ||
          trip.pickup
        );

      const passengerDropoff =
        normalizeText(
          p.dropoff ||
          trip.dropoff
        );

      const pu =
        await resolvePoint(
          passengerPickup,
          p.pickupLat,
          p.pickupLng
        );

      const dr =
        await resolvePoint(
          passengerDropoff,
          p.dropoffLat,
          p.dropoffLng
        );

      if(
        normalizeNumber(
          p.pickupLat
        ) !== pu.lat ||
        normalizeNumber(
          p.pickupLng
        ) !== pu.lng ||
        normalizeNumber(
          p.dropoffLat
        ) !== dr.lat ||
        normalizeNumber(
          p.dropoffLng
        ) !== dr.lng
      ){
        changed = true;
      }

      nextPassengers.push({
        ...p,

        pickup:
          passengerPickup,

        pickupLat:
          pu.lat,

        pickupLng:
          pu.lng,

        dropoff:
          passengerDropoff,

        dropoffLat:
          dr.lat,

        dropoffLng:
          dr.lng
      });
    }

    trip.passengers =
      nextPassengers;
  }

  /* =========================
     SAVE REPAIRED COORDS
  ========================= */

  if(
    changed &&
    trip._id
  ){

    try{

      await Trip.findByIdAndUpdate(
        trip._id,
        {
          $set:{

            pickupLat:
              trip.pickupLat,

            pickupLng:
              trip.pickupLng,

            dropoffLat:
              trip.dropoffLat,

            dropoffLng:
              trip.dropoffLng,

            stopCoords:
              trip.stopCoords ||
              [],

            passengers:
              trip.passengers ||
              []
          }
        }
      );

    }catch(err){

      console.log(
        "Trip coord save error:",
        err?.message ||
        err
      );
    }
  }

  return trip;
}

/*
  Dispatch routes can call the same central coordinate engine.
*/
global.ensureTripCoords =
  ensureTripCoords;

async function ensureDriverScheduleCoords(
  driverId,
  scheduleRow,
  tenantId = ""
) {
  const address = normalizeText(scheduleRow?.address);

  if(!address){
    return {...scheduleRow,lat:null,lng:null};
  }

  const lat = normalizeNumber(scheduleRow?.lat);
  const lng = normalizeNumber(scheduleRow?.lng);

  if(
    lat !== null &&
    lng !== null &&
    !(lat === 0 && lng === 0)
  ){
    return {...scheduleRow,lat,lng};
  }

  const geo = await geocodeAddress(address);

  if(geo.lat === null || geo.lng === null){
    return {...scheduleRow,lat:null,lng:null};
  }

  try{
    const filter = {driverId:String(driverId)};
    if(tenantId) filter.tenantId = tenantId;

    await DriverSchedule.findOneAndUpdate(
      filter,
      {$set:{address,lat:Number(geo.lat),lng:Number(geo.lng)}}
    );
  }catch(err){
    console.log("Driver schedule coord save error:",err?.message || err);
  }

  return {
    ...scheduleRow,
    address,
    lat:Number(geo.lat),
    lng:Number(geo.lng)
  };
}

global.ensureDriverScheduleCoords =
  ensureDriverScheduleCoords;


const dispatchAddressPointCache =
  global.__dispatchAddressPointCache ||
  new Map();

global.__dispatchAddressPointCache =
  dispatchAddressPointCache;

async function resolveDispatchAddressPoint(address){

  const cleanAddress =
    normalizeText(address);

  if(!cleanAddress){
    return null;
  }

  const key =
    cleanAddress
      .toLowerCase()
      .replace(/[.,#]/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(dispatchAddressPointCache.has(key)){
    return dispatchAddressPointCache.get(key);
  }

  const geo =
    await geocodeAddress(cleanAddress);

  const lat =
    normalizeNumber(geo?.lat);

  const lng =
    normalizeNumber(geo?.lng);

  if(
    lat === null ||
    lng === null ||
    (lat === 0 && lng === 0)
  ){
    return null;
  }

  const p = {
    lat:Number(lat),
    lng:Number(lng)
  };

  dispatchAddressPointCache.set(key,p);

  return p;
}

global.resolveDispatchAddressPoint =
  resolveDispatchAddressPoint;


/* =========================
   COMPANY TRIP NUMBER
========================= */

async function generateCompanyTripNumber(serviceType = "STANDARD"){

  const now = getArizonaTime();

  const months = [
    "JA", "FE", "MA", "AP", "MY", "JN",
    "JL", "AU", "SE", "OC", "NO", "DE"
  ];

  const monthCode =
    months[now.getMonth()];

  let suffix = "ST";

  const clean =
    String(serviceType || "")
      .trim()
      .toUpperCase();

  if(clean === "XL"){
    suffix = "XL";
  }
  else if(clean === "WHEELCHAIR"){
    suffix = "WH";
  }
  else if(clean === "TAXI"){
    suffix = "TX";
  }
  else if(clean === "LIMO"){
    suffix = "LM";
  }
  else if(clean === "SHARED"){
    suffix = "SH";
  }

 const lastTrip =
await Trip.findOne({

tripNumber:{
$regex:
new RegExp(
"^" +
monthCode +
"-\\d+-" +
suffix +
"$"
)
}

})
.sort({
createdAt:-1,
_id:-1
});


  let next = 1000;

if(lastTrip?.tripNumber){

const parts =
lastTrip.tripNumber.split("-");

const num =
Number(parts[1]);

if(!isNaN(num)){

next = num + 1;

}

}

const exists =
await Trip.findOne({
tripNumber:
`${monthCode}-${next}-${suffix}`
});

if(exists){

next++;

}

return `${monthCode}-${next}-${suffix}`;
}

/* =========================
   GENERATE TRIP NUMBER
========================= */

async function generateTripNumber(type, serviceKey = "") {
/* =========================
   SERVICE SUFFIX
========================= */

const cleanKey =
  String(serviceKey || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g,"");

let suffix = "ST";

if(cleanKey === "XL"){
  suffix = "XL";
}
else if(cleanKey === "WHEELCHAIR"){
  suffix = "WH";
}
else if(cleanKey === "TAXI"){
  suffix = "TX";
}
else if(cleanKey === "LIMO"){
  suffix = "LM";
}
else if(cleanKey === "SHARED"){
  suffix = "SH";
} 

 /* =========================
     RESERVED
  ========================= */

if (type === "reserved") {

  const lastTrip = await Trip.findOne({
    tripNumber: { $regex: /^RV-\d+(-[A-Z]+)?$/ }
  }).sort({ createdAt: -1, _id: -1 });

  let next = 1001;

  if (lastTrip?.tripNumber) {
    const match = lastTrip.tripNumber.match(/^RV-(\d+)/);
    if (match) next = Number(match[1]) + 1;
  }

  let tripNumber = `RV-${next}`;

  if(suffix){
    tripNumber += `-${suffix}`;
  }

  return tripNumber;
}

/* =========================
   INDIVIDUAL
========================= */

if (type === "individual") {

  const lastTrip = await Trip.findOne({
    tripNumber: { $regex: /^IN-\d+/ }
  }).sort({ createdAt: -1, _id: -1 });

  let next = 1001;

  if (lastTrip?.tripNumber) {

    const match =
      lastTrip.tripNumber.match(/\d+/);

    if (match) {
      next = Number(match[0]) + 1;
    }

  }

  let tripNumber = `IN-${next}`;

  if (suffix) {
    tripNumber += `-${suffix}`;
  }

  return tripNumber;
}

  /* =========================
     MONTHLY
  ========================= */

  const now = getArizonaTime();

  const months = [
    "JA", "FE", "MA", "AP", "MY", "JN",
    "JL", "AU", "SE", "OC", "NO", "DE"
  ];

  const monthCode = months[now.getMonth()];

  const startMonth =
    new Date(now.getFullYear(), now.getMonth(), 1);

  const endMonth =
    new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const lastTrip = await Trip.findOne({
    createdAt: { $gte: startMonth, $lt: endMonth },
    tripNumber: {
      $regex: new RegExp("^" + monthCode + "-")
    }
  }).sort({ createdAt: -1, _id: -1 });

  let next = 1000;

  if (lastTrip?.tripNumber) {
    const parts = lastTrip.tripNumber.split("-");
    const num = parseInt(parts[1], 10);
    if (!isNaN(num)) next = num + 1;
  }

  let tripNumber = monthCode + "-" + next;

if (type === "shared" || type === "SHARED") {

  if(!tripNumber.endsWith("-SH")){
    tripNumber += "-SH";
  }

}else if(suffix){

  tripNumber = `${tripNumber}-${suffix}`;

}

  return tripNumber;
}

/* =========================
   SMART DISPATCH ENGINE
========================= */
function assignTripToDriverState(ds, trip, scheduleRow) {
  trip.driverId = String(ds.driver._id);
  trip.driverName = normalizeText(ds.driver.name);
  trip.vehicle = buildDriverVehicle(ds.driver, scheduleRow);
  trip.driverAddress = buildDriverAddress(ds.driver, scheduleRow);

  if (
    normalizeText(trip.status) === "" ||
    normalizeText(trip.status).toLowerCase() === "scheduled" ||
    normalizeText(trip.status).toLowerCase() === "booked"
  ) {
    trip.status = "Auto Assigned";
  }

  ds.assignedTrips.push(trip);
  ds.currentLat = normalizeNumber(trip.dropoffLat) ?? ds.currentLat;
  ds.currentLng = normalizeNumber(trip.dropoffLng) ?? ds.currentLng;
  ds.lastTripDate = normalizeText(trip.tripDate);
  ds.lastTripTime = normalizeText(trip.tripTime);
}

function buildLockedAssignedTripMap(trips) {
  const map = new Map();

  for (const trip of trips) {
    const driverId = normalizeText(trip.driverId);
    if (!driverId) continue;

    if (!map.has(driverId)) map.set(driverId, []);
    map.get(driverId).push(trip);
  }

  for (const [driverId, arr] of map.entries()) {
    map.set(driverId, sortTripsByDateTime(arr));
  }

  return map;
}

function getDriverStateBase(driver, scheduleRow) {
  return {
    driver,
    currentLat: normalizeNumber(scheduleRow?.lat),
    currentLng: normalizeNumber(scheduleRow?.lng),
    assignedTrips: [],
    firstRoundDoneByDate: new Set(),
    lastTripDate: "",
    lastTripTime: ""
  };
}

function canDriverTakeTrip(driverState, trip, schedule) {
  const driverId = String(driverState.driver._id);

  if (!isDriverEnabledBySchedule(driverId, schedule)) return false;
  if (!isDriverWorkingThatDay(driverId, trip.tripDate, schedule)) return false;

  return true;
}

function groupTripsByDate(trips) {
  const map = new Map();

  for (const trip of sortTripsByDateTime(trips)) {
    const dateKey = normalizeText(trip.tripDate) || "NO_DATE";
    if (!map.has(dateKey)) map.set(dateKey, []);
    map.get(dateKey).push(trip);
  }

  return map;
}

function getNearestTripFromPoint(pointLat, pointLng, trips) {
  let bestTrip = null;
  let bestDistance = Number.MAX_SAFE_INTEGER;

  for (const trip of trips) {
    const pLat = normalizeNumber(trip.pickupLat);
    const pLng = normalizeNumber(trip.pickupLng);
    const dist = calcDistanceKm(pointLat, pointLng, pLat, pLng);

    if (dist < bestDistance) {
      bestDistance = dist;
      bestTrip = trip;
    }
  }

  return bestTrip;
}

function removeTripFromArray(arr, targetTrip) {
  const idx = arr.findIndex(t => String(t._id) === String(targetTrip._id));
  if (idx !== -1) arr.splice(idx, 1);
}

async function autoAssignTrips({ trips, drivers, schedule }) {
  const preparedTrips = sortTripsByDateTime([...trips]);

  for (const trip of preparedTrips) {
    await ensureTripCoords(trip);
  }

  const dateGroups = groupTripsByDate(preparedTrips);

  const driverStates = [];

  for (const driver of drivers) {
    const id = String(driver._id);
    const baseSchedule = schedule[id] || {
      phone: "",
      address: normalizeText(driver.address),
      lat: null,
      lng: null,
      vehicleNumber: normalizeText(driver.vehicleNumber),
      enabled: true,
      days: {}
    };

    const safeSchedule =
      await ensureDriverScheduleCoords(
        id,
        baseSchedule,
        String(
          driver.tenantId ||
          ""
        )
      );
    schedule[id] = safeSchedule;

    driverStates.push(getDriverStateBase(driver, safeSchedule));
  }

  const lockedMap = buildLockedAssignedTripMap(preparedTrips);

  for (const ds of driverStates) {
    const driverId = String(ds.driver._id);
    const existingTrips = lockedMap.get(driverId) || [];
    const scheduleRow = schedule[driverId] || {};

    for (const trip of existingTrips) {
      assignTripToDriverState(ds, trip, scheduleRow);
      ds.firstRoundDoneByDate.add(normalizeText(trip.tripDate) || "NO_DATE");
    }
  }

  const finalTrips = [];

  for (const [dateKey, allTripsForDate] of dateGroups.entries()) {
    const lockedTrips = [];
    const unassignedTrips = [];

    for (const trip of allTripsForDate) {
      if (normalizeText(trip.driverId)) {
        lockedTrips.push(trip);
      } else {
        unassignedTrips.push(trip);
      }
    }

    const remaining = [...unassignedTrips];

    for (const ds of driverStates) {
      const driverId = String(ds.driver._id);
      const scheduleRow = schedule[driverId] || {};

      if (ds.firstRoundDoneByDate.has(dateKey)) continue;
      if (!isDriverEnabledBySchedule(driverId, schedule)) continue;
      if (!isDriverWorkingThatDay(driverId, dateKey, schedule)) continue;

      const candidateTrips = remaining.filter(trip =>
        canDriverTakeTrip(ds, trip, schedule)
      );

      if (candidateTrips.length === 0) continue;

      const nearest = getNearestTripFromPoint(ds.currentLat, ds.currentLng, candidateTrips);
      if (!nearest) continue;

      assignTripToDriverState(ds, nearest, scheduleRow);
      ds.firstRoundDoneByDate.add(dateKey);
      removeTripFromArray(remaining, nearest);
    }

    while (remaining.length > 0) {
      let assignedThisLoop = false;

      for (const ds of driverStates) {
        const driverId = String(ds.driver._id);
        const scheduleRow = schedule[driverId] || {};

        if (!isDriverEnabledBySchedule(driverId, schedule)) continue;
        if (!isDriverWorkingThatDay(driverId, dateKey, schedule)) continue;

        const candidateTrips = remaining.filter(trip =>
          canDriverTakeTrip(ds, trip, schedule)
        );

        if (candidateTrips.length === 0) continue;

        const nearest = getNearestTripFromPoint(ds.currentLat, ds.currentLng, candidateTrips);
        if (!nearest) continue;

        assignTripToDriverState(ds, nearest, scheduleRow);
        ds.firstRoundDoneByDate.add(dateKey);
        removeTripFromArray(remaining, nearest);
        assignedThisLoop = true;

        if (remaining.length === 0) break;
      }

      if (!assignedThisLoop) {
        break;
      }
    }

    finalTrips.push(...lockedTrips);
  }

  const stateAssignedIds = new Set();

  for (const ds of driverStates) {
    for (const trip of ds.assignedTrips) {
      stateAssignedIds.add(String(trip._id));
      finalTrips.push(trip);
    }
  }

  for (const trip of preparedTrips) {
    if (!stateAssignedIds.has(String(trip._id)) && !finalTrips.find(t => String(t._id) === String(trip._id))) {
      finalTrips.push(trip);
    }
  }

  return sortTripsByDateTime(finalTrips);
}

async function persistAssignedTrips(trips) {
  const ops = [];

  for (const trip of trips) {
    const update = {
      pickupLat: normalizeNumber(trip.pickupLat),
      pickupLng: normalizeNumber(trip.pickupLng),
      dropoffLat: normalizeNumber(trip.dropoffLat),
      dropoffLng: normalizeNumber(trip.dropoffLng),
      driverId: normalizeText(trip.driverId),
      driverName: normalizeText(trip.driverName),
      vehicle: normalizeText(trip.vehicle),
      driverAddress: normalizeText(trip.driverAddress),
      status: normalizeText(trip.status) || "Scheduled"
    };

    ops.push({
      updateOne: {
        filter: { _id: trip._id },
        update: { $set: update }
      }
    });
  }

  if (ops.length > 0) {
    try {
      await Trip.bulkWrite(ops, { ordered: false }
);
    } catch (err) {
      console.log("Bulk trip save error:", err?.message || err);
    }
  }
}

/* =========================
   CREATE ADMIN
========================= */
app.get("/create-admin", async (req, res) => {
  try {
    const existing = await User.findOne({ username: "admin" });

    if (existing) {
      return res.send("Admin already exists");
    }

    const hashed = await bcrypt.hash("111111", 10);

    await User.create({
      name: "Admin",
      username: "admin",
      password: hashed,
      role: "admin"
    });

    res.send("Admin Created (admin / 111111)");
  } catch (err) {
    console.log(err);
    res.status(500).send("Error creating admin");
  }
});

/* =========================
   LOGIN
========================= */
app.post("/api/auth/login", async (req, res) => {
  try {

    const {
      username,
      password,
      tenantSlug
    } = req.body || {};

    const cleanUsername =
      String(username || "").trim();

    const cleanSlug =
      cleanTenantSlug(tenantSlug);

    if (!cleanUsername || !password) {
      return res.status(400).json({
        message: "Missing credentials"
      });
    }

    /*
      PLATFORM ADMIN:
      May login without a tenant because it belongs to the platform,
      not to one customer company.
    */
    const platformUser =
      await User.findOne({
        username: cleanUsername,
        role: "PLATFORM_ADMIN"
      });

    let user = null;
    let tenant = null;

    if (platformUser) {

      user = platformUser;

    } else {

      /*
        Every normal staff login MUST identify the tenant page
        it came from. This prevents a Sony admin from logging
        into Cover All with the same credentials.
      */
      if (!cleanSlug) {
        return res.status(400).json({
          message: "Company login link required"
        });
      }

      tenant =
        await Tenant.findOne({
          slug: cleanSlug
        });

      if (!tenant) {
        return res.status(403).json({
          message: "Organization not found"
        });
      }

      if (tenant.enabled === false) {
        return res.status(403).json({
          message: "Organization Disabled"
        });
      }

      if (
        tenant.subscriptionStatus === "SUSPENDED" ||
        tenant.subscriptionStatus === "CANCELED"
      ) {
        return res.status(403).json({
          message: "Organization subscription inactive"
        });
      }

      user =
        await User.findOne({
          username: cleanUsername,
          tenantId: tenant._id
        });

      if (!user) {
        return res.status(400).json({
          message: "Invalid credentials for this company"
        });
      }
    }

    console.log("LOGIN USER =", {
      username: user.username,
      role: user.role,
      enabled: user.enabled,
      tenantId: user.tenantId || null,
      requestedTenantSlug: cleanSlug || null
    });

    if (
      user.enabled === false ||
      user.active === false
    ) {
      return res.status(403).json({
        message: "User disabled"
      });
    }

    const match =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!match) {
      return res.status(400).json({
        message: "Invalid credentials"
      });
    }

    /*
      Final tenant ownership check.
      Never trust only the slug sent by the browser.
    */
    if (
      user.role !== "PLATFORM_ADMIN"
    ) {

      if (!user.tenantId) {
        return res.status(403).json({
          message: "User is not assigned to a company"
        });
      }

      if (
        !tenant ||
        String(user.tenantId) !==
        String(tenant._id)
      ) {
        return res.status(403).json({
          message: "Access denied for this company"
        });
      }
    }

    const browserRole =
      legacyStaffRole(user.role);

    const token =
      jwt.sign(
        {
          id: user._id,
          role: browserRole,
          name: user.name,
          tenantId:
            user.tenantId
              ? String(user.tenantId)
              : null,
          tenantSlug:
            tenant?.slug || null
        },
        JWT_SECRET,
        {
          expiresIn: "1d"
        }
      );

    return res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: browserRole,
        tenantId:
          user.tenantId
            ? String(user.tenantId)
            : null,
        tenantSlug:
          tenant?.slug || null
      }
    });

  } catch (err) {

    console.log(
      "LOGIN ERROR:",
      err
    );

    return res.status(500).json({
      message: "Server error"
    });

  }
});

/* =========================
   USER MANAGEMENT PERMISSIONS
   SUPER_ADMIN -> all tenant user types
   ADMIN       -> dispatcher / driver / company only
   DISPATCHER  -> no Add User API access
========================= */

function normalizeActorRole(value){
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g,"_");
}

function legacyStaffRole(value){
  const role = normalizeActorRole(value);

  if(role === "SUPER_ADMIN" || role === "SUPERADMIN"){
    return "SUPER_ADMIN";
  }

  if(role === "ADMIN") return "admin";
  if(role === "DISPATCHER") return "dispatcher";
  if(role === "DRIVER") return "driver";
  if(role === "COMPANY") return "company";

  return role || String(value || "").trim();
}

function normalizeManagedUserRole(value){
  return String(value || "")
    .trim()
    .toLowerCase();
}

function isOperationalCancellationRole(value){

  const role =
    normalizeActorRole(value);

  return [
    "DRIVER",
    "DISPATCHER",
    "ADMIN",
    "SUPER_ADMIN",
    "SUPERADMIN",
    "PLATFORM_ADMIN"
  ].includes(role);
}

function canManageUserRole(req,targetRole){

  const actorRole =
    normalizeActorRole(
      req.authUser?.role
    );

  const role =
    normalizeManagedUserRole(
      targetRole
    );

  const superAllowed = [
    "superadmin",
    "admin",
    "dispatcher",
    "driver",
    "company"
  ];

  const adminAllowed = [
    "dispatcher",
    "driver",
    "company"
  ];

  if(
    actorRole === "SUPER_ADMIN" ||
    actorRole === "SUPERADMIN" ||
    actorRole === "PLATFORM_ADMIN"
  ){
    return superAllowed.includes(role);
  }

  if(actorRole === "ADMIN"){
    return adminAllowed.includes(role);
  }

  return false;
}

function denyUserManagement(res){
  return res.status(403).json({
    message:"You do not have permission to manage this user type"
  });
}

/* =========================
   LOAD USERS
========================= */

app.get(
  "/api/users/:role",
  requireTenantApi,
  async (req,res)=>{

  try{

    const role =
      normalizeManagedUserRole(
        req.params.role
      );

    if(!canManageUserRole(req,role)){
      return denyUserManagement(res);
    }

    const users =
      await User.find(
        tenantFilter(
          req,
          {role}
        )
      )
      .sort({
        createdAt:-1,
        name:1
      })
      .lean();

    return res.json(users);

  }catch(err){

    console.log(
      "LOAD USERS ERROR:",
      err
    );

    return res.status(500).json({
      message:"Error loading users"
    });
  }
});

/* =========================
   CREATE USER
========================= */

app.post(
  "/api/users/:role",
  requireTenantApi,
  async (req,res)=>{

  try{

    const role =
      normalizeManagedUserRole(
        req.params.role
      );

    if(!canManageUserRole(req,role)){
      return denyUserManagement(res);
    }

    const {
      name,
      username,
      email,
      password,
      vehicleNumber,
      address,
      phone
    } = req.body || {};

    if(
      !name ||
      !username ||
      !password
    ){
      return res.status(400).json({
        message:"Missing fields"
      });
    }

    const tenantId =
      tenantIdForCreate(req);

    if(!tenantId){
      return res.status(403).json({
        message:"Tenant Required"
      });
    }

    const exists =
      await User.findOne({
        username:
          normalizeText(username)
      });

    if(exists){
      return res.status(400).json({
        message:"Username exists"
      });
    }

    const hashed =
      await bcrypt.hash(
        password,
        10
      );

    const newUser =
      await User.create({
        tenantId,

        name:
          normalizeText(name),

        username:
          normalizeText(username),

        email:
          normalizeText(email),

        password:
          hashed,

        role,

        vehicleNumber:
          normalizeText(vehicleNumber),

        address:
          normalizeText(address),

        phone:
          normalizeText(phone)
      });

    return res.json(newUser);

  }catch(err){

    console.log(
      "CREATE USER ERROR:",
      err
    );

    return res.status(500).json({
      message:"Error creating user"
    });
  }
});

/* =========================
   UPDATE USER
========================= */

app.put(
  "/api/users/:id",
  requireTenantApi,
  async (req,res)=>{

  try{

    const existingUser =
      await User.findOne(
        tenantFilter(
          req,
          {_id:req.params.id}
        )
      );

    if(!existingUser){
      return res.status(404).json({
        message:"User not found"
      });
    }

    if(
      !canManageUserRole(
        req,
        existingUser.role
      )
    ){
      return denyUserManagement(res);
    }

    const {
      name,
      username,
      email,
      password,
      vehicleNumber,
      address,
      phone
    } = req.body || {};

    const updateData = {
      name:
        normalizeText(name),

      username:
        normalizeText(username),

      email:
        normalizeText(email),

      vehicleNumber:
        normalizeText(vehicleNumber),

      address:
        normalizeText(address),

      phone:
        normalizeText(phone)
    };

    if(
      password &&
      String(password).trim() !== ""
    ){
      updateData.password =
        await bcrypt.hash(
          password,
          10
        );
    }

    const updated =
      await User.findOneAndUpdate(
        tenantFilter(
          req,
          {_id:req.params.id}
        ),
        {$set:updateData},
        {new:true}
      );

    return res.json(updated);

  }catch(err){

    console.log(
      "UPDATE USER ERROR:",
      err
    );

    return res.status(500).json({
      message:"Error updating user"
    });
  }
});

/* =========================
   TOGGLE USER
========================= */

app.patch(
  "/api/users/:id/toggle",
  requireTenantApi,
  async (req,res)=>{

  try{

    const user =
      await User.findOne(
        tenantFilter(
          req,
          {_id:req.params.id}
        )
      );

    if(!user){
      return res.status(404).json({
        message:"User not found"
      });
    }

    if(
      !canManageUserRole(
        req,
        user.role
      )
    ){
      return denyUserManagement(res);
    }

    user.enabled =
      user.enabled === false;

    user.active =
      user.enabled;

    await user.save();

    return res.json(user);

  }catch(err){

    console.log(
      "TOGGLE USER ERROR:",
      err
    );

    return res.status(500).json({
      message:"Error toggling user"
    });
  }
});

/* =========================
   DELETE USER
========================= */

app.delete(
  "/api/users/:id",
  requireTenantApi,
  async (req,res)=>{

  try{

    const existingUser =
      await User.findOne(
        tenantFilter(
          req,
          {_id:req.params.id}
        )
      );

    if(!existingUser){
      return res.status(404).json({
        message:"User not found"
      });
    }

    if(
      !canManageUserRole(
        req,
        existingUser.role
      )
    ){
      return denyUserManagement(res);
    }

    await User.deleteOne({
      _id:existingUser._id,
      tenantId:existingUser.tenantId
    });

    return res.json({
      message:"Deleted"
    });

  }catch(err){

    console.log(
      "DELETE USER ERROR:",
      err
    );

    return res.status(500).json({
      message:"Error deleting user"
    });
  }
});

/* =========================
   ADMIN BILLING TENANT SECURITY
========================= */

function isTenantBillingAdmin(req){
  const role =
    normalizeActorRole(
      req.authUser?.role
    );

  return (
    role === "SUPER_ADMIN" ||
    role === "SUPERADMIN" ||
    role === "PLATFORM_ADMIN"
  );
}

function adminBillingCompanyFilter(req,id=null){
  const filter = {
    role:"company"
  };

  if(!req.authUser?.tenantId){
    return null;
  }

  filter.tenantId = req.authUser.tenantId;

  if(id){
    if(!mongoose.Types.ObjectId.isValid(String(id))){
      return null;
    }
    filter._id = id;
  }

  return filter;
}

/* =========================
   ADMIN BILLING LIST
========================= */

app.get(
  "/api/admin/billing",
  requireTenantApi,
  async (req,res)=>{

  try{

    if(!isTenantBillingAdmin(req)){
      return res.status(403).json({
        message:"Access denied"
      });
    }

    const filter =
      adminBillingCompanyFilter(req);

    if(!filter){
      return res.status(403).json({
        message:"Tenant required"
      });
    }

    /*
      IMPORTANT:
      Never block the Admin Billing page while recalculating
      every company and every trip.

      Return the tenant companies immediately from MongoDB,
      then refresh their billing totals in the background.
      This prevents the page from staying forever on
      "Loading billing...".
    */
    const companies =
      await User.find(filter)
        .sort({name:1})
        .lean();

    res.json(companies);

    /*
      Recalculate saved billing data AFTER the response.
      A later Refresh/page load receives the fresh values.

      Promise.allSettled means one bad company can never
      stop the rest of the tenant companies from updating.
    */
    setImmediate(async ()=>{

      try{

        const results =
          await Promise.allSettled(
            companies.map(company =>
              updateCompanyBilling(company)
            )
          );

        const failed =
          results.filter(
            row=>row.status === "rejected"
          );

        if(failed.length){

          console.log(
            "ADMIN BILLING BACKGROUND REFRESH FAILURES:",
            failed.length
          );

          failed.forEach(row=>{
            console.log(
              row.reason?.message ||
              row.reason ||
              "Unknown billing refresh error"
            );
          });
        }

      }catch(refreshErr){

        console.log(
          "ADMIN BILLING BACKGROUND REFRESH ERROR:",
          refreshErr?.message ||
          refreshErr
        );
      }

    });

    return;

  }catch(err){

    console.log(
      "ADMIN BILLING LIST ERROR:",
      err
    );

    return res.status(500).json({
      message:"billing error"
    });

  }

});

function normalizeBillingServiceCode(value){

  const c =
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[_-]+/g," ")
      .replace(/\s+/g," ");

  if(
    c === "ST" ||
    c === "STANDARD" ||
    c.includes("STANDARD")
  ){
    return "ST";
  }

  if(
    c === "WH" ||
    c === "WC" ||
    c === "WHEELCHAIR" ||
    c === "WHEEL CHAIR" ||
    c.includes("WHEELCHAIR") ||
    c.includes("WHEEL CHAIR")
  ){
    return "WH";
  }

  if(
    c === "SH" ||
    c === "SHARED" ||
    c.includes("SHARED")
  ){
    return "SH";
  }

  if(
    c === "LM" ||
    c === "LIMO" ||
    c === "LIMOUSINE" ||
    c.includes("LIMOUSINE") ||
    c.startsWith("LIMO ")
  ){
    return "LM";
  }

  if(
    c === "TX" ||
    c === "TAXI" ||
    c.includes("TAXI")
  ){
    return "TX";
  }

  if(
    c === "XL" ||
    c === "XL SERVICE" ||
    c.startsWith("XL ")
  ){
    return "XL";
  }

  return c;
}

function billingServiceKey(trip){

  if(
    trip?.isShared === true ||
    String(trip?.tripType || "")
      .toUpperCase()
      .includes("SHARED") ||
    String(trip?.tripNumber || "")
      .toUpperCase()
      .includes("-SH")
  ){
    return "SH";
  }

  return normalizeBillingServiceCode(
    trip?.serviceKey ||
    trip?.serviceCode ||
    trip?.serviceType ||
    trip?.vehicleTypeFromQuote ||
    trip?.vehicle ||
    ""
  );
}

function billingEscapeRegex(value){
  return String(value || "")
    .replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function billingOverrideServiceCode(service){

  return normalizeBillingServiceCode(
    service?.serviceKey ||
    service?.serviceCode ||
    service?.serviceType ||
    service?.serviceSuffix ||
    service?.companySuffix ||
    service?.suffix ||
    service?.serviceName ||
    service?.title ||
    service?.name ||
    ""
  );
}

function billingOverrideServiceEnabled(service){

  if(!service){
    return false;
  }

  if(service.active !== undefined){
    return service.active !== false;
  }

  if(service.enabled !== undefined){
    return service.enabled !== false;
  }

  if(service.companyEnabled !== undefined){
    return service.companyEnabled !== false;
  }

  return true;
}

function mapFacilityOverrideService(service,serviceKey){

  const code =
    normalizeBillingServiceCode(
      serviceKey ||
      billingOverrideServiceCode(service)
    );

  return {
    ...service,

    serviceKey:code,
    serviceCode:code,
    serviceType:code,
    companySuffix:
      normalizeBillingServiceCode(
        service?.serviceSuffix ||
        code
      ) || code,

    companyEnabled:true,

    companyPricingMode:
      String(
        service?.pricingMode ||
        "MILE"
      ).toUpperCase(),

    companyBaseFare:
      Number(service?.baseFare || 0),

    companyIncludedMiles:
      Number(service?.includedMiles || 0),

    companyPerMile:
      Number(service?.perMile || 0),

    companyHourlyRate:
      Number(service?.hourlyRate || 0),

    companyHourlyBillingMode:
      String(
        service?.hourlyBillingMode ||
        "FULL"
      ).toUpperCase(),

    companyStopFee:
      Number(service?.stopFee || 0),

    companyNoShowFee:
      Number(service?.noShowFee || 0),

    companySharedPrice:
      Number(service?.sharedPrice || 0),

    companyDisableCancel:
      service?.disableCancel === true,

    companyWarningMinutes:
      Number(service?.warningMinutes || 0),

    companyCancelFee:
      Number(service?.cancelFee || 0),

    __pricingSource:
      "FACILITY_OVERRIDE"
  };
}

async function getServiceByTrip(trip){

  const serviceKey =
    billingServiceKey(trip);

  if(!serviceKey){
    return null;
  }

  /*
    COMPANY / FACILITY PRICING:
    The active Facility Pricing Override is the primary source.
    Service Management is only the fallback.
  */
  const companyName =
    String(
      trip?.company || ""
    ).trim();

  if(companyName){

    const overrideOr = [
      {
        facilityName:{
          $regex:
            "^" +
            billingEscapeRegex(companyName) +
            "$",
          $options:"i"
        }
      }
    ];

    /*
      Older records may match the facility user id rather than only its name.
    */
    try{

      const facilityUserFilter = {
        role:{
          $in:["company","facility"]
        },
        name:{
          $regex:
            "^" +
            billingEscapeRegex(companyName) +
            "$",
          $options:"i"
        }
      };

      if(trip?.tenantId){
        facilityUserFilter.tenantId =
          trip.tenantId;
      }

      const facilityUser =
        await User.findOne(
          facilityUserFilter
        )
        .select("_id")
        .lean();

      if(facilityUser?._id){
        overrideOr.push({
          facilityId:
            facilityUser._id
        });
      }

    }catch(err){

      console.log(
        "FACILITY USER RESOLVE ERROR:",
        err?.message || err
      );
    }

    const overrideFilter = {
      active:true,
      $or:overrideOr
    };

    if(trip?.tenantId){
      overrideFilter.tenantId =
        trip.tenantId;
    }

    const override =
      await FacilityPricingOverride
        .findOne(
          overrideFilter
        )
        .sort({
          updatedAt:-1,
          createdAt:-1
        })
        .lean();

    if(
      override &&
      Array.isArray(override.services)
    ){

      const overrideService =
        override.services.find(
          service =>
            billingOverrideServiceCode(service) ===
            serviceKey
        );

      if(
        overrideService &&
        billingOverrideServiceEnabled(
          overrideService
        )
      ){

        return mapFacilityOverrideService(
          overrideService,
          serviceKey
        );
      }
    }
  }

  /*
    SERVICE MANAGEMENT FALLBACK.
    Match both short codes (ST/WH/SH/LM/TX/XL) and long names.
  */
  const rx =
    new RegExp(
      "^" +
      billingEscapeRegex(serviceKey) +
      "$",
      "i"
    );

  const serviceFilter = {
    $or:[
      {serviceKey},
      {serviceCode:serviceKey},
      {serviceType:serviceKey},
      {suffix:serviceKey},
      {companySuffix:serviceKey},
      {reservedSuffix:serviceKey},
      {serviceSuffix:serviceKey},
      {title:rx},
      {name:rx},
      {serviceName:rx}
    ]
  };

  if(trip?.tenantId){
    serviceFilter.tenantId =
      trip.tenantId;
  }

  let service =
    await Service.findOne(
      serviceFilter
    ).lean();

  /*
    Legacy Service records may store STANDARD/WHEELCHAIR/etc.
    Scan the tenant services only when the direct lookup misses.
  */
  if(!service){

    const tenantServiceFilter = {};

    if(trip?.tenantId){
      tenantServiceFilter.tenantId =
        trip.tenantId;
    }

    const services =
      await Service.find(
        tenantServiceFilter
      ).lean();

    service =
      services.find(
        row =>
          normalizeBillingServiceCode(
            row?.serviceKey ||
            row?.serviceCode ||
            row?.serviceType ||
            row?.companySuffix ||
            row?.suffix ||
            row?.serviceSuffix ||
            row?.title ||
            row?.name ||
            row?.serviceName ||
            ""
          ) === serviceKey
      ) || null;
  }

  return service;
}

/*
  ADMIN BILLING PERFORMANCE:
  Load all Service Management definitions required by a company's trips
  in one query. Facility-specific fees are resolved only when needed.
*/
async function getBillingServiceMap(trips){

  const keys =
    [
      ...new Set(
        (Array.isArray(trips) ? trips : [])
          .map(billingServiceKey)
          .filter(Boolean)
      )
    ];

  if(!keys.length){
    return new Map();
  }

  const tenantIds =
    [
      ...new Set(
        (Array.isArray(trips) ? trips : [])
          .map(t=>String(t?.tenantId || "").trim())
          .filter(Boolean)
      )
    ];

  const filter = {};

  if(tenantIds.length === 1){
    filter.tenantId = tenantIds[0];
  }

  const services =
    await Service.find(
      filter
    )
    .lean();

  const map =
    new Map();

  services.forEach(service=>{

    const key =
      normalizeBillingServiceCode(
        service?.serviceKey ||
        service?.serviceCode ||
        service?.serviceType ||
        service?.companySuffix ||
        service?.suffix ||
        service?.serviceSuffix ||
        service?.title ||
        service?.name ||
        service?.serviceName ||
        ""
      );

    if(
      key &&
      keys.includes(key) &&
      !map.has(key)
    ){
      map.set(
        key,
        service
      );
    }
  });

  return map;
}
/* =========================
   BILLING ENGINE FINAL
========================= */

async function updateCompanyBilling(company){

  const now = new Date();

  let nextDate;

  if(company.nextBillingDate){

    nextDate =
      new Date(company.nextBillingDate);

  }else{

    nextDate =
      new Date(now);

    if(company.billingCycle === "WEEKLY"){

      nextDate.setDate(
        nextDate.getDate() + 7
      );

    }else{

      nextDate.setMonth(
        nextDate.getMonth() + 1
      );

    }

    company.nextBillingDate =
      nextDate;

  }

  const graceDays =
    Number(company.graceDays || 3);

  const graceMs =
    graceDays * 24 * 60 * 60 * 1000;

  const diff =
    nextDate - now;

  const daysLeft =
    Math.ceil(
      diff / (1000 * 60 * 60 * 24)
    );

  const startDate =
    company.billingStartDate
      ? new Date(company.billingStartDate)
      : new Date(
          now.getFullYear(),
          now.getMonth(),
          1,
          0,
          0,
          0
        );

  const endDate =
    company.billingEndDate
      ? new Date(company.billingEndDate)
      : new Date(
          now.getFullYear(),
          now.getMonth() + 1,
          0,
          23,
          59,
          59
        );

  const startKey =
    startDate.toISOString().split("T")[0];

  const endKey =
    endDate.toISOString().split("T")[0];

  let billingStatus = "ACTIVE";
  let billingLocked = false;

  const graceEnd =
    new Date(
      nextDate.getTime() + graceMs
    );

  if(
    now > nextDate &&
    now <= graceEnd
  ){
    billingStatus = "PAST_DUE";
  }

  if(now > graceEnd){
    billingStatus = "SUSPENDED";
    billingLocked = true;
  }

  const trips =
  await Trip.find({

    tenantId:company.tenantId,

    company:{
      $regex:
        "^" +
        String(company.name || "").trim() +
        "$",
      $options:"i"
    },

    billingPaid:{
      $ne:true
    },

    tripDate:{
      $gte:startKey,
      $lte:endKey
    }

  }).lean();

  /*
    Load service definitions once for all trips.
    This removes the old N+1 Service query loop.
  */
  const billingServiceMap =
    await getBillingServiceMap(
      trips
    );

  let individualTrips = 0;
  let completedTrips = 0;
  let cancelledTrips = 0;
  let noShowTrips = 0;
  let revenue = 0;

  const sharedGroups = new Set();

for (const t of trips) {

let service =
  billingServiceMap.get(
    billingServiceKey(t)
  ) || null;

const isShared =

  t.isShared === true ||

  String(t.tripType || "")
    .toUpperCase()
    .includes("SHARED") ||

  String(service?.serviceKey || "")
    .toUpperCase()
    .includes("SHARED") ||

  String(t.tripNumber || "")
    .includes("-SH") ||

  String(t.groupId || "")
    .trim() !== "";

    const status =
      String(t.status || "")
        .replace(/\s+/g,"")
        .toLowerCase()
        .trim();

    /*
      Cancel / No Show pricing for company trips must use the
      Facility Pricing Override first. This also repairs legacy
      trips whose stored fee is still zero.
    */
    if(
      status.includes("cancel") ||
      status.includes("no")
    ){
      const resolvedService =
        await getServiceByTrip(t);

      if(resolvedService){
        service = resolvedService;
      }
    }

   /* =========================
   BILLABLE CHECK
========================= */

const hasPassengerStatuses =

  isShared &&

  Array.isArray(t.passengers) &&

  t.passengers.some(p=>{

    const s =
      String(p.status || "")
        .replace(/\s+/g,"")
        .toLowerCase()
        .trim();

    return (
      s.includes("complete") ||
      s.includes("cancel") ||
      s.includes("no")
    );

  });

const tripBillable =

  status.includes("complete") ||
  status.includes("cancel") ||
  status.includes("no");

/* 🔥 لو لا الرحلة ولا الركاب billable */

if(
  !tripBillable &&
  !hasPassengerStatuses
){
  continue;
}   
 if(isShared){

  sharedGroups.add(
    String(
      t.groupId ||
      t.tripNumber ||
      t._id
    )
  );

}else{

  individualTrips++;

}

/* =========================
   STATUS COUNTS
========================= */

if(status.includes("complete")){
  completedTrips++;
}

if(status.includes("cancel")){
  cancelledTrips++;
}

if(status.includes("no")){
  noShowTrips++;
}

/* =========================
   PRICE
========================= */

let amount = 0;

if(
  isShared &&
  Array.isArray(t.passengers) &&
  t.passengers.length > 0
){

  t.passengers.forEach(p=>{

    let ps =
      String(p.status || "")
        .replace(/\s+/g,"")
        .toLowerCase()
        .trim();

    if(
      !ps ||
      ps === "scheduled" ||
      ps === "booked"
    ){
      ps = status;
    }

    if(ps.includes("complete")){

      amount += Number(
        p.finalPrice ||
        p.priceAmount ||
        p.price ||
        0
      );

    }else if(ps.includes("cancel")){

      const cancellationChargeable =
        p?.cancellationChargeable === false ||
        t?.cancellationChargeable === false
          ? false
          : true;

      amount += Number(
        cancellationChargeable
          ? (
              p.finalPrice ||
              p.cancelFee ||
              t.cancelFee ||
              service?.companyCancelFee ||
              service?.cancelFee ||
              t.finalPrice ||
              0
            )
          : 0
      );

    }else if(ps.includes("no")){

      amount += Number(
        p.noShowFee ||
        t.noShowFee ||
        service?.companyNoShowFee ||
        service?.noShowFee ||
        0
      );

    }

  });

}else{

  if(status.includes("complete")){

    amount = Number(
      t.finalPrice ||
      t.priceAmount ||
      t.price ||
      0
    );

  }else if(status.includes("cancel")){

    amount =
      t?.cancellationChargeable === false
        ? 0
        : Number(
            t.cancelFee ||
            service?.companyCancelFee ||
            service?.cancelFee ||
            t.finalPrice ||
            t.priceAmount ||
            0
          );

  }else if(status.includes("no")){

    amount = Number(
      t.noShowFee ||
      service?.companyNoShowFee ||
      service?.noShowFee ||
      0
    );

  }

}

revenue += Number(amount || 0);

}

/* =========================
   SHARED PASSENGERS
========================= */

let sharedPassengers = 0;

trips.forEach(t => {

  const isShared =
    t.isShared === true ||
    String(t.tripNumber || "").includes("-SH") ||
    String(t.groupId || "").trim() !== "";

  if(!isShared) return;

  if(
    Array.isArray(t.passengers) &&
    t.passengers.length > 0
  ){

    t.passengers.forEach(p => {

      const s =
        String(p.status || "")
          .replace(/\s+/g,"")
          .toLowerCase()
          .trim();

      if(
        s.includes("complete") ||
        s.includes("cancel") ||
        s.includes("no")
      ){
        sharedPassengers++;
      }

    });

  } else {

    // intentionally empty

  }

});

/* =========================
   TOTALS
========================= */

const sharedTrips =
  sharedGroups.size;

const totalTrips =
  individualTrips + sharedTrips;

company.revenue =
  Number(revenue || 0);

company.totalTrips =
  totalTrips;

company.individualTrips =
  individualTrips;

company.sharedTrips =
  sharedTrips;

company.completedTrips =
  completedTrips;

company.cancelledTrips =
  cancelledTrips;

company.noShowTrips =
  noShowTrips;

/* =========================
   INVOICE AMOUNT
========================= */

const invoiceAmount =
  Number(
    revenue.toFixed(2)
  );

await User.findOneAndUpdate(
  {
    _id:company._id,
    tenantId:company.tenantId,
    role:"company"
  },
  {
    daysLeft,
    billingStatus,
    billingLocked,

    billingStartDate:startDate,
    billingEndDate:endDate,
    nextBillingDate:nextDate,

    totalTrips,
    individualTrips,
    sharedTrips,
    sharedPassengers,

    completedTrips,
    cancelledTrips,
    noShowTrips,

    revenue:Number(revenue.toFixed(2)),
    invoiceAmount:invoiceAmount
  }
);

return await User.findOne({
  _id:company._id,
  tenantId:company.tenantId,
  role:"company"
}).lean();

}

/* =========================
   LOCK COMPANY
========================= */

app.put(
  "/api/admin/billing/:id/lock",
  requireTenantApi,
  async (req,res)=>{

  try{

    if(!isTenantBillingAdmin(req)){
      return res.status(403).json({message:"Access denied"});
    }

    const filter =
      adminBillingCompanyFilter(req,req.params.id);

    if(!filter){
      return res.status(404).json({message:"Company not found"});
    }

    const company =
      await User.findOneAndUpdate(
        filter,
        {
          billingLocked:true,
          billingStatus:"SUSPENDED"
        },
        {new:true}
      );

    if(!company){
      return res.status(404).json({message:"Company not found"});
    }

    return res.json({success:true});

  }catch(err){
    console.log("ADMIN BILLING LOCK ERROR:",err);
    return res.status(500).json({message:"lock failed"});
  }

});

/* =========================
   UNLOCK COMPANY
========================= */

app.put(
  "/api/admin/billing/:id/unlock",
  requireTenantApi,
  async (req,res)=>{

  try{

    if(!isTenantBillingAdmin(req)){
      return res.status(403).json({message:"Access denied"});
    }

    const filter =
      adminBillingCompanyFilter(req,req.params.id);

    if(!filter){
      return res.status(404).json({message:"Company not found"});
    }

    const company =
      await User.findOneAndUpdate(
        filter,
        {
          billingLocked:false,
          billingStatus:"ACTIVE"
        },
        {new:true}
      );

    if(!company){
      return res.status(404).json({message:"Company not found"});
    }

    return res.json({success:true});

  }catch(err){
    console.log("ADMIN BILLING UNLOCK ERROR:",err);
    return res.status(500).json({message:"unlock failed"});
  }

});

/* =========================
   MARK BILLING PAID
========================= */

app.put(
  "/api/admin/billing/:id/mark-paid",
  requireTenantApi,
  async (req,res)=>{

  try{

    if(!isTenantBillingAdmin(req)){
      return res.status(403).json({message:"Access denied"});
    }

    const filter =
      adminBillingCompanyFilter(req,req.params.id);

    if(!filter){
      return res.status(404).json({message:"Company not found"});
    }

    const user =
      await User.findOne(filter);

    if(!user){
      return res.status(404).json({
        message:"Company not found"
      });
    }

    const now = new Date();

    let nextBillingDate = new Date(now);

    if(user.billingCycle === "WEEKLY"){
      nextBillingDate.setDate(
        nextBillingDate.getDate() + 7
      );
    }else{
      nextBillingDate.setMonth(
        nextBillingDate.getMonth() + 1
      );
    }

    user.billingStatus = "ACTIVE";
    user.billingLocked = false;
    user.lastPaymentDate = now;
    user.billingStartDate = new Date(now.toISOString());
    user.billingEndDate = new Date(nextBillingDate.toISOString());
    user.nextBillingDate = new Date(nextBillingDate.toISOString());

    user.invoiceAmount = 0;
    user.revenue = 0;
    user.totalTrips = 0;
    user.individualTrips = 0;
    user.sharedTrips = 0;
    user.sharedPassengers = 0;
    user.completedTrips = 0;
    user.cancelledTrips = 0;
    user.noShowTrips = 0;

    await user.save();

    return res.json({
      success:true,
      message:"Billing marked paid"
    });

  }catch(err){
    console.log("ADMIN BILLING MARK PAID ERROR:",err);
    return res.status(500).json({
      message:"mark paid failed"
    });
  }

});

/* =========================
   GENERATE INVOICE
========================= */

app.put(
  "/api/admin/generate-invoice/:id",
  requireTenantApi,
  async (req,res)=>{

  try{

    if(!isTenantBillingAdmin(req)){
      return res.status(403).json({message:"Access denied"});
    }

    const filter =
      adminBillingCompanyFilter(req,req.params.id);

    if(!filter){
      return res.status(404).json({message:"Company not found"});
    }

    const company =
      await User.findOne(filter);

    if(!company){
      return res.status(404).json({
        message:"Company not found"
      });
    }

    const {
      billingStartDate,
      billingEndDate,
      graceDays
    } = req.body || {};

    if(!billingStartDate || !billingEndDate){
      return res.status(400).json({
        message:"Billing dates required"
      });
    }

    company.billingStartDate =
      new Date(billingStartDate + "T12:00:00");

    company.billingEndDate =
      new Date(billingEndDate + "T12:00:00");

    company.nextBillingDate =
      new Date(billingEndDate + "T12:00:00");

    company.graceDays =
      Number(graceDays || 3);

    company.invoiceAmount =
      Number(company.revenue || 0);

    company.billingStatus = "ACTIVE";
    company.billingLocked = false;

    await company.save();

    return res.json({
      success:true,
      message:"Invoice generated"
    });

  }catch(err){
    console.log("ADMIN GENERATE INVOICE ERROR:",err);
    return res.status(500).json({
      message:"generate invoice failed"
    });
  }

});


/* =========================
   COMPANY TENANT OWNER
========================= */

async function resolveCompanyForTenantRequest(
  req,
  requestedName = "",
  requestedId = ""
){
  const role =
    String(req.authUser?.role || "");

  const tenantId =
    req.authUser?.tenantId || null;

  /*
    A COMPANY account can access only its own User record.
    We use the authenticated user id, never a company name from the browser.
  */
  if(role.toLowerCase() === "company"){

    if(!tenantId || !req.authUser?.id){
      return null;
    }

    return await User.findOne({
      _id:req.authUser.id,
      tenantId,
      role:"company"
    });
  }

  /*
    Tenant staff may inspect a company inside the SAME tenant.
  */
  const filter = {
    role:"company"
  };

  if(role !== "PLATFORM_ADMIN"){
    if(!tenantId){
      return null;
    }
    filter.tenantId = tenantId;
  }

  if(requestedId && mongoose.Types.ObjectId.isValid(String(requestedId))){
    filter._id = requestedId;
  }else if(requestedName){
    filter.name = {
      $regex:
        "^" +
        String(requestedName)
          .replace(/[.*+?^${}()|[\]\\]/g,"\\$&") +
        "$",
      $options:"i"
    };
  }else{
    return null;
  }

  return await User.findOne(filter);
}

/* =========================
   COMPANY BILLING
========================= */

app.get(
  "/api/company/billing",
  requireTenantApi,
  async (req,res)=>{

  try{

    const company =
      await resolveCompanyForTenantRequest(
        req,
        String(req.query.company || "").trim(),
        String(req.query.companyId || "").trim()
      );

    if(!company){
      return res.status(404).json({
        message:"Company not found"
      });
    }

    const updatedCompany =
      await updateCompanyBilling(company);

    return res.json({

      _id:updatedCompany._id,
      name:updatedCompany.name || "",
      tenantId:updatedCompany.tenantId || null,

      billingStatus:
        updatedCompany.billingStatus || "ACTIVE",

      billingCycle:
        updatedCompany.billingCycle || "MONTHLY",

      invoiceAmount:
        updatedCompany.invoiceAmount || 0,

      revenue:
        updatedCompany.revenue || 0,

      totalTrips:
        updatedCompany.totalTrips || 0,

      individualTrips:
        updatedCompany.individualTrips || 0,

      sharedTrips:
        updatedCompany.sharedTrips || 0,

      completedTrips:
        updatedCompany.completedTrips || 0,

      cancelledTrips:
        updatedCompany.cancelledTrips || 0,

      noShowTrips:
        updatedCompany.noShowTrips || 0,

      billingStartDate:
        updatedCompany.billingStartDate || null,

      billingEndDate:
        updatedCompany.billingEndDate || null,

      nextBillingDate:
        updatedCompany.nextBillingDate || null,

      lastPaymentDate:
        updatedCompany.lastPaymentDate || null,

      daysLeft:
        updatedCompany.daysLeft || 0,

      graceDays:
        updatedCompany.graceDays || 0,

      billingLocked:
        updatedCompany.billingLocked || false,

      billingNotes:
        updatedCompany.billingNotes || ""

    });

  }catch(err){

    console.log(
      "COMPANY BILLING ERROR:",
      err
    );

    return res.status(500).json({
      message:"billing load failed"
    });

  }

});

/* =========================
   CREATE ACH PAYMENT
========================= */

app.post(
  "/api/company/create-ach-payment",
  requireTenantApi,
  async (req,res)=>{

  try{

    const company =
      await resolveCompanyForTenantRequest(
        req,
        String(req.body.company || "").trim(),
        String(req.body.companyId || "").trim()
      );

    if(!company){
      return res.status(404).json({
        message:"Company not found"
      });
    }

    const amount =
      Number(company.invoiceAmount || 0);

    if(amount <= 0){
      return res.status(400).json({
        message:"Invoice amount invalid"
      });
    }

    const tenantSlug =
      String(
        req.authUser?.tenantSlug ||
        req.body?.tenantSlug ||
        ""
      )
      .trim()
      .toLowerCase();

    const successUrl =
      "https://sunbeam-933q.onrender.com/companies/payment.html" +
      "?success=1" +
      "&session_id={CHECKOUT_SESSION_ID}" +
      "&companyId=" + encodeURIComponent(String(company._id)) +
      (tenantSlug
        ? "&tenant=" + encodeURIComponent(tenantSlug)
        : "");

    const cancelUrl =
      "https://sunbeam-933q.onrender.com/companies/payment.html?cancel=1" +
      (tenantSlug
        ? "&tenant=" + encodeURIComponent(tenantSlug)
        : "");

    const tenantPaymentAccount =
      await TenantPaymentAccount.findOne({
        tenantId:company.tenantId
      }).lean();

    if(
      !tenantPaymentAccount ||
      !tenantPaymentAccount.stripeAccountId
    ){
      return res.status(400).json({
        message:
          "Stripe is not connected for this organization"
      });
    }

    if(
      tenantPaymentAccount.connected !== true ||
      tenantPaymentAccount.chargesEnabled !== true
    ){
      return res.status(400).json({
        message:
          "Stripe onboarding is not complete for this organization"
      });
    }

    const stripeAccountId =
      String(
        tenantPaymentAccount.stripeAccountId
      );

    const session =
      await stripe.checkout.sessions.create({

        payment_method_types:[
          "card",
          "us_bank_account"
        ],

        mode:"payment",

        metadata:{
          companyId:String(company._id),
          tenantId:String(company.tenantId || ""),
          stripeAccountId
        },

        payment_intent_data:{
          transfer_data:{
            destination:
              stripeAccountId
          },

          metadata:{
            companyId:
              String(company._id),

            tenantId:
              String(company.tenantId || ""),

            stripeAccountId
          }
        },

        line_items:[{
          price_data:{
            currency:"usd",
            product_data:{
              name:`${company.name} Billing Invoice`
            },
            unit_amount:
              Math.round(amount * 100)
          },
          quantity:1
        }],

        success_url:successUrl,
        cancel_url:cancelUrl

      });

    return res.json({
      success:true,
      url:session.url
    });

  }catch(err){

    console.log(
      "CREATE COMPANY PAYMENT ERROR:",
      err
    );

    return res.status(500).json({
      message:"payment failed"
    });

  }

});

/* =========================
   VERIFY COMPANY PAYMENT
========================= */

app.get(
  "/api/company/check-payment",
  requireTenantApi,
  async (req,res)=>{

  try{

    const sessionId =
      String(
        req.query.session_id || ""
      ).trim();

    const companyId =
      String(
        req.query.companyId || ""
      ).trim();

    if(!sessionId || !companyId){

      return res.status(400).json({
        paid:false
      });

    }

    const session =
      await stripe.checkout.sessions.retrieve(
        sessionId
      );

    if(
      session.payment_status !== "paid"
    ){
      return res.json({
        paid:false
      });
    }

    /*
      Stripe session must belong to the same company id
      supplied by the redirect.
    */
    if(
      String(session.metadata?.companyId || "") !==
      companyId
    ){
      return res.status(403).json({
        paid:false,
        message:"Payment company mismatch"
      });
    }

    const company =
      await resolveCompanyForTenantRequest(
        req,
        "",
        companyId
      );

    if(!company){

      return res.status(404).json({
        paid:false
      });

    }

    if(
      session.metadata?.tenantId &&
      String(session.metadata.tenantId) !==
      String(company.tenantId || "")
    ){
      return res.status(403).json({
        paid:false,
        message:"Payment tenant mismatch"
      });
    }

    /* prevent double verification */
    if(
      session.metadata?.verified === "true"
    ){
      return res.json({
        paid:true
      });
    }

    const now =
  new Date();

let nextBillingDate =
  new Date(now);

if(company.billingCycle === "WEEKLY"){

  nextBillingDate.setDate(
    nextBillingDate.getDate() + 7
  );

}else{

  nextBillingDate.setMonth(
    nextBillingDate.getMonth() + 1
  );

}

/* =========================
   SAVE BILLING HISTORY
========================= */

const paymentIntentId =
  String(
    session.payment_intent || ""
  );

const alreadyInHistory =
  await BillingHistory.findOne({
    tenantId:company.tenantId,
    companyId:company._id,
    stripeCheckoutSessionId:sessionId
  }).lean();

if(!alreadyInHistory){

  const historyTripFilter = {

    tenantId:
      company.tenantId,

    company:{
      $regex:
        "^" +
        String(company.name || "").trim() +
        "$",
      $options:"i"
    },

    billingPaid:{
      $ne:true
    }
  };

  const billableTrips =
    await Trip.find(
      historyTripFilter
    )
    .select("_id")
    .lean();

  await BillingHistory.create({

    tenantId:
      company.tenantId,

    companyId:
      company._id,

    companyName:
      company.name || "",

    billingStartDate:
      company.billingStartDate || null,

    billingEndDate:
      company.billingEndDate || null,

    totalTrips:
      Number(company.totalTrips || 0),

    individualTrips:
      Number(company.individualTrips || 0),

    sharedTrips:
      Number(company.sharedTrips || 0),

    sharedPassengers:
      Number(company.sharedPassengers || 0),

    completedTrips:
      Number(company.completedTrips || 0),

    cancelledTrips:
      Number(company.cancelledTrips || 0),

    noShowTrips:
      Number(company.noShowTrips || 0),

    revenue:
      Number(company.revenue || 0),

    invoiceAmount:
      Number(company.invoiceAmount || 0),

    paidDate:
      new Date(),

    paymentMethod:
      "STRIPE",

    stripeCheckoutSessionId:
      sessionId,

    stripePaymentIntentId:
      paymentIntentId,

    stripeAccountId:
      String(
        session.metadata?.stripeAccountId ||
        ""
      ),

    tripIds:
      billableTrips.map(
        row=>row._id
      )
  });

}

/* =========================
   RESET BILLING
========================= */

company.billingStatus =
  "ACTIVE";

company.billingLocked =
  false;

company.invoiceAmount =
  0;

company.revenue =
  0;

company.totalTrips =
  0;

company.individualTrips =
  0;

company.sharedTrips =
  0;

company.sharedPassengers =
  0;

company.completedTrips =
  0;

company.cancelledTrips =
  0;

company.noShowTrips =
  0;

company.lastPaymentDate =
  now;

/* =========================
   NEW BILLING CYCLE
========================= */

company.billingStartDate =
  new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0
  );

company.billingEndDate =
  new Date(
    nextBillingDate.getFullYear(),
    nextBillingDate.getMonth(),
    nextBillingDate.getDate(),
    23,
    59,
    59
  );

company.nextBillingDate =
  nextBillingDate;

console.log(
  "UPDATING COMPANY..."
);

await company.save();

console.log(
  "COMPANY SAVED"
);

const tripsToMark = {

  tenantId:
    company.tenantId,

  company:{
    $regex:
      "^" +
      String(company.name || "").trim() +
      "$",
    $options:"i"
  },

  billingPaid:{
    $ne:true
  }
};

const count =
  await Trip.countDocuments(
    tripsToMark
  );

console.log(
  "TRIPS TO MARK PAID =",
  count
);

const result =
  await Trip.updateMany(
    tripsToMark,
    {
      $set:{
        billingPaid:true
      }
    }
  );

console.log(
  "UPDATED =",
  result.modifiedCount
);
await stripe.checkout.sessions.update(
  sessionId,
  {
    metadata:{
      ...session.metadata,
      verified:"true"
    }
  }
);

console.log(
  "PAYMENT UPDATED"
);

return res.json({
  paid:true
});

  }catch(err){

    console.log(
      "VERIFY ERROR:"
    );

    console.log(err);

    res.status(500).json({
      paid:false
    });

  }

});

/* =========================
   GET DRIVERS
========================= */
app.get(
  "/api/drivers",
  requireTenantApi,
  async (req, res) => {

  try {

    const drivers =
      await User.find(
        tenantFilter(
          req,
          {
            role:"driver",
            active:{
              $ne:false
            },
            enabled:{
              $ne:false
            }
          }
        )
      )
      .sort({
        name:1
      })
      .lean();

    return res.json(
      drivers
    );

  } catch (err) {

    console.log(
      "LOAD DRIVERS ERROR:",
      err
    );

    return res.status(500).json({
      message:
        "Error loading drivers"
    });

  }
});

/* =========================
   CREATE TRIP (FINAL + SHARED)
========================= */
app.post("/api/trips", optionalTenantApi, async (req, res) => {
  try {

    /* =========================
       TENANT OWNER

       STAFF:
       tenant is resolved from verified JWT.

       PUBLIC GET QUOTE:
       browser sends tenantSlug only.
       Server resolves the real Tenant document.

       We NEVER trust a public tenantId.
    ========================= */

    const tenant =
      await resolveTripTenant(req);

    const tenantId =
      tenant._id;

    const tenantSlug =
      cleanTenantSlug(
        tenant.slug
      );

    const type =
      normalizeTripType(
        req.body.type
      );

    /* =========================
       PUBLIC GET QUOTE PAYMENT GATE

       A public individual booking must NEVER become Booked
       unless this tenant has a fully connected Stripe account.
       Staff-created trips are not affected by this rule.
    ========================= */

    const isPublicIndividualBooking =
      !req.authUser &&
      type === "individual";

    if(isPublicIndividualBooking){

      const paymentAccount =
        await TenantPaymentAccount.findOne({
          tenantId
        }).lean();

      if(
        !paymentAccount ||
        !paymentAccount.stripeAccountId ||
        paymentAccount.connected !== true ||
        paymentAccount.chargesEnabled !== true
      ){

        return res.status(400).json({
          message:
            "Online booking is currently unavailable. Payment account is not connected."
        });
      }
    }

    /* =========================
       COMPANY LOCK CHECK
    ========================= */

    const companyName = normalizeText(req.body.company);

    if (companyName) {

      const companyUser = await User.findOne({
        tenantId,
        role: "company",
        name: {
          $regex: "^" + companyName + "$",
          $options: "i"
        }
      });

      if (
        companyUser &&
        (
          companyUser.billingLocked === true ||
          companyUser.billingLocked === "true" ||
          companyUser.billingLocked === 1
        )
      ) {
        return res.status(403).json({
          message: "Company account locked because billing is past due"
        });
      }
    }

    // 🔥 هل شيرد؟
 // 🔥 هل شيرد؟
const isShared = req.body.isShared === true;

/***************************
 VEHICLE TYPE FINAL FIX
***************************/

const rawVehicle =
  String(
    req.body.serviceSuffix ||
    req.body.serviceCode ||
    req.body.serviceKey ||
    req.body.serviceType ||
    req.body.vehicleTypeFromQuote ||
    req.body.vehicleType ||
    ""
  )
  .trim()
  .toUpperCase();

const vehicleTypeFromQuote =
  rawVehicle === "WH" ? "WHEELCHAIR" :
  rawVehicle === "WC" ? "WHEELCHAIR" :
  rawVehicle === "ST" ? "STANDARD" :
  rawVehicle === "TX" ? "TAXI" :
  rawVehicle === "LM" ? "LIMO" :
  rawVehicle === "SH" ? "SHARED" :
  rawVehicle === "XL" ? "XL" :
  rawVehicle === "WHEELCHAIR" ? "WHEELCHAIR" :
  rawVehicle === "STANDARD" ? "STANDARD" :
  rawVehicle === "TAXI" ? "TAXI" :
  rawVehicle === "LIMO" ? "LIMO" :
  rawVehicle === "SHARED" ? "SHARED" :
  "STANDARD";


/* =========================
   TENANT SERVICE PERMISSION
========================= */

const requestedServiceCode =
  normalizeTenantServiceCode(
    rawVehicle ||
    vehicleTypeFromQuote
  );

const tenantAllowedServices =
  Array.isArray(
    tenant.allowedServices
  )
    ? tenant.allowedServices
        .map(
          normalizeTenantServiceCode
        )
        .filter(Boolean)
    : [];

if(
  tenantAllowedServices.length &&
  !tenantAllowedServices.includes(
    requestedServiceCode
  )
){

  return res.status(403).json({
    message:
      "This service is not enabled for this organization"
  });

}

/* =========================
   TRIP NUMBER
========================= */

let tripNumber = "";

if(type === "company"){

  tripNumber =
    await generateCompanyTripNumber(

      isShared
        ? "SHARED"
        : vehicleTypeFromQuote

    );

}else{

  tripNumber =
    await generateTripNumber(
      type,
      vehicleTypeFromQuote
    );

}

/* =========================
   BASIC FIELDS
========================= */

const pickup = normalizeText(req.body.pickup);
const dropoff = normalizeText(req.body.dropoff);

/* =========================
   SHARED DATA (FINAL)
========================= */

let groupId = "";
let passengers = [];
let totalPassengers = 0;

if (isShared) {

  if (
    Array.isArray(req.body.passengers) &&
    req.body.passengers.length > 0
  ) {

    passengers = req.body.passengers.map((p, i) => ({

      passengerId:
        p.passengerId ||
        "P" + (i + 1),

      clientName:
        normalizeText(p.clientName),

      clientPhone:
        normalizeText(p.clientPhone),

      pickup:
        normalizeText(p.pickup),

      pickupLat:
        normalizeNumber(p.pickupLat),

      pickupLng:
        normalizeNumber(p.pickupLng),

      dropoff:
        normalizeText(p.dropoff),

      dropoffLat:
        normalizeNumber(p.dropoffLat),

      dropoffLng:
        normalizeNumber(p.dropoffLng),

      pickupOrder:
        Number(p.pickupOrder || 0),

      dropoffOrder:
        Number(p.dropoffOrder || 0),

      routeOrder:
        Number(p.routeOrder || (i + 1)),

      status:
        normalizeText(
          p.status || "Scheduled"
        ),

      priceAmount:
        Number(
          p.priceAmount || 0
        ),

      finalPrice:
        Number(
          p.finalPrice || 0
        ),

      cancelFee:
        Number(
          p.cancelFee || 0
        ),

      noShowFee:
        Number(
          p.noShowFee || 0
        )

    }));

    totalPassengers =
      passengers.length;

    groupId =
      "GRP-" + Date.now();

  } else {

    return res.status(400).json({
      message:
        "Shared trip must include passengers"
    });

  }

}

/* =========================
   SHARED CREATE (FINAL)
========================= */

if (isShared) {

  let trip = null;

  let attempts = 0;

  while (!trip && attempts < 5) {

    try {

      attempts++;

      trip = await Trip.create({

        /* TENANT */
        tenantId,
        tenantSlug,

        /* BASIC */

        type,
        tripNumber,

        /* SERVICE */

        serviceType: "SHARED",
        serviceKey: "SHARED",
        serviceCode: "SHARED",

        /* SHARED FLAGS */

        isShared: true,

        groupId,

        tripType: "SHARED",

        sharedSuffix: "SH",

        sharedSource:
          companyName
            ? "COMPANY"
            : "INDIVIDUAL",

        /* COMPANY */

        company:
          normalizeText(
            req.body.company
          ),

        entryName:
          normalizeText(
            req.body.entryName
          ),

        entryPhone:
          normalizeText(
            req.body.entryPhone
          ),

        /* PASSENGERS */

        passengers,

        totalPassengers,

        sharedStopsCount:
          Number(
            req.body.sharedStopsCount || 0
          ),

        /* DISPLAY */

        clientName:
          "Shared Trip",

        clientPhone:
          "",

        /* ROUTE */

        pickup:
          passengers?.[0]?.pickup ||
          pickup,

        dropoff:
          passengers?.[
            passengers.length - 1
          ]?.dropoff ||
          dropoff,

        pickupLat:
          normalizeNumber(
            req.body.pickupLat
          ),

        pickupLng:
          normalizeNumber(
            req.body.pickupLng
          ),

        dropoffLat:
          normalizeNumber(
            req.body.dropoffLat
          ),

        dropoffLng:
          normalizeNumber(
            req.body.dropoffLng
          ),

        stops:
          Array.isArray(req.body.stops)
            ? parseStops(req.body.stops)
            : [],

        stopCoords:
          Array.isArray(req.body.stopCoords)
            ? parseStopCoords(req.body.stopCoords)
            : [],

        googleRoute:
          req.body.googleRoute && typeof req.body.googleRoute === "object"
            ? req.body.googleRoute
            : {},

        optimizedRoute:
          req.body.optimizedRoute && typeof req.body.optimizedRoute === "object"
            ? req.body.optimizedRoute
            : {},

        routePoints:
          Array.isArray(req.body.routePoints)
            ? req.body.routePoints.map(normalizeText).filter(Boolean)
            : [],

        routePath:
          Array.isArray(req.body.routePath)
            ? req.body.routePath.map(p=>({
                lat:normalizeNumber(p?.lat),
                lng:normalizeNumber(p?.lng)
              })).filter(p=>p.lat !== null && p.lng !== null)
            : [],

        overviewPolyline:
          normalizeText(req.body.overviewPolyline),

        routeLocked:
          req.body.routeLocked === true,

        routeFinalized:
          req.body.routeFinalized === true,

        routeSource:
          normalizeText(req.body.routeSource),

        routeUpdatedAt:
          req.body.routeUpdatedAt || null,

        /* DATE */

        tripDate:
          normalizeText(
            req.body.tripDate
          ),

        tripTime:
          normalizeText(
            req.body.tripTime
          ),

        notes:
          normalizeText(
            req.body.notes
          ),

        /* PRICE */

        priceAmount:
          Number(
            req.body.priceAmount || 0
          ),

        finalPrice:
          Number(
            req.body.finalPrice || 0
          ),

        pricePerPassenger:
          Number(
            req.body.pricePerPassenger || 0
          ),

        cancelFee:
          Number(
            req.body.cancelFee || 0
          ),

        noShowFee:
          Number(
            req.body.noShowFee || 0
          ),

        /* STATUS */

        status:
          normalizeText(
            req.body.status
          ) || "Scheduled",

        bookedAt:
          req.body.bookedAt ||
          new Date(),

        createdAt:
          new Date()

      });

    } catch (err) {

      if (err.code !== 11000) {
        throw err;
      }

  tripNumber =
  await generateTripNumber(
    type,
    "SHARED"
  );

    }

  }

  await ensureTripCoords(trip);

  return res.status(200).json(trip);

}

/* =========================
   🟢 INDIVIDUAL CREATE
========================= */

let trip = null;

let attempts = 0;

while(!trip && attempts < 5){

  try{

    attempts++;

    trip = await Trip.create({

        /* TENANT */
        tenantId,
        tenantSlug,

      type,
      tripNumber,

      isShared: false,
      groupId: "",
      tripType: "INDIVIDUAL",

      company: normalizeText(req.body.company),

      entryName: normalizeText(req.body.entryName),
      entryPhone: normalizeText(req.body.entryPhone),

     clientName: normalizeText(req.body.clientName),
clientPhone: normalizeText(req.body.clientPhone),

priceAmount:
  Number(req.body.priceAmount || 0),

cancelFee:
  Number(req.body.cancelFee || 0),

noShowFee:
  Number(req.body.noShowFee || 0),

clientEmail:
  normalizeText(req.body.clientEmail),

vehicle: vehicleTypeFromQuote,

serviceType: vehicleTypeFromQuote,
serviceKey: vehicleTypeFromQuote,
serviceCode: vehicleTypeFromQuote,

      pickup,
      dropoff,
      stops: parseStops(req.body.stops),

      pickupLat: normalizeNumber(req.body.pickupLat),
      pickupLng: normalizeNumber(req.body.pickupLng),
      dropoffLat: normalizeNumber(req.body.dropoffLat),
      dropoffLng: normalizeNumber(req.body.dropoffLng),
      stopCoords: parseStopCoords(req.body.stopCoords),

      googleRoute:
        req.body.googleRoute && typeof req.body.googleRoute === "object"
          ? req.body.googleRoute
          : {},

      optimizedRoute:
        req.body.optimizedRoute && typeof req.body.optimizedRoute === "object"
          ? req.body.optimizedRoute
          : {},

      routePoints:
        Array.isArray(req.body.routePoints)
          ? req.body.routePoints.map(normalizeText).filter(Boolean)
          : [],

      routePath:
        Array.isArray(req.body.routePath)
          ? req.body.routePath.map(p=>({
              lat:normalizeNumber(p?.lat),
              lng:normalizeNumber(p?.lng)
            })).filter(p=>p.lat !== null && p.lng !== null)
          : [],

      overviewPolyline:
        normalizeText(req.body.overviewPolyline),

      routeLocked:
        req.body.routeLocked === true,

      routeFinalized:
        req.body.routeFinalized === true,

      routeSource:
        normalizeText(req.body.routeSource),

      routeUpdatedAt:
        req.body.routeUpdatedAt || null,

      tripDate: normalizeText(req.body.tripDate),
      tripTime: normalizeText(req.body.tripTime),

      notes: normalizeText(req.body.notes),

      /*
        Public Get Quote bookings stay invisible / unconfirmed until
        Stripe card setup succeeds. Staff-created trips keep the old default.
      */
      status:
        isPublicIndividualBooking
          ? "Pending Payment"
          : (normalizeText(req.body.status) || "Booked"),

reservationStatus:
  normalizeText(req.body.reservationStatus),

reviewOnly:
  req.body.reviewOnly === true,

source:
  normalizeText(req.body.source),

bookingSource:
  normalizeText(req.body.bookingSource),

bookedAt: req.body.bookedAt || new Date(),
createdAt: new Date()

    });

  }catch(err){

    if(err.code !== 11000){
      throw err;
    }

    tripNumber =
      await generateTripNumber(
        type,
        vehicleTypeFromQuote
      );

  }

}

await ensureTripCoords(trip);

res.status(200).json(trip);

} catch (err) {

  console.log(err);

  if (err && err.code === 11000) {

    return res.status(409).json({
      message: "Duplicate trip number"
    });

  }

  if(
    err &&
    Number.isFinite(
      Number(err.statusCode)
    )
  ){

    return res
      .status(
        Number(err.statusCode)
      )
      .json({
        message:
          err.message ||
          "Trip create failed"
      });

  }

  res.status(500).json({
    message: "Error creating trip"
  });

}

});

/* =========================
   TENANT TRIPS - SECURE
   STAGE 1 TEST ENDPOINT

   SUPER_ADMIN / ADMIN / DISPATCHER:
   only returns trips for their tenantId.

   PLATFORM_ADMIN:
   can see all trips.
========================= */

app.get(
  "/api/tenant-trips",
  requireTenantApi,
  async (req,res)=>{

    try{

      const role =
        String(
          req.authUser?.role || ""
        );

      let filter = {};

      if(
        role !== "PLATFORM_ADMIN"
      ){

        filter = {
          tenantId:
            req.authUser.tenantId
        };

      }

      const trips =
        await Trip.find(filter)
        .sort({
          createdAt:-1,
          _id:-1
        })
        .lean();

      return res.json(trips);

    }catch(err){

      console.log(
        "TENANT TRIPS ERROR:",
        err
      );

      return res.status(500).json({
        message:
          "Error loading tenant trips"
      });

    }

  }
);

/* =========================
   GET ALL TRIPS
========================= */
app.get("/api/trips", requireTenantApi, async (req, res) => {
  try {
    const trips = await Trip.find(
      tenantFilter(req,{})
    ).sort({ createdAt: -1, _id: -1 });
    res.json(trips);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading trips" });
  }
});

/* =========================
   GET ALL TRIPS FOR HUB
========================= */
app.get(
  "/api/trips/company",
  requireTenantApi,
  async (req,res)=>{

  try{

    const filter =
      tenantFilter(req,{});

    /*
      Company users only see trips belonging to their own
      authenticated company account inside the tenant.
    */
    if(
      String(req.authUser?.role || "")
        .toLowerCase() === "company"
    ){

      const company =
        await resolveCompanyForTenantRequest(
          req
        );

      if(!company){
        return res.status(403).json({
          message:"Company access denied"
        });
      }

      filter.company = {
        $regex:
          "^" +
          String(company.name || "")
            .replace(/[.*+?^${}()|[\]\\]/g,"\\$&") +
          "$",
        $options:"i"
      };
    }

    const trips =
      await Trip.find(filter)
        .sort({
          createdAt:-1,
          _id:-1
        })
        .lean();

    return res.json(trips);

  }catch(err){

    console.log(
      "COMPANY TRIPS ERROR:",
      err
    );

    return res.status(500).json({
      message:"Error loading trips"
    });

  }

});

/* =========================
   GET COMPANY TRIPS ONLY
========================= */
app.get(
  "/api/trips/company/:company",
  requireTenantApi,
  async (req,res)=>{

  try{

    let companyName =
      String(
        req.params.company || ""
      ).trim();

    if(
      String(req.authUser?.role || "")
        .toLowerCase() === "company"
    ){

      const company =
        await resolveCompanyForTenantRequest(
          req
        );

      if(!company){
        return res.status(403).json({
          message:"Company access denied"
        });
      }

      companyName =
        String(company.name || "").trim();
    }

    const filter =
      tenantFilter(
        req,
        {
          company:{
            $regex:
              "^" +
              companyName.replace(
                /[.*+?^${}()|[\]\\]/g,
                "\\$&"
              ) +
              "$",
            $options:"i"
          }
        }
      );

    const trips =
      await Trip.find(filter)
        .sort({
          createdAt:-1,
          _id:-1
        })
        .lean();

    return res.json(trips);

  }catch(err){

    console.log(
      "NAMED COMPANY TRIPS ERROR:",
      err
    );

    return res.status(500).json({
      message:"Error loading trips"
    });

  }

});

/* =========================
   SUMMARY TRIPS (FINAL REAL)
========================= */
app.get(
  "/api/trips/summary",
  requireTenantApi,
  async (req,res)=>{

  try{

    let companyName =
      normalizeText(
        req.query.company || ""
      );

    if(
      String(req.authUser?.role || "")
        .toLowerCase() === "company"
    ){

      const company =
        await resolveCompanyForTenantRequest(
          req
        );

      if(!company){
        return res.status(403).json({
          message:"Company access denied"
        });
      }

      companyName =
        String(company.name || "").trim();
    }

    const filter =
      tenantFilter(req,{});

    if(companyName){

      filter.company = {
        $regex:
          "^" +
          companyName.replace(
            /[.*+?^${}()|[\]\\]/g,
            "\\$&"
          ) +
          "$",
        $options:"i"
      };

    }

    const trips = await Trip.find(filter)
      .sort({ tripDate: -1, tripTime: -1 })
      .lean();

    const result = [];

    for (const t of trips) {

      console.log(
        "TRIP:",
        t.tripNumber,
        "STATUS:",
        t.status,
        "FINAL:",
        t.finalPrice
      );

      // =========================
      // STATUS
      // =========================
      let status = String(t.status || "")
        .toLowerCase();

      if (status.includes("cancel")) {
        status = "Cancelled";
      }
      else if (
        status.includes("no")
      ) {
        status = "NoShow";
      }
      else if (
        status.includes("complete")
      ) {
        status = "Completed";
      }
      else {
        continue;
      }

      /*
        SUMMARY PRICE SOURCE:
        Company / Facility Cancel and No Show fees come from the
        active Facility Pricing Override first, then Service Management.
        Stored trip fees remain the first choice when already correct.
      */
      let summaryService = null;

      if(
        status === "Cancelled" ||
        status === "NoShow"
      ){
        summaryService =
          await getServiceByTrip(t);
      }

      const summaryCancelFee =
        t?.cancellationChargeable === false
          ? 0
          : Number(
              t.cancelFee ||
              summaryService?.companyCancelFee ||
              summaryService?.cancelFee ||
              0
            );

      const summaryNoShowFee =
        Number(
          t.noShowFee ||
          summaryService?.companyNoShowFee ||
          summaryService?.noShowFee ||
          0
        );

      const summaryEndedAtStop =
        t?.endedAtStop === true ||
        String(t?.completionType || "")
          .trim()
          .toUpperCase() === "ENDED_AT_STOP" ||
        Boolean(t?.stopEndAt) ||
        Boolean(t?.stopExecution?.endedAt);

      // =========================
      // MILES
      // =========================
      let miles = 0;

      if (
        summaryEndedAtStop &&
        Number(t.stopEndMiles || 0) > 0
      ) {

        miles = Number(t.stopEndMiles);

      } else if (t.miles && t.miles > 0) {

        miles = Number(t.miles);

      } else if (
        t.pickupLat &&
        t.pickupLng &&
        t.dropoffLat &&
        t.dropoffLng
      ) {

        miles =
          calcDistanceKm(
            t.pickupLat,
            t.pickupLng,
            t.dropoffLat,
            t.dropoffLng
          ) * 0.621371;

      }

      miles = summaryEndedAtStop
        ? Number(Number(miles || 0).toFixed(2))
        : Math.round(miles);

      // =========================
      // BOOKING DATE/TIME
      // =========================
      let bookingDate = "";
      let bookingTime = "";

      if (t.createdAt) {

        const d = new Date(t.createdAt);

        bookingDate =
          d.toLocaleDateString("en-US", {
            timeZone: "America/Phoenix"
          });

        bookingTime =
          d.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: true,
            timeZone: "America/Phoenix"
          });

      }

     // =========================
// SHARED
// =========================
if (
  t.isShared &&
  Array.isArray(t.passengers)
) {

  const passengers =
    t.passengers.map(p => {

      let pStatus =
        String(
          p.status ||
          status
        ).toLowerCase();

      if (pStatus.includes("cancel")) {
        pStatus = "Cancelled";
      }
      else if (
        pStatus.includes("no")
      ) {
        pStatus = "NoShow";
      }
      else if (
        pStatus.includes("complete")
      ) {
        pStatus = "Completed";
      }
      else {
        pStatus = status;
      }

      let passengerPrice = 0;

      // =========================
      // COMPLETED
      // =========================
      if (
        pStatus === "Completed"
      ) {

        passengerPrice =
          Number(
            p.finalPrice ||
            p.priceAmount ||
            0
          );

      }

      // =========================
      // CANCELLED
      // =========================
      else if (
        pStatus === "Cancelled"
      ) {

        passengerPrice =
          (
            p?.cancellationChargeable === false ||
            t?.cancellationChargeable === false
          )
            ? 0
            : Number(
                p.cancelFee ||
                summaryCancelFee ||
                p.finalPrice ||
                0
              );

      }

      // =========================
      // NO SHOW
      // =========================
      else if (
        pStatus === "NoShow"
      ) {

        passengerPrice =
          Number(

            p.noShowFee ||
            summaryNoShowFee ||
            p.finalPrice ||
            0

          );

      }

      return {

        clientName:
          p.clientName || "",

        clientPhone:
          p.clientPhone || "",

        pickup:
          p.pickup || "",

        dropoff:
          p.dropoff || "",

        status:
          pStatus,

        // 🔥 OLD SUPPORT
        price:
          passengerPrice,

        // 🔥 NEW SUPPORT
        priceAmount:
          passengerPrice,

        finalPrice:
          passengerPrice

      };

    });

  const total =
    passengers.reduce((sum,p)=>{

      return sum + Number(
        p.finalPrice ||
        p.priceAmount ||
        p.price ||
        0
      );

    },0);

  result.push({

    _id: t._id,

    isShared: true,

    tripNumber:
      t.tripNumber || "",

    company:
      t.company || "",

    entryName:
      t.entryName || "",

    entryPhone:
      t.entryPhone || "",

    tripDate:
      t.tripDate || "",

    tripTime:
      t.tripTime || "",

    bookingDate,
    bookingTime,

    miles,

    passengers,

    totalPassengers:
      passengers.length,

    totalPrice:
      total,

    endedAtStop:
      summaryEndedAtStop,

    completionType:
      t.completionType || "",

    stopEndMiles:
      Number(t.stopEndMiles || 0),

    stopEndIndex:
      Number(t.stopEndIndex || 0),

    stopFeeApplied:
      Number(t.stopFeeApplied || 0),

    stopEndReason:
      t.stopEndReason || "",

    stopExecution:
      t.stopExecution || null
  });

}

// =========================
// INDIVIDUAL
// =========================
else {

  let finalPrice = 0;

  // =========================
  // CANCELLED
  // =========================
  if(status === "Cancelled"){

    finalPrice =
      Number(
        summaryCancelFee ||
        t.finalPrice ||
        0
      );

  }

  // =========================
  // NO SHOW
  // =========================
  else if(status === "NoShow"){

    finalPrice =
      Number(
        summaryNoShowFee ||
        t.finalPrice ||
        0
      );

  }

  // =========================
  // COMPLETED
  // =========================
  else{

    finalPrice =
      Number(
        t.finalPrice ||
        t.priceAmount ||
        t.stopExecution?.finalPrice ||
        0
      );

  }

  result.push({

    _id: t._id,

    isShared: false,

    tripNumber:
      t.tripNumber || "",

    company:
      t.company || "",

    entryName:
      t.entryName || "",

    entryPhone:
      t.entryPhone || "",

    clientName:
      t.clientName || "",

    clientPhone:
      t.clientPhone || "",

    pickup:
      t.pickup || "",

    stops:
      Array.isArray(t.stops)
        ? t.stops
        : [],

    dropoff:
      t.dropoff || "",

    tripDate:
      t.tripDate || "",

    tripTime:
      t.tripTime || "",

    bookingDate,
    bookingTime,

    miles,

    status,

    // 🔥 OLD SUPPORT
    price:
      finalPrice,

    // 🔥 NEW SUPPORT
    finalPrice:
      finalPrice,

    totalPrice:
      finalPrice,

    endedAtStop:
      summaryEndedAtStop,

    completionType:
      t.completionType || "",

    stopEndMiles:
      Number(t.stopEndMiles || 0),

    stopEndIndex:
      Number(t.stopEndIndex || 0),

    stopFeeApplied:
      Number(
        t.stopFeeApplied ||
        t.stopExecution?.stopTotal ||
        0
      ),

    stopEndReason:
      t.stopEndReason ||
      t.stopExecution?.reason ||
      "",

    stopExecution:
      t.stopExecution || null

  });

}

    }

    res.json(result);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "summary error"
    });

  }
});

/* =========================
   END TRIP AT INTERMEDIATE STOP
========================= */

function stopEndNumber(value){
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function stopEndLegs(trip){
  const candidates = [
    trip?.googleRoute?.legs,
    trip?.optimizedRoute?.legs,
    trip?.googleRoute?.routes?.[0]?.legs,
    trip?.optimizedRoute?.routes?.[0]?.legs
  ];

  return (
    candidates.find(value =>
      Array.isArray(value) && value.length
    ) ||
    []
  );
}

function stopEndLegMetrics(leg){
  const meters = stopEndNumber(
    leg?.distanceMeters ??
    leg?.distance?.value ??
    leg?.meters
  );

  const miles = meters > 0
    ? meters * 0.000621371
    : stopEndNumber(
        leg?.miles ??
        leg?.distanceMiles
      );

  const seconds = stopEndNumber(
    leg?.durationSeconds ??
    leg?.duration?.value ??
    leg?.seconds
  );

  return {
    miles,
    meters,
    seconds
  };
}

async function stopEndRouteMetrics(trip,stopIndex){
  const legs = stopEndLegs(trip);

  if(legs.length >= stopIndex){
    const selected = legs.slice(0,stopIndex);

    const totals = selected.reduce((out,leg)=>{
      const current = stopEndLegMetrics(leg);
      out.miles += current.miles;
      out.meters += current.meters;
      out.seconds += current.seconds;
      return out;
    },{
      miles:0,
      meters:0,
      seconds:0
    });

    if(totals.miles > 0){
      return {
        miles:Number(totals.miles.toFixed(2)),
        distanceMeters:Number(totals.meters.toFixed(0)),
        durationSeconds:Number(totals.seconds.toFixed(0)),
        minutes:Math.ceil(totals.seconds / 60),
        source:"SAVED_ROUTE_LEGS"
      };
    }
  }

  const routePoints = [
    {
      type:"pickup",
      address:existingAddress(trip?.pickup),
      lat:stopEndCoordinate(
        trip?.pickupLat,
        trip?.pickupCoords?.lat,
        trip?.pickupLocation?.lat,
        trip?.pickupLocation?.latitude
      ),
      lng:stopEndCoordinate(
        trip?.pickupLng,
        trip?.pickupCoords?.lng,
        trip?.pickupLocation?.lng,
        trip?.pickupLocation?.longitude
      )
    }
  ];

  const stops = Array.isArray(trip?.stops)
    ? trip.stops
    : [];

  const stopCoords = Array.isArray(trip?.stopCoords)
    ? trip.stopCoords
    : [];

  for(let index = 0; index < stopIndex; index++){
    const coord = stopCoords[index] || {};
    routePoints.push({
      type:"stop",
      address:
        existingAddress(stops[index]) ||
        existingAddress(coord?.address),
      lat:stopEndCoordinate(
        coord?.lat,
        coord?.latitude,
        stops[index]?.lat,
        stops[index]?.latitude,
        stops[index]?.location?.lat,
        stops[index]?.location?.latitude
      ),
      lng:stopEndCoordinate(
        coord?.lng,
        coord?.longitude,
        stops[index]?.lng,
        stops[index]?.longitude,
        stops[index]?.location?.lng,
        stops[index]?.location?.longitude
      )
    });
  }

  let calculated = null;
  let routeSource = "PARTIAL_ROUTE_CALCULATION";

  try{
    calculated =
      await routeMapEngine.calculateRouteMiles(routePoints);
  }catch(primaryError){
    const cleanedRoutePoints =
      routePoints.map(point=>({
        ...point,
        lat:null,
        lng:null,
        address:stopEndCleanDirectionsAddress(
          point.address
        )
      }));

    calculated =
      await routeMapEngine.calculateRouteMiles(
        cleanedRoutePoints
      );

    routeSource =
      "PARTIAL_ROUTE_CALCULATION_CLEAN_ADDRESS";
  }

  return {
    miles:Number(stopEndNumber(calculated?.miles).toFixed(2)),
    distanceMeters:stopEndNumber(calculated?.distanceMeters),
    durationSeconds:stopEndNumber(calculated?.durationSeconds),
    minutes:Math.ceil(
      stopEndNumber(calculated?.durationSeconds) / 60
    ),
    source:routeSource
  };
}

function stopEndCoordinate(...values){
  for(const value of values){
    if(
      value === null ||
      value === undefined ||
      String(value).trim() === ""
    ){
      continue;
    }

    const number = Number(value);

    if(Number.isFinite(number)){
      return number;
    }
  }

  return null;
}

function stopEndCleanDirectionsAddress(value){
  return String(value || "")
    .replace(
      /\b(?:lot|suite|ste|unit|apt|apartment)\s*[#-]?\s*[a-z0-9-]+\b/gi,
      " "
    )
    .replace(/\s+#\s*[a-z0-9-]+\b/gi," ")
    .replace(/\s+/g," ")
    .trim();
}

function existingAddress(value){
  if(typeof value === "string"){
    return value.trim();
  }

  return String(
    value?.address ||
    value?.stopAddress ||
    value?.formattedAddress ||
    ""
  ).trim();
}

function calculateStopEndFare({pricing,miles,minutes,stops}){
  const mode = String(
    pricing?.pricingMode || "MILE"
  ).trim().toUpperCase();

  const stopFee = Math.max(
    0,
    stopEndNumber(pricing?.stopFee)
  );

  const stopCount = Math.max(
    1,
    Math.floor(stopEndNumber(stops))
  );

  const stopTotal = stopCount * stopFee;
  let rideFare = 0;

  if(mode === "HOURLY"){
    const totalMinutes = Math.max(
      0,
      stopEndNumber(minutes)
    );

    const initialDurationMinutes = Math.max(
      0,
      stopEndNumber(pricing?.initialDurationMinutes)
    );

    const initialPrice = Math.max(
      0,
      stopEndNumber(pricing?.initialPrice)
    );

    const hourlyRate = Math.max(
      0,
      stopEndNumber(pricing?.hourlyRate)
    );

    const hourlyBillingMode = String(
      pricing?.hourlyBillingMode || "FULL"
    ).trim().toUpperCase();

    if(initialDurationMinutes > 0){
      if(totalMinutes <= initialDurationMinutes){
        rideFare = initialPrice;
      }else{
        const extraMinutes =
          totalMinutes - initialDurationMinutes;

        const extraHours =
          hourlyBillingMode === "QUARTER"
            ? Math.ceil(extraMinutes / 15) / 4
            : Math.ceil(extraMinutes / 60);

        rideFare =
          initialPrice +
          (extraHours * hourlyRate);
      }
    }else{
      const hours =
        hourlyBillingMode === "QUARTER"
          ? Math.max(1,Math.ceil(totalMinutes / 15) / 4)
          : Math.max(1,Math.ceil(totalMinutes / 60));

      rideFare = hours * hourlyRate;
    }
  }else{
    const baseFare = Math.max(
      0,
      stopEndNumber(pricing?.baseFare)
    );

    const includedMiles = Math.max(
      0,
      stopEndNumber(pricing?.includedMiles)
    );

    const perMile = Math.max(
      0,
      stopEndNumber(pricing?.perMile)
    );

    const extraMiles = Math.max(
      0,
      stopEndNumber(miles) - includedMiles
    );

    rideFare =
      baseFare +
      (extraMiles * perMile);
  }

  return {
    rideFare:Number(rideFare.toFixed(2)),
    stopFee:Number(stopFee.toFixed(2)),
    stopTotal:Number(stopTotal.toFixed(2)),
    total:Number((rideFare + stopTotal).toFixed(2))
  };
}

app.post(
  "/api/driver/trips/:id/stop-arrived",
  requireTenantApi,
  async (req,res)=>{
    try{
      const trip = await Trip.findOne(
        tenantFilter(req,{_id:req.params.id})
      );

      if(!trip){
        return res.status(404).json({
          message:"Trip not found"
        });
      }

      if(trip.isFinalized){
        return res.status(400).json({
          message:"Trip is already finalized"
        });
      }

      const stopIndex = Math.floor(
        stopEndNumber(req.body?.stopIndex)
      );

      const stops = Array.isArray(trip.stops)
        ? trip.stops
        : [];

      if(stopIndex < 1 || stopIndex > stops.length){
        return res.status(400).json({
          message:"Invalid intermediate stop"
        });
      }

      const stopId = String(
        req.body?.stopId || `stop-${stopIndex}`
      ).trim();

      const currentExecution =
        trip.stopExecution || {};

      if(
        Number(currentExecution.stopIndex) === stopIndex &&
        String(currentExecution.stopId || "") === stopId &&
        currentExecution.arrivedAt
      ){
        return res.json({
          success:true,
          stopExecution:currentExecution,
          trip
        });
      }

      const pricingResult =
        await resolveTripPricing(trip);

      const service = pricingResult?.service || {};

      const waitEnabled =
        service.driverStopWaitEnabled !== false;

      const waitMinutes = waitEnabled
        ? Math.max(
            0,
            stopEndNumber(
              service.driverStopWaitMinutes ?? 5
            )
          )
        : 0;

      trip.stopExecution = {
        stopIndex,
        stopId,
        address:existingAddress(stops[stopIndex - 1]),
        arrivedAt:new Date(),
        waitMinutes,
        waitEnabled
      };

      trip.markModified("stopExecution");
      await trip.save();

      return res.json({
        success:true,
        stopExecution:trip.stopExecution,
        trip
      });
    }catch(err){
      console.log("STOP ARRIVED ERROR:",err);
      return res.status(500).json({
        message:"Unable to record stop arrival"
      });
    }
  }
);

app.post(
  "/api/driver/trips/:id/end-at-stop",
  requireTenantApi,
  async (req,res)=>{
    try{
      const trip = await Trip.findOne(
        tenantFilter(req,{_id:req.params.id})
      );

      if(!trip){
        return res.status(404).json({
          message:"Trip not found"
        });
      }

      if(trip.isFinalized){
        return res.json({
          success:true,
          trip
        });
      }

      const stopIndex = Math.floor(
        stopEndNumber(req.body?.stopIndex)
      );

      const stopId = String(
        req.body?.stopId || ""
      ).trim();

      const reason = normalizeText(
        req.body?.reason
      );

      const calledAt = stopEndNumber(
        req.body?.calledAt
      );

      if(!reason){
        return res.status(400).json({
          message:"Stop end reason is required"
        });
      }

      if(calledAt <= 0){
        return res.status(400).json({
          message:"Passenger call is required first"
        });
      }

      const execution = trip.stopExecution || {};

      if(
        Number(execution.stopIndex) !== stopIndex ||
        String(execution.stopId || "") !== stopId ||
        !execution.arrivedAt
      ){
        return res.status(400).json({
          message:"Stop arrival must be recorded first"
        });
      }

      const arrivedAt = new Date(
        execution.arrivedAt
      ).getTime();

      const waitMilliseconds =
        Math.max(
          0,
          stopEndNumber(execution.waitMinutes)
        ) * 60 * 1000;

      if(Date.now() < arrivedAt + waitMilliseconds){
        return res.status(400).json({
          message:"Stop waiting time must finish first"
        });
      }

      const stops = Array.isArray(trip.stops)
        ? trip.stops
        : [];

      if(stopIndex < 1 || stopIndex > stops.length){
        return res.status(400).json({
          message:"Invalid intermediate stop"
        });
      }

      const [pricingResult,routeMetrics] =
        await Promise.all([
          resolveTripPricing(trip),
          stopEndRouteMetrics(trip,stopIndex)
        ]);

      const fare = calculateStopEndFare({
        pricing:pricingResult?.pricing || {},
        miles:routeMetrics.miles,
        minutes:routeMetrics.minutes,
        stops:stopIndex
      });

      trip.status = "Completed";
      trip.finalPrice = fare.total;
      trip.priceAmount = fare.total;
      trip.isFinalized = true;
      trip.historyAt = trip.historyAt || new Date();
      trip.finalStatusConfirmed = false;
      trip.endedAtStop = true;
      trip.completionType = "ENDED_AT_STOP";
      trip.stopEndReason = reason;
      trip.stopEndAt = new Date();
      trip.stopEndIndex = stopIndex;
      trip.stopEndAddress =
        existingAddress(stops[stopIndex - 1]);
      trip.stopEndMiles = routeMetrics.miles;
      trip.stopEndMinutes = routeMetrics.minutes;
      trip.stopFeeApplied = fare.stopTotal;
      trip.stopPricingSource =
        pricingResult?.pricingSource || "";

      trip.stopExecution = {
        ...execution,
        calledAt:new Date(calledAt),
        endedAt:trip.stopEndAt,
        reason,
        routeSource:routeMetrics.source,
        rideFare:fare.rideFare,
        stopFee:fare.stopFee,
        stopTotal:fare.stopTotal,
        finalPrice:fare.total,
        pricingSource:trip.stopPricingSource
      };

      trip.markModified("stopExecution");
      await trip.save();

      await DispatchAssignment.findOneAndUpdate(
        {tripId:trip._id},
        {
          $set:{
            dispatchStatus:"COMPLETED",
            completedAt:new Date()
          }
        }
      );

      return res.json({
        success:true,
        trip,
        calculation:{
          miles:routeMetrics.miles,
          minutes:routeMetrics.minutes,
          rideFare:fare.rideFare,
          stopFee:fare.stopFee,
          stopCount:stopIndex,
          stopTotal:fare.stopTotal,
          finalPrice:fare.total,
          pricingSource:trip.stopPricingSource,
          routeSource:routeMetrics.source
        }
      });
    }catch(err){
      console.log("END TRIP AT STOP ERROR:",err);
      return res.status(500).json({
        message:"Unable to end trip at stop"
      });
    }
  }
);

/* =========================
   GET ONE TRIP
========================= */
app.get("/api/trips/:id", requireTenantApi, async (req, res) => {
  try {

    const trip =
      await Trip.findOne(
        tenantFilter(
          req,
          {
            _id:req.params.id
          }
        )
      );

    if(!trip){

      return res.status(404).json({
        message:"Trip not found"
      });
    }

    /*
      Repair an old trip once before Driver Map receives it.
      Saved route coordinates are reused first, so normally this creates
      zero new Google requests.
    */
    await ensureTripCoords(
      trip
    );

    const freshTrip =
      await Trip.findOne(
        tenantFilter(
          req,
          {
            _id:req.params.id
          }
        )
      );

    res.json(
      freshTrip ||
      trip
    );

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Error loading trip"
    });
  }
});


/* =========================
   UPDATE TRIP (FINAL CLEAN)
========================= */
app.put("/api/trips/:id", requireTenantApi, async (req, res) => {

  console.log("=========== UPDATE TRIP ===========");
  console.log("ID =", req.params.id);
  console.log(JSON.stringify(req.body, null, 2));
  console.log("===================================");

  try {

    const existing =
      await Trip.findOne(
        tenantFilter(
          req,
          {
            _id:req.params.id
          }
        )
      );

    if (!existing) {
      return res.status(404).json({
        message: "Trip not found"
      });
    }

    if (["Completed", "Cancelled"].includes(existing.status)) {
      return res.status(400).json({
        message: "Cannot edit completed or cancelled trip"
      });
    }   

    /*
      ==========================================================
      DRIVER FINAL COMMENT — PERSIST BEFORE ANY EARLY RETURN
      ==========================================================

      Driver Map sends:
        Single Cancel   -> req.body.cancelReason
        Single No Show  -> req.body.noShowReason

        Shared Cancel / No Show ->
          the same fields inside req.body.passengers[i]

      Save the written driver reason BEFORE any Stripe/finalizer
      early return. This applies to every source:
        Facility / Company
        Get Quote
        Reserved

      Client/trip notes are NOT changed here.
    */

    let driverCommentChanged = false;

    if(req.body.cancelReason !== undefined){
      existing.cancelReason =
        normalizeText(req.body.cancelReason);
      driverCommentChanged = true;
    }

    if(req.body.noShowReason !== undefined){
      existing.noShowReason =
        normalizeText(req.body.noShowReason);
      driverCommentChanged = true;
    }

    if(
      Array.isArray(req.body.passengers) &&
      Array.isArray(existing.passengers)
    ){
      const incomingPassengers =
        req.body.passengers;

      existing.passengers.forEach((savedPassenger,index)=>{

        const savedId =
          String(
            savedPassenger?.passengerId ||
            savedPassenger?._id ||
            index
          );

        const incoming =
          incomingPassengers.find((p,i)=>
            String(
              p?.passengerId ||
              p?._id ||
              i
            ) === savedId
          ) ||
          incomingPassengers[index];

        if(!incoming){
          return;
        }

        if(incoming.cancelReason !== undefined){
          savedPassenger.cancelReason =
            normalizeText(incoming.cancelReason);
          driverCommentChanged = true;
        }

        if(incoming.noShowReason !== undefined){
          savedPassenger.noShowReason =
            normalizeText(incoming.noShowReason);
          driverCommentChanged = true;
        }
      });
    }

    if(driverCommentChanged){
      existing.markModified("passengers");
      await existing.save();
    }

    /* Deferred-payment final states must go through Stripe first. */
    const requestedFinalStatus = String(req.body.status || "").trim();
    if(existing.stripePaymentMethodId){
      if(requestedFinalStatus === "Completed"){
        const paidTrip = await finalizeIndividualTrip(existing,"COMPLETE",{
          finalPrice:Number(req.body.finalPrice ?? existing.finalPrice ?? existing.priceAmount ?? 0)
        });
        return res.json(paidTrip);
      }
      if(requestedFinalStatus === "No Show"){
        const noShowTrip = await finalizeIndividualTrip(existing,"NOSHOW",{
          noShowFee:Number(req.body.noShowFee ?? existing.noShowFee ?? 0)
        });
        return res.json(noShowTrip);
      }
      if(requestedFinalStatus === "Cancelled"){

        const operationalCancel =
          isOperationalCancellationRole(
            req.authUser?.role
          );

        existing.cancelledByRole =
          normalizeActorRole(
            req.authUser?.role
          ) || "UNKNOWN";

        existing.cancellationChargeable =
          operationalCancel
            ? false
            : existing.cancellationChargeable;

        if(operationalCancel){
          existing.cancelFee = 0;
          existing.finalPrice = 0;
          existing.priceAmount = 0;
          existing.status = "Cancelled";
          existing.isFinalized = true;
          existing.cancelDateTime =
            existing.cancelDateTime || new Date();
          existing.historyAt =
            existing.historyAt || new Date();

          if(
            Array.isArray(
              existing.passengers
            )
          ){
            existing.passengers.forEach(p=>{
              p.cancelFee = 0;
              p.finalPrice = 0;
              p.priceAmount = 0;
              p.cancelledByRole =
                existing.cancelledByRole;
              p.cancellationChargeable = false;
            });
            existing.markModified("passengers");
          }

          await existing.save();
          return res.json(existing);
        }

        const cancelledTrip =
          await finalizeIndividualTrip(
            existing,
            "CANCEL",
            {
              cancelFee:Number(
                req.body.cancelFee ??
                existing.cancelFee ??
                0
              ),
              refundAmount:0
            }
          );

        return res.json(cancelledTrip);
      }
    }

    /* =========================
       ADDRESS CHANGE DETECTION

       Trip Hub / Trips may edit address text without sending new lat/lng.
       Old googleRoute used to overwrite the new text again below.
       Detect address changes first and invalidate only stale route data.
    ========================= */

    function editAddressKey(value){
      return normalizeText(value)
        .toLowerCase()
        .replace(/\s+/g," ")
        .trim();
    }

    const incomingPickup =
      req.body.pickup !== undefined
        ? normalizeText(req.body.pickup)
        : normalizeText(existing.pickup);

    const incomingDropoff =
      req.body.dropoff !== undefined
        ? normalizeText(req.body.dropoff)
        : normalizeText(existing.dropoff);

    const incomingStops =
      Array.isArray(req.body.stops)
        ? parseStops(req.body.stops)
        : (
            Array.isArray(existing.stops)
              ? existing.stops
              : []
          );

    const pickupChanged =
      req.body.pickup !== undefined &&
      editAddressKey(incomingPickup) !==
      editAddressKey(existing.pickup);

    const dropoffChanged =
      req.body.dropoff !== undefined &&
      editAddressKey(incomingDropoff) !==
      editAddressKey(existing.dropoff);

    const oldStopsKey =
      JSON.stringify(
        (Array.isArray(existing.stops) ? existing.stops : [])
          .map(editAddressKey)
          .filter(Boolean)
      );

    const newStopsKey =
      JSON.stringify(
        incomingStops
          .map(editAddressKey)
          .filter(Boolean)
      );

    const stopsChanged =
      Array.isArray(req.body.stops) &&
      oldStopsKey !== newStopsKey;

    const routeAddressChanged =
      pickupChanged ||
      dropoffChanged ||
      stopsChanged;

    /* =========================
       UPDATE DATA
    ========================= */
    const updateData = {

      // BASIC
      type: normalizeTripType(req.body.type || existing.type),
      company: req.body.company ?? existing.company,

      entryName: req.body.entryName ?? existing.entryName,
      entryPhone: req.body.entryPhone ?? existing.entryPhone,

      clientName: req.body.clientName ?? existing.clientName,
      clientPhone: req.body.clientPhone ?? existing.clientPhone,

      serviceType:
        req.body.serviceType ?? existing.serviceType,

      serviceKey:
        req.body.serviceKey ?? existing.serviceKey,

      serviceCode:
        req.body.serviceCode ?? existing.serviceCode,

      // LOCATIONS
      pickup:
        incomingPickup,

      dropoff:
        incomingDropoff,

      stops:
        incomingStops,

      /*
        If address text changed and frontend did not send fresh coords,
        NEVER keep coordinates that belonged to the old address.
      */
      pickupLat:
        req.body.pickupLat !== undefined
          ? normalizeNumber(req.body.pickupLat)
          : (
              pickupChanged
                ? null
                : existing.pickupLat
            ),

      pickupLng:
        req.body.pickupLng !== undefined
          ? normalizeNumber(req.body.pickupLng)
          : (
              pickupChanged
                ? null
                : existing.pickupLng
            ),

      dropoffLat:
        req.body.dropoffLat !== undefined
          ? normalizeNumber(req.body.dropoffLat)
          : (
              dropoffChanged
                ? null
                : existing.dropoffLat
            ),

      dropoffLng:
        req.body.dropoffLng !== undefined
          ? normalizeNumber(req.body.dropoffLng)
          : (
              dropoffChanged
                ? null
                : existing.dropoffLng
            ),

      stopCoords:
        Array.isArray(req.body.stopCoords)
          ? parseStopCoords(req.body.stopCoords)
          : (
              stopsChanged
                ? []
                : existing.stopCoords
            ),

     // PRICE
priceAmount:
  req.body.priceAmount !== undefined
    ? Number(req.body.priceAmount)
    : Number(existing.priceAmount || 0),

finalPrice:
  req.body.finalPrice !== undefined
    ? Number(req.body.finalPrice)
    : Number(existing.finalPrice || 0),

pricePerPassenger:
  req.body.pricePerPassenger !== undefined
    ? Number(req.body.pricePerPassenger)
    : Number(existing.pricePerPassenger || 0),

      // ROUTE
      miles:
        routeAddressChanged
          ? (
              req.body.miles !== undefined
                ? req.body.miles
                : 0
            )
          : (req.body.miles ?? existing.miles),
      distanceMeters:
        routeAddressChanged
          ? (
              req.body.distanceMeters !== undefined
                ? req.body.distanceMeters
                : 0
            )
          : (req.body.distanceMeters ?? existing.distanceMeters),
      durationSeconds:
        routeAddressChanged
          ? (
              req.body.durationSeconds !== undefined
                ? req.body.durationSeconds
                : 0
            )
          : (req.body.durationSeconds ?? existing.durationSeconds),
      estimatedMinutes:
        routeAddressChanged
          ? (
              req.body.estimatedMinutes !== undefined
                ? req.body.estimatedMinutes
                : 0
            )
          : (req.body.estimatedMinutes ?? existing.estimatedMinutes),

      googleRoute:
  req.body.googleRoute !== undefined
    ? req.body.googleRoute
    : (
        routeAddressChanged
          ? {}
          : existing.googleRoute
      ),

routePoints:
  req.body.routePoints !== undefined
    ? req.body.routePoints
    : (
        routeAddressChanged
          ? []
          : existing.routePoints
      ),

optimizedRoute:
  req.body.optimizedRoute !== undefined
    ? req.body.optimizedRoute
    : (
        routeAddressChanged
          ? {}
          : existing.optimizedRoute
      ),

routePath:
  Array.isArray(req.body.routePath)
    ? req.body.routePath.map(p=>({
        lat:normalizeNumber(p?.lat),
        lng:normalizeNumber(p?.lng)
      })).filter(p=>p.lat !== null && p.lng !== null)
    : (
        routeAddressChanged
          ? []
          : existing.routePath
      ),

overviewPolyline:
  req.body.overviewPolyline !== undefined
    ? normalizeText(req.body.overviewPolyline)
    : (
        routeAddressChanged
          ? ""
          : existing.overviewPolyline
      ),

routeLocked:
  req.body.routeLocked !== undefined
    ? req.body.routeLocked === true
    : (
        routeAddressChanged
          ? false
          : existing.routeLocked
      ),

routeFinalized:
  req.body.routeFinalized !== undefined
    ? req.body.routeFinalized === true
    : (
        routeAddressChanged
          ? false
          : existing.routeFinalized
      ),

routeSource:
  req.body.routeSource !== undefined
    ? normalizeText(req.body.routeSource)
    : (
        routeAddressChanged
          ? ""
          : existing.routeSource
      ),

routeUpdatedAt:
  req.body.routeUpdatedAt !== undefined
    ? req.body.routeUpdatedAt
    : (
        routeAddressChanged
          ? null
          : existing.routeUpdatedAt
      ),

      // SHARED
      passengers: Array.isArray(req.body.passengers)
        ? req.body.passengers.map((p, i) => ({
            ...p,
            passengerId: p.passengerId || "P" + (i + 1)
          }))
        : existing.passengers,

      totalPassengers: req.body.totalPassengers ?? existing.totalPassengers,
      sharedStopsCount: req.body.sharedStopsCount ?? existing.sharedStopsCount,

      isShared: req.body.isShared ?? existing.isShared,
      tripType: req.body.tripType ?? existing.tripType,

      // TIME
      tripDate: req.body.tripDate ?? existing.tripDate,
      tripTime: req.body.tripTime ?? existing.tripTime,

      notes: req.body.notes ?? existing.notes,

      // DRIVER FINAL COMMENT — separate from normal notes
      cancelReason:
        req.body.cancelReason !== undefined
          ? normalizeText(req.body.cancelReason)
          : existing.cancelReason,

      noShowReason:
        req.body.noShowReason !== undefined
          ? normalizeText(req.body.noShowReason)
          : existing.noShowReason,

      // DISPATCH
      dispatchSelected: req.body.dispatchSelected ?? existing.dispatchSelected,
      disabled: req.body.disabled ?? existing.disabled,

      driverId: req.body.driverId ?? existing.driverId,
      driverName: req.body.driverName ?? existing.driverName,
      vehicle: req.body.vehicle ?? existing.vehicle,
      driverAddress: req.body.driverAddress ?? existing.driverAddress,
      dispatchNote: req.body.dispatchNote ?? existing.dispatchNote,

      // ADD STOP / ROUTE CHANGE
      addStopRequest:
        req.body.addStopRequest !== undefined
          ? req.body.addStopRequest
          : existing.addStopRequest,

      routeChangePending:
        req.body.routeChangePending !== undefined
          ? req.body.routeChangePending
          : existing.routeChangePending,

      routeChangeStatus:
        req.body.routeChangeStatus !== undefined
          ? req.body.routeChangeStatus
          : existing.routeChangeStatus,

      // STATUS
      status: req.body.status ?? existing.status,
      bookedAt: req.body.bookedAt ?? existing.bookedAt
};

if(updateData.status === "Confirmed"){

  updateData.dispatchSelected = true;
  updateData.isFinalized = false;

  const service = await getServiceByTrip(updateData);

  if(service){

    updateData.serviceName =
      service.title || service.name || updateData.serviceName || "";

    updateData.serviceId =
      String(service._id || updateData.serviceId || "");

    updateData.baseFare =
      Number(service.baseFare || 0);

    updateData.includedMiles =
      Number(service.includedMiles || 0);

    updateData.perMile =
      Number(service.perMile || 0);

    updateData.stopFee =
      Number(service.stopFee || 0);

    updateData.sharedPrice =
      Number(service.sharedPrice || 0);

    updateData.companyBaseFare =
      Number(service.companyBaseFare ?? service.baseFare ?? 0);

    updateData.companyIncludedMiles =
      Number(service.companyIncludedMiles ?? service.includedMiles ?? 0);

    updateData.companyPerMile =
      Number(service.companyPerMile ?? service.perMile ?? 0);

    updateData.companyStopFee =
      Number(service.companyStopFee ?? service.stopFee ?? 0);

    updateData.companySharedPrice =
      Number(service.companySharedPrice ?? service.sharedPrice ?? 0);

    updateData.noShowFee =
      Number(service.companyNoShowFee ?? service.noShowFee ?? updateData.noShowFee ?? 0);

    updateData.cancelFee =
      Number(service.companyCancelFee ?? service.cancelFee ?? updateData.cancelFee ?? 0);

  }

}

 /* =========================
       CLEAN STOPS
    ========================= */
    updateData.stops = (updateData.stops || []).filter(s => s && s.trim() !== "");

    /* =========================
       SHARED FIX
    ========================= */
    if (updateData.isShared && Array.isArray(updateData.passengers)) {
      const p = updateData.passengers;
      if (p.length > 0) {
        updateData.pickup = p[0].pickup || updateData.pickup;
        updateData.dropoff = p[p.length - 1].dropoff || updateData.dropoff;
      }
    }

    /* =========================
       ROUTE FIX
    ========================= */

    /*
      Never let an OLD googleRoute overwrite a pickup/dropoff that the
      admin just edited in Trips Hub or Trips.

      Only copy route addresses when the route itself is still valid and
      no address/stops were edited in this request.
    */
    if (
      !routeAddressChanged &&
      updateData.googleRoute &&
      Array.isArray(updateData.googleRoute.legs)
    ) {
      const legs = updateData.googleRoute.legs;

      if (legs.length > 0) {
        updateData.pickup =
          legs[0].startAddress ||
          updateData.pickup;

        updateData.dropoff =
          legs[legs.length - 1].endAddress ||
          updateData.dropoff;
      }
    }

  /* =========================
   FINALIZER
========================= */

if(updateData.status === "Cancelled"){

  const operationalCancel =
    isOperationalCancellationRole(
      req.authUser?.role
    );

  updateData.cancelledByRole =
    normalizeActorRole(
      req.authUser?.role
    ) || "UNKNOWN";

  updateData.cancellationChargeable =
    operationalCancel
      ? false
      : (
          existing.cancellationChargeable !== null &&
          existing.cancellationChargeable !== undefined
            ? existing.cancellationChargeable
            : true
        );

  if(operationalCancel){

    updateData.cancelFee = 0;
    updateData.finalPrice = 0;
    updateData.priceAmount = 0;

    if(
      Array.isArray(
        updateData.passengers
      )
    ){
      updateData.passengers =
        updateData.passengers.map(p=>({
          ...p,
          cancelFee:0,
          finalPrice:0,
          priceAmount:0,
          cancelledByRole:
            updateData.cancelledByRole,
          cancellationChargeable:false
        }));
    }

  }else{

    const finalPricingService =
      await getServiceByTrip(existing);

    if(
      Number(existing.cancelFee || 0) <= 0 &&
      Number(updateData.cancelFee || 0) <= 0
    ){
      updateData.cancelFee =
        Number(
          finalPricingService?.companyCancelFee ||
          finalPricingService?.cancelFee ||
          0
        );
    }

    updateData.finalPrice =
      Number(
        existing.cancelFee ||
        updateData.cancelFee ||
        existing.finalPrice ||
        0
      );
  }

  updateData.isFinalized = true;

  updateData.cancelDateTime =
    existing.cancelDateTime ||
    new Date();

  updateData.historyAt =
    existing.historyAt ||
    new Date();

}

else if(updateData.status === "No Show"){

  const finalPricingService =
    await getServiceByTrip(existing);

  if(
    Number(existing.noShowFee || 0) <= 0 &&
    Number(updateData.noShowFee || 0) <= 0
  ){
    updateData.noShowFee =
      Number(
        finalPricingService?.companyNoShowFee ||
        finalPricingService?.noShowFee ||
        0
      );
  }

  updateData.isFinalized = true;

  updateData.historyAt =
    existing.historyAt ||
    new Date();

  updateData.finalPrice =
    Number(
      existing.noShowFee ||
      updateData.noShowFee ||
      existing.finalPrice ||
      0
    );

}

else if(updateData.status === "Completed"){

  updateData.isFinalized = true;

  updateData.historyAt =
    existing.historyAt ||
    new Date();

  updateData.finalPrice =
    Number(
      existing.finalPrice ||
      existing.priceAmount ||
      0
    );

}
    /* =========================
       SAVE
    ========================= */
    const updated =
      await Trip.findOneAndUpdate(
        tenantFilter(
          req,
          {
            _id:req.params.id
          }
        ),
        updateData,
        { new:true }
      );

    await ensureTripCoords(updated);

    res.json(updated);

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error updating trip" });
  }
});

/* =========================
   DELETE TRIP
========================= */
app.delete("/api/trips/:id", requireTenantApi, async (req, res) => {
  try {
    const deleted =
      await Trip.findOneAndDelete(
        tenantFilter(
          req,
          {
            _id:req.params.id
          }
        )
      );

    if (!deleted) {
      return res.status(404).json({ message: "Trip not found" });
    }

    res.json({ message: "Deleted" });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error deleting trip" });
  }
});


/* =========================
   DRIVER API
========================= */

app.get("/api/driver/my-trips/:driverId", requireTenantApi, async (req, res) => {

  try {

    const driverId =
      String(req.params.driverId || "").trim();

    if (!driverId) {

      return res.status(400).json({
        message: "Driver ID required"
      });

    }

    /*
      DRIVER OWNERSHIP:
      A driver token may request only its own trips.
      Admin / dispatcher staff inside the same tenant may still inspect
      a driver when needed.
    */
    if(
      String(req.authUser?.role || "").toLowerCase() === "driver" &&
      String(req.authUser?.id || "") !== driverId
    ){
      return res.status(403).json({
        message:"Driver access denied"
      });
    }

    const includeFinal =
      String(req.query.includeFinal || "")
      .trim()
      .toLowerCase() === "true";

    const assignmentFilter = {
      driverId: driverId
    };

    if(!includeFinal){
      assignmentFilter.dispatchStatus = {
        $in: [
          "SENT",
          "ACCEPTED",
          "ON_TRIP"
        ]
      };
    }

    const assignments =
      await DispatchAssignment.find(
        assignmentFilter
      )
      .sort({
        sentAt: 1,
        assignedAt: 1
      })
      .lean();

    if (!assignments.length) {
      return res.json([]);
    }

    const tripIds =
      assignments
        .map(a => a.tripId)
        .filter(Boolean);

    const tripDocs =
      await Trip.find(
        tenantFilter(
          req,
          {
            _id:{
              $in:tripIds
            },
            disabled:{
              $ne:true
            }
          }
        )
      );

    /*
      Repair missing coordinates BEFORE Driver Trips / Driver Map receives
      the trip. Existing saved route data is reused first; geocode is only
      the last fallback.
    */
    for(const tripDoc of tripDocs){
      await ensureTripCoords(tripDoc);
    }

    const tripRows =
      tripDocs.map(t=>
        t?.toObject
          ? t.toObject()
          : t
      );

    const tripMap =
      new Map(
        tripRows.map(t => [
          String(t._id),
          t
        ])
      );

    const result = [];

    for (const assignment of assignments) {

      const trip =
        tripMap.get(
          String(assignment.tripId)
        );

      if (!trip) {
        continue;
      }

      result.push({

        ...trip,

        driverId:
          String(
            assignment.driverId || ""
          ),

        driverName:
          assignment.driverName ||
          trip.driverName ||
          "",

        vehicle:
          assignment.vehicleNumber ||
          trip.vehicle ||
          "",

        driverAddress:
          assignment.driverAddress ||
          trip.driverAddress ||
          "",

        driverPhone:
          assignment.driverPhone ||
          "",

        dispatchStatus:
          assignment.dispatchStatus ||
          "",

        dispatchNote:
          assignment.note ||
          trip.dispatchNote ||
          "",

        assignmentType:
          assignment.assignmentType ||
          "",

        sentAt:
          assignment.sentAt ||
          null

      });

    }

    result.sort((a, b) => {

      const aTime =
        new Date(
          `${a.tripDate || "9999-12-31"}T${a.tripTime || "23:59"}`
        ).getTime();

      const bTime =
        new Date(
          `${b.tripDate || "9999-12-31"}T${b.tripTime || "23:59"}`
        ).getTime();

      return aTime - bTime;

    });

    return res.json(result);

  } catch (err) {

    console.log(
      "DRIVER MY TRIPS ERROR:",
      err
    );

    return res.status(500).json({
      message: "Driver trips error"
    });

  }

});

/* =========================
   DRIVER ACCEPT TRIP
========================= */

app.patch("/api/driver/trips/:id/accept", async (req, res) => {

  try {

    const trip =
      await Trip.findById(
        req.params.id
      );

    if (!trip) {

      return res.status(404).json({
        message: "Trip not found"
      });

    }

    trip.status =
      "Accepted";

    await trip.save();

    await DispatchAssignment.findOneAndUpdate(

      {
        tripId: trip._id
      },

      {
        $set: {
          dispatchStatus: "ACCEPTED",
          acceptedAt: new Date()
        }
      }

    );

    return res.json(trip);

  } catch (err) {

    console.log(
      "ACCEPT TRIP ERROR:",
      err
    );

    return res.status(500).json({
      message: "Accept trip error"
    });

  }

});

/* =========================
   DRIVER START TRIP
========================= */

app.patch("/api/driver/trips/:id/start", async (req, res) => {

  try {

    const trip =
      await Trip.findById(
        req.params.id
      );

    if (!trip) {

      return res.status(404).json({
        message: "Trip not found"
      });

    }

    if (
      trip.stripePaymentMethodId &&
      trip.paymentStatus !== "AUTHORIZED"
    ) {

      return res.status(402).json({

        message:
          "Trip cannot start until the exact fare is authorized.",

        paymentStatus:
          trip.paymentStatus ||
          "PAYMENT_REQUIRED"

      });

    }

    trip.status =
      "On Trip";

    await trip.save();

    await DispatchAssignment.findOneAndUpdate(

      {
        tripId: trip._id
      },

      {
        $set: {
          dispatchStatus: "ON_TRIP",
          startedAt: new Date()
        }
      }

    );

    return res.json(trip);

  } catch (err) {

    console.log(
      "START TRIP ERROR:",
      err
    );

    return res.status(500).json({
      message: "Start trip error"
    });

  }

});

/* =========================
   DRIVER COMPLETE TRIP
========================= */

app.patch("/api/driver/trips/:id/complete", async (req, res) => {

  try {

    const trip =
      await Trip.findById(
        req.params.id
      );

    if (!trip) {

      return res.status(404).json({
        message: "Trip not found"
      });

    }

    /* =========================
       FINALIZED
    ========================= */

    if (trip.isFinalized) {
      return res.json(trip);
    }

    /* =========================
       COMPLETE
    ========================= */

const final =
Number(
  trip.finalPrice ||
  trip.priceAmount ||
  0
);

await finalizeIndividualTrip(
  trip,
  "COMPLETE",
  {
    finalPrice: final
  }
);

if(!trip.historyAt){
  trip.historyAt = new Date();
  await trip.save();
}

    /* =========================
       SHARED
    ========================= */

    if (
      trip.isShared &&
      Array.isArray(trip.passengers)
    ) {

   const activePassengers =
  trip.passengers.filter(p => {

    const s =
      String(
        p.status || ""
      )
      .toLowerCase()
      .trim();

    return (

      !s.includes("cancel") &&

      !s.includes("no")

    );

  });

const count =
  activePassengers.length || 1;

const perPassenger =
  Number(final || 0) / count;

trip.pricePerPassenger =
  Number(perPassenger || 0);

trip.passengers =
  trip.passengers.map(p => {

    const s =
      String(
        p.status || ""
      )
      .toLowerCase()
      .trim();

    if(
      !s ||
      s === "scheduled" ||
      s === "booked"
    ){

      return {

        ...p,

        status:"Completed",

        finalPrice:
          Number(
            perPassenger || 0
          ),

        priceAmount:
          Number(
            perPassenger || 0
          )

      };

    }

    if (s.includes("no")) {

      return {

        ...p,

        finalPrice:
          Number(
            trip.noShowFee || 0
          ),

        priceAmount:
          Number(
            trip.noShowFee || 0
          )

      };

    }

    if (s.includes("cancel")) {

      return {

        ...p,

        finalPrice:
          Number(
            trip.cancelFee || 0
          ),

        priceAmount:
          Number(
            trip.cancelFee || 0
          )

      };

    }

    if (s.includes("complete")) {

      return {

        ...p,

        finalPrice:
          Number(
            perPassenger || 0
          ),

        priceAmount:
          Number(
            perPassenger || 0
          )

      };

    }

    return p;

  });

}

res.json(trip);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "Complete trip error"
    });

  }

});

/* =========================
   DRIVER NO SHOW
========================= */
app.patch("/api/driver/trips/:id/no-show", async (req, res) => {

  try {

    const trip =
      await Trip.findById(
        req.params.id
      );

    if (!trip) {

      return res.status(404).json({
        message: "Trip not found"
      });

    }

    /* =========================
       FINALIZED
    ========================= */

    if (trip.isFinalized) {

      return res.json(trip);

    }

    /* =========================
       NO SHOW
    ========================= */

const noShowPricingService =
  await getServiceByTrip(trip);

const noShowFee =
  Number(
    trip.noShowFee ||
    noShowPricingService?.companyNoShowFee ||
    noShowPricingService?.noShowFee ||
    trip.finalPrice ||
    trip.priceAmount ||
    0
  );

trip.noShowFee =
  noShowFee;

await finalizeIndividualTrip(
  trip,
  "NOSHOW",
  {
    noShowFee
  }
);

if(!trip.historyAt){
  trip.historyAt = new Date();
  await trip.save();
}

    /* =========================
       SHARED SUPPORT
    ========================= */

    if (
      trip.isShared &&
      Array.isArray(trip.passengers)
    ) {

      trip.passengers =
        trip.passengers.map(p => ({

          ...p,

          status: "No Show",

          finalPrice:
            noShowFee,

          priceAmount:
            noShowFee

        }));

    }

    /* =========================
       EMAIL
    ========================= */

    try {

      await sendTripStatusEmail(
        trip,
        "NOSHOW"
      );

    } catch(emailErr){

      console.log(
        "NO SHOW EMAIL ERROR:",
        emailErr
      );

    }

    res.json(trip);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "No Show error"
    });

  }

});


/* =========================
   CREATE PAYMENT INTENT (STABLE)
========================= */
app.post("/api/create-payment-intent", async (req, res) => {
  try {

  console.log(
    "PAYMENT BODY:",
    req.body
  );

  const { tripId } = req.body;
    // تحقق
    if (!tripId) {
      return res.status(400).json({ message: "Missing tripId" });
    }

    const trip = await Trip.findById(tripId);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    // لو مدفوعة قبل كده
    if (trip.paymentIntentId) {
      return res.status(400).json({
        message: "Payment already created"
      });
    }

    const amount = Number(trip.priceAmount);

    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    // إنشاء الدفع (سحب فوري - زي سيستمك الحالي)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount * 100),
      currency: "usd",

      automatic_payment_methods: {
        enabled: true
      },

      metadata: {
        tripId: trip._id.toString()
      }
    });

    // حفظ الربط
    trip.paymentIntentId = paymentIntent.id;

    await trip.save();

    res.json({
      clientSecret: paymentIntent.client_secret
    });

  } catch (err) {
    console.log("Stripe Error:", err);
    res.status(500).json({ message: "Payment error" });
  }
});

/* =========================
   CANCEL TRIP + REFUND
   FINAL DYNAMIC TIMEZONE
========================= */

app.post("/api/cancel-trip", async (req, res) => {

  let cancellationClaimedTripId = null;

  try{

    const { token } = req.body;

    if(!token){

      return res.status(400).json({
        message:"Missing token"
      });

    }

    const trip =
    await Trip.findOne({
      cancelToken:token
    });

    if(!trip){

      return res.status(404).json({
        message:"Trip not found"
      });

    }

    /* =========================
       ALREADY CANCELLED
    ========================== */

    if(trip.status === "Cancelled"){

      return res.json({

        success:true,

        refund:
        trip.refundAmount || 0,

        fee:
        trip.cancelFee || 0,

        refundId:
        trip.simpleRefundId || "",

        refundStatus:
        trip.refundStatus || "none"

      });

    }

    /* =========================
       SYSTEM TIMEZONE
    ========================== */

    const settings =
    await SystemDesign.findOne({});

    const systemTimezone =

      settings?.timezone ||
      "America/Phoenix";

    function getSystemNow(){

      return new Date(

        new Date().toLocaleString(
          "en-US",
          {
            timeZone:systemTimezone
          }
        )

      );

    }

    const now =
    getSystemNow();

    /* =========================
       TRIP TIME
    ========================== */

    const tripTimeRaw =
    new Date(
      `${trip.tripDate}T${trip.tripTime}:00`
    );

    // tripDate/tripTime are already stored as the program's wall-clock time.
    // Compare them with the system wall clock without converting them twice.
    const tripTime = tripTimeRaw;

    if(
      isNaN(tripTime.getTime())
    ){

      return res.status(400).json({
        message:"Invalid trip time"
      });

    }

    /* =========================
       CALCULATE DIFFERENCE
    ========================== */

    const diffMinutes =
      (tripTime - now) / 60000;

    const totalAmount =
      Number(
        trip.priceAmount ||
        trip.finalPrice ||
        trip.totalPrice ||
        trip.price ||
        0
      );

    let refundAmount = 0;

    let fee = 0;

/* =========================
   LOAD SERVICE
========================= */
const service =
  await getServiceByTrip(trip);

/* =========================
   TRIP TYPE
========================= */
const tripType =
  String(trip.type || "")
    .toLowerCase()
    .trim();

/* =========================
   COMPANY CHECK
========================= */
const isCompanyTrip =

trip.company ||

tripType.includes("company") ||

tripType.includes("facility");

/* =========================
   CANCEL DISABLED
========================= */
const cancelDisabled =

  isCompanyTrip

    ? service?.companyDisableCancel === true

    : service?.disableCancel === true;

/* =========================
   WARNING MINUTES
========================= */
const warningMinutes =
  Number(

    isCompanyTrip

      ? (
          service?.companyWarningMinutes ??
          service?.warningMinutes ??
          120
        )

      : (
          service?.warningMinutes ??
          120
        )

  );

/* =========================
   CANCEL FEE
========================= */

const cancelFee =
  Number(

    isCompanyTrip

      ? (
          service?.companyCancelFee ??
          service?.cancelFee ??
          trip.cancelFee ??
          0
        )

      : (
          service?.cancelFee ??
          trip.cancelFee ??
          0
        )

  );

/* =========================
   APPLY CANCEL LOGIC
========================= */

if(diffMinutes > warningMinutes){

  fee = 0;

  refundAmount =
    totalAmount;

}

else if(cancelDisabled === false){

  fee =
    Number(cancelFee || 0);

  refundAmount =
    totalAmount - fee;

  if(refundAmount < 0){

    refundAmount = 0;

  }

}
else{

  fee = 0;

  refundAmount =
    totalAmount;

}

/* =========================
   ONE CANCELLATION REQUEST
========================= */

const cancellationClaim = await Trip.findOneAndUpdate(
  {
    _id:trip._id,
    status:{ $ne:"Cancelled" },
    cancellationRequestProcessing:{ $ne:true }
  },
  {
    $set:{
      cancellationRequestProcessing:true,
      cancellationRequestProcessingAt:new Date()
    }
  },
  { new:true }
);

if(!cancellationClaim){
  return res.status(409).json({
    success:false,
    alreadySubmitted:true,
    message:"Cancellation has already been submitted."
  });
}

cancellationClaimedTripId = trip._id;

trip.cancellationRequestProcessing = true;
trip.cancellationRequestProcessingAt =
  cancellationClaim.cancellationRequestProcessingAt;

/* =========================
   CANCELLATION SOURCE
========================= */

trip.cancelledByRole =
  "CUSTOMER";

trip.cancellationChargeable =
  Number(fee || 0) > 0;

/* =========================
   REFUND ID
========================= */

const simpleRefundId =

  "RF-" +
  (trip.tripNumber || "0000");

/* =========================
   SAVE BEFORE STRIPE
========================= */

await finalizeIndividualTrip(
  trip,
  "CANCEL",
  {
    cancelFee: fee,
    refundAmount,
    cancelledByRole:"CUSTOMER",
    cancellationChargeable:
      Number(fee || 0) > 0
  }
);

if(!trip.historyAt){
  trip.historyAt = new Date();
}

trip.simpleRefundId =
  simpleRefundId;

trip.refundStatus =
  refundAmount > 0 && !trip.stripePaymentMethodId
    ? "processing"
    : "none";

await trip.save();

await sendTripStatusEmail(
  trip,
  "CANCELLED"
);

/* =========================
   STRIPE REFUND
========================= */
let stripeRefundId = null;

if(

  refundAmount > 0 &&

  !trip.stripePaymentMethodId &&

  trip.paymentIntentId

){

  try{

    const refund =

      await stripe.refunds.create({

        payment_intent:
          trip.paymentIntentId,

        amount:
          Math.round(
            refundAmount * 100
          )

      },{
        idempotencyKey:
          `cancel-refund-${trip._id}-${Math.round(refundAmount * 100)}`
      });

    stripeRefundId =
      refund.id;

    trip.refundId =
      refund.id;

    trip.refundStatus =
      "refunded";

    await trip.save();

  }catch(stripeErr){

    console.log(
      "STRIPE REFUND ERROR",
      stripeErr
    );

    trip.refundStatus =
      "failed";

    await trip.save();

  }

}

/* =========================
   RESPONSE
========================= */

res.json({

  success:true,

  refund:
    trip.stripePaymentMethodId
      ? 0
      : refundAmount,

  fee:
    fee,

  refundId:
    trip.stripePaymentMethodId
      ? ""
      : simpleRefundId,

  refundStatus:
    trip.refundStatus

});

} catch (err) {

  if(cancellationClaimedTripId){
    try{
      await Trip.updateOne(
        {
          _id:cancellationClaimedTripId,
          status:{ $ne:"Cancelled" }
        },
        {
          $set:{ cancellationRequestProcessing:false },
          $unset:{ cancellationRequestProcessingAt:1 }
        }
      );
    }catch(unlockErr){
      console.log("CANCEL UNLOCK ERROR",unlockErr);
    }
  }

  console.log(
    "🔥 CANCEL ERROR FULL:",
    err
  );

  res.status(500).json({

    message:
      err?.paymentFailed
        ? "We could not process the applicable cancellation fee. Please update your payment method or contact support."
        : "Unable to cancel this trip. Please contact support."

  });

}

}); 

/* =========================
   CHECK CANCEL TOKEN
========================= */

app.post(
  "/api/cancel-trip-check",
  async (req, res) => {

    try {

      const token =

        req.body?.token ||

        req.query?.token;

      if (!token) {

        return res.status(400).json({
          message:"Missing token"
        });

      }

      /* =========================
         TRIP
      ========================= */

      const trip =
        await Trip.findOne({
          cancelToken:token
        });

      if (!trip) {

        return res.status(404).json({
          message:"Trip not found"
        });

      }

      /* =========================
         SYSTEM DESIGN
      ========================= */

      const settings =
        await SystemDesign.findOne({});

      const timezone =

        settings?.timezone ||

        "America/Phoenix";

      /* =========================
         CURRENT TIME
      ========================= */

      const now =
        new Date(
          new Date().toLocaleString(
            "en-US",
            {
              timeZone:timezone
            }
          )
        );

      let fee = 0;

      /* =========================
         LOAD SERVICE
      ========================= */

      const service =
        await getServiceByTrip(trip);

      const tripType =
        String(trip.type || "")
          .toLowerCase()
          .trim();

      const isCompanyTrip =

  trip.company ||

  tripType.includes("company") ||

  tripType.includes("facility");

      /* =========================
         CANCEL DISABLED
      ========================= */

      const cancelDisabled =

        isCompanyTrip

          ? service?.companyDisableCancel === true

          : service?.disableCancel === true;

      /* =========================
         WARNING MINUTES
      ========================= */

      const warningMinutes =
        Number(

          isCompanyTrip

            ? (
                service?.companyWarningMinutes ??
                service?.warningMinutes ??
                120
              )

            : (
                service?.warningMinutes ??
                120
              )

        );

      /* =========================
         CANCEL FEE
      ========================= */

      const cancelFee =
        Number(

          isCompanyTrip

            ? (
                service?.companyCancelFee ??
                service?.cancelFee ??
                trip.cancelFee ??
                0
              )

            : (
                service?.cancelFee ??
                trip.cancelFee ??
                0
              )

        );

      /* =========================
         TRIP TIME
      ========================= */

      if(
        trip.tripDate &&
        trip.tripTime
      ){

        const tripTimeRaw =
          new Date(
            `${trip.tripDate}T${trip.tripTime}:00`
          );

        // Stored trip time and `now` are both system wall-clock values.
        const tripTime = tripTimeRaw;

        if(
          isNaN(
            tripTime.getTime()
          )
        ){

          return res.status(400).json({
            message:"Invalid trip time"
          });

        }

        const diffMinutes =

          (tripTime - now) / 60000;

        /* =========================
           EXPIRED
        ========================= */

        if(diffMinutes <= 0){

          return res.json({

            success:false,

            expired:true,

            message:
              "Trip already started or expired"

          });

        }

    /* =========================
   FREE CANCEL
========================= */

if(diffMinutes > warningMinutes){

  fee = 0;

}

/* =========================
   WARNING ACTIVE
========================= */

else if(cancelDisabled === false){

  fee =
    Number(cancelFee || 0);

}

/* =========================
   FREE INSIDE WINDOW
========================= */

else{

  fee = 0;

}

  /* =========================
   RESPONSE
========================= */

res.json({

  success:true,

  tripNumber:
    trip.tripNumber,

  clientName:
    trip.clientName,

  passengerName:
    trip.passengerName || trip.clientName,

  serviceName:
    trip.serviceName || service?.name || service?.serviceName || "",

  serviceType:
    trip.serviceType || trip.service || "",

  pickup:
    trip.pickup,

  dropoff:
    trip.dropoff,

  stops:
    Array.isArray(trip.stops) ? trip.stops : [],

  tripDate:
    trip.tripDate,

  tripTime:
    trip.tripTime,

  priceAmount:
    Number(
      trip.priceAmount ||
      trip.finalPrice ||
      trip.totalPrice ||
      trip.price ||
      0
    ),

  status:
    trip.status,

  fee,

  timezone,

  alreadyCancelled:
    trip.status ===
    "Cancelled"

});

} // end trip time check

} // end try

catch (err) {

  console.log(
    "CHECK ERROR:",
    err
  );

  res.status(500).json({
    message:"Server error"
  });

}

});

 // end cancel-trip-check
/* =========================
   GET REFUNDS
========================= */
app.get("/api/refunds", async (req, res) => {
  try {
    const refunds = await Trip.find({
      status: "Cancelled"
    })
    .sort({ createdAt: -1 })
    .lean();

    res.json(refunds);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading refunds" });
  }
});

app.post("/api/company/cancel-trip/:id", async (req,res)=>{

  try{

    const trip =
      await Trip.findById(req.params.id);

    if(!trip){
      return res.status(404).json({
        message:"Trip not found"
      });
    }

    const service =
      await getServiceByTrip(trip);

    const settings =
      await SystemDesign.findOne({});

    const systemTimezone =
      settings?.timezone ||
      "America/Phoenix";

    const now =
      new Date(
        new Date().toLocaleString(
          "en-US",
          {timeZone:systemTimezone}
        )
      );

    const tripTimeRaw =
      new Date(
        `${trip.tripDate}T${trip.tripTime}:00`
      );

    const tripTime =
      new Date(
        tripTimeRaw.toLocaleString(
          "en-US",
          {timeZone:systemTimezone}
        )
      );

    if(isNaN(tripTime.getTime())){
      return res.status(400).json({
        message:"Invalid trip time"
      });
    }

    const diffMinutes =
      (tripTime - now) / 60000;

    const warningMinutes =
      Number(
        service?.companyWarningMinutes ??
        service?.warningMinutes ??
        120
      );

    const cancellationConditionEnabled =
      service?.companyDisableCancel !== true &&
      service?.disableCancel !== true;

    const insideWarningWindow =
      diffMinutes > 0 &&
      diffMinutes <= warningMinutes;

    const configuredCancelFee =
      Number(
        service?.companyCancelFee ??
        service?.cancelFee ??
        trip.cancelFee ??
        0
      );

    const totalCancelFee =
      cancellationConditionEnabled &&
      insideWarningWindow
        ? configuredCancelFee
        : 0;

    const originalAmount =
      Number(
        trip.priceAmount ||
        trip.finalPrice ||
        trip.price ||
        0
      );

    trip.cancelledByRole =
      "COMPANY";

    trip.cancellationChargeable =
      Number(totalCancelFee || 0) > 0;

    if(
      trip.isShared === true &&
      Array.isArray(trip.passengers) &&
      trip.passengers.length > 0
    ){

      const perPassengerFee =
        Number(totalCancelFee || 0);

      trip.status = "Cancelled";
      trip.cancelFee = totalCancelFee;
      trip.cancelDateTime = new Date();
      trip.historyAt = trip.historyAt || new Date();
      trip.isFinalized = true;
      trip.finalizedAt = new Date();

      trip.passengers =
        trip.passengers.map(p=>{

          const s =
            String(p.status || "")
              .toLowerCase()
              .trim();

          if(
            s.includes("cancel") ||
            s.includes("no")
          ){
            return p;
          }

          return {
            ...p,
            status:"Cancelled",
            cancelFee:perPassengerFee,
            finalPrice:perPassengerFee,
            priceAmount:perPassengerFee,
            cancelledByRole:"COMPANY",
            cancellationChargeable:
              Number(perPassengerFee || 0) > 0,
            isFinalized:true,
            finalizedAt:new Date()
          };

        });

      trip.groupTotal =
        trip.passengers.reduce((sum,p)=>{
          return sum + Number(p.finalPrice || 0);
        },0);

      trip.finalPrice = trip.groupTotal;
      trip.priceAmount = trip.groupTotal;
      trip.refundAmount =
        Math.max(
          0,
          originalAmount - trip.groupTotal
        );

      trip.groupStatus = "Cancelled";

      await trip.save();

      return res.json({
        success:true,
        fee:trip.groupTotal,
        refund:trip.refundAmount
      });

    }

    await finalizeIndividualTrip(
      trip,
      "CANCEL",
      {
        cancelFee: totalCancelFee,
        refundAmount:
          Math.max(
            0,
            originalAmount - totalCancelFee
          ),
        cancelledByRole:"COMPANY"
      }
    );

    trip.historyAt =
      trip.historyAt ||
      new Date();

    trip.priceAmount = totalCancelFee;

    await trip.save();

    res.json({
      success:true,
      fee:Number(trip.cancelFee || 0),
      refund:Number(trip.refundAmount || 0)
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Cancel failed"
    });

  }

});

/* =========================
   PUBLIC TENANT HOMEPAGE
   /sony
   /cover-all
========================= */

app.get(
  "/:tenantSlug",
  async (req,res,next)=>{

    try{

      const tenantSlug =
        cleanTenantSlug(
          req.params.tenantSlug
        );

      if(
        !tenantSlug ||
        !/^[a-z0-9-]+$/.test(
          tenantSlug
        )
      ){
        return next();
      }

      const tenant =
        await Tenant.findOne({
          slug:tenantSlug,
          enabled:true,
          subscriptionStatus:{
            $in:["ACTIVE","TRIAL"]
          }
        })
        .select(
          "_id name slug enabled subscriptionStatus"
        )
        .lean();

      if(!tenant){
        return next();
      }

      return res.sendFile(
        path.join(
          __dirname,
          "public",
          "index.html"
        )
      );

    }catch(err){

      console.log(
        "TENANT HOMEPAGE ERROR:",
        err
      );

      return next();
    }

  }
);

/* =========================
   ROOT
========================= */

app.get("/", (req, res) => {

  res.sendFile(
    path.join(
      __dirname,
      "public",
      "index.html"
    )
  );

});

function getSystemNow(){

  const timezone =
    process.env.SYSTEM_TIMEZONE ||
    "America/Phoenix";

  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone: timezone
      }
    )
  );

}

function parseTripDateTime(
  tripDate,
  tripTime
){

  if(
    !tripDate ||
    !tripTime
  ){
    return null;
  }

  const timezone =
    process.env.SYSTEM_TIMEZONE ||
    "America/Phoenix";

  const date =
    new Date(
      `${tripDate}T${tripTime}:00`
    );

  if(
    isNaN(date.getTime())
  ){
    return null;
  }

  return new Date(
    date.toLocaleString(
      "en-US",
      {
        timeZone: timezone
      }
    )
  );

}

/* =========================
   TRIP REMINDER
========================= */

setInterval(async () => {

  try {

    const now =
      getSystemNow();

    const trips =
      await Trip.find({

        reminderSent:false,

        clientEmail:{
          $ne:""
        },

        status:{
          $nin:[
            "Cancelled",
            "Completed",
            "No Show"
          ]
        }

      });

    for(const trip of trips){

      const isCompanyTrip =

        trip.company ||

        String(trip.type || "")
          .toLowerCase()
          .includes("company");

      if(isCompanyTrip){
        continue;
      }

      try{

        if(
          !trip.tripDate ||
          !trip.tripTime
        ){
          continue;
        }

        const tripDateTime =
          parseTripDateTime(
            trip.tripDate,
            trip.tripTime
          );

        if(!tripDateTime){
          continue;
        }

        const diffMinutes =

          (
            tripDateTime.getTime() -
            now.getTime()
          ) / 60000;

        if(
          diffMinutes <= 120 &&
          diffMinutes > 0
        ){

          const locked =
            await Trip.findOneAndUpdate(

              {
                _id:trip._id,
                reminderSent:false
              },

              {
                reminderSent:true
              },

              {
                new:true
              }

            );

          if(!locked){
            continue;
          }

          await sendTripStatusEmail(
            locked,
            "REMINDER"
          );

        }

      }catch(innerErr){

        console.log(
          innerErr.message
        );

      }

    }

  }catch(err){

    console.log(
      err.message
    );

  }

/* =========================
   AUTO CLOSE OLD TRIPS
========================= */

const now = getSystemNow();

const oldTrips = await Trip.find({

  status:{
    $nin:[
      "Completed",
      "Cancelled",
      "No Show",
      "Not Completed"
    ]
  }

});

for(const trip of oldTrips){

  try{

    const tripDateTime =
      parseTripDateTime(
        trip.tripDate,
        trip.tripTime
      );

    if(!tripDateTime){
      continue;
    }

 const diffHours =
  (now - tripDateTime) /
  (1000 * 60 * 60);

if(diffHours >= 10){

  await Trip.findByIdAndUpdate(
    trip._id,
    {
      status:"Not Completed",
      priceAmount:0,
      finalPrice:0,
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0
    }
  );

}

  }catch(err){

    console.log(err);

  }

}

}, 60000);
 
/* =========================
   PLATFORM ADMIN ROUTES
========================= */

app.use(
  "/api/platform-admin",
  require("./routes/platformAdminRoutes")
);

/* =========================
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});
