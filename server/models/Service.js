const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({

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

  /* =========================
     HOURLY BILLING MODE
  ========================= */

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
  }

},{
  timestamps:true
});

module.exports =
mongoose.model(
  "Service",
  serviceSchema
);