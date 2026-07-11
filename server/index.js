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

const BillingHistory =
require("./models/BillingHistory"
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
const userSchema = new mongoose.Schema({

  name: { type: String, required: true },

  username: {
    type: String,
    unique: true,
    required: true
  },

  password: {
    type: String,
    required: true
  },

  role: {
    type: String,
    enum: ["admin", "dispatcher", "driver", "company"],
    required: true
  },

  active: {
    type: Boolean,
    default: true
  },

  /* OPTIONAL DRIVER / DISPATCH DATA */

  vehicleNumber: {
    type: String,
    default: ""
  },

  address: {
    type: String,
    default: ""
  },

  phone: {
    type: String,
    default: ""
  },

email:{
  type:String,
  default:""
},
  /* =========================
     BILLING SYSTEM
  ========================= */

  billingStatus: {
    type: String,
    enum: ["ACTIVE","PAST_DUE","SUSPENDED"],
    default: "ACTIVE"
  },

  billingCycle: {
    type: String,
    enum: ["MONTHLY","WEEKLY"],
    default: "MONTHLY"
  },

  invoiceAmount: {
    type: Number,
    default: 0
  },

  lastPaymentDate: {
    type: Date,
    default: null
  },

  nextBillingDate: {
    type: Date,
    default: null
  },
billingStartDate: {
  type: Date,
  default: null
},

billingEndDate: {
  type: Date,
  default: null
},

daysLeft: {
  type: Number,
  default: 0
},
  graceDays: {
    type: Number,
    default: 3
  },

  billingLocked: {
    type: Boolean,
    default: false
  },

 billingNotes: {
  type: String,
  default: ""
},

totalTrips: {
  type: Number,
  default: 0
},

individualTrips: {
  type: Number,
  default: 0
},

sharedTrips: {
  type: Number,
  default: 0
},

sharedPassengers: {
  type: Number,
  default: 0
},

completedTrips: {
  type: Number,
  default: 0
},

cancelledTrips: {
  type: Number,
  default: 0
},

noShowTrips: {
  type: Number,
  default: 0
},

revenue: {
  type: Number,
  default: 0
}

}, { timestamps: true });

const User =
  mongoose.models.User ||
  mongoose.model(
    "User",
    userSchema
  );
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

  cancelDateTime: { type: Date, default: null },

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

bookedAt: { type: Date, default: Date.now },
createdAt: { type: Date, default: Date.now }

}, { minimize: false });

/* =========================
   INDEXES
========================= */
tripSchema.index({ tripNumber: 1 }, { unique: true, sparse: true });
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
  const pickupLat = normalizeNumber(trip.pickupLat);
  const pickupLng = normalizeNumber(trip.pickupLng);
  const dropoffLat = normalizeNumber(trip.dropoffLat);
  const dropoffLng = normalizeNumber(trip.dropoffLng);

  let changed = false;

  let finalPickupLat = pickupLat;
  let finalPickupLng = pickupLng;
  let finalDropoffLat = dropoffLat;
  let finalDropoffLng = dropoffLng;

  if (finalPickupLat === null || finalPickupLng === null) {
    const geo = await geocodeAddress(trip.pickup);
    if (geo.lat !== null && geo.lng !== null) {
      finalPickupLat = geo.lat;
      finalPickupLng = geo.lng;
      changed = true;
    }
  }

  if (finalDropoffLat === null || finalDropoffLng === null) {
    const geo = await geocodeAddress(trip.dropoff);
    if (geo.lat !== null && geo.lng !== null) {
      finalDropoffLat = geo.lat;
      finalDropoffLng = geo.lng;
      changed = true;
    }
  }

  trip.pickupLat = finalPickupLat;
  trip.pickupLng = finalPickupLng;
  trip.dropoffLat = finalDropoffLat;
  trip.dropoffLng = finalDropoffLng;

  if (changed && trip._id) {
    try {
      await Trip.findByIdAndUpdate(trip._id, {
        pickupLat: finalPickupLat,
        pickupLng: finalPickupLng,
        dropoffLat: finalDropoffLat,
        dropoffLng: finalDropoffLng
      });
    } catch (err) {
      console.log("Trip coord save error:", err?.message || err);
    }
  }

  return trip;
}

async function ensureDriverScheduleCoords(driverId, scheduleRow) {
  const lat = normalizeNumber(scheduleRow?.lat);
  const lng = normalizeNumber(scheduleRow?.lng);

  if (lat !== null && lng !== null) {
    return {
      ...scheduleRow,
      lat,
      lng
    };
  }

  const address = normalizeText(scheduleRow?.address);
  if (!address) return scheduleRow;

  const geo = await geocodeAddress(address);
  if (geo.lat === null || geo.lng === null) return scheduleRow;

  try {
    await DriverSchedule.findOneAndUpdate(
      { driverId: String(driverId) },
      { lat: geo.lat, lng: geo.lng }
    );
  } catch (err) {
    console.log("Driver schedule coord save error:", err?.message || err);
  }

 return {
  ...scheduleRow,
  lat: geo.lat,
  lng: geo.lng
  };
}

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

    const safeSchedule = await ensureDriverScheduleCoords(id, baseSchedule);
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
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ message: "Missing credentials" });
    }

    const user = await User.findOne({ username });

    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

console.log("LOGIN USER =", {
  username: user.username,
  role: user.role,
  enabled: user.enabled
});

   if (user.enabled === false) {
  return res.status(403).json({ message: "User disabled" });
}

    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: "1d" }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role
      }
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Server error" });
  }
});

/* =========================
   USERS ROUTES
========================= */

app.get("/api/users/:role", async (req, res) => {

  try {

    const role = req.params.role;

    if (
      ![
        "superadmin",
        "admin",
        "dispatcher",
        "driver",
        "company"
      ].includes(role)
    ) {

      return res.status(400).json({
        message: "Invalid role"
      });

    }

    const users = await User.find({
      role
    }).sort({
      createdAt: -1,
      name: 1
    });

    res.json(users);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "Error loading users"
    });

  }

});

/* =========================
   CREATE USER
========================= */

app.post("/api/users/:role", async (req, res) => {

  try {

    const role = req.params.role;

    const {
      name,
      username,
      email,
      password,
      vehicleNumber,
      address,
      phone
    } = req.body || {};

    if (
      ![
        "superadmin",
        "admin",
        "dispatcher",
        "driver",
        "company"
      ].includes(role)
    ) {

      return res.status(400).json({
        message: "Invalid role"
      });

    }

    if (
      !name ||
      !username ||
      !password
    ) {

      return res.status(400).json({
        message: "Missing fields"
      });

    }

    const exists =
      await User.findOne({
        username:
          normalizeText(username)
      });

    if (exists) {

      return res.status(400).json({
        message: "Username exists"
      });

    }

    const hashed =
      await bcrypt.hash(password, 10);

    const newUser =
      await User.create({

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

    res.json(newUser);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "Error creating user"
    });

  }

});

/* =========================
   UPDATE USER
========================= */

app.put("/api/users/:id", async (req, res) => {

  try {

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

    if (
      password &&
      String(password).trim() !== ""
    ) {

      updateData.password =
        await bcrypt.hash(password, 10);

    }

    const updated =
      await User.findByIdAndUpdate(

        req.params.id,

        updateData,

        {
          new: true
        }

      );

    res.json(updated);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "Error updating user"
    });

  }

});

/* =========================
   TOGGLE ACTIVE
========================= */

app.patch("/api/users/:id/toggle", async (req, res) => {

  try {

    const user =
      await User.findById(
        req.params.id
      );

    if (!user) {

      return res.status(404).json({
        message: "User not found"
      });

    }

    user.enabled = !user.enabled;

    await user.save();

    res.json(user);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "Error toggling user"
    });

  }

});

/* =========================
   DELETE USER
========================= */

app.delete("/api/users/:id", async (req, res) => {

  try {

    await User.findByIdAndDelete(
      req.params.id
    );

    res.json({
      message: "Deleted"
    });

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "Error deleting user"
    });

  }

});

/* =========================
   ADMIN BILLING LIST
========================= */

app.get("/api/admin/billing", async (req, res) => {

  try {

    const companies = await User.find({
      role: "company"
    })
    .sort({ name: 1 })
    .lean();

    const updated = await Promise.all(
      companies.map(async (company) => {
        return await updateCompanyBilling(company);
      })
    );

    res.json(updated);

  } catch (err) {

    console.log(err);

    res.status(500).json({
      message: "billing error"
    });

  }

});

async function getServiceByTrip(trip){

  const serviceKey =
    String(
      trip.serviceKey ||
      trip.serviceType ||
      ""
    )
    .trim()
    .toUpperCase();

  if(!serviceKey){
    return null;
  }

  return await Service.findOne({
    serviceKey
  }).lean();

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

  let individualTrips = 0;
  let completedTrips = 0;
  let cancelledTrips = 0;
  let noShowTrips = 0;
  let revenue = 0;

  const sharedGroups = new Set();

for (const t of trips) {
   const service =
  await getServiceByTrip(t);

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

      amount += Number(

        p.finalPrice ||
        t.finalPrice ||
        t.cancelFee ||
        0

      );

    }else if(ps.includes("no")){

      amount += Number(
        t.noShowFee || 0
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

    amount = Number(

      t.finalPrice ||
      t.cancelFee ||
      t.priceAmount ||
      0

    );

  }else if(status.includes("no")){

    amount = Number(
      t.noShowFee || 0
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

await User.findByIdAndUpdate(
  company._id,
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

return await User.findById(company._id).lean();

}

/* =========================
   LOCK COMPANY
========================= */

app.put("/api/admin/billing/:id/lock", async (req,res)=>{

  try{

    await User.findByIdAndUpdate(
      req.params.id,
      {
        billingLocked:true,
        billingStatus:"SUSPENDED"
      }
    );

    res.json({
      success:true
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"lock failed"
    });

  }

});

/* =========================
   UNLOCK COMPANY
========================= */

app.put("/api/admin/billing/:id/unlock", async (req,res)=>{

  try{

    await User.findByIdAndUpdate(
      req.params.id,
      {
        billingLocked:false,
        billingStatus:"ACTIVE"
      }
    );

    res.json({
      success:true
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"unlock failed"
    });

  }

});

/* =========================
   MARK BILLING PAID
========================= */

app.put("/api/admin/billing/:id/mark-paid", async (req,res)=>{

  try{

    const user =
      await User.findById(req.params.id);

    if(!user){

      return res.status(404).json({
        message:"Company not found"
      });

    }

    const now = new Date();

    let nextBillingDate =
      new Date(now);

    /* =========================
       NEXT BILLING DATE
    ========================= */

    if(user.billingCycle === "WEEKLY"){

      nextBillingDate.setDate(
        nextBillingDate.getDate() + 7
      );

    }else{

      nextBillingDate.setMonth(
        nextBillingDate.getMonth() + 1
      );

    }

    /* =========================
       BILLING STATUS
    ========================= */

    user.billingStatus = "ACTIVE";

    user.billingLocked = false;

    /* =========================
       PAYMENT DATES
    ========================= */

    user.lastPaymentDate = now;

    /* 🔥 بداية دورة جديدة */
    user.billingStartDate =
      new Date(
        now.toISOString()
      );

    /* 🔥 نهاية الدورة الجديدة */
    user.billingEndDate =
      new Date(
        nextBillingDate.toISOString()
      );

    user.nextBillingDate =
      new Date(
        nextBillingDate.toISOString()
      );

    /* =========================
       RESET BILLING
    ========================= */

    /* 🔥 تصفير الفاتورة */
    user.invoiceAmount = 0;

    /* 🔥 تصفير الإيراد الحالي */
    user.revenue = 0;

    /* 🔥 تصفير الإحصائيات */
    user.totalTrips = 0;

    user.individualTrips = 0;

    user.sharedTrips = 0;

    user.sharedPassengers = 0;

    user.completedTrips = 0;

    user.cancelledTrips = 0;

    user.noShowTrips = 0;

    /* =========================
       SAVE
    ========================= */

    await user.save();

    res.json({
      success:true,
      message:"Billing marked paid"
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"mark paid failed"
    });

  }

});

/* =========================
   GENERATE INVOICE
========================= */

app.put("/api/admin/generate-invoice/:id", async (req,res)=>{

  try{

    const company =
      await User.findById(req.params.id);

    if(!company){

      return res.status(404).json({
        message:"Company not found"
      });

    }

    const {
      billingStartDate,
      billingEndDate,
      graceDays
    } = req.body;

    /* 🔥 حفظ الفترة الجديدة */

/* 🔥 ARIZONA SAFE DATES */

company.billingStartDate =
  new Date(
    billingStartDate + "T12:00:00"
  );

company.billingEndDate =
  new Date(
    billingEndDate + "T12:00:00"
  );

company.nextBillingDate =
  new Date(
    billingEndDate + "T12:00:00"
  );

    /* 🔥 Grace */

    company.graceDays =
      Number(graceDays || 3);

    /* 🔥 الفاتورة الحالية */

    company.invoiceAmount =
      Number(company.revenue || 0);

    /* 🔥 فتح الشركة */

    company.billingStatus =
      "ACTIVE";

    company.billingLocked =
      false;

    await company.save();

    res.json({
      success:true,
      message:"Invoice generated"
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"generate invoice failed"
    });

  }

});

/* =========================
   COMPANY BILLING
========================= */

app.get("/api/company/billing", async (req,res)=>{

  try{

    const companyName =
      String(req.query.company || "").trim();

    if(!companyName){

      return res.status(400).json({
        message:"Company required"
      });

    }

    let company =
      await User.findOne({
        role:"company",
        name:{
          $regex:"^" + companyName + "$",
          $options:"i"
        }
      });

    if(!company){

      return res.status(404).json({
        message:"Company not found"
      });

    }

    company =
      await updateCompanyBilling(company);

    res.json({

      _id:company._id,
      name:company.name || "",

      billingStatus:
        company.billingStatus || "ACTIVE",

      billingCycle:
        company.billingCycle || "MONTHLY",

      invoiceAmount:
        company.invoiceAmount || 0,

      revenue:
        company.revenue || 0,

      totalTrips:
        company.totalTrips || 0,

      individualTrips:
        company.individualTrips || 0,

      sharedTrips:
        company.sharedTrips || 0,

      completedTrips:
        company.completedTrips || 0,

      cancelledTrips:
        company.cancelledTrips || 0,

      noShowTrips:
        company.noShowTrips || 0,

      billingStartDate:
        company.billingStartDate || null,

      billingEndDate:
        company.billingEndDate || null,

      nextBillingDate:
        company.nextBillingDate || null,

      lastPaymentDate:
        company.lastPaymentDate || null,

      daysLeft:
        company.daysLeft || 0,

      graceDays:
        company.graceDays || 0,

      billingLocked:
        company.billingLocked || false,

      billingNotes:
        company.billingNotes || ""

    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"billing load failed"
    });

  }

});

/* =========================
   CREATE ACH PAYMENT
========================= */

app.post("/api/company/create-ach-payment", async (req,res)=>{

  try{

    const companyName =
      String(req.body.company || "").trim();

    if(!companyName){

      return res.status(400).json({
        message:"Company required"
      });

    }

    const company =
      await User.findOne({
        role:"company",
        name:{
          $regex:"^" + companyName + "$",
          $options:"i"
        }
      });

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

    const session =
      await stripe.checkout.sessions.create({

        payment_method_types:[
          "card",
          "us_bank_account"
        ],

        mode:"payment",

        metadata:{
          companyId:company._id.toString()
        },

        line_items:[{
          price_data:{
            currency:"usd",
            product_data:{
              name:`${company.name} Billing Invoice`
            },
            unit_amount:Math.round(amount * 100)
          },
          quantity:1
        }],

        success_url:
          "https://sunbeam-933q.onrender.com/companies/payment.html?success=1&session_id={CHECKOUT_SESSION_ID}&companyId=" + company._id,

        cancel_url:
          "https://sunbeam-933q.onrender.com/companies/payment.html?cancel=1"

      });

    res.json({
      success:true,
      url:session.url
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"payment failed"
    });

  }

});


/* =========================
   VERIFY COMPANY PAYMENT
========================= */

app.get("/api/company/check-payment", async (req,res)=>{

  try{

    console.log("CHECK PAYMENT HIT");
    console.log(req.query);

    const sessionId =
      req.query.session_id;

    const companyId =
      req.query.companyId;

    if(!sessionId || !companyId){

      return res.status(400).json({
        paid:false
      });

    }

    const session =
      await stripe.checkout.sessions.retrieve(
        sessionId
      );

    console.log(
      "PAYMENT STATUS:",
      session.payment_status
    );

    if(session.payment_status !== "paid"){

      return res.json({
        paid:false
      });

    }

    const company =
      await User.findById(companyId);

    console.log(
      "COMPANY FOUND:",
      !!company
    );

    if(!company){

      return res.status(404).json({
        paid:false
      });

    }

    /* 🔥 منع التكرار */

    if(session.metadata?.verified === "true"){

      console.log(
        "ALREADY VERIFIED"
      );

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
app.get("/api/drivers", async (req, res) => {
  try {
    const drivers = await User.find({
      role: "driver",
      active: true
    }).sort({ name: 1 });

    res.json(drivers);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading drivers" });
  }
});

/* =========================
   CREATE TRIP (FINAL + SHARED)
========================= */
app.post("/api/trips", async (req, res) => {
  try {

    const type = normalizeTripType(req.body.type);

    /* =========================
       COMPANY LOCK CHECK
    ========================= */

    const companyName = normalizeText(req.body.company);

    if (companyName) {

      const companyUser = await User.findOne({
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
          message: "Company account locked بسبب عدم الدفع"
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

      dropoff:
        normalizeText(p.dropoff),

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

      tripDate: normalizeText(req.body.tripDate),
      tripTime: normalizeText(req.body.tripTime),

      notes: normalizeText(req.body.notes),

      status: normalizeText(req.body.status) || "Booked",

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

  res.status(500).json({
    message: "Error creating trip"
  });

}

});

/* =========================
   GET ALL TRIPS
========================= */
app.get("/api/trips", async (req, res) => {
  try {
    const trips = await Trip.find().sort({ createdAt: -1, _id: -1 });
    res.json(trips);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading trips" });
  }
});

/* =========================
   GET ALL TRIPS FOR HUB
========================= */
app.get("/api/trips/company", async (req, res) => {
  try {
    const trips = await Trip.find().sort({ createdAt: -1, _id: -1 });
    res.json(trips);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading trips" });
  }
});

/* =========================
   GET COMPANY TRIPS ONLY
========================= */
app.get("/api/trips/company/:company", async (req, res) => {
  try {
    const trips = await Trip.find({
      company: req.params.company
    }).sort({ createdAt: -1, _id: -1 });

    res.json(trips);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading trips" });
  }
});

/* =========================
   SUMMARY TRIPS (FINAL REAL)
========================= */
app.get("/api/trips/summary", async (req, res) => {
  try {

    const company = normalizeText(req.query.company || "");

    const filter = {};

    if (company) {

      filter.company = {
        $regex: "^" + company.trim() + "$",
        $options: "i"
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

      // =========================
      // MILES
      // =========================
      let miles = 0;

      if (t.miles && t.miles > 0) {

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

      miles = Math.round(miles);

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
          Number(

            p.cancelFee ||
            t.cancelFee ||
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
            t.noShowFee ||
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
      total
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
        t.cancelFee ||
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
        t.noShowFee ||
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
      finalPrice

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
   GET ONE TRIP
========================= */
app.get("/api/trips/:id", async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    res.json(trip);

  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Error loading trip" });
  }
});


/* =========================
   UPDATE TRIP (FINAL CLEAN)
========================= */
app.put("/api/trips/:id", async (req, res) => {

  console.log("=========== UPDATE TRIP ===========");
  console.log("ID =", req.params.id);
  console.log(JSON.stringify(req.body, null, 2));
  console.log("===================================");

  try {

    const existing = await Trip.findById(req.params.id);

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
        const cancelledTrip = await finalizeIndividualTrip(existing,"CANCEL",{
          cancelFee:Number(req.body.cancelFee ?? existing.cancelFee ?? 0),
          refundAmount:0
        });
        return res.json(cancelledTrip);
      }
    }

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

      // LOCATIONS
      pickup: req.body.pickup ?? existing.pickup,
      dropoff: req.body.dropoff ?? existing.dropoff,

      stops: Array.isArray(req.body.stops)
        ? parseStops(req.body.stops)
        : existing.stops,

      pickupLat: req.body.pickupLat !== undefined
        ? normalizeNumber(req.body.pickupLat)
        : existing.pickupLat,

      pickupLng: req.body.pickupLng !== undefined
        ? normalizeNumber(req.body.pickupLng)
        : existing.pickupLng,

      dropoffLat: req.body.dropoffLat !== undefined
        ? normalizeNumber(req.body.dropoffLat)
        : existing.dropoffLat,

      dropoffLng: req.body.dropoffLng !== undefined
        ? normalizeNumber(req.body.dropoffLng)
        : existing.dropoffLng,

      stopCoords: Array.isArray(req.body.stopCoords)
        ? parseStopCoords(req.body.stopCoords)
        : existing.stopCoords,

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
      miles: req.body.miles ?? existing.miles,
      distanceMeters: req.body.distanceMeters ?? existing.distanceMeters,
      durationSeconds: req.body.durationSeconds ?? existing.durationSeconds,
      estimatedMinutes: req.body.estimatedMinutes ?? existing.estimatedMinutes,

      googleRoute:
  req.body.googleRoute !== undefined
    ? req.body.googleRoute
    : existing.googleRoute,

routePoints:
  req.body.routePoints !== undefined
    ? req.body.routePoints
    : existing.routePoints,

optimizedRoute:
  req.body.optimizedRoute !== undefined
    ? req.body.optimizedRoute
    : existing.optimizedRoute,

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
    if (updateData.googleRoute && Array.isArray(updateData.googleRoute.legs)) {
      const legs = updateData.googleRoute.legs;
      if (legs.length > 0) {
        updateData.pickup = legs[0].startAddress || updateData.pickup;
        updateData.dropoff = legs[legs.length - 1].endAddress || updateData.dropoff;
      }
    }

  /* =========================
   FINALIZER
========================= */

if(updateData.status === "Cancelled"){

  updateData.isFinalized = true;

  updateData.cancelDateTime =
    new Date();

  updateData.finalPrice =
    Number(
      existing.cancelFee ||
      updateData.cancelFee ||
      existing.finalPrice ||
      0
    );

}

else if(updateData.status === "No Show"){

  updateData.isFinalized = true;

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
    const updated = await Trip.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
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
app.delete("/api/trips/:id", async (req, res) => {
  try {
    const deleted = await Trip.findByIdAndDelete(req.params.id);

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
app.get("/api/driver/my-trips/:driverId", async (req, res) => {
  try {
    const driverId = String(req.params.driverId || "").trim();

    if (!driverId) {
      return res.status(400).json({ message: "Driver ID required" });
    }

    const trips = await Trip.find({
      driverId: driverId,
      disabled: false,
      status: { $ne: "Cancelled" }
    }).sort({ tripDate: 1, tripTime: 1 });

    res.json(trips);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Driver trips error" });
  }
});

app.patch("/api/driver/trips/:id/accept", async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    trip.status = "Accepted";
    await trip.save();

    res.json(trip);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Accept trip error" });
  }
});

app.patch("/api/driver/trips/:id/start", async (req, res) => {
  try {
    const trip = await Trip.findById(req.params.id);

    if (!trip) {
      return res.status(404).json({ message: "Trip not found" });
    }

    if(
      trip.stripePaymentMethodId &&
      trip.paymentStatus !== "AUTHORIZED"
    ){
      return res.status(402).json({
        message:"Trip cannot start until the exact fare is authorized.",
        paymentStatus:trip.paymentStatus || "PAYMENT_REQUIRED"
      });
    }

    trip.status = "On Trip";
    await trip.save();

    res.json(trip);
  } catch (err) {
    console.log(err);
    res.status(500).json({ message: "Start trip error" });
  }
});

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

const noShowFee =
  Number(
    trip.noShowFee ||
    trip.finalPrice ||
    trip.priceAmount ||
    0
  );

await finalizeIndividualTrip(
  trip,
  "NOSHOW",
  {
    noShowFee
  }
);

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

    const tripTime =
    new Date(

      tripTimeRaw.toLocaleString(
        "en-US",
        {
          timeZone:systemTimezone
        }
      )

    );

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
        trip.priceAmount || 0
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
          service?.companyWarningMinutes ||
          service?.warningMinutes ||
          120
        )

      : (
          service?.warningMinutes ||
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
          service?.companyCancelFee ||
          service?.cancelFee ||
          0
        )

      : (
          service?.cancelFee ||
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
    refundAmount
  }
);
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

  console.log(
    "🔥 CANCEL ERROR FULL:",
    err
  );

  res.status(500).json({

    message:
      err.message || "Server error",

    error:
      err.toString()

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
                service?.companyWarningMinutes ||
                service?.warningMinutes ||
                120
              )

            : (
                service?.warningMinutes ||
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
                service?.companyCancelFee ||
                service?.cancelFee ||
                trip.cancelFee ||
                0
              )

            : (
                service?.cancelFee ||
                trip.cancelFee ||
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

        const tripTime =
          new Date(
            `${trip.tripDate}T${trip.tripTime}:00`
          );

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

  pickup:
    trip.pickup,

  dropoff:
    trip.dropoff,

  tripDate:
    trip.tripDate,

  tripTime:
    trip.tripTime,

  priceAmount:
    Number(
      trip.priceAmount || 0
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

const totalCancelFee =

  service?.companyDisableCancel === true ||
  service?.disableCancel === true

    ? 0

    : Number(
        service?.companyCancelFee ||
        service?.cancelFee ||
        trip.cancelFee ||
        0
      );

    if(
      trip.isShared === true &&
      Array.isArray(trip.passengers) &&
      trip.passengers.length > 0
    ){

      const activePassengers =
        trip.passengers.filter(p=>{

          const s =
            String(p.status || "")
              .toLowerCase()
              .trim();

          return (
            !s.includes("cancel") &&
            !s.includes("no")
          );

        });

      const count =
        activePassengers.length ||
        trip.passengers.length ||
        1;

     const perPassengerFee =
  Number(totalCancelFee || 0);

      trip.status = "Cancelled";
      trip.cancelFee = totalCancelFee;
      trip.finalPrice = totalCancelFee;
      trip.priceAmount = totalCancelFee;
      trip.refundAmount = 0;
      trip.cancelDateTime = new Date();
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
            isFinalized:true,
            finalizedAt:new Date()
          };

        });

      trip.groupTotal =
        trip.passengers.reduce((sum,p)=>{
          return sum + Number(p.finalPrice || 0);
        },0);

      trip.groupStatus = "Cancelled";

      await trip.save();

      return res.json({
        success:true
      });

    }

    await finalizeIndividualTrip(
      trip,
      "CANCEL",
      {
        cancelFee: totalCancelFee,
        refundAmount: 0
      }
    );

    trip.priceAmount = totalCancelFee;

    await trip.save();

    res.json({
      success:true
    });

  }catch(err){

    console.log(err);

    res.status(500).json({
      message:"Cancel failed"
    });

  }

});

/* =========================
   ROOT
========================= */
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
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
   START SERVER
========================= */
app.listen(PORT, () => {
  console.log("🚀 Server running on port " + PORT);
});