"use strict";

/*
DESTINATION PATH:
server/models/SharedEngineSettings.js

PURPOSE:
Per-tenant Shared Engine settings.
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

      enabled:{
        type:Boolean,
        default:true
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
        default:10,
        min:0
      },

      maxExtraMiles:{
        type:Number,
        default:10,
        min:0
      },

      maxExtraMinutes:{
        type:Number,
        default:30,
        min:0
      },

      appointmentBufferMinutes:{
        type:Number,
        default:10,
        min:0
      },

      pickupLateToleranceMinutes:{
        type:Number,
        default:5,
        min:0
      },

      pickupEarlyWindowMinutes:{
        type:Number,
        default:20,
        min:0
      },

      maxRidersPerGroup:{
        type:Number,
        default:4,
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
