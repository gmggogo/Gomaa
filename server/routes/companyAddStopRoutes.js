/* =====================================================
   FILE: routes/companyAddStopRoutes.js
   COMPANY / FACILITY / GET QUOTE / INDIVIDUAL
   ADD STOP / ROUTE CHANGE REQUEST
   Saves request inside trip.addStopRequest
===================================================== */

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");

const Service =
  require("../models/Service");

const FacilityPricingOverride =
  require("../models/FacilityPricingOverride");

const LiveDriver =
  require("../models/LiveDriver");

const routeMapEngine =
  require("../utils/routeMapEngine");

const router = express.Router();

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

const MAX_STOPS = 5;
const LIVE_LOCATION_MAX_AGE_MS = 5 * 60 * 1000;

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
      clean(req.query?.tenantId || req.body?.tenantId || "");

    if(requestedTenantId){
      return {
        ...extra,
        tenantId:requestedTenantId
      };
    }

    return {...extra};
  }

  return {
    ...extra,
    tenantId:req.authUser.tenantId
  };
}

/* =========================
   MODELS
========================= */

const Trip =
  mongoose.models.Trip ||
  global.Trip;

if(!Trip){
  throw new Error("Trip model not loaded. Mount companyAddStopRoutes after Trip model in index.js");
}
/* =========================
   ROUTE TEST
========================= */

router.get("/add-stop/ping", (req,res)=>{
  return res.json({
    success:true,
    message:"companyAddStopRoutes connected"
  });
});

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function toNumber(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function bool(v){
  return (
    v === true ||
    String(v ?? "").trim().toLowerCase() === "true" ||
    String(v ?? "").trim() === "1"
  );
}

function upper(v){
  return clean(v).toUpperCase();
}

function lower(v){
  return clean(v).toLowerCase();
}

function safeArray(value){
  return Array.isArray(value) ? value : [];
}

function getStopAddress(stop){

  if(typeof stop === "string"){
    return clean(stop);
  }

  if(!stop || typeof stop !== "object"){
    return "";
  }

  return clean(
    stop.address ||
    stop.stopAddress ||
    stop.fullAddress ||
    stop.formattedAddress ||
    stop.formatted_address ||
    stop.description ||
    stop.location ||
    stop.label ||
    ""
  );
}

function normalizeStops(value){
  return safeArray(value)
    .map(getStopAddress)
    .filter(Boolean);
}

function sameAddress(first,second){
  return lower(first) === lower(second);
}

function sameAddressArray(first,second){

  const a = normalizeStops(first);
  const b = normalizeStops(second);

  return (
    a.length === b.length &&
    a.every((address,index)=>
      sameAddress(address,b[index])
    )
  );
}

function sameAddressCollection(first,second){

  const a = normalizeStops(first)
    .map(lower)
    .sort();

  const b = normalizeStops(second)
    .map(lower)
    .sort();

  return sameAddressArray(a,b);
}

function escapeRegex(v){
  return clean(v).replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
}

function normalizeServiceCode(v){
  const code = upper(v).replace(/[_-]/g," ").replace(/\s+/g," ").trim();
  if(code === "STANDARD" || code === "ST") return "ST";
  if(code === "WHEELCHAIR" || code === "WHEEL CHAIR" || code === "WC" || code === "WH") return "WH";
  if(code === "SHARED" || code === "SH") return "SH";
  if(code === "LIMO" || code === "LIMOUSINE" || code === "LM") return "LM";
  if(code === "TAXI" || code === "TX") return "TX";
  if(code === "XL") return "XL";
  return code;
}

function tripServiceCode(trip){
  const direct =
    clean(
      trip.serviceKey ||
      trip.serviceCode ||
      trip.serviceType ||
      trip.serviceSuffix ||
      trip.vehicle ||
      ""
    );

  if(direct){
    return normalizeServiceCode(direct);
  }

  const parts = clean(trip.tripNumber).split("-");
  return normalizeServiceCode(parts[parts.length - 1] || "");
}

function serviceMatches(entry, code){
  const values = [
    entry?.serviceKey,
    entry?.serviceCode,
    entry?.serviceType,
    entry?.serviceSuffix,
    entry?.suffix,
    entry?.companySuffix,
    entry?.title,
    entry?.name,
    entry?.serviceName
  ];

  return values.some(value =>
    normalizeServiceCode(value) === code
  );
}

async function resolveCompanyAddStopPolicy(trip,req){
  const code = tripServiceCode(trip);

  if(!code){
    throw new Error("Trip service is missing");
  }

  const facilityId =
    clean(
      trip.facilityId ||
      trip.companyId ||
      trip.userId ||
      ""
    );

  const facilityName =
    clean(
      trip.facilityName ||
      trip.companyName ||
      trip.company ||
      ""
    );

  const overrideOr = [];

  if(facilityId && mongoose.Types.ObjectId.isValid(facilityId)){
    overrideOr.push({facilityId:new mongoose.Types.ObjectId(facilityId)});
    overrideOr.push({_id:new mongoose.Types.ObjectId(facilityId)});
  }

  if(facilityId){
    overrideOr.push({facilityId:facilityId});
  }

  if(facilityName){
    const exactName = new RegExp("^" + escapeRegex(facilityName) + "$","i");
    overrideOr.push({facilityName:exactName});
    overrideOr.push({companyName:exactName});
  }

  if(overrideOr.length){
    const override =
      await FacilityPricingOverride
        .findOne(tenantFilter(req,{active:true,$or:overrideOr}))
        .lean();

    const entry =
      Array.isArray(override?.services)
        ? override.services.find(service => serviceMatches(service,code))
        : null;

    if(entry){
      return {
        source:"FACILITY_OVERRIDE",
        normalEnabled:bool(entry.addStopEnabled),
        customEnabled:bool(entry.addStopCustomTimeEnabled),
        cutoffMinutes:toNumber(entry.addStopCutoffMinutes)
      };
    }
  }

  const candidates = [code];
  if(code === "ST") candidates.push("STANDARD");
  if(code === "WH") candidates.push("WHEELCHAIR","WC");
  if(code === "SH") candidates.push("SHARED");
  if(code === "LM") candidates.push("LIMO","LIMOUSINE");
  if(code === "TX") candidates.push("TAXI");

  const regexes = candidates.map(value =>
    new RegExp("^" + escapeRegex(value) + "$","i")
  );

  const service = await Service.findOne(
    tenantFilter(req,{
      $or:[
        {serviceKey:{$in:candidates}},
        {serviceCode:{$in:candidates}},
        {serviceType:{$in:candidates}},
        {suffix:{$in:candidates}},
        {title:{$in:regexes}},
        {name:{$in:regexes}},
        {serviceName:{$in:regexes}}
      ]
    })
  ).lean();

  if(!service){
    throw new Error("Company service was not found");
  }

  return {
    source:"SERVICE_MANAGEMENT",
    normalEnabled:bool(
      service.companyAddStopEnabled ??
      service.addStopEnabled
    ),
    customEnabled:bool(
      service.companyAddStopCustomTimeEnabled ??
      service.addStopCustomTimeEnabled
    ),
    cutoffMinutes:toNumber(
      service.companyAddStopCutoffMinutes ??
      service.addStopCutoffMinutes
    )
  };
}

function minutesToTrip(trip){
  const date = clean(trip.tripDate);
  const time = clean(trip.tripTime);

  if(!date || !time){
    return null;
  }

  const startsAt = new Date(`${date}T${time}:00-07:00`);
  if(Number.isNaN(startsAt.getTime())){
    return null;
  }

  return (startsAt.getTime() - Date.now()) / 60000;
}

function enforceCompanyAddStopPolicy(trip,policy){
  if(policy.normalEnabled === true){
    return;
  }

  if(policy.customEnabled !== true){
    const err = new Error("Add Stop is disabled for this company service");
    err.statusCode = 403;
    throw err;
  }

  const mins = minutesToTrip(trip);
  if(mins === null){
    return;
  }

  const cutoff = Math.max(0,toNumber(policy.cutoffMinutes));

  if(mins <= cutoff){
    const err = new Error(
      cutoff > 0
        ? `Add Stop closed ${cutoff} minutes before the trip`
        : "The Add Stop time window has ended"
    );
    err.statusCode = 403;
    throw err;
  }
}

function isValidObjectId(id){
  return mongoose.Types.ObjectId.isValid(String(id || ""));
}

function getTripSource(trip, body){

  const source =
    clean(
      body.source ||
      trip.source ||
      trip.bookingSource ||
      trip.createdBy ||
      ""
    ).toLowerCase();

  const isCompany =
    trip.isCompany === true ||
    trip.company === true ||
    clean(trip.companyName) ||
    clean(trip.facilityName) ||
    source.includes("company") ||
    source.includes("facility");

  const isGetQuote =
    trip.isGetQuote === true ||
    trip.getQuote === true ||
    source.includes("getquote") ||
    source.includes("get quote") ||
    clean(trip.source).toLowerCase() === "gq";

  const isIndividual =
    !isCompany && !isGetQuote;

  if(isCompany){
    return "COMPANY";
  }

  if(isGetQuote){
    return "GET_QUOTE";
  }

  if(isIndividual){
    return "INDIVIDUAL";
  }

  return "UNKNOWN";
}

function tripIsClosed(trip){

  const status =
    clean(trip.status)
      .toLowerCase()
      .replace(/\s+/g,"")
      .replace(/-/g,"")
      .replace(/_/g,"");

  return (
    status.includes("complete") ||
    status.includes("cancel") ||
    status.includes("noshow") ||
    status.includes("notcompleted")
  );
}

function hasActiveRouteChange(trip){

  const req =
    trip.addStopRequest || {};

  const status =
    clean(req.status).toUpperCase();

  return (
    req.active === true &&
    ![
      "CANCELLED",
      "CANCELLED_BY_COMPANY",
      "CANCELLED_BY_CUSTOMER",
      "COMPLETED",
      "STOP_REACHED",
      "REJECTED"
    ].includes(status)
  );
}

function normalizeStringArray(arr){
  return normalizeStops(arr);
}

function normalizeAddedStopsDetailed(arr){

  if(!Array.isArray(arr)){
    return [];
  }

  return arr
    .map((s,index)=>({
      address:clean(s.address || s.stop || s.location || ""),
      insertAfterIndex:toNumber(s.insertAfterIndex),
      rowIndex:toNumber(s.rowIndex ?? index)
    }))
    .filter(s => s.address);
}

function normalizeEditedExistingStops(arr){

  return safeArray(arr)
    .map(item=>{

      if(typeof item === "string"){
        return clean(item);
      }

      return getStopAddress(
        item?.newAddress ||
        item
      );
    })
    .filter(Boolean);
}

/* =========================
   LIVE DRIVER PROGRESS
========================= */

function tripIsInProgress(trip){

  const status = lower(trip?.status)
    .replace(/[\s_-]+/g,"");

  return [
    "ontrip",
    "started",
    "inprogress",
    "pickedup",
    "pickupcompleted",
    "passengerpickedup",
    "enroute",
    "active"
  ].includes(status);
}

function extractLatLngFromObject(obj){

  if(!obj || typeof obj !== "object"){
    return null;
  }

  const lat =
    obj.lat ??
    obj.latitude ??
    obj.driverLat ??
    obj.currentLat ??
    obj.locationLat;

  const lng =
    obj.lng ??
    obj.lon ??
    obj.long ??
    obj.longitude ??
    obj.driverLng ??
    obj.currentLng ??
    obj.locationLng;

  if(
    Number.isFinite(Number(lat)) &&
    Number.isFinite(Number(lng))
  ){
    return {
      lat:Number(lat),
      lng:Number(lng)
    };
  }

  const containers = [
    obj.currentLocation,
    obj.driverLocation,
    obj.liveLocation,
    obj.location,
    obj.coords,
    obj.position,
    obj.assignment,
    obj.driver,
    obj.data
  ];

  for(const item of containers){
    const found = extractLatLngFromObject(item);
    if(found) return found;
  }

  return null;
}

function getFreshRouteMapLocation(trip){

  const tripId = clean(trip?._id);

  if(
    !tripId ||
    !routeMapEngine ||
    typeof routeMapEngine.getLastLocation !== "function"
  ){
    return null;
  }

  const point = routeMapEngine.getLastLocation(tripId);

  if(
    !point ||
    !Number.isFinite(Number(point.t)) ||
    Date.now() - Number(point.t) > LIVE_LOCATION_MAX_AGE_MS
  ){
    return null;
  }

  return extractLatLngFromObject(point);
}

async function getLiveDriverState(trip){

  const tripId = clean(trip?._id);
  const driverId = clean(
    trip?.driverId ||
    trip?.assignedDriverId ||
    trip?.driver?._id ||
    trip?.driver
  );
  const tenantId = trip?.tenantId || null;
  const conditions = [];

  if(tripId) conditions.push({tripId});
  if(driverId) conditions.push({driverId});

  if(tenantId && conditions.length){
    try{
      const saved = await LiveDriver.findOne({
        tenantId,
        lastSeen:{
          $gte:new Date(Date.now() - LIVE_LOCATION_MAX_AGE_MS)
        },
        $or:conditions
      })
      .sort({lastSeen:-1})
      .lean();

      if(
        saved &&
        (!saved.tripId || String(saved.tripId) === tripId)
      ){
        return saved;
      }
    }catch(err){
      console.error("COMPANY LIVE DRIVER LOOKUP ERROR:",err);
    }
  }

  if(
    !global.liveDrivers ||
    typeof global.liveDrivers.values !== "function"
  ){
    return null;
  }

  return Array.from(global.liveDrivers.values())
    .find(item=>{
      const sameTenant =
        !tenantId ||
        !item?.tenantId ||
        String(item.tenantId) === String(tenantId);

      return sameTenant && (
        clean(item?.tripId) === tripId ||
        (driverId && clean(item?.driverId) === driverId)
      );
    }) || null;
}

async function getLiveDriverLocation(trip){

  const routeMapLocation =
    getFreshRouteMapLocation(trip);

  if(routeMapLocation) return routeMapLocation;

  const liveState = await getLiveDriverState(trip);
  return (
    extractLatLngFromObject(liveState) ||
    extractLatLngFromObject(trip)
  );
}

function extractCurrentStopIndex(obj){

  const value =
    obj?.currentStopIndex ??
    obj?.routeStopIndex ??
    obj?.activeStopIndex ??
    obj?.stopExecution?.currentStopIndex;

  return (
    Number.isInteger(Number(value)) &&
    Number(value) >= 0
  )
    ? Number(value)
    : null;
}

async function getRouteProgress(trip){

  const liveState = await getLiveDriverState(trip);
  const currentStopIndex =
    extractCurrentStopIndex(liveState) ??
    extractCurrentStopIndex(trip) ??
    0;

  const totalStops = normalizeStops(trip?.stops).length;
  const completedStopCount = Math.max(
    0,
    Math.min(totalStops,currentStopIndex - 1)
  );

  return {
    currentStopIndex,
    completedStopCount
  };
}

/* =========================
   GOOGLE DRIVING ROUTE
========================= */

function isLatLngPoint(point){
  return (
    point &&
    typeof point === "object" &&
    Number.isFinite(Number(point.lat)) &&
    Number.isFinite(Number(point.lng))
  );
}

function sanitizeRoutePoint(point){

  if(typeof point === "string"){
    return clean(point) || null;
  }

  if(isLatLngPoint(point)){
    return {
      lat:Number(point.lat),
      lng:Number(point.lng)
    };
  }

  return null;
}

function pointToGoogleValue(point){
  return typeof point === "string"
    ? point
    : isLatLngPoint(point)
      ? `${Number(point.lat)},${Number(point.lng)}`
      : "";
}

async function calculateGoogleRoute(routePoints){

  const googleKey = process.env.GOOGLE_SERVER_KEY;

  if(!googleKey){
    throw new Error("Google Maps key is missing");
  }

  const points = safeArray(routePoints)
    .map(sanitizeRoutePoint)
    .filter(Boolean)
    .slice(0,25);

  if(points.length < 2){
    throw new Error("At least two route points are required");
  }

  const params = new URLSearchParams();
  params.set("origin",pointToGoogleValue(points[0]));
  params.set(
    "destination",
    pointToGoogleValue(points[points.length - 1])
  );
  params.set("mode","driving");
  params.set("units","imperial");
  params.set("key",googleKey);

  const middle = points.slice(1,-1);
  if(middle.length){
    params.set(
      "waypoints",
      middle.map(pointToGoogleValue).join("|")
    );
  }

  const response = await fetch(
    "https://maps.googleapis.com/maps/api/directions/json?" +
    params.toString()
  );

  const data = await response.json().catch(()=>({}));

  if(
    !response.ok ||
    data.status !== "OK" ||
    !data.routes?.[0]
  ){
    throw new Error(
      data.error_message ||
      `Google route failed: ${data.status || response.status}`
    );
  }

  const route = data.routes[0];
  const legs = safeArray(route.legs);
  let distanceMeters = 0;
  let durationSeconds = 0;

  legs.forEach(leg=>{
    distanceMeters += toNumber(leg?.distance?.value);
    durationSeconds += toNumber(leg?.duration?.value);
  });

  return {
    miles:Number((distanceMeters * 0.000621371).toFixed(2)),
    distanceMeters,
    durationSeconds,
    estimatedMinutes:Math.ceil(durationSeconds / 60),
    routePoints:points,
    googleRoute:{
      summary:route.summary || "",
      waypointOrder:safeArray(route.waypoint_order),
      overviewPolyline:route?.overview_polyline?.points || "",
      legs:legs.map((leg,index)=>({
        legIndex:index,
        startAddress:leg?.start_address || "",
        endAddress:leg?.end_address || "",
        distanceText:leg?.distance?.text || "",
        distanceMeters:toNumber(leg?.distance?.value),
        durationText:leg?.duration?.text || "",
        durationSeconds:toNumber(leg?.duration?.value)
      }))
    }
  };
}

async function buildServerRouteChange(trip,finalStops,dropoffAfter){

  const pickup = clean(trip.pickup || trip.pickupAddress);
  const dropoffBefore = clean(trip.dropoff || trip.dropoffAddress);
  const actualStops = normalizeStops(trip.stops);
  const inProgress = tripIsInProgress(trip);
  const progress = await getRouteProgress(trip);

  let mode = "BEFORE_START";
  let driverLocationAtConfirm = null;
  let originalRoutePoints = [];
  let newRoutePoints = [];

  if(inProgress){
    mode = "IN_PROGRESS";
    driverLocationAtConfirm = await getLiveDriverLocation(trip);

    if(!driverLocationAtConfirm){
      throw new Error("Driver current location is unavailable");
    }

    const completedStops = actualStops.slice(
      0,
      progress.completedStopCount
    );

    if(
      !sameAddressArray(
        finalStops.slice(0,progress.completedStopCount),
        completedStops
      )
    ){
      throw new Error(
        "Completed stops cannot be edited, deleted, or reordered"
      );
    }

    originalRoutePoints = [
      pickup,
      ...completedStops,
      driverLocationAtConfirm,
      ...actualStops.slice(progress.completedStopCount),
      dropoffBefore
    ].filter(Boolean);

    newRoutePoints = [
      pickup,
      ...completedStops,
      driverLocationAtConfirm,
      ...finalStops.slice(progress.completedStopCount),
      dropoffAfter
    ].filter(Boolean);
  }else{
    originalRoutePoints = [
      pickup,
      ...actualStops,
      dropoffBefore
    ].filter(Boolean);

    newRoutePoints = [
      pickup,
      ...finalStops,
      dropoffAfter
    ].filter(Boolean);
  }

  const originalRouteData =
    await calculateGoogleRoute(originalRoutePoints);
  const newRouteData =
    await calculateGoogleRoute(newRoutePoints);

  return {
    mode,
    currentStopIndex:progress.currentStopIndex,
    completedStopCount:progress.completedStopCount,
    driverLocationAtConfirm,
    originalRoutePoints,
    newRoutePoints,
    originalRouteData,
    newRouteData,
    originalRemainingMiles:originalRouteData.miles,
    newRemainingMiles:newRouteData.miles,
    extraMiles:Number(
      (newRouteData.miles - originalRouteData.miles).toFixed(2)
    )
  };
}

/* =========================
   COMPANY ADD STOP CONTEXT
   GET /api/company/add-stop/:id/context
========================= */

router.get("/add-stop/:id/context", requireTenantApi, async (req,res)=>{

  try{

    const tripId = clean(req.params.id);

    if(!tripId || !isValidObjectId(tripId)){
      return res.status(400).json({
        success:false,
        message:"Invalid trip ID"
      });
    }

    const trip = await Trip.findOne(
      tenantFilter(req,{_id:tripId})
    ).lean();

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(tripIsClosed(trip)){
      return res.status(400).json({
        success:false,
        message:"This trip is closed and cannot be modified"
      });
    }

    if(
      trip.isShared === true ||
      upper(trip.tripType) === "SHARED" ||
      tripServiceCode(trip) === "SH"
    ){
      return res.status(400).json({
        success:false,
        message:"Add Stop is not available for shared trips"
      });
    }

    const addStopPolicy =
      await resolveCompanyAddStopPolicy(trip,req);

    enforceCompanyAddStopPolicy(trip,addStopPolicy);

    const progress = await getRouteProgress(trip);
    const driverLocationAtRequest = tripIsInProgress(trip)
      ? await getLiveDriverLocation(trip)
      : null;

    return res.json({
      success:true,
      allowed:true,
      addStopPolicy,
      tripStatus:trip.status || "",
      tripInProgress:tripIsInProgress(trip),
      currentStopIndex:progress.currentStopIndex,
      completedStopCount:progress.completedStopCount,
      driverLocationAtRequest
    });

  }catch(err){

    return res.status(err.statusCode || 500).json({
      success:false,
      allowed:false,
      message:err.message || "Add Stop is not available"
    });
  }
});

/* =========================
   CONFIRM ROUTE CHANGE REQUEST
   POST /api/company/add-stop/:id/confirm
========================= */

router.post("/add-stop/:id/confirm", requireTenantApi, async (req,res)=>{

  try{

    const tripId =
      clean(req.params.id);

    if(!tripId || !isValidObjectId(tripId)){
      return res.status(400).json({
        success:false,
        message:"Invalid trip ID"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:tripId}));

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(tripIsClosed(trip)){
      return res.status(400).json({
        success:false,
        message:"This trip is closed and cannot be modified"
      });
    }

    if(
      trip.isShared === true ||
      upper(trip.tripType) === "SHARED" ||
      tripServiceCode(trip) === "SH"
    ){
      return res.status(400).json({
        success:false,
        message:"Add Stop is not available for shared trips"
      });
    }

    const addStopPolicy =
      await resolveCompanyAddStopPolicy(trip,req);

    const currentActiveRequest =
      hasActiveRouteChange(trip)
        ? trip.addStopRequest
        : null;

    if(
      currentActiveRequest &&
      clean(currentActiveRequest.source).toLowerCase() !== "company-add-stop"
    ){
      return res.status(409).json({
        success:false,
        message:"This trip already has an active route change request"
      });
    }

    enforceCompanyAddStopPolicy(
      trip,
      addStopPolicy
    );

    const body =
      req.body || {};

    const tripSource =
      getTripSource(trip, body);

    const pickup =
      clean(
        trip.pickup ||
        trip.pickupAddress ||
        ""
      );

    const dropoffBefore =
      clean(
        trip.dropoff ||
        trip.dropoffAddress ||
        ""
      );

    const dropoffAfter =
      clean(
        body.dropoffAfter ||
        body.finalDropoff ||
        dropoffBefore
      );

    const existingStopsBefore =
      normalizeStops(trip.stops);

    const submittedPickup = clean(body.pickup);
    const submittedDropoffBefore = clean(body.dropoffBefore);
    const submittedStopsBefore =
      normalizeStringArray(body.existingStopsBefore);

    const editorStopsBefore = currentActiveRequest
      ? normalizeStops(currentActiveRequest.finalStops)
      : existingStopsBefore;

    const editedExistingStops =
      normalizeEditedExistingStops(
        body.editedExistingStops
      );

    const addedStops =
      normalizeStringArray(
        body.addedStops
      );

    const addedStopsDetailed =
      normalizeAddedStopsDetailed(
        body.addedStopsDetailed
      );

    const finalStops =
      normalizeStringArray(
        body.finalStops
      );

    if(
      submittedPickup &&
      !sameAddress(submittedPickup,pickup)
    ){
      return res.status(409).json({
        success:false,
        message:"The trip pickup changed before submission. Reload the page."
      });
    }

    if(
      submittedDropoffBefore &&
      !sameAddress(submittedDropoffBefore,dropoffBefore)
    ){
      return res.status(409).json({
        success:false,
        message:"The trip dropoff changed before submission. Reload the page."
      });
    }

    if(
      submittedStopsBefore.length &&
      !sameAddressArray(submittedStopsBefore,existingStopsBefore)
    ){
      return res.status(409).json({
        success:false,
        message:"The trip stops changed before submission. Reload the page."
      });
    }

    if(finalStops.length > MAX_STOPS){
      return res.status(400).json({
        success:false,
        message:`Maximum ${MAX_STOPS} total stops allowed`
      });
    }

    if(editedExistingStops.length > editorStopsBefore.length){
      return res.status(400).json({
        success:false,
        message:"Existing stop information is invalid"
      });
    }

    if(
      finalStops.length !==
      editedExistingStops.length + addedStops.length
    ){
      return res.status(400).json({
        success:false,
        message:"Final stop list is invalid"
      });
    }

    if(
      !sameAddressCollection(
        finalStops,
        [...editedExistingStops,...addedStops]
      )
    ){
      return res.status(400).json({
        success:false,
        message:"Final stop list does not match the submitted route changes"
      });
    }

    const routeStopsChanged =
      !sameAddressArray(existingStopsBefore,finalStops);

    if(!pickup){
      return res.status(400).json({
        success:false,
        message:"Pickup address missing"
      });
    }

    if(!dropoffBefore){
      return res.status(400).json({
        success:false,
        message:"Dropoff address missing"
      });
    }

    if(!routeStopsChanged && dropoffAfter === dropoffBefore){

      if(currentActiveRequest){
        trip.addStopRequest.active = false;
        trip.addStopRequest.status = "CANCELLED_BY_COMPANY";
        trip.addStopRequest.cancelledAt = new Date();
        trip.addStopRequest.updatedAt = new Date();
        trip.routeChangePending = false;
        trip.routeChangeStatus = "CANCELLED";
        trip.markModified("addStopRequest");
        await trip.save();

        return res.json({
          success:true,
          cancelled:true,
          message:"Company route change request cancelled",
          tripId:trip._id,
          tripNumber:trip.tripNumber || "",
          addStopRequest:trip.addStopRequest
        });
      }

      return res.status(400).json({
        success:false,
        message:"No route change detected"
      });
    }

    const serverRoute =
      await buildServerRouteChange(
        trip,
        finalStops,
        dropoffAfter
      );

    trip.addStopRequest = {
      active:true,

      status:
        body.status || "PENDING_REVIEW",

      requestType:
        body.requestType || "ROUTE_CHANGE",

      source:
        body.source || "company-add-stop",

      tripSource,

      addStopPolicy,

      calculatePriceOnReview:
        body.calculatePriceOnReview !== false,

      companyName:
        clean(
          body.companyName ||
          trip.companyName ||
          trip.facilityName ||
          ""
        ),

      facilityName:
        clean(
          body.facilityName ||
          trip.facilityName ||
          trip.companyName ||
          ""
        ),

      tripNumber:
        clean(
          body.tripNumber ||
          trip.tripNumber ||
          ""
        ),

      clientName:
        clean(
          body.clientName ||
          trip.clientName ||
          trip.name ||
          trip.customerName ||
          ""
        ),

      tripStatusAtConfirm:
        clean(
          body.tripStatusAtConfirm ||
          trip.status ||
          ""
        ),

      confirmedAt:
        body.confirmedAt || new Date(),

      mode:
        serverRoute.mode,

      maxStops:
        MAX_STOPS,

      pickup,

      dropoffBefore,
      dropoffAfter,

      existingStopsBefore,
      editedExistingStops,

      addedStops,
      addedStopsDetailed,

      finalStops,

      finalRoutePoints:
        serverRoute.newRoutePoints,

      driverLocationAtConfirm:
        serverRoute.driverLocationAtConfirm,

      currentStopIndex:
        serverRoute.currentStopIndex,

      completedStopCount:
        serverRoute.completedStopCount,

      beforeStopChange:
        body.beforeStopChange || {
          pickup,
          dropoff:dropoffBefore,
          stops:existingStopsBefore,
          miles:toNumber(trip.miles),
          priceAmount:toNumber(trip.priceAmount),
          finalPrice:toNumber(trip.finalPrice)
        },

      originalRoutePoints:
        serverRoute.originalRoutePoints,

      newRoutePoints:
        serverRoute.newRoutePoints,

      originalRemainingMiles:
        serverRoute.originalRemainingMiles,

      newRemainingMiles:
        serverRoute.newRemainingMiles,

      extraMiles:
        serverRoute.extraMiles,

      originalRouteData:
        serverRoute.originalRouteData,

      newRouteData:
        serverRoute.newRouteData,

      createdAt:
        currentActiveRequest?.createdAt ||
        new Date(),

      updatedAt:
        new Date()
    };

    /*
      The trip route is not changed here.
      The request remains pending for Review / Confirm.
    */

    trip.routeChangePending = true;
    trip.routeChangeStatus = "PENDING_REVIEW";

    trip.markModified("addStopRequest");

    await trip.save();

    return res.json({
      success:true,
      message:"Route change request saved for review",
      updated:Boolean(currentActiveRequest),
      tripId:trip._id,
      tripNumber:trip.tripNumber || "",
      tripSource,
      addStopPolicy,
      addStopRequest:trip.addStopRequest
    });

  }catch(err){

    console.error("ADD STOP CONFIRM ROUTE ERROR:",err);

    return res.status(err.statusCode || 500).json({
      success:false,
      message:"Failed to send added stop request",
      error:err.message
    });
  }
});

/* =========================
   GET ACTIVE ROUTE CHANGE
   GET /api/company/add-stop/:id/request
========================= */

router.get("/add-stop/:id/request", requireTenantApi, async (req,res)=>{

  try{

    const tripId =
      clean(req.params.id);

    if(!tripId || !isValidObjectId(tripId)){
      return res.status(400).json({
        success:false,
        message:"Invalid trip ID"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:tripId})).lean();

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(!bool(req.query?.context)){
      return res.json({
        success:true,
        tripId:trip._id,
        tripNumber:trip.tripNumber || "",
        addStopRequest:trip.addStopRequest || null
      });
    }

    if(tripIsClosed(trip)){
      return res.status(400).json({
        success:false,
        allowed:false,
        message:"This trip is closed and cannot be modified"
      });
    }

    if(
      trip.isShared === true ||
      upper(trip.tripType) === "SHARED" ||
      tripServiceCode(trip) === "SH"
    ){
      return res.status(400).json({
        success:false,
        allowed:false,
        message:"Add Stop is not available for shared trips"
      });
    }

    const addStopPolicy =
      await resolveCompanyAddStopPolicy(trip,req);

    enforceCompanyAddStopPolicy(trip,addStopPolicy);

    const progress = await getRouteProgress(trip);
    const driverLocationAtRequest = tripIsInProgress(trip)
      ? await getLiveDriverLocation(trip)
      : null;

    return res.json({
      success:true,
      allowed:true,
      tripId:trip._id,
      tripNumber:trip.tripNumber || "",
      addStopRequest:trip.addStopRequest || null,
      addStopPolicy,
      tripStatus:trip.status || "",
      tripInProgress:tripIsInProgress(trip),
      currentStopIndex:progress.currentStopIndex,
      completedStopCount:progress.completedStopCount,
      driverLocationAtRequest
    });

  }catch(err){

    return res.status(err.statusCode || 500).json({
      success:false,
      allowed:false,
      message:err.message || "Failed to load route change request",
      error:err.message
    });
  }
});

/* =========================
   CANCEL ROUTE CHANGE
   POST /api/company/add-stop/:id/cancel
========================= */

router.post("/add-stop/:id/cancel", requireTenantApi, async (req,res)=>{

  try{

    const tripId =
      clean(req.params.id);

    if(!tripId || !isValidObjectId(tripId)){
      return res.status(400).json({
        success:false,
        message:"Invalid trip ID"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:tripId}));

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(!trip.addStopRequest){
      return res.status(404).json({
        success:false,
        message:"No active route change request found"
      });
    }

    trip.addStopRequest.active = false;
    trip.addStopRequest.status =
      req.body?.status || "CANCELLED_BY_COMPANY";
    trip.addStopRequest.cancelledAt = new Date();
    trip.addStopRequest.updatedAt = new Date();

    trip.routeChangePending = false;
    trip.routeChangeStatus = "CANCELLED";

    trip.markModified("addStopRequest");

    await trip.save();

    return res.json({
      success:true,
      message:"Route change request cancelled",
      tripId:trip._id
    });

  }catch(err){

    return res.status(500).json({
      success:false,
      message:"Failed to cancel route change request",
      error:err.message
    });
  }
});

module.exports = router;
