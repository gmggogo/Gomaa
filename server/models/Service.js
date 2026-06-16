const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({

  /* =========================
     BASIC INFO
  ========================= */

  serviceKey:{
    type:String,
    required:true,
    unique:true
  },

  title:{
    type:String,
    required:true
  },

  icon:{
    type:String,
    default:"🚘"
  },

  enabled:{
    type:Boolean,
    default:true
  },

  showPricingCard:{
    type:Boolean,
    default:true
  },

  /* =========================
     INDIVIDUAL / GET QUOTE PRICING
  ========================= */

  pricingMode:{
    type:String,
    default:"MILE"
  },

  baseFare:{
    type:Number,
    default:0
  },

  includedMiles:{
    type:Number,
    default:0
  },

  perMile:{
    type:Number,
    default:0
  },

  hourlyRate:{
    type:Number,
    default:0
  },

  hourlyBillingMode:{
    type:String,
    default:"FULL"
  },

  stopFee:{
    type:Number,
    default:0
  },

  noShowFee:{
    type:Number,
    default:0
  },

  sharedPrice:{
    type:Number,
    default:0
  },

  /* =========================
     INDIVIDUAL / GET QUOTE WARNING POLICY
  ========================= */

  warningEnabled:{
    type:Boolean,
    default:true
  },

  warningMinutes:{
    type:Number,
    default:120
  },

  cancelFee:{
    type:Number,
    default:15
  },

  disableCancel:{
    type:Boolean,
    default:false
  },

  /* =========================
     ADD STOP - GET QUOTE
     Used by customer email link
  ========================= */

  getQuoteAddStopEnabled:{
    type:Boolean,
    default:false
  },

  getQuoteAddStopCustomTimeEnabled:{
    type:Boolean,
    default:false
  },

  getQuoteAddStopCutoffMinutes:{
    type:Number,
    default:0
  },

  /* =========================
     FACILITY SETTINGS
  ========================= */

  companyEnabled:{
    type:Boolean,
    default:true
  },

  companyShared:{
    type:Boolean,
    default:false
  },

  companySuffix:{
    type:String,
    default:"ST"
  },

  /* =========================
     FACILITY PRICING
  ========================= */

  companyPricingMode:{
    type:String,
    default:"MILE"
  },

  companyBaseFare:{
    type:Number,
    default:0
  },

  companyIncludedMiles:{
    type:Number,
    default:0
  },

  companyPerMile:{
    type:Number,
    default:0
  },

  companyHourlyRate:{
    type:Number,
    default:0
  },

  companyHourlyBillingMode:{
    type:String,
    default:"FULL"
  },

  companyStopFee:{
    type:Number,
    default:0
  },

  companyNoShowFee:{
    type:Number,
    default:0
  },

  companySharedPrice:{
    type:Number,
    default:0
  },

  /* =========================
     FACILITY WARNING POLICY
  ========================= */

  companyWarningEnabled:{
    type:Boolean,
    default:true
  },

  companyWarningMinutes:{
    type:Number,
    default:120
  },

  companyCancelFee:{
    type:Number,
    default:15
  },

  companyDisableCancel:{
    type:Boolean,
    default:false
  },

  /* =========================
     ADD STOP - FACILITY
     Used by Company Review
  ========================= */

  companyAddStopEnabled:{
    type:Boolean,
    default:false
  },

  companyAddStopCustomTimeEnabled:{
    type:Boolean,
    default:false
  },

  companyAddStopCutoffMinutes:{
    type:Number,
    default:0
  },

  /* =========================
     RESERVED SETTINGS
  ========================= */

  reservedEnabled:{
    type:Boolean,
    default:false
  },

  reservedShared:{
    type:Boolean,
    default:false
  },

  reservedSuffix:{
    type:String,
    default:"RV"
  },

  /* =========================
     RESERVED PRICING
  ========================= */

  reservedPricingMode:{
    type:String,
    default:"MILE"
  },

  reservedBaseFare:{
    type:Number,
    default:0
  },

  reservedIncludedMiles:{
    type:Number,
    default:0
  },

  reservedPerMile:{
    type:Number,
    default:0
  },

  reservedHourlyRate:{
    type:Number,
    default:0
  },

  reservedHourlyBillingMode:{
    type:String,
    default:"FULL"
  },

  reservedStopFee:{
    type:Number,
    default:0
  },

  reservedNoShowFee:{
    type:Number,
    default:0
  },

  reservedSharedPrice:{
    type:Number,
    default:0
  },

  /* =========================
     RESERVED WARNING POLICY
  ========================= */

  reservedWarningEnabled:{
    type:Boolean,
    default:true
  },

  reservedWarningMinutes:{
    type:Number,
    default:120
  },

  reservedCancelFee:{
    type:Number,
    default:15
  },

  reservedDisableCancel:{
    type:Boolean,
    default:false
  },

  /* =========================
     ADD STOP - RESERVED
     Used by Admin Add Trip / RV
  ========================= */

  reservedAddStopEnabled:{
    type:Boolean,
    default:false
  },

  reservedAddStopCustomTimeEnabled:{
    type:Boolean,
    default:false
  },

  reservedAddStopCutoffMinutes:{
    type:Number,
    default:0
  }

},{
  timestamps:true
});

module.exports =
mongoose.model(
  "Service",
  serviceSchema
);