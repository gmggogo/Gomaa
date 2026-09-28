function clean(v){return String(v??"").trim();}
function mime(file){return clean(file?.mimetype)||"application/octet-stream";}
function responseText(payload){return clean(payload?.candidates?.[0]?.content?.parts?.map(p=>p?.text||"").join("\n"));}
function parseJson(text){const s=clean(text).replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();const a=s.indexOf("{");const b=s.lastIndexOf("}");if(a<0||b<a) throw new Error("AI returned invalid form analysis");return JSON.parse(s.slice(a,b+1));}
function normalizeField(f,i){
 const box=f?.bbox||{};
 return {fieldId:clean(f?.fieldId)||`field_${i+1}`,label:clean(f?.label)||`Field ${i+1}`,semanticKey:clean(f?.semanticKey),fieldType:["TEXT","PHONE","DATE","TIME","NUMBER","ADDRESS","CHECKBOX","SIGNATURE","OTHER"].includes(clean(f?.fieldType).toUpperCase())?clean(f.fieldType).toUpperCase():"TEXT",page:Math.max(1,Number(f?.page)||1),sectionId:clean(f?.sectionId),sectionLabel:clean(f?.sectionLabel),occurrenceIndex:Math.max(1,Number(f?.occurrenceIndex)||1),layoutOrder:Math.max(0,Number(f?.layoutOrder)||i),bbox:{x:Number(box.x)||0,y:Number(box.y)||0,width:Number(box.width)||0,height:Number(box.height)||0},enabled:true,sourceScope:"MANUAL",sourcePath:"",repeatGroupId:clean(f?.repeatGroupId),repeatMode:"NONE",required:false,manualAllowed:true};
}
async function analyzeBlankForm(file){
 const apiKey=clean(process.env.GEMINI_API_KEY); if(!apiKey) throw new Error("GEMINI_API_KEY is not configured");
 const model=clean(process.env.SMART_FORM_GEMINI_MODEL)||clean(process.env.ATTACHMENT_GEMINI_MODEL)||"gemini-3.5-flash-lite";
 const prompt=`Analyze this BLANK transportation/insurance form once as a layout template. Return JSON only. Detect EVERY physical fillable occurrence, including repeated labels, signature boxes, and checkbox/radio choices. Never merge repeated fields. Any printed option that has a visible empty square/box/circle next to it (for example Taxi, Bus, Wheelchair Van, Yes/No) MUST be fieldType CHECKBOX, not TEXT. Preserve the exact visual reading order from the original form: top-to-bottom, then left-to-right within the same row. Give every field a zero-based layoutOrder in that exact order. Coordinates must be normalized 0..1 relative to each page, origin top-left. Detect natural sections such as Trip 1, Trip 2 only when the form visibly has them. JSON shape: {"pageCount":1,"sections":[{"sectionId":"trip_1","label":"Trip 1","page":1}],"fields":[{"fieldId":"pickup_trip_1","label":"Pickup Location","semanticKey":"pickup","fieldType":"ADDRESS","page":1,"sectionId":"trip_1","sectionLabel":"Trip 1","occurrenceIndex":1,"layoutOrder":0,"bbox":{"x":0.1,"y":0.2,"width":0.3,"height":0.04},"repeatGroupId":"pickup"}]}. semanticKey may suggest companyName, companyPhone, providerId, clientName, clientPhone, memberId, tripDate, tripTime, pickup, dropoff, stops, appointmentTime, driverName, vehicle, miles, notes, memberSignature, driverSignature, or blank if uncertain. Do not invent fields not physically present.`;
 const body={contents:[{role:"user",parts:[{text:prompt},{inlineData:{mimeType:mime(file),data:file.buffer.toString("base64")}}]}],generationConfig:{temperature:0,responseMimeType:"application/json"}};
 const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
 const r=await fetch(url,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); const p=await r.json().catch(()=>({})); if(!r.ok) throw new Error(clean(p?.error?.message)||`Gemini analysis failed (${r.status})`);
 const parsed=parseJson(responseText(p)); const fields=(Array.isArray(parsed.fields)?parsed.fields:[]).map(normalizeField);
 if(!fields.length) throw new Error("No fillable fields were detected");
 return {pageCount:Math.max(1,Number(parsed.pageCount)||1),sections:Array.isArray(parsed.sections)?parsed.sections:[],fields,analysisProvider:`GEMINI:${model}`};
}
module.exports={analyzeBlankForm};
