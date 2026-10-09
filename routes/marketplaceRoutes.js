"use strict";

/*
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

const ExternalTrip = require("../models/ExternalTrip");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

const clean =
  value =>
    String(value ?? "").trim();

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

  return Activity.create({

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
  });
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

    const claim=await maybeQueueClaim(id,connection,engineName,trip,engineSettings,options);

    await logActivity(
      id,
      connection,
      "MATCHED",
      {
        engine:engineName,
        trip,
        message:
          `${engineName} engine matched trip ${clean(trip.externalTripId || trip.portalTripId)}`
      }
    );

    if(claim.queued){
      results.push({engine:engineName,externalTripId:clean(trip.externalTripId || trip.portalTripId),
        matched:true,claimed:false,reason:"CLAIM_QUEUED"});
      continue;
    }

    const reason=claim.reason;
    const message=`${engineName} matched trip ${clean(trip.externalTripId || trip.portalTripId)}; ${reason}`;

    await logActivity(
      id,
      connection,
      "SKIPPED",
      {
        engine:engineName,
        trip,
        reason,
        message
      }
    );

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
async function claimedOrPendingCount(id,engineName,since){
  const scope={tenantId:id};
  if(engineName) scope.engine=engineName;
  // A failed attempt cannot use up a day's accepted-trip allowance.
  // Reserve capacity briefly while a portal command is still in flight.
  const pendingSince=new Date(Math.max(since.getTime(),Date.now()-30000));
  const [claimed,pending]=await Promise.all([
    Activity.distinct("externalTripId",{...scope,action:"CLAIMED",occurredAt:{$gte:since}}),
    Activity.distinct("externalTripId",{...scope,action:"CLAIM_ATTEMPT",occurredAt:{$gte:pendingSince}})
  ]);
  return new Set([...claimed,...pending].map(clean).filter(Boolean)).size;
}

async function queueClaimWithinTenant(id,connection,engineName,trip,engineSettings,options){
  if(engineSettings?.autoAccept!==true) return {reason:"AUTO_ACCEPT_OFF"};
  if(options.source!=="DISCOVERY") return {reason:"LIVE_DISCOVERY_ONLY"};
  const discoveredAt=Date.parse(options.receivedAt);
  if(!Number.isFinite(discoveredAt) || Math.abs(Date.now()-discoveredAt)>15000)
    return {reason:"DISCOVERY_TOO_OLD"};
  const externalTripId=clean(trip.externalTripId || trip.portalTripId);
  const selector=clean(trip.acceptActionSelector);
  const actionText=clean(trip.acceptActionText);
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
      const count=await claimedOrPendingCount(id,"",since);
      if(count>=totalLimit) return {reason:"TOTAL_DAILY_LIMIT"};
    }
    if(engineLimit>0){
      const count=await claimedOrPendingCount(id,engineName,since);
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
    if(!imported?.trip?._id)
      throw new Error("External Hub did not return a saved trip ID");
    const hubTrip=await ExternalTrip.findOne({
      _id:imported.trip._id,
      tenantId:command.tenantId,
      externalTripId:command.externalTripId
    }).select("_id ghExternalTripNumber").lean();
    if(!hubTrip)
      throw new Error("Accepted trip was not found in External Hub after import");
    await logActivity(command.tenantId,connection,"IMPORTED",{
      engine:command.engine,externalTripId:command.externalTripId,
      message:imported.duplicate?"Claimed trip already exists in External Hub":
        "Confirmed portal claim imported to External Hub",
      meta:{...meta,hubTripId:String(hubTrip._id),hubTripNumber:hubTrip.ghExternalTripNumber}});
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

async function evaluateConnectionTrips({
  id,
  connection,
  settings,
  rawTrips,
  source="AUTO",
  receivedAt=""
}){
  const trips =
    (Array.isArray(rawTrips) ? rawTrips : [])
      .map(tripForEngine)
      .filter(trip=>Boolean(trip.externalTripId || trip.tripNumber));

  if(!trips.length){
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

      const connectionId =
        clean(
          req.query.connectionId
        );

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
        action:{$in:["MATCHED","SKIPPED","CLAIM_ATTEMPT","CLAIMED","CLAIM_FAILED","IMPORTED","ERROR"]},
        externalTripId:{$nin:["",null]}
      };

      if(connectionId){

        filter["meta.connectionId"] =
          connectionId;
      }

      // Use the _id index and a bounded window. Sorting the full discovery
      // history in an aggregation previously exhausted MongoDB memory.
      const events=await Activity.find(filter)
        .sort({_id:-1})
        .limit(Math.min(3000,Math.max(500,limit*20)))
        .lean();
      const rank={IMPORTED:7,ERROR:6,CLAIMED:5,CLAIM_FAILED:4,
        CLAIM_ATTEMPT:3,SKIPPED:2,MATCHED:1};
      const chosen=new Map();
      for(const row of events){
        const key=`${clean(row?.meta?.connectionId)}:${clean(row.externalTripId)}`;
        const previous=chosen.get(key);
        if(!previous || (rank[row.action]||0)>(rank[previous.action]||0))
          chosen.set(key,row);
      }
      const rows=[...chosen.values()]
        .sort((a,b)=>Date.parse(b.occurredAt||0)-Date.parse(a.occurredAt||0))
        .slice(0,limit);

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

      await logActivity(
        id,
        connection,
        "SCAN",
        {
          engine:"SYSTEM",
          message:
            `Marketplace scan started for ${connection.brokerName || connection.brokerCode || "broker"} / ${connection.accountLabel || "Primary Account"}`,
          meta:{
            scannedCount:
              trips.length
          }
        }
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
            settings.longEngine || {}
          ),

          logEngineMatches(
            id,
            connection,
            "SHORT",
            shortTrips,
            settings.shortEngine || {}
          )
        ]);

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
