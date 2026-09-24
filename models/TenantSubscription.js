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

const servicePricingSchema = new mongoose.Schema(
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
    included:{
      type:Boolean,
      default:false
    },
    monthlyPrice:{
      type:Number,
      default:0,
      min:0
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
      default:"MONTHLY"
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

    limitsInitialized:{
      type:Boolean,
      default:false
    },

    accountAddonPricingInitialized:{
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

    includedBrokers:{
      type:Number,
      default:0,
      min:0
    },

    /* Snapshot of package account allowances.
       These stay fixed when Platform Admin raises hard limits. */
    includedDriverVehicleUnits:{
      type:Number,
      default:0,
      min:0
    },
    includedDispatchers:{
      type:Number,
      default:0,
      min:0
    },
    includedAdmins:{
      type:Number,
      default:0,
      min:0
    },
    includedSuperAdmins:{
      type:Number,
      default:0,
      min:0
    },
    includedCompanies:{
      type:Number,
      default:0,
      min:0
    },

    maxDrivers:{
      type:Number,
      default:0,
      min:0
    },

    maxVehicles:{
      type:Number,
      default:0,
      min:0
    },

    maxAdmins:{
      type:Number,
      default:0,
      min:0
    },

    maxSuperAdmins:{
      type:Number,
      default:0,
      min:0
    },

    maxDispatchers:{
      type:Number,
      default:0,
      min:0
    },

    maxCompanies:{
      type:Number,
      default:0,
      min:0
    },

    maxServices:{
      type:Number,
      default:0,
      min:0
    },

    maxBrokers:{
      type:Number,
      default:0,
      min:0
    },

    /* extraVehiclePrice is intentionally retained for backward compatibility.
       It now means Extra Driver / Vehicle Unit Price. */
    extraVehiclePrice:{
      type:Number,
      default:0,
      min:0
    },

    extraDispatcherPrice:{
      type:Number,
      default:0,
      min:0
    },

    extraAdminPrice:{
      type:Number,
      default:0,
      min:0
    },

    extraSuperAdminPrice:{
      type:Number,
      default:0,
      min:0
    },

    extraCompanyPrice:{
      type:Number,
      default:0,
      min:0
    },

    extraServicePrice:{
      type:Number,
      default:0,
      min:0
    },

    extraBrokerPrice:{
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

    freeExtraBrokers:{
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

    servicePricing:{
      type:[servicePricingSchema],
      default:[]
    },

    calculatedBaseAmount:{
      type:Number,
      default:0
    },

    /* Combined Driver / Vehicle unit amount; old field name retained. */
    calculatedVehicleAmount:{
      type:Number,
      default:0
    },

    calculatedDispatcherAmount:{
      type:Number,
      default:0
    },

    calculatedAdminAmount:{
      type:Number,
      default:0
    },

    calculatedSuperAdminAmount:{
      type:Number,
      default:0
    },

    calculatedCompanyAmount:{
      type:Number,
      default:0
    },

    calculatedServiceAmount:{
      type:Number,
      default:0
    },

    calculatedBrokerAmount:{
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