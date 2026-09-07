"use strict";

/*
DESTINATION PATH:
server/models/SharedEngineSettings.js

PURPOSE:
Per-tenant Shared Engine settings.

NOTES:
- Shared Engine is always enabled.
- Manual / Automatic mode belongs to the Shared page, not here.
- Presets control Max Group Distance + Max Extra Ride Time.
- CUSTOM exposes the full advanced settings.
*/

const mongoose =
  require("mongoose");

const SourceSettingsSchema =
  new mongoose.Schema(
    {
      enabled:{
        type:Boolean,
        default:true
      }
    },
    {
      _id:false
    }
  );

const PresetSchema =
  new mongoose.Schema(
    {
      miles:{
        type:Number,
        min:0,
        required:true
      },

      minutes:{
        type:Number,
        min:0,
        required:true
      }
    },
    {
      _id:false
    }
  );

const SharedEngineSettingsSchema =
  new mongoose.Schema(
    {
      tenantId:{
        type:
          mongoose.Schema.Types.ObjectId,
        required:true,
        unique:true,
        index:true
      },

      /*
        Kept for backward compatibility only.
        The API always saves this as true.
      */
      enabled:{
        type:Boolean,
        default:true
      },

      presetMode:{
        type:String,
        enum:[
          "LONG",
          "MEDIUM",
          "SHORT",
          "CUSTOM"
        ],
        default:"LONG"
      },

      presets:{
        long:{
          type:PresetSchema,
          default:()=>({
            miles:20,
            minutes:45
          })
        },

        medium:{
          type:PresetSchema,
          default:()=>({
            miles:10,
            minutes:30
          })
        },

        short:{
          type:PresetSchema,
          default:()=>({
            miles:5,
            minutes:15
          })
        }
      },

      sources:{
        company:{
          type:SourceSettingsSchema,
          default:()=>({
            enabled:true
          })
        },

        reserved:{
          type:SourceSettingsSchema,
          default:()=>({
            enabled:true
          })
        },

        broker:{
          type:SourceSettingsSchema,
          default:()=>({
            enabled:true
          })
        }
      },

      maxGroupDistanceMiles:{
        type:Number,
        default:20,
        min:0
      },

      maxExtraMiles:{
        type:Number,
        default:10,
        min:0
      },

      maxExtraMinutes:{
        type:Number,
        default:45,
        min:0
      },

      appointmentBufferMinutes:{
        type:Number,
        default:60,
        min:0
      },

      pickupLateToleranceMinutes:{
        type:Number,
        default:30,
        min:0
      },

      pickupEarlyWindowMinutes:{
        type:Number,
        default:30,
        min:0
      },

      maxRidersPerGroup:{
        type:Number,
        default:3,
        min:2,
        max:20
      },

      samePickupPriority:{
        type:Boolean,
        default:true
      },

      sameDropoffPriority:{
        type:Boolean,
        default:true
      },

      updatedBy:{
        type:String,
        default:""
      }
    },
    {
      timestamps:true
    }
  );

module.exports =
  mongoose.models
    .SharedEngineSettings ||
  mongoose.model(
    "SharedEngineSettings",
    SharedEngineSettingsSchema
  );
