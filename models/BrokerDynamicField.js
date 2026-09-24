"use strict";

/*
DESTINATION PATH:
server/models/BrokerDynamicField.js

PURPOSE:
Persistent auto-discovered Broker / External Trip field registry.
Each tenant + broker + payload path gets its own stable field definition.
*/

const mongoose = require("mongoose");
const { Schema } = mongoose;

const BrokerDynamicFieldSchema = new Schema(
  {
    tenantId:{
      type:Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },
    brokerCode:{
      type:String,
      required:true,
      trim:true,
      uppercase:true,
      index:true
    },
    brokerName:{
      type:String,
      default:"",
      trim:true
    },
    fieldKey:{
      type:String,
      required:true,
      trim:true,
      index:true
    },
    fieldPath:{
      type:String,
      required:true,
      trim:true
    },
    label:{
      type:String,
      required:true,
      trim:true,
      maxlength:120
    },
    fieldType:{
      type:String,
      enum:["TEXT","NUMBER","YES_NO","DATE","TIME","PHONE","EMAIL","LONG_TEXT"],
      default:"TEXT",
      uppercase:true,
      trim:true
    },
    showColumn:{
      type:Boolean,
      default:true
    },
    showEye:{
      type:Boolean,
      default:true
    },
    firstSeenAt:{
      type:Date,
      default:Date.now
    },
    lastSeenAt:{
      type:Date,
      default:Date.now,
      index:true
    },
    sampleValue:{
      type:String,
      default:""
    }
  },
  {
    timestamps:true,
    minimize:false
  }
);

BrokerDynamicFieldSchema.index(
  { tenantId:1, brokerCode:1, fieldPath:1 },
  { unique:true }
);

BrokerDynamicFieldSchema.index(
  { tenantId:1, fieldKey:1 },
  { unique:true }
);

module.exports =
  mongoose.models.BrokerDynamicField ||
  mongoose.model("BrokerDynamicField",BrokerDynamicFieldSchema);
