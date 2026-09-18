"use strict";

const mongoose = require("mongoose");

const THREE_YEARS_SECONDS =
  3 * 365 * 24 * 60 * 60;

const billingHistorySchema =
  new mongoose.Schema(
    {
      tenantId:{
        type:String,
        trim:true,
        index:true,
        default:""
      },

      companyId:{
        type:String,
        trim:true,
        required:true,
        index:true
      },

      companyName:{
        type:String,
        default:""
      },

      companyEmail:{
        type:String,
        default:""
      },

      companyPhone:{
        type:String,
        default:""
      },

      invoiceNumber:{
        type:String,
        default:"",
        index:true
      },

      billingStartDate:{
        type:Date,
        default:null
      },

      billingEndDate:{
        type:Date,
        default:null
      },

      totalTrips:{
        type:Number,
        default:0
      },

      individualTrips:{
        type:Number,
        default:0
      },

      sharedTrips:{
        type:Number,
        default:0
      },

      sharedPassengers:{
        type:Number,
        default:0
      },

      completedTrips:{
        type:Number,
        default:0
      },

      cancelledTrips:{
        type:Number,
        default:0
      },

      noShowTrips:{
        type:Number,
        default:0
      },

      revenue:{
        type:Number,
        default:0
      },

      invoiceAmount:{
        type:Number,
        default:0
      },

      paidDate:{
        type:Date,
        default:Date.now
      },

      paymentMethod:{
        type:String,
        default:"STRIPE"
      },

      stripeCheckoutSessionId:{
        type:String,
        default:"",
        index:true
      },

      stripePaymentIntentId:{
        type:String,
        default:""
      },

      stripeAccountId:{
        type:String,
        default:""
      },

      tripIds:[{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Trip"
      }]
    },
    {
      timestamps:true
    }
  );

/*
  Company payment history retention:
  MongoDB automatically removes rows about 3 years after paidDate.
*/
billingHistorySchema.index(
  {paidDate:1},
  {expireAfterSeconds:THREE_YEARS_SECONDS}
);

billingHistorySchema.index(
  {tenantId:1,companyId:1,paidDate:-1}
);

module.exports =
  mongoose.models.BillingHistory ||
  mongoose.model(
    "BillingHistory",
    billingHistorySchema
  );
