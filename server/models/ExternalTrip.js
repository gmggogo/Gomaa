"use strict";

/*
DESTINATION PATH:
server/models/ExternalTrip.js

REPLACE THE PREVIOUS VERSION WITH THIS FILE.

IMPORTANT:
ghExternalTripNumber is unique across the platform because the existing
main Trip model uses a globally unique tripNumber.
*/

const mongoose = require("mongoose");

const ExternalStopSchema = new mongoose.Schema(
  {
    name:{ type:String, default:"" },
    address:{ type:String, default:"" },
    phone:{ type:String, default:"" },
    notes:{ type:String, default:"" },
    scheduledTime:{ type:String, default:"" },
    sequence:{ type:Number, default:0 }
  },
  { _id:false }
);

const ExternalPassengerSchema = new mongoose.Schema(
  {
    externalPassengerId:{ type:String, default:"" },
    clientName:{ type:String, default:"" },
    clientPhone:{ type:String, default:"" },
    clientEmail:{ type:String, default:"" },
    memberId:{ type:String, default:"" },
    pickup:{ type:String, default:"" },
    pickupLat:{ type:Number, default:null },
    pickupLng:{ type:Number, default:null },
    pickupGeoKey:{ type:String, default:"" },
    pickupGeoAddress:{ type:String, default:"" },
    pickupGeoSource:{ type:String, default:"" },
    dropoff:{ type:String, default:"" },
    dropoffLat:{ type:Number, default:null },
    dropoffLng:{ type:Number, default:null },
    dropoffGeoKey:{ type:String, default:"" },
    dropoffGeoAddress:{ type:String, default:"" },
    dropoffGeoSource:{ type:String, default:"" },
    pickupTime:{ type:String, default:"" },
    appointmentTime:{ type:String, default:"" },
    returnTime:{ type:String, default:"" },
    notes:{ type:String, default:"" }
  },
  { _id:false }
);

const ExternalTripSchema = new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },

    tenantSlug:{
      type:String,
      default:"",
      trim:true,
      lowercase:true,
      index:true
    },

    integrationId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"BrokerIntegration",
      default:null,
      index:true
    },

    ghExternalTripNumber:{
      type:String,
      required:true,
      unique:true,
      index:true
    },

    brokerCode:{
      type:String,
      required:true,
      trim:true,
      uppercase:true,
      minlength:2,
      maxlength:2,
      match:/^[A-Z0-9]{2}$/,
      index:true
    },

    brokerName:{
      type:String,
      default:""
    },

    externalTripId:{
      type:String,
      default:"",
      trim:true
    },

    connectionType:{
      type:String,
      enum:["API","WEBHOOK","SFTP","FILE_IMPORT","MANUAL"],
      default:"MANUAL",
      index:true
    },

    source:{
      type:String,
      enum:["BROKER","MANUAL"],
      default:"BROKER",
      index:true
    },

    tripType:{
      type:String,
      enum:["SINGLE","SHARED"],
      default:"SINGLE"
    },

    serviceKey:{
      type:String,
      default:"",
      trim:true,
      uppercase:true
    },

    serviceName:{
      type:String,
      default:""
    },

    tripDate:{
      type:String,
      default:"",
      index:true
    },

    tripTime:{
      type:String,
      default:"",
      index:true
    },

    appointmentTime:{
      type:String,
      default:""
    },

    returnTime:{
      type:String,
      default:""
    },

    clientName:{
      type:String,
      default:""
    },

    clientPhone:{
      type:String,
      default:""
    },

    clientEmail:{
      type:String,
      default:""
    },

    memberId:{
      type:String,
      default:""
    },

    pickup:{
      type:String,
      default:""
    },

    pickupLat:{
      type:Number,
      default:null
    },

    pickupLng:{
      type:Number,
      default:null
    },

    pickupGeoKey:{
      type:String,
      default:""
    },

    pickupGeoAddress:{
      type:String,
      default:""
    },

    pickupGeoSource:{
      type:String,
      default:""
    },

    dropoff:{
      type:String,
      default:""
    },

    dropoffLat:{
      type:Number,
      default:null
    },

    dropoffLng:{
      type:Number,
      default:null
    },

    dropoffGeoKey:{
      type:String,
      default:""
    },

    dropoffGeoAddress:{
      type:String,
      default:""
    },

    dropoffGeoSource:{
      type:String,
      default:""
    },

    stops:{
      type:[ExternalStopSchema],
      default:[]
    },

    passengers:{
      type:[ExternalPassengerSchema],
      default:[]
    },

    notes:{
      type:String,
      default:""
    },

    brokerNotes:{
      type:String,
      default:""
    },

    status:{
      type:String,
      enum:[
        "RECEIVED",
        "READY",
        "HELD",
        "TRANSFERRED",
        "UPDATED",
        "CANCELLED",
        "REJECTED",
        "ERROR"
      ],
      default:"RECEIVED",
      index:true
    },

    brokerStatus:{
      type:String,
      default:""
    },

    transferEligible:{
      type:Boolean,
      default:true,
      index:true
    },

    transferredToTripsHub:{
      type:Boolean,
      default:false,
      index:true
    },

    transferredTripId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Trip",
      default:null
    },

    transferredAt:{
      type:Date,
      default:null
    },

    lastBrokerUpdateAt:{
      type:Date,
      default:null
    },

    receivedAt:{
      type:Date,
      default:Date.now,
      index:true
    },

    rawPayload:{
      type:mongoose.Schema.Types.Mixed,
      default:null
    },

    normalizedPayload:{
      type:mongoose.Schema.Types.Mixed,
      default:null
    },

    duplicateKey:{
      type:String,
      default:"",
      index:true
    },

    errorMessage:{
      type:String,
      default:""
    }
  },
  {
    timestamps:true,
    minimize:false
  }
);

ExternalTripSchema.index(
  { tenantId:1, brokerCode:1, externalTripId:1 },
  {
    unique:true,
    partialFilterExpression:{
      externalTripId:{ $type:"string", $gt:"" }
    }
  }
);

ExternalTripSchema.index(
  { tenantId:1, tripDate:1, tripTime:1, status:1 }
);

ExternalTripSchema.index(
  { tenantId:1, transferredToTripsHub:1, transferEligible:1 }
);

module.exports =
  mongoose.models.ExternalTrip ||
  mongoose.model("ExternalTrip", ExternalTripSchema);
