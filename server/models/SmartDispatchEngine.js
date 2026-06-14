const mongoose = require("mongoose");

const SmartDispatchEngineSchema =
new mongoose.Schema({

  enabled:{
    type:Boolean,
    default:true
  },

  strategy:{
    type:String,
    default:"SMART"
  },

  requireActiveDriver:{
    type:Boolean,
    default:true
  },

  requireScheduleMatch:{
    type:Boolean,
    default:true
  },

  requireServiceMatch:{
    type:Boolean,
    default:true
  },

  maxPickupDistanceMiles:{
    type:Number,
    default:50
  },

  maxDeadheadMiles:{
    type:Number,
    default:25
  },

  useGoogleDistance:{
    type:Boolean,
    default:true
  },

  topDriversToCheck:{
    type:Number,
    default:3
  },

  minBufferMinutes:{
    type:Number,
    default:30
  },

  maxTripsPerDriver:{
    type:Number,
    default:20
  },

  enableTimeConflict:{
    type:Boolean,
    default:true
  },

  enableFairDistribution:{
    type:Boolean,
    default:true
  },

  maxDriverLoadPercent:{
    type:Number,
    default:80
  },

  autoAssignNewTrips:{
    type:Boolean,
    default:false
  },

  autoReassignUnassigned:{
    type:Boolean,
    default:true
  },

  autoAssignSharedTrips:{
    type:Boolean,
    default:true
  },

  distanceWeight:{
    type:Number,
    default:40
  },

  travelTimeWeight:{
    type:Number,
    default:30
  },

  loadWeight:{
    type:Number,
    default:20
  },

  conflictWeight:{
    type:Number,
    default:10
  }

},{
  timestamps:true
});

module.exports =
mongoose.model(
  "SmartDispatchEngine",
  SmartDispatchEngineSchema
);