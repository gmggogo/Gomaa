DESTINATION: server/models/MtmMarketplaceSettings.js

"use strict";

/* DESTINATION: server/models/MtmMarketplaceSettings.js */
const mongoose = require("mongoose");

const EngineSchema = new mongoose.Schema({
  enabled:{type:Boolean,default:false},
  autoAccept:{type:Boolean,default:false},
  milesMin:{type:Number,default:0,min:0},
  milesMax:{type:Number,default:0,min:0},
  dailyTripLimit:{type:Number,default:0,min:0},
  pickupTimeFrom:{type:String,default:"00:00"},
  pickupTimeTo:{type:String,default:"23:59"},
  dropoffTimeFrom:{type:String,default:"00:00"},
  dropoffTimeTo:{type:String,default:"23:59"},
  pickupZipCodes:{type:[String],default:[]},
  dropoffZipCodes:{type:[String],default:[]},
  zoneMatch:{type:String,enum:["ANY","PICKUP","DROPOFF","EITHER","BOTH"],default:"ANY"},
  modes:{type:[String],default:[]}
},{_id:false,minimize:false});

const Schema = new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,unique:true,index:true},
  tenantSlug:{type:String,default:"",trim:true,lowercase:true,index:true},
  integrationId:{type:mongoose.Schema.Types.ObjectId,ref:"BrokerIntegration",default:null,index:true},
  enabled:{type:Boolean,default:false,index:true},
  connectionMethod:{type:String,enum:["MTM_MOCK","MTM_PORTAL","MTM_API"],default:"MTM_PORTAL"},
  dateWindowDays:{type:Number,default:7,min:1,max:31},
  longEngine:{type:EngineSchema,default:()=>({milesMin:100,milesMax:1000})},
  shortEngine:{type:EngineSchema,default:()=>({milesMin:0,milesMax:99.99})},
  totalDailyTripLimit:{type:Number,default:0,min:0},
  lastScanAt:{type:Date,default:null},
  lastSuccessfulScanAt:{type:Date,default:null},
  lastError:{type:String,default:""}
},{timestamps:true,minimize:false});

module.exports = mongoose.models.MtmMarketplaceSettings || mongoose.model("MtmMarketplaceSettings",Schema);