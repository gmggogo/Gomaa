/*
ADD INSIDE THE CURRENT Trip schema in server.js / index.js.

Do NOT replace existing fields.
These are additive and backward-compatible.
*/

const bookingFieldSnapshotSchema =
  new mongoose.Schema(
    {
      source:{
        type:String,
        default:"MANUAL"
      },

      key:{
        type:String,
        default:""
      },

      slot:{
        type:Number,
        default:null
      },

      label:{
        type:String,
        default:""
      },

      fieldType:{
        type:String,
        default:"TEXT"
      },

      required:{
        type:Boolean,
        default:false
      },

      value:{
        type:mongoose.Schema.Types.Mixed,
        default:""
      },

      aliases:{
        type:[String],
        default:[]
      }
    },
    {
      _id:false,
      minimize:false
    }
  );

/*
Then add these properties inside tripSchema:
*/

dynamicBookingData:{
  type:[bookingFieldSnapshotSchema],
  default:[]
},

/*
Backward-compatible name already used by Get Quote.
Keep it so old/new pages can read the same snapshot.
*/
customBookingData:{
  type:[bookingFieldSnapshotSchema],
  default:[]
},

/*
Temporary compatibility with the Reserved page while every surface
is migrated to dynamicBookingData.
*/
reservedBookingData:{
  type:mongoose.Schema.Types.Mixed,
  default:{}
},

bookingData:{
  type:mongoose.Schema.Types.Mixed,
  default:{}
},

/*
Raw broker fields that did not match any known key/alias.
Nothing from an external broker is silently discarded.
*/
unmappedExternalFields:{
  type:mongoose.Schema.Types.Mixed,
  default:{}
},

/*
Known canonical broker/manual fields.
If any of these already exist in your schema, DO NOT duplicate them.
*/
appointmentTime:{
  type:String,
  default:""
},

returnTime:{
  type:String,
  default:""
},

memberId:{
  type:String,
  default:""
},

brokerName:{
  type:String,
  default:""
},

brokerCode:{
  type:String,
  default:""
},

brokerTripId:{
  type:String,
  default:""
},

externalSource:{
  type:String,
  default:""
},

brokerNotes:{
  type:String,
  default:""
},
