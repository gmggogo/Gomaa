const mongoose = require("mongoose");

const { Schema } = mongoose;

const FIELD_TYPES = [
  "TEXT",
  "NUMBER",
  "YES_NO",
  "DROPDOWN",
  "DATE",
  "TIME",
  "PHONE",
  "EMAIL",
  "LONG_TEXT"
];

const sourceMatrixSchema = new Schema(
  {
    getQuote:{
      showField:{ type:Boolean, default:false },
      required:{ type:Boolean, default:false }
    },

    facility:{
      showField:{ type:Boolean, default:false },
      showColumn:{ type:Boolean, default:false },
      showEye:{ type:Boolean, default:false },
      required:{ type:Boolean, default:false }
    },

    reserved:{
      showField:{ type:Boolean, default:false },
      showColumn:{ type:Boolean, default:false },
      showEye:{ type:Boolean, default:false },
      required:{ type:Boolean, default:false }
    },

    broker:{
      showColumn:{ type:Boolean, default:false },
      showEye:{ type:Boolean, default:false }
    }
  },
  { _id:false }
);

const standardFieldSchema = new Schema(
  {
    key:{
      type:String,
      required:true,
      trim:true
    },

    matrix:{
      type:sourceMatrixSchema,
      default:()=>({})
    }
  },
  { _id:false }
);

const customFieldSchema = new Schema(
  {
    slot:{
      type:Number,
      required:true,
      min:1,
      max:10
    },

    label:{
      type:String,
      default:"",
      trim:true,
      maxlength:80
    },

    fieldType:{
      type:String,
      enum:FIELD_TYPES,
      default:"TEXT",
      uppercase:true,
      trim:true
    },

    options:{
      type:[String],
      default:[]
    },

    placeholder:{
      type:String,
      default:"",
      trim:true,
      maxlength:120
    },

    matrix:{
      type:sourceMatrixSchema,
      default:()=>({})
    }
  },
  { _id:false }
);

const bookingDataConfigSchema = new Schema(
  {
    tenantId:{
      type:Schema.Types.ObjectId,
      ref:"Tenant",
      required:true,
      unique:true,
      index:true
    },

    standardFields:{
      type:[standardFieldSchema],
      default:[]
    },

    customFields:{
      type:[customFieldSchema],
      default:[]
    },

    updatedBy:{
      type:Schema.Types.ObjectId,
      ref:"User",
      default:null
    }
  },
  { timestamps:true }
);

bookingDataConfigSchema.index(
  { tenantId:1 },
  { unique:true }
);

module.exports =
  mongoose.models.BookingDataConfig ||
  mongoose.model(
    "BookingDataConfig",
    bookingDataConfigSchema
  );
