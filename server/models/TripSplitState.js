"use strict";

/*
DESTINATION PATH:
server/models/TripSplitState.js

PURPOSE:
Tracks broker trips moved from Trip Split into Broker Review and then Dispatch.

FLOW:
Trip Split Confirm
  -> reviewConfirmed = false
  -> dispatch Trip is created but hidden from Dispatch

Broker Review Confirm Selected
  -> reviewConfirmed = true
  -> dispatchSelected = true
  -> disabled = false

The record remains available for Today / Tomorrow Broker Review tracking.
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

    /*
      "confirmed" means the trip has left Trip Split and entered Broker Review.
      It does NOT mean it has been released to Dispatch.
    */
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
    },

    /*
      Broker Review confirmation is the final release to Dispatch.
    */
    reviewConfirmed:{
      type:Boolean,
      default:false,
      index:true
    },

    reviewConfirmedAt:{
      type:Date,
      default:null
    },

    reviewConfirmedBy:{
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

TripSplitStateSchema.index(
  {
    tenantId:1,
    reviewConfirmed:1,
    dispatchTripId:1
  }
);

module.exports =
  mongoose.models.TripSplitState ||
  mongoose.model(
    "TripSplitState",
    TripSplitStateSchema
  );
