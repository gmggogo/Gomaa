"use strict";

const mongoose = require("mongoose");

const PlatformSupportMessageSchema =
new mongoose.Schema(
  {
    conversationId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"PlatformSupportConversation",
      required:true,
      index:true
    },

    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },

    senderType:{
      type:String,
      enum:[
        "TENANT_STAFF",
        "PLATFORM_ADMIN"
      ],
      required:true
    },

    senderUserId:{
      type:String,
      default:"",
      trim:true
    },

    senderName:{
      type:String,
      default:"",
      trim:true
    },

    senderRole:{
      type:String,
      default:"",
      trim:true
    },

    senderPhone:{
      type:String,
      default:"",
      trim:true
    },

    message:{
      type:String,
      required:true,
      trim:true,
      maxlength:5000
    },

    readByTenantAt:{
      type:Date,
      default:null
    },

    readByPlatformAt:{
      type:Date,
      default:null
    }
  },
  {
    timestamps:true
  }
);

PlatformSupportMessageSchema.index({
  conversationId:1,
  createdAt:1
});

module.exports =
  mongoose.models.PlatformSupportMessage ||
  mongoose.model(
    "PlatformSupportMessage",
    PlatformSupportMessageSchema
  );
