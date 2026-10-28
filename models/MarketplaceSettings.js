"use strict";

/*
DESTINATION PATH:
server/models/MarketplaceSettings.js

Marketplace settings model.

IMPORTANT:
The JavaScript model/file name is now generic MarketplaceSettings,
but the MongoDB collection stays the existing legacy collection
"mtmmarketplacesettings" so current saved settings are preserved.
*/

const mongoose = require("mongoose");

const EngineSchema = new mongoose.Schema(
  {
    enabled:{
      type:Boolean,
      default:false
    },

    autoAccept:{
      type:Boolean,
      default:false
    },

    /*
      Zone = radius around one or more configured ZIP codes.
      Existing pickupZipCodes / dropoffZipCodes are used as zone centers.
    */
    zoneRadiusMiles:{
      type:Number,
      default:200,
      min:0
    },

    /*
      Trip length is a separate filter from zone radius.
      A max of 0 means no upper trip-mile limit.
    */
    tripMilesMin:{
      type:Number,
      default:0,
      min:0
    },

    tripMilesMax:{
      type:Number,
      default:0,
      min:0
    },

    /*
      Legacy values retained so existing settings documents remain readable.
      New code does not treat milesMax as trip length when zoneRadiusMiles exists.
    */
    milesMin:{
      type:Number,
      default:0,
      min:0
    },

    milesMax:{
      type:Number,
      default:0,
      min:0
    },

    dailyTripLimit:{
      type:Number,
      default:0,
      min:0
    },

    pickupTimeFrom:{
      type:String,
      default:"00:00"
    },

    pickupTimeTo:{
      type:String,
      default:"23:59"
    },

    dropoffTimeFrom:{
      type:String,
      default:"00:00"
    },

    dropoffTimeTo:{
      type:String,
      default:"23:59"
    },

    pickupZipCodes:{
      type:[String],
      default:[]
    },

    dropoffZipCodes:{
      type:[String],
      default:[]
    },

    pickupZoneCity:{type:String,default:"",trim:true},
    pickupZoneState:{type:String,default:"",trim:true},
    pickupZoneZip:{type:String,default:"",trim:true},
    pickupZoneAddress:{type:String,default:"",trim:true},

    dropoffZoneCity:{type:String,default:"",trim:true},
    dropoffZoneState:{type:String,default:"",trim:true},
    dropoffZoneZip:{type:String,default:"",trim:true},
    dropoffZoneAddress:{type:String,default:"",trim:true},

    zoneMatch:{
      type:String,
      enum:[
        "ANY",
        "PICKUP",
        "DROPOFF",
        "EITHER",
        "BOTH"
      ],
      default:"ANY"
    },

    modes:{
      type:[String],
      default:[]
    }
  },
  {
    _id:false,
    minimize:false
  }
);

const VehicleConfigSchema = new mongoose.Schema(
  {
    driverId:{type:String,default:"",trim:true},
    driverName:{type:String,default:"",trim:true},
    vehicleNumber:{type:String,default:"",trim:true},
    services:{type:[String],default:["ALL"]},
    vehicleCategory:{type:String,default:"GENERIC",trim:true,uppercase:true},
    enabled:{type:Boolean,default:true},
    tripCategories:{
      long:{type:Boolean,default:true},
      medium:{type:Boolean,default:true},
      short:{type:Boolean,default:true}
    },
    shiftStart:{type:String,default:"08:00"},
    shiftEnd:{type:String,default:"18:00"},
    maxWorkHours:{type:Number,default:10,min:0},
    minDailyMiles:{type:Number,default:150,min:0},
    maxDailyMiles:{type:Number,default:400,min:0},
    maxDeadheadMiles:{type:Number,default:150,min:0},
    breakEnabled:{type:Boolean,default:false},
    breakDurationMinutes:{type:Number,default:30,min:0},
    breakWindowFrom:{type:String,default:"12:00"},
    breakWindowTo:{type:String,default:"15:00"},
    pickupZoneCity:{type:String,default:"",trim:true},
    pickupZoneState:{type:String,default:"",trim:true,uppercase:true},
    pickupZoneZip:{type:String,default:"",trim:true},
    pickupZoneAddress:{type:String,default:"",trim:true},
    dropoffZoneCity:{type:String,default:"",trim:true},
    dropoffZoneState:{type:String,default:"",trim:true,uppercase:true},
    dropoffZoneZip:{type:String,default:"",trim:true},
    dropoffZoneAddress:{type:String,default:"",trim:true},
    zoneRadiusMiles:{type:Number,default:200,min:0},
    zoneMatch:{type:String,enum:["ANY","PICKUP","DROPOFF","EITHER","BOTH"],default:"PICKUP"}
  },
  {_id:false,minimize:false}
);

const MarketplaceSettingsSchema =
  new mongoose.Schema(
    {
      tenantId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Tenant",
        required:true,
        unique:true,
        index:true
      },

      tenantSlug:{
        type:String,
        default:"",
        trim:true,
        lowercase:true
      },

      integrationId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"BrokerIntegration",
        default:null,
        index:true
      },

      enabled:{
        type:Boolean,
        default:true
      },

      /*
        Kept for backward compatibility with already-saved Marketplace
        settings. The generic Marketplace route does not use this value
        to decide which broker connection is scanned.
      */
      connectionMethod:{
        type:String,
        enum:[
          "MTM_MOCK",
          "MTM_PORTAL",
          "MTM_API"
        ],
        default:"MTM_PORTAL"
      },

      dateWindowDays:{
        type:Number,
        default:7,
        min:1,
        max:31
      },

      totalDailyTripLimit:{
        type:Number,
        default:0,
        min:0
      },

      acceptEnabled:{type:Boolean,default:true},
      pickupLateToleranceMinutes:{type:Number,default:0,min:0},
      dropoffLateToleranceMinutes:{type:Number,default:0,min:0},
      longMinMiles:{type:Number,default:100,min:0},
      mediumMinMiles:{type:Number,default:50,min:0},
      targetDailyMilesMin:{type:Number,default:150,min:0},
      targetDailyMilesMax:{type:Number,default:500,min:0},
      noShowReplacementEnabled:{type:Boolean,default:false},
      cancelReplacementEnabled:{type:Boolean,default:false},
      vehicleConfigs:{type:[VehicleConfigSchema],default:[]},

      longEngine:{
        type:EngineSchema,
        default:()=>({
          enabled:false,
          autoAccept:false,
          zoneRadiusMiles:200,
          tripMilesMin:0,
          tripMilesMax:0,
          milesMin:10,
          milesMax:50,
          dailyTripLimit:0,
          pickupTimeFrom:"00:00",
          pickupTimeTo:"23:59",
          dropoffTimeFrom:"00:00",
          dropoffTimeTo:"23:59",
          pickupZipCodes:[],
          dropoffZipCodes:[],
          zoneMatch:"ANY",
          modes:[]
        })
      },

      shortEngine:{
        type:EngineSchema,
        default:()=>({
          enabled:false,
          autoAccept:false,
          zoneRadiusMiles:200,
          tripMilesMin:0,
          tripMilesMax:0,
          milesMin:0,
          milesMax:9.99,
          dailyTripLimit:0,
          pickupTimeFrom:"00:00",
          pickupTimeTo:"23:59",
          dropoffTimeFrom:"00:00",
          dropoffTimeTo:"23:59",
          pickupZipCodes:[],
          dropoffZipCodes:[],
          zoneMatch:"ANY",
          modes:[]
        })
      },

      mediumEngine:{
        type:EngineSchema,
        default:() => ({
          enabled:false,autoAccept:false,zoneRadiusMiles:200,
          tripMilesMin:50,tripMilesMax:100,milesMin:50,milesMax:100,
          dailyTripLimit:0,pickupTimeFrom:"00:00",pickupTimeTo:"23:59",
          dropoffTimeFrom:"00:00",dropoffTimeTo:"23:59",
          pickupZipCodes:[],dropoffZipCodes:[],zoneMatch:"ANY",modes:[]
        })
      },

      lastScanAt:{
        type:Date,
        default:null
      },

      lastSuccessfulScanAt:{
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
  mongoose.models.MarketplaceSettings ||
  mongoose.model(
    "MarketplaceSettings",
    MarketplaceSettingsSchema,
    "mtmmarketplacesettings"
  );
