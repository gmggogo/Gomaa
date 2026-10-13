"use strict";

/*
// Marketplace accept fix: preserve discovery metadata through manual scans.
DESTINATION PATH:
server/routes/marketplaceRoutes.js

PURPOSE:
Generic Marketplace backend for any Marketplace Portal broker connection.

IMPORTANT:
- Uses BrokerIntegration connectionId, NOT brokerCode=MT.
- Reads normalized trips from providerPortalBridgeRoutes per connectionId.
- Uses the existing Long / Short engine settings.
- The portal claim is sent only for a fresh discovery with Auto Accept on.
- A confirmed portal claim is imported through the External Trip service.
- Activity is stored in the existing Marketplace Activity collection for
  compatibility, but every new row is scoped by connectionId.
*/

const express = require("express");
const jwt = require("jsonwebtoken");
const https = require("https");

const router = express.Router();

const Settings =
  require("../models/MarketplaceSettings");

const Activity =
  require("../models/MarketplaceActivity");

const BrokerIntegration =
  require("../models/BrokerIntegration");

const Tenant =
  require("../models/Tenant");

const longEngine =
  require("../services/mtm/mtmLongTripEngine");

const shortEngine =
  require("../services/mtm/mtmShortTripEngine");

const providerPortalBridgeRoutes =
  require("./providerPortalBridgeRoutes");

const {createExternalTrip} =
  require("../services/externalTripService");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

const clean =
  value =>
    String(value ?? "").trim();

// Marketplace activity is operational telemetry, not permanent trip history.
// Keep a short window so repeated portal scans cannot fill MongoDB again.
const MARKETPLACE_ACTIVITY_RETENTION_DAYS = Math.max(
  1,
  Number(process.env.MARKETPLACE_ACTIVITY_RETENTION_DAYS) || 7
);

async function pruneMarketplaceActivity(tenantId){
  const cutoff = new Date(
    Date.now() - MARKETPLACE_ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  return Activity.deleteMany({
    tenantId,
    occurredAt: {$lt:cutoff}
  });
}

function bearerToken(req){

  const raw =
    clean(
      req.headers.authorization
    );

  if(
    !raw
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return raw
    .slice(7)
    .trim();
}

function auth(req,res,next){

  const raw =
    bearerToken(req);

  if(!raw){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const user =
      jwt.verify(
        raw,
        JWT_SECRET
      );

    const role =
      clean(
        user.role
      ).toUpperCase();

    if(
      ![
        "PLATFORM_ADMIN",
        "SUPER_ADMIN",
        "ADMIN"
      ].includes(role)
    ){
      return res.status(403).json({
        success:false,
        message:"Access Denied"
      });
    }

    req.authUser =
      user;

    next();

  }catch(_err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

router.use(
  auth
);

function tenantId(req){

  const role =
    clean(
      req.authUser?.role
    ).toUpperCase();

  if(
    role === "PLATFORM_ADMIN" &&
    clean(
      req.query?.tenantId ||
      req.body?.tenantId
    )
  ){
    return clean(
      req.query?.tenantId ||
      req.body?.tenantId
    );
  }

  return clean(
    req.authUser?.tenantId ||
    req.authUser?.companyId ||
    req.authUser?.organizationId
  );
}

function zipList(value){

  return (
    Array.isArray(value)
      ? value
      : String(value || "")
          .split(/[\s,]+/)
  )
  .map(clean)
  .filter(Boolean);
}

function normalizeEngine(value={}){

  /*
    Marketplace Settings UI now sends tripMilesMin / tripMilesMax and
    the full zone-center fields. Keep milesMin / milesMax mirrored for
    the existing Long/Short matching engines, which still read those
    legacy names.
  */
  const tripMilesMin =
    Math.max(
      0,
      Number(
        value.tripMilesMin ??
        value.milesMin
      ) || 0
    );

  const tripMilesMax =
    Math.max(
      0,
      Number(
        value.tripMilesMax ??
        value.milesMax
      ) || 0
    );

  const zoneRadiusMiles =
    Math.max(
      0,
      Number(
        value.zoneRadiusMiles ??
        200
      ) || 0
    );

  const pickupZoneZip =
    clean(
      value.pickupZoneZip
    );

  const dropoffZoneZip =
    clean(
      value.dropoffZoneZip
    );

  const pickupZipCodes =
    zipList(
      value.pickupZipCodes
    );

  const dropoffZipCodes =
    zipList(
      value.dropoffZipCodes
    );

  if(
    pickupZoneZip &&
    !pickupZipCodes.includes(pickupZoneZip)
  ){
    pickupZipCodes.unshift(
      pickupZoneZip
    );
  }

  if(
    dropoffZoneZip &&
    !dropoffZipCodes.includes(dropoffZoneZip)
  ){
    dropoffZipCodes.unshift(
      dropoffZoneZip
    );
  }

  return {
    enabled:
      value.enabled === true,

    autoAccept:
      value.autoAccept === true,

    zoneRadiusMiles,

    tripMilesMin,
    tripMilesMax,

    /*
      Backward compatibility for mtmLongTripEngine / mtmShortTripEngine.
      These engines currently evaluate settings.milesMin / milesMax.
    */
    milesMin:
      tripMilesMin,

    milesMax:
      tripMilesMax,

    dailyTripLimit:
      Math.trunc(Math.max(
        0,
        Number(
          value.dailyTripLimit
        ) || 0
      )),

    pickupTimeFrom:
      clean(
        value.pickupTimeFrom
      ) || "00:00",

    pickupTimeTo:
      clean(
        value.pickupTimeTo
      ) || "23:59",

    dropoffTimeFrom:
      clean(
        value.dropoffTimeFrom
      ) || "00:00",

    dropoffTimeTo:
      clean(
        value.dropoffTimeTo
      ) || "23:59",

    pickupZipCodes,
    dropoffZipCodes,

    pickupZoneCity:
      clean(
        value.pickupZoneCity
      ),

    pickupZoneState:
      clean(
        value.pickupZoneState
      ).toUpperCase(),

    pickupZoneZip,

    pickupZoneAddress:
      clean(
        value.pickupZoneAddress
      ),

    dropoffZoneCity:
      clean(
        value.dropoffZoneCity
      ),

    dropoffZoneState:
      clean(
        value.dropoffZoneState
      ).toUpperCase(),

    dropoffZoneZip,

    dropoffZoneAddress:
      clean(
        value.dropoffZoneAddress
      ),

    zoneMatch:
      [
        "ANY",
        "PICKUP",
        "DROPOFF",
        "EITHER",
        "BOTH"
      ].includes(
        clean(
          value.zoneMatch
        ).toUpperCase()
      )
        ? clean(
            value.zoneMatch
          ).toUpperCase()
        : "ANY",

    modes:
      zipList(
        value.modes
      )
  };
}

async function getSettings(id){

  let doc =
    await Settings.findOne({
      tenantId:id
    });

  if(!doc){

    doc =
      await Settings.create({
        tenantId:id,
        enabled:true,
        connectionMethod:"MTM_PORTAL",
        dateWindowDays:7,
        totalDailyTripLimit:0
      });
  }

  return doc;
}

function tripForEngine(trip={}){

  const miles =
    Number(
      trip.tripMiles ??
      trip.miles ??
      0
    );

  return {
    ...trip,

    externalTripId:
      clean(
        trip.externalTripId ||
        trip.portalTripId
      ),

    tripNumber:
      clean(
        trip.tripNumber ||
        trip.portalTripId
      ),

    miles:
      Number.isFinite(miles)
        ? miles
        : 0,

    tripMiles:
      Number.isFinite(miles)
        ? miles
        : 0,

    pickup:
      trip.pickup ||
      trip.pickupAddress ||
      "",

    dropoff:
      trip.dropoff ||
      trip.dropoffAddress ||
      "",

    mode:
      clean(
        trip.mode ||
        trip.serviceType ||
        trip.levelOfService
      )
  };
}

// A zone is a circle around its configured center, measured in straight-line
// miles. Cache geocoding results so a recurring discovery does not re-query
// the same addresses every scan.
const geoCache=new Map();
function googleKey(){
  return process.env.GOOGLE_SERVER_KEY || process.env.GOOGLE_SERVER_API_KEY ||
    process.env.GOOGLE_MAPS_SERVER_KEY || process.env.SERVER_GOOGLE_MAPS_KEY ||
    process.env.GOOGLE_MAPS_API_KEY || "";
}
function geocode(address){
  const key=googleKey();
  if(!key || !clean(address)) return Promise.resolve(null);
  const cacheKey=clean(address).toLowerCase();
  const previous=geoCache.get(cacheKey);
  if(previous && previous.until>Date.now()) return previous.promise;
  const url=`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(key)}`;
  const promise=new Promise(resolve=>{
    const request=https.get(url,response=>{
      let body="";
      response.on("data",part=>{ if(body.length<100000) body+=part; });
      response.on("end",()=>{
        try{
          const result=JSON.parse(body);
          const point=result.status==="OK" ? result.results?.[0]?.geometry?.location : null;
          resolve(validPoint(point?.lat,point?.lng) ? point : null);
        }catch(_err){ resolve(null); }
      });
    });
    request.setTimeout(5000,()=>request.destroy());
    request.on("error",()=>resolve(null));
  });
  geoCache.set(cacheKey,{promise,until:Date.now()+60000});
  promise.then(point=>geoCache.set(cacheKey,{
    promise:Promise.resolve(point),until:Date.now()+(point?86400000:60000)
  }));
  return promise;
}
function validPoint(lat,lng){
  return lat!==null && lat!==undefined && lat!=="" &&
    lng!==null && lng!==undefined && lng!=="" &&
    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
    Math.abs(Number(lat))<=90 && Math.abs(Number(lng))<=180;
}
function milesBetween(a,b){
  const rad=n=>Number(n)*Math.PI/180;
  const dLat=rad(b.lat)-rad(a.lat),dLng=rad(b.lng)-rad(a.lng);
  const v=Math.sin(dLat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(dLng/2)**2;
  return 3958.7613*2*Math.asin(Math.min(1,Math.sqrt(v)));
}
function centerText(settings,side){
  const prefix=side==="pickup"?"pickup":"dropoff";
  return clean(settings[`${prefix}ZoneAddress`]) ||
    [settings[`${prefix}ZoneCity`],settings[`${prefix}ZoneState`],settings[`${prefix}ZoneZip`]]
      .map(clean).filter(Boolean).join(", ");
}
async function enrichZoneDistances(trips,settings){
  const zone=clean(settings?.zoneMatch).toUpperCase();
  if(!["PICKUP","DROPOFF","EITHER","BOTH"].includes(zone)) return trips;
  const sides=zone==="PICKUP"?["pickup"]:zone==="DROPOFF"?["dropoff"]:["pickup","dropoff"];
  const centers={};
  await Promise.all(sides.map(async side=>{centers[side]=await geocode(centerText(settings,side));}));
  return Promise.all(trips.map(async trip=>{
    const zoneDistances={};
    await Promise.all(sides.map(async side=>{
      const center=centers[side];
      if(!center) return;
      const lat=trip[`${side}Lat`],lng=trip[`${side}Lng`];
      const point=validPoint(lat,lng)?{lat:Number(lat),lng:Number(lng)}:
        await geocode(trip[side] || trip[`${side}Address`]);
      if(point) zoneDistances[`${side}DistanceMiles`]=milesBetween(center,point);
    }));
    return {...trip,zoneDistances};
  }));
}

function activityMeta(
  connection,
  trip={}
){

  return {
    connectionId:
      String(
        connection._id
      ),

    marketplaceConnectionId:
      String(
        connection._id
      ),

    brokerIntegrationId:
      String(
        connection._id
      ),

    brokerCode:
      clean(
        connection.brokerCode
      ),

    brokerName:
      clean(
        connection.brokerName
      ),

    accountLabel:
      clean(
        connection.accountLabel ||
        "Primary Account"
      ),

    sourceHost:
      clean(
        trip.sourceHost ||
        connection.sourceHost
      )
  };
}

async function logActivity(
  id,
  connection,
  action,
  data={}
){

  const trip =
    data.trip ||
    {};

  const document = {

    tenantId:id,

    integrationId:
      connection._id,

    engine:
      clean(
        data.engine ||
        "SYSTEM"
      ),

    action:
      clean(
        action
      ),

    externalTripId:
      clean(
        trip.externalTripId ||
        trip.portalTripId ||
        trip.tripNumber ||
        data.externalTripId
      ),

    message:
      clean(
        data.message
      ),

    reason:
      clean(
        data.reason
      ),

    miles:
      Number.isFinite(
        Number(
          trip.tripMiles ??
          trip.miles
        )
      )
        ? Number(
            trip.tripMiles ??
            trip.miles
          )
        : null,

    tripDate:
      clean(
        trip.tripDate ||
        trip.appointmentDate ||
        trip.date
      ),

    pickupTime:
      clean(
        trip.pickupTime
      ),

    mode:
      clean(
        trip.mode
      ),

    meta:{
      ...activityMeta(
        connection,
        trip
      ),
      pickupAddress:clean(trip.pickupAddress || trip.pickup),
      dropoffAddress:clean(trip.dropoffAddress || trip.dropoff),
      pickupZip:clean(trip.pickupZip),
      dropoffZip:clean(trip.dropoffZip),
      zone:{...(trip.zoneDistances || {})},
      ...(data.meta || {})
    }
  };

  // A discovery loop can see the same matched trip many times.  Keep one
  // current MATCHED row per tenant/connection/trip instead of appending a
  // history row on every evaluation.
  if(data.dedupe === true){
    return Activity.findOneAndUpdate(
      {
        tenantId:id,
        integrationId:connection._id,
        externalTripId:document.externalTripId,
        action
      },
      {$set:document},
      {new:true,upsert:true,setDefaultsOnInsert:true}
    );
  }

  return Activity.create(document);
}

async function marketplaceConnection(
  id,
  connectionId
){

  const connection =
    await BrokerIntegration.findOne({
      _id:connectionId,
      tenantId:id,
      connectionMode:"MARKETPLACE_PORTAL",
      enabled:true,
      featureVisible:true,
      billingEnabled:true
    });

  if(!connection){

    const err =
      new Error(
        "Marketplace broker connection was not found or is disabled"
      );

    err.statusCode =
      404;

    throw err;
  }

  return connection;
}

async function selectedByEngine(
  trips,
  settings
){

  // Match only dated rides through the configured number of calendar days
  // ahead. A missing or ambiguous date must never be auto claimed.
  let timeZone="UTC";
  if(settings?.tenantId){
    const tenant=await Tenant.findById(settings.tenantId).select("timezone").lean();
    timeZone=clean(tenant?.timezone)||"UTC";
  }
  let today;
  try{today=new Intl.DateTimeFormat("en-CA",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());}
  catch(_){today=new Date().toISOString().slice(0,10);}
  const end=new Date(`${today}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate()+Math.min(31,Math.max(1,
    Math.trunc(Number(settings?.dateWindowDays)||7))));
  const last=end.toISOString().slice(0,10);
  const inWindow=trips.filter(trip=>{
    const value=clean(trip.tripDate || trip.appointmentDate || trip.date);
    let date=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
    if(date) date=`${date[1]}-${date[2]}-${date[3]}`;
    else{
      const us=value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      date=us?`${us[3]}-${us[1].padStart(2,"0")}-${us[2].padStart(2,"0")}`:"";
    }
    if(!date) return false;
    const parsed=new Date(`${date}T00:00:00.000Z`);
    if(!Number.isFinite(parsed.getTime()) ||
       parsed.toISOString().slice(0,10)!==date) return false;
    return date>=today && date<=last;
  });

  const [longTrips,shortTrips]=await Promise.all([
    settings?.longEngine?.enabled
      ? enrichZoneDistances(inWindow,settings.longEngine).then(rows=>longEngine.select(rows,settings.longEngine))
      : [],
    settings?.shortEngine?.enabled
      ? enrichZoneDistances(inWindow,settings.shortEngine).then(rows=>shortEngine.select(rows,settings.shortEngine))
      : []
  ]);

  return {
    longTrips,
    shortTrips
  };
}

async function logEngineMatches(
  id,
  connection,
  engineName,
  trips,
  engineSettings,
  options={}
){

  const results = [];

  for(const trip of trips){

    // Persist the single temporary matched row before activating a claim.
    // This ordering prevents a very fast successful claim from deleting the
    // row and then having this evaluation recreate it afterward.
    await logActivity(
      id,
      connection,
      "MATCHED",
      {
        engine:engineName,
        trip,
        dedupe:true,
        message:
          `${engineName} engine matched trip ${clean(trip.externalTripId || trip.portalTripId)}`
      }
    );

    const claim=await maybeQueueClaim(id,connection,engineName,trip,engineSettings,options);

    if(claim.queued){
      results.push({engine:engineName,externalTripId:clean(trip.externalTripId || trip.portalTripId),
        matched:true,claimed:false,reason:"CLAIM_QUEUED"});
      continue;
    }

    const reason=claim.reason;
    const externalTripId=clean(trip.externalTripId||trip.portalTripId||trip.tripNumber);
    await Activity.updateOne(
      {tenantId:id,integrationId:connection._id,externalTripId,action:"MATCHED"},
      {$set:{"meta.lastClaimFailure":reason,"meta.lastClaimFailureAt":new Date()}}
    ).catch(()=>{});
    setMatchedTripFailure(id,String(connection._id),externalTripId,reason);

    results.push({
      engine:engineName,
      externalTripId:
        clean(
          trip.externalTripId ||
          trip.portalTripId
        ),
      matched:true,
      claimed:false,
      reason
    });
  }

  return results;
}

const claimLocks=new Map();
const tenantClaimGates=new Map();
// Short-lived display summary for the Marketplace dashboard. This is process
// memory only; it is not persisted to Mongo and therefore cannot consume space.
const latestScanSummaries=new Map();
async function maybeQueueClaim(...args){
  const id=args[0];
  const previous=tenantClaimGates.get(id)||Promise.resolve();
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  tenantClaimGates.set(id,gate);
  await previous;
  try{return await queueClaimWithinTenant(...args);}
  finally{
    release();
    if(tenantClaimGates.get(id)===gate) tenantClaimGates.delete(id);
  }
}
async function queueClaimWithinTenant(id,connection,engineName,trip,engineSettings,options){
  if(!options.manualAccept && engineSettings?.autoAccept!==true) return {reason:"AUTO_ACCEPT_OFF"};
  const discoveredAt=Date.parse(options.receivedAt);
  if(!Number.isFinite(discoveredAt) || Math.abs(Date.now()-discoveredAt)>15000)
    return {reason:"DISCOVERY_TOO_OLD"};
  const externalTripId=clean(trip.externalTripId || trip.portalTripId);
  const selector=clean(trip.acceptActionSelector);
  const actionText=clean(trip.acceptActionText);
  const domVerified=trip.availableForAccept===true &&
    clean(trip.availabilityEvidence)==="DOM_ACCEPT_ACTION" &&
    Boolean(selector) && Boolean(clean(trip.sourceUrl)) &&
    /\b(accept|claim|take|book|reserve|assign|select trip|add trip|choose trip)\b/i.test(actionText) &&
    !/\b(cancel|decline|reject|delete|remove|pay|purchase|checkout|logout)\b/i.test(actionText);
  if(options.source!=="DISCOVERY" && !(options.source==="NETWORK_DISCOVERY" && domVerified))
    return {reason:"LIVE_DISCOVERY_ONLY"};
  if(!externalTripId || !clean(trip.tripDate) || !clean(trip.pickupTime) ||
     !clean(trip.memberName) || !clean(trip.pickupAddress) ||
     !clean(trip.dropoffAddress) || !clean(trip.mode))
    return {reason:"MISSING_EXTERNAL_HUB_FIELDS"};
  if(trip.availableForAccept!==true || !selector || !clean(trip.sourceUrl) ||
     !/\b(accept|claim|take|book|reserve|assign|select trip|add trip|choose trip)\b/i.test(actionText) ||
     /\b(cancel|decline|reject|delete|remove|pay|purchase|checkout|logout)\b/i.test(actionText))
    return {reason:"NO_VERIFIED_ROW_ACCEPT_ACTION"};
  const key=`${id}:${connection._id}:${externalTripId}`;
  if((claimLocks.get(key)||0)>Date.now()-86400000) return {reason:"ALREADY_ATTEMPTED"};
  claimLocks.set(key,Date.now());
  let command=null;
  try{
    const already=await Activity.findOne({tenantId:id,externalTripId,
      "meta.connectionId":String(connection._id),action:"CLAIM_ATTEMPT"}).lean();
    if(already) return {reason:"ALREADY_ATTEMPTED"};
    const since=new Date(Date.now()-86400000);
    const totalLimit=Math.max(0,Math.trunc(Number(options.settings?.totalDailyTripLimit)||0));
    const engineLimit=Math.max(0,Math.trunc(Number(engineSettings?.dailyTripLimit)||0));
    if(totalLimit>0){
      const count=await Activity.countDocuments({tenantId:id,action:"CLAIM_ATTEMPT",occurredAt:{$gte:since}});
      if(count>=totalLimit) return {reason:"TOTAL_DAILY_LIMIT"};
    }
    if(engineLimit>0){
      const count=await Activity.countDocuments({tenantId:id,engine:engineName,action:"CLAIM_ATTEMPT",occurredAt:{$gte:since}});
      if(count>=engineLimit) return {reason:"ENGINE_DAILY_LIMIT"};
    }
    command=providerPortalBridgeRoutes.enqueueClaimCommand?.({tenantId:id,
      connectionId:String(connection._id),engine:engineName,externalTripId,
      selector,actionText,sourceUrl:trip.sourceUrl});
    if(!command) return {reason:"CLAIM_QUEUE_UNAVAILABLE"};
    await logActivity(id,connection,"CLAIM_ATTEMPT",{engine:engineName,trip,
      message:`${engineName} claim queued for live trip ${externalTripId}`,
      meta:{claimCommandId:command.commandId,tripSnapshot:{
        portalTripId:externalTripId,tripDate:clean(trip.tripDate),
        pickupTime:clean(trip.pickupTime),appointmentTime:clean(trip.appointmentTime),
        memberName:clean(trip.memberName),memberPhone:clean(trip.memberPhone),
        pickupAddress:clean(trip.pickupAddress),dropoffAddress:clean(trip.dropoffAddress),
        mode:clean(trip.mode)
      }}});
    if(providerPortalBridgeRoutes.activateClaimCommand?.(command.commandId)!==true)
      throw new Error("Claim command could not be activated");
    return {queued:true};
  }catch(err){
    if(command) providerPortalBridgeRoutes.cancelClaimCommand?.(command.commandId);
    claimLocks.delete(key);
    return {reason:`CLAIM_QUEUE_ERROR: ${clean(err.message).slice(0,120)}`};
  }
}

function serviceKeyForClaim(mode){
  if(/wheelchair/i.test(clean(mode))) return "WH";
  if(/ambulatory/i.test(clean(mode))) return "ST";
  return clean(mode);
}

async function handleClaimResult(result){
  const command=result.command;
  const connection=await BrokerIntegration.findOne({
    _id:command.connectionId,tenantId:command.tenantId
  }).lean();
  if(!connection) throw new Error("Claimed broker connection was not found");
  const meta={claimCommandId:command.commandId,connectionId:command.connectionId};
  await logActivity(command.tenantId,connection,
    result.confirmed?"CLAIMED":result.clicked?"CLAIM_ATTEMPT":"CLAIM_FAILED",
    {engine:command.engine,externalTripId:command.externalTripId,
      message:result.confirmed?"Portal confirmed the claim":
        result.clicked?"Claim button clicked; portal confirmation was not observed":
        `Claim was not clicked: ${result.message}`,
      reason:result.confirmed?"":result.clicked?"UNCONFIRMED_AFTER_CLICK":"CLAIM_NOT_CLICKED",
      meta});
  if(!result.confirmed) return;

  try{
    const attempt=await Activity.findOne({tenantId:command.tenantId,
      "meta.claimCommandId":command.commandId,action:"CLAIM_ATTEMPT",
      "meta.tripSnapshot":{$exists:true}}).lean();
    const trip=attempt?.meta?.tripSnapshot;
    if(!trip || !trip.tripDate || !trip.pickupTime || !trip.memberName ||
       !trip.pickupAddress || !trip.dropoffAddress)
      throw new Error("Confirmed claim lacks the trip details required by External Hub");
    const imported=await createExternalTrip({
      tenantId:command.tenantId,tenantSlug:connection.tenantSlug||"",
      integrationId:connection._id,brokerCode:connection.brokerCode,
      brokerName:connection.brokerName,connectionType:"PORTAL",source:"BROKER",
      payload:{externalTripId:command.externalTripId,tripDate:trip.tripDate,
        tripTime:trip.pickupTime,appointmentTime:trip.appointmentTime,
        clientName:trip.memberName,clientPhone:trip.memberPhone,
        pickup:trip.pickupAddress,dropoff:trip.dropoffAddress,
        serviceKey:serviceKeyForClaim(trip.mode),serviceName:trip.mode,
        brokerStatus:"ACCEPTED"}
    });
    // Marketplace is only a temporary holding area.  Once the portal claim
    // is confirmed and the trip exists in External Hub, remove every
    // temporary activity row for this trip (MATCHED/CLAIM_ATTEMPT/CLAIMED).
    await Activity.deleteMany({
      tenantId:command.tenantId,
      externalTripId:command.externalTripId,
      "meta.connectionId":String(command.connectionId)
    });
  }catch(err){
    await logActivity(command.tenantId,connection,"ERROR",{
      engine:command.engine,externalTripId:command.externalTripId,
      reason:"EXTERNAL_HUB_IMPORT_FAILED",
      message:`Portal claim confirmed; External Hub import failed: ${clean(err.message).slice(0,300)}`,
      meta});
  }
}

if(typeof providerPortalBridgeRoutes.registerClaimResultListener==="function")
  providerPortalBridgeRoutes.registerClaimResultListener(handleClaimResult);



/* =========================
   AUTOMATIC MARKETPLACE EVALUATION
   - New/changed discoveries are evaluated immediately.
   - Saving settings re-evaluates the current normalized trip buffer.
========================= */

function saveScanSummary(id,connection,trips,longTrips=[],shortTrips=[],imported=0){
  const matchedById=new Map();
  for(const trip of [...longTrips,...shortTrips]){
    const tripId=String(trip.externalTripId||trip.portalTripId||trip.tripNumber||"").trim();
    if(!tripId) continue;
    // Keep only fields needed by the Marketplace table. Do not retain member
    // names, phone numbers, or other portal payload data in this short-lived
    // dashboard cache.
    matchedById.set(tripId,{
      externalTripId:tripId,
      tripNumber:clean(trip.tripNumber||trip.portalTripId||tripId),
      tripDate:clean(trip.tripDate||trip.appointmentDate||trip.date),
      pickupTime:clean(trip.pickupTime||trip.appointmentTime),
      pickupAddress:clean(trip.pickupAddress||trip.pickup),
      dropoffAddress:clean(trip.dropoffAddress||trip.dropoff),
      mode:clean(trip.mode||trip.serviceType||trip.levelOfService),
      miles:Number.isFinite(Number(trip.tripMiles??trip.miles))
        ? Number(trip.tripMiles??trip.miles) : null
    });
  }
  const matchedTrips=[...matchedById.values()];
  const matchedIds=new Set(matchedById.keys());
  latestScanSummaries.set(`${id}:${connection._id}`,{
    available:Array.isArray(trips)?trips.length:0,
    matched:matchedIds.size,
    imported:Number(imported)||0,
    observedAt:new Date().toISOString(),
    matchedIds,
    matchedTrips
  });
}

function setMatchedTripFailure(id,connectionId,externalTripId,reason){
  const summary=latestScanSummaries.get(`${id}:${connectionId}`);
  const target=String(externalTripId||"").trim();
  const row=summary?.matchedTrips?.find(trip=>trip.externalTripId===target);
  if(row) row.lastClaimFailure=String(reason||"");
}

async function evaluateConnectionTrips({
  id,
  connection,
  settings,
  rawTrips,
  summaryTrips,
  source="AUTO",
  receivedAt=""
}){
  // Use one canonical trip buffer for matching, activity rows, and the
  // dashboard summary. Previously raw discovery data was used for activity
  // while summaryTrips was used for counters, so the UI could show Matched > 0
  // with no rows in the table.
  const rawNormalized=(Array.isArray(rawTrips) ? rawTrips : [])
    .map(tripForEngine)
    .filter(trip=>Boolean(trip.externalTripId || trip.tripNumber));
  const summaryNormalized=(Array.isArray(summaryTrips) ? summaryTrips : [])
    .map(tripForEngine)
    .filter(trip=>Boolean(trip.externalTripId || trip.tripNumber));
  const trips=summaryNormalized.length ? summaryNormalized : rawNormalized;

  if(!trips.length){
    saveScanSummary(id,connection,Array.isArray(summaryTrips)?summaryTrips:[],[],[]);
    return {
      scanned:0,
      longMatched:0,
      shortMatched:0,
      longResults:[],
      shortResults:[]
    };
  }

  const {longTrips,shortTrips}=
    await selectedByEngine(trips,settings);

  const [longResults,shortResults]=
    await Promise.all([
      logEngineMatches(
        id,
        connection,
        "LONG",
        longTrips,
        settings.longEngine || {},
        {source,receivedAt,settings}
      ),
      logEngineMatches(
        id,
        connection,
        "SHORT",
        shortTrips,
        settings.shortEngine || {},
        {source,receivedAt,settings}
      )
    ]);

  // The same canonical trips produced the activity rows above, so the
  // dashboard counters and table cannot diverge.
  saveScanSummary(id,connection,trips,longTrips,shortTrips);

  await Settings.updateOne(
    {tenantId:id},
    {$set:{
      lastScanAt:new Date(),
      lastSuccessfulScanAt:new Date(),
      lastError:""
    }}
  ).catch(()=>{});

  return {
    scanned:trips.length,
    longMatched:longTrips.length,
    shortMatched:shortTrips.length,
    longResults,
    shortResults
  };
}

async function reEvaluateCurrentTrips(id,settings){
  const getTrips=
    providerPortalBridgeRoutes.getNormalizedTripsForConnection;

  if(typeof getTrips!=="function"){
    return {connections:0,scanned:0};
  }

  const connections=
    await BrokerIntegration.find({
      tenantId:id,
      connectionMode:"MARKETPLACE_PORTAL",
      enabled:true,
      featureVisible:true,
      billingEnabled:true
    });

  let scanned=0;

  for(const connection of connections){
    const rawTrips=getTrips(id,String(connection._id));
    const result=await evaluateConnectionTrips({
      id,
      connection,
      settings,
      rawTrips,
      source:"SETTINGS_SAVE"
    });
    scanned+=Number(result.scanned||0);
  }

  return {connections:connections.length,scanned};
}

if(
  typeof providerPortalBridgeRoutes.registerDiscoveryListener==="function"
){
  providerPortalBridgeRoutes.registerDiscoveryListener(
    async event=>{
      const id=clean(event?.tenantId);
      const connectionId=clean(event?.connectionId);

      if(!id || !connectionId){
        return;
      }

      const settings=await getSettings(id);
      if(settings.enabled===false){
        return;
      }

      const connection=
        await marketplaceConnection(id,connectionId);

      await evaluateConnectionTrips({
        id,
        connection,
        settings,
        rawTrips:Array.isArray(event?.trips) ? event.trips : [],
        summaryTrips:providerPortalBridgeRoutes.getNormalizedTripsForConnection?.(id,connectionId),
        source:event?.discoveryType==="DOM" ? "DISCOVERY" : "NETWORK_DISCOVERY",
        receivedAt:event?.receivedAt
      });
    }
  );
}

/* =========================
   ENGINE SETTINGS
   Generic endpoint; retains the existing stored settings through the MarketplaceSettings compatibility model.
========================= */

router.get("/scan-summary",(req,res)=>{
  const id=tenantId(req);
  const connectionId=clean(req.query.connectionId);
  if(!id || !connectionId){
    return res.status(400).json({success:false,message:"Broker connection is required"});
  }
  const summary=latestScanSummaries.get(`${id}:${connectionId}`);
  return res.json({
    success:true,
    summary:summary
      ? {
          available:summary.available,
          matched:summary.matched,
          imported:summary.imported,
          observedAt:summary.observedAt,
          matchedTripIds:[...summary.matchedIds],
          matchedTrips:Array.isArray(summary.matchedTrips)?summary.matchedTrips:[]
        }
      : null
  });
});

router.post("/accept",async(req,res)=>{
  try{
    const id=tenantId(req);
    const connectionId=clean(req.body?.connectionId);
    const externalTripId=clean(req.body?.externalTripId);
    if(!id || !connectionId || !externalTripId){
      return res.status(400).json({success:false,message:"Broker connection and trip are required",reason:"MISSING_ACCEPT_INPUT"});
    }
    const [connection,settings]=await Promise.all([
      marketplaceConnection(id,connectionId),
      getSettings(id)
    ]);
    if(settings.enabled===false){
      return res.status(409).json({success:false,message:"Marketplace is disabled in Settings",reason:"MARKETPLACE_DISABLED"});
    }
    const summary=latestScanSummaries.get(`${id}:${connectionId}`);
    if(!summary || !summary.matchedIds.has(externalTripId)){
      return res.status(409).json({success:false,message:"This trip is no longer in the latest matched scan. Refresh the broker portal and try again.",reason:"TRIP_NOT_CURRENTLY_MATCHED"});
    }
    const receivedAt=summary.observedAt;
    const normalized=providerPortalBridgeRoutes.getNormalizedTripsForConnection?.(id,connectionId) || [];
    const trip=normalized.map(tripForEngine).find(row=>
      [row.externalTripId,row.portalTripId,row.tripNumber].some(value=>clean(value)===externalTripId)
    );
    if(!trip){
      setMatchedTripFailure(id,connectionId,externalTripId,"TRIP_NOT_CURRENTLY_MATCHED");
      return res.status(409).json({success:false,message:"The trip is no longer available in the live broker data. Refresh and try again.",reason:"TRIP_NOT_CURRENTLY_MATCHED"});
    }
    trip.externalTripId=externalTripId;
    const {longTrips,shortTrips}=await selectedByEngine(normalized.map(tripForEngine),settings);
    let engineName="";
    let engineSettings=null;
    if(longTrips.some(row=>[row.externalTripId,row.portalTripId,row.tripNumber].some(value=>clean(value)===externalTripId))){
      engineName="LONG";
      engineSettings=settings.longEngine||{};
    }else if(shortTrips.some(row=>[row.externalTripId,row.portalTripId,row.tripNumber].some(value=>clean(value)===externalTripId))){
      engineName="SHORT";
      engineSettings=settings.shortEngine||{};
    }
    if(!engineName){
      setMatchedTripFailure(id,connectionId,externalTripId,"TRIP_NOT_CURRENTLY_MATCHED");
      return res.status(409).json({success:false,message:"The trip no longer matches the current engine filters.",reason:"TRIP_NOT_CURRENTLY_MATCHED"});
    }
    const result=await maybeQueueClaim(id,connection,engineName,trip,engineSettings,{
      manualAccept:true,
      source:"DISCOVERY",
      receivedAt,
      settings
    });
    if(!result.queued){
      const reason=String(result.reason||"CLAIM_QUEUE_UNAVAILABLE");
      setMatchedTripFailure(id,connectionId,externalTripId,reason);
      await Activity.updateOne(
        {tenantId:id,integrationId:connection._id,externalTripId,action:"MATCHED"},
        {$set:{"meta.lastClaimFailure":reason,"meta.lastClaimFailureAt":new Date()}}
      ).catch(()=>{});
      return res.status(409).json({success:false,reason,message:`Accept is blocked: ${reason.replaceAll("_"," ").toLowerCase()}`});
    }
    setMatchedTripFailure(id,connectionId,externalTripId,"");
    return res.json({success:true,queued:true,message:"Accept request sent to the broker browser. Waiting for portal confirmation."});
  }catch(err){
    return res.status(Number(err?.statusCode)||500).json({success:false,message:err.message||"Could not queue Accept request",reason:"ACCEPT_REQUEST_FAILED"});
  }
});

router.get(
  "/settings",
  async (req,res) => {

    try{

      const id =
        tenantId(req);

      if(!id){

        return res.status(400).json({
          success:false,
          message:"Tenant is required"
        });
      }

      const settings =
        await getSettings(id);

      return res.json({
        success:true,
        settings
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to load Marketplace settings"
      });
    }
  }
);

router.put(
  "/settings",
  async (req,res) => {

    try{

      const id =
        tenantId(req);

      if(!id){

        return res.status(400).json({
          success:false,
          message:"Tenant is required"
        });
      }

      const body =
        req.body ||
        {};

      const update = {
        enabled:
          body.enabled !== false,

        connectionMethod:
          "MTM_PORTAL",

        dateWindowDays:
          Math.trunc(Math.min(
            31,
            Math.max(
              1,
              Number(
                body.dateWindowDays
              ) || 7
            )
          )),

        totalDailyTripLimit:
          Math.trunc(Math.max(
            0,
            Number(
              body.totalDailyTripLimit
            ) || 0
          )),

        longEngine:
          normalizeEngine(
            body.longEngine
          ),

        shortEngine:
          normalizeEngine(
            body.shortEngine
          )
      };

      const settings =
        await Settings.findOneAndUpdate(
          {
            tenantId:id
          },
          {
            $set:update
          },
          {
            new:true,
            upsert:true,
            setDefaultsOnInsert:true,
            runValidators:true
          }
        );

      const reEvaluation =
        settings.enabled === false
          ? {connections:0,scanned:0}
          : await reEvaluateCurrentTrips(
              id,
              settings
            );

      return res.json({
        success:true,
        settings,
        reEvaluation
      });

    }catch(err){

      return res.status(400).json({
        success:false,
        message:
          err.message ||
          "Failed to save Marketplace settings"
      });
    }
  }
);

/* =========================
   CONNECTION-SCOPED ACTIVITY
========================= */

router.get(
  "/activity",
  async (req,res) => {

    try{

      const id =
        tenantId(req);

      if(!id){

        return res.status(400).json({
          success:false,
          message:"Tenant is required"
        });
      }

      // Run retention opportunistically during normal scans; no separate worker
      // is required, and active trip data is never touched here.
      await pruneMarketplaceActivity(id);

      const connectionId =
        clean(
          req.query.connectionId
        );

      // integrationId is stored as a Mongo ObjectId on new activity rows,
      // while the browser sends connectionId as text.
      let connectionObjectId = null;
      if(connectionId){
        const connectionDoc = await BrokerIntegration.findOne({
          tenantId:id,
          _id:connectionId
        }).select({_id:1}).lean().catch(()=>null);
        connectionObjectId = connectionDoc?._id || null;
      }

      const limit =
        Math.min(
          300,
          Math.max(
            1,
            Number(
              req.query.limit
            ) || 100
          )
        );

      const filter = {
        tenantId:id,
        // Activity is the result of the configured engines, not an inventory
        // of every trip the broker portal exposed.
        action:{$in:["MATCHED","CLAIM_ATTEMPT","CLAIMED","CLAIM_FAILED","IMPORTED"]},
        externalTripId:{$nin:["",null]}
      };

      if(connectionId){
        filter.$or=[
          {"meta.connectionId":connectionId},
          {"meta.marketplaceConnectionId":connectionId},
          {"meta.brokerIntegrationId":connectionId},
          ...(connectionObjectId ? [{integrationId:connectionObjectId}] : []),
          {integrationId:connectionId}
        ];
      }

      // Each external trip gets one visible row, even when recurring scans
      // produced many MATCHED events. Preserve the most advanced claim state.
      const rows=await Activity.aggregate([
        {$match:filter},
        {$addFields:{activityRank:{$switch:{branches:[
          {case:{$eq:["$action","IMPORTED"]},then:5},
          {case:{$eq:["$action","CLAIMED"]},then:4},
          {case:{$eq:["$action","CLAIM_FAILED"]},then:3},
          {case:{$eq:["$action","CLAIM_ATTEMPT"]},then:2}
        ],default:1}}}},
        {$sort:{activityRank:-1,occurredAt:-1,_id:-1}},
        {$group:{_id:{connectionId:{$ifNull:[
          "$meta.connectionId",
          {$toString:"$integrationId"}
        ]},tripId:"$externalTripId"},row:{$first:"$$ROOT"}}},
        {$replaceRoot:{newRoot:"$row"}},
        {$project:{activityRank:0}},
        {$sort:{occurredAt:-1,_id:-1}},
        {$limit:limit}
      ]);

      return res.json({
        success:true,
        activity:rows
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to load Marketplace activity"
      });
    }
  }
);

/*
  Remove only old unscoped Marketplace test/activity rows that pre-date
  connectionId isolation. Scoped/new rows are preserved.
*/
router.post(
  "/activity/cleanup-legacy",
  async (req,res) => {

    try{

      const id =
        tenantId(req);

      if(!id){

        return res.status(400).json({
          success:false,
          message:"Tenant is required"
        });
      }

      const result =
        await Activity.deleteMany({
          tenantId:id,
          $or:[
            {
              "meta.connectionId":{
                $exists:false
              }
            },
            {
              "meta.connectionId":""
            },
            {
              meta:{
                $exists:false
              }
            }
          ]
        });

      return res.json({
        success:true,
        deleted:
          Number(
            result?.deletedCount ||
            0
          ),
        message:"Legacy unscoped Marketplace activity cleared."
      });

    }catch(err){

      return res.status(500).json({
        success:false,
        message:
          err.message ||
          "Failed to clear legacy Marketplace activity"
      });
    }
  }
);

/* =========================
   GENERIC MARKETPLACE SCAN
========================= */

router.post(
  "/scan",
  async (req,res) => {

    try{

      const id =
        tenantId(req);

      if(!id){

        return res.status(400).json({
          success:false,
          message:"Tenant is required"
        });
      }

      await pruneMarketplaceActivity(id);

      const connectionId =
        clean(
          req.body?.connectionId ||
          req.query?.connectionId
        );

      if(!connectionId){

        return res.status(400).json({
          success:false,
          message:"connectionId is required"
        });
      }

      const [
        connection,
        settings
      ] =
        await Promise.all([
          marketplaceConnection(
            id,
            connectionId
          ),
          getSettings(id)
        ]);

      if(
        settings.enabled === false
      ){

        return res.status(409).json({
          success:false,
          message:"Marketplace is disabled in Settings"
        });
      }

      const getTrips =
        providerPortalBridgeRoutes
          .getNormalizedTripsForConnection;

      if(
        typeof getTrips !==
        "function"
      ){

        return res.status(500).json({
          success:false,
          message:"Provider Portal Bridge connection accessor is unavailable"
        });
      }

      const rawTrips =
        getTrips(
          id,
          connectionId
        );

      if(
        !Array.isArray(rawTrips) ||
        rawTrips.length === 0
      ){

        return res.status(409).json({
          success:false,
          message:
            `No normalized trips are available for ${connection.brokerName || connection.brokerCode || "this broker"} yet`
        });
      }

      const trips =
        rawTrips
          .map(
            tripForEngine
          )
          .filter(
            trip =>
              Boolean(
                trip.externalTripId ||
                trip.tripNumber
              )
          );

      const {
        longTrips,
        shortTrips
      } =
        await selectedByEngine(
          trips,
          settings
        );

      const [
        longResults,
        shortResults
      ] =
        await Promise.all([
          logEngineMatches(
            id,
            connection,
            "LONG",
            longTrips,
            settings.longEngine || {},
            {
              source:"DISCOVERY",
              receivedAt:new Date().toISOString(),
              settings
            }
          ),

          logEngineMatches(
            id,
            connection,
            "SHORT",
            shortTrips,
            settings.shortEngine || {},
            {
              source:"DISCOVERY",
              receivedAt:new Date().toISOString(),
              settings
            }
          )
        ]);

      saveScanSummary(id,connection,trips,longTrips,shortTrips);

      await Settings.updateOne(
        {
          tenantId:id
        },
        {
          $set:{
            lastScanAt:
              new Date(),

            lastSuccessfulScanAt:
              new Date(),

            lastError:
              ""
          }
        }
      );

      return res.json({
        success:true,
        readOnlyEvaluation:true,
        connectionId,
        brokerName:
          connection.brokerName,
        accountLabel:
          connection.accountLabel ||
          "Primary Account",
        result:{
          scanned:
            trips.length,
          longMatched:
            longTrips.length,
          shortMatched:
            shortTrips.length,
          longResults,
          shortResults
        },
        message:
          `${connection.brokerName || "Broker"} scan complete. Long/Short engines were evaluated for this connection only.`
      });

    }catch(err){

      const status =
        Number(
          err?.statusCode
        ) || 500;

      return res
        .status(status)
        .json({
          success:false,
          message:
            err.message ||
            "Marketplace scan failed"
        });
    }
  }
);

module.exports =
  router;
