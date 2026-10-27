TARGET PATH: server/models/MarketplaceClaimRecord.js

"use strict";

/*
  Durable MTM claim history. Records with CLAIMED, CLAIM_PENDING, CLAIM_UNKNOWN
  or RETURNED status permanently block the same portal trip from being claimed
  a second time. Only FAILED_NOT_CLICKED may be retried automatically.
*/

const mongoose = require("mongoose");

const MarketplaceClaimRecordSchema = new mongoose.Schema(
  {
    tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,index:true},
    integrationId:{type:mongoose.Schema.Types.ObjectId,ref:"BrokerIntegration",required:true,index:true},
    brokerCode:{type:String,default:"",trim:true,uppercase:true},
    externalTripId:{type:String,required:true,trim:true},
    tripFingerprint:{type:String,default:"",trim:true,index:true},
    status:{
      type:String,
      enum:["CLAIM_PENDING","CLAIMED","CLAIM_UNKNOWN","FAILED_NOT_CLICKED","RETURNED"],
      required:true,
      default:"CLAIM_PENDING",
      index:true
    },
    claimCommandId:{type:String,default:"",trim:true,index:true},
    claimEngine:{type:String,enum:["LONG","MEDIUM","SHORT"],default:"LONG"},
    acceptedAt:{type:Date,default:null,index:true},
    returnedAt:{type:Date,default:null},
    lastError:{type:String,default:""},
    tripSnapshot:{type:mongoose.Schema.Types.Mixed,default:{}}
  },
  {timestamps:true,minimize:false}
);

MarketplaceClaimRecordSchema.index(
  {tenantId:1,integrationId:1,externalTripId:1},
  {unique:true,name:"marketplace_trip_claim_once"}
);

module.exports =
  mongoose.models.MarketplaceClaimRecord ||
  mongoose.model("MarketplaceClaimRecord",MarketplaceClaimRecordSchema);
