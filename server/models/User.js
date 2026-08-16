const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },

    username: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    password: {
      type: String,
      required: true
    },

    role: {
      type: String,
      enum: [
        "PLATFORM_ADMIN",
        "SUPER_ADMIN",

        // CURRENT ROLES
        "admin",
        "company",
        "dispatcher",
        "driver"
      ],
      required: true
    },

    /*
    =========================================
    TENANT / ORGANIZATION
    =========================================

    PLATFORM_ADMIN:
    tenantId = null

    باقي المستخدمين:
    tenantId = الشركة التابعين لها

    سيظل Optional مؤقتاً حتى لا تتعطل
    الحسابات القديمة الموجودة بالفعل.
    */
    tenantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Tenant",
      default: null,
      index: true
    },

    enabled: {
      type: Boolean,
      default: true
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.models.User ||
  mongoose.model(
    "User",
    userSchema
  );