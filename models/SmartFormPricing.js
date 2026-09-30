"use strict";
const mongoose=require("mongoose");
const ServicePricingSchema=new mongoose.Schema({
  serviceKey:{type:String,required:true,trim:true,uppercase:true},serviceName:{type:String,default:"",trim:true},enabled:{type:Boolean,default:true},shared:{type:Boolean,default:false},
  pricingMode:{type:String,enum:["MILE","HOURLY","SHARED"],default:"MILE"},baseFare:{type:Number,default:0,min:0},includedMiles:{type:Number,default:0,min:0},perMile:{type:Number,default:0,min:0},
  hourlyRate:{type:Number,default:0,min:0},hourlyBillingMode:{type:String,enum:["FULL","QUARTER"],default:"FULL"},initialDurationMinutes:{type:Number,default:0,min:0},initialPrice:{type:Number,default:0,min:0},
  stopFee:{type:Number,default:0,min:0},noShowFee:{type:Number,default:0,min:0},sharedPrice:{type:Number,default:0,min:0},cancelEnabled:{type:Boolean,default:true},warningMinutes:{type:Number,default:0,min:0},cancelFee:{type:Number,default:0,min:0}
},{_id:false});
const schema=new mongoose.Schema({tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,index:true},templateId:{type:mongoose.Schema.Types.ObjectId,ref:"SmartFormTemplate",required:true,index:true},templateName:{type:String,default:""},active:{type:Boolean,default:true},services:{type:[ServicePricingSchema],default:[]},updatedBy:{type:String,default:""}},{timestamps:true,minimize:false});
schema.index({tenantId:1,templateId:1},{unique:true});
module.exports=mongoose.models.SmartFormPricing||mongoose.model("SmartFormPricing",schema);
