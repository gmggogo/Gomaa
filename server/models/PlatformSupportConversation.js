"use strict";

const mongoose = require("mongoose");

const PlatformSupportConversationSchema =
new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },

    tenantName:{
      type:String,
      default:"",
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
      default:"",
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
      maxlength:240
    },

    tenantUnreadCount:{
      type:Number,
      default:0,
      min:0
    },

    platformUnreadCount:{
      type:Number,
      default:0,
      min:0
    },

    resolvedAt:{
      type:Date,
      default:null
    },

    resolvedBy:{
      type:String,
      default:""
    }
  },
  {
    timestamps:true
  }
);

PlatformSupportConversationSchema.index({
  tenantId:1,
  updatedAt:-1
});

PlatformSupportConversationSchema.index({
  status:1,
  lastMessageAt:-1
});

module.exports =
  mongoose.models.PlatformSupportConversation ||
  mongoose.model(
    "PlatformSupportConversation",
    PlatformSupportConversationSchema
  );
