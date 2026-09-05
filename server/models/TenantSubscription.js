"use strict";

const mongoose = require("mongoose");

const controlSchema = new mongoose.Schema(
  {
    key:{
      type:String,
      required:true,
      trim:true
    },
    label:{
      type:String,
      default:"",
      trim:true
    },
    accessEnabled:{
      type:Boolean,
      default:true
    },
    billingEnabled:{
      type:Boolean,
      default:true
    }
  },
  {_id:false}
);

const schema = new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      unique:true,
      index:true
    },

    planName:{
      type:String,
      default:"GH Mobility"
    },

    billingCycle:{
      type:String,
      enum:["MONTHLY","ANNUAL"],
      default:"ANNUAL"
    },

    amount:{
      type:Number,
      default:0,
      min:0
    },

    currency:{
      type:String,
      default:"usd"
    },

    status:{
      type:String,
      enum:["ACTIVE","TRIAL","PAST_DUE","SUSPENDED"],
      default:"ACTIVE"
    },

    graceDays:{
      type:Number,
      default:3,
      min:0,
      max:60
    },

    dueDate:{
      type:Date,
      default:null
    },

    nextBillingDate:{
      type:Date,
      default:null
    },

    lastPaymentDate:{
      type:Date,
      default:null
    },

    stripeCustomerId:{
      type:String,
      default:""
    },

    pricingInitialized:{
      type:Boolean,
      default:false
    },

    basePackageEnabled:{
      type:Boolean,
      default:true
    },

    basePrice:{
      type:Number,
      default:0,
      min:0
    },

    includedVehicles:{
      type:Number,
      default:0,
      min:0
    },

    includedServices:{
      type:Number,
      default:0,
      min:0
    },

    /*
      HARD PACKAGE LIMITS
      These limits control what tenant users are allowed to create.
      Existing pricing fields stay independent so billing logic is unchanged.
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
      default:3,
      min:0
    },

    maxServices:{
      type:Number,
      default:2,
      min:0
    },

    limitsInitialized:{
      type:Boolean,
      default:false
    },

    extraVehiclePrice:{
      type:Number,
      default:0,
      min:0
    },

    extraServicePrice:{
      type:Number,
      default:0,
      min:0
    },

    freeExtraVehicles:{
      type:Number,
      default:0,
      min:0
    },

    freeExtraServices:{
      type:Number,
      default:0,
      min:0
    },

    discount:{
      type:Number,
      default:0,
      min:0
    },

    credit:{
      type:Number,
      default:0,
      min:0
    },

    finalPriceOverride:{
      type:Number,
      default:null,
      min:0
    },

    vehicleControls:{
      type:[controlSchema],
      default:[]
    },

    serviceControls:{
      type:[controlSchema],
      default:[]
    },

    calculatedBaseAmount:{
      type:Number,
      default:0
    },

    calculatedVehicleAmount:{
      type:Number,
      default:0
    },

    calculatedServiceAmount:{
      type:Number,
      default:0
    },

    calculatedSubtotal:{
      type:Number,
      default:0
    },

    calculatedFinalAmount:{
      type:Number,
      default:0
    },

    pricingUpdatedAt:{
      type:Date,
      default:null
    }
  },
  {timestamps:true}
);

module.exports =
  mongoose.models.TenantSubscription ||
  mongoose.model("TenantSubscription",schema);
