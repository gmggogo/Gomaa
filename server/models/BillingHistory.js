const mongoose = require("mongoose");

const billingHistorySchema = new mongoose.Schema({

  tenantId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Tenant",
    required:true,
    index:true
  },

  companyId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User",
    required:true,
    index:true
  },

  companyName:String,

  billingStartDate:Date,
  billingEndDate:Date,

  totalTrips:Number,
  individualTrips:Number,
  sharedTrips:Number,
  sharedPassengers:Number,

  completedTrips:Number,
  cancelledTrips:Number,
  noShowTrips:Number,

  revenue:Number,
  invoiceAmount:Number,

  paidDate:Date,

  paymentMethod:{
    type:String,
    default:""
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

},{
  timestamps:true
});

billingHistorySchema.index({
  tenantId:1,
  companyId:1,
  paidDate:-1
});

module.exports =
  mongoose.models.BillingHistory ||
  mongoose.model(
    "BillingHistory",
    billingHistorySchema
  );