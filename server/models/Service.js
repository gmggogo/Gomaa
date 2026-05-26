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

  /* =========================
     INDIVIDUAL PRICING
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
     INDIVIDUAL WARNING POLICY
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
     COMPANY SETTINGS
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
     COMPANY PRICING
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
     COMPANY WARNING POLICY
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

},{
  timestamps:true
});

module.exports =
mongoose.model(
  "Service",
  serviceSchema
);