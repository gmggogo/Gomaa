function get(obj,path){if(!path)return "";return String(path).split(".").reduce((v,k)=>v==null?undefined:v[k],obj);}
function clean(v){return v==null?"":v;}
function norm(v){return String(v||"").toLowerCase().replace(/[’']/g,"").replace(/[^a-z0-9]+/g," ").trim();}
function slotFromField(field){
 const text=`${field?.sectionLabel||""} ${field?.sectionId||""}`.toLowerCase();
 const m=text.match(/(?:trip[_\s-]*)?(\d+)(?:st|nd|rd|th)?(?:[_\s-]*trip)?/i);
 return m?Math.max(1,Number(m[1])||1):Math.max(1,Number(field?.occurrenceIndex)||1);
}
const DEFAULTS={
 companyName:"tenant.name",clientName:"trip.clientName",clientPhone:"trip.clientPhone",memberId:"trip.memberId",
 tripDate:"trip.tripDate",tripTime:"trip.tripTime",dropoffTime:"trip.completedAt",pickup:"trip.pickup",dropoff:"trip.dropoff",stops:"trip.stops",
 appointmentTime:"trip.appointmentTime",driverName:"trip.driverName",vehicle:"trip.vehicle",miles:"trip.miles",notes:"trip.notes",
 memberSignature:"signatures.member",driverSignature:"signatures.driver"
};
function inferFieldMapping(field){
 const label=norm(field?.label); const section=norm(field?.sectionLabel); const inTrip=/\btrip\b/.test(section); let semanticKey=String(field?.semanticKey||"").trim();
 let sourceScope="MANUAL",sourcePath="",repeatMode="NONE",repeatGroupId=String(field?.repeatGroupId||"").trim();
 const set=(key,scope,path,repeat)=>{semanticKey=key;sourceScope=scope;sourcePath=path||DEFAULTS[key]||"";repeatMode=repeat||"NONE";if(!repeatGroupId)repeatGroupId=key;};
 if(/^(member name|client name|passenger name|patient name)$/.test(label)) set("clientName","CLIENT",DEFAULTS.clientName,"SAME_VALUE");
 else if(/^(member phone|client phone|phone|phone number)$/.test(label)) set("clientPhone","CLIENT",DEFAULTS.clientPhone,"SAME_VALUE");
 else if(/^(ahcccs|ahcccs #|ahcccs number|member id|member #|member number)$/.test(label)) set("memberId","CLIENT",DEFAULTS.memberId,"SAME_VALUE");
 else if(/^(date|trip date|service date)$/.test(label) && !/driver/.test(section)) set("tripDate","CLIENT",DEFAULTS.tripDate,"SAME_VALUE");
 else if(/pick up location|pickup location|pick up address|pickup address/.test(label)) set("pickup","TRIP",DEFAULTS.pickup,"PER_SLOT");
 else if(/drop off location|dropoff location|drop off address|dropoff address/.test(label)) set("dropoff","TRIP",DEFAULTS.dropoff,"PER_SLOT");
 else if(/pick up time|pickup time/.test(label)) set("tripTime","TRIP",DEFAULTS.tripTime,"PER_SLOT");
 else if(/drop off time|dropoff time/.test(label)) set("dropoffTime","TRIP",DEFAULTS.dropoffTime,"PER_SLOT");
 else if(/appointment time/.test(label)) set("appointmentTime","TRIP",DEFAULTS.appointmentTime,"PER_SLOT");
 else if(/trip miles|mileage|miles/.test(label)) set("miles","TRIP",DEFAULTS.miles,"PER_SLOT");
 else if(/reason for visit/.test(label)) set("notes","TRIP",DEFAULTS.notes,"PER_SLOT");
 // Additional Information stays MANUAL by default so trip notes are not duplicated into two unrelated form fields.
 else if(/additional information/.test(label)) {}
 else if(/^(notes|note)$/.test(label)) set("notes",inTrip?"TRIP":"CLIENT",DEFAULTS.notes,inTrip?"PER_SLOT":"SAME_VALUE");
 else if(/driver.?s name|driver name/.test(label)) set("driverName","DRIVER",DEFAULTS.driverName,"SAME_VALUE");
 else if(/member signature|client signature|passenger signature|patient signature/.test(label)) set("memberSignature","SIGNATURE",DEFAULTS.memberSignature,"SAME_VALUE");
 else if(/driver signature/.test(label)) set("driverSignature","SIGNATURE",DEFAULTS.driverSignature,"SAME_VALUE");
 else if(/provider name|company name/.test(label)) set("companyName","GLOBAL",DEFAULTS.companyName,"SAME_VALUE");
 // Vehicle identifiers, DOB, provider ID, escort fields, odometers and yes/no questions stay MANUAL until a verified GH source exists.
 return {...field,semanticKey,sourceScope,sourcePath,repeatMode,repeatGroupId};
}
function applyAutoMappings(fields){return (fields||[]).map(f=>{if(f?.sourceScope&&f.sourceScope!=="MANUAL"&&f.sourcePath)return f;return inferFieldMapping(f);});}
function sourceFor(field,ctx){
 const path=field.sourcePath||DEFAULTS[field.semanticKey]||"";
 if(field.sourceScope==="MANUAL"&&!field.sourcePath)return "";
 const value=clean(get(ctx,path));
 if(!value)return "";
 if(field.semanticKey==="dropoffTime"&&path==="trip.completedAt"){const d=new Date(value);if(!Number.isNaN(d.getTime()))return d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});}
 if(field.semanticKey==="tripDate"){const d=new Date(value);if(!Number.isNaN(d.getTime()))return `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;}
 return value;
}
function buildValues(template,trips,tenant,signaturesByTrip={}){
 const values={}; const ordered=[...(trips||[])];
 for(const field of template.fields||[]){if(!field.enabled)continue;let trip=ordered[0]||{};
  if(field.repeatMode==="PER_SLOT"||field.sourceScope==="TRIP"){const idx=Math.max(0,slotFromField(field)-1);trip=ordered[idx]||{};}
  const sig=signaturesByTrip[String(trip?._id||"")]||{}; const ctx={tenant,trip,signatures:{member:sig.member||"",driver:sig.driver||""}}; values[field.fieldId]=sourceFor(field,ctx);
 }
 return values;
}
module.exports={buildValues,DEFAULTS,inferFieldMapping,applyAutoMappings,slotFromField};
