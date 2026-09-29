const mongoose = require("mongoose");

const mappingSchema = new mongoose.Schema({
  mapped:{type:Boolean,default:false},
  page:{type:Number,default:1,min:1},
  xPercent:{type:Number,default:0,min:0,max:100},
  yPercent:{type:Number,default:0,min:0,max:100},
  widthPercent:{type:Number,default:20,min:.1,max:100},
  heightPercent:{type:Number,default:4,min:.1,max:100},
  fontSize:{type:Number,default:10,min:5,max:48},
  textAlign:{type:String,enum:["LEFT","CENTER","RIGHT"],default:"LEFT"}
},{_id:false});

const fieldSchema = new mongoose.Schema({
  key:{type:String,required:true,trim:true},
  label:{type:String,required:true,trim:true},
  type:{
    type:String,
    enum:["TEXT","NUMBER","PHONE","ADDRESS","DATE","TIME","SELECT","RADIO","CHECKBOX","TEXTAREA","SIGNATURE"],
    default:"TEXT"
  },
  required:{type:Boolean,default:false},
  placeholder:{type:String,default:""},
  options:{type:[String],default:[]},
  widthPercent:{type:Number,default:50,min:20,max:100},
  order:{type:Number,default:0},
  tripBinding:{type:String,default:""},
  mapping:{type:mappingSchema,default:()=>({})}
},{_id:true,minimize:false});

const schema = new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,index:true},
  organizationId:{type:mongoose.Schema.Types.ObjectId,ref:"SmartFormOrganization",required:true,index:true},
  name:{type:String,required:true,trim:true},
  description:{type:String,default:"",trim:true},
  active:{type:Boolean,default:true,index:true},
  fields:{type:[fieldSchema],default:[]},
  originalPdf:{
    fileName:{type:String,default:""},
    mimeType:{type:String,default:"application/pdf"},
    size:{type:Number,default:0},
    pageCount:{type:Number,default:0},
    data:{type:Buffer,default:null,select:false},
    uploadedAt:{type:Date,default:null}
  },
  createdBy:{type:String,default:""},
  updatedBy:{type:String,default:""}
},{timestamps:true,minimize:false});

schema.index({tenantId:1,organizationId:1,name:1},{unique:true});
schema.index({tenantId:1,organizationId:1,active:1,updatedAt:-1});

module.exports = mongoose.models.SmartFormTemplate || mongoose.model("SmartFormTemplate",schema);
