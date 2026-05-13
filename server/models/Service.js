const mongoose = require("mongoose");

const serviceSchema = new mongoose.Schema({

  serviceKey:{
    type:String,
    unique:true
  },

  title:{
    type:String,
    default:""
  },

  description:{
    type:String,
    default:""
  },

  enabled:{
    type:Boolean,
    default:true
  },

  pricingMode:{
    type:String,
    default:"PER_MILE"
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

  stopFee:{
    type:Number,
    default:0
  },

  noShowFee:{
    type:Number,
    default:15
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