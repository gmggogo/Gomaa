// GH Mobility - Trip model
// Extracted from the legacy server index without changing schema or indexes.
const mongoose = require("mongoose");

const tripSchema = new mongoose.Schema({

  tripNumber: { type: String },

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

  /* =========================
     BROKER IDENTITY
     Broker trips stay isolated from Trips Hub / Trips.
     They enter Dispatch only after Broker Review confirmation.
  ========================= */
  brokerId: { type: String, default: "", index: true },
  brokerName: { type: String, default: "", index: true },
  brokerCode: { type: String, default: "", index: true },
  brokerTripId: { type: String, default: "", index: true },
  externalSource: { type: String, default: "" },

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

serviceKey: {
  type: String,
  default: "",
  trim: true,
  uppercase: true
},

serviceCode: {
  type: String,
  default: "",
  trim: true,
  uppercase: true
},

/* =========================
   SERVICE IDENTITY SNAPSHOT

   serviceIdentity:
   - Core services: ST / WH / SH / LM / TX / XL
   - Custom services: immutable Platform gate CUSTOM_1..CUSTOM_4

   serviceKey / serviceCode / serviceSuffix / tripNumberSuffix:
   operational two-letter code used by pricing and trip numbers.

   serviceName / serviceTitle:
   historical display-name snapshot. Renaming a custom service later
   must not rewrite old trips.
========================= */

serviceIdentity: {
  type: String,
  default: "",
  trim: true,
  uppercase: true
},

customServiceSlot: {
  type: Number,
  default: 0,
  min: 0,
  max: 4
},

serviceName: {
  type: String,
  default: "",
  trim: true
},

serviceTitle: {
  type: String,
  default: "",
  trim: true
},

serviceSuffix: {
  type: String,
  default: "",
  trim: true,
  uppercase: true
},

tripNumberSuffix: {
  type: String,
  default: "",
  trim: true,
  uppercase: true
},

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

  /* Company Shared source / entry metadata */
  sharedSource: { type: String, default: "" },
  sharedEntryMode: { type: String, default: "" },

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

      tripDate: { type: String, default: "" },
      tripTime: { type: String, default: "" },
      pickupTime: { type: String, default: "" },
      appointmentTime: { type: String, default: "" },
      returnTime: { type: String, default: "" },

      tripLeg: { type: String, default: "OUTBOUND" },
      generatedReturn: { type: Boolean, default: false },
      pairId: { type: String, default: "" },
      pairedCandidateId: { type: String, default: "" },

      notes: { type: String, default: "" },

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
tripSchema.index({ tenantId: 1, tripDate: -1, tripTime: -1 });
/* Final Confirmation: normal trip final-status lookup + newest-first ordering. */
tripSchema.index({ tenantId: 1, status: 1, tripDate: -1, tripTime: -1 });
/* Final Confirmation: shared passenger final-status lookup + newest-first ordering. */
tripSchema.index({ tenantId: 1, "passengers.status": 1, tripDate: -1, tripTime: -1 });
tripSchema.index({ company: 1 });
tripSchema.index({ createdAt: -1 });
/* Background trip maintenance reads by calendar date across tenants. */
tripSchema.index({ tripDate: 1 });
tripSchema.index({ reminderSent: 1, tripDate: 1 });
tripSchema.index({ dispatchSelected: 1, disabled: 1, tripDate: 1, tripTime: 1 });
tripSchema.index({ driverId: 1, status: 1, tripDate: 1, tripTime: 1 });

const Trip =
  mongoose.models.Trip ||
  mongoose.model("Trip", tripSchema);


module.exports = Trip;
