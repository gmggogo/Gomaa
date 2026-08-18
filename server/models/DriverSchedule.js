const mongoose = require("mongoose");

const driverScheduleSchema = new mongoose.Schema({

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

  phone:{ type:String, default:"" },
  address:{ type:String, default:"" },
  lat:{ type:Number, default:null },
  lng:{ type:Number, default:null },
  vehicleNumber:{ type:String, default:"" },
  enabled:{ type:Boolean, default:true },

  days:{
    type:Object,
    default:{
      sun:false, mon:false, tue:false, wed:false,
      thu:false, fri:false, sat:false
    }
  },

  services:{
    type:[String],
    default:["ALL"]
  }

},{
  timestamps:true,
  minimize:false
});

driverScheduleSchema.index(
  { tenantId:1, driverId:1 },
  { unique:true, name:"tenant_driver_schedule_unique" }
);

module.exports =
  mongoose.models.DriverSchedule ||
  mongoose.model("DriverSchedule", driverScheduleSchema);