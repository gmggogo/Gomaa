const mongoose = require("mongoose");

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

    stopFee: {
      type: Number,
      default: 0
    },

    noShowFee: {
      type: Number,
      default: 0
    },

    cancelFee: {
      type: Number,
      default: 0
    },

    hourlyRate: {
      type: Number,
      default: 0
    },

    hourlyBillingMode: {
      type: String,
      default: "FULL"
    },

    sharedPrice: {
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