const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  tenantId:{ type:mongoose.Schema.Types.ObjectId, ref:"Tenant", required:true, index:true },
  name:{ type:String, required:true, trim:true },
  code:{ type:String, default:"", trim:true, uppercase:true },
  type:{ type:String, enum:["BROKER","INSURANCE","FACILITY","COMPANY","OTHER"], default:"OTHER" },
  active:{ type:Boolean, default:true, index:true },
  createdByPlatformAdmin:{ type:Boolean, default:true },
  createdBy:{ type:String, default:"" },
  updatedBy:{ type:String, default:"" }
},{timestamps:true});

schema.index({tenantId:1,name:1},{unique:true});
schema.index({tenantId:1,active:1,name:1});

module.exports = mongoose.models.SmartFormOrganization || mongoose.model("SmartFormOrganization",schema);
