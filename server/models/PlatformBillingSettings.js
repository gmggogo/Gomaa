"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    key:{
      type:String,
      default:"DEFAULT_PACKAGE",
      unique:true,
      index:true
    },
    packageName:{
      type:String,
      default:"GH Mobility Starter",
      trim:true
    },
    basePrice:{
      type:Number,
      default:125,
      min:0
    },
    includedVehicles:{
      type:Number,
      default:5,
      min:0
    },
    includedServices:{
      type:Number,
      default:1,
      min:0
    },
    includedBrokers:{
      type:Number,
      default:1,
      min:0
    },

    /*
      HARD CREATION LIMITS
      Platform Admin can change these defaults for new tenants.
    */

    maxDrivers:{
      type:Number,
      default:5,
      min:0
    },

    maxVehicles:{
      type:Number,
      default:5,
      min:0
    },

    maxAdmins:{
      type:Number,
      default:2,
      min:0
    },

    maxSuperAdmins:{
      type:Number,
      default:2,
      min:0
    },

    maxDispatchers:{
      type:Number,
      default:2,
      min:0
    },

    maxCompanies:{
      type:Number,
      default:2,
      min:0
    },

    maxServices:{
      type:Number,
      default:1,
      min:0
    },

    maxBrokers:{
      type:Number,
      default:1,
      min:0
    },
    billingCycle:{
      type:String,
      enum:["MONTHLY","ANNUAL"],
      default:"MONTHLY"
    },
    extraVehiclePrice:{
      type:Number,
      default:25,
      min:0
    },
    extraServicePrice:{
      type:Number,
      default:15,
      min:0
    },
    extraBrokerPrice:{
      type:Number,
      default:0,
      min:0
    },
    freeExtraBrokers:{
      type:Number,
      default:0,
      min:0
    },
    packageStatus:{
      type:String,
      enum:["ACTIVE","DISABLED"],
      default:"ACTIVE"
    },
    updatedBy:{
      type:String,
      default:""
    }
  },
  {timestamps:true}
);

module.exports =
  mongoose.models.PlatformBillingSettings ||
  mongoose.model("PlatformBillingSettings",schema);