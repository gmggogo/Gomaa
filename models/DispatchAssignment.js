const mongoose = require("mongoose");

const dispatchAssignmentSchema = new mongoose.Schema({

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

  services:{type:[String],default:["ALL"]},

  dispatchStatus:{
    type:String,
    enum:[
      "UNASSIGNED",
      "ASSIGNED",
      "SENT",
      "ACCEPTED",
      "ON_TRIP",
      "COMPLETED",
      "CANCELLED",
      "NOSHOW"
    ],
    default:"UNASSIGNED",
    index:true
  },

  assignmentType:{
    type:String,
    enum:["MANUAL","AUTO"],
    default:"MANUAL"
  },

  assignedBy:{type:String,default:""},
  note:{type:String,default:""},

  smartScore:{type:Number,default:null},
  smartReason:{type:String,default:""},
  smartDistance:{type:Number,default:null},

  assignedAt:{type:Date,default:null},
  sentAt:{type:Date,default:null},
  acceptedAt:{type:Date,default:null},
  startedAt:{type:Date,default:null},
  completedAt:{type:Date,default:null}

},{
  timestamps:true,
  minimize:false
});

/* tripId is globally unique because each Trip ObjectId is globally unique. */
dispatchAssignmentSchema.index(
  {tenantId:1,driverId:1,dispatchStatus:1}
);

module.exports =
  mongoose.models.DispatchAssignment ||
  mongoose.model(
    "DispatchAssignment",
    dispatchAssignmentSchema
  );