const mongoose = require("mongoose");
const draftTripSchema = new mongoose.Schema({
  slot:{type:Number,required:true,min:1}, clientName:{type:String,default:""}, clientPhone:{type:String,default:""}, memberId:{type:String,default:""},
  pickup:{type:String,default:""}, dropoff:{type:String,default:""}, tripDate:{type:String,default:""}, tripTime:{type:String,default:""},
  serviceKey:{type:String,default:"",uppercase:true,trim:true}, serviceName:{type:String,default:""}, values:{type:mongoose.Schema.Types.Mixed,default:{}},
  confirmed:{type:Boolean,default:false}, tripId:{type:mongoose.Schema.Types.ObjectId,ref:"Trip",default:null}, tripNumber:{type:String,default:""}
},{_id:true,minimize:false});
const schema = new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,index:true}, organizationId:{type:String,required:true,trim:true,index:true}, organizationName:{type:String,default:"",trim:true},
  templateId:{type:mongoose.Schema.Types.ObjectId,ref:"SmartFormTemplate",required:true,index:true}, templateVersion:{type:Number,default:1}, sheetNumber:{type:String,default:"",index:true},
  commonValues:{type:mongoose.Schema.Types.Mixed,default:{}}, draftTrips:{type:[draftTripSchema],default:[]}, tripIds:{type:[mongoose.Schema.Types.ObjectId],ref:"Trip",default:[]},
  slotAssignments:{type:[mongoose.Schema.Types.Mixed],default:[]}, values:{type:mongoose.Schema.Types.Mixed,default:{}}, manualOverrides:{type:mongoose.Schema.Types.Mixed,default:{}},
  signatureRefs:{type:[mongoose.Schema.Types.Mixed],default:[]}, generatedFile:{mimeType:{type:String,default:"application/pdf"},data:{type:Buffer,default:null},generatedAt:{type:Date,default:null}},
  status:{type:String,enum:["ENTRY_REVIEW","CONFIRMED","FINALIZED","ARCHIVED"],default:"ENTRY_REVIEW",index:true}, confirmedAt:{type:Date,default:null}, finalizedAt:{type:Date,default:null}, finalizedBy:{type:String,default:""}
},{timestamps:true,minimize:false});
schema.index({tenantId:1,organizationId:1,status:1,updatedAt:-1}); schema.index({tenantId:1,templateId:1,createdAt:-1});
module.exports = mongoose.models.SmartFormDocument || mongoose.model("SmartFormDocument",schema);
