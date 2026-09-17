"use strict";

const mongoose = require("mongoose");

const CompanySupportMessageSchema =
new mongoose.Schema(
  {
    conversationId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"CompanySupportConversation",
      required:true,
      index:true
    },

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

    senderType:{
      type:String,
      enum:[
        "COMPANY",
        "SUPER_ADMIN"
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

    readByCompanyAt:{
      type:Date,
      default:null
    },

    readBySuperAdminAt:{
      type:Date,
      default:null
    }
  },
  {
    timestamps:true
  }
);

CompanySupportMessageSchema.index({
  conversationId:1,
  createdAt:1
});

module.exports =
mongoose.models.CompanySupportMessage ||
mongoose.model(
  "CompanySupportMessage",
  CompanySupportMessageSchema
);
