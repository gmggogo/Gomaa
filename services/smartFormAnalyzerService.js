function clean(v){return String(v??"").trim();}
function mime(file){return clean(file?.mimetype)||"application/octet-stream";}
function responseText(payload){return clean(payload?.candidates?.[0]?.content?.parts?.map(p=>p?.text||"").join("\n"));}
function parseJson(text){
  const raw=clean(text).replace(/^\uFEFF/,"").replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"").trim();
  const a=raw.indexOf("{"),b=raw.lastIndexOf("}");
  if(a<0||b<a)throw new Error("AI returned invalid form analysis");
  let s=raw.slice(a,b+1);
  try{return JSON.parse(s);}catch(_){}
  s=s.replace(/,\s*([}\]])/g,"$1")
     .replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*:)/g,'$1"$2"$3')
     .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g,(_,v)=>':'+JSON.stringify(v))
     .replace(/,\s*,+/g,",");
  try{return JSON.parse(s);}catch(err){
    const e=new Error(`AI returned malformed JSON: ${err.message}`);
    e.code="SMART_FORM_AI_JSON_INVALID";
    throw e;
  }
}
function clamp(n,min=0,max=1){n=Number(n);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):0;}
function box(v){
  v=v||{};
  return {x:clamp(v.x),y:clamp(v.y),width:clamp(v.width),height:clamp(v.height)};
}
function normalizeField(f,i){
  const type=clean(f?.fieldType).toUpperCase();
  return {
    fieldId:clean(f?.fieldId)||`field_${i+1}`,
    label:clean(f?.label)||`Field ${i+1}`,
    semanticKey:clean(f?.semanticKey),
    fieldType:["TEXT","PHONE","DATE","TIME","NUMBER","ADDRESS","CHECKBOX","SIGNATURE","OTHER"].includes(type)?type:"TEXT",
    page:Math.max(1,Number(f?.page)||1),
    sectionId:clean(f?.sectionId),
    sectionLabel:clean(f?.sectionLabel),
    occurrenceIndex:Math.max(1,Number(f?.occurrenceIndex)||1),
    layoutOrder:Math.max(0,Number(f?.layoutOrder)||i),
    bbox:box(f?.bbox),
    enabled:true,sourceScope:"MANUAL",sourcePath:"",
    repeatGroupId:clean(f?.repeatGroupId),repeatMode:"NONE",
    required:false,manualAllowed:true
  };
}
function normalizeElement(e,i){
  const type=clean(e?.type).toUpperCase();
  const style=e?.style||{};
  return {
    elementId:clean(e?.elementId)||`element_${i+1}`,
    type:["TEXT","LINE","RECT","CHECKBOX","CIRCLE","IMAGE_PLACEHOLDER","INPUT","SIGNATURE_LINE"].includes(type)?type:"TEXT",
    page:Math.max(1,Number(e?.page)||1),
    text:clean(e?.text),
    bbox:box(e?.bbox),
    style:{
      fontSize:Math.max(5,Math.min(40,Number(style.fontSize)||10)),
      fontWeight:["normal","bold","600","700","800","900"].includes(String(style.fontWeight))?String(style.fontWeight):"normal",
      textAlign:["left","center","right"].includes(String(style.textAlign))?String(style.textAlign):"left",
      borderWidth:Math.max(0,Math.min(5,Number(style.borderWidth)||0)),
      borderStyle:["solid","dashed","dotted","none"].includes(String(style.borderStyle))?String(style.borderStyle):"solid",
      background:clean(style.background)||"transparent",
      color:clean(style.color)||"#111111",
      rotation:Number.isFinite(Number(style.rotation))?Number(style.rotation):0
    }
  };
}
async function analyzeBlankForm(file){
  const apiKey=clean(process.env.GEMINI_API_KEY);
  if(!apiKey)throw new Error("GEMINI_API_KEY is not configured");
  const model=clean(process.env.SMART_FORM_GEMINI_MODEL)||clean(process.env.ATTACHMENT_GEMINI_MODEL)||"gemini-3.5-flash-lite";

  const prompt=`You are reconstructing a blank business form as a NEW editable web document.
Do NOT treat the uploaded PDF/image as a background. Return JSON only.

Goal: describe the visible page so GH Mobility can rebuild it from HTML/CSS from scratch as closely as possible.

Detect ALL visible static layout elements:
- every printed text fragment/title/label/instruction
- horizontal and vertical lines
- table/cell rectangles and section borders
- empty checkboxes/circles
- signature lines
- image/logo areas as IMAGE_PLACEHOLDER (never invent the logo)
- every writable/control area

Coordinates are normalized 0..1 from top-left of each page.
Keep each visible item separate. Preserve visual order and page number.
For text, estimate font size, boldness and alignment.
For writable areas, also return a fields[] record. bbox for a field must cover ONLY the writable/clickable area, not its printed label.

Return exactly:
{
 "pageCount":1,
 "pageSizes":[{"page":1,"width":612,"height":792}],
 "sections":[{"sectionId":"member","label":"Member Information","page":1}],
 "layoutElements":[
   {"elementId":"title_1","type":"TEXT","page":1,"text":"MEMBER INFORMATION","bbox":{"x":0.1,"y":0.05,"width":0.8,"height":0.03},"style":{"fontSize":12,"fontWeight":"bold","textAlign":"center","borderWidth":0,"borderStyle":"none","background":"transparent","color":"#111111","rotation":0}},
   {"elementId":"line_1","type":"LINE","page":1,"text":"","bbox":{"x":0.1,"y":0.1,"width":0.8,"height":0.001},"style":{"borderWidth":1,"borderStyle":"solid","color":"#111111"}}
 ],
 "fields":[
   {"fieldId":"member_name","label":"Member Name","semanticKey":"clientName","fieldType":"TEXT","page":1,"sectionId":"member","sectionLabel":"Member Information","occurrenceIndex":1,"layoutOrder":0,"bbox":{"x":0.25,"y":0.12,"width":0.5,"height":0.035},"repeatGroupId":""}
 ]
}

Allowed layout element types: TEXT, LINE, RECT, CHECKBOX, CIRCLE, IMAGE_PLACEHOLDER, INPUT, SIGNATURE_LINE.
Allowed fieldType: TEXT, PHONE, DATE, TIME, NUMBER, ADDRESS, CHECKBOX, SIGNATURE, OTHER.
Do not invent data. Rebuild only what is visibly present.`;

  const body={contents:[{role:"user",parts:[{text:prompt},{inlineData:{mimeType:mime(file),data:file.buffer.toString("base64")}}]}],generationConfig:{temperature:0,responseMimeType:"application/json",maxOutputTokens:65536}};
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
    const retry=JSON.parse(JSON.stringify(body));
    retry.contents[0].parts[0].text+="\nCRITICAL: Return one complete valid JSON object only. No markdown, comments or trailing commas.";
    p=await requestAnalysis(retry);
    parsed=parseJson(responseText(p));
  }

  const fields=(Array.isArray(parsed.fields)?parsed.fields:[]).map(normalizeField)
    .filter(f=>f.bbox.width>0&&f.bbox.height>0)
    .sort((a,b)=>(a.page-b.page)||(a.layoutOrder-b.layoutOrder)||(a.bbox.y-b.bbox.y)||(a.bbox.x-b.bbox.x));
  const layoutElements=(Array.isArray(parsed.layoutElements)?parsed.layoutElements:[]).map(normalizeElement)
    .filter(e=>e.bbox.width>0&&(e.type==="LINE"||e.bbox.height>0))
    .sort((a,b)=>(a.page-b.page)||(a.bbox.y-b.bbox.y)||(a.bbox.x-b.bbox.x));
  if(!fields.length && !layoutElements.length)throw new Error("No form layout was detected");

  const pageCount=Math.max(1,Number(parsed.pageCount)||1);
  const pageSizes=Array.from({length:pageCount},(_,i)=>{
    const p=(Array.isArray(parsed.pageSizes)?parsed.pageSizes:[]).find(x=>Number(x?.page)===i+1)||{};
    return {page:i+1,width:Math.max(200,Number(p.width)||612),height:Math.max(200,Number(p.height)||792)};
  });

  return {
    pageCount,pageSizes,
    sections:Array.isArray(parsed.sections)?parsed.sections:[],
    layoutElements,fields,
    analysisProvider:`GEMINI:${model}`
  };
}
module.exports={analyzeBlankForm};
