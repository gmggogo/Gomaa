"use strict";

/*
DESTINATION PATH:
server/models/SmartFormPricing.js
*/

const mongoose = require("mongoose");

const SmartFormServicePricingSchema = new mongoose.Schema({
  serviceKey:{type:String,required:true,trim:true,uppercase:true},
  serviceName:{type:String,default:"",trim:true},
  serviceSuffix:{type:String,default:"",trim:true,uppercase:true},
  enabled:{type:Boolean,default:false},
  customerSignatureRequired:{type:Boolean,default:false},
  odometerRequired:{type:Boolean,default:false},
  shared:{type:Boolean,default:false},
  pricingMode:{type:String,enum:["MILE","HOURLY","SHARED"],default:"MILE"},
  baseFare:{type:Number,default:0,min:0},
  includedMiles:{type:Number,default:0,min:0},
  perMile:{type:Number,default:0,min:0},
  hourlyRate:{type:Number,default:0,min:0},
  hourlyBillingMode:{type:String,enum:["FULL","QUARTER"],default:"FULL"},
  initialDurationMinutes:{type:Number,default:0,min:0},
  initialPrice:{type:Number,default:0,min:0},
  stopFee:{type:Number,default:0,min:0},
  noShowFee:{type:Number,default:0,min:0},
  sharedPrice:{type:Number,default:0,min:0},
  sharedStopChargeEnabled:{type:Boolean,default:false},
  cancelEnabled:{type:Boolean,default:true},
  warningMinutes:{type:Number,default:0,min:0},
  cancelFee:{type:Number,default:0,min:0},
  addStopEnabled:{type:Boolean,default:false},
  addStopCustomTimeEnabled:{type:Boolean,default:false},
  addStopCutoffMinutes:{type:Number,default:0,min:0}
},{_id:false});

const SmartFormPricingSchema = new mongoose.Schema({
  tenantId:{
    type:mongoose.Schema.Types.ObjectId,
    required:true,
    index:true
  },
  templateId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"SmartFormTemplate",
    required:true,
    index:true
  },
  templateCode:{
    type:String,
    required:true,
    trim:true,
    uppercase:true,
    index:true
  },
  templateName:{
    type:String,
    required:true,
    trim:true
  },
  active:{type:Boolean,default:false},
  sharedStopChargeEnabled:{type:Boolean,default:false},
  services:{
    type:[SmartFormServicePricingSchema],
    default:[]
  },
  updatedBy:{type:String,default:"",trim:true}
},{
  timestamps:true,
  minimize:false
});

SmartFormPricingSchema.index(
  {tenantId:1,templateId:1},
  {unique:true}
);

SmartFormPricingSchema.index(
  {tenantId:1,templateCode:1}
);

module.exports =
  mongoose.models.SmartFormPricing ||
  mongoose.model(
    "SmartFormPricing",
    SmartFormPricingSchema
  );
