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

function deepFindValue(obj,keys,maxDepth=5){
  const wanted=new Set(keys.map(k=>String(k).toLowerCase()));
  const seen=new Set();
  function walk(value,depth){
    if(value===undefined || value===null || depth>maxDepth) return null;
    if(typeof value!=="object") return null;
    if(seen.has(value)) return null;
    seen.add(value);
    for(const [key,child] of Object.entries(value)){
      if(wanted.has(String(key).toLowerCase()) && child!==undefined && child!==null){
        if(typeof child==="object" || clean(child)!=="") return child;
      }
    }
    for(const [key,child] of Object.entries(value)){
      if(["password","token","cookie","authorization"].some(x=>String(key).toLowerCase().includes(x))) continue;
      const found=walk(child,depth+1);
      if(found!==null) return found;
    }
    return null;
  }
  return walk(obj,0);
}

function primitiveText(value,preferredKeys=[]){
  if(value===undefined || value===null) return "";
  if(typeof value==="string" || typeof value==="number" || typeof value==="boolean") return clean(value);
  if(Array.isArray(value)){
    return value.map(v=>primitiveText(v,preferredKeys)).filter(Boolean).join(", ");
  }
  if(typeof value!=="object") return "";
  for(const key of preferredKeys){
    const child=value?.[key];
    if(child!==undefined && child!==null){
      const txt=primitiveText(child,preferredKeys);
      if(txt) return txt;
    }
  }
  for(const key of ["label","displayName","name","value","title","description","code","type"]){
    const child=value?.[key];
    if(child!==undefined && child!==null && typeof child!=="object"){
      const txt=clean(child);
      if(txt) return txt;
    }
  }
  return "";
}

function textFromLocation(value){
  if(value===undefined || value===null) return "";
  if(typeof value==="string" || typeof value==="number") return clean(value);
  if(typeof value!=="object") return "";

  const nestedAddress=
    value.address && typeof value.address==="object" ? value.address :
    value.location && typeof value.location==="object" ? value.location :
    value.place && typeof value.place==="object" ? value.place :
    null;

  const candidate=nestedAddress || value;
  const composed=[
    candidate.address1 || candidate.addressLine1 || candidate.streetAddress || candidate.street || candidate.street1,
    candidate.address2 || candidate.addressLine2 || candidate.street2,
    candidate.city,
    candidate.state || candidate.stateCode,
    candidate.zip || candidate.zipCode || candidate.postalCode
  ].filter(Boolean).join(", ");

  return clean(
    candidate.formattedAddress ||
    candidate.fullAddress ||
    candidate.addressText ||
    candidate.displayAddress ||
    composed ||
    value.formattedAddress ||
    value.fullAddress ||
    value.addressText ||
    value.displayAddress ||
    value.displayName ||
    value.name
  );
}

function locationFromRaw(raw,kind){
  const prefix=kind==="pickup" ? "pickup" : "dropoff";
  const direct=firstValue(raw,[
    `${prefix}Address`,`${prefix}Location`,prefix,
    kind==="pickup" ? "origin" : "destination"
  ]);
  const deep=deepFindValue(raw,[
    `${prefix}Address`,`${prefix}Location`,
    `${prefix}FullAddress`,`${prefix}FormattedAddress`
  ]);
  return textFromLocation(deep || direct);
}

function timeFromRaw(raw,keys){
  const value=firstValue(raw,keys) ?? deepFindValue(raw,keys);
  return primitiveText(value,["local","dateTimeLocal","datetimeLocal","dateTime","datetime","time","value"]);
}

function modeFromRaw(raw){
  const value=firstValue(raw,["mode","serviceMode","serviceType","levelOfService"]) ??
    deepFindValue(raw,["mode","serviceMode","serviceType","levelOfService"]);
  return primitiveText(value,["displayName","name","label","value","code","type"]);
}

function normalizePortalTrip(raw,meta={}){
  const portalTripId=clean(firstValue(raw,[
    "availableTaskId","tripId","tripNumber","assignmentNumber","reservationId","id"
  ]) ?? deepFindValue(raw,[
    "availableTaskId","tripId","tripNumber","assignmentNumber","reservationId"
  ]));
  const explicitMiles=firstValue(raw,["tripMiles","miles","distanceMiles"]) ??
    deepFindValue(raw,["tripMiles","distanceMiles"]);
  const metersValue=firstValue(raw,["distanceMeters","distanceInMeters","meters"]) ??
    deepFindValue(raw,["distanceMeters","distanceInMeters"]);
  const meters=Number(metersValue);
  const miles=explicitMiles!==null && explicitMiles!==undefined ? Number(explicitMiles) :
    (Number.isFinite(meters) && meters>0 ? Number((meters/1609.344).toFixed(2)) : null);

  const memberValue=firstValue(raw,["memberName","passengerName","riderName","clientName"]) ??
    deepFindValue(raw,["memberName","passengerName","riderName","clientName"]);
  const phoneValue=firstValue(raw,["memberPhone","passengerPhone","riderPhone","phone"]) ??
    deepFindValue(raw,["memberPhone","passengerPhone","riderPhone","phone"]);

  return {
    portalTripId,
    sourceHost:clean(meta.sourceHost),
    sourceUrl:clean(meta.sourceUrl),
    memberName:primitiveText(memberValue,["fullName","displayName","name","value"]),
    memberPhone:primitiveText(phoneValue,["formatted","number","phone","value"]),
    pickupAddress:locationFromRaw(raw,"pickup"),
    dropoffAddress:locationFromRaw(raw,"dropoff"),
    pickupTime:timeFromRaw(raw,[
      "pickupTime","scheduledPickupTime","pickupDateTime","pickupDatetime",
      "pickupDateTimeLocal","pickupDatetimeLocal"
    ]),
    dropoffTime:timeFromRaw(raw,[
      "dropoffTime","scheduledDropoffTime","dropoffDateTime","dropoffDatetime",
      "dropoffDateTimeLocal","dropoffDatetimeLocal"
    ]),
    appointmentTime:timeFromRaw(raw,[
      "appointmentTime","appointmentDateTime","appointmentDatetime",
      "appointmentDateTimeLocal","appointmentDatetimeLocal","apptTime"
    ]),
    mode:modeFromRaw(raw),
    passengerType:primitiveText(
      firstValue(raw,["passengerType","riderType"]) ?? deepFindValue(raw,["passengerType","riderType"]),
      ["displayName","name","label","value","code","type"]
    ),
    riders:firstValue(raw,["numberOfRiders","riders","passengerCount"]) ??
      deepFindValue(raw,["numberOfRiders","passengerCount"]),
    tripMiles:Number.isFinite(miles) ? miles : null,
    distanceMeters:Number.isFinite(meters) ? meters : null,
    specialNeeds:firstValue(raw,["specialNeeds","needs"]) ?? deepFindValue(raw,["specialNeeds","needs"]),
    driverNotes:primitiveText(
      firstValue(raw,["driverNotes","notes","specialInstructions"]) ??
      deepFindValue(raw,["driverNotes","specialInstructions"]),
      ["text","description","value"]
    ),
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

    const normalized=ingestNormalizedTrips(store,body.payload,{
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
