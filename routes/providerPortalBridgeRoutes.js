"use strict";

/*
  DESTINATION: server/routes/providerPortalBridgeRoutes.js
  MOUNT:
    app.use("/api/provider-portal-bridge", require("./routes/providerPortalBridgeRoutes"));

  Generic authorized-browser bridge.
  - Not tied to MTM or CareCar.
  - Receives structured JSON discovered by the local browser agent.
  - Never accepts username/password/cookies/auth headers.
  - READ ONLY: no Claim/Accept endpoint exists here.
*/

const express = require("express");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const ProviderPortalMappingProfile = require("../models/ProviderPortalMappingProfile");
const router = express.Router();

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret";
const clean = v => String(v ?? "").trim();
const TOKEN_TTL = "30m";

function auth(req,res,next){
  const raw=clean(req.headers.authorization);
  if(!raw.toLowerCase().startsWith("bearer ")) return res.status(401).json({success:false,message:"Access Denied"});
  try{
    const user=jwt.verify(raw.slice(7).trim(),JWT_SECRET);
    const role=clean(user.role).toUpperCase();
    if(!["PLATFORM_ADMIN","SUPER_ADMIN","ADMIN"].includes(role)) return res.status(403).json({success:false,message:"Access Denied"});
    req.authUser=user;
    next();
  }catch(_err){
    return res.status(401).json({success:false,message:"Invalid Token"});
  }
}

function tenantId(req){
  if(clean(req.authUser?.role).toUpperCase()==="PLATFORM_ADMIN" && clean(req.query?.tenantId || req.body?.tenantId)){
    return clean(req.query?.tenantId || req.body?.tenantId);
  }
  return clean(req.authUser?.tenantId || req.authUser?.companyId || req.authUser?.organizationId);
}

function agentTokenFor(id){
  return jwt.sign({
    type:"GH_PROVIDER_PORTAL_AGENT",
    tenantId:String(id),
    nonce:crypto.randomBytes(12).toString("hex")
  },JWT_SECRET,{expiresIn:TOKEN_TTL});
}

function verifyAgentToken(req,res,next){
  try{
    const raw=clean(req.headers.authorization);
    if(!raw.toLowerCase().startsWith("bearer ")) return res.status(401).json({success:false,message:"Agent token is required"});
    const token=jwt.verify(raw.slice(7).trim(),JWT_SECRET);
    if(token?.type!=="GH_PROVIDER_PORTAL_AGENT" || !clean(token?.tenantId)){
      return res.status(403).json({success:false,message:"Invalid agent token"});
    }
    req.agentTenantId=clean(token.tenantId);
    next();
  }catch(_err){
    return res.status(401).json({success:false,message:"Agent token expired or invalid"});
  }
}

/*
  Process-local discovery store.
  It is deliberately not a trip database.
  It lets the next adapter inspect/consume discovered portal payloads without
  coupling the browser agent to a specific broker.
*/
const stores=new Map();
const MAX_ITEMS_PER_TENANT=250;
const MAX_NORMALIZED_TRIPS_PER_TENANT=1000;

function firstValue(obj,keys){
  for(const key of keys){
    const value=obj?.[key];
    if(value!==undefined && value!==null && clean(value)!=="") return value;
  }
  return null;
}

function tripScore(obj){
  if(!obj || typeof obj!=="object" || Array.isArray(obj)) return 0;
  const keys=Object.keys(obj).map(k=>k.toLowerCase());
  let score=0;
  if(keys.some(k=>["availabletaskid","tripid","tripnumber","assignmentnumber","reservationid"].includes(k))) score+=3;
  if(keys.some(k=>k.includes("pickup"))) score+=2;
  if(keys.some(k=>k.includes("dropoff"))) score+=2;
  if(keys.some(k=>k.includes("appointment"))) score+=1;
  if(keys.some(k=>k.includes("distance") || k.includes("miles"))) score+=1;
  if(keys.some(k=>k==="mode" || k.includes("service"))) score+=1;
  return score;
}

function collectTripObjects(value,out=[],seen=new Set()){
  if(!value || typeof value!=="object" || seen.has(value)) return out;
  seen.add(value);
  if(Array.isArray(value)){
    for(const item of value) collectTripObjects(item,out,seen);
    return out;
  }
  if(tripScore(value)>=5) out.push(value);
  for(const [key,child] of Object.entries(value)){
    if(["password","token","cookie","authorization"].some(x=>key.toLowerCase().includes(x))) continue;
    collectTripObjects(child,out,seen);
  }
  return out;
}

function textFromLocation(value){
  if(value===undefined || value===null) return "";
  if(typeof value==="string" || typeof value==="number") return clean(value);
  if(typeof value!=="object") return "";
  return clean(
    value.formattedAddress ||
    value.address ||
    value.fullAddress ||
    value.displayName ||
    value.name ||
    [
      value.address1 || value.street || value.street1,
      value.city,
      value.state || value.stateCode,
      value.zip || value.zipCode || value.postalCode
    ].filter(Boolean).join(", ")
  );
}

function normalizePortalTrip(raw,meta={}){
  const portalTripId=clean(firstValue(raw,[
    "availableTaskId","tripId","tripNumber","assignmentNumber","reservationId","id"
  ]));
  const explicitMiles=firstValue(raw,["tripMiles","miles","distanceMiles"]);
  const meters=Number(firstValue(raw,["distanceMeters","distanceInMeters","meters"]));
  const miles=explicitMiles!==null ? Number(explicitMiles) :
    (Number.isFinite(meters) && meters>0 ? Number((meters/1609.344).toFixed(2)) : null);

  return {
    portalTripId,
    sourceHost:clean(meta.sourceHost),
    sourceUrl:clean(meta.sourceUrl),
    memberName:clean(firstValue(raw,["memberName","passengerName","riderName","clientName","name"])),
    memberPhone:clean(firstValue(raw,["memberPhone","passengerPhone","riderPhone","phone"])),
    pickupAddress:textFromLocation(firstValue(raw,["pickupAddress","pickupLocation","pickup","origin"])),
    dropoffAddress:textFromLocation(firstValue(raw,["dropoffAddress","dropoffLocation","dropoff","destination"])),
    pickupTime:clean(firstValue(raw,["pickupTime","scheduledPickupTime","pickupDateTime"])),
    dropoffTime:clean(firstValue(raw,["dropoffTime","scheduledDropoffTime","dropoffDateTime"])),
    appointmentTime:clean(firstValue(raw,["appointmentTime","appointmentDateTime","apptTime"])),
    mode:clean(firstValue(raw,["mode","serviceMode","serviceType","levelOfService"])),
    passengerType:clean(firstValue(raw,["passengerType","riderType"])),
    riders:firstValue(raw,["numberOfRiders","riders","passengerCount"]),
    tripMiles:Number.isFinite(miles) ? miles : null,
    distanceMeters:Number.isFinite(meters) ? meters : null,
    specialNeeds:firstValue(raw,["specialNeeds","needs"]),
    driverNotes:clean(firstValue(raw,["driverNotes","notes","specialInstructions"])),
    readOnly:true,
    raw
  };
}

function normalizedKey(t){
  return `${clean(t.sourceHost).toLowerCase()}|${clean(t.portalTripId)}`;
}

function ingestNormalizedTrips(store,payload,meta){
  const found=collectTripObjects(payload);
  let added=0,updated=0;
  for(const raw of found){
    const trip=normalizePortalTrip(raw,meta);
    if(!trip.portalTripId) continue;
    const key=normalizedKey(trip);
    const index=store.normalizedTrips.findIndex(x=>normalizedKey(x)===key);
    if(index>=0){
      store.normalizedTrips[index]=trip;
      updated++;
    }else{
      store.normalizedTrips.push(trip);
      added++;
    }
  }
  if(store.normalizedTrips.length>MAX_NORMALIZED_TRIPS_PER_TENANT){
    store.normalizedTrips.splice(0,store.normalizedTrips.length-MAX_NORMALIZED_TRIPS_PER_TENANT);
  }
  return {found:found.length,added,updated,total:store.normalizedTrips.length};
}


/*
  Generic Portal Smart Auto Mapper
  --------------------------------
  Priority:
    1) Saved mapping profile for this tenant + hostname.
    2) Deterministic rule-based Auto Mapper (always available, no AI required).
    3) Optional AI Mapper for unresolved fields only.
    4) Existing generic normalizer remains the final fallback.

  The AI mapper is optional and NEVER blocks discovery. If unavailable, slow,
  rate-limited, or misconfigured, the deterministic mapper continues normally.
  No portal credentials/cookies/tokens are ever sent to AI.
*/

const MAPPING_VERSION=1;
const AUTO_READY_THRESHOLD=0.72;
const AI_TRIGGER_THRESHOLD=0.92;

const FIELD_SPECS={
  portalTripId:{
    aliases:["availabletaskid","tripid","tripnumber","assignmentnumber","reservationid","bookingid","rideid","requestid","id"],
    required:true
  },
  memberName:{
    aliases:["membername","passengername","ridername","clientname","customername","patientname","member.name","passenger.name","rider.name"]
  },
  memberPhone:{
    aliases:["memberphone","passengerphone","riderphone","clientphone","customerphone","patientphone","phone","telephone","mobile"]
  },
  pickupAddress:{
    aliases:["pickupaddress","pickup.location.address","pickuplocation.address","pickupaddress1","originaddress","fromaddress","pickup.fulladdress","pickuplocation","pickup","origin"]
  },
  dropoffAddress:{
    aliases:["dropoffaddress","dropoff.location.address","dropofflocation.address","destinationaddress","toaddress","dropoff.fulladdress","dropofflocation","dropoff","destination"]
  },
  pickupTime:{
    aliases:["pickuptime","scheduledpickuptime","pickupdatetime","pickupdatetimelocal","requestedpickuptime","readytime","pickup.time"]
  },
  dropoffTime:{
    aliases:["dropofftime","scheduleddropofftime","dropoffdatetime","dropoffdatetimelocal","destinationtime","dropoff.time"]
  },
  appointmentTime:{
    aliases:["appointmenttime","appointmentdatetime","appointmentdatetimelocal","appttime","apptdatetime","appointment.time"]
  },
  mode:{
    aliases:["mode","servicemode","servicetype","levelofservice","transportationmode","los","service","mode.name","service.name"]
  },
  passengerType:{
    aliases:["passengertype","ridertype","membertype","passenger.type"]
  },
  riders:{
    aliases:["numberofriders","riders","passengercount","ridercount","numberofpassengers","passengers"]
  },
  tripMiles:{
    aliases:["tripmiles","miles","distancemiles","distanceinmiles","estimatedmiles","route.miles"]
  },
  distanceMeters:{
    aliases:["distancemeters","distanceinmeters","meters","routedistancemeters","route.distanceMeters"]
  },
  specialNeeds:{
    aliases:["specialneeds","needs","accommodations","mobilityneeds","specialrequirements"]
  },
  driverNotes:{
    aliases:["drivernotes","notes","specialinstructions","tripnotes","instructions","comments"]
  }
};

const REQUIRED_FOR_READY=["portalTripId","pickupAddress","dropoffAddress","pickupTime","tripMiles"];

function lowerPath(v){return clean(v).toLowerCase().replace(/\[(\d+)\]/g,".$1").replace(/[^a-z0-9.]/g,"");}

function isSensitiveKey(key){
  const k=clean(key).toLowerCase();
  return ["password","passwd","secret","token","cookie","authorization","authheader","session"].some(x=>k.includes(x));
}

function flattenLeafPaths(obj,prefix="",out=[],depth=0){
  if(depth>7 || obj===null || obj===undefined) return out;
  if(Array.isArray(obj)){
    if(obj.length && typeof obj[0]==="object") flattenLeafPaths(obj[0],prefix,out,depth+1);
    return out;
  }
  if(typeof obj!=="object"){
    if(prefix) out.push({path:prefix,value:obj});
    return out;
  }
  for(const [k,v] of Object.entries(obj)){
    if(isSensitiveKey(k)) continue;
    const p=prefix?`${prefix}.${k}`:k;
    if(v!==null && typeof v==="object"){
      // Keep the object path too because locations/mode objects can be meaningful.
      out.push({path:p,value:v});
      flattenLeafPaths(v,p,out,depth+1);
    }else{
      out.push({path:p,value:v});
    }
  }
  return out;
}

function getByPath(obj,path){
  if(!path) return undefined;
  return String(path).split(".").reduce((cur,key)=>{
    if(cur===undefined || cur===null) return undefined;
    return cur[key];
  },obj);
}

function scalarText(value){
  if(value===undefined || value===null) return "";
  if(typeof value==="string" || typeof value==="number" || typeof value==="boolean") return clean(value);
  if(typeof value!=="object") return "";
  return clean(
    value.label ||
    value.displayName ||
    value.name ||
    value.description ||
    value.value ||
    value.code ||
    value.type ||
    ""
  );
}

function normalizeAddressValue(value){
  if(value===undefined || value===null) return "";
  if(typeof value==="string" || typeof value==="number") return clean(value);
  if(typeof value!=="object") return "";
  const direct=clean(
    value.formattedAddress ||
    value.fullAddress ||
    value.address ||
    value.displayAddress ||
    value.addressText
  );
  if(direct) return direct;
  const nested=value.location || value.addressObject || null;
  if(nested && nested!==value){
    const nestedText=normalizeAddressValue(nested);
    if(nestedText) return nestedText;
  }
  return clean([
    value.address1 || value.street || value.street1 || value.line1,
    value.address2 || value.street2 || value.line2,
    value.city,
    value.state || value.stateCode || value.region,
    value.zip || value.zipCode || value.postalCode
  ].filter(Boolean).join(", "));
}

function scorePathForField(path,value,field){
  const p=lowerPath(path);
  const last=p.split(".").pop()||p;
  const aliases=FIELD_SPECS[field]?.aliases||[];
  let best=0;
  for(const aliasRaw of aliases){
    const alias=lowerPath(aliasRaw);
    const aliasLast=alias.split(".").pop()||alias;
    if(p===alias) best=Math.max(best,1);
    else if(p.endsWith(`.${alias}`)) best=Math.max(best,0.98);
    else if(last===aliasLast) best=Math.max(best,0.92);
    else if(p.includes(alias)) best=Math.max(best,0.82);
    else if(alias.length>=5 && last.includes(aliasLast)) best=Math.max(best,0.72);
  }

  if(field==="tripMiles" && typeof value==="number" && /mile/.test(p)) best=Math.max(best,0.90);
  if(field==="distanceMeters" && typeof value==="number" && /meter/.test(p)) best=Math.max(best,0.90);
  if(["pickupTime","dropoffTime","appointmentTime"].includes(field) && typeof value==="string" && /time|date/.test(p)) best=Math.max(best,0.55);
  if(["pickupAddress","dropoffAddress"].includes(field) && typeof value==="object" && /pickup|dropoff|origin|destination/.test(p)) best=Math.max(best,0.72);
  if(field==="mode" && typeof value==="object" && /mode|service|level/.test(p)) best=Math.max(best,0.78);

  return best;
}

function buildAutoMapping(samples){
  const mapping={};
  const confidenceByField={};
  const leaves=[];
  for(const sample of samples.slice(0,5)){
    for(const leaf of flattenLeafPaths(sample)){
      if(!leaves.some(x=>x.path===leaf.path)) leaves.push(leaf);
    }
  }

  for(const field of Object.keys(FIELD_SPECS)){
    let winner=null;
    for(const leaf of leaves){
      const score=scorePathForField(leaf.path,leaf.value,field);
      if(!winner || score>winner.score) winner={path:leaf.path,score};
    }
    if(winner && winner.score>=0.55){
      mapping[field]=winner.path;
      confidenceByField[field]=Number(winner.score.toFixed(2));
    }
  }

  // Distance conversion can make tripMiles available even when only meters exist.
  const requiredMapped=REQUIRED_FOR_READY.filter(f=>mapping[f] || (f==="tripMiles" && mapping.distanceMeters));
  const requiredCoverage=requiredMapped.length/REQUIRED_FOR_READY.length;
  const avgRequired=requiredMapped.length
    ? requiredMapped.reduce((sum,f)=>{
        if(f==="tripMiles" && !mapping.tripMiles && mapping.distanceMeters) return sum+(confidenceByField.distanceMeters||0.8);
        return sum+(confidenceByField[f]||0);
      },0)/requiredMapped.length
    : 0;
  const confidence=Number((requiredCoverage*0.65 + avgRequired*0.35).toFixed(2));
  return {
    mapping,
    confidenceByField,
    confidence,
    requiredCoverage:Number(requiredCoverage.toFixed(2)),
    unresolved:Object.keys(FIELD_SPECS).filter(f=>!mapping[f]),
    method:"AUTO_RULES"
  };
}

function describeSchemaForAi(samples){
  const paths=new Map();
  for(const sample of samples.slice(0,3)){
    for(const leaf of flattenLeafPaths(sample)){
      if(paths.has(leaf.path)) continue;
      let type=Array.isArray(leaf.value)?"array":typeof leaf.value;
      let shape="";
      if(typeof leaf.value==="string"){
        if(/^\d{4}-\d{2}-\d{2}T/.test(leaf.value)) shape="iso_datetime";
        else if(/^\+?[\d()\-\s]{7,}$/.test(leaf.value)) shape="phone_like";
        else if(/\d/.test(leaf.value) && /[A-Za-z]/.test(leaf.value)) shape="text_with_numbers";
        else shape="text";
      }else if(typeof leaf.value==="number"){
        shape=Number.isInteger(leaf.value)?"integer":"number";
      }else if(leaf.value && typeof leaf.value==="object"){
        shape="object";
      }
      paths.set(leaf.path,{path:leaf.path,type,shape});
    }
  }
  return [...paths.values()].slice(0,250);
}

async function tryAiMapping(samples,autoResult){
  const apiKey=clean(process.env.GEMINI_API_KEY || process.env.GOOGLE_GEMINI_API_KEY);
  if(!apiKey) return {used:false,reason:"AI_NOT_CONFIGURED"};
  if(autoResult.confidence>=AI_TRIGGER_THRESHOLD) return {used:false,reason:"AUTO_CONFIDENCE_HIGH"};

  const model=clean(process.env.PROVIDER_PORTAL_AI_MODEL || "gemini-3.1-pro-preview");
  const schema=describeSchemaForAi(samples);
  const targetFields=Object.keys(FIELD_SPECS);

  const prompt=[
    "You map provider-portal trip JSON schema paths to canonical NEMT trip fields.",
    "Return JSON only. Never invent a path that is not in schemaPaths.",
    `canonicalFields=${JSON.stringify(targetFields)}`,
    `existingAutoMapping=${JSON.stringify(autoResult.mapping)}`,
    `schemaPaths=${JSON.stringify(schema)}`,
    'Return exactly: {"mapping":{"canonicalField":"existing.schema.path"},"confidence":0.0}'
  ].join("\n");

  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),3500);
  try{
    const fallbackModel=clean(process.env.PROVIDER_PORTAL_AI_FALLBACK_MODEL || "gemini-3.8-flash");

    async function callGemini(modelName){
      const url=`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelName)}:generateContent?key=${encodeURIComponent(apiKey)}`;
      return fetch(url,{
        method:"POST",
        headers:{"content-type":"application/json"},
        body:JSON.stringify({
          contents:[{parts:[{text:prompt}]}],
          generationConfig:{temperature:0,responseMimeType:"application/json"}
        }),
        signal:controller.signal
      });
    }

    let response=await callGemini(model);
    let modelUsed=model;

    // If the high-capability preview model is unavailable for this project,
    // automatically fall back to the latest stable high-capability Flash model.
    if(!response.ok && fallbackModel && fallbackModel!==model && [400,403,404,429,503].includes(response.status)){
      response=await callGemini(fallbackModel);
      modelUsed=fallbackModel;
    }

    if(!response.ok) return {used:false,reason:`AI_HTTP_${response.status}`};
    const data=await response.json();
    const rawText=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||"").join("")||"";
    let parsed;
    try{parsed=JSON.parse(rawText);}catch(_){return {used:false,reason:"AI_INVALID_JSON"};}
    const validPaths=new Set(schema.map(x=>x.path));
    const aiMapping={};
    for(const [field,path] of Object.entries(parsed?.mapping||{})){
      if(FIELD_SPECS[field] && validPaths.has(path)) aiMapping[field]=path;
    }
    if(!Object.keys(aiMapping).length) return {used:false,reason:"AI_EMPTY_MAPPING"};
    return {
      used:true,
      reason:"AI_OK",
      modelUsed,
      mapping:{...autoResult.mapping,...aiMapping},
      confidence:Math.max(autoResult.confidence,Math.min(1,Number(parsed?.confidence)||0.8))
    };
  }catch(e){
    return {used:false,reason:e?.name==="AbortError"?"AI_TIMEOUT":"AI_UNAVAILABLE"};
  }finally{
    clearTimeout(timeout);
  }
}

function tripFromMapping(raw,mapping,meta={}){
  const read=field=>getByPath(raw,mapping?.[field]);
  const explicitMiles=Number(read("tripMiles"));
  const meters=Number(read("distanceMeters"));
  const miles=Number.isFinite(explicitMiles) && explicitMiles>=0
    ? explicitMiles
    : (Number.isFinite(meters) && meters>=0 ? Number((meters/1609.344).toFixed(2)) : null);

  const mappedMode=read("mode");
  const mappedRiders=read("riders");

  return {
    portalTripId:clean(scalarText(read("portalTripId"))),
    sourceHost:clean(meta.sourceHost),
    sourceUrl:clean(meta.sourceUrl),
    memberName:clean(scalarText(read("memberName"))),
    memberPhone:clean(scalarText(read("memberPhone"))),
    pickupAddress:normalizeAddressValue(read("pickupAddress")),
    dropoffAddress:normalizeAddressValue(read("dropoffAddress")),
    pickupTime:clean(scalarText(read("pickupTime"))),
    dropoffTime:clean(scalarText(read("dropoffTime"))),
    appointmentTime:clean(scalarText(read("appointmentTime"))),
    mode:clean(scalarText(mappedMode)),
    passengerType:clean(scalarText(read("passengerType"))),
    riders:mappedRiders===undefined?null:mappedRiders,
    tripMiles:Number.isFinite(miles)?miles:null,
    distanceMeters:Number.isFinite(meters)?meters:null,
    specialNeeds:read("specialNeeds") ?? null,
    driverNotes:clean(scalarText(read("driverNotes"))),
    readOnly:true,
    raw
  };
}

function mappingReady(mapping){
  return REQUIRED_FOR_READY.every(f=>Boolean(mapping?.[f]) || (f==="tripMiles" && Boolean(mapping?.distanceMeters)));
}

async function getSavedMappingProfile(tenant,host){
  if(!tenant || !host) return null;
  try{
    return await ProviderPortalMappingProfile.findOne({
      tenantId:String(tenant),
      sourceHost:String(host).toLowerCase(),
      enabled:true
    }).lean();
  }catch(_){
    return null;
  }
}

async function saveMappingProfile({tenant,host,result,aiResult}){
  if(!tenant || !host || !result?.mapping) return null;
  const finalMapping=aiResult?.used ? aiResult.mapping : result.mapping;
  const method=aiResult?.used ? "AI_ASSISTED" : "AUTO_RULES";
  const confidence=aiResult?.used ? aiResult.confidence : result.confidence;
  try{
    return await ProviderPortalMappingProfile.findOneAndUpdate(
      {tenantId:String(tenant),sourceHost:String(host).toLowerCase()},
      {$set:{
        enabled:true,
        mappingVersion:MAPPING_VERSION,
        mapping:finalMapping,
        confidence:Number(confidence||0),
        method,
        aiStatus:aiResult?.reason || "NOT_USED",
        aiModel:aiResult?.modelUsed || "",
        ready:mappingReady(finalMapping),
        lastSeenAt:new Date(),
        updatedAt:new Date()
      },$setOnInsert:{createdAt:new Date()}},
      {new:true,upsert:true,setDefaultsOnInsert:true}
    ).lean();
  }catch(_){
    return null;
  }
}

async function resolvePortalMapping(tenant,host,samples){
  const saved=await getSavedMappingProfile(tenant,host);
  if(saved?.mapping && mappingReady(saved.mapping)){
    return {
      mapping:saved.mapping,
      method:"SAVED_PROFILE",
      confidence:Number(saved.confidence||1),
      ready:true,
      aiStatus:saved.aiStatus||"NOT_NEEDED",
      aiModel:saved.aiModel||"",
      persisted:true
    };
  }

  const auto=buildAutoMapping(samples);
  const ai=await tryAiMapping(samples,auto);
  const mapping=ai.used ? ai.mapping : auto.mapping;
  const profile=await saveMappingProfile({tenant,host,result:{...auto,mapping},aiResult:ai});

  return {
    mapping,
    method:ai.used?"AI_ASSISTED":"AUTO_RULES",
    confidence:Number((ai.used?ai.confidence:auto.confidence)||0),
    ready:mappingReady(mapping),
    aiStatus:ai.reason,
    aiModel:ai.modelUsed||"",
    persisted:Boolean(profile),
    unresolved:Object.keys(FIELD_SPECS).filter(f=>!mapping[f])
  };
}

async function ingestSmartNormalizedTrips(store,payload,meta){
  const found=collectTripObjects(payload);
  if(!found.length){
    return {
      found:0,added:0,updated:0,total:store.normalizedTrips.length,
      mapper:{ready:false,method:"NO_TRIPS",confidence:0}
    };
  }

  const mapper=await resolvePortalMapping(meta.tenantId,meta.sourceHost,found);
  store.mapperStatus={
    sourceHost:meta.sourceHost,
    ready:mapper.ready,
    method:mapper.method,
    confidence:mapper.confidence,
    aiStatus:mapper.aiStatus,
    aiModel:mapper.aiModel||"",
    persisted:mapper.persisted,
    unresolved:mapper.unresolved||[],
    mappedFields:Object.keys(mapper.mapping||{}),
    lastMappedAt:new Date().toISOString()
  };

  let added=0,updated=0;
  for(const raw of found){
    let trip=tripFromMapping(raw,mapper.mapping,meta);

    // Compatibility fallback: keep old generic normalizer for fields the smart
    // mapper could not resolve. Existing portal behavior therefore never regresses.
    const fallback=normalizePortalTrip(raw,meta);
    for(const key of Object.keys(fallback)){
      if(key==="raw") continue;
      if(trip[key]===undefined || trip[key]===null || trip[key]==="") trip[key]=fallback[key];
    }
    trip.raw=raw;
    trip.mappingMethod=mapper.method;
    trip.mappingConfidence=mapper.confidence;

    if(!trip.portalTripId) continue;
    const key=normalizedKey(trip);
    const index=store.normalizedTrips.findIndex(x=>normalizedKey(x)===key);
    if(index>=0){
      store.normalizedTrips[index]=trip;
      updated++;
    }else{
      store.normalizedTrips.push(trip);
      added++;
    }
  }

  if(store.normalizedTrips.length>MAX_NORMALIZED_TRIPS_PER_TENANT){
    store.normalizedTrips.splice(0,store.normalizedTrips.length-MAX_NORMALIZED_TRIPS_PER_TENANT);
  }

  return {
    found:found.length,
    added,
    updated,
    total:store.normalizedTrips.length,
    mapper:store.mapperStatus
  };
}


function tenantStore(id){
  const key=String(id);
  if(!stores.has(key)) stores.set(key,{items:[],normalizedTrips:[],lastReceivedAt:null,hosts:new Set(),mapperStatus:null});
  return stores.get(key);
}

function safeHost(url){
  try{return new URL(url).host;}catch(_){return "";}
}

/* Agent endpoint: intentionally outside admin auth; protected by scoped pairing token. */
router.post("/discovery",verifyAgentToken,express.json({limit:"10mb"}),async(req,res)=>{
  try{
    const id=req.agentTenantId;
    const body=req.body||{};
    if(body.payload===undefined || body.payload===null){
      return res.status(400).json({success:false,message:"Discovery payload is required"});
    }

    const sourceUrl=clean(body.sourceUrl).slice(0,2000);
    const host=safeHost(sourceUrl);
    const store=tenantStore(id);
    const item={
      receivedAt:new Date().toISOString(),
      sourceUrl,
      sourceHost:host,
      operationName:clean(body.operationName).slice(0,200),
      readOnly:true,
      payload:body.payload
    };
    store.items.push(item);
    if(store.items.length>MAX_ITEMS_PER_TENANT) store.items.splice(0,store.items.length-MAX_ITEMS_PER_TENANT);
    store.lastReceivedAt=item.receivedAt;
    if(host) store.hosts.add(host);

    const normalized=await ingestSmartNormalizedTrips(store,body.payload,{
      tenantId:id,
      sourceUrl,
      sourceHost:host,
      operationName:item.operationName
    });

    res.json({
      success:true,
      readOnly:true,
      accepted:true,
      buffered:store.items.length,
      sourceHost:host,
      normalized,
      message:"Structured provider-portal discovery payload received"
    });
  }catch(e){
    res.status(500).json({success:false,message:e.message});
  }
});

router.use(auth);

router.post("/pair",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    res.json({
      success:true,
      agentToken:agentTokenFor(id),
      expiresInMinutes:30,
      tenantId:id,
      readOnly:true,
      genericPortal:true
    });
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

router.get("/status",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const store=tenantStore(id);
    res.json({
      success:true,
      readOnly:true,
      buffered:store.items.length,
      lastReceivedAt:store.lastReceivedAt,
      sourceHosts:[...store.hosts],
      mapper:store.mapperStatus
    });
  }catch(e){res.status(500).json({success:false,message:e.message});}
});


router.get("/mapping-status",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const store=tenantStore(id);
    const host=clean(req.query.host || [...store.hosts].slice(-1)[0]).toLowerCase();
    const saved=host ? await getSavedMappingProfile(id,host) : null;
    res.json({
      success:true,
      readOnly:true,
      sourceHost:host,
      status:store.mapperStatus?.ready || saved?.ready ? "READY" : "MAPPING_NEEDED",
      live:store.mapperStatus,
      savedProfile:saved ? {
        sourceHost:saved.sourceHost,
        method:saved.method,
        confidence:saved.confidence,
        ready:saved.ready,
        aiStatus:saved.aiStatus,
        aiModel:saved.aiModel||"",
        mappedFields:Object.keys(saved.mapping||{}),
        lastSeenAt:saved.lastSeenAt
      } : null
    });
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

router.delete("/mapping-profile",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const host=clean(req.query.host).toLowerCase();
    if(!host) return res.status(400).json({success:false,message:"host is required"});
    await ProviderPortalMappingProfile.deleteOne({tenantId:String(id),sourceHost:host});
    const store=tenantStore(id);
    store.mapperStatus=null;
    res.json({success:true,message:"Saved portal mapping profile cleared"});
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

/*
  Adapter-facing read endpoint.
  No browser credentials/session material is present.
  Later MTM/CareCar/other adapters can consume this normalized discovery buffer.
*/
router.get("/discoveries",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const store=tenantStore(id);
    const limit=Math.min(100,Math.max(1,Number(req.query.limit)||25));
    res.json({success:true,readOnly:true,items:store.items.slice(-limit)});
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

router.get("/normalized-trips",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const store=tenantStore(id);
    const host=clean(req.query.host).toLowerCase();
    const limit=Math.min(250,Math.max(1,Number(req.query.limit)||100));
    let items=store.normalizedTrips;
    if(host) items=items.filter(t=>clean(t.sourceHost).toLowerCase()===host);
    res.json({
      success:true,
      readOnly:true,
      count:items.length,
      items:items.slice(-limit)
    });
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

router.delete("/discoveries",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    stores.delete(String(id));
    res.json({success:true,message:"Discovery buffer cleared"});
  }catch(e){res.status(500).json({success:false,message:e.message});}
});

/*
  Internal server-side accessor used by Marketplace Worker routing.
  It exposes normalized read-only trip candidates for the same tenant only.
  This does not create an HTTP endpoint and does not expose credentials/session data.
*/
router.getNormalizedTripsForTenant=function(id){
  const store=tenantStore(String(id));
  return Array.isArray(store.normalizedTrips) ? store.normalizedTrips.map(t=>({...t})) : [];
};

module.exports=router;
