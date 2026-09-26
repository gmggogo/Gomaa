const mongoose = require("mongoose");

const sourceFileSchema = new mongoose.Schema(
  {
    originalName:{ type:String, default:"" },
    mimeType:{ type:String, default:"" },
    size:{ type:Number, default:0 },
    page:{ type:Number, default:1 },
    side:{ type:String, enum:["FRONT","BACK","PAGE"], default:"PAGE" },
    data:{ type:Buffer, default:null }
  },
  { _id:true }
);

const reviewRowSchema = new mongoose.Schema(
  {
    rowIndex:{ type:Number, required:true },
    data:{ type:mongoose.Schema.Types.Mixed, default:{} },
    rawData:{ type:mongoose.Schema.Types.Mixed, default:{} },
    serviceKey:{ type:String, default:"", trim:true, uppercase:true },
    serviceName:{ type:String, default:"", trim:true },
    serviceResolution:{
      type:String,
      enum:["AUTO","MANUAL","UNRESOLVED"],
      default:"UNRESOLVED"
    },
    validationErrors:{ type:[String], default:[] },
    confirmed:{ type:Boolean, default:false },
    tripId:{ type:mongoose.Schema.Types.ObjectId, ref:"Trip", default:null },
    tripNumber:{ type:String, default:"" }
  },
  { _id:true, minimize:false }
);

const archiveEntrySchema = new mongoose.Schema(
  {
    tripId:{ type:mongoose.Schema.Types.ObjectId, ref:"Trip", required:true },
    tripNumber:{ type:String, default:"" },
    rowIndex:{ type:Number, default:0 },
    signedAt:{ type:Date, default:null },
    completedAt:{ type:Date, default:null },
    archivedAt:{ type:Date, default:Date.now },
    documentType:{ type:String, default:"HTML" },
    finalDocumentHtml:{ type:String, default:"" },
    finalDocumentData:{ type:Buffer, default:null },
    finalDocumentMimeType:{ type:String, default:"text/html" }
  },
  { _id:true }
);

const attachmentImportSchema = new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },
    tenantSlug:{ type:String, default:"", trim:true, lowercase:true },
    templateId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"AttachmentTemplate",
      required:true,
      index:true
    },
    templateName:{ type:String, default:"" },
    sourceType:{
      type:String,
      enum:["CSV","XLSX","IMAGE","PDF","MIXED"],
      required:true
    },
    sourceFiles:{ type:[sourceFileSchema], default:[] },
    reviewRows:{ type:[reviewRowSchema], default:[] },
    status:{
      type:String,
      enum:["UPLOADED","REVIEW","CONFIRMED","PARTIAL","ARCHIVED"],
      default:"UPLOADED",
      index:true
    },
    createdBy:{ type:String, default:"" },
    confirmedAt:{ type:Date, default:null },
    archiveEntries:{ type:[archiveEntrySchema], default:[] },
    archivedAt:{ type:Date, default:null }
  },
  { timestamps:true, minimize:false }
);

attachmentImportSchema.index({ tenantId:1, createdAt:-1 });
attachmentImportSchema.index({ tenantId:1, status:1, updatedAt:-1 });
attachmentImportSchema.index({ tenantId:1, "archiveEntries.tripId":1 });

module.exports =
  mongoose.models.AttachmentImport ||
  mongoose.model("AttachmentImport", attachmentImportSchema);
