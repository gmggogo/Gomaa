"use strict";

const mongoose = require("mongoose");

const tenantPaymentAccountSchema =
  new mongoose.Schema(
    {
      tenantId:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Tenant",
        required:true,
        unique:true,
        index:true
      },

      stripeAccountId:{
        type:String,
        default:"",
        trim:true,
        index:true
      },

      stripeAccountType:{
        type:String,
        default:"express",
        trim:true
      },

      chargesEnabled:{
        type:Boolean,
        default:false
      },

      payoutsEnabled:{
        type:Boolean,
        default:false
      },

      detailsSubmitted:{
        type:Boolean,
        default:false
      },

      connected:{
        type:Boolean,
        default:false
      },

      onboardingComplete:{
        type:Boolean,
        default:false
      },

      country:{
        type:String,
        default:"US",
        trim:true,
        uppercase:true
      },

      defaultCurrency:{
        type:String,
        default:"usd",
        trim:true,
        lowercase:true
      },

      lastStripeSyncAt:{
        type:Date,
        default:null
      }
    },
    {
      timestamps:true
    }
  );

tenantPaymentAccountSchema.index(
  {tenantId:1},
  {unique:true}
);

module.exports =
  mongoose.models.TenantPaymentAccount ||
  mongoose.model(
    "TenantPaymentAccount",
    tenantPaymentAccountSchema
  );