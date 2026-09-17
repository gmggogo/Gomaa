"use strict";

const mongoose = require("mongoose");

const PlatformCompanySupportConversationSchema =
new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },

    companyKey:{
      type:String,
      required:true,
      trim:true,
      index:true
    },

    companyUserId:{
      type:String,
      default:"",
      trim:true
    },

    facilityId:{
      type:String,
      default:"",
      trim:true
    },

    companyName:{
      type:String,
      required:true,
      trim:true
    },

    companyPhone:{
      type:String,
      default:"",
      trim:true
    },

    subject:{
      type:String,
      required:true,
      trim:true,
      maxlength:180
    },

    status:{
      type:String,
      enum:[
        "OPEN",
        "WAITING_FOR_SUPPORT",
        "WAITING_FOR_CUSTOMER",
        "RESOLVED"
      ],
      default:"WAITING_FOR_SUPPORT",
      index:true
    },

    createdByUserId:{
      type:String,
      default:"",
      trim:true
    },

    createdByName:{
      type:String,
      default:"",
      trim:true
    },

    createdByRole:{
      type:String,
      default:"COMPANY",
      trim:true
    },

    createdByPhone:{
      type:String,
      default:"",
      trim:true
    },

    lastMessageAt:{
      type:Date,
      default:Date.now,
      index:true
    },

    lastMessagePreview:{
      type:String,
      default:"",
      trim:true,
      maxlength:500
    },

    companyUnreadCount:{
      type:Number,
      default:0,
      min:0
    },

    superAdminUnreadCount:{
      type:Number,
      default:0,
      min:0
    },

    resolvedAt:{
      type:Date,
      default:null
    },

    resolvedByUserId:{
      type:String,
      default:"",
      trim:true
    },

    resolvedByName:{
      type:String,
      default:"",
      trim:true
    },

    resolvedByRole:{
      type:String,
      default:"",
      trim:true
    }
  },
  {
    timestamps:true
  }
);

PlatformCompanySupportConversationSchema.index({
  tenantId:1,
  companyKey:1,
  status:1,
  lastMessageAt:-1
});

PlatformCompanySupportConversationSchema.index({
  tenantId:1,
  status:1,
  lastMessageAt:-1
});

module.exports =
mongoose.models.CompanySupportConversation ||
mongoose.model(
  "CompanySupportConversation",
  PlatformCompanySupportConversationSchema
);
