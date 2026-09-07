"use strict";

/*
DESTINATION PATH:
server/models/BrokerIntegration.js

REPLACE THE PREVIOUS VERSION WITH THIS FILE.

PURPOSE:
Platform Admin controlled broker connections per tenant.
One tenant can have multiple brokers.
Every broker has a two-character code used in GH external trip numbers.
*/

const mongoose = require("mongoose");

const BrokerIntegrationSchema = new mongoose.Schema(
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

    enabled:{
      type:Boolean,
      default:false,
      index:true
    },

    featureVisible:{
      type:Boolean,
      default:false,
      index:true
    },

    billingEnabled:{
      type:Boolean,
      default:false
    },

    monthlyFlatFee:{
      type:Number,
      default:0,
      min:0
    },

    brokerName:{
      type:String,
      required:true,
      trim:true
    },

    /*
      Exactly two characters.
      Examples:
      MT = MTM
      MC = ModivCare
      SR = SafeRide
      AL = Alivi
    */
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

    connectionType:{
      type:String,
      required:true,
      enum:["API","WEBHOOK","SFTP","FILE_IMPORT"]
    },

    environment:{
      type:String,
      enum:["SANDBOX","PRODUCTION"],
      default:"SANDBOX",
      index:true
    },

    integrationDirection:{
      type:String,
      enum:["INBOUND","OUTBOUND","BOTH"],
      default:"INBOUND"
    },

    providerId:{
      type:String,
      default:"",
      trim:true
    },

    connectionStatus:{
      type:String,
      enum:[
        "NOT_CONFIGURED",
        "CONFIGURED",
        "TESTING",
        "CONNECTED",
        "ERROR",
        "DISABLED"
      ],
      default:"NOT_CONFIGURED",
      index:true
    },

    api:{
      endpoint:{ type:String, default:"" },

      authType:{
        type:String,
        enum:["NONE","API_KEY","BEARER","BASIC","OAUTH2","CUSTOM"],
        default:"NONE"
      },

      apiKeyEncrypted:{ type:String, default:"" },
      bearerTokenEncrypted:{ type:String, default:"" },
      usernameEncrypted:{ type:String, default:"" },
      passwordEncrypted:{ type:String, default:"" },
      clientIdEncrypted:{ type:String, default:"" },
      clientSecretEncrypted:{ type:String, default:"" },

      tokenUrl:{ type:String, default:"" },

      statusEndpoint:{
        type:String,
        default:""
      },

      scope:{
        type:String,
        default:""
      },

      headers:{
        type:mongoose.Schema.Types.Mixed,
        default:{}
      },

      pollEnabled:{
        type:Boolean,
        default:false
      },

      pollMinutes:{
        type:Number,
        default:15,
        min:1
      }
    },

    webhook:{
      inboundPath:{
        type:String,
        default:""
      },

      secretEncrypted:{
        type:String,
        default:""
      },

      signatureHeader:{
        type:String,
        default:""
      },

      signatureAlgorithm:{
        type:String,
        enum:["NONE","HMAC_SHA256","HMAC_SHA1","CUSTOM"],
        default:"NONE"
      },

      outboundUrl:{
        type:String,
        default:""
      }
    },

    sftp:{
      host:{ type:String, default:"" },
      port:{ type:Number, default:22 },
      usernameEncrypted:{ type:String, default:"" },
      passwordEncrypted:{ type:String, default:"" },
      privateKeyEncrypted:{ type:String, default:"" },
      remotePath:{ type:String, default:"" },
      filePattern:{ type:String, default:"" },
      processedPath:{ type:String, default:"" }
    },

    fileImport:{
      allowedTypes:{
        type:[String],
        default:["csv","json","xlsx"]
      },

      delimiter:{
        type:String,
        default:","
      },

      hasHeaderRow:{
        type:Boolean,
        default:true
      },

      mapping:{
        type:mongoose.Schema.Types.Mixed,
        default:{}
      }
    },

    /*
      Broker-specific settings that do not belong to the generic
      API / Webhook / SFTP / File Import transport layer.
    */
    brokerConfig:{
      type:mongoose.Schema.Types.Mixed,
      default:{}
    },

    lastTestAt:{
      type:Date,
      default:null
    },

    lastConnectedAt:{
      type:Date,
      default:null
    },

    lastReceivedAt:{
      type:Date,
      default:null
    },

    lastErrorAt:{
      type:Date,
      default:null
    },

    lastErrorMessage:{
      type:String,
      default:""
    },

    createdBy:{
      type:String,
      default:""
    },

    updatedBy:{
      type:String,
      default:""
    }
  },
  {
    timestamps:true,
    minimize:false
  }
);

/*
  Same tenant can have many brokers.
  The same two-character broker code cannot be reused inside one tenant.
*/
BrokerIntegrationSchema.index(
  { tenantId:1, brokerCode:1 },
  { unique:true }
);

module.exports =
  mongoose.models.BrokerIntegration ||
  mongoose.model("BrokerIntegration", BrokerIntegrationSchema);
