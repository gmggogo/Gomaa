const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,index:true},
  organizationId:{type:mongoose.Schema.Types.ObjectId,ref:"SmartFormOrganization",required:true,index:true},
  templateId:{type:mongoose.Schema.Types.ObjectId,ref:"SmartFormTemplate",required:true,index:true},
  templateName:{type:String,default:""},
  organizationName:{type:String,default:""},
  status:{type:String,enum:["DRAFT","REVIEW","CONFIRMED","ARCHIVED"],default:"DRAFT",index:true},
  formData:{type:mongoose.Schema.Types.Mixed,default:{}},
  fieldSnapshot:{type:[mongoose.Schema.Types.Mixed],default:[]},
  tripId:{type:mongoose.Schema.Types.ObjectId,ref:"Trip",default:null,index:true},
  tripNumber:{type:String,default:"",index:true},
  clientName:{type:String,default:""},
  pickupAddress:{type:String,default:""},
  dropoffAddress:{type:String,default:""},
  tripDate:{type:String,default:""},
  pickupTime:{type:String,default:""},
  serviceName:{type:String,default:""},
  signatureRequired:{type:Boolean,default:false},
  distanceMiles:{type:Number,default:0,min:0},
  durationMinutes:{type:Number,default:0,min:0},
  pricing:{
    calculated:{type:Boolean,default:false},
    templateId:{type:mongoose.Schema.Types.ObjectId,ref:"SmartFormTemplate",default:null},
    serviceKey:{type:String,default:""},
    serviceName:{type:String,default:""},
    pricingMode:{type:String,default:""},
    amount:{type:Number,default:0,min:0},
    currency:{type:String,default:"USD"},
    calculatedAt:{type:Date,default:null}
  },
  importSource:{
    imported:{type:Boolean,default:false},
    fileName:{type:String,default:""},
    mimeType:{type:String,default:""},
    importedAt:{type:Date,default:null}
  },
  submittedBy:{type:String,default:""},
  submittedAt:{type:Date,default:null},
  reviewedBy:{type:String,default:""},
  reviewedAt:{type:Date,default:null},
  confirmedBy:{type:String,default:""},
  confirmedAt:{type:Date,default:null},
  generatedPdf:{
    fileName:{type:String,default:""},
    mimeType:{type:String,default:"application/pdf"},
    size:{type:Number,default:0},
    data:{type:Buffer,default:null,select:false},
    generatedAt:{type:Date,default:null}
  },
  notes:{type:String,default:""}
},{timestamps:true,minimize:false});

schema.index({tenantId:1,status:1,createdAt:-1});
schema.index({tenantId:1,tripNumber:1},{unique:true,partialFilterExpression:{tripNumber:{$type:"string",$gt:""}}});
schema.index({tenantId:1,organizationId:1,templateId:1,createdAt:-1});

module.exports = mongoose.models.SmartFormSubmission || mongoose.model("SmartFormSubmission",schema);
