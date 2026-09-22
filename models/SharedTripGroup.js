"use strict";

/*
DESTINATION PATH:
server/models/SharedTripGroup.js

PURPOSE:
Persistent Shared Engine group storage for Broker, Company and Reserved trips.

IMPORTANT:
- This model is source-neutral and will be reused by all Shared workflows.
- OPEN groups survive refresh, logout/login and another staff device.
- RESTORED groups remain available for history but are not shown as active.
- CONFIRMED groups remain linked to the downstream trip/review workflow.
*/

const mongoose = require("mongoose");

const SharedTripGroupSchema = new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },

    sourceType:{
      type:String,
      enum:["BROKER","COMPANY","RESERVED"],
      required:true,
      index:true
    },

    groupId:{
      type:String,
      required:true,
      trim:true
    },

    tripDate:{
      type:String,
      default:"",
      index:true
    },

    brokerCode:{
      type:String,
      default:""
    },

    brokerName:{
      type:String,
      default:""
    },

    tripIds:[{
      type:mongoose.Schema.Types.ObjectId
    }],

    tripNumbers:[{
      type:String,
      default:""
    }],

    routePlan:{
      type:[mongoose.Schema.Types.Mixed],
      default:[]
    },

    routePoints:{
      type:[mongoose.Schema.Types.Mixed],
      default:[]
    },

    schedule:{
      type:mongoose.Schema.Types.Mixed,
      default:{}
    },

    calculatedFirstPickupTime:{
      type:String,
      default:""
    },

    routeMiles:{
      type:Number,
      default:0
    },

    routeMinutes:{
      type:Number,
      default:0
    },

    polyline:{
      type:String,
      default:""
    },

    engineData:{
      type:mongoose.Schema.Types.Mixed,
      default:{}
    },

    status:{
      type:String,
      enum:["OPEN","RESTORED","CONFIRMED"],
      default:"OPEN",
      index:true
    },

    createdBy:{
      type:String,
      default:""
    },

    restoredAt:{
      type:Date,
      default:null
    },

    restoredBy:{
      type:String,
      default:""
    },

    confirmedAt:{
      type:Date,
      default:null
    },

    confirmedBy:{
      type:String,
      default:""
    },

    dispatchTripId:{
      type:mongoose.Schema.Types.ObjectId,
      default:null
    }
  },
  {
    timestamps:true
  }
);

SharedTripGroupSchema.index(
  {tenantId:1,sourceType:1,groupId:1},
  {unique:true}
);

SharedTripGroupSchema.index(
  {tenantId:1,sourceType:1,status:1,tripDate:1}
);

SharedTripGroupSchema.index(
  {tenantId:1,sourceType:1,status:1,tripIds:1}
);

module.exports =
  mongoose.models.SharedTripGroup ||
  mongoose.model(
    "SharedTripGroup",
    SharedTripGroupSchema
  );
