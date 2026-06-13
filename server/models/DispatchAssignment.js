const mongoose = require("mongoose");

const DispatchAssignmentSchema = new mongoose.Schema({

  tripId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Trip",
    required:true,
    unique:true
  },

  driverId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User",
    default:null
  },

  driverName:{
    type:String,
    default:""
  },

  vehicleNumber:{
    type:String,
    default:""
  },

  driverAddress:{
    type:String,
    default:""
  },

  dispatchStatus:{
    type:String,
    enum:[
      "UNASSIGNED",
      "ASSIGNED",
      "SENT",
      "ACCEPTED",
      "ON_TRIP",
      "COMPLETED"
    ],
    default:"UNASSIGNED"
  },

  note:{
    type:String,
    default:""
  }

},{
  timestamps:true
});

module.exports =
mongoose.model(
  "DispatchAssignment",
  DispatchAssignmentSchema
);