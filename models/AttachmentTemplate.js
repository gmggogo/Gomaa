const mongoose = require("mongoose");

const templateFieldSchema = new mongoose.Schema(
  {
    label:{ type:String, required:true, trim:true },
    internalKey:{ type:String, required:true, trim:true },
    type:{
      type:String,
      enum:["TEXT","PHONE","DATE","TIME","NUMBER","ADDRESS","SERVICE","NOTES"],
      default:"TEXT"
    },
    required:{ type:Boolean, default:false },
    visibleInReview:{ type:Boolean, default:true },
    aliases:{ type:[String], default:[] },
    order:{ type:Number, default:0 }
  },
  { _id:false }
);

const signaturePositionSchema = new mongoose.Schema(
  {
    page:{ type:Number, default:1, min:1 },
    xPercent:{ type:Number, default:62, min:0, max:100 },
    yPercent:{ type:Number, default:78, min:0, max:100 },
    widthPercent:{ type:Number, default:28, min:5, max:100 },
    heightPercent:{ type:Number, default:12, min:3, max:100 }
  },
  { _id:false }
);

const attachmentTemplateSchema = new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },
    name:{ type:String, required:true, trim:true },
    organizationType:{
      type:String,
      enum:["INSURANCE","BROKER","COMPANY","OTHER"],
      default:"INSURANCE"
    },
    organizationName:{ type:String, default:"", trim:true },
    sourceTypes:{
      type:[String],
      default:["CSV","XLSX","IMAGE","PDF"]
    },
    active:{ type:Boolean, default:true },
    fields:{ type:[templateFieldSchema], default:[] },
    signaturePosition:{
      type:signaturePositionSchema,
      default:()=>({})
    },
    createdBy:{ type:String, default:"", trim:true },
    updatedBy:{ type:String, default:"", trim:true }
  },
  { timestamps:true, minimize:false }
);

attachmentTemplateSchema.index({ tenantId:1, name:1 }, { unique:true });
attachmentTemplateSchema.index({ tenantId:1, active:1, updatedAt:-1 });

module.exports =
  mongoose.models.AttachmentTemplate ||
  mongoose.model("AttachmentTemplate", attachmentTemplateSchema);
