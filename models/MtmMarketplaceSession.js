"use strict";

/* DESTINATION: server/models/MtmMarketplaceSession.js */
const mongoose = require("mongoose");

const Schema = new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,unique:true,index:true},
  integrationId:{type:mongoose.Schema.Types.ObjectId,ref:"BrokerIntegration",default:null,index:true},
  status:{type:String,enum:["DISCONNECTED","CONNECTING","CONNECTED","VERIFICATION_REQUIRED","EXPIRED","ERROR"],default:"DISCONNECTED",index:true},
  /* Encrypted browser storage/session state only. Never store OTP here. */
  encryptedSessionState:{type:String,default:"",select:false},
  sessionVersion:{type:Number,default:1},
  connectedAt:{type:Date,default:null},
  lastVerifiedAt:{type:Date,default:null},
  lastSeenAt:{type:Date,default:null},
  expiresAt:{type:Date,default:null},
  verificationRequiredAt:{type:Date,default:null},
  lastError:{type:String,default:""}
},{timestamps:true,minimize:false});

module.exports = mongoose.models.MtmMarketplaceSession || mongoose.model("MtmMarketplaceSession",Schema);
