"use strict";

/*
DESTINATION PATH:
server/models/AutopilotSettings.js

PURPOSE:
Per-tenant GH Mobility Autopilot settings.

IMPORTANT:
- This file stores control switches only.
- It does not execute Dispatch, Broker Trip Split, Shared Engine,
  Final Confirmation, or Driver Schedule logic.
- Existing manual operations remain available when Autopilot is active.
*/

const mongoose = require("mongoose");

const AutopilotSettingsSchema = new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      unique:true,
      index:true
    },

    companyAutopilot:{
      type:Boolean,
      default:false
    },

    brokerAutopilot:{
      type:Boolean,
      default:false
    },

    brokerSharedAutopilot:{
      type:Boolean,
      default:false
    },

    updatedBy:{
      type:String,
      default:"",
      trim:true
    }
  },
  {
    timestamps:true,
    minimize:false
  }
);

module.exports =
  mongoose.models.AutopilotSettings ||
  mongoose.model(
    "AutopilotSettings",
    AutopilotSettingsSchema
  );
