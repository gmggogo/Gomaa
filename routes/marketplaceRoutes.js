"use strict";

/*
// Marketplace vehicle matching: require at least one configured, eligible car.
DESTINATION PATH:
server/routes/marketplaceRoutes.js

PURPOSE:
Generic Marketplace backend for any Marketplace Portal broker connection.

IMPORTANT:
- Uses BrokerIntegration connectionId, NOT brokerCode=MT.
- Reads normalized trips from providerPortalBridgeRoutes per connectionId.
- Applies each enabled vehicle's own zone, service, trip category, and work hours.
- The portal claim is sent only for a fresh discovery with Auto Accept on.
- A confirmed portal claim is imported through the External Trip service.
- Discovery and match summaries stay in process memory and are not written
  to MarketplaceActivity. Only confirmed claims are imported into External Hub.
*/

const express = require("express");
const jwt = require("jsonwebtoken");
const https = require("https");

const router = express.Router();

const Settings =
  require("../models/MarketplaceSettings");

const Activity =
  require("../models/MarketplaceActivity");

const MarketplaceClaimRecord =
  require("../models/MarketplaceClaimRecord");

const ExternalTrip =
  require("../models/ExternalTrip");

const DriverSchedule =
  require("../models/DriverSchedule");

const Trip =
  require("../models/Trip");

const googleRoutes =
  require("../services/sharedEngineGoogleRoutes");

const tripPlanner =
  require("../services/mtm/marketplaceTripPlanner");

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

// Marketplace scan results are not written to MarketplaceActivity. This
// retention sweep only cleans up legacy telemetry left by older builds. Run it
// at most once per tenant per 24 hours so frequent scans do not issue repeated
// delete queries. Accepted trips are persisted separately in External Hub.
const MARKETPLACE_ACTIVITY_RETENTION_DAYS = Math.max(
  1,
  Number(process.env.MARKETPLACE_ACTIVITY_RETENTION_DAYS) || 7
);
const marketplaceActivityPrunedAt = new Map();

async function pruneMarketplaceActivity(tenantId){
  const tenantKey = String(tenantId || '');
  const now = Date.now();
  const lastPrunedAt = marketplaceActivityPrunedAt.get(tenantKey) || 0;
  if(now - lastPrunedAt < 24 * 60 * 60 * 1000){
    return {acknowledged:true, deletedCount:0, skipped:true};
  }

  // Mark before awaiting to collapse concurrent scans into one cleanup query.
  marketplaceActivityPrunedAt.set(tenantKey, now);
  const cutoff = new Date(
    now - MARKETPLACE_ACTIVITY_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );
  try{
    return await Activity.deleteMany({tenantId, occurredAt:{$lt:cutoff}});
  }catch(err){
    marketplaceActivityPrunedAt.delete(tenantKey);
    throw err;
  }
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

    pickupTime:
      clean(
        trip.pickupTime ||
        trip.tripTime ||
        trip.appointmentTime
      ),

    dropoffTime:
      clean(
        trip.dropoffTime ||
        trip.dropOffTime ||
        ""
      ),

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

  const longMinMiles=Math.max(0,Number(settings?.longMinMiles)||100);
  const mediumMinMiles=Math.max(0,Number(settings?.mediumMinMiles)||50);
  const thresholds={longMinMiles,mediumMinMiles};
  const scheduleRows=settings?.tenantId
    ? await DriverSchedule.find({tenantId:settings.tenantId,enabled:{$ne:false}})
        .select("driverId vehicleNumber services vehicleCategory")
        .lean()
    : [];
  const scheduleByVehicle=new Map(scheduleRows.map(row=>[
    `${clean(row.driverId).toLowerCase()}:${clean(row.vehicleNumber)}`,
    row
  ]));

  // Fail closed when there is no enabled vehicle configuration. The old
  // global engine zones are intentionally not used as a substitute: doing so
  // was the reason a trip could match even when no car's zone matched it.
  const enabledVehicles=(Array.isArray(settings?.vehicleConfigs)?settings.vehicleConfigs:[])
    .map(vehicle=>typeof vehicle?.toObject==="function"?vehicle.toObject():vehicle)
    .filter(vehicle=>vehicle?.enabled===true&&clean(vehicle.driverId)&&clean(vehicle.vehicleNumber))
    .map(vehicle=>{
      const key=`${clean(vehicle.driverId).toLowerCase()}:${clean(vehicle.vehicleNumber)}`;
      const schedule=scheduleByVehicle.get(key);
      if(!schedule) return null;
      return {
        ...vehicle,
        services:Array.isArray(schedule.services)?schedule.services:[],
        vehicleCategory:clean(schedule.vehicleCategory||vehicle.vehicleCategory||"GENERIC")
      };
    })
    .filter(Boolean);

  const matchesByTrip=new Map();
  const tripById=new Map();
  for(const trip of inWindow){
    const tripId=clean(trip.externalTripId||trip.portalTripId||trip.tripNumber);
    const miles=Number(trip.tripMiles??trip.miles??trip.distance);
    if(!tripId||!Number.isFinite(miles)||miles<=0) continue;
    tripById.set(tripId,trip);
    matchesByTrip.set(tripId,[]);
  }

  const timeMinutes=tripPlanner.timeMinutes;
  const inWorkWindow=(value,startValue,endValue)=>{
    const at=timeMinutes(value),start=timeMinutes(startValue),endTime=timeMinutes(endValue);
    if(at===null||start===null||endTime===null) return false;
    return start<=endTime ? at>=start&&at<=endTime : at>=start||at<=endTime;
  };
  const tripDuration=trip=>{
    const explicit=Number(trip.durationMinutes??trip.estimatedDurationMinutes??trip.travelTimeMinutes);
    if(Number.isFinite(explicit)&&explicit>0) return explicit;
    const pickup=timeMinutes(trip.pickupTime||trip.tripTime||trip.appointmentTime);
    const dropoff=timeMinutes(trip.dropoffTime||trip.dropOffTime);
    if(pickup===null||dropoff===null) return null;
    return dropoff>=pickup?dropoff-pickup:dropoff+1440-pickup;
  };
  const zoneSettingsFor=vehicle=>{
    const pickupZoneZip=clean(vehicle.pickupZoneZip);
    const dropoffZoneZip=clean(vehicle.dropoffZoneZip);
    return {
      enabled:true,
      zoneRadiusMiles:Math.max(0,Number(vehicle.zoneRadiusMiles)||0),
      pickupZoneCity:clean(vehicle.pickupZoneCity),
      pickupZoneState:clean(vehicle.pickupZoneState).toUpperCase(),
      pickupZoneZip,
      pickupZoneAddress:clean(vehicle.pickupZoneAddress),
      dropoffZoneCity:clean(vehicle.dropoffZoneCity),
      dropoffZoneState:clean(vehicle.dropoffZoneState).toUpperCase(),
      dropoffZoneZip,
      dropoffZoneAddress:clean(vehicle.dropoffZoneAddress),
      pickupZipCodes:pickupZoneZip?[pickupZoneZip]:[],
      dropoffZipCodes:dropoffZoneZip?[dropoffZoneZip]:[],
      zoneMatch:["ANY","PICKUP","DROPOFF","EITHER","BOTH"].includes(clean(vehicle.zoneMatch).toUpperCase())
        ? clean(vehicle.zoneMatch).toUpperCase()
        : "PICKUP",
      pickupTimeFrom:clean(vehicle.shiftStart)||"00:00",
      pickupTimeTo:clean(vehicle.shiftEnd)||"23:59",
      dropoffTimeFrom:clean(vehicle.shiftStart)||"00:00",
      dropoffTimeTo:clean(vehicle.shiftEnd)||"23:59",
      modes:(Array.isArray(vehicle.services)?vehicle.services:[]).map(service=>{
        const value=clean(service).toUpperCase();
        if(["ST","AMBULATORY"].includes(value)) return "Ambulatory";
        if(["WH","WHEELCHAIR","PARALIFT"].includes(value)) return "Wheelchair";
        return clean(service);
      })
    };
  };

  // Evaluate each car independently. A trip appears only when at least one
  // enabled Driver Schedule vehicle passes its own service, zone, category,
  // working-time, and trip-mile checks.
  await Promise.all(enabledVehicles.map(async vehicle=>{
    const perVehicle=zoneSettingsFor(vehicle);
    const measuredTrips=await enrichZoneDistances(inWindow,perVehicle);
    for(const trip of measuredTrips){
      const tripId=clean(trip.externalTripId||trip.portalTripId||trip.tripNumber);
      const miles=Number(trip.tripMiles??trip.miles??trip.distance);
      const category=tripPlanner.classifyTrip(trip,thresholds);
      const categories=vehicle.tripCategories||{};
      if(!matchesByTrip.has(tripId)) continue;
      if(categories[category.toLowerCase()]!==true) continue;
      if(!tripPlanner.vehicleSupportsTrip(vehicle,category,trip.mode||trip.serviceType||trip.levelOfService)) continue;
      if(Number(vehicle.maxDailyMiles)>0&&miles>Number(vehicle.maxDailyMiles)) continue;
      if(!longEngine.matches(trip,perVehicle)) continue;

      const pickupTime=clean(trip.pickupTime||trip.tripTime||trip.appointmentTime);
      const dropoffTime=clean(trip.dropoffTime||trip.dropOffTime);
      const shiftStart=clean(vehicle.shiftStart)||"00:00";
      const shiftEnd=clean(vehicle.shiftEnd)||"23:59";
      if(!inWorkWindow(pickupTime,shiftStart,shiftEnd)) continue;
      const duration=tripDuration(trip);
      if(Number(vehicle.maxWorkHours)>0&&duration!==null&&duration>Number(vehicle.maxWorkHours)*60) continue;
      if(dropoffTime&&!inWorkWindow(dropoffTime,shiftStart,shiftEnd)){
        const lateTolerance=Math.max(0,Number(settings?.dropoffLateToleranceMinutes)||0);
        const dropoff=timeMinutes(dropoffTime),endTime=timeMinutes(shiftEnd);
        if(dropoff===null||endTime===null||dropoff>endTime+lateTolerance) continue;
      }

      matchesByTrip.get(tripId).push({
        driverId:clean(vehicle.driverId),
        driverName:clean(vehicle.driverName),
        vehicleNumber:clean(vehicle.vehicleNumber),
        vehicleCategory:clean(vehicle.vehicleCategory||"GENERIC"),
        services:Array.isArray(vehicle.services)?vehicle.services:[],
        category
      });
    }
  }));

  const grouped={LONG:[],MEDIUM:[],SHORT:[]};
  for(const [tripId,eligibleVehicles] of matchesByTrip){
    if(!eligibleVehicles.length) continue;
    const trip=tripById.get(tripId);
    const category=tripPlanner.classifyTrip(trip,thresholds);
    grouped[category].push({...trip,_matchedVehicles:eligibleVehicles});
  }
  for(const category of Object.keys(grouped)){
    grouped[category].sort((a,b)=>Number(b.tripMiles??b.miles??0)-Number(a.tripMiles??a.miles??0));
  }

  return {
    longTrips:grouped.LONG,
    mediumTrips:grouped.MEDIUM,
    shortTrips:grouped.SHORT
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
    const assignment=Array.isArray(trip._matchedVehicles)?trip._matchedVehicles[0]:null;
    const claimSettings={...engineSettings,enabled:true,autoAccept:options.settings?.acceptEnabled!==false};
    const claim=assignment
      ? await maybeQueueClaim(id,connection,engineName,trip,claimSettings,{...options,assignment})
      : {reason:"NO_ELIGIBLE_VEHICLE"};

    if(claim.queued){
      results.push({engine:engineName,externalTripId:clean(trip.externalTripId || trip.portalTripId),
        matched:true,claimed:false,reason:"CLAIM_QUEUED"});
      continue;
    }

    const reason=claim.reason;
    const externalTripId=clean(trip.externalTripId||trip.portalTripId||trip.tripNumber);
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
// Claim state and trip snapshots stay in process memory while a portal claim
// is pending. Discovery results and failed attempts must never be written to
// MarketplaceActivity; only a confirmed trip is persisted by createExternalTrip.
const pendingClaimTrips=new Map();
const recentClaimAttempts=new Map();
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
  // Auto Accept is a hard requirement. A UI/manual endpoint must never bypass
  // the saved engine toggle; only an enabled engine with Auto Accept on may queue.
  if(engineSettings?.autoAccept!==true) return {reason:"AUTO_ACCEPT_OFF"};
  if(options.settings?.acceptEnabled===false) return {reason:"ACCEPT_DISABLED"};
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
  const persistentKey={tenantId:id,integrationId:connection._id,externalTripId};
  const [claimRecord,legacyAccepted]=await Promise.all([
    MarketplaceClaimRecord.findOne(persistentKey).lean(),
    ExternalTrip.findOne({tenantId:id,externalTripId,
      brokerCode:clean(connection.brokerCode).toUpperCase()}).select("_id").lean()
  ]);
  if(tripPlanner.shouldBlockClaimRecord(claimRecord) || legacyAccepted)
    return {reason:"ALREADY_ACCEPTED_OR_PENDING"};
  let command=null;
  try{
    const cutoff=Date.now()-86400000;
    for(const [attemptId,attempt] of recentClaimAttempts){
      if(attempt.at<cutoff) recentClaimAttempts.delete(attemptId);
    }
    const totalLimit=Math.max(0,Math.trunc(Number(options.settings?.totalDailyTripLimit)||0));
    const engineLimit=Math.max(0,Math.trunc(Number(engineSettings?.dailyTripLimit)||0));
    const tenantAttempts=[...recentClaimAttempts.values()].filter(attempt=>attempt.tenantId===id);
    if(totalLimit>0){
      if(tenantAttempts.length>=totalLimit) return {reason:"TOTAL_DAILY_LIMIT"};
    }
    if(engineLimit>0){
      const count=tenantAttempts.filter(attempt=>attempt.engine===engineName).length;
      if(count>=engineLimit) return {reason:"ENGINE_DAILY_LIMIT"};
    }
    command=providerPortalBridgeRoutes.enqueueClaimCommand?.({tenantId:id,
      connectionId:String(connection._id),engine:engineName,externalTripId,
      selector,actionText,sourceUrl:trip.sourceUrl});
    if(!command) return {reason:"CLAIM_QUEUE_UNAVAILABLE"};
    const snapshot={
      portalTripId:externalTripId,tripDate:clean(trip.tripDate),
      pickupTime:clean(trip.pickupTime),appointmentTime:clean(trip.appointmentTime),
      memberName:clean(trip.memberName),memberPhone:clean(trip.memberPhone),
      pickupAddress:clean(trip.pickupAddress),dropoffAddress:clean(trip.dropoffAddress),
      mode:clean(trip.mode)
    };
    await MarketplaceClaimRecord.findOneAndUpdate(persistentKey,{$set:{
      brokerCode:clean(connection.brokerCode).toUpperCase(),
      tripFingerprint:tripPlanner.tripFingerprint(snapshot),
      status:"CLAIM_PENDING",claimCommandId:command.commandId,
      claimEngine:engineName,tripSnapshot:snapshot,lastError:""
    }},{$setOnInsert:{acceptedAt:null}},{upsert:true,new:true});
    pendingClaimTrips.set(command.commandId,{
      tenantId:id,
      connectionId:String(connection._id),
      externalTripId,
      assignment:options.assignment||null,
      trip:{
        portalTripId:externalTripId,tripDate:clean(trip.tripDate),
        pickupTime:clean(trip.pickupTime),appointmentTime:clean(trip.appointmentTime),
        memberName:clean(trip.memberName),memberPhone:clean(trip.memberPhone),
        pickupAddress:clean(trip.pickupAddress),dropoffAddress:clean(trip.dropoffAddress),
        mode:clean(trip.mode)
      }
    });
    if(providerPortalBridgeRoutes.activateClaimCommand?.(command.commandId)!==true)
      throw new Error("Claim command could not be activated");
    const attemptedAt=Date.now();
    claimLocks.set(key,attemptedAt);
    recentClaimAttempts.set(command.commandId,{tenantId:id,engine:engineName,at:attemptedAt});
    return {queued:true};
  }catch(err){
    if(command) pendingClaimTrips.delete(command.commandId);
    if(command) await MarketplaceClaimRecord.updateOne({tenantId:id,
      integrationId:connection._id,externalTripId,claimCommandId:command.commandId},
      {$set:{status:"FAILED_NOT_CLICKED",lastError:clean(err.message).slice(0,300)}}).catch(()=>{});
    if(command) providerPortalBridgeRoutes.cancelClaimCommand?.(command.commandId);
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
  const pending=pendingClaimTrips.get(command.commandId);
  pendingClaimTrips.delete(command.commandId);
  if(!result.confirmed){
    // A failure to click is safe to retry on the next live discovery. If the
    // browser did click but could not confirm, retain the lock to avoid a duplicate claim.
    releaseUnclickedClaimAttempt(command,result.clicked);
    await MarketplaceClaimRecord.updateOne({tenantId:command.tenantId,
      integrationId:command.connectionId,externalTripId:command.externalTripId,
      claimCommandId:command.commandId},{$set:{
        status:result.clicked===true?"CLAIM_UNKNOWN":"FAILED_NOT_CLICKED",
        lastError:clean(result.message).slice(0,300)
      }}).catch(()=>{});
    setMatchedTripFailure(command.tenantId,String(command.connectionId),
      command.externalTripId,
      clean(result.message) || (result.clicked?"UNCONFIRMED_AFTER_CLICK":"CLAIM_NOT_CLICKED"));
    return;
  }

  // Persist the successful portal claim before importing it. If import fails,
  // rediscovery still cannot claim the same trip a second time.
  await MarketplaceClaimRecord.updateOne({tenantId:command.tenantId,
    integrationId:command.connectionId,externalTripId:command.externalTripId,
    claimCommandId:command.commandId},{$set:{status:"CLAIMED",acceptedAt:new Date(),lastError:""}});

  try{
    const trip=pending?.trip;
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
        ...(pending.assignment?{
          marketplaceEngineAssigned:true,
          assignmentSource:"MARKETPLACE_ENGINE",
          marketplaceDriverId:pending.assignment.driverId,
          marketplaceDriverName:pending.assignment.driverName,
          marketplaceVehicleNumber:pending.assignment.vehicleNumber
        }:{}),
        brokerStatus:"ACCEPTED"}
    });
    const summary=latestScanSummaries.get(`${command.tenantId}:${command.connectionId}`);
    if(summary) summary.imported=(Number(summary.imported)||0)+1;
  }catch(err){
    console.error("Marketplace confirmed claim could not be imported to External Hub:",clean(err.message).slice(0,300));
  }
}

function tripDateTimeMinutes(valueDate,valueTime){
  const time=tripPlanner.timeMinutes(valueTime);
  if(time===null) return null;
  const date=clean(valueDate).slice(0,10);
  const match=date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match) return null;
  return Date.UTC(Number(match[1]),Number(match[2])-1,Number(match[3]),0,time);
}

async function triggerFinalConfirmationReplacement(trip,status){
  const normalizedStatus=String(status||trip?.status||"").toLowerCase();
  const isNoShow=normalizedStatus.includes("no show")||normalizedStatus.includes("noshow");
  const isCancelled=normalizedStatus.includes("cancel");
  if(!isNoShow&&!isCancelled) return {triggered:false,reason:"STATUS_NOT_ELIGIBLE"};

  const tenantId=trip?.tenantId;
  if(!tenantId) return {triggered:false,reason:"TENANT_MISSING"};
  const settings=await getSettings(tenantId);
  const enabled=isNoShow?settings.noShowReplacementEnabled===true:settings.cancelReplacementEnabled===true;
  if(!enabled) return {triggered:false,reason:"REPLACEMENT_DISABLED"};
  if(settings.enabled===false||settings.acceptEnabled===false) return {triggered:false,reason:"MARKETPLACE_OR_ACCEPT_DISABLED"};

  const driverId=clean(trip.driverId);
  const vehicleNumber=clean(trip.vehicleNumber||trip.vehicle);
  if(!driverId||!vehicleNumber) return {triggered:true,claimed:false,reason:"TRIP_HAS_NO_ASSIGNED_VEHICLE"};
  const vehicle=(settings.vehicleConfigs||[]).find(row=>clean(row.driverId)===driverId&&clean(row.vehicleNumber)===vehicleNumber);
  if(!vehicle||vehicle.enabled!==true) return {triggered:true,claimed:false,reason:"ASSIGNED_VEHICLE_DISABLED_OR_NOT_CONFIGURED"};

  const schedule=await DriverSchedule.findOne({tenantId,driverId}).lean();
  const service=serviceKeyForClaim(trip.serviceKey||trip.serviceType||trip.serviceCode);
  const sameDay=await Trip.find({tenantId,driverId,tripDate:trip.tripDate,_id:{$ne:trip._id},status:{$nin:["Cancelled","Canceled","No Show","Completed"]}})
    .select("tripDate tripTime appointmentTime pickup dropoff tripMiles miles status").lean();
  const failedAt=tripDateTimeMinutes(trip.tripDate,trip.tripTime||trip.pickupTime);
  const later=sameDay.map(row=>({row,at:tripDateTimeMinutes(row.tripDate,row.tripTime||row.appointmentTime)}))
    .filter(item=>item.at!==null&&failedAt!==null&&item.at>failedAt).sort((a,b)=>a.at-b.at)[0];
  const earlier=sameDay.map(row=>({row,at:tripDateTimeMinutes(row.tripDate,row.tripTime||row.appointmentTime)}))
    .filter(item=>item.at!==null&&failedAt!==null&&item.at<failedAt).sort((a,b)=>b.at-a.at)[0];
  const origin=clean(earlier?.row?.dropoff||schedule?.address);
  if(!origin) return {triggered:true,claimed:false,reason:"VEHICLE_ORIGIN_UNAVAILABLE"};

  const connections=await BrokerIntegration.find({tenantId}).lean();
  const candidates=[];
  for(const connection of connections){
    const summary=latestScanSummaries.get(`${tenantId}:${connection._id}`);
    const observedAt=Date.parse(summary?.observedAt||"");
    if(!summary||!Number.isFinite(observedAt)||Date.now()-observedAt>15000) continue;
    const rows=providerPortalBridgeRoutes.getNormalizedTripsForConnection?.(tenantId,String(connection._id))||[];
    const selected=await selectedByEngine(rows.map(tripForEngine),settings);
    for(const [engineName,engineTrips] of [["LONG",selected.longTrips],["MEDIUM",selected.mediumTrips],["SHORT",selected.shortTrips]]){
      for(const candidate of engineTrips){
        const candidateId=clean(candidate.externalTripId||candidate.portalTripId||candidate.tripNumber);
        if(!candidateId||candidateId===clean(trip.brokerTripId)) continue;
        const vehicleMatch=Array.isArray(candidate._matchedVehicles)
          ? candidate._matchedVehicles.some(row=>
              clean(row.driverId)===driverId&&clean(row.vehicleNumber)===vehicleNumber)
          : false;
        if(!vehicleMatch||!tripPlanner.vehicleSupportsTrip(vehicle,engineName,candidate.mode||candidate.serviceType)) continue;
        const candidateDate=clean(candidate.tripDate||candidate.appointmentDate||candidate.date).slice(0,10);
        if(candidateDate!==clean(trip.tripDate).slice(0,10)) continue;
        const pickupAt=tripDateTimeMinutes(candidateDate,candidate.pickupTime||candidate.tripTime||candidate.appointmentTime);
        let originAt=tripDateTimeMinutes(candidateDate,vehicle.shiftStart);
        if(earlier){
          const previousRoute=await googleRoutes.calculateDirect(earlier.row.pickup,earlier.row.dropoff,{useCache:true}).catch(()=>null);
          if(!previousRoute?.minutes) continue;
          originAt=earlier.at+previousRoute.minutes*60000;
        }
        if(pickupAt===null||originAt===null) continue;
        const pickupRoute=await googleRoutes.calculateDirect(origin,candidate.pickupAddress||candidate.pickup,{useCache:true}).catch(()=>null);
        const tripRoute=await googleRoutes.calculateDirect(candidate.pickupAddress||candidate.pickup,candidate.dropoffAddress||candidate.dropoff,{useCache:true}).catch(()=>null);
        if(!pickupRoute?.minutes||!tripRoute?.minutes) continue;
        const pickupLate=Math.max(0,Number(settings.pickupLateToleranceMinutes)||0);
        const arrivalAt=originAt+pickupRoute.minutes*60000;
        if(arrivalAt>pickupAt+pickupLate*60000||pickupAt<originAt) continue;
        const deadhead=Number(pickupRoute.miles)||0;
        const passengerMiles=Number(candidate.tripMiles||candidate.miles||0)||Number(tripRoute.miles)||0;
        const totalMiles=sameDay.reduce((sum,row)=>sum+(Number(row.tripMiles||row.miles)||0),0)+passengerMiles;
        if(vehicle.maxDailyMiles>0&&totalMiles>vehicle.maxDailyMiles) continue;
        if(vehicle.maxDeadheadMiles>0&&deadhead>vehicle.maxDeadheadMiles) continue;
        let nextDeadhead=0;
        if(later){
          const nextRoute=await googleRoutes.calculateDirect(candidate.dropoffAddress||candidate.dropoff,later.row.pickup,{useCache:true}).catch(()=>null);
          if(!nextRoute?.minutes) continue;
          nextDeadhead=Number(nextRoute.miles)||0;
          const candidateDropAt=pickupAt+tripRoute.minutes*60000;
          if(candidateDropAt+nextRoute.minutes*60000>later.at+Math.max(0,Number(settings.dropoffLateToleranceMinutes)||0)*60000) continue;
        }
        if(vehicle.maxDeadheadMiles>0&&deadhead+nextDeadhead>vehicle.maxDeadheadMiles) continue;
        candidates.push({connection,summary,engineName,engineSettings:settings[`${engineName.toLowerCase()}Engine`],candidate,passengerMiles});
      }
    }
  }
  candidates.sort((a,b)=>["LONG","MEDIUM","SHORT"].indexOf(a.engineName)-["LONG","MEDIUM","SHORT"].indexOf(b.engineName)||b.passengerMiles-a.passengerMiles);
  for(const item of candidates){
    const id=String(tenantId), connectionId=String(item.connection._id);
    const row=providerPortalBridgeRoutes.getNormalizedTripsForConnection?.(id,connectionId)?.map(tripForEngine).find(candidate=>clean(candidate.externalTripId||candidate.portalTripId||candidate.tripNumber)===clean(item.candidate.externalTripId||item.candidate.portalTripId||item.candidate.tripNumber));
    if(!row) continue;
    const claim=await maybeQueueClaim(id,item.connection,item.engineName,row,
      {...item.engineSettings,enabled:true,autoAccept:settings.acceptEnabled!==false},{
      source:"DISCOVERY",receivedAt:item.summary.observedAt,settings,
      assignment:{driverId,driverName:clean(trip.driverName)||clean(schedule?.name),vehicleNumber}
    });
    if(claim.queued) return {triggered:true,claimed:true,engine:item.engineName,externalTripId:clean(row.externalTripId||row.portalTripId),driverId,driverName:clean(trip.driverName)||clean(schedule?.name),vehicleNumber};
  }
  return {triggered:true,claimed:false,reason:"NO_FEASIBLE_REPLACEMENT"};
}

router.triggerFinalConfirmationReplacement=triggerFinalConfirmationReplacement;

if(typeof providerPortalBridgeRoutes.registerClaimResultListener==="function")
  providerPortalBridgeRoutes.registerClaimResultListener(handleClaimResult);



/* =========================
   AUTOMATIC MARKETPLACE EVALUATION
   - New/changed discoveries are evaluated immediately.
   - Saving settings re-evaluates the current normalized trip buffer.
========================= */

function saveScanSummary(id,connection,trips,longTrips=[],shortTrips=[],imported=0,mediumTrips=[]){
  const matchedById=new Map();
  for(const trip of [...longTrips,...mediumTrips,...shortTrips]){
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
        ? Number(trip.tripMiles??trip.miles) : null,
      eligibleVehicles:(Array.isArray(trip._matchedVehicles)?trip._matchedVehicles:[]).map(vehicle=>({
        driverId:clean(vehicle.driverId),
        driverName:clean(vehicle.driverName),
        vehicleNumber:clean(vehicle.vehicleNumber),
        vehicleCategory:clean(vehicle.vehicleCategory),
        category:clean(vehicle.category)
      }))
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

function releaseUnclickedClaimAttempt(command,clicked){
  if(clicked===true || !command) return;
  const key=`${clean(command.tenantId)}:${clean(command.connectionId)}:${clean(command.externalTripId)}`;
  claimLocks.delete(key);
  recentClaimAttempts.delete(clean(command.commandId));
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
  // Use one canonical trip buffer for matching and the temporary dashboard
  // summary. Discovery results are not persisted as MarketplaceActivity rows.
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
      mediumMatched:0,
      shortMatched:0,
      longResults:[],
      mediumResults:[],
      shortResults:[]
    };
  }

  const {longTrips,mediumTrips,shortTrips}=
    await selectedByEngine(trips,settings);

  // Create current summary rows before queueing so claim block reasons are
  // retained in memory instead of being erased immediately afterward.
  saveScanSummary(id,connection,trips,longTrips,shortTrips,0,mediumTrips);

  const [longResults,mediumResults,shortResults]=
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
        "MEDIUM",
        mediumTrips,
        settings.mediumEngine || {},
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

  // Do not recreate this summary after queueing; that would erase claim
  // failure reasons captured by logEngineMatches.

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
    mediumMatched:mediumTrips.length,
    shortMatched:shortTrips.length,
    longResults,
    mediumResults,
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
    if(settings.acceptEnabled===false){
      return res.status(409).json({success:false,message:"Accept is disabled in Marketplace Settings",reason:"ACCEPT_DISABLED"});
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
    const {longTrips,mediumTrips,shortTrips}=await selectedByEngine(normalized.map(tripForEngine),settings);
    let engineName="";
    let engineSettings=null;
    let matchedCandidate=null;
    if((matchedCandidate=longTrips.find(row=>[row.externalTripId,row.portalTripId,row.tripNumber].some(value=>clean(value)===externalTripId)))){
      engineName="LONG";
      engineSettings=settings.longEngine||{};
    }else if((matchedCandidate=mediumTrips.find(row=>[row.externalTripId,row.portalTripId,row.tripNumber].some(value=>clean(value)===externalTripId)))){
      engineName="MEDIUM";
      engineSettings=settings.mediumEngine||{};
    }else if((matchedCandidate=shortTrips.find(row=>[row.externalTripId,row.portalTripId,row.tripNumber].some(value=>clean(value)===externalTripId)))){
      engineName="SHORT";
      engineSettings=settings.shortEngine||{};
    }
    if(!engineName){
      setMatchedTripFailure(id,connectionId,externalTripId,"TRIP_NOT_CURRENTLY_MATCHED");
      return res.status(409).json({success:false,message:"The trip no longer matches the current engine filters.",reason:"TRIP_NOT_CURRENTLY_MATCHED"});
    }
    const assignment=Array.isArray(matchedCandidate?._matchedVehicles)?matchedCandidate._matchedVehicles[0]:null;
    if(!assignment){
      setMatchedTripFailure(id,connectionId,externalTripId,"NO_ELIGIBLE_VEHICLE");
      return res.status(409).json({success:false,message:"No enabled vehicle currently matches this trip.",reason:"NO_ELIGIBLE_VEHICLE"});
    }
    const result=await maybeQueueClaim(id,connection,engineName,trip,
      {...engineSettings,enabled:true,autoAccept:settings.acceptEnabled!==false},{
      source:"DISCOVERY",
      receivedAt,
      settings,
      assignment
    });
    if(!result.queued){
      const reason=String(result.reason||"CLAIM_QUEUE_UNAVAILABLE");
      setMatchedTripFailure(id,connectionId,externalTripId,reason);
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

        acceptEnabled:body.acceptEnabled!==false,
        longMinMiles:Math.max(0,Number(body.longMinMiles)||100),
        mediumMinMiles:Math.max(0,Number(body.mediumMinMiles)||50),
        targetDailyMilesMin:Math.max(0,Number(body.targetDailyMilesMin)||0),
        targetDailyMilesMax:Math.max(0,Number(body.targetDailyMilesMax)||0),
        pickupLateToleranceMinutes:Math.max(0,Math.trunc(Number(body.pickupLateToleranceMinutes)||0)),
        dropoffLateToleranceMinutes:Math.max(0,Math.trunc(Number(body.dropoffLateToleranceMinutes)||0)),
        noShowReplacementEnabled:body.noShowReplacementEnabled===true,
        cancelReplacementEnabled:body.cancelReplacementEnabled===true,
        vehicleConfigs:Array.isArray(body.vehicleConfigs)?body.vehicleConfigs.map(vehicle=>({
          driverId:clean(vehicle.driverId),driverName:clean(vehicle.driverName),
          vehicleNumber:clean(vehicle.vehicleNumber),
          services:Array.isArray(vehicle.services)?vehicle.services.map(clean).filter(Boolean):["ALL"],
          vehicleCategory:clean(vehicle.vehicleCategory||"GENERIC").toUpperCase(),
          enabled:vehicle.enabled!==false,
          tripCategories:{long:vehicle.tripCategories?.long!==false,
            medium:vehicle.tripCategories?.medium!==false,
            short:vehicle.tripCategories?.short!==false},
          shiftStart:clean(vehicle.shiftStart)||"08:00",shiftEnd:clean(vehicle.shiftEnd)||"18:00",
          maxWorkHours:Math.max(0,Number.isFinite(Number(vehicle.maxWorkHours))?Number(vehicle.maxWorkHours):10),
          minDailyMiles:Math.max(0,Number(vehicle.minDailyMiles)||0),
          maxDailyMiles:Math.max(0,Number(vehicle.maxDailyMiles)||0),
          maxDeadheadMiles:Math.max(0,Number(vehicle.maxDeadheadMiles)||0),
          breakEnabled:vehicle.breakEnabled===true,
          breakDurationMinutes:Math.max(0,Math.trunc(Number(vehicle.breakDurationMinutes)||0)),
          breakWindowFrom:clean(vehicle.breakWindowFrom)||"12:00",
          breakWindowTo:clean(vehicle.breakWindowTo)||"15:00",
          pickupZoneCity:clean(vehicle.pickupZoneCity),
          pickupZoneState:clean(vehicle.pickupZoneState).toUpperCase(),
          pickupZoneZip:clean(vehicle.pickupZoneZip),
          pickupZoneAddress:clean(vehicle.pickupZoneAddress),
          dropoffZoneCity:clean(vehicle.dropoffZoneCity),
          dropoffZoneState:clean(vehicle.dropoffZoneState).toUpperCase(),
          dropoffZoneZip:clean(vehicle.dropoffZoneZip),
          dropoffZoneAddress:clean(vehicle.dropoffZoneAddress),
          zoneRadiusMiles:Math.max(0,Number(vehicle.zoneRadiusMiles)||0),
          zoneMatch:["ANY","PICKUP","DROPOFF","EITHER","BOTH"].includes(clean(vehicle.zoneMatch).toUpperCase())
            ? clean(vehicle.zoneMatch).toUpperCase()
            : "PICKUP"
        })):[],

        longEngine:
          normalizeEngine(
            body.longEngine
          ),

        mediumEngine:
          normalizeEngine(body.mediumEngine),

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

      // Clean legacy MarketplaceActivity telemetry at most once per tenant/day.
      // Accepted External Hub trip records are never touched here.
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
        mediumTrips,
        shortTrips
      } =
        await selectedByEngine(
          trips,
          settings
        );

      // Initialize the display rows before claim evaluation so the reason for
      // an Auto Accept block can be attached to the row and returned to UI.
      saveScanSummary(id,connection,trips,longTrips,shortTrips,0,mediumTrips);

      const [
        longResults,
        mediumResults,
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
            "MEDIUM",
            mediumTrips,
            settings.mediumEngine || {},
            {source:"DISCOVERY",receivedAt:new Date().toISOString(),settings}
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
          mediumMatched:
            mediumTrips.length,
          shortMatched:
            shortTrips.length,
          longResults,
          mediumResults,
          shortResults
        },
        message:
          `${connection.brokerName || "Broker"} scan complete. Long, medium, and short engines were evaluated for this connection only.`
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
