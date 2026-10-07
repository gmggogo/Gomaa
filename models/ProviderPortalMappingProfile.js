"use strict";

/*
  DESTINATION: server/models/ProviderPortalMappingProfile.js

  Saved generic provider-portal field mapping.
  No passwords, cookies, MFA codes, browser session state, or raw trip payloads
  are stored here. Only field-path mapping metadata is persisted.
*/

const mongoose = require("mongoose");

const ProviderPortalMappingProfileSchema = new mongoose.Schema({
  tenantId:{type:String,required:true,index:true},
  connectionId:{type:String,default:"",trim:true,index:true},
  sourceHost:{type:String,required:true,lowercase:true,trim:true,index:true},
  enabled:{type:Boolean,default:true},
  mappingVersion:{type:Number,default:1},
  mapping:{type:mongoose.Schema.Types.Mixed,default:{}},
  confidence:{type:Number,default:0},
  method:{
    type:String,
    enum:["AUTO_RULES","AI_ASSISTED","MANUAL","SAVED_PROFILE"],
    default:"AUTO_RULES"
  },
  aiStatus:{type:String,default:"NOT_USED"},
  aiModel:{type:String,default:""},
  ready:{type:Boolean,default:false},

  /*
    Generic portal onboarding telemetry.
    These fields describe how the portal was discovered and do not store
    passwords, cookies, MFA material, or browser session state.
  */
  discoveryMethods:{type:[String],default:[]},
  lastDiscoveryType:{type:String,default:""},
  lastSourceUrl:{type:String,default:""},

  /*
    Generic Action Profile foundation.
    Detection does NOT execute Accept / Claim. It only records a candidate
    action so the portal can be validated safely before automation is enabled.
  */
  actionProfile:{type:mongoose.Schema.Types.Mixed,default:{}},
  actionConfidence:{type:Number,default:0},
  actionMethod:{type:String,default:""},
  actionReady:{type:Boolean,default:false},
  actionVerifiedAt:{type:Date,default:null},

  lastSeenAt:{type:Date,default:Date.now},
  createdAt:{type:Date,default:Date.now},
  updatedAt:{type:Date,default:Date.now}
},{minimize:false});

ProviderPortalMappingProfileSchema.index(
  {tenantId:1,connectionId:1,sourceHost:1},
  {unique:true,name:"provider_portal_mapping_tenant_connection_host"}
);

module.exports =
  mongoose.models.ProviderPortalMappingProfile ||
  mongoose.model("ProviderPortalMappingProfile",ProviderPortalMappingProfileSchema);
