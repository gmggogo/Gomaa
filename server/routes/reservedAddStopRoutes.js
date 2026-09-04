"use strict";

/* =====================================================
   FILE: routes/reservedAddStopRoutes.js
   ADMIN RESERVED ADD STOP / ROUTE CHANGE REQUEST
   Mounted on /api/reserved
===================================================== */

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");
const Service = require("../models/Service");
const LiveDriver = require("../models/LiveDriver");
const routeMapEngine = require("../utils/routeMapEngine");

const router = express.Router();
const MAX_STOPS = 5;
const LIVE_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
   TENANT AUTH
========================= */

function readBearerToken(req){
  const header =
    String(req.headers?.authorization || "").trim();

  if(!header.toLowerCase().startsWith("bearer ")){
    return "";
  }

  return header.slice(7).trim();
}

function requireTenantApi(req,res,next){

  const token = readBearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const verified =
      jwt.verify(token,JWT_SECRET);

    req.authUser = {
      id:verified.id || null,
      role:verified.role || "",
      tenantId:verified.tenantId || null
    };

    if(req.authUser.role === "PLATFORM_ADMIN"){
      return next();
    }

    if(!req.authUser.tenantId){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

function tenantFilter(req,extra={}){

  if(req.authUser?.role === "PLATFORM_ADMIN"){

    const requestedTenantId =
      String(
        req.query?.tenantId ||
        req.body?.tenantId ||
        ""
      ).trim();

    return requestedTenantId
      ? {...extra,tenantId:requestedTenantId}
      : {...extra};
  }

  return {
    ...extra,
    tenantId:req.authUser.tenantId
  };
}

function getTripModel(){
  const Trip = mongoose.models.Trip || global.Trip;
  if(!Trip){
    throw new Error("Trip model not loaded. Mount reservedAddStopRoutes after Trip model");
  }
  return Trip;
}

function clean(v){ return String(v ?? "").trim(); }
function upper(v){ return clean(v).toUpperCase(); }
function lower(v){ return clean(v).toLowerCase(); }
function n(v){ const x = Number(v); return Number.isFinite(x) ? x : 0; }
function bool(v){ return v === true || ["true","1","yes"].includes(clean(v).toLowerCase()); }
function safeArray(v){ return Array.isArray(v) ? v : []; }
function getStopAddress(stop){
  if(typeof stop === "string") return clean(stop);
  if(!stop || typeof stop !== "object") return "";
  return clean(stop.address || stop.stopAddress || stop.fullAddress || stop.formattedAddress || stop.formatted_address || stop.description || stop.location || stop.label || "");
}
function normalizeStops(value){ return safeArray(value).map(getStopAddress).filter(Boolean); }
function sameAddress(a,b){ return lower(a) === lower(b); }
function sameAddressArray(a,b){
  const first = normalizeStops(a), second = normalizeStops(b);
  return first.length === second.length && first.every((value,index)=>sameAddress(value,second[index]));
}
function sameAddressCollection(a,b){
  return sameAddressArray(normalizeStops(a).map(lower).sort(),normalizeStops(b).map(lower).sort());
}

function normalizeCode(v){
  const c = upper(v).replace(/[_-]/g," ").replace(/\s+/g," ").trim();
  if(c === "STANDARD" || c === "ST") return "ST";
  if(["WHEELCHAIR","WHEEL CHAIR","WC","WH"].includes(c)) return "WH";
  if(c === "SHARED" || c === "SH") return "SH";
  if(["LIMO","LIMOUSINE","LM"].includes(c)) return "LM";
  if(c === "TAXI" || c === "TX") return "TX";
  if(c === "XL") return "XL";
  return c;
}

function isValidCode(code){
  return ["ST","WH","XL","LM","TX","SH"].includes(normalizeCode(code));
}

function tripServiceCode(trip){
  const candidates = [
    trip?.serviceKey, trip?.serviceCode, trip?.serviceType,
    trip?.serviceName, trip?.serviceTitle, trip?.vehicleType,
    trip?.serviceSuffix, trip?.tripNumberSuffix
  ];
  for(const value of candidates){
    const code = normalizeCode(value);
    if(isValidCode(code)) return code;
  }
  const parts = upper(trip?.tripNumber).split("-");
  for(let i = parts.length - 1; i >= 0; i--){
    const code = normalizeCode(parts[i]);
    if(isValidCode(code)) return code;
  }
  return "";
}

function serviceCode(service){
  return normalizeCode(
    service?.serviceKey || service?.serviceCode || service?.serviceType ||
    service?.title || service?.name || ""
  );
}

async function resolveReservedPolicy(trip,req){
  const code = tripServiceCode(trip);
  if(!code) throw new Error("Reserved trip service is missing");

  let service = null;
  const savedId = clean(trip.serviceId || trip.reservedServiceId);
  if(savedId && mongoose.Types.ObjectId.isValid(savedId)){
    service = await Service.findOne(tenantFilter(req,{_id:savedId})).lean();
  }
  if(!service){
    const all = await Service.find(tenantFilter(req,{reservedEnabled:true})).lean();
    service = all.find(item => serviceCode(item) === code) || null;
  }
  if(!service) throw new Error("Reserved service was not found");

  return {
    source:"RESERVED_SERVICE_MANAGEMENT",
    serviceId:String(service._id || ""),
    serviceCode:code,
    normalEnabled:bool(service.reservedAddStopEnabled),
    customEnabled:bool(service.reservedAddStopCustomTimeEnabled),
    cutoffMinutes:Math.max(0,n(service.reservedAddStopCutoffMinutes))
  };
}

function minutesToTrip(trip){
  const date = clean(trip.tripDate);
  const time = clean(trip.tripTime);
  if(!date || !time) return null;
  const startsAt = new Date(`${date}T${time}:00-07:00`);
  return Number.isNaN(startsAt.getTime()) ? null : (startsAt.getTime() - Date.now()) / 60000;
}

function enforcePolicy(trip,policy){
  if(policy.normalEnabled) return;
  if(!policy.customEnabled){
    const err = new Error("Reserved Add Stop is disabled for this service");
    err.statusCode = 403;
    throw err;
  }
  const mins = minutesToTrip(trip);
  if(mins !== null && mins <= policy.cutoffMinutes){
    const err = new Error(
      policy.cutoffMinutes > 0
        ? `Add Stop closed ${policy.cutoffMinutes} minutes before the trip`
        : "The Add Stop time window has ended"
    );
    err.statusCode = 403;
    throw err;
  }
}

function tripClosed(trip){
  const s = clean(trip?.status).toLowerCase().replace(/[\s_-]/g,"");
  return s.includes("complete") || s.includes("cancel") || s.includes("noshow") || s.includes("notcompleted");
}

function activeRequest(trip){
  const req = trip?.addStopRequest || {};
  const status = upper(req.status);
  return req.active === true && ![
    "CANCELLED","CANCELLED_BY_DISPATCH","COMPLETED","STOP_REACHED","REJECTED"
  ].includes(status);
}

function strings(arr){
  return Array.isArray(arr) ? arr.map(clean).filter(Boolean) : [];
}

function detailed(arr){
  return Array.isArray(arr) ? arr.map((item,index)=>({
    address:clean(item?.address || item?.stop || item?.location),
    insertAfterIndex:n(item?.insertAfterIndex),
    rowIndex:n(item?.rowIndex ?? index)
  })).filter(item=>item.address) : [];
}

function edits(arr){
  return safeArray(arr).map(item=>getStopAddress(item?.newAddress || item)).filter(Boolean);
}

function tripIsInProgress(trip){
  const status = lower(trip?.status).replace(/[\s_-]+/g,"");
  return ["ontrip","started","inprogress","pickedup","pickupcompleted","passengerpickedup","enroute","active"].includes(status);
}

function extractLatLngFromObject(obj){
  if(!obj || typeof obj !== "object") return null;
  const lat = obj.lat ?? obj.latitude ?? obj.driverLat ?? obj.currentLat ?? obj.locationLat;
  const lng = obj.lng ?? obj.lon ?? obj.long ?? obj.longitude ?? obj.driverLng ?? obj.currentLng ?? obj.locationLng;
  if(Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) return {lat:Number(lat),lng:Number(lng)};
  for(const item of [obj.currentLocation,obj.driverLocation,obj.liveLocation,obj.location,obj.coords,obj.position,obj.assignment,obj.driver,obj.data]){
    const found = extractLatLngFromObject(item);
    if(found) return found;
  }
  return null;
}

function getFreshRouteMapLocation(trip){
  const id = clean(trip?._id);
  if(!id || !routeMapEngine || typeof routeMapEngine.getLastLocation !== "function") return null;
  const point = routeMapEngine.getLastLocation(id);
  if(!point || !Number.isFinite(Number(point.t)) || Date.now() - Number(point.t) > LIVE_LOCATION_MAX_AGE_MS) return null;
  return extractLatLngFromObject(point);
}

async function getLiveDriverState(trip){
  const tripId = clean(trip?._id);
  const driverId = clean(trip?.driverId || trip?.assignedDriverId || trip?.driver?._id || trip?.driver);
  const tenantId = trip?.tenantId || null;
  const conditions = [];
  if(tripId) conditions.push({tripId});
  if(driverId) conditions.push({driverId});
  if(tenantId && conditions.length){
    try{
      const saved = await LiveDriver.findOne({tenantId,lastSeen:{$gte:new Date(Date.now()-LIVE_LOCATION_MAX_AGE_MS)},$or:conditions}).sort({lastSeen:-1}).lean();
      if(saved && (!saved.tripId || String(saved.tripId) === tripId)) return saved;
    }catch(err){ console.error("RESERVED LIVE DRIVER LOOKUP ERROR:",err); }
  }
  if(!global.liveDrivers || typeof global.liveDrivers.values !== "function") return null;
  return Array.from(global.liveDrivers.values()).find(item=>{
    const sameTenant = !tenantId || !item?.tenantId || String(item.tenantId) === String(tenantId);
    return sameTenant && (clean(item?.tripId) === tripId || (driverId && clean(item?.driverId) === driverId));
  }) || null;
}

async function getLiveDriverLocation(trip){
  return getFreshRouteMapLocation(trip) || extractLatLngFromObject(await getLiveDriverState(trip)) || extractLatLngFromObject(trip);
}

function extractCurrentStopIndex(obj){
  const value = obj?.currentStopIndex ?? obj?.routeStopIndex ?? obj?.activeStopIndex ?? obj?.stopExecution?.currentStopIndex;
  return Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
}

async function getRouteProgress(trip){
  const liveState = await getLiveDriverState(trip);
  const currentStopIndex = extractCurrentStopIndex(liveState) ?? extractCurrentStopIndex(trip) ?? 0;
  const totalStops = normalizeStops(trip?.stops).length;
  return {currentStopIndex,completedStopCount:Math.max(0,Math.min(totalStops,currentStopIndex-1))};
}

function isLatLngPoint(point){ return point && typeof point === "object" && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lng)); }
function sanitizeRoutePoint(point){
  if(typeof point === "string") return clean(point) || null;
  return isLatLngPoint(point) ? {lat:Number(point.lat),lng:Number(point.lng)} : null;
}
function pointToGoogleValue(point){ return typeof point === "string" ? point : isLatLngPoint(point) ? `${Number(point.lat)},${Number(point.lng)}` : ""; }

async function calculateGoogleRoute(routePoints){
  const key = process.env.GOOGLE_SERVER_KEY;
  if(!key) throw new Error("Google Maps key is missing");
  const points = safeArray(routePoints).map(sanitizeRoutePoint).filter(Boolean).slice(0,25);
  if(points.length < 2) throw new Error("At least two route points are required");
  const params = new URLSearchParams();
  params.set("origin",pointToGoogleValue(points[0]));
  params.set("destination",pointToGoogleValue(points[points.length-1]));
  params.set("mode","driving"); params.set("units","imperial"); params.set("key",key);
  if(points.length > 2) params.set("waypoints",points.slice(1,-1).map(pointToGoogleValue).join("|"));
  const response = await fetch("https://maps.googleapis.com/maps/api/directions/json?"+params.toString());
  const data = await response.json().catch(()=>({}));
  if(!response.ok || data.status !== "OK" || !data.routes?.[0]) throw new Error(data.error_message || `Google route failed: ${data.status || response.status}`);
  const route = data.routes[0], legs = safeArray(route.legs);
  const distanceMeters = legs.reduce((sum,leg)=>sum+n(leg?.distance?.value),0);
  const durationSeconds = legs.reduce((sum,leg)=>sum+n(leg?.duration?.value),0);
  return {miles:Number((distanceMeters*0.000621371).toFixed(2)),distanceMeters,durationSeconds,estimatedMinutes:Math.ceil(durationSeconds/60),routePoints:points,googleRoute:{summary:route.summary||"",waypointOrder:safeArray(route.waypoint_order),overviewPolyline:route?.overview_polyline?.points||"",legs:legs.map((leg,index)=>({legIndex:index,startAddress:leg?.start_address||"",endAddress:leg?.end_address||"",distanceText:leg?.distance?.text||"",distanceMeters:n(leg?.distance?.value),durationText:leg?.duration?.text||"",durationSeconds:n(leg?.duration?.value)}))}};
}

async function buildServerRouteChange(trip,finalStops,dropoffAfter){
  const pickup = clean(trip.pickup || trip.pickupAddress), dropoffBefore = clean(trip.dropoff || trip.dropoffAddress);
  const actualStops = normalizeStops(trip.stops), inProgress = tripIsInProgress(trip), progress = await getRouteProgress(trip);
  let mode="BEFORE_START", driverLocationAtConfirm=null, originalRoutePoints=[], newRoutePoints=[];
  if(inProgress){
    mode="IN_PROGRESS"; driverLocationAtConfirm=await getLiveDriverLocation(trip);
    if(!driverLocationAtConfirm) throw new Error("Driver current location is unavailable");
    const completedStops=actualStops.slice(0,progress.completedStopCount);
    if(!sameAddressArray(finalStops.slice(0,progress.completedStopCount),completedStops)) throw new Error("Completed stops cannot be edited, deleted, or reordered");
    originalRoutePoints=[pickup,...completedStops,driverLocationAtConfirm,...actualStops.slice(progress.completedStopCount),dropoffBefore].filter(Boolean);
    newRoutePoints=[pickup,...completedStops,driverLocationAtConfirm,...finalStops.slice(progress.completedStopCount),dropoffAfter].filter(Boolean);
  }else{
    originalRoutePoints=[pickup,...actualStops,dropoffBefore].filter(Boolean);
    newRoutePoints=[pickup,...finalStops,dropoffAfter].filter(Boolean);
  }
  const originalRouteData=await calculateGoogleRoute(originalRoutePoints), newRouteData=await calculateGoogleRoute(newRoutePoints);
  return {mode,currentStopIndex:progress.currentStopIndex,completedStopCount:progress.completedStopCount,driverLocationAtConfirm,originalRoutePoints,newRoutePoints,originalRouteData,newRouteData,originalRemainingMiles:originalRouteData.miles,newRemainingMiles:newRouteData.miles,extraMiles:Number((newRouteData.miles-originalRouteData.miles).toFixed(2))};
}

router.get("/add-stop/ping",requireTenantApi,(req,res)=>{
  res.json({success:true,message:"reservedAddStopRoutes connected"});
});

router.post("/add-stop/:id/confirm",requireTenantApi,async (req,res)=>{
  try{
    const id = clean(req.params.id);
    if(!mongoose.Types.ObjectId.isValid(id)){
      return res.status(400).json({success:false,message:"Invalid trip ID"});
    }
    const Trip = getTripModel();
    const trip = await Trip.findOne(tenantFilter(req,{_id:id}));
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    if(tripClosed(trip)) return res.status(400).json({success:false,message:"This trip is closed"});
    if(trip.isShared === true || upper(trip.tripType) === "SHARED" || tripServiceCode(trip) === "SH"){
      return res.status(400).json({success:false,message:"Add Stop is not available for shared trips"});
    }

    const policy = await resolveReservedPolicy(trip,req);

    const currentActiveRequest =
      activeRequest(trip)
        ? trip.addStopRequest
        : null;

    if(
      currentActiveRequest &&
      clean(currentActiveRequest.source).toLowerCase() !== "reserved-add-stop"
    ){
      return res.status(409).json({success:false,message:"This trip already has an active route change request"});
    }

    enforcePolicy(trip,policy);

    const body = req.body || {};
    const pickup = clean(trip.pickup || trip.pickupAddress);
    const dropoffBefore = clean(trip.dropoff || trip.dropoffAddress);
    const dropoffAfter = clean(body.dropoffAfter || body.finalDropoff || dropoffBefore);
    const existingStopsBefore = normalizeStops(trip.stops);
    const editedExistingStops = edits(body.editedExistingStops);
    const addedStops = strings(body.addedStops);
    const addedStopsDetailed = detailed(body.addedStopsDetailed);
    const finalStops = strings(body.finalStops);

    /*
      Multi-editor behavior:
      Admin / Dispatcher / Customer-facing route changes may update
      the same trip at different times.

      Do not reject this Reserved route change only because the page
      was opened before another authorized dropoff/stops edit was saved.
      The current trip in MongoDB is the live baseline.

      Pickup remains protected in this flow.
    */
    if(clean(body.pickup) && !sameAddress(body.pickup,pickup)){
      return res.status(409).json({
        success:false,
        message:"Pickup address cannot be changed"
      });
    }

    const routeChangedSincePageLoad =
      Boolean(
        clean(body.dropoffBefore) &&
        !sameAddress(
          body.dropoffBefore,
          dropoffBefore
        )
      ) ||
      (
        Array.isArray(body.existingStopsBefore) &&
        body.existingStopsBefore.length > 0 &&
        !sameAddressArray(
          body.existingStopsBefore,
          existingStopsBefore
        )
      );
    if(finalStops.length > MAX_STOPS){
      return res.status(400).json({success:false,message:`A trip can have up to ${MAX_STOPS} stops`});
    }

    /*
      A stale editor page may contain a different number of old stops.
      Do not reject the request for that reason alone.

      Final route structure is still validated below, and
      buildServerRouteChange() still prevents completed stops from being
      edited, deleted, or reordered while the trip is in progress.
    */
    const editorBaseline = currentActiveRequest
      ? normalizeStops(currentActiveRequest.finalStops)
      : existingStopsBefore;
    if(finalStops.length !== editedExistingStops.length + addedStops.length || !sameAddressCollection(finalStops,[...editedExistingStops,...addedStops])){
      return res.status(400).json({success:false,message:"Final stops do not match the submitted changes"});
    }

    const routeStopsChanged =
      JSON.stringify(
        existingStopsBefore.map(value=>value.toLowerCase())
      ) !==
      JSON.stringify(
        finalStops.map(value=>value.toLowerCase())
      );

    if(!pickup || !dropoffBefore){
      return res.status(400).json({success:false,message:"Pickup or dropoff address missing"});
    }
    if(!routeStopsChanged && dropoffAfter === dropoffBefore){

      if(currentActiveRequest){
        trip.addStopRequest.active = false;
        trip.addStopRequest.status = "CANCELLED_BY_DISPATCH";
        trip.addStopRequest.cancelledAt = new Date();
        trip.addStopRequest.updatedAt = new Date();
        trip.routeChangePending = false;
        trip.routeChangeStatus = "CANCELLED";
        trip.markModified("addStopRequest");
        await trip.save();

        return res.json({
          success:true,
          cancelled:true,
          message:"Reserved route change request cancelled",
          tripId:trip._id,
          tripNumber:trip.tripNumber,
          addStopRequest:trip.addStopRequest
        });
      }

      return res.status(400).json({success:false,message:"No route change detected"});
    }

    const serverRoute = await buildServerRouteChange(trip,finalStops,dropoffAfter);

    trip.addStopRequest = {
      active:true,
      status:body.status || "PENDING_REVIEW",
      requestType:body.requestType || "ROUTE_CHANGE",
      source:"reserved-add-stop",
      tripSource:"RESERVED",
      addStopPolicy:policy,
      calculatePriceOnReview:true,
      adminName:clean(body.adminName),
      tripNumber:clean(body.tripNumber || trip.tripNumber),
      clientName:clean(body.clientName || trip.clientName),
      tripStatusAtConfirm:clean(body.tripStatusAtConfirm || trip.status),
      routeChangedSincePageLoad,
      confirmedAt:body.confirmedAt || new Date(),
      mode:serverRoute.mode,
      maxStops:MAX_STOPS,
      pickup,dropoffBefore,dropoffAfter,
      existingStopsBefore,editedExistingStops,addedStops,addedStopsDetailed,finalStops,
      finalRoutePoints:serverRoute.newRoutePoints,
      driverLocationAtConfirm:serverRoute.driverLocationAtConfirm,
      currentStopIndex:serverRoute.currentStopIndex,
      completedStopCount:serverRoute.completedStopCount,
      beforeStopChange:body.beforeStopChange || {},
      originalRoutePoints:serverRoute.originalRoutePoints,
      newRoutePoints:serverRoute.newRoutePoints,
      originalRemainingMiles:serverRoute.originalRemainingMiles,
      newRemainingMiles:serverRoute.newRemainingMiles,
      extraMiles:serverRoute.extraMiles,
      originalRouteData:serverRoute.originalRouteData,
      newRouteData:serverRoute.newRouteData,
      createdAt:
        currentActiveRequest?.createdAt ||
        new Date(),
      updatedAt:new Date()
    };

    if(req.authUser.role !== "PLATFORM_ADMIN"){
      trip.tenantId = req.authUser.tenantId;
    }

    trip.routeChangePending = true;
    trip.routeChangeStatus = "PENDING_REVIEW";
    trip.routeLocked = false;
    trip.routeFinalized = false;
    trip.markModified("addStopRequest");
    await trip.save();

    return res.json({
      success:true,
      message:"Reserved route change request saved for Dispatch Review",
      updated:Boolean(currentActiveRequest),
      tripId:trip._id,
      tripNumber:trip.tripNumber,
      addStopPolicy:policy,
      addStopRequest:trip.addStopRequest
    });
  }catch(err){
    console.error("RESERVED ADD STOP CONFIRM ERROR:",err);
    return res.status(err.statusCode || 500).json({
      success:false,message:err.message || "Failed to save Reserved Add Stop request"
    });
  }
});

router.get("/add-stop/:id/request",requireTenantApi,async (req,res)=>{
  try{
    const Trip = getTripModel();
    const trip = await Trip.findOne(tenantFilter(req,{_id:req.params.id})).lean();
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    if(!bool(req.query?.context)){
      return res.json({success:true,tripId:trip._id,tripNumber:trip.tripNumber,addStopRequest:trip.addStopRequest || null});
    }
    if(tripClosed(trip)) return res.status(400).json({success:false,allowed:false,message:"This trip is closed and cannot be modified"});
    if(trip.isShared === true || upper(trip.tripType) === "SHARED" || tripServiceCode(trip) === "SH"){
      return res.status(400).json({success:false,allowed:false,message:"Add Stop is not available for shared trips"});
    }
    const addStopPolicy = await resolveReservedPolicy(trip,req);
    enforcePolicy(trip,addStopPolicy);
    const progress = await getRouteProgress(trip);
    const driverLocationAtRequest = tripIsInProgress(trip) ? await getLiveDriverLocation(trip) : null;
    return res.json({success:true,allowed:true,tripId:trip._id,tripNumber:trip.tripNumber,addStopRequest:trip.addStopRequest || null,addStopPolicy,tripStatus:trip.status || "",tripInProgress:tripIsInProgress(trip),currentStopIndex:progress.currentStopIndex,completedStopCount:progress.completedStopCount,driverLocationAtRequest});
  }catch(err){
    return res.status(err.statusCode || 500).json({success:false,allowed:false,message:err.message || "Failed to load request"});
  }
});

router.post("/add-stop/:id/cancel",requireTenantApi,async (req,res)=>{
  try{
    const Trip = getTripModel();
    const trip = await Trip.findOne(tenantFilter(req,{_id:req.params.id}));
    if(!trip) return res.status(404).json({success:false,message:"Trip not found"});
    if(!trip.addStopRequest) return res.status(404).json({success:false,message:"No route change request found"});
    trip.addStopRequest.active = false;
    trip.addStopRequest.status = req.body?.status || "CANCELLED_BY_DISPATCH";
    trip.addStopRequest.cancelledAt = new Date();
    trip.addStopRequest.updatedAt = new Date();
    trip.routeChangePending = false;
    trip.routeChangeStatus = "CANCELLED";
    trip.markModified("addStopRequest");
    await trip.save();
    return res.json({success:true,message:"Reserved route change request cancelled",tripId:trip._id});
  }catch(err){
    return res.status(500).json({success:false,message:err.message || "Failed to cancel request"});
  }
});

module.exports = router;
