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
  if(!obj || typeof obj!=="object") return undefined;
  const entries=Object.entries(obj);
  for(const wanted of keys){
    const hit=entries.find(([k])=>String(k).toLowerCase()===String(wanted).toLowerCase());
    if(hit && hit[1]!==undefined && hit[1]!==null && hit[1]!=="") return hit[1];
  }
  return undefined;
}

function tripScore(obj){
  if(!obj || typeof obj!=="object" || Array.isArray(obj)) return 0;
  const keys=Object.keys(obj).map(k=>String(k).toLowerCase());
  let score=0;
  const hints=["availabletaskid","tripid","tripnumber","assignmentnumber","reservationid",
    "pickuplocation","pickupaddress","pickupdatetime","pickupdatetimelocal","pickuptime",
    "dropofflocation","dropoffaddress","dropoffdatetime","dropofftime",
    "appointmenttime","appointmentdatetime","distance","distancemeters","tripmiles",
    "levelofservice","mode","member","membername","passengertype"];
  for(const hint of hints) if(keys.includes(hint)) score++;
  if(keys.some(k=>k.includes("pickup")) && keys.some(k=>k.includes("dropoff"))) score+=4;
  if(keys.some(k=>/(^|_)(trip|task|reservation|assignment).*id$/.test(k)) ||
     keys.includes("availabletaskid") || keys.includes("tripnumber")) score+=2;
  return score;
}

function collectTripObjects(value,out=[],depth=0){
  if(depth>12 || value==null) return out;
  if(Array.isArray(value)){
    for(const v of value) collectTripObjects(v,out,depth+1);
    return out;
  }
  if(typeof value!=="object") return out;
  if(tripScore(value)>=5) out.push(value);
  for(const [k,v] of Object.entries(value)){
    const lk=String(k).toLowerCase();
    if(lk.includes("password")||lk.includes("token")||lk.includes("cookie")||lk.includes("authorization")) continue;
    collectTripObjects(v,out,depth+1);
  }
  return out;
}

function textFromLocation(v){
  if(v==null) return "";
  if(typeof v==="string" || typeof v==="number") return clean(v);
  if(typeof v!=="object") return "";
  return clean(
    v.address ?? v.formattedAddress ?? v.fullAddress ?? v.name ?? v.label ??
    [v.address1,v.address2,v.city,v.state,v.zipCode??v.zip].filter(Boolean).join(", ")
  );
}

function normalizePortalTrip(raw,meta={}){
  const id=clean(firstValue(raw,["availableTaskId","tripId","tripNumber","assignmentNumber","reservationId","id"]));
  const pickupRaw=firstValue(raw,["pickupLocation","pickupAddress","pickup"]);
  const dropoffRaw=firstValue(raw,["dropoffLocation","dropoffAddress","dropoff"]);
  const distanceMeters=Number(firstValue(raw,["distanceMeters"]))||null;
  const explicitMiles=Number(firstValue(raw,["tripMiles","miles","distanceMiles"]))||null;
  const tripMiles=explicitMiles ?? (distanceMeters!=null ? Number((distanceMeters/1609.344).toFixed(2)) : null);

  return {
    portalTripId:id,
    sourceHost:clean(meta.sourceHost),
    sourceUrl:clean(meta.sourceUrl),
    memberName:clean(firstValue(raw,["memberName","member","passengerName","riderName"])),
    memberPhone:clean(firstValue(raw,["memberPhone","phone","passengerPhone","riderPhone"])),
    pickupAddress:textFromLocation(pickupRaw),
    dropoffAddress:textFromLocation(dropoffRaw),
    pickupTime:clean(firstValue(raw,["pickupDateTimeLocal","pickupDateTime","pickupTime"])),
    dropoffTime:clean(firstValue(raw,["dropoffDateTime","dropoffTime"])),
    appointmentTime:clean(firstValue(raw,["appointmentDateTime","appointmentTime","appointmentDate"])),
    mode:clean(firstValue(raw,["mode","levelOfService","service","serviceType"])),
    passengerType:clean(firstValue(raw,["passengerType"])),
    riders:Number(firstValue(raw,["numberOfRiders","riders","passengerCount"]))||null,
    tripMiles,
    distanceMeters,
    specialNeeds:firstValue(raw,["specialNeeds"]),
    driverNotes:clean(firstValue(raw,["driverNotes","notes"])),
    readOnly:true,
    raw
  };
}

function normalizedKey(t){
  return `${clean(t.sourceHost).toLowerCase()}|${clean(t.portalTripId)}`;
}

function ingestNormalizedTrips(store,item){
  const candidates=collectTripObjects(item.payload,[]);
  let added=0,updated=0;
  for(const raw of candidates){
    const normalized=normalizePortalTrip(raw,item);
    if(!normalized.portalTripId) continue;
    const key=normalizedKey(normalized);
    const idx=store.normalizedTrips.findIndex(t=>normalizedKey(t)===key);
    const record={...normalized,receivedAt:item.receivedAt};
    if(idx>=0){
      store.normalizedTrips[idx]=record;
      updated++;
    }else{
      store.normalizedTrips.push(record);
      added++;
    }
  }
  if(store.normalizedTrips.length>MAX_NORMALIZED_TRIPS_PER_TENANT){
    store.normalizedTrips.splice(0,store.normalizedTrips.length-MAX_NORMALIZED_TRIPS_PER_TENANT);
  }
  return {found:candidates.length,added,updated,total:store.normalizedTrips.length};
}

function tenantStore(id){
  const key=String(id);
  if(!stores.has(key)) stores.set(key,{items:[],normalizedTrips:[],lastReceivedAt:null,hosts:new Set()});
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
    const normalized=ingestNormalizedTrips(store,item);

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
      sourceHosts:[...store.hosts]
    });
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


/* Read-only adapter preview: normalized trip candidates, deduped per portal trip id. */
router.get("/normalized-trips",async(req,res)=>{
  try{
    const id=tenantId(req);
    if(!id) return res.status(400).json({success:false,message:"Tenant is required"});
    const store=tenantStore(id);
    const limit=Math.min(250,Math.max(1,Number(req.query.limit)||100));
    const host=clean(req.query.host).toLowerCase();
    const rows=host
      ? store.normalizedTrips.filter(t=>clean(t.sourceHost).toLowerCase()===host)
      : store.normalizedTrips;
    res.json({
      success:true,
      readOnly:true,
      count:rows.length,
      items:rows.slice(-limit)
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

module.exports=router;
