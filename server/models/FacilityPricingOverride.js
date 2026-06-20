const mongoose = require("mongoose");

/* =====================================================
   FACILITY PRICING OVERRIDE MODEL
   Same pricing fields as Facility section in Service Management
===================================================== */

const servicePricingSchema = new mongoose.Schema(
  {
    serviceKey: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },

    serviceName: {
      type: String,
      default: ""
    },

    serviceSuffix: {
      type: String,
      default: ""
    },

    shared: {
      type: Boolean,
      default: false
    },

    pricingMode: {
      type: String,
      enum: ["MILE", "HOURLY", "SHARED"],
      default: "MILE"
    },

    baseFare: {
      type: Number,
      default: 0
    },

    includedMiles: {
      type: Number,
      default: 0
    },

    perMile: {
      type: Number,
      default: 0
    },

    hourlyRate: {
      type: Number,
      default: 0
    },

    hourlyBillingMode: {
      type: String,
      enum: ["FULL", "QUARTER"],
      default: "FULL"
    },

    stopFee: {
      type: Number,
      default: 0
    },

    noShowFee: {
      type: Number,
      default: 0
    },

    sharedPrice: {
      type: Number,
      default: 0
    },

    disableCancel: {
      type: Boolean,
      default: false
    },

    warningMinutes: {
      type: Number,
      default: 0
    },

    cancelFee: {
      type: Number,
      default: 0
    },

    addStopEnabled: {
      type: Boolean,
      default: false
    },

    addStopCustomTimeEnabled: {
      type: Boolean,
      default: false
    },

    addStopCutoffMinutes: {
      type: Number,
      default: 0
    }
  },
  {
    _id:false
  }
);

const facilityPricingOverrideSchema = new mongoose.Schema(
  {
    facilityId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true
    },

    facilityName: {
      type: String,
      required: true,
      trim: true
    },

    active: {
      type: Boolean,
      default: false
    },

    services: {
      type: [servicePricingSchema],
      default: []
    },

    updatedBy: {
      type: String,
      default: ""
    }
  },
  {
    timestamps:true
  }
);

facilityPricingOverrideSchema.index(
  { facilityId:1 },
  { unique:true }
);

module.exports =
  mongoose.models.FacilityPricingOverride ||
  mongoose.model(
    "FacilityPricingOverride",
    facilityPricingOverrideSchema
  );