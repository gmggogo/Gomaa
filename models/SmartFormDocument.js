const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,index:true},
  organizationId:{type:String,required:true,trim:true,index:true},
  organizationName:{type:String,default:"",trim:true},
  templateId:{type:mongoose.Schema.Types.ObjectId,ref:"SmartFormTemplate",required:true,index:true},
  templateVersion:{type:Number,default:1},
  serviceDate:{type:String,default:"",index:true},
  clientKey:{type:String,default:"",index:true},
  clientName:{type:String,default:""},
  tripIds:{type:[mongoose.Schema.Types.ObjectId],ref:"Trip",default:[]},
  slotAssignments:{type:[mongoose.Schema.Types.Mixed],default:[]},
  values:{type:mongoose.Schema.Types.Mixed,default:{}},
  manualOverrides:{type:mongoose.Schema.Types.Mixed,default:{}},
  signatureRefs:{type:[mongoose.Schema.Types.Mixed],default:[]},
  generatedFile:{mimeType:{type:String,default:"application/pdf"},data:{type:Buffer,default:null},generatedAt:{type:Date,default:null}},
  status:{type:String,enum:["REVIEW","FINALIZED","ARCHIVED"],default:"REVIEW",index:true},
  finalizedAt:{type:Date,default:null},
  finalizedBy:{type:String,default:""}
},{timestamps:true,minimize:false});
schema.index({tenantId:1,organizationId:1,status:1,updatedAt:-1});
schema.index({tenantId:1,templateId:1,serviceDate:1,clientKey:1});
module.exports = mongoose.models.SmartFormDocument || mongoose.model("SmartFormDocument",schema);
