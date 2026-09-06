"use strict";

/*
DESTINATION PATH:
server/models/TripSplitState.js

PURPOSE:
Tracks broker trips that were confirmed from Trip Split directly to Dispatch.
This avoids reusing the old transferredToTripsHub flag for the new flow.
*/

const mongoose = require("mongoose");

const TripSplitStateSchema = new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      required:true,
      index:true
    },

    externalTripObjectId:{
      type:mongoose.Schema.Types.ObjectId,
      required:true,
      index:true
    },

    externalTripId:{
      type:String,
      default:""
    },

    brokerCode:{
      type:String,
      default:"",
      index:true
    },

    brokerName:{
      type:String,
      default:""
    },

    source:{
      type:String,
      default:"BROKER"
    },

    processingMode:{
      type:String,
      enum:["NORMAL","SHARED"],
      required:true
    },

    sharedGroupId:{
      type:String,
      default:"",
      index:true
    },

    dispatchTripId:{
      type:mongoose.Schema.Types.ObjectId,
      default:null,
      index:true
    },

    confirmed:{
      type:Boolean,
      default:false,
      index:true
    },

    confirmedAt:{
      type:Date,
      default:null
    },

    confirmedBy:{
      type:String,
      default:""
    }
  },
  {
    timestamps:true
  }
);

TripSplitStateSchema.index(
  {
    tenantId:1,
    externalTripObjectId:1
  },
  {
    unique:true
  }
);

module.exports =
  mongoose.models.TripSplitState ||
  mongoose.model(
    "TripSplitState",
    TripSplitStateSchema
  );
