const mongoose=require("mongoose");
const schema=new mongoose.Schema({tenantId:{type:mongoose.Schema.Types.ObjectId,ref:"Tenant",required:true,unique:true,index:true},nextTripSequence:{type:Number,default:100,min:100},nextSheetSequence:{type:Number,default:1,min:1}},{timestamps:true});
module.exports=mongoose.models.SmartFormCounter||mongoose.model("SmartFormCounter",schema);
