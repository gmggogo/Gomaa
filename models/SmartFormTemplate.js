const mongoose = require("mongoose");

const fieldSchema = new mongoose.Schema({
  fieldId:{type:String,required:true,trim:true}, label:{type:String,default:"",trim:true}, semanticKey:{type:String,default:"",trim:true},
  fieldType:{type:String,enum:["TEXT","PHONE","DATE","TIME","NUMBER","ADDRESS","CHECKBOX","SIGNATURE","OTHER"],default:"TEXT"},
  page:{type:Number,default:1,min:1}, sectionId:{type:String,default:"",trim:true}, sectionLabel:{type:String,default:"",trim:true},
  occurrenceIndex:{type:Number,default:1,min:1}, bbox:{x:{type:Number,default:0},y:{type:Number,default:0},width:{type:Number,default:0},height:{type:Number,default:0}},
  enabled:{type:Boolean,default:true}, sourceScope:{type:String,enum:["GLOBAL","CLIENT","TRIP","DRIVER","VEHICLE","SIGNATURE","MANUAL"],default:"MANUAL"},
  sourcePath:{type:String,default:"",trim:true}, repeatGroupId:{type:String,default:"",trim:true},
  repeatMode:{type:String,enum:["NONE","SAME_VALUE","PER_SLOT","ALL_PAGES"],default:"NONE"}, required:{type:Boolean,default:false}, manualAllowed:{type:Boolean,default:true}
},{_id:false,minimize:false});

const schema = new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,index:true}, organizationId:{type:String,required:true,trim:true,index:true},
  organizationName:{type:String,required:true,trim:true}, organizationType:{type:String,enum:["INSURANCE","BROKER","COMPANY","OTHER"],default:"INSURANCE"},
  name:{type:String,required:true,trim:true}, active:{type:Boolean,default:true,index:true}, archived:{type:Boolean,default:false,index:true}, version:{type:Number,default:1,min:1},
  sourceFile:{originalName:{type:String,default:""},mimeType:{type:String,default:""},size:{type:Number,default:0},data:{type:Buffer,default:null}},
  pageCount:{type:Number,default:1,min:1}, sections:{type:[mongoose.Schema.Types.Mixed],default:[]}, fields:{type:[fieldSchema],default:[]},
  analysisProvider:{type:String,default:""}, analyzedAt:{type:Date,default:null}, createdBy:{type:String,default:""}, updatedBy:{type:String,default:""}
},{timestamps:true,minimize:false});
schema.index({tenantId:1,organizationId:1,name:1},{unique:true});
schema.index({tenantId:1,organizationId:1,active:1,archived:1,updatedAt:-1});
module.exports = mongoose.models.SmartFormTemplate || mongoose.model("SmartFormTemplate",schema);
