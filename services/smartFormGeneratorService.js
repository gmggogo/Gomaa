const SmartFormDocument=require("../models/SmartFormDocument");
const TripSignature=require("../models/TripSignature");
const mapping=require("./smartFormMappingService");
const builder=require("./smartFormBuilderService");
function key(v){return String(v||"").trim().toLowerCase();}
async function generate({tenant,template,trips,userName=""}){
 if(!trips?.length) throw new Error("At least one completed trip is required");
 const signatures=await TripSignature.find({tenantId:tenant._id,tripId:{$in:trips.map(t=>t._id)}}).lean(); const byTrip={}; for(const s of signatures){byTrip[String(s.tripId)]={member:s.signatureData?`signature:${s._id}`:"",driver:s.driverName||""};}
 const values=mapping.buildValues(template,trips,tenant,byTrip); let file=null; try{file=await builder.buildPdf(template,values,{});}catch(err){if(err.code!=="PDF_LIB_MISSING") throw err;}
 const first=trips[0]; return SmartFormDocument.create({tenantId:tenant._id,organizationId:template.organizationId,organizationName:template.organizationName,templateId:template._id,templateVersion:template.version,serviceDate:first.tripDate||"",clientKey:key(first.memberId||first.clientName||first.clientPhone),clientName:first.clientName||"",tripIds:trips.map(t=>t._id),slotAssignments:trips.map((t,i)=>({tripId:t._id,slot:i+1})),values,generatedFile:{mimeType:"application/pdf",data:file,generatedAt:file?new Date():null},status:"REVIEW"});
}
module.exports={generate};
