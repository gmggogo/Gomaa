"use strict";

/* =========================================
FILE: routes/customerAddStopRoutes.js

CUSTOMER GET QUOTE ADD STOP

GET:
  /api/customer-add-stop/:token

POST:
  /api/customer-add-stop/:token/confirm

GET QUOTE ONLY:
- Service Management Get Quote fields only
- No Facility Override
- No Company fields
- No Reserved fields
- Add Stop and Custom Time work independently
- Server calculates the new Google route
- Server recalculates complete Get Quote price
- Updates the existing trip
- Sends ROUTE_UPDATED email
========================================= */

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");

const Service =
  require("../models/Service");

const SystemDesign =
  require("../models/SystemDesign");

const LiveDriver =
  require("../models/LiveDriver");

const routeMapEngine =
  require("../utils/routeMapEngine");

const {
  sendTripStatusEmail
} = require("../utils/tripEmailEngine");

const {
  changeAuthorizedAmount,
  hasActiveAuthorization
} = require("../utils/tripPaymentEngine");

const router =
  express.Router();

/* =========================
   TRIP MODEL
========================= */

const Trip =
  global.Trip ||
  mongoose.models.Trip;

if(!Trip){

  throw new Error(
    "customerAddStopRoutes must be mounted after Trip model is created"
  );

}

/* =========================
   CONFIG
========================= */

const MAX_STOPS = 5;

const CUSTOMER_LINK_SECRET =
  process.env.CUSTOMER_LINK_SECRET ||
  process.env.JWT_SECRET ||
  process.env.SECRET_KEY ||
  "dev_customer_add_stop_secret";

const CUSTOMER_LINK_SECRETS =
  Array.from(
    new Set(
      [
        process.env.CUSTOMER_LINK_SECRET,
        process.env.JWT_SECRET,
        process.env.SECRET_KEY,
        CUSTOMER_LINK_SECRET
      ]
        .map(value=>String(value || "").trim())
        .filter(Boolean)
    )
  );

/* =========================
   BASIC HELPERS
========================= */

function clean(value){

  return String(
    value ?? ""
  )
    .replace(/\s+/g," ")
    .trim();

}

function upper(value){

  return clean(value)
    .toUpperCase();

}

function lower(value){

  return clean(value)
    .toLowerCase();

}

function n(value,fallback = 0){

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;

}

function bool(value){

  return (
    value === true ||
    lower(value) === "true" ||
    lower(value) === "yes" ||
    lower(value) === "1"
  );

}

function money(value){

  return Number(
    n(value,0).toFixed(2)
  );

}

function cleanStatus(value){

  return lower(value)
    .replace(/\s+/g,"")
    .replace(/-/g,"")
    .replace(/_/g,"");

}

function escapeRegex(value){

  return clean(value)
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

}

function validObjectId(value){

  return mongoose.Types.ObjectId.isValid(
    String(value || "")
  );

}

function safeArray(value){

  return Array.isArray(value)
    ? value
    : [];

}

/* =========================
   SERVICE CODE
========================= */

function normalizeServiceCode(value){

  const code =
    upper(value)
      .replace(/[_-]/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(
    code === "STANDARD" ||
    code === "ST"
  ){
    return "ST";
  }

  if(
    code === "WHEELCHAIR" ||
    code === "WHEEL CHAIR" ||
    code === "WC" ||
    code === "WH"
  ){
    return "WH";
  }

  if(
    code === "SHARED" ||
    code === "SH"
  ){
    return "SH";
  }

  if(
    code === "LIMO" ||
    code === "LIMOUSINE" ||
    code === "LM"
  ){
    return "LM";
  }

  if(
    code === "TAXI" ||
    code === "TX"
  ){
    return "TX";
  }

  if(code === "XL"){
    return "XL";
  }

  return code;

}

function getTripServiceValue(trip){

  return clean(
    trip?.serviceKey ||
    trip?.serviceCode ||
    trip?.serviceType ||
    trip?.vehicleTypeFromQuote ||
    trip?.vehicle ||
    ""
  );

}

function getServiceCandidates(trip){

  const raw =
    upper(
      getTripServiceValue(trip)
    );

  const normalized =
    normalizeServiceCode(raw);

  const values = [];

  function add(value){

    const v =
      upper(value);

    if(
      v &&
      !values.includes(v)
    ){
      values.push(v);
    }

  }

  add(raw);
  add(normalized);

  if(normalized === "ST"){
    add("STANDARD");
  }

  if(normalized === "WH"){
    add("WHEELCHAIR");
    add("WC");
  }

  if(normalized === "TX"){
    add("TAXI");
  }

  if(normalized === "LM"){
    add("LIMO");
    add("LIMOUSINE");
  }

  if(normalized === "SH"){
    add("SHARED");
  }

  return values;

}

async function findGetQuoteService(trip,tenantId){

  const candidates =
    getServiceCandidates(trip);

  if(!candidates.length){

    throw new Error(
      "Trip Get Quote service is missing"
    );

  }

  const regexes =
    candidates.map(value=>
      new RegExp(
        "^" +
        escapeRegex(value) +
        "$",
        "i"
      )
    );

  const service =
    await Service.findOne({

      ...(tenantId ? {tenantId} : {}),

      $or:[

        {
          serviceKey:{
            $in:candidates
          }
        },

        {
          serviceCode:{
            $in:candidates
          }
        },

        {
          serviceType:{
            $in:candidates
          }
        },

        {
          suffix:{
            $in:candidates
          }
        },

        {
          title:{
            $in:regexes
          }
        },

        {
          name:{
            $in:regexes
          }
        },

        {
          serviceName:{
            $in:regexes
          }
        }

      ]

    }).lean();

  if(!service){

    throw new Error(
      "Get Quote service was not found in Service Management"
    );

  }

  if(
    service.enabled === false ||
    service.active === false
  ){

    throw new Error(
      "This Get Quote service is disabled"
    );

  }

  return service;

}

/* =========================
   ADDRESS HELPERS
========================= */

function getPickup(trip){

  return clean(
    trip?.pickup ||
    trip?.pickupAddress ||
    ""
  );

}

function getDropoff(trip){

  return clean(
    trip?.dropoff ||
    trip?.dropoffAddress ||
    ""
  );

}

function getClientName(trip){

  return clean(
    trip?.clientName ||
    trip?.customerName ||
    trip?.passengerName ||
    trip?.name ||
    ""
  );

}

function getStopAddress(stop){

  if(typeof stop === "string"){

    return clean(stop);

  }

  if(
    !stop ||
    typeof stop !== "object"
  ){

    return "";

  }

  return clean(
    stop.address ||
    stop.stopAddress ||
    stop.fullAddress ||
    stop.location ||
    ""
  );

}

function normalizeStops(stops){

  return safeArray(stops)
    .map(getStopAddress)
    .filter(Boolean);

}

function sanitizeAddressArray(value){

  return safeArray(value)
    .map(getStopAddress)
    .filter(Boolean);

}

function sameAddress(first,second){

  return (
    lower(first) ===
    lower(second)
  );

}

function sameAddressArray(first,second){

  const a =
    sanitizeAddressArray(first);

  const b =
    sanitizeAddressArray(second);

  if(a.length !== b.length){

    return false;

  }

  return a.every(
    (address,index)=>
      sameAddress(
        address,
        b[index]
      )
  );

}

/* =========================
   TRIP CHECKS
========================= */

function isCompanyTrip(trip){

  const type =
    lower(
      trip?.type
    );

  return (
    !!clean(trip?.company) ||
    type.includes("company") ||
    type.includes("facility")
  );

}

function isSharedTrip(trip){

  if(!trip){

    return false;

  }

  const tripType =
    upper(
      trip.tripType ||
      trip.type
    );

  const tripNumber =
    upper(
      trip.tripNumber
    );

  const serviceCode =
    normalizeServiceCode(
      getTripServiceValue(trip)
    );

  return (
    trip.isShared === true ||
    tripType === "SHARED" ||
    serviceCode === "SH" ||
    tripNumber.includes("-SH")
  );

}

function tripIsClosed(trip){

  const status =
    cleanStatus(
      trip?.status
    );

  return (
    status.includes("complete") ||
    status.includes("cancel") ||
    status.includes("noshow") ||
    status.includes("notcompleted")
  );

}

function tripIsInProgress(trip){

  const status =
    cleanStatus(
      trip?.status
    );

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

/* =========================
   SYSTEM TIME
========================= */

async function getSystemSettings(tenantId){

  try{

    return (
      await SystemDesign.findOne(tenantId ? {tenantId} : {}).lean()
    ) || {};

  }catch(err){

    return {};

  }

}

function getSystemTimezone(settings){

  return (
    settings?.timezone ||
    process.env.SYSTEM_TIMEZONE ||
    "America/Phoenix"
  );

}

function getSystemNow(settings){

  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone:
          getSystemTimezone(settings)
      }
    )
  );

}

function getTripDateTime(trip){

  const date =
    clean(
      trip?.tripDate
    );

  const time =
    clean(
      trip?.tripTime
    );

  if(!date || !time){

    return null;

  }

  const safeTime =
    time.length === 5
      ? `${time}:00`
      : time;

  const result =
    new Date(
      `${date}T${safeTime}`
    );

  if(
    Number.isNaN(
      result.getTime()
    )
  ){

    return null;

  }

  return result;

}

/* =========================
   GET QUOTE ADD STOP POLICY

   The two settings are independent:

   Normal Add Stop:
   getQuoteAddStopEnabled

   Custom Time:
   getQuoteAddStopCustomTimeEnabled
   getQuoteAddStopCutoffMinutes
========================= */

function buildGetQuoteAddStopPolicy(service){

  return {

    source:
      "GET_QUOTE_SERVICE_MANAGEMENT",

    serviceId:
      String(
        service?._id || ""
      ),

    serviceKey:
      clean(
        service?.serviceKey ||
        service?.serviceCode ||
        service?.title ||
        service?.name ||
        ""
      ),

    normalAddStopEnabled:
      bool(
        service
          ?.getQuoteAddStopEnabled ??
        false
      ),

    customTimeEnabled:
      bool(
        service
          ?.getQuoteAddStopCustomTimeEnabled ??
        false
      ),

    cutoffMinutes:
      Math.max(
        0,
        n(
          service
            ?.getQuoteAddStopCutoffMinutes,
          0
        )
      )

  };

}

/* =========================
   POLICY LOGIC

   OFF + OFF:
   Hidden

   ON + OFF:
   Available until Dropoff

   OFF + ON:
   Available until cutoff time

   ON + ON:
   Normal Add Stop wins
   Available until Dropoff
========================= */

function isAddStopAllowed(
  trip,
  policy,
  settings
){

  if(!trip || tripIsClosed(trip)){

    return false;

  }

  const normalEnabled =
    policy?.normalAddStopEnabled === true;

  const customEnabled =
    policy?.customTimeEnabled === true;

  if(
    !normalEnabled &&
    !customEnabled
  ){

    return false;

  }

  /*
    Normal Add Stop works independently
    and stays available until Dropoff.
  */

  if(normalEnabled){

    return true;

  }

  /*
    Only Custom Time is enabled.
  */

  const tripDateTime =
    getTripDateTime(trip);

  if(!tripDateTime){

    return false;

  }

  const now =
    getSystemNow(settings);

  const cutoffMinutes =
    Math.max(
      0,
      n(
        policy?.cutoffMinutes,
        0
      )
    );

  const cutoffTime =
    new Date(
      tripDateTime.getTime() -
      cutoffMinutes * 60000
    );

  return (
    now.getTime() <
    cutoffTime.getTime()
  );

}

function enforceAddStopPolicy(
  trip,
  policy,
  settings
){

  if(
    isAddStopAllowed(
      trip,
      policy,
      settings
    )
  ){

    return true;

  }

  if(tripIsClosed(trip)){

    throw new Error(
      "This trip is closed and cannot be modified"
    );

  }

  const normalEnabled =
    policy?.normalAddStopEnabled === true;

  const customEnabled =
    policy?.customTimeEnabled === true;

  if(
    !normalEnabled &&
    !customEnabled
  ){

    throw new Error(
      "Add Stop is disabled for this Get Quote service"
    );

  }

  if(
    customEnabled &&
    !normalEnabled
  ){

    const cutoffMinutes =
      Math.max(
        0,
        n(
          policy?.cutoffMinutes,
          0
        )
      );

    if(cutoffMinutes > 0){

      throw new Error(
        `Add Stop closed ${cutoffMinutes} minutes before the trip`
      );

    }

    throw new Error(
      "The Add Stop time window has ended"
    );

  }

  throw new Error(
    "Add Stop is not available"
  );

}

/* =========================
   TOKEN
========================= */

function verifyCustomerAddStopToken(token){

  if(!clean(token)){

    throw new Error(
      "Missing Add Stop token"
    );

  }

  let decoded = null;
  let expired = false;

  for(const secret of CUSTOMER_LINK_SECRETS){

    try{

      decoded =
        jwt.verify(
          token,
          secret
        );

      break;

    }catch(err){

      if(err?.name === "TokenExpiredError"){
        expired = true;
      }

    }

  }

  if(!decoded){

    throw new Error(
      expired
        ? "This Add Stop link has expired"
        : "This Add Stop link is invalid"
    );

  }

  const purpose =
    upper(
      decoded?.purpose ||
      decoded?.action ||
      ""
    );

  if(
    purpose !== "CUSTOMER_ADD_STOP" &&
    purpose !== "ADD_STOP"
  ){

    throw new Error(
      "This link cannot be used for Add Stop"
    );

  }

  const tripId =
    clean(
      decoded?.tripId ||
      decoded?.id ||
      decoded?._id
    );

  if(
    !tripId ||
    !validObjectId(tripId)
  ){

    throw new Error(
      "Invalid trip in Add Stop link"
    );

  }

  const tenantId =
    clean(decoded?.tenantId);

  return {
    decoded,
    tripId,
    tenantId
  };

}

function createCustomerAddStopToken(
  tripId,
  tenantId,
  expiresIn = "30d"
){

  const id =
    clean(tripId);

  if(
    !id ||
    !validObjectId(id)
  ){

    throw new Error(
      "Valid trip ID is required"
    );

  }

  const cleanTenantId =
    clean(tenantId);

  if(!cleanTenantId){

    throw new Error(
      "Tenant ID is required"
    );

  }

  return jwt.sign(
    {
      tripId:id,
      tenantId:cleanTenantId,
      purpose:"CUSTOMER_ADD_STOP"
    },
    CUSTOMER_LINK_SECRET,
    {
      expiresIn
    }
  );

}

/* =========================
   DRIVER LOCATION
========================= */

function extractLatLngFromObject(obj){

  if(
    !obj ||
    typeof obj !== "object"
  ){

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

    const found =
      extractLatLngFromObject(item);

    if(found){

      return found;

    }

  }

  return null;

}

async function getLiveDriverLocation(trip){

  const liveState =
    await getLiveDriverState(
      trip
    );

  const routeMapLocation =
    getFreshRouteMapLocation(
      trip
    );

  if(routeMapLocation){

    return routeMapLocation;

  }

  const liveLocation =
    extractLatLngFromObject(
      liveState
    );

  if(liveLocation){

    return liveLocation;

  }

  return extractLatLngFromObject(
    trip
  );

}

function sameAddressCollection(first,second){

  const a =
    sanitizeAddressArray(first)
      .map(lower)
      .sort();

  const b =
    sanitizeAddressArray(second)
      .map(lower)
      .sort();

  return sameAddressArray(a,b);

}

function getFreshRouteMapLocation(trip){

  const tripId =
    String(
      trip?._id || ""
    );

  if(
    !tripId ||
    !routeMapEngine ||
    typeof routeMapEngine.getLastLocation !== "function"
  ){

    return null;

  }

  const point =
    routeMapEngine.getLastLocation(
      tripId
    );

  if(
    !point ||
    !Number.isFinite(Number(point.t)) ||
    Date.now() - Number(point.t) > 1000 * 60 * 5
  ){

    return null;

  }

  return extractLatLngFromObject(
    point
  );

}

async function getLiveDriverState(trip){

  const tripId =
    String(
      trip?._id || ""
    );

  const driverId =
    String(
      trip?.driverId || ""
    );

  const tenantId =
    trip?.tenantId || null;

  const since =
    new Date(
      Date.now() -
      1000 * 60 * 5
    );

  if(tenantId){

    const conditions = [];

    if(tripId){
      conditions.push({tripId});
    }

    if(driverId){
      conditions.push({driverId});
    }

    if(conditions.length){

      try{

        const saved =
          await LiveDriver.findOne({
            tenantId,
            lastSeen:{$gte:since},
            $or:conditions
          })
          .sort({lastSeen:-1})
          .lean();

        if(
          saved &&
          (
            !saved.tripId ||
            String(saved.tripId) === tripId
          )
        ){

          return saved;

        }

      }catch(err){

        console.error(
          "LIVE DRIVER LOOKUP ERROR:",
          err
        );

      }
    }
  }

  if(
    !global.liveDrivers ||
    typeof global.liveDrivers.values !== "function"
  ){

    return null;

  }

  const list =
    Array.from(
      global.liveDrivers.values()
    );

  const found =
    list.find(item=>{

      const itemTripId =
        String(
          item?.tripId || ""
        );

      const itemDriverId =
        String(
          item?.driverId || ""
        );

      return (
        (
          itemTripId === tripId &&
          (
            !tenantId ||
            !item?.tenantId ||
            String(item.tenantId) === String(tenantId)
          )
        ) ||
        (
          driverId &&
          itemDriverId === driverId &&
          (
            !tenantId ||
            !item?.tenantId ||
            String(item.tenantId) === String(tenantId)
          )
        )
      );

    });

  return found || null;

}

function extractCurrentStopIndex(obj){

  if(
    !obj ||
    typeof obj !== "object"
  ){

    return null;

  }

  const value =
    obj.currentStopIndex ??
    obj.routeStopIndex ??
    obj.activeStopIndex ??
    obj.stopExecution?.currentStopIndex;

  if(
    Number.isInteger(Number(value)) &&
    Number(value) >= 0
  ){

    return Number(value);

  }

  return null;

}

async function getRouteProgress(trip){

  const liveState =
    await getLiveDriverState(
      trip
    );

  const currentStopIndex =
    extractCurrentStopIndex(
      liveState
    ) ??
    extractCurrentStopIndex(
      trip
    ) ??
    0;

  const totalStops =
    normalizeStops(
      trip?.stops
    ).length;

  /*
    Driver route indexes are:
    0 = Pickup
    1..N = Intermediate Stops
    N + 1 = Dropoff
  */
  const completedStopCount =
    Math.max(
      0,
      Math.min(
        totalStops,
        currentStopIndex - 1
      )
    );

  return {
    currentStopIndex,
    completedStopCount
  };

}

/* =========================
   ROUTE POINT HELPERS
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

    const value =
      clean(point);

    return value || null;

  }

  if(isLatLngPoint(point)){

    return {
      lat:Number(point.lat),
      lng:Number(point.lng)
    };

  }

  return null;

}

function sanitizeRoutePoints(points){

  return safeArray(points)
    .map(sanitizeRoutePoint)
    .filter(Boolean)
    .slice(0,25);

}

function pointToGoogleValue(point){

  if(typeof point === "string"){

    return point;

  }

  if(isLatLngPoint(point)){

    return (
      `${Number(point.lat)},${Number(point.lng)}`
    );

  }

  return "";

}

function routePointToStoredString(point){

  if(typeof point === "string"){

    return clean(point);

  }

  if(isLatLngPoint(point)){

    return (
      `${Number(point.lat)},${Number(point.lng)}`
    );

  }

  return "";

}

/* =========================
   GOOGLE DIRECTIONS
   SERVER CALCULATION
========================= */

async function calculateGoogleRoute(
  routePoints
){

const googleKey =
  process.env.GOOGLE_SERVER_KEY;

  if(!googleKey){

    throw new Error(
      "Google Maps key is missing"
    );

  }

  const points =
    sanitizeRoutePoints(
      routePoints
    );

  if(points.length < 2){

    throw new Error(
      "At least two route points are required"
    );

  }

  const origin =
    pointToGoogleValue(
      points[0]
    );

  const destination =
    pointToGoogleValue(
      points[
        points.length - 1
      ]
    );

  const middle =
    points.slice(
      1,
      -1
    );

  const params =
    new URLSearchParams();

  params.set(
    "origin",
    origin
  );

  params.set(
    "destination",
    destination
  );

  params.set(
    "mode",
    "driving"
  );

  params.set(
    "units",
    "imperial"
  );

  params.set(
    "key",
    googleKey
  );

  if(middle.length){

    params.set(
      "waypoints",
      middle
        .map(pointToGoogleValue)
        .join("|")
    );

  }

  const url =
    "https://maps.googleapis.com/maps/api/directions/json?" +
    params.toString();

  const response =
    await fetch(url);

  const data =
    await response
      .json()
      .catch(()=>({}));

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

  const route =
    data.routes[0];

  const legs =
    safeArray(
      route.legs
    );

  let distanceMeters = 0;
  let durationSeconds = 0;

  legs.forEach(leg=>{

    distanceMeters +=
      n(
        leg?.distance?.value,
        0
      );

    durationSeconds +=
      n(
        leg?.duration?.value,
        0
      );

  });

  const miles =
    Number(
      (
        distanceMeters *
        0.000621371
      ).toFixed(2)
    );

  const estimatedMinutes =
    Math.ceil(
      durationSeconds / 60
    );

  return {

    miles,

    distanceMeters,

    durationSeconds,

    estimatedMinutes,

    routePoints:
      points,

    googleRoute:{

      summary:
        route.summary || "",

      waypointOrder:
        safeArray(
          route.waypoint_order
        ),

      overviewPolyline:
        route
          ?.overview_polyline
          ?.points ||
        "",

      legs:
        legs.map(
          (leg,index)=>({

            legIndex:index,

            startAddress:
              leg?.start_address || "",

            endAddress:
              leg?.end_address || "",

            distanceText:
              leg?.distance?.text || "",

            distanceMeters:
              n(
                leg?.distance?.value,
                0
              ),

            durationText:
              leg?.duration?.text || "",

            durationSeconds:
              n(
                leg?.duration?.value,
                0
              )

          })
        )

    },

    optimizedRoute:{

      source:
        "GOOGLE_DIRECTIONS_SERVER",

      summary:
        route.summary || "",

      overviewPolyline:
        route
          ?.overview_polyline
          ?.points ||
        "",

      routePoints:
        points

    }

  };

}

/* =========================
   PAYLOAD VALIDATION
========================= */

function validateRouteChangePayload(
  trip,
  body
){

  const actualPickup =
    getPickup(trip);

  const actualDropoff =
    getDropoff(trip);

  const actualStops =
    normalizeStops(
      trip.stops
    );

  const submittedPickup =
    clean(
      body?.pickup
    );

  const submittedDropoffBefore =
    clean(
      body?.dropoffBefore
    );

  const submittedStopsBefore =
    sanitizeAddressArray(
      body?.existingStopsBefore
    );

  const editedExistingStops =
    sanitizeAddressArray(
      body?.editedExistingStops
    );

  const addedStops =
    sanitizeAddressArray(
      body?.addedStops
    );

  const finalStops =
    sanitizeAddressArray(
      body?.finalStops
    );

  const dropoffAfter =
    clean(
      body?.dropoffAfter
    );

  if(!actualPickup){

    throw new Error(
      "Trip pickup address is missing"
    );

  }

  if(!actualDropoff){

    throw new Error(
      "Trip dropoff address is missing"
    );

  }

  if(!dropoffAfter){

    throw new Error(
      "Dropoff address is required"
    );

  }

  if(
    submittedPickup &&
    !sameAddress(
      submittedPickup,
      actualPickup
    )
  ){

    throw new Error(
      "Pickup address cannot be changed"
    );

  }

  /*
    Do not reject a route change only because another authorized actor
    (Customer / Admin / Dispatcher) updated the trip after this page loaded.

    The current database trip is the live source of truth for the "before"
    route, while the submitted final route is still validated below.

    This prevents false "Reload the page" conflicts when stops/dropoff were
    changed by another allowed editor or by a previous successful change.
  */
  const routeChangedSincePageLoad =
    (
      submittedDropoffBefore &&
      !sameAddress(
        submittedDropoffBefore,
        actualDropoff
      )
    ) ||
    !sameAddressArray(
      submittedStopsBefore,
      actualStops
    );

  /*
    A stale page may contain more or fewer old stops than the current trip.
    Do not block the request for that reason alone. During an active trip,
    buildUpdatedRoutePoints() still protects completed stops from being
    edited, deleted, or reordered.
  */

  if(finalStops.length > MAX_STOPS){

    throw new Error(
      `Maximum ${MAX_STOPS} total stops allowed`
    );

  }

  if(
    finalStops.length !==
    editedExistingStops.length +
    addedStops.length
  ){

    throw new Error(
      "Final stop list is invalid"
    );

  }

  if(
    !sameAddressCollection(
      finalStops,
      [
        ...editedExistingStops,
        ...addedStops
      ]
    )
  ){

    throw new Error(
      "Final stop list does not match the submitted route changes"
    );

  }

  const existingChanged =
    !sameAddressArray(
      editedExistingStops,
      actualStops
    );

  const dropoffChanged =
    !sameAddress(
      dropoffAfter,
      actualDropoff
    );

  const stopAdded =
    addedStops.length > 0;

  if(
    !existingChanged &&
    !dropoffChanged &&
    !stopAdded
  ){

    throw new Error(
      "No route changes were submitted"
    );

  }

  return {

    pickup:
      actualPickup,

    dropoffBefore:
      actualDropoff,

    dropoffAfter,

    existingStopsBefore:
      actualStops,

    editedExistingStops,

    addedStops,

    finalStops,

    routeChangedSincePageLoad

  };

}

/* =========================
   BUILD ROUTE POINTS
========================= */

async function buildUpdatedRoutePoints(
  trip,
  validated,
  body
){

  const inProgress =
    tripIsInProgress(trip);

  /*
    Before start:
    Pickup -> Stops -> Dropoff
  */

  if(!inProgress){

    return [

      validated.pickup,

      ...validated.finalStops,

      validated.dropoffAfter

    ].filter(Boolean);

  }

  /*
    During trip, the server builds the route itself:
    Pickup -> completed stop(s) -> live driver location
    -> remaining/new stop(s) -> Dropoff.

    Google Directions calculates driving-road distance for every leg.
    Client-submitted route points are never trusted for final pricing.
  */

  const progress =
    await getRouteProgress(
      trip
    );

  const completedStops =
    validated.existingStopsBefore.slice(
      0,
      progress.completedStopCount
    );

  const submittedCompletedStops =
    validated.finalStops.slice(
      0,
      progress.completedStopCount
    );

  if(
    !sameAddressArray(
      submittedCompletedStops,
      completedStops
    )
  ){

    throw new Error(
      "Completed stops cannot be edited, deleted, or reordered"
    );

  }

  const remainingStops =
    validated.finalStops.slice(
      progress.completedStopCount
    );

  const driverLocation =
    await getLiveDriverLocation(
      trip
    ) ||
    extractLatLngFromObject(
      body?.driverLocationAtConfirm
    );

  if(!driverLocation){

    throw new Error(
      "Driver current location is unavailable"
    );

  }

  return [

    validated.pickup,

    ...completedStops,

    driverLocation,

    ...remainingStops,

    validated.dropoffAfter

  ].filter(Boolean);

}

/* =========================
   GET QUOTE PRICE
   Same logic as GetQuoteEngine.js
========================= */

function calculateGetQuotePrice({
  service,
  miles,
  stops,
  minutes,
  passengersCount = 1
}){

  const pricingMode =
    upper(
      service?.pricingMode ||
      "MILE"
    );

  const baseFare =
    n(
      service?.baseFare,
      0
    );

  const includedMiles =
    n(
      service?.includedMiles,
      0
    );

  const perMile =
    n(
      service?.perMile,
      0
    );

  const stopFee =
    n(
      service?.stopFee,
      0
    );

  const sharedPrice =
    n(
      service?.sharedPrice,
      0
    );

  const hourlyRate =
    n(
      service?.hourlyRate,
      0
    );

  let total = 0;

  if(pricingMode === "HOURLY"){

    let hours = 1;

    const hourlyBillingMode =
      upper(
        service?.hourlyBillingMode ||
        "FULL"
      );

    if(hourlyBillingMode === "QUARTER"){

      hours =
        Math.max(
          1,
          Math.ceil(
            n(minutes) / 15
          ) / 4
        );

    }else{

      hours =
        Math.max(
          1,
          Math.ceil(
            n(minutes) / 60
          )
        );

    }

    total =
      (hours * hourlyRate) +
      (n(stops) * stopFee);

  }else if(pricingMode === "SHARED"){

    const count =
      Math.max(
        1,
        n(
          passengersCount,
          1
        )
      );

    if(sharedPrice > 0){

      total =
        (sharedPrice * count) +
        (n(stops) * stopFee);

    }else{

      const baseTotal =
        count *
        baseFare;

      const includedTotal =
        count *
        includedMiles;

      const extraMiles =
        Math.max(
          0,
          n(miles) -
          includedTotal
        );

      const milesTotal =
        extraMiles *
        perMile;

      const stopsTotal =
        Math.max(
          0,
          count - 1
        ) *
        stopFee;

      total =
        baseTotal +
        milesTotal +
        stopsTotal;

    }

  }else{

    const extraMiles =
      Math.max(
        0,
        n(miles) -
        includedMiles
      );

    total =
      baseFare +
      (extraMiles * perMile) +
      (n(stops) * stopFee);

  }

  return {

    pricingMode,

    total:
      money(total),

    usedPricing:{

      baseFare,
      includedMiles,
      perMile,
      stopFee,
      sharedPrice,
      hourlyRate,

      hourlyBillingMode:
        service?.hourlyBillingMode ||
        "FULL"

    }

  };

}

/* =========================
   SAFE TRIP RESPONSE
========================= */

async function buildSafeCustomerTrip(
  trip,
  service,
  policy
){

  const routeProgress =
    await getRouteProgress(
      trip
    );

  return {

    _id:
      String(
        trip._id
      ),

    tripNumber:
      trip.tripNumber || "",

    clientName:
      getClientName(trip),

    pickup:
      getPickup(trip),

    dropoff:
      getDropoff(trip),

    stops:
      normalizeStops(
        trip.stops
      ),

    status:
      trip.status || "",

    type:
      trip.type || "",

    tripType:
      trip.tripType || "",

    isShared:
      isSharedTrip(trip),

    serviceKey:
      clean(
        service?.serviceKey ||
        service?.serviceCode ||
        getTripServiceValue(trip)
      ),

    tripDate:
      trip.tripDate || "",

    tripTime:
      trip.tripTime || "",

    miles:
      n(
        trip.miles,
        0
      ),

    estimatedMinutes:
      n(
        trip.estimatedMinutes,
        0
      ),

    durationSeconds:
      n(
        trip.durationSeconds,
        0
      ),

    distanceMeters:
      n(
        trip.distanceMeters,
        0
      ),

    priceAmount:
      n(
        trip.priceAmount,
        0
      ),

    finalPrice:
      n(
        trip.finalPrice,
        0
      ),

    routePoints:
      safeArray(
        trip.routePoints
      ),

    safeDriverLocation:
      extractLatLngFromObject(
        trip
      ),

    driverLocationAtRequest:
      await getLiveDriverLocation(
        trip
      ),

    currentStopIndex:
      routeProgress.currentStopIndex,

    completedStopCount:
      routeProgress.completedStopCount,

    tripInProgress:
      tripIsInProgress(trip),

    addStopPolicy:
      policy

  };

}

/* =========================
   GET CUSTOMER TRIP
========================= */

router.get(
  "/:token",
  async (req,res)=>{

    try{

      const {
        tripId,
        tenantId
      } =
        verifyCustomerAddStopToken(
          req.params.token
        );

      const trip =
        await Trip
          .findOne({
            _id:tripId,
            ...(tenantId ? {tenantId} : {})
          })
          .lean();

      if(!trip){

        return res
          .status(404)
          .json({
            success:false,
            message:"Trip not found"
          });

      }

      const resolvedTenantId =
        clean(
          tenantId ||
          trip.tenantId
        );

      if(!resolvedTenantId){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Trip organization is missing"
          });

      }

      if(isCompanyTrip(trip)){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "This Add Stop link is only for Get Quote trips"
          });

      }

      if(isSharedTrip(trip)){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Add Stop is not available for shared trips"
          });

      }

      if(tripIsClosed(trip)){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "This trip is closed and cannot be modified"
          });

      }

      const service =
        await findGetQuoteService(
          trip,
          resolvedTenantId
        );

      const policy =
        buildGetQuoteAddStopPolicy(
          service
        );

      const settings =
        await getSystemSettings(
          resolvedTenantId
        );

      enforceAddStopPolicy(
        trip,
        policy,
        settings
      );

      return res.json({

        success:true,

        trip:
          await buildSafeCustomerTrip(
            trip,
            service,
            policy
          )

      });

    }catch(err){

      console.error(
        "CUSTOMER ADD STOP GET ERROR:",
        err
      );

      return res
        .status(400)
        .json({
          success:false,
          message:
            err.message ||
            "Failed to load Add Stop page"
        });

    }

  }
);

/* =========================
   CONFIRM AND UPDATE TRIP
========================= */

router.post(
  "/:token/confirm",
  async (req,res)=>{

    try{

      const {
        tripId,
        tenantId
      } =
        verifyCustomerAddStopToken(
          req.params.token
        );

      const body =
        req.body || {};

      if(
        body.tripId &&
        String(body.tripId) !==
        String(tripId)
      ){

        return res
          .status(403)
          .json({
            success:false,
            message:
              "Trip does not match this Add Stop link"
          });

      }

      const trip =
        await Trip.findOne({
          _id:tripId,
          ...(tenantId ? {tenantId} : {})
        });

      if(!trip){

        return res
          .status(404)
          .json({
            success:false,
            message:"Trip not found"
          });

      }

      const resolvedTenantId =
        clean(
          tenantId ||
          trip.tenantId
        );

      if(!resolvedTenantId){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Trip organization is missing"
          });

      }

      if(isCompanyTrip(trip)){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "This Add Stop link is only for Get Quote trips"
          });

      }

      if(isSharedTrip(trip)){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Add Stop is not available for shared trips"
          });

      }

      if(tripIsClosed(trip)){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "This trip is closed and cannot be modified"
          });

      }

      /*
        Recheck Service Management.
        Old emails cannot bypass current policy.
      */

      const service =
        await findGetQuoteService(
          trip,
          resolvedTenantId
        );

      const policy =
        buildGetQuoteAddStopPolicy(
          service
        );

      const settings =
        await getSystemSettings(
          resolvedTenantId
        );

      enforceAddStopPolicy(
        trip,
        policy,
        settings
      );

      const validated =
        validateRouteChangePayload(
          trip,
          body
        );

      const routePoints =
        await buildUpdatedRoutePoints(
          trip,
          validated,
          body
        );

      const routeData =
        await calculateGoogleRoute(
          routePoints
        );

      const pricing =
        calculateGetQuotePrice({

          service,

          miles:
            routeData.miles,

          stops:
            validated.finalStops.length,

          minutes:
            routeData.estimatedMinutes,

          passengersCount:
            1

        });

      const newPrice =
        money(
          pricing.total
        );

      /*
        PAYMENT APPROVAL BEFORE ROUTE UPDATE.
        If a 24-hour hold already exists, Stripe/bank must approve the exact
        new price first. Any failure throws here, before the trip document is
        changed or saved, so the old route and old authorization remain.
      */

      let paymentAuthorizationUpdated = false;

      if(hasActiveAuthorization(trip)){

        await changeAuthorizedAmount(
          trip,
          newPrice
        );

        paymentAuthorizationUpdated = true;

      }

      const oldTrip = {

        pickup:
          getPickup(trip),

        stops:
          normalizeStops(
            trip.stops
          ),

        dropoff:
          getDropoff(trip),

        miles:
          n(
            trip.miles,
            0
          ),

        estimatedMinutes:
          n(
            trip.estimatedMinutes,
            0
          ),

        durationSeconds:
          n(
            trip.durationSeconds,
            0
          ),

        distanceMeters:
          n(
            trip.distanceMeters,
            0
          ),

        priceAmount:
          n(
            trip.priceAmount,
            0
          ),

        finalPrice:
          n(
            trip.finalPrice,
            0
          ),

        routePoints:
          safeArray(
            trip.routePoints
          ),

        googleRoute:
          trip.googleRoute || {},

        optimizedRoute:
          trip.optimizedRoute || {}

      };

      const now =
        new Date();

      /*
        Replace route.
      */

      trip.stops =
        validated.finalStops;

      trip.dropoff =
        validated.dropoffAfter;

      trip.routePoints =
        routePoints
          .map(routePointToStoredString)
          .filter(Boolean);

      trip.miles =
        routeData.miles;

      trip.distanceMeters =
        routeData.distanceMeters;

      trip.durationSeconds =
        routeData.durationSeconds;

      trip.estimatedMinutes =
        routeData.estimatedMinutes;

      trip.googleRoute =
        routeData.googleRoute;

      trip.optimizedRoute =
        routeData.optimizedRoute;

      /*
        Addresses changed.
        Old stop/dropoff coordinates are invalid.
      */

      trip.stopCoords = [];

      if(
        !sameAddress(
          validated.dropoffAfter,
          validated.dropoffBefore
        )
      ){

        trip.dropoffLat = null;
        trip.dropoffLng = null;

      }

      /*
        Replace price.
      */

      trip.priceAmount =
        newPrice;

      trip.finalPrice =
        newPrice;

      /*
        Route state.
      */

      trip.routeLocked =
        true;

      trip.routeFinalized =
        true;

      trip.routeSource =
        "customer-getquote-add-stop";

      trip.routeUpdatedAt =
        now;

      trip.confirmedAt =
        now;

      trip.isFinalized =
        false;

      trip.routeChangePending =
        false;

      trip.routeChangeStatus =
        "COMPLETED";

      trip.addStopRequest = {

        active:false,

        source:
          "customer-email-add-stop",

        requestType:
          "GET_QUOTE_ROUTE_CHANGE",

        status:
          "COMPLETED",

        submittedBy:
          "CUSTOMER",

        submittedFrom:
          "GET_QUOTE_EMAIL",

        completedAt:
          now,

        mode:
          tripIsInProgress(trip)
            ? "IN_PROGRESS"
            : "BEFORE_START",

        oldTrip,

        newTrip:{

          pickup:
            validated.pickup,

          stops:
            validated.finalStops,

          dropoff:
            validated.dropoffAfter,

          routePoints:
            routePoints,

          miles:
            routeData.miles,

          distanceMeters:
            routeData.distanceMeters,

          durationSeconds:
            routeData.durationSeconds,

          estimatedMinutes:
            routeData.estimatedMinutes,

          googleRoute:
            routeData.googleRoute,

          optimizedRoute:
            routeData.optimizedRoute,

          priceAmount:
            newPrice,

          finalPrice:
            newPrice

        },

        service:{

          source:
            "GET_QUOTE_SERVICE_MANAGEMENT",

          serviceId:
            String(
              service._id || ""
            ),

          serviceKey:
            clean(
              service.serviceKey ||
              service.serviceCode ||
              ""
            )

        },

        policy,

        pricing

      };

      trip.markModified(
        "googleRoute"
      );

      trip.markModified(
        "optimizedRoute"
      );

      trip.markModified(
        "addStopRequest"
      );

      await trip.save();

      if(
        typeof global.notifyDriverTripUpdate ===
          "function" &&
        trip.driverId
      ){
        global.notifyDriverTripUpdate(
          trip,
          {
            changeType:"ROUTE_UPDATED",
            title:"Route Updated",
            body:"A stop was added or changed. Open GH Mobility to view the updated route."
          }
        ).catch(err=>{
          console.error(
            "DRIVER ROUTE UPDATE NOTIFY ERROR:",
            err?.message || err
          );
        });
      }

      /*
        Send update email after save.
      */

      let emailSent = false;

      try{

        const emailResult =
          await sendTripStatusEmail(
            trip,
            "ROUTE_UPDATED"
          );

        emailSent =
          !!emailResult;

      }catch(emailErr){

        console.error(
          "ROUTE UPDATED EMAIL ERROR:",
          emailErr
        );

      }

      return res.json({

        success:true,

        emailSent,

        paymentAuthorizationUpdated,

        paymentStatus:
          trip.paymentStatus || "",

        authorizedAmount:
          n(trip.authorizedAmount,0),

        message:
          emailSent
            ? "Trip updated and updated email sent."
            : "Trip updated, but updated email could not be sent.",

        trip:{

          _id:
            String(trip._id),

          tripNumber:
            trip.tripNumber || "",

          pickup:
            getPickup(trip),

          stops:
            normalizeStops(
              trip.stops
            ),

          dropoff:
            getDropoff(trip),

          miles:
            n(
              trip.miles,
              0
            ),

          estimatedMinutes:
            n(
              trip.estimatedMinutes,
              0
            ),

          priceAmount:
            n(
              trip.priceAmount,
              0
            ),

          finalPrice:
            n(
              trip.finalPrice,
              0
            ),

          routeChangeStatus:
            trip.routeChangeStatus || ""

        }

      });

    }catch(err){

      console.error(
        "CUSTOMER ADD STOP CONFIRM ERROR:",
        err
      );

      return res
        .status(400)
        .json({
          success:false,
          message:
            err.message ||
            "Failed to update trip"
        });

    }

  }
);

/* =========================
   EXPORT
========================= */

router.createCustomerAddStopToken =
  createCustomerAddStopToken;

module.exports =
  router;