const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    /* =========================
       BASIC
    ========================= */

    name: {
      type: String,
      required: true,
      trim: true
    },

    username: {
      type: String,
      unique: true,
      required: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    /* =========================
       ROLE
    ========================= */

    role: {
      type: String,
      enum: [
        "PLATFORM_ADMIN",
        "SUPER_ADMIN",

        // CURRENT SYSTEM ROLES
        "admin",
        "dispatcher",
        "driver",
        "company"
      ],
      required: true
    },

    /* =========================
       TENANT
    ========================= */

    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true
    },

    /*
      Keep both fields for compatibility.

      Current code uses:
      active
      AND
      enabled

      Later we can clean this up.
    */

    active: {
      type: Boolean,
      default: true
    },

    enabled: {
      type: Boolean,
      default: true
    },

    /* =========================
       DRIVER / DISPATCH DATA
    ========================= */

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

    email: {
      type: String,
      default: ""
    },

    /* =========================
       BILLING SYSTEM
    ========================= */

    billingStatus: {
      type: String,
      enum: [
        "ACTIVE",
        "PAST_DUE",
        "SUSPENDED"
      ],
      default: "ACTIVE"
    },

    billingCycle: {
      type: String,
      enum: [
        "MONTHLY",
        "WEEKLY"
      ],
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

    /* =========================
       BILLING STATISTICS
    ========================= */

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
  },
  {
    timestamps: true
  }
);

/* =========================
   INDEXES
========================= */

userSchema.index({
  tenantId: 1,
  role: 1
});

userSchema.index({
  tenantId: 1,
  enabled: 1
});

/* =========================
   MODEL
========================= */

const User =
  mongoose.models.User ||
  mongoose.model(
    "User",
    userSchema
  );

module.exports = User;