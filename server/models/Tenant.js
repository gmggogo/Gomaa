const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
    /*
    =========================================
    COMPANY / TENANT IDENTITY
    =========================================
    */

    name: {
      type: String,
      required: true,
      trim: true
    },

    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },

    /*
    =========================================
    TENANT STATUS
    =========================================
    */

    enabled: {
      type: Boolean,
      default: true
    },

    subscriptionStatus: {
      type: String,
      enum: [
        "ACTIVE",
        "TRIAL",
        "SUSPENDED",
        "CANCELED"
      ],
      default: "ACTIVE"
    },

    /*
    =========================================
    COMPANY BRANDING
    =========================================
    */

    branding: {
      companyName: {
        type: String,
        default: ""
      },

      logo: {
        type: String,
        default: ""
      },

      primaryColor: {
        type: String,
        default: ""
      },

      secondaryColor: {
        type: String,
        default: ""
      }
    },

    /*
    =========================================
    SYSTEM SETTINGS
    =========================================
    */

    timezone: {
      type: String,
      default: "America/Phoenix"
    }
  },
  {
    timestamps: true
  }
);

/*
=========================================
INDEXES
=========================================
*/

tenantSchema.index({
  enabled: 1
});

tenantSchema.index({
  subscriptionStatus: 1
});

module.exports =
  mongoose.models.Tenant ||
  mongoose.model(
    "Tenant",
    tenantSchema
  );