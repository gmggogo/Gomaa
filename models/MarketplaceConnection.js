"use strict";

/*
DESTINATION PATH:
server/models/MarketplaceConnection.js

PURPOSE:
Paid Marketplace portal connection records.
A BrokerIntegration can have multiple independent Marketplace accounts.
No portal password, MFA code, cookie, or browser session secret is stored here.
*/

const mongoose = require("mongoose");
const crypto = require("crypto");

const MarketplaceConnectionSchema = new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,index:true},
  tenantSlug:{type:String,default:"",trim:true,lowercase:true,index:true},
  brokerIntegrationId:{type:mongoose.Schema.Types.ObjectId,ref:"BrokerIntegration",required:true,index:true},
  connectionId:{type:String,default:()=>crypto.randomUUID(),required:true,unique:true,index:true},
  accountLabel:{type:String,required:true,trim:true,default:"Primary Account"},
  brokerName:{type:String,required:true,trim:true},
  brokerCode:{type:String,required:true,trim:true,uppercase:true,index:true},
  portalUrl:{type:String,required:true,trim:true},
  enabled:{type:Boolean,default:true,index:true},
  featureVisible:{type:Boolean,default:true,index:true},
  billingEnabled:{type:Boolean,default:true,index:true},
  monthlyFlatFee:{type:Number,default:0,min:0},
  connectionStatus:{
    type:String,
    enum:["NOT_PAIRED","PAIRING","WAITING_LOGIN","CONNECTED","DISCONNECTED","ERROR","DISABLED"],
    default:"NOT_PAIRED",
    index:true
  },
  sourceHost:{type:String,default:"",trim:true,lowercase:true},
  lastConnectedAt:{type:Date,default:null},
  lastReceivedAt:{type:Date,default:null},
  lastDisconnectedAt:{type:Date,default:null},
  lastErrorAt:{type:Date,default:null},
  lastErrorMessage:{type:String,default:""},
  createdBy:{type:String,default:""},
  updatedBy:{type:String,default:""}
},{timestamps:true,minimize:false});

MarketplaceConnectionSchema.index(
  {tenantId:1,brokerIntegrationId:1,accountLabel:1},
  {name:"marketplace_connection_account_lookup"}
);

module.exports = mongoose.models.MarketplaceConnection || mongoose.model("MarketplaceConnection",MarketplaceConnectionSchema);
