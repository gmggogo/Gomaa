const mongoose = require("mongoose");

const driverScheduleSchema = new mongoose.Schema({

  driverId:{
    type:String,
    required:true,
    unique:true
  },

  phone:{
    type:String,
    default:""
  },

  address:{
    type:String,
    default:""
  },

  lat:{
    type:Number,
    default:null
  },

  lng:{
    type:Number,
    default:null
  },

  vehicleNumber:{
    type:String,
    default:""
  },

  enabled:{
    type:Boolean,
    default:true
  },

  /* =========================
     WEEKLY SCHEDULE
  ========================= */

  weekly:{
    type:Object,
    default:{
      sun:false,
      mon:false,
      tue:false,
      wed:false,
      thu:false,
      fri:false,
      sat:false
    }
  },

  /* =========================
     DRIVER SERVICES
  ========================= */

  services:{
    type:[String],
    default:["ALL"]
  }

},{
  timestamps:true,
  minimize:false
});

module.exports =
mongoose.model(
  "DriverSchedule",
  driverScheduleSchema
);