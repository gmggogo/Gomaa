const mongoose = require("mongoose");

const billingHistorySchema = new mongoose.Schema({

  companyId:String,
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

  tripIds:[{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Trip"
  }]

},{
  timestamps:true
});

module.exports =
  mongoose.model(
    "BillingHistory",
    billingHistorySchema
  );