function clean(v){return String(v??"").trim();}
function mime(file){return clean(file?.mimetype)||"application/octet-stream";}
function responseText(payload){return clean(payload?.candidates?.[0]?.content?.parts?.map(p=>p?.text||"").join("\n"));}
function parseJson(text){
 const raw=clean(text).replace(/^\uFEFF/,"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
 const a=raw.indexOf("{"),b=raw.lastIndexOf("}");
 if(a<0||b<a)throw new Error("AI returned invalid form analysis");
 let s=raw.slice(a,b+1);
 try{return JSON.parse(s);}catch(firstErr){}
 // Repair only common Gemini JSON formatting defects; never invent field data.
 s=s
   .replace(/,\s*([}\]])/g,"$1")
   .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g,'$1"$2"$3')
   .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g,(_,v)=>':'+JSON.stringify(v))
   .replace(/,\s*,+/g,",");
 try{return JSON.parse(s);}catch(secondErr){
   const e=new Error(`AI returned malformed JSON: ${secondErr.message}`);
   e.code="SMART_FORM_AI_JSON_INVALID";
   throw e;
 }
}
function normalizeField(f,i){const box=f?.bbox||{};return {fieldId:clean(f?.fieldId)||`field_${i+1}`,label:clean(f?.label)||`Field ${i+1}`,semanticKey:clean(f?.semanticKey),fieldType:["TEXT","PHONE","DATE","TIME","NUMBER","ADDRESS","CHECKBOX","SIGNATURE","OTHER"].includes(clean(f?.fieldType).toUpperCase())?clean(f.fieldType).toUpperCase():"TEXT",page:Math.max(1,Number(f?.page)||1),sectionId:clean(f?.sectionId),sectionLabel:clean(f?.sectionLabel),occurrenceIndex:Math.max(1,Number(f?.occurrenceIndex)||1),layoutOrder:Math.max(0,Number(f?.layoutOrder)||i),bbox:{x:Number(box.x)||0,y:Number(box.y)||0,width:Number(box.width)||0,height:Number(box.height)||0},enabled:true,sourceScope:"MANUAL",sourcePath:"",repeatGroupId:clean(f?.repeatGroupId),repeatMode:"NONE",required:false,manualAllowed:true};}
async function analyzeBlankForm(file){
 const apiKey=clean(process.env.GEMINI_API_KEY);if(!apiKey)throw new Error("GEMINI_API_KEY is not configured");
 const model=clean(process.env.SMART_FORM_GEMINI_MODEL)||clean(process.env.ATTACHMENT_GEMINI_MODEL)||"gemini-3.5-flash-lite";
 const prompt=`Analyze this BLANK form as a reusable editable document template. Return JSON only.
Detect EVERY physical place where a user is expected to ENTER, CHECK, SELECT, DATE, TIME, NUMBER, ADDRESS or SIGN.
IMPORTANT: bbox MUST describe ONLY THE WRITABLE/CLICKABLE CONTROL AREA, NOT the printed label beside or above it.
For an underline, bbox covers the blank writing area on/above the line. For an empty rectangle, bbox is the inside fillable rectangle. For a checkbox/radio option, bbox is ONLY the visible empty square/circle itself, not the option text.
Never merge repeated controls. Detect every occurrence independently. Printed option boxes such as Taxi, Bus, Wheelchair, Yes/No are CHECKBOX.
Coordinates normalized 0..1 relative to each page, origin top-left. Preserve page and visual order. Do not invent controls.
JSON: {"pageCount":1,"sections":[{"sectionId":"trip_1","label":"Trip 1","page":1}],"fields":[{"fieldId":"pickup_trip_1","label":"Pickup Location","semanticKey":"pickup","fieldType":"ADDRESS","page":1,"sectionId":"trip_1","sectionLabel":"Trip 1","occurrenceIndex":1,"layoutOrder":0,"bbox":{"x":0.1,"y":0.2,"width":0.3,"height":0.04},"repeatGroupId":"pickup"}]}.
fieldType must be TEXT, PHONE, DATE, TIME, NUMBER, ADDRESS, CHECKBOX, SIGNATURE or OTHER. semanticKey may suggest companyName, companyPhone, providerId, clientName, clientPhone, memberId, tripDate, tripTime, pickup, dropoff, stops, appointmentTime, driverName, vehicle, miles, notes, memberSignature, driverSignature, or blank if uncertain.`;
 const body={contents:[{role:"user",parts:[{text:prompt},{inlineData:{mimeType:mime(file),data:file.buffer.toString("base64")}}]}],generationConfig:{temperature:0,responseMimeType:"application/json"}};
 const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
 async function requestAnalysis(requestBody){
  const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(requestBody)});
  const p=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(clean(p?.error?.message)||`Gemini analysis failed (${r.status})`);
  return p;
 }
 let p=await requestAnalysis(body),parsed;
 try{parsed=parseJson(responseText(p));}
 catch(err){
  if(err.code!=="SMART_FORM_AI_JSON_INVALID")throw err;
  const retryBody=JSON.parse(JSON.stringify(body));
  retryBody.contents[0].parts[0].text += "\nCRITICAL: Your previous response was malformed. Return one complete valid JSON object only. Use double quotes for every key/string, no comments, no markdown, no trailing commas.";
  p=await requestAnalysis(retryBody);
  parsed=parseJson(responseText(p));
 }
 const fields=(Array.isArray(parsed.fields)?parsed.fields:[]).map(normalizeField);
 if(!fields.length)throw new Error("No fillable fields were detected");
 return {pageCount:Math.max(1,Number(parsed.pageCount)||1),sections:Array.isArray(parsed.sections)?parsed.sections:[],fields,analysisProvider:`GEMINI:${model}`};
}
module.exports={analyzeBlankForm};
