const mongoose = require("mongoose");

const DispatchAssignmentSchema = new mongoose.Schema({
  tripId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"Trip",
    required:true,
    unique:true,
    index:true
  },
  driverId:{
    type:mongoose.Schema.Types.ObjectId,
    ref:"User",
    default:null,
    index:true
  },
  driverName:{type:String,default:""},
  driverPhone:{type:String,default:""},
  vehicleNumber:{type:String,default:""},
  driverAddress:{type:String,default:""},
  services:{type:[String],default:[]},
  dispatchStatus:{
    type:String,
    enum:[
      "UNASSIGNED","ASSIGNED","SENT","ACCEPTED",
      "ON_TRIP","COMPLETED","CANCELLED"
    ],
    default:"UNASSIGNED",
    index:true
  },
  assignedBy:{type:String,default:""},
  assignmentType:{
    type:String,
    enum:["AUTO","MANUAL"],
    default:"MANUAL"
  },
  smartScore:{type:Number,default:null},
  smartReason:{type:String,default:""},
  smartDistance:{type:Number,default:null},
  note:{type:String,default:""},
  assignedAt:{type:Date,default:null},
  sentAt:{type:Date,default:null},
  acceptedAt:{type:Date,default:null},
  startedAt:{type:Date,default:null},
  completedAt:{type:Date,default:null}
},{
  timestamps:true
});

DispatchAssignmentSchema.index({
  driverId:1,
  dispatchStatus:1
});

module.exports =
  mongoose.models.DispatchAssignment ||
  mongoose.model("DispatchAssignment",DispatchAssignmentSchema);