"use strict";

const mongoose = require("mongoose");

const schema = new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      unique:true,
      index:true
    },

    planName:{
      type:String,
      default:"GH Mobility"
    },

    billingCycle:{
      type:String,
      enum:["MONTHLY","ANNUAL"],
      default:"ANNUAL"
    },

    amount:{
      type:Number,
      default:0,
      min:0
    },

    currency:{
      type:String,
      default:"usd"
    },

    status:{
      type:String,
      enum:["ACTIVE","TRIAL","PAST_DUE","SUSPENDED"],
      default:"ACTIVE",
      index:true
    },

    graceDays:{
      type:Number,
      default:3,
      min:0,
      max:60
    },

    dueDate:{
      type:Date,
      default:null
    },

    nextBillingDate:{
      type:Date,
      default:null
    },

    lastPaymentDate:{
      type:Date,
      default:null
    },

    stripeCustomerId:{
      type:String,
      default:""
    }
  },
  {timestamps:true}
);

module.exports =
  mongoose.models.TenantSubscription ||
  mongoose.model("TenantSubscription",schema);