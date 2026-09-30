const mongoose = require("mongoose");

const tenantSchema = new mongoose.Schema(
  {
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

    allowedServices: {
      type: [String],
      default: [],
      set(values) {
        if(!Array.isArray(values)){
          return [];
        }

        return [
          ...new Set(
            values
              .map(value =>
                String(value || "")
                  .trim()
                  .toUpperCase()
              )
              .filter(Boolean)
          )
        ];
      }
    },

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

    timezone: {
      type: String,
      default: "America/Phoenix"
    }
  },
  {
    timestamps: true
  }
);

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