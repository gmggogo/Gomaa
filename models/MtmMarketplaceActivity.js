
"use strict";

/* DESTINATION: server/models/MtmMarketplaceActivity.js */
const mongoose = require("mongoose");

const Schema = new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,index:true},
  integrationId:{type:mongoose.Schema.Types.ObjectId,ref:"BrokerIntegration",default:null,index:true},
  engine:{type:String,enum:["LONG","SHORT","SYSTEM"],default:"SYSTEM",index:true},
  action:{type:String,enum:["SCAN","SEEN","MATCHED","SKIPPED","CLAIM_ATTEMPT","CLAIMED","CLAIM_FAILED","IMPORTED","SESSION","ERROR"],required:true,index:true},
  externalTripId:{type:String,default:"",trim:true,index:true},
  assignmentNumber:{type:String,default:"",trim:true,index:true},
  message:{type:String,default:""},
  reason:{type:String,default:""},
  miles:{type:Number,default:null},
  tripDate:{type:String,default:""},
  pickupTime:{type:String,default:""},
  mode:{type:String,default:""},
  meta:{type:mongoose.Schema.Types.Mixed,default:{}},
  occurredAt:{type:Date,default:Date.now,index:true}
},{timestamps:true,minimize:false});

Schema.index({tenantId:1,occurredAt:-1});
Schema.index({tenantId:1,externalTripId:1,action:1});

module.exports = mongoose.models.MtmMarketplaceActivity || mongoose.model("MtmMarketplaceActivity",Schema);