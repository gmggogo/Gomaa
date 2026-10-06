"use strict";

/*
DESTINATION PATH:
server/models/MarketplaceSession.js

Marketplace session model.

IMPORTANT:
The JavaScript model/file name is now generic MarketplaceSession,
but the MongoDB collection stays the existing legacy collection
"mtmmarketplacesessions" so any existing session records are preserved.

The current generic Provider Portal Bridge keeps connection-specific live
browser state by BrokerIntegration connectionId. This model is retained
for backward compatibility with older Marketplace session code.
*/

const mongoose = require("mongoose");

const MarketplaceSessionSchema =
  new mongoose.Schema(
    {
      tenantId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Tenant",
        required:true,
        unique:true,
        index:true
      },

      integrationId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"BrokerIntegration",
        default:null,
        index:true
      },

      status:{
        type:String,
        enum:[
          "DISCONNECTED",
          "CONNECTING",
          "CONNECTED",
          "VERIFICATION_REQUIRED",
          "EXPIRED",
          "ERROR"
        ],
        default:"DISCONNECTED",
        index:true
      },

      /*
        Encrypted browser storage/session state only.
        Never store OTP/MFA values here.
      */
      encryptedSessionState:{
        type:String,
        default:"",
        select:false
      },

      sessionVersion:{
        type:Number,
        default:1
      },

      connectedAt:{
        type:Date,
        default:null
      },

      lastVerifiedAt:{
        type:Date,
        default:null
      },

      lastSeenAt:{
        type:Date,
        default:null
      },

      expiresAt:{
        type:Date,
        default:null
      },

      verificationRequiredAt:{
        type:Date,
        default:null
      },

      lastError:{
        type:String,
        default:""
      }
    },
    {
      timestamps:true,
      minimize:false
    }
  );

module.exports =
  mongoose.models.MarketplaceSession ||
  mongoose.model(
    "MarketplaceSession",
    MarketplaceSessionSchema,
    "mtmmarketplacesessions"
  );
