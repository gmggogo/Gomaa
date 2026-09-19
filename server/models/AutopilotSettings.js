"use strict";

/*
DESTINATION PATH:
server/models/AutopilotSettings.js

PURPOSE:
Per-tenant GH Mobility Autopilot settings.

ARCHITECTURE:
- Operation = normal company operation engine.
- Broker Operation = broker operation engine.
- Share Service = broker shared grouping feature only; not a separate engine.
- Final Confirmation has an independent switch under each operation engine.
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

    operationEnabled:{
      type:Boolean,
      default:false
    },

    operationFinalConfirmation:{
      type:Boolean,
      default:false
    },

    brokerOperationEnabled:{
      type:Boolean,
      default:false
    },

    brokerFinalConfirmation:{
      type:Boolean,
      default:false
    },

    shareServiceEnabled:{
      type:Boolean,
      default:false
    },

    /*
      Legacy compatibility fields.
      Keep them temporarily so existing saved tenant settings and any older
      process during a rolling deploy do not break. New code uses the fields above.
    */
    companyAutopilot:{type:Boolean,default:false},
    brokerAutopilot:{type:Boolean,default:false},
    brokerSharedAutopilot:{type:Boolean,default:false},

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
