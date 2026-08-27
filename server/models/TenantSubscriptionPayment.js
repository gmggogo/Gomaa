"use strict";
const mongoose=require("mongoose");
const schema=new mongoose.Schema({
tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,index:true},
invoiceNumber:{type:String,required:true,unique:true,index:true},
amount:{type:Number,required:true,min:0},
currency:{type:String,default:"usd"},
billingCycle:{type:String,enum:["MONTHLY","ANNUAL"],default:"ANNUAL"},
status:{type:String,enum:["PENDING","PROCESSING","PAID","FAILED","CANCELED"],default:"PENDING",index:true},
paymentMethod:{type:String,default:""},
checkoutSessionId:{type:String,default:"",index:true},
paymentIntentId:{type:String,default:""},
paidAt:{type:Date,default:null}
},{timestamps:true});
module.exports=mongoose.models.TenantSubscriptionPayment||mongoose.model("TenantSubscriptionPayment",schema);