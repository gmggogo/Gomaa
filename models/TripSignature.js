const mongoose = require("mongoose");

const tripSignatureSchema = new mongoose.Schema(
  {
    tenantId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      index:true
    },
    tripId:{
      type:mongoose.Schema.Types.ObjectId,
      ref:"Trip",
      required:true,
      unique:true,
      index:true
    },
    tripNumber:{ type:String, default:"", index:true },
    signerName:{ type:String, default:"", trim:true },
    signatureData:{ type:Buffer, required:true },
    signatureMimeType:{ type:String, default:"image/png" },
    signedAt:{ type:Date, default:Date.now },
    driverId:{ type:String, default:"" },
    driverName:{ type:String, default:"" },
    serviceKey:{ type:String, default:"", uppercase:true },
    source:{ type:String, default:"DRIVER_APP" }
  },
  { timestamps:true }
);

tripSignatureSchema.index({ tenantId:1, signedAt:-1 });

module.exports =
  mongoose.models.TripSignature ||
  mongoose.model("TripSignature", tripSignatureSchema);
