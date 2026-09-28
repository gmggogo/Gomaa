function get(obj,path){if(!path)return "";return String(path).split(".").reduce((v,k)=>v==null?undefined:v[k],obj);}
function clean(v){return v==null?"":v;}
const DEFAULTS={companyName:"tenant.branding.companyName",clientName:"trip.clientName",clientPhone:"trip.clientPhone",memberId:"trip.memberId",tripDate:"trip.tripDate",tripTime:"trip.tripTime",pickup:"trip.pickup",dropoff:"trip.dropoff",stops:"trip.stops",appointmentTime:"trip.appointmentTime",driverName:"trip.driverName",vehicle:"trip.vehicle",miles:"trip.miles",notes:"trip.notes",memberSignature:"signatures.member",driverSignature:"signatures.driver"};
function sourceFor(field,ctx){const path=field.sourcePath||DEFAULTS[field.semanticKey]||"";if(field.sourceScope==="MANUAL"&&!field.sourcePath)return "";return clean(get(ctx,path));}
function buildValues(template,trips,tenant,signaturesByTrip={}){
 const values={}; const ordered=[...(trips||[])];
 for(const field of template.fields||[]){if(!field.enabled)continue;let trip=ordered[0]||{};if(field.repeatMode==="PER_SLOT"||field.sourceScope==="TRIP"){const idx=Math.max(0,(Number(field.occurrenceIndex)||1)-1);trip=ordered[idx]||{};}
  const sig=signaturesByTrip[String(trip?._id||"")]||{}; const ctx={tenant,trip,signatures:{member:sig.member||"",driver:sig.driver||""}}; values[field.fieldId]=sourceFor(field,ctx);
 }
 return values;
}
module.exports={buildValues,DEFAULTS};
