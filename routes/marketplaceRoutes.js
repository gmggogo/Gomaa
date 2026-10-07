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
- Marketplace Portal scan remains READ ONLY for Claim/Accept until a
  broker-specific claim adapter is implemented and authorized.
- Activity is stored in the existing Marketplace Activity collection for
  compatibility, but every new row is scoped by connectionId.
*/

const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();

const Settings =
  require("../models/MarketplaceSettings");

const Activity =
  require("../models/MarketplaceActivity");

const BrokerIntegration =
  require("../models/BrokerIntegration");

const longEngine =
  require("../services/mtm/mtmLongTripEngine");

const shortEngine =
  require("../services/mtm/mtmShortTripEngine");

const providerPortalBridgeRoutes =
  require("./providerPortalBridgeRoutes");

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


const geoCache=new Map();

function extractZip(value){
  const text=clean(value);
  if(!text) return "";

  const match=text.match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : "";
}

function normalizeMode(value){
  return clean(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function serviceMatches(actual,configured=[]){
  if(!configured.length) return true;

  const value=normalizeMode(actual);
  if(!value) return false;

  return configured.some(raw=>{
    const wanted=normalizeMode(raw);
    if(!wanted) return false;

    if(value===wanted) return true;
    if(value.startsWith(wanted+" ")) return true;
    if(wanted.startsWith(value+" ")) return true;

    if(
      wanted==="wheelchair" &&
      /\b(wheelchair|paralift)\b/.test(value)
    ){
      return true;
    }

    if(
      wanted==="ambulatory" &&
      value.startsWith("ambulatory")
    ){
      return true;
    }

    return false;
  });
}

function validCoord(lat,lng){
  const a=Number(lat);
  const b=Number(lng);
  return (
    Number.isFinite(a) &&
    Number.isFinite(b) &&
    a>=-90 && a<=90 &&
    b>=-180 && b<=180 &&
    !(a===0 && b===0)
  );
}

async function geocodeAddress(value){
  const address=clean(value);
  if(!address) return null;

  const key=address.toLowerCase();
  if(geoCache.has(key)) return geoCache.get(key);

  let result=null;

  try{
    const googleKey=clean(process.env.GOOGLE_KEY);

    if(googleKey && typeof fetch==="function"){
      const url=
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${encodeURIComponent(googleKey)}`;

      const response=await fetch(url);
      const data=await response.json().catch(()=>({}));
      const location=data?.results?.[0]?.geometry?.location;

      if(validCoord(location?.lat,location?.lng)){
        result={
          lat:Number(location.lat),
          lng:Number(location.lng),
          source:"GOOGLE"
        };
      }
    }

    if(!result){
      const zip=extractZip(address);

      if(zip && typeof fetch==="function"){
        const response=
          await fetch(
            `https://api.zippopotam.us/us/${encodeURIComponent(zip)}`
          );

        if(response.ok){
          const data=await response.json().catch(()=>({}));
          const place=data?.places?.[0];
          const lat=Number(place?.latitude);
          const lng=Number(place?.longitude);

          if(validCoord(lat,lng)){
            result={
              lat,
              lng,
              source:"ZIP_CENTROID"
            };
          }
        }
      }
    }
  }catch(_err){
    result=null;
  }

  geoCache.set(key,result);
  return result;
}

function haversineMiles(a,b){
  if(
    !a ||
    !b ||
    !validCoord(a.lat,a.lng) ||
    !validCoord(b.lat,b.lng)
  ){
    return null;
  }

  const R=3958.7613;
  const toRad=v=>v*Math.PI/180;
  const dLat=toRad(b.lat-a.lat);
  const dLng=toRad(b.lng-a.lng);
  const lat1=toRad(a.lat);
  const lat2=toRad(b.lat);

  const h=
    Math.sin(dLat/2)**2 +
    Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLng/2)**2;

  return 2*R*Math.asin(Math.min(1,Math.sqrt(h)));
}

function timeMinutes(value){
  const text=clean(value);
  if(!text) return null;

  const iso=text.match(/T(\d{2}):(\d{2})/);
  if(iso){
    return Number(iso[1])*60+Number(iso[2]);
  }

  const simple=text.match(/\b(\d{1,2}):(\d{2})\s*(AM|PM)?\b/i);
  if(!simple) return null;

  let hour=Number(simple[1]);
  const minute=Number(simple[2]);
  const ap=clean(simple[3]).toUpperCase();

  if(ap==="PM" && hour<12) hour+=12;
  if(ap==="AM" && hour===12) hour=0;

  return hour*60+minute;
}

function withinTime(value,from,to){
  const minute=timeMinutes(value);
  if(minute===null) return false;

  const start=timeMinutes(from || "00:00");
  const end=timeMinutes(to || "23:59");

  if(start===null || end===null) return true;
  if(start<=end) return minute>=start && minute<=end;
  return minute>=start || minute<=end;
}

function normalizeEngine(value={}){
  const legacyRadius=
    Math.max(
      0,
      Number(value.milesMax) || 0
    );

  return {
    enabled:value.enabled===true,
    autoAccept:value.autoAccept===true,

    zoneRadiusMiles:
      Math.max(
        0,
        Number(
          value.zoneRadiusMiles ??
          legacyRadius ??
          0
        ) || 0
      ),

    tripMilesMin:
      Math.max(
        0,
        Number(value.tripMilesMin) || 0
      ),

    tripMilesMax:
      Math.max(
        0,
        Number(value.tripMilesMax) || 0
      ),

    /* keep legacy values so old saved documents are not destroyed */
    milesMin:
      Math.max(0,Number(value.milesMin)||0),

    milesMax:
      Math.max(0,Number(value.milesMax)||0),

    dailyTripLimit:
      Math.max(0,Number(value.dailyTripLimit)||0),

    pickupTimeFrom:
      clean(value.pickupTimeFrom) || "00:00",

    pickupTimeTo:
      clean(value.pickupTimeTo) || "23:59",

    dropoffTimeFrom:
      clean(value.dropoffTimeFrom) || "00:00",

    dropoffTimeTo:
      clean(value.dropoffTimeTo) || "23:59",

    pickupZipCodes:
      zipList(value.pickupZipCodes),

    dropoffZipCodes:
      zipList(value.dropoffZipCodes),

    zoneMatch:
      ["ANY","PICKUP","DROPOFF","EITHER","BOTH"].includes(
        clean(value.zoneMatch).toUpperCase()
      )
        ? clean(value.zoneMatch).toUpperCase()
        : "ANY",

    modes:
      zipList(value.modes)
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

function tripIdentity(trip={}){
  const explicit=
    clean(
      trip.externalTripId ||
      trip.portalTripId ||
      trip.tripNumber ||
      trip.assignmentNumber ||
      trip.reservationId
    );

  if(explicit){
    return explicit;
  }

  return [
    clean(trip.tripDate || trip.appointmentDate || trip.date),
    clean(trip.pickupTime || trip.appointmentTime),
    clean(trip.pickup || trip.pickupAddress),
    clean(trip.dropoff || trip.dropoffAddress)
  ]
  .join("|")
  .toLowerCase();
}

function displayTripNumber(trip={}){
  return clean(
    trip.tripNumber ||
    trip.externalTripId ||
    trip.portalTripId ||
    trip.assignmentNumber ||
    trip.reservationId
  );
}

function tripDateValue(trip={}){
  return clean(
    trip.tripDate ||
    trip.serviceDate ||
    trip.appointmentDate ||
    trip.date
  );
}

function tripTimeValue(trip={}){
  return clean(
    trip.pickupTime ||
    trip.tripTime ||
    trip.appointmentTime
  );
}

function tripPickupAddress(trip={}){
  return clean(
    trip.pickup ||
    trip.pickupAddress
  );
}

function tripDropoffAddress(trip={}){
  return clean(
    trip.dropoff ||
    trip.dropoffAddress
  );
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
      displayTripNumber(
        trip
      ),

    tripDate:
      tripDateValue(
        trip
      ),

    tripTime:
      tripTimeValue(
        trip
      ),

    pickupTime:
      tripTimeValue(
        trip
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

    pickupZip:
      clean(
        trip.pickupZip ||
        trip.pickupPostalCode ||
        trip.originZip ||
        extractZip(
          trip.pickup ||
          trip.pickupAddress
        )
      ),

    dropoffZip:
      clean(
        trip.dropoffZip ||
        trip.dropoffPostalCode ||
        trip.destinationZip ||
        extractZip(
          trip.dropoff ||
          trip.dropoffAddress
        )
      ),

    pickupLat:
      Number.isFinite(Number(trip.pickupLat))
        ? Number(trip.pickupLat)
        : null,

    pickupLng:
      Number.isFinite(Number(trip.pickupLng))
        ? Number(trip.pickupLng)
        : null,

    dropoffLat:
      Number.isFinite(Number(trip.dropoffLat))
        ? Number(trip.dropoffLat)
        : null,

    dropoffLng:
      Number.isFinite(Number(trip.dropoffLng))
        ? Number(trip.dropoffLng)
        : null,

    mode:
      clean(
        trip.mode ||
        trip.serviceType ||
        trip.levelOfService
      )
  };
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

      tripKey:
        tripIdentity(
          trip
        ),

      tripNumber:
        displayTripNumber(
          trip
        ),

      tripDate:
        tripDateValue(
          trip
        ),

      tripTime:
        tripTimeValue(
          trip
        ),

      appointmentTime:
        clean(
          trip.appointmentTime
        ),

      pickupAddress:
        tripPickupAddress(
          trip
        ),

      dropoffAddress:
        tripDropoffAddress(
          trip
        ),

      pickupZip:
        clean(
          trip.pickupZip ||
          trip.pickupPostalCode ||
          trip.originZip
        ),

      dropoffZip:
        clean(
          trip.dropoffZip ||
          trip.dropoffPostalCode ||
          trip.destinationZip
        ),

      mode:
        clean(
          trip.mode ||
          trip.serviceType ||
          trip.levelOfService
        ),

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

async function pointForTripSide(trip,side){
  const isPickup=side==="PICKUP";
  const lat=isPickup ? trip.pickupLat : trip.dropoffLat;
  const lng=isPickup ? trip.pickupLng : trip.dropoffLng;

  if(validCoord(lat,lng)){
    return {
      lat:Number(lat),
      lng:Number(lng),
      source:"TRIP"
    };
  }

  const address=
    isPickup
      ? trip.pickup
      : trip.dropoff;

  return geocodeAddress(address);
}

async function minDistanceToZipCenters(point,zips=[]){
  if(!point || !zips.length) return null;

  const centers=
    await Promise.all(
      zips.map(
        zip=>geocodeAddress(zip)
      )
    );

  const distances=
    centers
      .filter(Boolean)
      .map(center=>haversineMiles(point,center))
      .filter(Number.isFinite);

  if(!distances.length) return null;
  return Math.min(...distances);
}

async function evaluateEngineTrip(
  trip,
  engineName,
  engineSettings={}
){
  if(engineSettings.enabled!==true){
    return {
      matched:false,
      reason:"ENGINE_DISABLED"
    };
  }

  const tripMiles=
    Number(
      trip.tripMiles ??
      trip.miles ??
      0
    );

  const minTripMiles=
    Math.max(
      0,
      Number(engineSettings.tripMilesMin)||0
    );

  const maxTripMiles=
    Math.max(
      0,
      Number(engineSettings.tripMilesMax)||0
    );

  if(
    Number.isFinite(tripMiles) &&
    tripMiles<minTripMiles
  ){
    return {
      matched:false,
      reason:"TRIP_MILES_BELOW_MIN"
    };
  }

  if(
    maxTripMiles>0 &&
    Number.isFinite(tripMiles) &&
    tripMiles>maxTripMiles
  ){
    return {
      matched:false,
      reason:"TRIP_MILES_ABOVE_MAX"
    };
  }

  if(
    !withinTime(
      trip.pickupTime,
      engineSettings.pickupTimeFrom,
      engineSettings.pickupTimeTo
    )
  ){
    return {
      matched:false,
      reason:"PICKUP_TIME_OUTSIDE_FILTER"
    };
  }

  if(
    clean(trip.dropoffTime) &&
    !withinTime(
      trip.dropoffTime,
      engineSettings.dropoffTimeFrom,
      engineSettings.dropoffTimeTo
    )
  ){
    return {
      matched:false,
      reason:"DROPOFF_TIME_OUTSIDE_FILTER"
    };
  }

  if(
    !serviceMatches(
      trip.mode,
      engineSettings.modes || []
    )
  ){
    return {
      matched:false,
      reason:"SERVICE_NOT_ALLOWED"
    };
  }

  const zoneMatch=
    clean(
      engineSettings.zoneMatch ||
      "ANY"
    ).toUpperCase();

  const radius=
    Math.max(
      0,
      Number(engineSettings.zoneRadiusMiles)||0
    );

  const pickupCenters=
    zipList(
      engineSettings.pickupZipCodes
    );

  const dropoffCenters=
    zipList(
      engineSettings.dropoffZipCodes
    );

  /*
    If no zone centers/radius are configured, the zone filter is disabled.
    If a zone IS configured and geocoding fails, fail closed — never accept
    a trip outside verified settings just because coordinates are missing.
  */
  const zoneConfigured=
    radius>0 &&
    (
      pickupCenters.length>0 ||
      dropoffCenters.length>0
    );

  let pickupDistance=null;
  let dropoffDistance=null;
  let pickupInside=false;
  let dropoffInside=false;

  if(zoneConfigured){
    if(pickupCenters.length){
      const pickupPoint=
        await pointForTripSide(
          trip,
          "PICKUP"
        );

      pickupDistance=
        await minDistanceToZipCenters(
          pickupPoint,
          pickupCenters
        );

      pickupInside=
        Number.isFinite(pickupDistance) &&
        pickupDistance<=radius;
    }

    if(dropoffCenters.length){
      const dropoffPoint=
        await pointForTripSide(
          trip,
          "DROPOFF"
        );

      dropoffDistance=
        await minDistanceToZipCenters(
          dropoffPoint,
          dropoffCenters
        );

      dropoffInside=
        Number.isFinite(dropoffDistance) &&
        dropoffDistance<=radius;
    }

    let zonePassed=false;

    switch(zoneMatch){
      case "PICKUP":
        zonePassed=
          pickupCenters.length>0 &&
          pickupInside;
        break;

      case "DROPOFF":
        zonePassed=
          dropoffCenters.length>0 &&
          dropoffInside;
        break;

      case "EITHER":
        zonePassed=
          (
            pickupCenters.length>0 &&
            pickupInside
          ) ||
          (
            dropoffCenters.length>0 &&
            dropoffInside
          );
        break;

      case "BOTH":
        zonePassed=
          (
            !pickupCenters.length ||
            pickupInside
          ) &&
          (
            !dropoffCenters.length ||
            dropoffInside
          ) &&
          (
            pickupCenters.length>0 ||
            dropoffCenters.length>0
          );
        break;

      case "ANY":
      default:
        zonePassed=
          (
            pickupCenters.length>0 &&
            pickupInside
          ) ||
          (
            dropoffCenters.length>0 &&
            dropoffInside
          );
        break;
    }

    if(!zonePassed){
      return {
        matched:false,
        reason:
          (
            pickupCenters.length && pickupDistance===null
          ) ||
          (
            dropoffCenters.length && dropoffDistance===null
          )
            ? "ZONE_DISTANCE_UNAVAILABLE"
            : "OUTSIDE_ZONE_RADIUS",
        zone:{
          radiusMiles:radius,
          pickupDistanceMiles:
            Number.isFinite(pickupDistance)
              ? Number(pickupDistance.toFixed(2))
              : null,
          dropoffDistanceMiles:
            Number.isFinite(dropoffDistance)
              ? Number(dropoffDistance.toFixed(2))
              : null
        }
      };
    }
  }

  return {
    matched:true,
    reason:"MATCHED",
    engine:engineName,
    zone:{
      radiusMiles:radius,
      pickupDistanceMiles:
        Number.isFinite(pickupDistance)
          ? Number(pickupDistance.toFixed(2))
          : null,
      dropoffDistanceMiles:
        Number.isFinite(dropoffDistance)
          ? Number(dropoffDistance.toFixed(2))
          : null
    }
  };
}

async function selectedByEngine(
  trips,
  settings
){
  const longTrips=[];
  const shortTrips=[];
  const decisions=[];
  const claimedKeys=new Set();

  for(const trip of trips){
    const key=tripIdentity(trip);

    if(!key || claimedKeys.has(key)){
      continue;
    }

    const longDecision=
      await evaluateEngineTrip(
        trip,
        "LONG",
        settings?.longEngine || {}
      );

    if(longDecision.matched){
      claimedKeys.add(key);
      trip.__marketplaceDecision=longDecision;
      longTrips.push(trip);
      decisions.push({
        trip,
        engine:"LONG",
        ...longDecision
      });
      continue;
    }

    const shortDecision=
      await evaluateEngineTrip(
        trip,
        "SHORT",
        settings?.shortEngine || {}
      );

    if(shortDecision.matched){
      claimedKeys.add(key);
      trip.__marketplaceDecision=shortDecision;
      shortTrips.push(trip);
      decisions.push({
        trip,
        engine:"SHORT",
        ...shortDecision
      });
      continue;
    }

    decisions.push({
      trip,
      engine:"SYSTEM",
      matched:false,
      reason:
        longDecision.reason!=="ENGINE_DISABLED"
          ? longDecision.reason
          : shortDecision.reason,
      longReason:longDecision.reason,
      shortReason:shortDecision.reason
    });
  }

  return {
    longTrips,
    shortTrips,
    decisions
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
  const scanSeen = new Set();

  for(const trip of trips){

    const key =
      tripIdentity(
        trip
      );

    if(
      !key ||
      scanSeen.has(key)
    ){
      continue;
    }

    scanSeen.add(key);

    /*
      Permanent safety guard for when Claim/Accept is enabled later:
      a trip already recorded as CLAIMED for this broker connection
      can never be claimed a second time.
    */
    const alreadyClaimed =
      await Activity.exists({
        tenantId:id,
        action:"CLAIMED",
        externalTripId:
          clean(
            trip.externalTripId ||
            trip.portalTripId ||
            trip.tripNumber
          ),
        "meta.connectionId":
          String(
            connection._id
          )
      });

    if(alreadyClaimed){

      await logActivity(
        id,
        connection,
        "SKIPPED",
        {
          engine:engineName,
          trip,
          reason:"ALREADY_CLAIMED",
          message:
            `${engineName} ignored already-claimed trip ${displayTripNumber(trip)}`
        }
      );

      results.push({
        engine:engineName,
        externalTripId:
          displayTripNumber(
            trip
          ),
        matched:false,
        claimed:false,
        reason:"ALREADY_CLAIMED"
      });

      continue;
    }

    const reason =
      engineSettings?.autoAccept === true
        ? "PORTAL_ACTION_NOT_VERIFIED"
        : "AUTO_ACCEPT_OFF";

    const message =
      engineSettings?.autoAccept === true
        ? `${engineName} matched trip ${displayTripNumber(trip)}; Accept/Claim action must be validated before execution is enabled`
        : `${engineName} matched trip ${displayTripNumber(trip)}; Auto Accept is OFF`;

    /*
      Event-driven evaluation may already have written the MATCHED row.
      Manual re-evaluation still writes it here.
    */
    if(options.skipMatchedLog!==true){
      await logActivity(
        id,
        connection,
        "MATCHED",
        {
          engine:engineName,
          trip,
          reason,
          message,
          meta:{
            eventFingerprint:
              clean(options.eventFingerprint)
          }
        }
      );
    }

    results.push({
      engine:engineName,
      externalTripId:
        displayTripNumber(
          trip
        ),
      matched:true,
      claimed:false,
      reason
    });
  }

  return results;
}

const autoEventLocks=new Map();

function eventFingerprint(trip={}){
  const raw=JSON.stringify({
    id:tripIdentity(trip),
    date:tripDateValue(trip),
    time:tripTimeValue(trip),
    pickup:tripPickupAddress(trip),
    dropoff:tripDropoffAddress(trip),
    miles:Number(trip.tripMiles ?? trip.miles ?? 0),
    mode:clean(trip.mode)
  });

  let hash=0;
  for(let i=0;i<raw.length;i++){
    hash=((hash<<5)-hash)+raw.charCodeAt(i);
    hash|=0;
  }

  return String(Math.abs(hash));
}

async function autoEvaluateDiscovery(event={}){
  const id=clean(event.tenantId);
  const connectionId=clean(event.connectionId);

  if(!id || !connectionId){
    return;
  }

  const lockKey=`${id}:${connectionId}`;

  const previous=
    autoEventLocks.get(lockKey) ||
    Promise.resolve();

  const run=previous
    .catch(()=>{})
    .then(async()=>{
      const [
        connection,
        settings
      ]=
        await Promise.all([
          marketplaceConnection(
            id,
            connectionId
          ),
          getSettings(id)
        ]);

      if(settings.enabled===false){
        return;
      }

      const trips=
        (Array.isArray(event.trips)?event.trips:[])
          .map(tripForEngine)
          .filter(
            trip=>
              Boolean(
                trip.externalTripId ||
                trip.tripNumber
              )
          );

      for(const trip of trips){
        const fingerprint=
          eventFingerprint(
            trip
          );

        const externalTripId=
          clean(
            trip.externalTripId ||
            trip.tripNumber
          );

        const seenBefore=
          await Activity.exists({
            tenantId:id,
            externalTripId,
            "meta.connectionId":
              String(connection._id),
            "meta.eventFingerprint":
              fingerprint
          });

        if(seenBefore){
          continue;
        }

        const {
          longTrips,
          shortTrips,
          decisions
        }=
          await selectedByEngine(
            [trip],
            settings
          );

        const decision=
          decisions[0] || {
            matched:false,
            reason:"NO_DECISION"
          };

        await logActivity(
          id,
          connection,
          decision.matched
            ? "MATCHED"
            : "SEEN",
          {
            engine:
              decision.matched
                ? decision.engine
                : "SYSTEM",

            trip,

            reason:
              decision.reason,

            message:
              decision.matched
                ? `${decision.engine} auto-matched trip ${displayTripNumber(trip)}`
                : `Trip ${displayTripNumber(trip)} seen but rejected by settings: ${decision.reason}`,

            meta:{
              eventDriven:true,
              eventFingerprint:fingerprint,
              discoveryType:
                clean(event.discoveryType),
              zone:
                decision.zone || null,
              longReason:
                decision.longReason || "",
              shortReason:
                decision.shortReason || ""
            }
          }
        );

        if(longTrips.length){
          await logEngineMatches(
            id,
            connection,
            "LONG",
            longTrips,
            settings.longEngine || {},
            {
              skipMatchedLog:true,
              eventFingerprint
            }
          );
        }else if(shortTrips.length){
          await logEngineMatches(
            id,
            connection,
            "SHORT",
            shortTrips,
            settings.shortEngine || {},
            {
              skipMatchedLog:true,
              eventFingerprint
            }
          );
        }
      }

      await Settings.updateOne(
        {tenantId:id},
        {$set:{
          lastScanAt:new Date(),
          lastSuccessfulScanAt:new Date(),
          lastError:""
        }}
      );
    })
    .catch(async err=>{
      console.error(
        "[Marketplace auto-evaluate]",
        err?.message || err
      );

      await Settings.updateOne(
        {tenantId:id},
        {$set:{
          lastError:
            err?.message ||
            String(err)
        }}
      ).catch(()=>{});
    });

  autoEventLocks.set(lockKey,run);

  await run;

  if(autoEventLocks.get(lockKey)===run){
    autoEventLocks.delete(lockKey);
  }
}

if(
  typeof providerPortalBridgeRoutes.registerDiscoveryListener===
  "function"
){
  providerPortalBridgeRoutes.registerDiscoveryListener(
    autoEvaluateDiscovery
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
          Math.min(
            31,
            Math.max(
              1,
              Number(
                body.dateWindowDays
              ) || 7
            )
          ),

        totalDailyTripLimit:
          Math.max(
            0,
            Number(
              body.totalDailyTripLimit
            ) || 0
          ),

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

      return res.json({
        success:true,
        settings
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
        tenantId:id
      };

      if(connectionId){

        filter["meta.connectionId"] =
          connectionId;
      }

      const rows =
        await Activity.find(
          filter
        )
        .sort({
          occurredAt:-1
        })
        .limit(limit)
        .lean();

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

      for(
        const trip
        of trips
      ){

        await logActivity(
          id,
          connection,
          "SEEN",
          {
            engine:"SYSTEM",
            trip,
            message:
              `Marketplace trip seen: ${clean(trip.externalTripId || trip.tripNumber)}`
          }
        );
      }

      const {
        longTrips,
        shortTrips,
        decisions
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
          shortResults,
          decisions:
            decisions.map(row=>({
              tripNumber:
                displayTripNumber(
                  row.trip
                ),
              engine:
                row.engine,
              matched:
                row.matched===true,
              reason:
                row.reason,
              zone:
                row.zone || null
            }))
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
