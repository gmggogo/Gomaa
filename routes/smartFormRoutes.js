const express = require("express");
// SMART_FORMS_AI_GEMINI_DYNAMIC_MODEL_LIST_FIX_2026_10_02_RENDER_FORCE
// SMART_FORM_DELETE_FORM_RESETS_FIELDS_NOT_TEMPLATE_DISABLE_2026_10_03_0403
// SMART_FORM_AI_SELECTS_AND_FULL_FIELD_DETECTION_2026_10_03_0412
// SMART_FORM_AI_LAYOUT_FROM_PDF_AND_NO_FIELD_MERGE_2026_10_03_0434
// SMART_FORM_AI_PROCESS_UP_TO_12_PAGES_FULL_FIELD_RECALL_2026_10_03_0535
const jwt = require("jsonwebtoken");
const multer = require("multer");
const mongoose = require("mongoose");
const https = require("https");

const routeMapEngine = require("../utils/routeMapEngine");

const Tenant = require("../models/Tenant");
const SmartFormOrganization = require("../models/SmartFormOrganization");
const SmartFormTemplate = require("../models/SmartFormTemplate");
const SmartFormSubmission = require("../models/SmartFormSubmission");
const SharedTripGroup = require("../models/SharedTripGroup");
const SharedEngineSettings = require("../models/SharedEngineSettings");
const Trip = require("../models/Trip");
const { generateFinalPdf } = require("../services/smartFormPdfService");
const { calculateSmartFormPrice } = require("../services/smartFormPricingEngine");
const { planSharedTrips, mergeSettings } = require("../services/sharedEngine");
const { buildSmartFormTripPayload, smartFormSplitDateWindow, smartFormSplitDateKey } = require("../services/smartFormWorkflow");

const router = express.Router();
const SMART_FORMS_AI_FIX_VERSION = "dynamic-gemini-model-list-and-import-save-fix-2026-10-02-2227";

/* =====================================================
   SMART FORM COORDINATE ENRICHMENT
   - Does NOT change the existing Review -> Confirm -> Dispatch flow.
   - Resolves Pickup / Dropoff / Stops before the normal Trip is created.
   - Never blocks Dispatch if a coordinate lookup temporarily fails.
   - Keeps global.ensureTripCoords as a second existing repair pass below.
===================================================== */
function smartFormValidCoords(lat,lng){
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));
}

function smartFormGoogleKey(){
  return (
    process.env.GOOGLE_SERVER_KEY ||
    process.env.GOOGLE_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY ||
    process.env.SERVER_GOOGLE_MAPS_KEY ||
    ""
  );
}

function smartFormHttpsJson(url){
  return new Promise((resolve,reject)=>{
    https.get(url,response=>{
      let data="";
      response.on("data",chunk=>{ data+=chunk; });
      response.on("end",()=>{
        try{ resolve(JSON.parse(data)); }
        catch(err){ reject(err); }
      });
    }).on("error",reject);
  });
}

async function smartFormGeocodeAddress(address){
  const value=clean(address);
  if(!value) return null;

  const fn=
    routeMapEngine?.geocodeAddress ||
    routeMapEngine?.geocode ||
    routeMapEngine?.getCoordinates ||
    routeMapEngine?.getLatLng ||
    null;

  if(typeof fn==="function"){
    try{
      const result=await fn(value);
      const lat=
        result?.lat ??
        result?.latitude ??
        result?.location?.lat ??
        result?.geometry?.location?.lat;
      const lng=
        result?.lng ??
        result?.lon ??
        result?.longitude ??
        result?.location?.lng ??
        result?.location?.lon ??
        result?.geometry?.location?.lng;

      if(smartFormValidCoords(lat,lng)){
        return {lat:Number(lat),lng:Number(lng)};
      }
    }catch(err){
      console.log("SMART FORM routeMapEngine geocode failed:",value,err.message);
    }
  }

  const key=smartFormGoogleKey();
  if(!key) return null;

  try{
    const url=
      "https://maps.googleapis.com/maps/api/geocode/json?address="+
      encodeURIComponent(value)+
      "&key="+
      encodeURIComponent(key);
    const json=await smartFormHttpsJson(url);
    const location=json?.results?.[0]?.geometry?.location;
    if(json?.status==="OK" && smartFormValidCoords(location?.lat,location?.lng)){
      return {lat:Number(location.lat),lng:Number(location.lng)};
    }
    console.log("SMART FORM Google geocode failed:",value,json?.status||"NO_STATUS",json?.error_message||"");
  }catch(err){
    console.log("SMART FORM Google geocode error:",value,err.message);
  }

  return null;
}

async function smartFormResolveTripCoords(pickup,stops,dropoff){
  const stopList=Array.isArray(stops) ? stops.map(clean).filter(Boolean) : [];
  const results=await Promise.all([
    smartFormGeocodeAddress(pickup),
    ...stopList.map(address=>smartFormGeocodeAddress(address)),
    smartFormGeocodeAddress(dropoff)
  ]);

  const pickupCoords=results[0]||null;
  const dropoffCoords=results[results.length-1]||null;
  const stopResults=results.slice(1,-1);

  return {
    pickupLat:pickupCoords?.lat ?? null,
    pickupLng:pickupCoords?.lng ?? null,
    dropoffLat:dropoffCoords?.lat ?? null,
    dropoffLng:dropoffCoords?.lng ?? null,
    stopCoords:stopList.map((address,index)=>({
      address,
      lat:stopResults[index]?.lat ?? null,
      lng:stopResults[index]?.lng ?? null
    }))
  };
}
// Atomic per-company Smart Form trip sequence.
const SmartFormTripSequence = mongoose.models.SmartFormTripSequence || mongoose.model("SmartFormTripSequence", new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,required:true,unique:true,index:true},
  seq:{type:Number,default:0}
},{timestamps:true,collection:"smart_form_trip_sequences"}));

function twoLetters(value){
  const x=clean(value).toUpperCase().replace(/[^A-Z0-9]/g,"");
  return (x+"XX").slice(0,2);
}
function normalizedFieldText(f){
  return `${clean(f?.label)} ${clean(f?.key)}`.toLowerCase().replace(/[_\-]+/g," ").replace(/\s+/g," ").trim();
}
function hasValue(v){
  if(Array.isArray(v)) return v.length>0;
  if(typeof v==="boolean") return v;
  return clean(v)!=="";
}
function explicitBoundField(template,binding){
  return (template.fields||[]).find(x=>clean(x.tripBinding).toUpperCase()===binding) || null;
}
function inferredField(template,binding){
  const fields=template.fields||[];
  const tests={
    CLIENT_NAME:[/\bmember name\b/,/\bclient name\b/,/\bpassenger name\b/,/^name$/],
    PICKUP_ADDRESS:[/\b1st pick up location\b/,/\b1st pickup location\b/,/\bpick up address\b/,/\bpickup address\b/,/\bpickup location\b/],
    DROPOFF_ADDRESS:[/\b1st drop off location\b/,/\b1st dropoff location\b/,/\bdrop off address\b/,/\bdropoff address\b/,/\bdropoff location\b/],
    TRIP_DATE:[/^date$/, /\btrip date\b/,/\bservice date\b/,/\bappointment date\b/],
    PICKUP_TIME:[/\bpick up time\b/,/\bpickup time\b/,/\btrip time\b/,/^time$/],
    SERVICE:[/^service$/, /\bservice type\b/,/\bvehicle type\b/,/\btransportation type\b/]
  };
  for(const re of tests[binding]||[]){
    const f=fields.find(x=>re.test(normalizedFieldText(x)));
    if(f) return f;
  }
  return null;
}
function formDataValueByNames(formData, patterns){
  for(const [key,value] of Object.entries(formData||{})){
    const text=String(key||"").toLowerCase().replace(/[_\-]+/g," ").replace(/\s+/g," ").trim();
    if(patterns.some(re=>re.test(text)) && hasValue(value)) return value;
  }
  return "";
}
function serviceFromVehicleFields(template,formData){
  const picked=[];
  for(const f of template.fields||[]){
    const text=normalizedFieldText(f);
    if(!(/\bvehicle type\b/.test(text)||/\bservice type\b/.test(text)||/^service\b/.test(text))) continue;
    const raw=formData?.[f.key];
    if(!hasValue(raw)) continue;
    if(typeof raw==="boolean"){
      const label=clean(f.label)
        .replace(/^vehicle\s*type\s*[:\-]?\s*/i,"")
        .replace(/^service\s*type\s*[:\-]?\s*/i,"");
      if(label) picked.push(label);
    }else if(Array.isArray(raw)){
      picked.push(...raw.map(clean).filter(Boolean));
    }else{
      const value=clean(raw);
      if(value && !/^(true|on|yes|1)$/i.test(value)) picked.push(value);
      else {
        const label=clean(f.label).replace(/^vehicle\s*type\s*[:\-]?\s*/i,"").replace(/^service\s*type\s*[:\-]?\s*/i,"");
        if(label) picked.push(label);
      }
    }
  }
  return picked[0]||"";
}
function fieldValueForBinding(template,formData,binding){
  const f=explicitBoundField(template,binding) || inferredField(template,binding);
  if(f){
    const raw=formData?.[f.key];
    if(binding==="SERVICE"){
      if(typeof raw==="boolean" && raw){
        return clean(f.label).replace(/^vehicle\s*type\s*[:\-]?\s*/i,"").replace(/^service\s*type\s*[:\-]?\s*/i,"") || "Service";
      }
      if(Array.isArray(raw) && raw.length) return raw.map(clean).filter(Boolean).join(", ");
      if(hasValue(raw)){
        const v=clean(raw);
        if(!/^(true|on|yes|1)$/i.test(v)) return v;
        const label=clean(f.label).replace(/^vehicle\s*type\s*[:\-]?\s*/i,"").replace(/^service\s*type\s*[:\-]?\s*/i,"");
        if(label) return label;
      }
    }else if(hasValue(raw)){
      if(Array.isArray(raw)) return raw.map(clean).filter(Boolean).join(", ");
      return clean(raw);
    }
  }

  // Final fallbacks for imported/legacy forms whose saved field metadata has no binding.
  if(binding==="TRIP_DATE"){
    const v=formDataValueByNames(formData,[/^date$/, /\btrip date\b/, /\bservice date\b/, /\bappointment date\b/]);
    return clean(v);
  }
  if(binding==="SERVICE"){
    const vehicle=serviceFromVehicleFields(template,formData);
    if(vehicle) return vehicle;
    const v=formDataValueByNames(formData,[/^service$/, /\bservice type\b/, /\bvehicle type\b/, /\btransportation type\b/]);
    return clean(v);
  }
  return "";
}
function stopValues(template,formData){
  const explicit=(template.fields||[]).find(x=>clean(x.tripBinding).toUpperCase()==="STOPS");
  let value=explicit ? formData?.[explicit.key] : undefined;

  if(value===undefined || value===null || value===""){
    const inferred=(template.fields||[]).find(f=>{
      const text=normalizedFieldText(f);
      return /(^|\b)stops?(\b|$)/.test(text);
    });
    if(inferred) value=formData?.[inferred.key];
  }

  if(Array.isArray(value)) return value.map(clean).filter(Boolean);
  const text=clean(value);
  if(!text) return [];
  return text.split(/\r?\n|\s*;\s*/).map(clean).filter(Boolean);
}
function ordinalTripIndex(text){
  const value=String(text||"").toLowerCase();
  const ordinal=value.match(/\b(\d+)(?:st|nd|rd|th)\b/);
  if(ordinal) return Number(ordinal[1])||0;
  const labeled=value.match(/\b(?:trip|ride|leg|pickup|pick\s*up|dropoff|drop\s*off|stop|date|time|service)\s*#?\s*(\d+)\b/);
  if(labeled) return Number(labeled[1])||0;
  const trailing=value.match(/\b(\d+)\s*(?:pickup|pick\s*up|dropoff|drop\s*off|trip|ride|leg)\b/);
  if(trailing) return Number(trailing[1])||0;
  return 0;
}
function fieldTripIndex(field){
  const direct=Number(field?.tripIndex||field?.tripNumber||field?.tripGroup||0);
  if(Number.isFinite(direct) && direct>0) return Math.floor(direct);
  return ordinalTripIndex(normalizedFieldText(field));
}
function fieldLooksLikeBinding(field,binding){
  const text=normalizedFieldText(field);
  const tests={
    CLIENT_NAME:[/\bmember name\b/,/\bclient name\b/,/\bpassenger name\b/,/^name$/],
    PICKUP_ADDRESS:[/\bpick\s*up\b/,/\bpickup\b/],
    DROPOFF_ADDRESS:[/\bdrop\s*off\b/,/\bdropoff\b/],
    STOPS:[/\bstops?\b/],
    TRIP_DATE:[/^date$/,/\btrip date\b/,/\bservice date\b/,/\bappointment date\b/],
    PICKUP_TIME:[/\bpick\s*up time\b/,/\bpickup time\b/,/\btrip time\b/,/^time$/],
    SERVICE:[/^service$/,/\bservice type\b/,/\bvehicle type\b/,/\btransportation type\b/]
  };
  return (tests[binding]||[]).some(re=>re.test(text));
}
function valueFromFieldForBinding(field,raw,binding){
  if(binding==="SERVICE"){
    if(typeof raw==="boolean" && raw){
      return clean(field.label).replace(/^vehicle\s*type\s*[:\-]?\s*/i,"").replace(/^service\s*type\s*[:\-]?\s*/i,"") || "Service";
    }
    if(Array.isArray(raw) && raw.length) return raw.map(clean).filter(Boolean).join(", ");
    if(hasValue(raw)){
      const v=clean(raw);
      if(!/^(true|on|yes|1)$/i.test(v)) return v;
      const label=clean(field.label).replace(/^vehicle\s*type\s*[:\-]?\s*/i,"").replace(/^service\s*type\s*[:\-]?\s*/i,"");
      if(label) return label;
    }
    return "";
  }
  if(Array.isArray(raw)) return raw.map(clean).filter(Boolean).join(", ");
  return hasValue(raw) ? clean(raw) : "";
}
function fieldForBindingTrip(template,binding,index){
  const fields=template.fields||[];
  const explicit=fields.find(f=>clean(f.tripBinding).toUpperCase()===binding && fieldTripIndex(f)===index);
  if(explicit) return explicit;
  return fields.find(f=>fieldTripIndex(f)===index && fieldLooksLikeBinding(f,binding)) || null;
}
function fieldValueForBindingTrip(template,formData,binding,index,baseValue=""){
  const f=fieldForBindingTrip(template,binding,index);
  if(f){
    const value=valueFromFieldForBinding(f,formData?.[f.key],binding);
    if(value) return value;
  }
  return index===1 ? clean(baseValue) : clean(baseValue);
}
function stopValuesForTrip(template,formData,index,baseStops=[]){
  const f=fieldForBindingTrip(template,"STOPS",index);
  if(!f) return Array.isArray(baseStops) ? baseStops : [];
  const value=formData?.[f.key];
  if(Array.isArray(value)) return value.map(clean).filter(Boolean);
  const text=clean(value);
  return text ? text.split(/\r?\n|\s*;\s*/).map(clean).filter(Boolean) : (Array.isArray(baseStops) ? baseStops : []);
}
function operationalTripIndexes(template,formData){
  const indexes=new Set([1]);
  for(const f of template.fields||[]){
    const idx=fieldTripIndex(f);
    if(idx>0 && hasValue(formData?.[f.key]) && ["PICKUP_ADDRESS","DROPOFF_ADDRESS","TRIP_DATE","PICKUP_TIME","SERVICE","STOPS"].some(b=>fieldLooksLikeBinding(f,b))){
      indexes.add(idx);
    }
  }
  return [...indexes].filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b);
}
function baseOperationalData(template,formData){
  return {
    clientName:fieldValueForBinding(template,formData,"CLIENT_NAME"),
    pickupAddress:fieldValueForBinding(template,formData,"PICKUP_ADDRESS"),
    dropoffAddress:fieldValueForBinding(template,formData,"DROPOFF_ADDRESS"),
    stops:stopValues(template,formData),
    tripDate:fieldValueForBinding(template,formData,"TRIP_DATE"),
    pickupTime:fieldValueForBinding(template,formData,"PICKUP_TIME"),
    serviceName:fieldValueForBinding(template,formData,"SERVICE")
  };
}
function operationalTrips(template,formData){
  const base=baseOperationalData(template,formData);
  return operationalTripIndexes(template,formData).map((tripIndex,position)=>({
    ...base,
    clientName:fieldValueForBindingTrip(template,formData,"CLIENT_NAME",tripIndex,base.clientName),
    pickupAddress:fieldValueForBindingTrip(template,formData,"PICKUP_ADDRESS",tripIndex,base.pickupAddress),
    dropoffAddress:fieldValueForBindingTrip(template,formData,"DROPOFF_ADDRESS",tripIndex,base.dropoffAddress),
    stops:stopValuesForTrip(template,formData,tripIndex,base.stops),
    tripDate:fieldValueForBindingTrip(template,formData,"TRIP_DATE",tripIndex,base.tripDate),
    pickupTime:fieldValueForBindingTrip(template,formData,"PICKUP_TIME",tripIndex,base.pickupTime),
    serviceName:fieldValueForBindingTrip(template,formData,"SERVICE",tripIndex,base.serviceName),
    smartFormTripIndex:tripIndex,
    smartFormTripLabel:`Trip ${position+1}`
  }));
}
function operationalData(template,formData){
  return operationalTrips(template,formData)[0] || baseOperationalData(template,formData);
}
async function nextSmartFormTripNumber(tenantId,serviceName){
  const tenant=await Tenant.findById(tenantId).select("name branding.companyName").lean();
  const companyName=clean(tenant?.branding?.companyName)||clean(tenant?.name)||"XX";
  const row=await SmartFormTripSequence.findOneAndUpdate(
    {tenantId},{$inc:{seq:1}},
    {new:true,upsert:true,setDefaultsOnInsert:true}
  ).lean();
  return `SF${twoLetters(companyName)}${String(row.seq).padStart(6,"0")}${twoLetters(serviceName)}`;
}

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";

// Smart Forms entry-page designer layout is intentionally stored separately from
// PDF field mappings so moving/resizing the entry form can never damage the official PDF map.
const SmartFormLayout = mongoose.models.SmartFormLayout || mongoose.model("SmartFormLayout", new mongoose.Schema({
  tenantId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},
  templateId:{type:mongoose.Schema.Types.ObjectId,required:true,index:true},
  canvasHeight:{type:Number,default:1200},
  items:{type:[mongoose.Schema.Types.Mixed],default:[]},
  updatedBy:{type:String,default:""}
},{timestamps:true,collection:"smart_form_layouts"}));


const upload = multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:8*1024*1024},
  fileFilter(req,file,cb){
    const ok = file?.mimetype === "application/pdf" || String(file?.originalname||"").toLowerCase().endsWith(".pdf");
    cb(ok ? null : new Error("Only PDF files are allowed"), ok);
  }
});

const aiUpload = multer({
  storage:multer.memoryStorage(),
  limits:{fileSize:2*1024*1024,files:12},
  fileFilter(req,file,cb){const ok=String(file?.mimetype||"").startsWith("image/");cb(ok?null:new Error("Only page images are allowed"),ok);}
});

const clean = v => String(v ?? "").trim();
const smartFormGeminiModelName = v => clean(v).replace(/^models\//i,"");
const smartFormGeminiModels = (...values) => {
  const fallback = ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.0-flash-001", "gemini-2.0-flash-lite"];
  return [...new Set([...values, ...fallback].map(smartFormGeminiModelName).filter(Boolean))];
};
const smartFormGeminiCanFallback = (status,message) => {
  const text = String(message || "").toLowerCase();
  return [400,404,429,500,502,503,504].includes(Number(status)) ||
    text.includes("not found") ||
    text.includes("not supported") ||
    (text.includes("model") && text.includes("generatecontent"));
};
async function smartFormGeminiListGenerateModels(){
  const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models",{
    method:"GET",
    headers:{"x-goog-api-key":process.env.GEMINI_API_KEY}
  });
  let raw = {};
  try{raw=await response.json();}catch(_){raw={};}
  if(!response.ok) throw new Error(clean(raw?.error?.message)||"Gemini model list failed");
  return (Array.isArray(raw?.models)?raw.models:[])
    .filter(model=>(model?.supportedGenerationMethods||[]).includes("generateContent"))
    .map(model=>smartFormGeminiModelName(model?.name))
    .filter(Boolean)
    .sort((a,b)=>{
      const score = name => {
        const value = String(name).toLowerCase();
        if(value.includes("flash-lite")) return 0;
        if(value.includes("flash")) return 1;
        if(value.includes("pro")) return 2;
        return 3;
      };
      return score(a)-score(b) || a.localeCompare(b);
    });
}
async function smartFormGeminiGenerateContent(models,requestBody,label){
  let lastError = null;
  let available = [];
  try{available=await smartFormGeminiListGenerateModels();}
  catch(err){console.error(`${label || "Gemini"} model list failed:`,err.message);}
  for(const model of [...new Set([...models.map(smartFormGeminiModelName).filter(Boolean), ...available, ...smartFormGeminiModels()])]){
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
      {
        method:"POST",
        headers:{
          "x-goog-api-key":process.env.GEMINI_API_KEY,
          "Content-Type":"application/json"
        },
        body:JSON.stringify(requestBody)
      }
    );
    let raw = {};
    try{raw=await response.json();}catch(_){raw={};}
    if(response.ok) return {response,raw,model};

    const message = clean(raw?.error?.message) || `${label || "Gemini"} request failed`;
    lastError = new Error(message);
    lastError.status = response.status;
    console.error(`${label || "Gemini"} model failed:`,model,message);
    if(!smartFormGeminiCanFallback(response.status,message)) throw lastError;
  }
  throw lastError || new Error(`${label || "Gemini"} request failed`);
}
const allowedRoles = new Set(["SUPER_ADMIN","ADMIN","DISPATCHER","PLATFORM_ADMIN"]);

function auth(req,res,next){
  const h = clean(req.headers.authorization);
  const token = h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
  if(!token) return res.status(401).json({success:false,message:"Access Denied"});
  try{
    const u = jwt.verify(token,JWT_SECRET);
    req.authUser = {
      id:u.id || null,
      name:u.name || "",
      username:u.username || "",
      role:String(u.role||"").toUpperCase(),
      tenantId:u.tenantId || null
    };
    if(!allowedRoles.has(req.authUser.role)) return res.status(403).json({success:false,message:"Role not allowed"});
    if(req.authUser.role!=="PLATFORM_ADMIN" && !req.authUser.tenantId) return res.status(403).json({success:false,message:"Tenant Required"});
    next();
  }catch{
    res.status(401).json({success:false,message:"Invalid Token"});
  }
}

function tenantIdFor(req){
  return req.authUser?.role==="PLATFORM_ADMIN"
    ? clean(req.query?.tenantId || req.body?.tenantId)
    : clean(req.authUser?.tenantId);
}

async function smartFormsFeatureEnabled(tenantId){
  if(!mongoose.Types.ObjectId.isValid(tenantId)) return false;

  /*
    Smart Forms should be visible to a tenant only when there is at least one
    active Platform Admin organization with at least one active template.
    The legacy Tenant.smartFormsEnabled flag alone is not enough because the
    tenant could be enabled globally while every paid template is disabled.
  */
  const activeOrganizations = await SmartFormOrganization.find({
    tenantId,
    active:{ $ne:false },
    createdByPlatformAdmin:true
  }).select("_id").lean();

  const activeOrganizationIds = activeOrganizations.map(org => org._id);
  if(!activeOrganizationIds.length) return false;

  const activeTemplate = await SmartFormTemplate.exists({
    tenantId,
    active:{ $ne:false },
    organizationId:{ $in:activeOrganizationIds }
  });

  return Boolean(activeTemplate);
}

async function gate(req,res){
  const tenantId = tenantIdFor(req);
  if(!mongoose.Types.ObjectId.isValid(tenantId)){
    res.status(400).json({success:false,message:"Valid tenantId is required"}); return null;
  }
  const tenant = await Tenant.findById(tenantId).select("_id enabled timezone settings.timezone").lean();
  if(!tenant){ res.status(404).json({success:false,message:"Company not found"}); return null; }
  if(tenant.enabled!==true){ res.status(403).json({success:false,message:"Company is disabled"}); return null; }
  if(!await smartFormsFeatureEnabled(tenantId)){ res.status(403).json({success:false,message:"Smart Forms is disabled"}); return null; }
  return {tenantId,timezone:clean(tenant?.timezone||tenant?.settings?.timezone)||"America/Phoenix"};
}

const actor = req => req.authUser?.name || req.authUser?.username || "";

function normalizeFields(fields){
  const used = new Set();
  return (Array.isArray(fields)?fields:[]).map((f,i)=>{
    let key = clean(f.key) || clean(f.label).toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"") || `field_${i+1}`;
    let k=key,n=2; while(used.has(k)) k=`${key}_${n++}`; used.add(k);
    const m = f.mapping || {};
    return {
      _id:f._id || undefined,
      key:k,
      label:clean(f.label) || `Field ${i+1}`,
      type:clean(f.type || "TEXT").toUpperCase(),
      required:f.required===true,
      requiredUserOverride:f.requiredUserOverride===true,
      placeholder:clean(f.placeholder),
      options:Array.isArray(f.options)?f.options.map(clean).filter(Boolean):[],
      widthPercent:Math.max(10,Math.min(100,Number(f.widthPercent||50))),
      order:i,
      tripBinding:clean(f.tripBinding),
      tripIndex:Math.max(0,Math.floor(Number(f.tripIndex||0)||0)),
      sourceType:["MANUAL","TRIP_DATA","DRIVER_DATA","VEHICLE_DATA","SYSTEM_AFTER_TRIP"].includes(clean(f.sourceType).toUpperCase())?clean(f.sourceType).toUpperCase():"MANUAL",
      repeat:f.repeat===true,
      repeatUserOverride:f.repeatUserOverride===true,
      mapping:{
        mapped:m.mapped===true,
        page:Math.max(1,Number(m.page||1)),
        xPercent:Math.max(0,Math.min(100,Number(m.xPercent||0))),
        yPercent:Math.max(0,Math.min(100,Number(m.yPercent||0))),
        widthPercent:Math.max(.1,Math.min(100,Number(m.widthPercent||20))),
        heightPercent:Math.max(.1,Math.min(100,Number(m.heightPercent||4))),
        fontSize:Math.max(5,Math.min(48,Number(m.fontSize||10))),
        textAlign:["LEFT","CENTER","RIGHT"].includes(clean(m.textAlign).toUpperCase()) ? clean(m.textAlign).toUpperCase() : "LEFT"
      },
      mappings:(Array.isArray(f.mappings)?f.mappings:[]).map(mm=>({
        mapped:mm?.mapped===true,page:Math.max(1,Number(mm?.page||1)),
        xPercent:Math.max(0,Math.min(100,Number(mm?.xPercent||0))),yPercent:Math.max(0,Math.min(100,Number(mm?.yPercent||0))),
        widthPercent:Math.max(.1,Math.min(100,Number(mm?.widthPercent||20))),heightPercent:Math.max(.1,Math.min(100,Number(mm?.heightPercent||4))),
        fontSize:Math.max(5,Math.min(48,Number(mm?.fontSize||10))),
        textAlign:["LEFT","CENTER","RIGHT"].includes(clean(mm?.textAlign).toUpperCase())?clean(mm.textAlign).toUpperCase():"LEFT"
      }))
    };
  });
}

function smartFormAiMapping(field,pageCount){
  const numeric=value=>(typeof value==="number" || (typeof value==="string" && value.trim()!=="")) && Number.isFinite(Number(value));
  const values=[field.page,field.xPercent,field.yPercent,field.widthMapPercent,field.heightMapPercent];
  const [page,x,y,requestedW,requestedH]=values.map(Number);
  const valid=values.every(numeric) && Number.isInteger(page) && page>=1 && page<=pageCount &&
    x>=0 && x<100 && y>=0 && y<100 && requestedW>0 && requestedH>0;
  // Missing or out-of-page AI coordinates must not become fabricated mapped boxes.
  // A rectangle may extend slightly past the paper edge; clip its size, preserving its detected top-left.
  const w=valid?Math.min(requestedW,100-x):20;
  const h=valid?Math.min(requestedH,100-y):4;
  return valid ? {mapped:true,page,xPercent:x,yPercent:y,widthPercent:w,heightPercent:h,fontSize:10,textAlign:"LEFT"} :
    {mapped:false,page:1,xPercent:0,yPercent:0,widthPercent:20,heightPercent:4,fontSize:10,textAlign:"LEFT"};
}

function smartFormAiFieldType(field){
  const incoming=clean(field?.type || "TEXT").toUpperCase();
  if(["NUMBER","PHONE","ADDRESS","DATE","TIME","SELECT","RADIO","CHECKBOX","TEXTAREA","SIGNATURE"].includes(incoming)){
    return incoming;
  }
  return "TEXT";
}

function smartFormAiFinalFieldType(field){
  const incoming=smartFormAiFieldType(field);
  const label=clean(field?.label).toLowerCase();
  const options=Array.isArray(field?.options)?field.options.map(clean).filter(Boolean):[];

  if(["SELECT","RADIO","CHECKBOX"].includes(incoming)) return incoming;
  if(options.length) return "SELECT";
  if(
    /\btype of trip\b/.test(label) ||
    /\btrip type\b/.test(label) ||
    /\bvehicle type\b/.test(label) ||
    /\bservice type\b/.test(label) ||
    /\btransportation type\b/.test(label) ||
    /\blevel of service\b/.test(label) ||
    /\bmethod of payment\b/.test(label) ||
    /\bpayor\b/.test(label) ||
    /\bgender\b/.test(label) ||
    /\byes\s*\/\s*no\b/.test(label)
  ){
    return "SELECT";
  }
  return incoming;
}

function sanitizeTemplate(t){
  const o=t?.toObject?t.toObject():{...t};
  if(o.originalPdf){ delete o.originalPdf.data; o.originalPdf.hasPdf=!!o.originalPdf.fileName; }
  return o;
}
function sanitizeSubmission(s){
  const o=s?.toObject?s.toObject():{...s};
  if(o.generatedPdf){ delete o.generatedPdf.data; o.generatedPdf.hasPdf=!!o.generatedPdf.fileName; }
  return o;
}

router.use(auth);

router.get("/feature", async (req,res)=>{
  const id = tenantIdFor(req);
  if(!mongoose.Types.ObjectId.isValid(id)) return res.json({success:true,enabled:false});
  const enabled = await smartFormsFeatureEnabled(id);
  res.json({success:true,enabled});
});

router.get("/organizations", async (req,res)=>{
  try{
    const g=await gate(req,res);
    if(!g) return;

    /*
      Compare tenantId by string inside Mongo.
      This also supports any older organization row whose tenantId
      may have been stored with a different BSON representation.
    */
    const organizations =
      await SmartFormOrganization.aggregate([
        {
          $match:{
            active:{ $ne:false },
            createdByPlatformAdmin:true
          }
        },
        {
          $match:{
            $expr:{
              $eq:[
                { $toString:"$tenantId" },
                String(g.tenantId)
              ]
            }
          }
        },
        {
          $sort:{
            name:1
          }
        }
      ]);

    return res.json({
      success:true,
      tenantId:String(g.tenantId),
      organizations
    });

  }catch(err){
    console.error(
      "SMART FORMS ORGANIZATIONS ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:"Failed to load organizations"
    });
  }
});

router.get("/templates", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const allowedOrganizations=await SmartFormOrganization.find({
      tenantId:g.tenantId,
      active:{ $ne:false },
      createdByPlatformAdmin:true
    }).select("_id").lean();

    const allowedIds=allowedOrganizations.map(o=>o._id);
    const q={tenantId:g.tenantId,active:true,organizationId:{$in:allowedIds}};

    if(mongoose.Types.ObjectId.isValid(req.query.organizationId)){
      const requested=String(req.query.organizationId);
      if(!allowedIds.some(id=>String(id)===requested)){
        return res.json({success:true,templates:[]});
      }
      q.organizationId=req.query.organizationId;
    }

    const templates=await SmartFormTemplate.find(q).sort({updatedAt:-1}).lean();
    res.json({success:true,templates:templates.map(sanitizeTemplate)});
  }catch(err){res.status(500).json({success:false,message:"Failed to load templates"});}
});

router.post("/templates", async (req,res)=>{
  try{
    if(req.authUser?.role!=="PLATFORM_ADMIN"){
      return res.status(403).json({success:false,message:"Templates are created by Platform Admin only"});
    }
    const g=await gate(req,res); if(!g) return;
    const organizationId=clean(req.body.organizationId), name=clean(req.body.name);
    if(!mongoose.Types.ObjectId.isValid(organizationId)) return res.status(400).json({success:false,message:"Organization is required"});
    if(!name) return res.status(400).json({success:false,message:"Template name is required"});
    const org=await SmartFormOrganization.findOne({_id:organizationId,tenantId:g.tenantId,active:{ $ne:false }}).lean();
    if(!org) return res.status(404).json({success:false,message:"Organization not found"});
    const template=await SmartFormTemplate.create({tenantId:g.tenantId,organizationId,name,description:clean(req.body.description),fields:[],createdBy:actor(req),updatedBy:actor(req)});
    res.status(201).json({success:true,template:sanitizeTemplate(template)});
  }catch(err){
    res.status(err?.code===11000?409:500).json({success:false,message:err?.code===11000?"Template already exists":(err?.message||"Failed to create template")});
  }
});

router.delete("/templates/:id", async (req,res)=>{
  try{
    if(!["SUPER_ADMIN","ADMIN","PLATFORM_ADMIN"].includes(req.authUser?.role)){
      return res.status(403).json({success:false,message:"Form reset is admin only"});
    }
    const tenantId=tenantIdFor(req);
    if(!mongoose.Types.ObjectId.isValid(tenantId)){
      return res.status(400).json({success:false,message:"Valid tenantId is required"});
    }
    const tenant=await Tenant.findById(tenantId).select("_id enabled").lean();
    if(!tenant) return res.status(404).json({success:false,message:"Company not found"});
    if(tenant.enabled!==true) return res.status(403).json({success:false,message:"Company is disabled"});

    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId});
    if(!t) return res.status(404).json({success:false,message:"Template not found"});

    /*
      Delete Form means reset the builder form only.
      Keep the template active/visible and keep its organization/PDF.
      This also protects deployments that still have a cached frontend
      calling DELETE /templates/:id from disabling the whole template.
    */
    t.active=true;
    t.fields=[];
    t.updatedBy=actor(req);
    await t.save();

    await SmartFormLayout.findOneAndUpdate(
      {tenantId,templateId:t._id},
      {$set:{canvasHeight:900,items:[],updatedBy:actor(req)}},
      {upsert:true,setDefaultsOnInsert:true}
    );

    res.json({
      success:true,
      mode:"FORM_RESET_ONLY_TEMPLATE_STAYS_ACTIVE",
      template:sanitizeTemplate(t)
    });
  }catch(err){
    res.status(500).json({success:false,message:err?.message||"Failed to reset form"});
  }
});

router.get("/templates/:id/layout", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId}).select("_id").lean();
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    const row=await SmartFormLayout.findOne({tenantId:g.tenantId,templateId:t._id}).lean();
    res.json({success:true,layout:row?{canvasHeight:row.canvasHeight||1200,items:Array.isArray(row.items)?row.items:[]}:{canvasHeight:1200,items:[]}});
  }catch(err){res.status(500).json({success:false,message:err?.message||"Failed to load form layout"});}
});

router.put("/templates/:id/layout", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId}).select("_id").lean();
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    const src=req.body?.layout&&typeof req.body.layout==="object"?req.body.layout:{};
    const canvasHeight=Math.max(500,Math.min(5000,Number(src.canvasHeight||1200)));
    const items=(Array.isArray(src.items)?src.items:[]).slice(0,500).map((i,n)=>({
      id:clean(i?.id)||`item_${n+1}`,
      kind:["FIELD","SECTION","SPACER"].includes(clean(i?.kind).toUpperCase())?clean(i.kind).toUpperCase():"FIELD",
      fieldKey:clean(i?.fieldKey),
      text:clean(i?.text),
      x:Math.max(0,Math.min(100,Number(i?.x||0))),
      y:Math.max(0,Math.min(5000,Number(i?.y||0))),
      w:Math.max(5,Math.min(100,Number(i?.w||30))),
      h:Math.max(34,Math.min(1200,Number(i?.h||90)))
    }));
    const row=await SmartFormLayout.findOneAndUpdate(
      {tenantId:g.tenantId,templateId:t._id},
      {$set:{canvasHeight,items,updatedBy:actor(req)}},
      {new:true,upsert:true,setDefaultsOnInsert:true}
    ).lean();
    res.json({success:true,layout:{canvasHeight:row.canvasHeight,items:row.items||[]}});
  }catch(err){res.status(500).json({success:false,message:err?.message||"Failed to save form layout"});}
});

router.put("/templates/:id/fields", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    // Form Builder owns field definitions/order, but it must NOT erase a PDF
    // mapping that was already saved in PDF Map. Preserve the database mapping
    // for every existing field and only give a blank mapping to genuinely new fields.
    const existingById = new Map((t.fields||[]).map(f=>[String(f._id), f]));
    const existingByKey = new Map((t.fields||[]).map(f=>[String(f.key), f]));
    const incoming = Array.isArray(req.body.fields) ? req.body.fields : [];
    const merged = incoming.map(f=>{
      const old = (f?._id && existingById.get(String(f._id))) || existingByKey.get(String(f?.key||""));
      const plain = old?.toObject ? old.toObject() : old;
      return {
        ...f,
        _id: old?._id || f?._id || undefined,
        mapping: plain?.mapping || f?.mapping || undefined,
        mappings: plain?.mappings || f?.mappings || [],
        sourceType:f?.sourceType || plain?.sourceType || "MANUAL",
        // Required and Repeat are manual controls after AI detection. False must remain false.
        required:f?.required===true,
        requiredUserOverride:f?.requiredUserOverride===true || plain?.requiredUserOverride===true,
        repeat:f?.repeat===true,
        repeatUserOverride:f?.repeatUserOverride===true || plain?.repeatUserOverride===true
      };
    });
    t.fields=normalizeFields(merged);
    t.updatedBy=actor(req);
    await t.save();
    res.json({success:true,template:sanitizeTemplate(t)});
  }catch(err){res.status(500).json({success:false,message:err?.message||"Failed to save fields"});}
});

router.put("/templates/:id/mapping", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    const map=new Map((req.body.fields||[]).filter(x=>x?._id).map(x=>[String(x._id),x]));
    t.fields.forEach(f=>{
      const row=map.get(String(f._id)); if(!row) return;
      const m=row.mapping||{};
      f.mapping={
        mapped:m.mapped===true,page:Math.max(1,Number(m.page||1)),
        xPercent:Math.max(0,Math.min(100,Number(m.xPercent||0))),
        yPercent:Math.max(0,Math.min(100,Number(m.yPercent||0))),
        widthPercent:Math.max(.1,Math.min(100,Number(m.widthPercent||20))),
        heightPercent:Math.max(.1,Math.min(100,Number(m.heightPercent||4))),
        fontSize:Math.max(5,Math.min(48,Number(m.fontSize||10))),
        textAlign:["LEFT","CENTER","RIGHT"].includes(clean(m.textAlign).toUpperCase())?clean(m.textAlign).toUpperCase():"LEFT"
      };
      f.mappings=(Array.isArray(row.mappings)?row.mappings:[]).map(mm=>({mapped:mm?.mapped===true,page:Math.max(1,Number(mm?.page||1)),xPercent:Math.max(0,Math.min(100,Number(mm?.xPercent||0))),yPercent:Math.max(0,Math.min(100,Number(mm?.yPercent||0))),widthPercent:Math.max(.1,Math.min(100,Number(mm?.widthPercent||20))),heightPercent:Math.max(.1,Math.min(100,Number(mm?.heightPercent||4))),fontSize:Math.max(5,Math.min(48,Number(mm?.fontSize||10))),textAlign:["LEFT","CENTER","RIGHT"].includes(clean(mm?.textAlign).toUpperCase())?clean(mm.textAlign).toUpperCase():"LEFT"}));
    });
    await t.save();
    res.json({success:true,template:sanitizeTemplate(t)});
  }catch(err){res.status(500).json({success:false,message:"Failed to save mapping"});}
});

router.post("/templates/:id/ai-detect", aiUpload.array("pages",12), async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    const pages=Array.isArray(req.files)?req.files:[];
    if(!pages.length) return res.status(400).json({success:false,message:"PDF page images are required"});
    if(!process.env.GEMINI_API_KEY) return res.status(503).json({success:false,message:"GEMINI_API_KEY is not configured on the server"});

    const prompt=`Analyze EVERY supplied page of this official transportation form. Return EVERY visible fillable field on EVERY page, including all repeated trip rows and all boxes in every row. Do not stop after the first group or first 20 fields. The expected form may contain more than 50 fields. Count and include every distinct box, line, checkbox, and choice separately. Include page number for each.
Detect blank lines, boxes, dropdown-like choices, checkboxes, radio choices, date/time fields, addresses, phone/member fields, authorization fields, and signature areas. Do not stop early and do not omit lower-page fields.
Return JSON only with {fields:[...]}. Each field: label,type,required,widthPercent,sourceType,repeat,page,xPercent,yPercent,widthMapPercent,heightMapPercent,options,tripBinding,tripIndex.
type must be TEXT,NUMBER,PHONE,ADDRESS,DATE,TIME,SELECT,RADIO,CHECKBOX,TEXTAREA,SIGNATURE.
Detect visual choice controls as SELECT/RADIO/CHECKBOX when the form shows dropdowns, boxes, yes/no choices, trip type choices, service/vehicle choices, payor choices, or multiple visible options; put the visible option labels in options.
If a label says Type of Trip, Trip Type, Vehicle Type, Service Type, Transportation Type, Level of Service, Method of Payment, Payor, Gender, or Yes/No, do NOT return TEXT; return SELECT/RADIO/CHECKBOX.
If a field has several adjacent empty boxes/lines but each box captures a different value, return each one as a separate field. Never merge different labels into one field.
If the form has multiple pickup/dropoff/date/time rows, return every row separately. Do not summarize them, do not combine them, and do not put several values in one options array unless they are true choices for one field.
sourceType must be MANUAL,TRIP_DATA,DRIVER_DATA,VEHICLE_DATA,SYSTEM_AFTER_TRIP.
tripBinding may be CLIENT_NAME,PICKUP_ADDRESS,DROPOFF_ADDRESS,STOPS,TRIP_DATE,PICKUP_TIME,SERVICE when the field clearly feeds trip creation.
tripIndex is 1,2,3... for repeated trip blocks such as Pickup 1/Dropoff 1 and Pickup 2/Dropoff 2; otherwise use 0.
IMPORTANT: repeated trip blocks are separate trips, not duplicate occurrences. For Pickup 1 and Pickup 2, create two separate fields with tripIndex 1 and 2. Do NOT use repeat=true to merge different trips.
Use repeat=true only when the exact same logical field appears in multiple printed places for the same trip/person; then return one logical field and use occurrences:[{page,xPercent,yPercent,widthMapPercent,heightMapPercent}] for all locations.
Use normalized percentages 0-100 for PDF coordinates, measured from the TOP LEFT of each complete page image (not bottom-left PDF coordinates and not 0-1000).
xPercent and yPercent are the top-left of the blank input area, excluding its printed label. widthMapPercent and heightMapPercent are that input area's width and height, not the lower-right coordinates. The whole rectangle must fit inside the page.
Return exact visible input rectangles. If you cannot locate a field reliably, leave its coordinates null; never invent a default rectangle.
Preserve visual reading order and current form design; detection must not redesign the page. widthPercent is form-entry layout width (10-100).`;

    const parts=[{text:prompt}];
    for(let i=0;i<pages.length;i++){
      const p=pages[i];
      parts.push({text:`PDF page ${i+1}`});
      parts.push({
        inlineData:{
          mimeType:p.mimetype||"image/jpeg",
          data:p.buffer.toString("base64")
        }
      });
    }

    const aiAttempt=await smartFormGeminiGenerateContent(
      [process.env.SMART_FORMS_GEMINI_MODEL],
      {
        contents:[{role:"user",parts}],
        generationConfig:{
          responseMimeType:"application/json",
          maxOutputTokens:32768
        }
      },
      "Smart Forms AI detect"
    );
    const raw=aiAttempt.raw;

    const text=(raw?.candidates||[])
      .flatMap(c=>c?.content?.parts||[])
      .map(p=>p?.text||"")
      .join("\n")
      .trim();

    if(!text) throw new Error("Gemini returned an empty response");

    const cleaned=text.replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
    const parsed=JSON.parse(cleaned); const detected=Array.isArray(parsed.fields)?parsed.fields:[];
    const existingByKey=new Map((t.fields||[]).map(f=>[String(f.key),f.toObject?f.toObject():f]));
    const fields=detected.map((a,i)=>{
      const label=clean(a.label)||`Field ${i+1}`;
      const aiTripIndex=Math.max(0,Math.floor(Number(a.tripIndex||0)||0));
      const baseKey=label.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"")||`field_${i+1}`;
      const key=aiTripIndex>0 ? `${baseKey}_trip_${aiTripIndex}` : baseKey;
      const old=existingByKey.get(key); const occ=Array.isArray(a.occurrences)&&a.occurrences.length?a.occurrences:[a];
      const maps=occ.map(o=>smartFormAiMapping(o,pages.length)).filter(m=>m.mapped);
      const detectedType=smartFormAiFinalFieldType(a);
      const detectedOptions=Array.isArray(a.options)?a.options.map(clean).filter(Boolean):[];
      const detectedBinding=clean(a.tripBinding).toUpperCase();
      return {_id:old?._id,key,label,type:detectedType,
        required:old ? old.required===true : a.required===true,
        requiredUserOverride:old?.requiredUserOverride===true,
        widthPercent:Number(a.widthPercent||50),sourceType:clean(a.sourceType||"MANUAL").toUpperCase(),
        // AI may suggest Repeat only for a brand-new field. Existing fields keep the user's saved choice.
        // Trip-indexed fields are separate trips and must never be merged as Repeat.
        repeat:aiTripIndex>0 ? false : (old ? old.repeat===true : (a.repeat===true)),
        repeatUserOverride:old?.repeatUserOverride===true,
        tripBinding:old?.tripBinding||(["CLIENT_NAME","PICKUP_ADDRESS","DROPOFF_ADDRESS","STOPS","TRIP_DATE","PICKUP_TIME","SERVICE"].includes(detectedBinding)?detectedBinding:""),
        tripIndex:old?.tripIndex || aiTripIndex,
        options:(old?.options&&old.options.length)?old.options:detectedOptions,
        mapping:maps[0]||{mapped:false},mappings:maps};
    });
    const detectedKeys=new Set(fields.map(f=>f.key));
    for(const old of (t.fields||[])){const plain=old.toObject?old.toObject():old;if(!detectedKeys.has(String(plain.key)))fields.push(plain);}
    t.fields=normalizeFields(fields); t.updatedBy=actor(req); await t.save();
    res.json({success:true,template:sanitizeTemplate(t),detected:t.fields.length});
  }catch(err){console.error("SMART FORMS AI DETECT ERROR:",err);res.status(500).json({success:false,message:err?.message||"AI field detection failed"});}
});

router.post("/templates/:id/pdf", upload.single("pdf"), async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    if(!req.file?.buffer?.length) return res.status(400).json({success:false,message:"PDF file is required"});
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId}).select("+originalPdf.data");
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    t.originalPdf={fileName:req.file.originalname||"official-form.pdf",mimeType:"application/pdf",size:req.file.size,pageCount:0,data:req.file.buffer,uploadedAt:new Date()};
    await t.save();
    res.json({success:true,template:sanitizeTemplate(t)});
  }catch(err){res.status(500).json({success:false,message:err?.message||"Failed to upload PDF"});}
});

router.get("/templates/:id/pdf", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId}).select("+originalPdf.data");
    if(!t?.originalPdf?.data?.length) return res.status(404).json({success:false,message:"Official PDF not found"});
    res.setHeader("Content-Type","application/pdf");
    res.setHeader("Content-Disposition",`inline; filename="${String(t.originalPdf.fileName||"official-form.pdf").replace(/"/g,"")}"`);
    res.end(t.originalPdf.data);
  }catch(err){res.status(500).json({success:false,message:"Failed to load PDF"});}
});

router.post("/submissions", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const t=await SmartFormTemplate.findOne({_id:req.body.templateId,tenantId:g.tenantId,active:true}).lean();
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    const org=await SmartFormOrganization.findOne({_id:t.organizationId,tenantId:g.tenantId,active:{ $ne:false }}).lean();
    if(!org) return res.status(404).json({success:false,message:"Organization not found"});
    const formData=req.body.formData && typeof req.body.formData==="object" ? req.body.formData : {};
    const missing=(t.fields||[]).filter(f=>f.required && f.type!=="SIGNATURE" && (formData[f.key]===undefined || formData[f.key]===null || formData[f.key]==="")).map(f=>f.label);
    if(missing.length) return res.status(400).json({success:false,message:`Required fields missing: ${missing.join(", ")}`});
    const status=String(req.body.status||"").toUpperCase()==="REVIEW"?"REVIEW":"DRAFT";
    const tripOps=operationalTrips(t,formData);
    const op=tripOps[0] || operationalData(t,formData);
    if(status==="REVIEW"){
      const empty=[];
      tripOps.forEach((row,index)=>{
        const requiredOps=[["Client Name",row.clientName],["Pickup Address",row.pickupAddress],["Dropoff Address",row.dropoffAddress],["Trip Date",row.tripDate],["Pickup Time",row.pickupTime],["Service",row.serviceName]];
        requiredOps.filter(([,value])=>!value).forEach(([label])=>empty.push(`${row.smartFormTripLabel||`Trip ${index+1}`} ${label}`));
      });
      if(empty.length) return res.status(400).json({success:false,message:`Review fields missing: ${empty.join(", ")}`});
    }
    const tripNumber=status==="REVIEW"?await nextSmartFormTripNumber(g.tenantId,op.serviceName):"";
    const s=await SmartFormSubmission.create({
      tenantId:g.tenantId,organizationId:org._id,templateId:t._id,templateName:t.name,organizationName:org.name,
      status,formData,fieldSnapshot:t.fields||[],tripNumber,multiTripCount:Math.max(1,tripOps.length),
      smartFormTrips:tripOps.map((row,index)=>({tripIndex:row.smartFormTripIndex||index+1,tripLabel:row.smartFormTripLabel||`Trip ${index+1}`})),
      ...op,signatureRequired:(t.fields||[]).some(f=>f.type==="SIGNATURE"),
      submittedBy:actor(req),submittedAt:status==="REVIEW"?new Date():null
    });
    res.status(201).json({success:true,submission:sanitizeSubmission(s)});
  }catch(err){res.status(500).json({success:false,message:err?.message||"Failed to save form"});}
});

router.get("/submissions", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;

    const query={tenantId:g.tenantId};
    const requestedStatus=clean(req.query.status).toUpperCase();
    if(["DRAFT","REVIEW","CONFIRMED","ARCHIVED"].includes(requestedStatus)){
      query.status=requestedStatus;
    }

    const rows=await SmartFormSubmission.find(query).sort({createdAt:-1}).limit(500).lean();

    const tripIds=rows.map(x=>x.tripId).filter(Boolean);
    const trips=tripIds.length
      ? await Trip.find({_id:{$in:tripIds},tenantId:g.tenantId})
          .select("_id status passengerStatus stops miles distanceMiles durationMinutes priceAmount finalPrice totalPassengers isShared groupId tripType")
          .lean()
      : [];
    const tripMap=new Map(trips.map(t=>[String(t._id),t]));

    /*
      Smart Form Summary rule:
      CONFIRMED means the form was approved and a normal Trip was created.
      It does NOT mean the ride was completed.

      Therefore, when the Summary asks for CONFIRMED Smart Forms, expose only
      submissions whose linked normal Trip is actually Completed. Review/Draft
      screens keep their existing behavior unchanged.
    */
    const completedTripStatus=value=>
      ["COMPLETED","COMPLETE"].includes(clean(value).toUpperCase());

    const sourceRows=requestedStatus==="CONFIRMED"
      ? rows.filter(row=>{
          const trip=row.tripId ? tripMap.get(String(row.tripId)) : null;
          return !!trip && completedTripStatus(trip.status);
        })
      : rows;

    const submissions=sourceRows.map(row=>{
      const out=sanitizeSubmission(row);
      const trip=row.tripId ? tripMap.get(String(row.tripId)) : null;

      if(trip){
        // Summary must use the final normal-Trip state, not Smart Form CONFIRMED.
        out.tripStatus=clean(trip.status);
        out.passengerStatus=clean(trip.passengerStatus) || (completedTripStatus(trip.status) ? "Completed" : "");

        if(Array.isArray(trip.stops)) out.stops=trip.stops;

        const finalMiles=Number(trip.distanceMiles ?? trip.miles);
        if(Number.isFinite(finalMiles)) out.distanceMiles=finalMiles;

        const finalMinutes=Number(trip.durationMinutes);
        if(Number.isFinite(finalMinutes)) out.durationMinutes=finalMinutes;

        // A normal Trip may keep finalPrice=0 as its default while the
        // actual fare is in priceAmount or the saved Smart Form pricing.
        // Prefer a positive final price, then positive trip/submission prices;
        // only return $0 when every available price is actually zero.
        const priceCandidates=[
          trip.finalPrice,
          trip.priceAmount,
          out.finalPrice,
          out.priceAmount,
          out.pricing?.amount
        ].filter(value=>
          value!==undefined &&
          value!==null &&
          value!=="" &&
          Number.isFinite(Number(value))
        ).map(Number);
        const finalPrice=
          priceCandidates.find(value=>value>0) ??
          priceCandidates[0] ??
          0;
        out.pricing={...(out.pricing||{}),calculated:true,amount:finalPrice,currency:"USD"};
        out.priceAmount=finalPrice;
        out.finalPrice=finalPrice;

        out.totalPassengers=Number(trip.totalPassengers||out.totalPassengers||1)||1;
        out.isShared=trip.isShared===true;
        out.groupId=clean(trip.groupId);
        out.tripType=clean(trip.tripType);
      }

      return out;
    });

    res.json({success:true,submissions});
  }catch(err){
    res.status(500).json({success:false,message:"Failed to load review"});
  }
});

router.post("/submissions/:id/review", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const s=await SmartFormSubmission.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!s) return res.status(404).json({success:false,message:"Submission not found"});
    if(s.status==="CONFIRMED") return res.status(409).json({success:false,message:"Already confirmed"});
    if(!s.tripNumber){
      const t=await SmartFormTemplate.findOne({_id:s.templateId,tenantId:g.tenantId}).lean();
      if(!t) return res.status(404).json({success:false,message:"Template not found"});
      const tripOps=operationalTrips(t,s.formData||{});
      const op=tripOps[0] || operationalData(t,s.formData||{});
      const empty=[];
      tripOps.forEach((row,index)=>{
        const requiredOps=[["Client Name",row.clientName],["Pickup Address",row.pickupAddress],["Dropoff Address",row.dropoffAddress],["Trip Date",row.tripDate],["Pickup Time",row.pickupTime],["Service",row.serviceName]];
        requiredOps.filter(([,value])=>!value).forEach(([label])=>empty.push(`${row.smartFormTripLabel||`Trip ${index+1}`} ${label}`));
      });
      if(empty.length) return res.status(400).json({success:false,message:`Review fields missing: ${empty.join(", ")}`});
      Object.assign(s,op);
      s.tripNumber=await nextSmartFormTripNumber(g.tenantId,op.serviceName);
      s.multiTripCount=Math.max(1,tripOps.length);
      s.smartFormTrips=tripOps.map((row,index)=>({tripIndex:row.smartFormTripIndex||index+1,tripLabel:row.smartFormTripLabel||`Trip ${index+1}`}));
    }
    s.status="REVIEW"; s.reviewedBy=actor(req); s.reviewedAt=new Date(); if(!s.submittedAt) s.submittedAt=new Date();
    await s.save();
    res.json({success:true,submission:sanitizeSubmission(s)});
  }catch(err){res.status(500).json({success:false,message:"Failed to send to review"});}
});

router.post("/submissions/:id/confirm", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;

    const s=await SmartFormSubmission.findOne({
      _id:req.params.id,
      tenantId:g.tenantId
    });

    if(!s){
      return res.status(404).json({
        success:false,
        message:"Submission not found"
      });
    }

    /*
      Idempotency:
      If this Smart Form was already confirmed and already owns a Trip,
      never create a duplicate Trip when Confirm is clicked again.
    */
    const existingTripIds=[
      ...(Array.isArray(s.tripIds)?s.tripIds:[]),
      s.tripId
    ].filter(Boolean);

    if(existingTripIds.length){
      const existingTrips=await Trip.find({
        _id:{$in:existingTripIds},
        tenantId:g.tenantId
      }).sort({smartFormTripIndex:1,createdAt:1});

      if(existingTrips.length){
        if(s.status!=="CONFIRMED"){
          s.status="CONFIRMED";
          s.confirmedBy=actor(req);
          s.confirmedAt=s.confirmedAt||new Date();
          await s.save();
        }

        return res.json({
          success:true,
          alreadyConfirmed:true,
          trip:existingTrips[0],
          trips:existingTrips,
          submission:sanitizeSubmission(s)
        });
      }
    }

    if(String(s.status||"").toUpperCase()!=="REVIEW"){
      return res.status(409).json({
        success:false,
        message:"Only Smart Form trips in Review can be confirmed"
      });
    }

    const t=await SmartFormTemplate.findOne({
      _id:s.templateId,
      tenantId:g.tenantId,
      active:true
    }).lean();

    if(!t){
      return res.status(404).json({
        success:false,
        message:"Template not found"
      });
    }

    /*
      Re-read operational values from the saved formData.
      This guarantees Confirm uses the same configured Smart Form bindings
      that produced the Review row. A multi-trip form becomes multiple
      normal Trips, but every Trip still uses the same route/pricing logic.
    */
    const tripOps=operationalTrips(t,s.formData||{});
    const op=tripOps[0] || operationalData(t,s.formData||{});

    const missing=[];
    tripOps.forEach((row,index)=>{
      const requiredOps=[
        ["Client Name",row.clientName],
        ["Pickup Address",row.pickupAddress],
        ["Dropoff Address",row.dropoffAddress],
        ["Trip Date",row.tripDate],
        ["Pickup Time",row.pickupTime],
        ["Service",row.serviceName]
      ];
      requiredOps
        .filter(([,value])=>!clean(value))
        .forEach(([label])=>missing.push(`${row.smartFormTripLabel||`Trip ${index+1}`} ${label}`));
    });

    if(missing.length){
      return res.status(400).json({
        success:false,
        message:`Confirm fields missing: ${missing.join(", ")}`
      });
    }

    if(!s.tripNumber){
      s.tripNumber=await nextSmartFormTripNumber(
        g.tenantId,
        op.serviceName
      );
    }

    async function createSmartFormTrip(row,index,total){
      const smartFormCoords=await smartFormResolveTripCoords(
        row.pickupAddress,
        Array.isArray(row.stops) ? row.stops : [],
        row.dropoffAddress
      );

      let smartFormMiles=0;
      let smartFormMinutes=0;
      let smartFormDistanceMeters=0;
      let smartFormDurationSeconds=0;

      try{
        const routePoints=[
          smartFormValidCoords(smartFormCoords.pickupLat,smartFormCoords.pickupLng)
            ? {lat:Number(smartFormCoords.pickupLat),lng:Number(smartFormCoords.pickupLng)}
            : clean(row.pickupAddress),
          ...(Array.isArray(smartFormCoords.stopCoords)
            ? smartFormCoords.stopCoords.map((c,i)=>
                smartFormValidCoords(c?.lat,c?.lng)
                  ? {lat:Number(c.lat),lng:Number(c.lng)}
                  : clean((row.stops||[])[i])
              )
            : []),
          smartFormValidCoords(smartFormCoords.dropoffLat,smartFormCoords.dropoffLng)
            ? {lat:Number(smartFormCoords.dropoffLat),lng:Number(smartFormCoords.dropoffLng)}
            : clean(row.dropoffAddress)
        ].filter(Boolean);

        let routeResult=null;
        if(routeMapEngine && typeof routeMapEngine.calculateRouteMiles === "function"){
          routeResult=await routeMapEngine.calculateRouteMiles(routePoints);
        }else if(routeMapEngine && typeof routeMapEngine.calculateRoute === "function"){
          routeResult=await routeMapEngine.calculateRoute(routePoints);
        }

        const legs=
          routeResult?.legs ||
          routeResult?.googleRoute?.legs ||
          routeResult?.route?.legs ||
          routeResult?.routes?.[0]?.legs ||
          [];

        const legMeters=Array.isArray(legs)
          ? legs.reduce((sum,leg)=>sum+Number(leg?.distance?.value||leg?.distanceMeters||0),0)
          : 0;
        const legSeconds=Array.isArray(legs)
          ? legs.reduce((sum,leg)=>sum+Number(leg?.duration?.value||leg?.durationSeconds||0),0)
          : 0;

        smartFormDistanceMeters=Number(routeResult?.distanceMeters || routeResult?.totalDistanceMeters || routeResult?.distance?.value || legMeters || 0);
        smartFormDurationSeconds=Number(routeResult?.durationSeconds || routeResult?.totalDurationSeconds || routeResult?.duration?.value || legSeconds || 0);
        smartFormMiles=Number(routeResult?.miles || routeResult?.distanceMiles || routeResult?.routeMiles || (smartFormDistanceMeters>0 ? smartFormDistanceMeters*0.000621371 : 0) || 0);
        smartFormMinutes=Number(routeResult?.estimatedMinutes || routeResult?.minutes || routeResult?.durationMinutes || (smartFormDurationSeconds>0 ? smartFormDurationSeconds/60 : 0) || 0);

        smartFormMiles=Number(smartFormMiles.toFixed(2));
        smartFormMinutes=Math.ceil(smartFormMinutes);
      }catch(routeErr){
        console.error("SMART FORM ROUTE CALC ERROR:",routeErr);
      }

      let smartFormPrice=0;
      try{
        const priceResult=await calculateSmartFormPrice({
          tenantId:g.tenantId,
          templateId:t._id,
          serviceKey:clean(row.serviceName),
          serviceName:clean(row.serviceName),
          miles:smartFormMiles,
          minutes:smartFormMinutes,
          stops:Array.isArray(row.stops) ? row.stops.filter(x=>clean(x)).length : 0,
          passengers:Number(s.totalPassengers||1)||1
        });
        smartFormPrice=Number(priceResult?.total||0);
      }catch(priceErr){
        console.error("SMART FORM PRICE CALC ERROR:",priceErr);
      }

      const tripLabel=row.smartFormTripLabel||`Trip ${index+1}`;
      const tripNumber=total>1 ? `${s.tripNumber}-T${index+1}` : s.tripNumber;
      const tripPayload={
        tenantId:g.tenantId,
        type:"company",
        tripNumber,
        smartFormSubmissionId:s._id,
        smartFormBaseTripNumber:s.tripNumber,
        smartFormTripIndex:index+1,
        smartFormTripLabel:tripLabel,
        company:clean(s.organizationName||t.name||"Smart Form"),
        entryName:actor(req),
        entryPhone:"",
        clientName:clean(row.clientName),
        clientPhone:clean(s.clientPhone || s.phone || ""),
        serviceType:clean(row.serviceName),
        serviceKey:clean(row.serviceName),
        serviceCode:clean(row.serviceName),
        pickup:clean(row.pickupAddress),
        pickupLat:smartFormCoords.pickupLat,
        pickupLng:smartFormCoords.pickupLng,
        dropoff:clean(row.dropoffAddress),
        dropoffLat:smartFormCoords.dropoffLat,
        dropoffLng:smartFormCoords.dropoffLng,
        stops:Array.isArray(row.stops) ? row.stops.map(clean).filter(Boolean) : [],
        stopCoords:smartFormCoords.stopCoords,
        tripDate:clean(row.tripDate),
        tripTime:clean(row.pickupTime),
        isShared:false,
        groupId:"",
        tripType:"INDIVIDUAL",
        totalPassengers:Number(s.totalPassengers||1) || 1,
        miles:smartFormMiles,
        distanceMiles:smartFormMiles,
        distanceMeters:smartFormDistanceMeters,
        durationSeconds:smartFormDurationSeconds,
        durationMinutes:smartFormMinutes,
        estimatedMinutes:smartFormMinutes,
        priceAmount:smartFormPrice,
        finalPrice:smartFormPrice,
        source:"SMART_FORM",
        bookingSource:"SMART_FORM",
        bookingData:{
          smartFormBaseTripNumber:s.tripNumber,
          smartFormTripNumber:tripNumber,
          smartFormTripLabel:tripLabel
        },
        status:"Scheduled",
        dispatchSelected:true,
        disabled:false,
        bookedAt:new Date(),
        createdAt:new Date()
      };

      let trip;
      try{
        trip=await Trip.create(tripPayload);
      }catch(createErr){
        if(createErr?.code===11000){
          trip=await Trip.findOne({tenantId:g.tenantId,tripNumber});
        }
        if(!trip) throw createErr;
      }

      if(typeof global.ensureTripCoords==="function"){
        await global.ensureTripCoords(trip);
        trip=await Trip.findOne({_id:trip._id,tenantId:g.tenantId}) || trip;
      }

      if(trip && trip._id){
        await Trip.updateOne(
          {_id:trip._id,tenantId:g.tenantId},
          {$set:{dispatchSelected:true,disabled:false,status:"Scheduled"}}
        );
        trip=await Trip.findOne({_id:trip._id,tenantId:g.tenantId}) || trip;
      }

      return {trip,price:smartFormPrice,miles:smartFormMiles,minutes:smartFormMinutes,tripNumber,tripLabel};
    }

    const createdTrips=[];
    for(let i=0;i<tripOps.length;i++){
      createdTrips.push(await createSmartFormTrip(tripOps[i],i,tripOps.length));
    }

    const firstCreated=createdTrips[0];
    s.pricing={
      calculated:true,
      amount:Number(firstCreated?.price||0),
      currency:"USD",
      pricingMode:"",
      miles:Number(firstCreated?.miles||0),
      minutes:Number(firstCreated?.minutes||0)
    };

    /*
      Do not mark the Smart Form confirmed until the normal Trip exists.
      This keeps Review -> Confirm -> Dispatch atomic from the user's view.
    */
    Object.assign(s,{
      ...op,
      tripId:createdTrips[0]?.trip?._id || null,
      tripIds:createdTrips.map(row=>row.trip?._id).filter(Boolean),
      multiTripCount:Math.max(1,createdTrips.length),
      smartFormTrips:createdTrips.map((row,index)=>({
        tripId:row.trip?._id || null,
        tripNumber:row.tripNumber,
        tripIndex:index+1,
        tripLabel:row.tripLabel
      })),
      status:"CONFIRMED",
      confirmedBy:actor(req),
      confirmedAt:new Date()
    });

    await s.save();

    return res.json({
      success:true,
      trip:createdTrips[0]?.trip || null,
      trips:createdTrips.map(row=>row.trip).filter(Boolean),
      submission:sanitizeSubmission(s)
    });

  }catch(err){
    console.error("SMART FORM CONFIRM ERROR:",err);
    return res.status(500).json({
      success:false,
      message:err?.message||"Failed to confirm form"
    });
  }
});

router.delete("/submissions/:id", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const s=await SmartFormSubmission.findOne({_id:req.params.id,tenantId:g.tenantId});
    if(!s) return res.status(404).json({success:false,message:"Submission not found"});
    if(s.status==="CONFIRMED") return res.status(409).json({success:false,message:"Confirmed form cannot be deleted"});
    await s.deleteOne();
    res.json({success:true});
  }catch(err){res.status(500).json({success:false,message:"Failed to delete submission"});}
});

router.post("/submissions/:id/generate-pdf", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    const result=await generateFinalPdf({tenantId:g.tenantId,submissionId:req.params.id});
    res.json({success:true,fileName:result.fileName,generatedAt:result.submission.generatedPdf.generatedAt});
  }catch(err){res.status(err?.statusCode||500).json({success:false,message:err?.message||"Failed to generate PDF"});}
});

router.get("/submissions/:id/pdf", async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;

    /*
      generatedPdf.data is select:false in the submission model.
      Select the binary field explicitly. Do not mix the parent generatedPdf
      projection with +generatedPdf.data because that can make the PDF read
      fail even though generation succeeded.
    */
    const s=await SmartFormSubmission
      .findOne({_id:req.params.id,tenantId:g.tenantId})
      .select("+generatedPdf.data");

    if(!s){
      return res.status(404).json({
        success:false,
        message:"Submission not found"
      });
    }

    const pdfData=s?.generatedPdf?.data;

    if(!pdfData || !pdfData.length){
      return res.status(404).json({
        success:false,
        message:"Generated PDF not found"
      });
    }

    res.setHeader("Content-Type","application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${String(s.generatedPdf.fileName||"smart-form.pdf").replace(/"/g,"")}"`
    );
    res.setHeader("Content-Length",String(pdfData.length));
    return res.end(pdfData);

  }catch(err){
    console.error("SMART FORM PDF LOAD ERROR:",err);
    return res.status(500).json({
      success:false,
      message:err?.message||"Failed to load generated PDF"
    });
  }
});


// Upload a completed copy of the SAME or a substantially similar Smart Form.
// Extract configured fields AND preserve every additional labeled value the AI can reliably read.
// Newly discovered fields are learned by this template as optional MANUAL fields, so future
// uploads can keep reading/saving them instead of silently discarding unknown data.
// Missing values are allowed so staff can complete them manually before Send to Review.
// A clearly different/unrelated document is rejected and never creates a submission.
const completedFormUpload = multer({storage:multer.memoryStorage(),limits:{fileSize:20*1024*1024}});
router.post("/templates/:id/import-completed", completedFormUpload.single("file"), async (req,res)=>{
  try{
    const g=await gate(req,res); if(!g) return;
    if(!req.file?.buffer?.length) return res.status(400).json({success:false,message:"Completed form file is required"});
    const t=await SmartFormTemplate.findOne({_id:req.params.id,tenantId:g.tenantId,active:true});
    if(!t) return res.status(404).json({success:false,message:"Template not found"});
    if(!process.env.GEMINI_API_KEY) return res.status(503).json({success:false,message:"GEMINI_API_KEY is not configured on the server"});

    const fields=(t.fields||[])
      .filter(f=>f.type!=="SIGNATURE")
      .map(f=>({key:f.key,label:f.label,type:f.type,required:f.required===true}));

    const prompt=`You validate and extract a completed transportation form for GH Mobility.
The selected GH Mobility template is named ${JSON.stringify(t.name)}.
Configured fields: ${JSON.stringify(fields)}

FIRST decide whether the uploaded document is the same form or a substantially similar version of this selected template.
Compatibility is based on the document purpose, recognizable field labels/meaning, and overall transportation-form structure.
Missing or blank values DO NOT make the document incompatible; staff will complete missing data later.
A different layout/version is allowed when it clearly represents the same kind of form and its data maps reliably to these configured fields.
REJECT an unrelated document, a different form type whose fields do not correspond to the configured template, or a document where mapping would require guessing.

If compatible, extract every reliably readable labeled value from the uploaded form. Never invent a value.
For fields that match a configured field, put the value in formData using that field's EXACT configured key.
For any other labeled field/value that is present on the document but is not configured yet, put it in extraFields.
Preserve the visible label and the value as read. Do not discard an unfamiliar field just because its meaning is unknown.
If a configured field is blank/unreadable/missing, return an empty string for that configured key.
Do not put the same field in both formData and extraFields.
Return JSON only in exactly this shape:
{"matchStatus":"MATCH","reason":"","formData":{"EXACT_CONFIGURED_KEY":"value"},"extraFields":[{"label":"Visible field label","value":"value"}]}
If incompatible return:
{"matchStatus":"REJECT","reason":"short factual reason","formData":{},"extraFields":[]}
Use EXACT configured keys for formData. extraFields is only for additional fields that are not already configured.`;

    // Completed-form extraction uses its own Gemini model settings.
    // This deliberately does not inherit SMART_FORMS_GEMINI_MODEL, so a model
    // selected for PDF field detection cannot accidentally affect imports.
    const requestBody={
      contents:[{role:"user",parts:[
        {text:prompt},
        {inlineData:{mimeType:req.file.mimetype||"application/pdf",data:req.file.buffer.toString("base64")}}
      ]}],
      generationConfig:{responseMimeType:"application/json",maxOutputTokens:8192}
    };

    let attempt;
    try{
      attempt=await smartFormGeminiGenerateContent(
        [process.env.SMART_FORMS_IMPORT_GEMINI_MODEL,process.env.SMART_FORMS_IMPORT_GEMINI_FALLBACK_MODEL],
        requestBody,
        "Smart Forms import"
      );
    }catch(err){
      if(smartFormGeminiCanFallback(err?.status,err?.message)){
        return res.status(503).json({success:false,code:"SMART_FORM_AI_TEMPORARILY_UNAVAILABLE",message:"Form reader is temporarily busy. Please try the upload again."});
      }
      throw err;
    }
    const raw=attempt.raw;
    const txt=(raw?.candidates||[]).flatMap(c=>c?.content?.parts||[]).map(x=>x?.text||"").join("\n").replace(/^```(?:json)?/i,"").replace(/```$/i,"").trim();
    const parsed=JSON.parse(txt||"{}");

    if(String(parsed?.matchStatus||"").trim().toUpperCase()!=="MATCH"){
      return res.status(422).json({
        success:false,
        code:"SMART_FORM_MISMATCH",
        message:clean(parsed?.reason)||"Uploaded form does not match the selected Smart Form template"
      });
    }

    const incoming=parsed.formData&&typeof parsed.formData==="object"?parsed.formData:{};
    const allowed=new Set(fields.map(f=>f.key));
    const formData={};
    for(const f of fields) formData[f.key]="";
    for(const [k,v] of Object.entries(incoming)){
      if(allowed.has(k)) formData[k]=v??"";
    }

    // Learn every additional labeled value instead of throwing it away.
    // A learned field is optional and MANUAL by default. It has no PDF mapping until
    // an admin chooses to map it, but its value is immediately preserved in formData.
    const extras=Array.isArray(parsed.extraFields)?parsed.extraFields:[];
    const existingLabels=new Set((t.fields||[]).map(f=>clean(f.label).toLowerCase()).filter(Boolean));
    const existingKeys=new Set((t.fields||[]).map(f=>clean(f.key)).filter(Boolean));
    const learnedFields=[];
    let learnedIndex=0;

    for(const row of extras){
      const label=clean(row?.label);
      if(!label) continue;
      const value=row?.value??"";
      const labelKey=label.toLowerCase();

      // If Gemini returned an already-known label as an extra, keep the configured field
      // authoritative and do not create a duplicate template field.
      const known=(t.fields||[]).find(f=>clean(f.label).toLowerCase()===labelKey);
      if(known){
        if(!hasValue(formData[known.key]) && hasValue(value)) formData[known.key]=value;
        continue;
      }
      if(existingLabels.has(labelKey)) continue;

      let base=label.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");
      if(!base) base="learned_field";
      let key=`ai_${base}`;
      while(existingKeys.has(key)){
        learnedIndex+=1;
        key=`ai_${base}_${learnedIndex}`;
      }

      const learned={
        key,
        label,
        type:"TEXT",
        required:false,
        placeholder:"",
        options:[],
        widthPercent:50,
        order:(t.fields||[]).length+learnedFields.length,
        tripBinding:"",
        sourceType:"MANUAL",
        repeat:false,
        mapping:{mapped:false,page:1,xPercent:0,yPercent:0,widthPercent:20,heightPercent:4,fontSize:10,textAlign:"LEFT"},
        mappings:[]
      };

      learnedFields.push(learned);
      existingLabels.add(labelKey);
      existingKeys.add(key);
      formData[key]=value;
    }

    if(learnedFields.length){
      t.fields=[...(t.fields||[]),...learnedFields];
      t.updatedBy=actor(req);
      await t.save();
    }

    const learnedTemplate=learnedFields.length
      ? await SmartFormTemplate.findOne({_id:t._id,tenantId:g.tenantId}).lean()
      : t;
    const op=operationalData(learnedTemplate,formData);
    return res.json({
      success:true,
      templateId:String(t._id),
      templateName:t.name,
      matchStatus:"MATCH",
      formData,
      learnedFields:learnedFields.map(f=>({key:f.key,label:f.label})),
      template:sanitizeTemplate(learnedTemplate),
      operationalData:op,
      importSource:{
        fileName:req.file.originalname||"completed-form",
        mimeType:req.file.mimetype||"",
        imported:true
      }
    });
  }catch(err){
    console.error("SMART FORM IMPORT ERROR",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to extract completed form"});
  }
});

// Price a Smart Form trip using the selected template's private pricing engine.
router.post("/templates/:id/calculate-price", async (req,res)=>{
  try{const g=await gate(req,res);if(!g)return;const result=await calculateSmartFormPrice({...req.body,tenantId:g.tenantId,templateId:req.params.id});res.json(result);}
  catch(err){res.status(err?.statusCode||500).json({success:false,message:err?.message||"Failed to calculate Smart Form price"});}
});

/* =====================================================
   SMART FORM HUB -> SPLIT -> FINAL REVIEW
   These routes are isolated to SmartFormSubmission records.
   They never read or update Broker ExternalTrip records.
===================================================== */
function smartFormEngineTrip(row){
  return {
    ...row,
    id:String(row._id),
    _id:row._id,
    tripId:String(row._id),
    tripNumber:clean(row.tripNumber),
    tripDate:clean(row.tripDate),
    tripTime:clean(row.pickupTime),
    pickup:clean(row.pickupAddress),
    dropoff:clean(row.dropoffAddress),
    pickupAddress:clean(row.pickupAddress),
    dropoffAddress:clean(row.dropoffAddress),
    serviceName:clean(row.serviceName),
    serviceKey:clean(row.serviceName),
    source:"COMPANY",
    passengers:1
  };
}

async function resolveSmartFormSubmissionCoords(row){
  const coords=await smartFormResolveTripCoords(
    row.pickupAddress,
    Array.isArray(row.stops)?row.stops:[],
    row.dropoffAddress
  );
  return {...row,...coords};
}

async function priceSmartFormWorkflowSubmission(tenantId,row){
  const enriched=await resolveSmartFormSubmissionCoords(row);
  let miles=Number(enriched.distanceMiles||enriched.miles||0);
  let minutes=Number(enriched.durationMinutes||enriched.estimatedMinutes||0);

  try{
    const points=[
      smartFormValidCoords(enriched.pickupLat,enriched.pickupLng)
        ? {lat:Number(enriched.pickupLat),lng:Number(enriched.pickupLng)}
        : clean(enriched.pickupAddress),
      ...(Array.isArray(enriched.stopCoords)&&enriched.stopCoords.length
        ? enriched.stopCoords.map((c,i)=>
            smartFormValidCoords(c?.lat,c?.lng)
              ? {lat:Number(c.lat),lng:Number(c.lng)}
              : clean((enriched.stops||[])[i])
          )
        : (enriched.stops||[]).map(clean)),
      smartFormValidCoords(enriched.dropoffLat,enriched.dropoffLng)
        ? {lat:Number(enriched.dropoffLat),lng:Number(enriched.dropoffLng)}
        : clean(enriched.dropoffAddress)
    ].filter(Boolean);

    let routeResult=null;
    if(routeMapEngine&&typeof routeMapEngine.calculateRouteMiles==="function")
      routeResult=await routeMapEngine.calculateRouteMiles(points);
    else if(routeMapEngine&&typeof routeMapEngine.calculateRoute==="function")
      routeResult=await routeMapEngine.calculateRoute(points);

    const legs=routeResult?.legs||routeResult?.googleRoute?.legs||routeResult?.route?.legs||routeResult?.routes?.[0]?.legs||[];
    const meters=Number(routeResult?.distanceMeters||routeResult?.totalDistanceMeters||routeResult?.distance?.value||(Array.isArray(legs)?legs.reduce((sum,leg)=>sum+Number(leg?.distance?.value||leg?.distanceMeters||0),0):0)||0);
    const seconds=Number(routeResult?.durationSeconds||routeResult?.totalDurationSeconds||routeResult?.duration?.value||(Array.isArray(legs)?legs.reduce((sum,leg)=>sum+Number(leg?.duration?.value||leg?.durationSeconds||0),0):0)||0);
    miles=Number(Number(routeResult?.miles||routeResult?.distanceMiles||routeResult?.routeMiles||(meters>0?meters*0.000621371:0)||miles||0).toFixed(2));
    minutes=Math.ceil(Number(routeResult?.estimatedMinutes||routeResult?.minutes||routeResult?.durationMinutes||(seconds>0?seconds/60:0)||minutes||0));
  }catch(routeErr){
    console.error("SMART FORM WORKFLOW ROUTE CALC ERROR:",routeErr);
  }

  const priceResult=await calculateSmartFormPrice({
    tenantId,
    templateId:enriched.templateId,
    serviceKey:clean(enriched.serviceName),
    serviceName:clean(enriched.serviceName),
    miles,
    minutes,
    stops:Array.isArray(enriched.stops)?enriched.stops.filter(x=>clean(x)).length:0,
    passengers:Number(enriched.totalPassengers||1)||1
  });

  const amount=Number(priceResult?.total||0);
  if(!Number.isFinite(amount) || amount<=0){
    const err=new Error(
      "Smart Form price calculated as $0.00. Check this template pricing, selected service, and route miles before confirming."
    );
    err.statusCode=400;
    err.code="SMART_FORM_PRICING_ZERO";
    throw err;
  }

  const pricing={
    calculated:true,
    amount,
    currency:priceResult?.currency||"USD",
    pricingMode:priceResult?.pricingMode||"",
    miles,
    minutes
  };

  await SmartFormSubmission.updateOne(
    {_id:enriched._id,tenantId},
    {$set:{pricing,distanceMiles:miles,durationMinutes:minutes}}
  );

  return {...enriched,pricing,distanceMiles:miles,durationMinutes:minutes,priceAmount:amount,finalPrice:amount};
}

/* SMART FORM HUB FIXED V3 — Hub list, edit, confirm and delete workflow */
router.get("/workflow/hub",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    const rows=await SmartFormSubmission.find({
      tenantId:g.tenantId,
      status:"REVIEW",
      sharedGroupId:{$in:["",null]},
      $or:[{workflowStage:{$in:["HUB","SPLIT"]}},{workflowStage:{$exists:false}}]
    }).sort({tripDate:1,pickupTime:1,createdAt:1}).limit(1000).lean();
    return res.json({success:true,submissions:rows.map(sanitizeSubmission)});
  }catch(err){
    console.error("SMART FORM HUB ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to load Smart Form Hub"});
  }
});

router.patch("/workflow/hub/:id",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    if(!mongoose.Types.ObjectId.isValid(req.params.id)){
      return res.status(400).json({success:false,message:"Invalid Smart Form trip id"});
    }
    const submission=await SmartFormSubmission.findOne({
      _id:req.params.id,
      tenantId:g.tenantId,
      status:"REVIEW",
      tripId:null,
      sharedGroupId:{$in:["",null]},
      $or:[{workflowStage:{$in:["HUB","SPLIT"]}},{workflowStage:{$exists:false}}]
    });
    if(!submission)return res.status(409).json({success:false,message:"This trip has already moved to final Review and cannot be edited from the Hub."});
    const template=await SmartFormTemplate.findOne({
      _id:submission.templateId,tenantId:g.tenantId
    }).lean();
    if(!template)return res.status(404).json({success:false,message:"Saved Smart Form template not found"});

    const incoming=req.body?.formData&&typeof req.body.formData==="object"?req.body.formData:{};
    const nextData={...(submission.formData||{})};
    for(const field of submission.fieldSnapshot||[]){
      const key=clean(field?.key);
      if(key&&Object.prototype.hasOwnProperty.call(incoming,key))nextData[key]=incoming[key];
    }
    const missing=(submission.fieldSnapshot||[])
      .filter(field=>field?.required===true&&clean(field?.type).toUpperCase()!=="SIGNATURE")
      .filter(field=>!hasValue(nextData[field.key]))
      .map(field=>clean(field.label)||clean(field.key));
    if(missing.length)return res.status(400).json({success:false,message:`Required fields missing: ${missing.join(", ")}`});

    const operational=operationalData(
      {...template,fields:Array.isArray(submission.fieldSnapshot)?submission.fieldSnapshot:[]},
      nextData
    );
    const requiredOps=[
      ["Client Name",operational.clientName],
      ["Pickup Address",operational.pickupAddress],
      ["Dropoff Address",operational.dropoffAddress],
      ["Trip Date",operational.tripDate],
      ["Pickup Time",operational.pickupTime],
      ["Service",operational.serviceName]
    ].filter(([,value])=>!value).map(([label])=>label);
    if(requiredOps.length)return res.status(400).json({success:false,message:`Review fields missing: ${requiredOps.join(", ")}`});

    submission.formData=nextData;
    submission.clientName=operational.clientName;
    submission.pickupAddress=operational.pickupAddress;
    submission.dropoffAddress=operational.dropoffAddress;
    submission.stops=operational.stops;
    submission.tripDate=operational.tripDate;
    submission.pickupTime=operational.pickupTime;
    submission.serviceName=operational.serviceName;
    submission.workflowStage="HUB";
    submission.splitDisposition="ORIGINAL";
    submission.sharedGroupId="";
    await submission.save();
    return res.json({success:true,submission:sanitizeSubmission(submission)});
  }catch(err){
    console.error("SMART FORM HUB EDIT ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to update Smart Form trip"});
  }
});

router.delete("/workflow/hub/:id",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    if(!mongoose.Types.ObjectId.isValid(req.params.id)){
      return res.status(400).json({success:false,message:"Invalid Smart Form trip id"});
    }
    const submission=await SmartFormSubmission.findOne({
      _id:req.params.id,
      tenantId:g.tenantId,
      status:"REVIEW",
      tripId:null,
      sharedGroupId:{$in:["",null]},
      $or:[{workflowStage:{$in:["HUB","SPLIT"]}},{workflowStage:{$exists:false}}]
    });
    if(!submission)return res.status(409).json({success:false,message:"This trip has already moved to final Review and cannot be deleted from the Hub."});

    await submission.deleteOne();
    return res.json({success:true,deletedId:String(submission._id)});
  }catch(err){
    console.error("SMART FORM HUB DELETE ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to delete Smart Form trip"});
  }
});

router.post("/workflow/split/enter",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    const ids=[...new Set((Array.isArray(req.body?.submissionIds)?req.body.submissionIds:[])
      .map(clean).filter(id=>mongoose.Types.ObjectId.isValid(id)))];
    if(!ids.length)return res.status(400).json({success:false,message:"Select Smart Form trips to open in Split"});
    const result=await SmartFormSubmission.updateMany(
      {_id:{$in:ids},tenantId:g.tenantId,status:"REVIEW",$or:[{workflowStage:"HUB"},{workflowStage:{$exists:false}}],tripId:null},
      {$set:{workflowStage:"SPLIT",splitDisposition:"ORIGINAL",sharedGroupId:""}}
    );
    const moved=Number(result.modifiedCount??result.nModified??0);
    return res.json({success:true,movedCount:moved,submissionIds:ids});
  }catch(err){
    console.error("SMART FORM SPLIT ENTER ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to move trips into Split"});
  }
});

router.get("/workflow/split/bootstrap",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    const {today,tomorrow}=smartFormSplitDateWindow(new Date(),g.timezone);
    const allowedDates=new Set([today,tomorrow]);
    const [splitRows,openGroups,confirmedRows]=await Promise.all([
      SmartFormSubmission.find({tenantId:g.tenantId,status:"REVIEW",workflowStage:"SPLIT"})
        .sort({tripDate:1,pickupTime:1,createdAt:1}).limit(3000).lean(),
      SharedTripGroup.find({tenantId:g.tenantId,sourceType:"SMART_FORM",status:"OPEN"})
        .sort({tripDate:1,createdAt:1}).limit(1000).lean(),
      SmartFormSubmission.find({tenantId:g.tenantId,workflowStage:{$in:["FINAL_REVIEW","DISPATCHED"]}})
        .select("tripDate").limit(5000).lean()
    ]);
    const rows=splitRows.filter(row=>allowedDates.has(smartFormSplitDateKey(row.tripDate,g.timezone)));
    const groups=openGroups.filter(group=>allowedDates.has(smartFormSplitDateKey(group.tripDate,g.timezone)));
    const confirmedCount=confirmedRows.filter(row=>allowedDates.has(smartFormSplitDateKey(row.tripDate,g.timezone))).length;
    const ids=[...new Set(groups.flatMap(x=>(Array.isArray(x.tripIds)?x.tripIds:[]).map(String)))];
    const groupRows=ids.length?await SmartFormSubmission.find({_id:{$in:ids},tenantId:g.tenantId,status:"REVIEW"}).lean():[];
    const rowMap=new Map(groupRows.map(x=>[String(x._id),sanitizeSubmission(x)]));
    const outGroups=groups.map(group=>({
      ...group,
      tripIds:(group.tripIds||[]).map(String),
      trips:(group.tripIds||[]).map(id=>rowMap.get(String(id))).filter(Boolean)
    }));
    return res.json({success:true,submissions:rows.map(sanitizeSubmission),groups:outGroups,confirmedCount,today,tomorrow});
  }catch(err){
    console.error("SMART FORM SPLIT BOOTSTRAP ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to load Smart Form Split"});
  }
});

router.patch("/workflow/split/:id",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    if(!mongoose.Types.ObjectId.isValid(req.params.id))return res.status(400).json({success:false,message:"Invalid Smart Form trip id"});
    const submission=await SmartFormSubmission.findOne({
      _id:req.params.id,tenantId:g.tenantId,status:"REVIEW",workflowStage:"SPLIT",
      tripId:null,sharedGroupId:{$in:["",null]}
    });
    if(!submission)return res.status(409).json({success:false,message:"Only an ungrouped Split trip can be edited"});
    const template=await SmartFormTemplate.findOne({_id:submission.templateId,tenantId:g.tenantId}).lean();
    if(!template)return res.status(404).json({success:false,message:"Smart Form template not found"});
    const incoming=req.body?.formData&&typeof req.body.formData==="object"?req.body.formData:{};
    const nextData={...(submission.formData||{})};
    for(const field of Array.isArray(submission.fieldSnapshot)?submission.fieldSnapshot:[]){
      const key=clean(field?.key);
      if(key&&Object.prototype.hasOwnProperty.call(incoming,key))nextData[key]=incoming[key];
    }
    const missing=(submission.fieldSnapshot||[])
      .filter(field=>field?.required===true&&clean(field?.type).toUpperCase()!=="SIGNATURE")
      .filter(field=>!hasValue(nextData[field.key]))
      .map(field=>clean(field.label)||clean(field.key));
    if(missing.length)return res.status(400).json({success:false,message:`Required fields missing: ${missing.join(", ")}`});
    const operational=operationalData({...template,fields:submission.fieldSnapshot||[]},nextData);
    const requiredOps=[["Client Name",operational.clientName],["Pickup Address",operational.pickupAddress],["Dropoff Address",operational.dropoffAddress],["Trip Date",operational.tripDate],["Pickup Time",operational.pickupTime],["Service",operational.serviceName]]
      .filter(([,value])=>!value).map(([label])=>label);
    if(requiredOps.length)return res.status(400).json({success:false,message:`Review fields missing: ${requiredOps.join(", ")}`});
    Object.assign(submission,{
      formData:nextData,clientName:operational.clientName,pickupAddress:operational.pickupAddress,
      dropoffAddress:operational.dropoffAddress,stops:operational.stops,tripDate:operational.tripDate,
      pickupTime:operational.pickupTime,serviceName:operational.serviceName
    });
    await submission.save();
    return res.json({success:true,submission:sanitizeSubmission(submission)});
  }catch(err){
    console.error("SMART FORM SPLIT EDIT ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to update Smart Form Split trip"});
  }
});

router.post("/workflow/split/share",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    const ids=[...new Set((Array.isArray(req.body?.submissionIds)?req.body.submissionIds:[])
      .map(clean).filter(id=>mongoose.Types.ObjectId.isValid(id)))];
    if(ids.length<2)return res.status(400).json({success:false,message:"Select at least two Smart Form trips"});
    const rows=await SmartFormSubmission.find({
      _id:{$in:ids},tenantId:g.tenantId,status:"REVIEW",
      workflowStage:{$in:["HUB","SPLIT"]},tripId:null
    }).lean();
    if(rows.length!==ids.length)return res.status(404).json({success:false,message:"One or more selected Smart Form trips are unavailable"});
    const openGroup=await SharedTripGroup.findOne({tenantId:g.tenantId,sourceType:"SMART_FORM",status:"OPEN",tripIds:{$in:ids}}).lean();
    if(openGroup)return res.status(409).json({success:false,message:"One or more selected trips already belong to an open Smart Form share group"});

    const withCoords=await Promise.all(rows.map(resolveSmartFormSubmissionCoords));
    const settingsDoc=await SharedEngineSettings.findOne({tenantId:g.tenantId}).lean();
    const plan=await planSharedTrips({
      trips:withCoords.map(smartFormEngineTrip),
      source:"COMPANY",
      settings:mergeSettings(settingsDoc||{})
    });
    const rowMap=new Map(withCoords.map(row=>[String(row._id),row]));
    const savedGroups=[];
    const claimed=new Set();
    for(const engineGroup of Array.isArray(plan?.groups)?plan.groups:[]){
      const tripIds=(Array.isArray(engineGroup.tripIds)?engineGroup.tripIds:[])
        .map(String).filter(id=>rowMap.has(id));
      if(tripIds.length<2)continue;
      const groupId=`SF-${new mongoose.Types.ObjectId().toString()}`;
      const data={...engineGroup,groupId,tripIds};
      const saved=await SharedTripGroup.create({
        tenantId:g.tenantId,sourceType:"SMART_FORM",groupId,
        tripDate:clean(engineGroup.tripDate||rowMap.get(tripIds[0])?.tripDate),
        tripIds:tripIds.map(id=>new mongoose.Types.ObjectId(id)),
        tripNumbers:tripIds.map(id=>clean(rowMap.get(id)?.tripNumber)),
        routePlan:Array.isArray(engineGroup.routePlan)?engineGroup.routePlan:[],
        routePoints:Array.isArray(engineGroup.routePoints)?engineGroup.routePoints:[],
        schedule:engineGroup.schedule||{},
        calculatedFirstPickupTime:clean(engineGroup.calculatedFirstPickupTime),
        routeMiles:Number(engineGroup.routeMiles||0),
        routeMinutes:Number(engineGroup.routeMinutes||0),
        polyline:clean(engineGroup.polyline),engineData:data,
        status:"OPEN",createdBy:actor(req)
      });
      await SmartFormSubmission.updateMany(
        {_id:{$in:tripIds},tenantId:g.tenantId,status:"REVIEW"},
        {$set:{workflowStage:"SPLIT",splitDisposition:"SHARED",sharedGroupId:groupId}}
      );
      tripIds.forEach(id=>claimed.add(id));
      savedGroups.push({...saved.toObject(),tripIds,trips:tripIds.map(id=>sanitizeSubmission(rowMap.get(id)))});
    }

    const individualIds=ids.filter(id=>!claimed.has(id));
    if(individualIds.length){
      await SmartFormSubmission.updateMany(
        {_id:{$in:individualIds},tenantId:g.tenantId,status:"REVIEW",tripId:null},
        {$set:{workflowStage:"SPLIT",splitDisposition:"INDIVIDUAL",sharedGroupId:""}}
      );
    }
    return res.json({success:true,groups:savedGroups,individualSubmissionIds:individualIds,plan});
  }catch(err){
    console.error("SMART FORM SPLIT SHARE ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to build Smart Form share groups"});
  }
});

router.post("/workflow/split/restore",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    const groupId=clean(req.body?.groupId);
    const group=await SharedTripGroup.findOne({tenantId:g.tenantId,sourceType:"SMART_FORM",groupId,status:"OPEN"});
    if(!group)return res.status(404).json({success:false,message:"Open Smart Form share group not found"});
    const ids=(group.tripIds||[]).map(String);
    await SmartFormSubmission.updateMany(
      {_id:{$in:ids},tenantId:g.tenantId,status:"REVIEW",workflowStage:"SPLIT",sharedGroupId:groupId},
      {$set:{workflowStage:"SPLIT",splitDisposition:"ORIGINAL",sharedGroupId:""}}
    );
    group.status="RESTORED";group.restoredAt=new Date();group.restoredBy=actor(req);await group.save();
    return res.json({success:true,restoredSubmissionIds:ids});
  }catch(err){
    console.error("SMART FORM SPLIT RESTORE ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to restore Smart Form trips"});
  }
});

router.post("/workflow/split/restore-individuals",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    const ids=[...new Set((Array.isArray(req.body?.submissionIds)?req.body.submissionIds:[])
      .map(clean).filter(id=>mongoose.Types.ObjectId.isValid(id)))];
    if(!ids.length)return res.status(400).json({success:false,message:"Select individual Smart Form trips to restore"});
    const result=await SmartFormSubmission.updateMany({
      _id:{$in:ids},tenantId:g.tenantId,status:"REVIEW",workflowStage:"SPLIT",
      sharedGroupId:{$in:["",null]},splitDisposition:"INDIVIDUAL",tripId:null
    },{$set:{splitDisposition:"ORIGINAL"}});
    return res.json({success:true,restoredCount:Number(result.modifiedCount??result.nModified??0),submissionIds:ids});
  }catch(err){
    console.error("SMART FORM SPLIT INDIVIDUAL RESTORE ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to restore individual Smart Form trips"});
  }
});

router.post("/workflow/split/confirm",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    const groupIds=[...new Set((Array.isArray(req.body?.groupIds)?req.body.groupIds:[]).map(clean).filter(Boolean))];
    const individualIds=[...new Set((Array.isArray(req.body?.individualSubmissionIds)?req.body.individualSubmissionIds:[])
      .map(clean).filter(id=>mongoose.Types.ObjectId.isValid(id)))];
    if(!groupIds.length&&!individualIds.length)return res.status(400).json({success:false,message:"Select share groups or individual trips to move to Review"});
    const createdTrips=[];
    const allSubmissionIds=[];
    const groups=groupIds.length?await SharedTripGroup.find({tenantId:g.tenantId,sourceType:"SMART_FORM",status:"OPEN",groupId:{$in:groupIds}}):[];
    if(groups.length!==groupIds.length)return res.status(404).json({success:false,message:"One or more Smart Form share groups are unavailable"});

    for(const group of groups){
      const ids=(group.tripIds||[]).map(String);
      if(ids.length<2)throw new Error("A Smart Form share group needs at least two trips");
      let rows=await SmartFormSubmission.find({_id:{$in:ids},tenantId:g.tenantId,status:"REVIEW",workflowStage:"SPLIT",sharedGroupId:group.groupId}).lean();
      if(rows.length!==ids.length)throw new Error("One or more trips in a Smart Form share group are missing");
      rows=await Promise.all(rows.map(row=>priceSmartFormWorkflowSubmission(g.tenantId,row)));
      const ordered=ids.map(id=>rows.find(row=>String(row._id)===id)).filter(Boolean);
      const payload=buildSmartFormTripPayload({tenantId:g.tenantId,submissions:ordered,group:group.engineData||group,actorName:actor(req)});
      let trip=await Trip.findOne({tenantId:g.tenantId,source:"SMART_FORM",groupId:group.groupId,isShared:true});
      if(!trip)trip=await Trip.create(payload);
      await SmartFormSubmission.updateMany({_id:{$in:ids},tenantId:g.tenantId,status:"REVIEW"},{$set:{tripId:trip._id,workflowStage:"FINAL_REVIEW"}});
      group.status="CONFIRMED";group.confirmedAt=new Date();group.confirmedBy=actor(req);group.dispatchTripId=trip._id;await group.save();
      createdTrips.push(trip);allSubmissionIds.push(...ids);
    }

    for(const id of individualIds){
      const row=await SmartFormSubmission.findOne({_id:id,tenantId:g.tenantId,status:"REVIEW",workflowStage:"SPLIT",sharedGroupId:""}).lean();
      if(!row)throw new Error("One or more selected individual Smart Form trips are unavailable");
      const withCoords=await priceSmartFormWorkflowSubmission(g.tenantId,row);
      const payload=buildSmartFormTripPayload({tenantId:g.tenantId,submissions:[withCoords],actorName:actor(req)});
      let trip=await Trip.findOne({tenantId:g.tenantId,tripNumber:payload.tripNumber,source:"SMART_FORM"});
      if(!trip)trip=await Trip.create(payload);
      await SmartFormSubmission.updateOne({_id:id,tenantId:g.tenantId,status:"REVIEW"},{$set:{tripId:trip._id,workflowStage:"FINAL_REVIEW"}});
      createdTrips.push(trip);allSubmissionIds.push(id);
    }
    return res.json({success:true,movedCount:allSubmissionIds.length,submissionIds:allSubmissionIds,trips:createdTrips});
  }catch(err){
    console.error("SMART FORM SPLIT CONFIRM ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to move Smart Form trips to Review"});
  }
});

router.get("/workflow/review",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    const rows=await SmartFormSubmission.find({tenantId:g.tenantId,status:"REVIEW",workflowStage:"FINAL_REVIEW"})
      .sort({tripDate:1,pickupTime:1,createdAt:1}).limit(1000).lean();
    const tripIds=[...new Set(rows.map(row=>clean(row.tripId)).filter(Boolean))];
    const trips=tripIds.length?await Trip.find({_id:{$in:tripIds},tenantId:g.tenantId}).lean():[];
    const tripMap=new Map(trips.map(trip=>[String(trip._id),trip]));
    return res.json({success:true,submissions:rows.map(row=>({...sanitizeSubmission(row),dispatchTrip:tripMap.get(String(row.tripId))||null}))});
  }catch(err){
    console.error("SMART FORM FINAL REVIEW ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to load Smart Form final Review"});
  }
});

router.post("/workflow/review/confirm",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    const ids=[...new Set((Array.isArray(req.body?.submissionIds)?req.body.submissionIds:[])
      .map(clean).filter(id=>mongoose.Types.ObjectId.isValid(id)))];
    if(!ids.length)return res.status(400).json({success:false,message:"Select Smart Form trips to send to Dispatch"});
    const selected=await SmartFormSubmission.find({_id:{$in:ids},tenantId:g.tenantId,status:"REVIEW",workflowStage:"FINAL_REVIEW",tripId:{$ne:null}}).lean();
    if(selected.length!==ids.length)return res.status(409).json({success:false,message:"One or more selected trips are not ready for Dispatch"});
    const tripIds=[...new Set(selected.map(row=>String(row.tripId)))];
    const linked=await SmartFormSubmission.find({tenantId:g.tenantId,tripId:{$in:tripIds},status:"REVIEW",workflowStage:"FINAL_REVIEW"}).lean();
    const stagedTrips=await Trip.find({_id:{$in:tripIds},tenantId:g.tenantId})
      .select("_id tripNumber").lean();
    if(stagedTrips.length!==tripIds.length)return res.status(409).json({success:false,message:"One or more staged Smart Form trips are missing"});
    await Trip.updateMany(
      {_id:{$in:tripIds},tenantId:g.tenantId},
      {$set:{dispatchSelected:true,disabled:false,status:"Scheduled",source:"SMART_FORM",bookingSource:"SMART_FORM"}}
    );
    await SmartFormSubmission.updateMany({_id:{$in:linked.map(row=>row._id)},tenantId:g.tenantId,status:"REVIEW"},{$set:{status:"CONFIRMED",workflowStage:"DISPATCHED",confirmedBy:actor(req),confirmedAt:new Date()}});
    return res.json({success:true,confirmedCount:linked.length,tripIds});
  }catch(err){
    console.error("SMART FORM FINAL CONFIRM ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to send Smart Form trips to Dispatch"});
  }
});

router.patch("/workflow/review/edit/:tripId",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    if(!mongoose.Types.ObjectId.isValid(req.params.tripId)){
      return res.status(400).json({success:false,message:"Invalid Smart Form Review trip id"});
    }

    const trip=await Trip.findOne({_id:req.params.tripId,tenantId:g.tenantId,source:"SMART_FORM"});
    if(!trip)return res.status(404).json({success:false,message:"Smart Form Review trip not found"});

    const linked=await SmartFormSubmission.find({
      tenantId:g.tenantId,
      tripId:trip._id,
      status:"REVIEW",
      workflowStage:"FINAL_REVIEW"
    });
    if(!linked.length){
      return res.status(409).json({success:false,message:"This Smart Form trip is not editable in Review"});
    }

    const byId=new Map(linked.map(row=>[String(row._id),row]));
    const updates=Array.isArray(req.body?.updates)?req.body.updates:[];

    for(const update of updates){
      const submission=byId.get(String(update?.submissionId||""));
      if(!submission)continue;
      const template=await SmartFormTemplate.findOne({_id:submission.templateId,tenantId:g.tenantId}).lean();
      if(!template)return res.status(404).json({success:false,message:"Saved Smart Form template not found"});

      const incoming=update?.formData&&typeof update.formData==="object"?update.formData:{};
      const nextData={...(submission.formData||{})};
      for(const field of submission.fieldSnapshot||[]){
        const key=clean(field?.key);
        const label=clean(field?.label).toLowerCase();
        const locked=`${key.toLowerCase()} ${label}`;
        if(!key||locked.includes("date")||locked.includes("time"))continue;
        if(Object.prototype.hasOwnProperty.call(incoming,key))nextData[key]=incoming[key];
      }

      const missing=(submission.fieldSnapshot||[])
        .filter(field=>field?.required===true&&clean(field?.type).toUpperCase()!=="SIGNATURE")
        .filter(field=>!hasValue(nextData[field.key]))
        .map(field=>clean(field.label)||clean(field.key));
      if(missing.length)return res.status(400).json({success:false,message:`Required fields missing: ${missing.join(", ")}`});

      const operational=operationalData(
        {...template,fields:Array.isArray(submission.fieldSnapshot)?submission.fieldSnapshot:[]},
        nextData
      );
      const requiredOps=[
        ["Client Name",operational.clientName],
        ["Pickup Address",operational.pickupAddress],
        ["Dropoff Address",operational.dropoffAddress],
        ["Trip Date",operational.tripDate],
        ["Pickup Time",operational.pickupTime],
        ["Service",operational.serviceName]
      ].filter(([,value])=>!value).map(([label])=>label);
      if(requiredOps.length)return res.status(400).json({success:false,message:`Review fields missing: ${requiredOps.join(", ")}`});

      submission.formData=nextData;
      submission.clientName=operational.clientName;
      submission.pickupAddress=operational.pickupAddress;
      submission.dropoffAddress=operational.dropoffAddress;
      submission.stops=operational.stops;
      submission.serviceName=operational.serviceName;
      await submission.save();
    }

    const refreshed=await SmartFormSubmission.find({
      tenantId:g.tenantId,
      tripId:trip._id,
      status:"REVIEW",
      workflowStage:"FINAL_REVIEW"
    }).lean();
    const payload=buildSmartFormTripPayload({
      tenantId:g.tenantId,
      submissions:refreshed,
      actorName:actor(req)
    });

    Object.assign(trip,payload,{
      _id:trip._id,
      tenantId:g.tenantId,
      source:"SMART_FORM",
      tripDate:trip.tripDate,
      tripTime:trip.tripTime,
      pickupTime:trip.pickupTime
    });
    await trip.save();

    return res.json({success:true,tripId:String(trip._id)});
  }catch(err){
    console.error("SMART FORM REVIEW EDIT ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to edit Smart Form Review trip"});
  }
});

router.post("/workflow/review/delete",async(req,res)=>{
  try{
    const g=await gate(req,res);if(!g)return;
    const tripIds=[...new Set((Array.isArray(req.body?.tripIds)?req.body.tripIds:[])
      .map(clean).filter(id=>mongoose.Types.ObjectId.isValid(id)))];
    if(!tripIds.length)return res.status(400).json({success:false,message:"Select Smart Form Review trips to delete"});

    const linked=await SmartFormSubmission.find({
      tenantId:g.tenantId,
      tripId:{$in:tripIds},
      status:"REVIEW",
      workflowStage:"FINAL_REVIEW"
    }).lean();
    const allowedTripIds=[...new Set(linked.map(row=>String(row.tripId)))];
    if(allowedTripIds.length!==tripIds.length){
      return res.status(409).json({success:false,message:"One or more selected trips cannot be deleted from Review"});
    }

    await SmartFormSubmission.deleteMany({_id:{$in:linked.map(row=>row._id)},tenantId:g.tenantId});
    await Trip.deleteMany({_id:{$in:allowedTripIds},tenantId:g.tenantId,source:"SMART_FORM",dispatchSelected:{$ne:true}});
    return res.json({success:true,deletedCount:allowedTripIds.length});
  }catch(err){
    console.error("SMART FORM REVIEW DELETE ERROR:",err);
    return res.status(500).json({success:false,message:err?.message||"Failed to delete Smart Form Review trips"});
  }
});

module.exports = router;
