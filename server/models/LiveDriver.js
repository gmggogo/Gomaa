const mongoose = require("mongoose");

const liveDriverSchema = new mongoose.Schema({

  tenantId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Tenant",
    required:true,
    index:true
  },

  driverId:{
    type:String,
    required:true,
    trim:true
  },

  name:{ type:String, default:"" },
  phone:{ type:String, default:"" },
  vehicleNumber:{ type:String, default:"" },
  tripId:{ type:String, default:"" },
  routeMode:{ type:String, default:"" },
  lat:{ type:Number, required:true },
  lng:{ type:Number, required:true },
  online:{ type:Boolean, default:true },
  lastSeen:{ type:Date, default:Date.now, index:true }

},{ timestamps:true });

liveDriverSchema.index(
  { tenantId:1, driverId:1 },
  { unique:true, name:"tenant_live_driver_unique" }
);

liveDriverSchema.index(
  { lastSeen:1 },
  { expireAfterSeconds:3600 }
);

module.exports =
  mongoose.models.LiveDriver ||
  mongoose.model("LiveDriver", liveDriverSchema);