"use strict";

/* =========================================
FILE: routes/customerAddStopRoutes.js

CUSTOMER GET QUOTE ADD STOP

GET
/api/customer-add-stop/:token

POST
/api/customer-add-stop/:token/confirm

GET QUOTE ONLY:
- No Facility Override
- No Company pricing fields
- No Reserved pricing fields
- Reads Get Quote Service Management only
- Calculates route on server
- Recalculates full Get Quote price
- Replaces old route and old price
- Updates the same trip
- Sends ROUTE_UPDATED email
========================================= */

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const router = express.Router();

const Service =
  require("../models/Service");

const routeMapEngine =
  require("../utils/routeMapEngine");

const {
  sendTripStatusEmail
} = require("../utils/tripEmailEngine");

/* =========================
   TRIP MODEL
========================= */

const Trip =
  global.Trip ||
  mongoose.models.Trip;

if(!Trip){
  throw new Error(
    "customerAddStopRoutes must be mounted after the Trip model is created"
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

/* =========================
   BASIC HELPERS
========================= */

function clean(value){
  return String(value ?? "")
    .replace(/\s+/g," ")
    .trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function lower(value){
  return clean(value).toLowerCase();
}

function n(value,fallback = 0){

  const num =
    Number(value);

  return Number.isFinite(num)
    ? num
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
   SERVICE HELPERS
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

function getServiceSearchCandidates(trip){

  const raw =
    upper(
      getTripServiceValue(trip)
    );

  const normalized =
    normalizeServiceCode(raw);

  const names = [];

  function add(value){

    const v =
      upper(value);

    if(
      v &&
      !names.includes(v)
    ){
      names.push(v);
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

  return names;
}

async function findGetQuoteService(trip){

  const candidates =
    getServiceSearchCandidates(trip);

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
          getQuoteSuffix:{
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

  /*
    Get Quote service only.
    Never check companyEnabled here.
  */

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
   TRIP HELPERS
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
   TRIP TYPE / STATUS
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

  const code =
    normalizeServiceCode(
      getTripServiceValue(trip)
    );

  return (
    trip.isShared === true ||
    tripType === "SHARED" ||
    code === "SH" ||
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
   DATE / TIME
========================= */

function getSystemTimeZone(){

  return (
    process.env.SYSTEM_TIMEZONE ||
    "America/Phoenix"
  );
}

function getSystemNow(){

  return new Date(
    new Date().toLocaleString(
      "en-US",
      {
        timeZone:
          getSystemTimeZone()
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

  const rawTime =
    time.length === 5
      ? `${time}:00`
      : time;

  const parsed =
    new Date(
      `${date}T${rawTime}`
    );

  if(
    Number.isNaN(
      parsed.getTime()
    )
  ){
    return null;
  }

  return parsed;
}

/* =========================
   GET QUOTE ADD STOP POLICY
========================= */

function buildAddStopPolicy(service){

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

    addStopEnabled:
      bool(
        service?.addStopEnabled ??
        false
      ),

    addStopCustomTimeEnabled:
      bool(
        service?.addStopCustomTimeEnabled ??
        false
      ),

    addStopCutoffMinutes:
      Math.max(
        0,
        n(
          service?.addStopCutoffMinutes,
          0
        )
      ),

    /*
      Optional field support.

      If this field does not exist,
      during-trip Add Stop remains allowed
      when Add Stop itself is enabled.
    */

    addStopDuringTripEnabled:
      service?.addStopDuringTripEnabled === undefined
        ? true
        : bool(
            service.addStopDuringTripEnabled
          )
  };
}

function enforceAddStopPolicy(
  trip,
  policy
){

  if(
    !policy ||
    policy.addStopEnabled !== true
  ){

    throw new Error(
      "Add Stop is disabled for this Get Quote service"
    );
  }

  /*
    During trip:
    allowed when Add Stop is enabled,
    unless Admin explicitly disables
    addStopDuringTripEnabled.
  */

  if(tripIsInProgress(trip)){

    if(
      policy.addStopDuringTripEnabled === false
    ){

      throw new Error(
        "Add Stop is not allowed during this trip"
      );
    }

    return true;
  }

  const tripDateTime =
    getTripDateTime(trip);

  if(!tripDateTime){

    throw new Error(
      "Trip date or time is invalid"
    );
  }

  const now =
    getSystemNow();

  /*
    Custom time OFF:
    allowed until the scheduled trip time.
  */

  if(
    policy.addStopCustomTimeEnabled !== true
  ){

    if(
      now.getTime() >
      tripDateTime.getTime()
    ){

      throw new Error(
        "The Add Stop time window has ended"
      );
    }

    return true;
  }

  /*
    Custom time ON:
    closes X minutes before trip.
  */

  const cutoffMinutes =
    Math.max(
      0,
      n(
        policy.addStopCutoffMinutes,
        0
      )
    );

  const cutoffTime =
    new Date(
      tripDateTime.getTime() -
      cutoffMinutes * 60000
    );

  if(
    now.getTime() >
    cutoffTime.getTime()
  ){

    if(cutoffMinutes > 0){

      throw new Error(
        `Add Stop closed ${cutoffMinutes} minutes before the trip`
      );
    }

    throw new Error(
      "The Add Stop time window has ended"
    );
  }

  return true;
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

  try{

    decoded =
      jwt.verify(
        token,
        CUSTOMER_LINK_SECRET
      );

  }catch(err){

    if(
      err?.name ===
      "TokenExpiredError"
    ){

      throw new Error(
        "This Add Stop link has expired"
      );
    }

    throw new Error(
      "This Add Stop link is invalid"
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

  return {
    decoded,
    tripId
  };
}

function createCustomerAddStopToken(
  tripId,
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

  return jwt.sign(
    {
      tripId:id,
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

  const direct =
    extractLatLngFromObject(trip);

  if(direct){
    return direct;
  }

  if(
    !global.liveDrivers ||
    typeof global.liveDrivers.values !== "function"
  ){
    return null;
  }

  const tripId =
    String(
      trip?._id || ""
    );

  const driverId =
    String(
      trip?.driverId || ""
    );

  const list =
    Array.from(
      global.liveDrivers.values()
    );

  const found =
    list.find(item=>{

      return (
        String(item?.tripId || "") === tripId ||
        (
          driverId &&
          String(item?.driverId || "") === driverId
        )
      );
    });

  return extractLatLngFromObject(
    found
  );
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

function normalizeRouteResult(
  raw,
  routePoints
){

  const distanceMeters =
    n(
      raw?.distanceMeters,
      0
    );

  const durationSeconds =
    n(
      raw?.durationSeconds,
      0
    );

  const miles =
    n(
      raw?.miles,
      distanceMeters > 0
        ? distanceMeters * 0.000621371
        : 0
    );

  const estimatedMinutes =
    n(
      raw?.estimatedMinutes,
      durationSeconds > 0
        ? Math.ceil(durationSeconds / 60)
        : 0
    );

  return {

    miles:
      Number(
        miles.toFixed(2)
      ),

    distanceMeters:
      Number(distanceMeters),

    durationSeconds:
      Number(durationSeconds),

    estimatedMinutes:
      Math.ceil(
        estimatedMinutes
      ),

    googleRoute:
      raw?.googleRoute ||
      raw?.route ||
      raw ||
      {},

    optimizedRoute:
      raw?.optimizedRoute ||
      raw?.googleRoute ||
      raw?.route ||
      raw ||
      {},

    polyline:
      clean(
        raw?.polyline ||
        raw?.routePolyline ||
        raw?.overviewPolyline ||
        raw?.googleRoute
          ?.overview_polyline
          ?.points ||
        ""
      ),

    routePoints:
      routePoints
  };
}

async function calculateServerRoute(
  routePoints
){

  if(
    !routeMapEngine ||
    (
      typeof routeMapEngine.calculateRouteMiles !== "function" &&
      typeof routeMapEngine.calculateRoute !== "function"
    )
  ){

    throw new Error(
      "Server route engine is unavailable"
    );
  }

  let raw = null;

  if(
    typeof routeMapEngine.calculateRouteMiles === "function"
  ){

    raw =
      await routeMapEngine.calculateRouteMiles(
        routePoints
      );

  }else{

    raw =
      await routeMapEngine.calculateRoute(
        routePoints
      );
  }

  const result =
    normalizeRouteResult(
      raw,
      routePoints
    );

  if(
    result.miles <= 0 ||
    result.distanceMeters <= 0
  ){

    throw new Error(
      "The updated route could not be calculated"
    );
  }

  return result;
}

/* =========================
   ROUTE PAYLOAD VALIDATION
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

  if(
    submittedDropoffBefore &&
    !sameAddress(
      submittedDropoffBefore,
      actualDropoff
    )
  ){

    throw new Error(
      "The trip changed before submission. Reload the page and try again."
    );
  }

  if(
    !sameAddressArray(
      submittedStopsBefore,
      actualStops
    )
  ){

    throw new Error(
      "The trip stops changed before submission. Reload the page and try again."
    );
  }

  if(
    editedExistingStops.length !==
    actualStops.length
  ){

    throw new Error(
      "Existing stop information is incomplete"
    );
  }

  if(finalStops.length > MAX_STOPS){

    throw new Error(
      `Maximum ${MAX_STOPS} total stops allowed`
    );
  }

  if(
    actualStops.length +
    addedStops.length >
    MAX_STOPS
  ){

    throw new Error(
      `Maximum ${MAX_STOPS} total stops allowed`
    );
  }

  if(
    finalStops.length !==
    actualStops.length +
    addedStops.length
  ){

    throw new Error(
      "Final stop list is invalid"
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

    finalStops
  };
}

/* =========================
   BUILD SERVER ROUTE
========================= */

async function buildUpdatedRoutePoints(
  trip,
  validated,
  body
){

  const inProgress =
    tripIsInProgress(trip);

  /*
    Before trip:
    Pickup -> all final stops -> Dropoff
  */

  if(!inProgress){

    return [

      validated.pickup,

      ...validated.finalStops,

      validated.dropoffAfter

    ].filter(Boolean);
  }

  /*
    During trip:
    Prefer the route points submitted by
    the customer page because it includes:

    Pickup
    completed/previous route points when present
    driver current location
    new stop
    remaining stops
    dropoff
  */

  const submitted =
    sanitizeRoutePoints(
      body?.newRoutePoints ||
      body?.finalRoutePoints
    );

  if(submitted.length >= 2){

    return submitted;
  }

  const driverLocation =
    extractLatLngFromObject(
      body?.driverLocationAtConfirm
    ) ||
    await getLiveDriverLocation(
      trip
    );

  if(!driverLocation){

    throw new Error(
      "Driver current location is unavailable"
    );
  }

  return [

    validated.pickup,

    driverLocation,

    ...validated.finalStops,

    validated.dropoffAfter

  ].filter(Boolean);
}

/* =========================
   GET QUOTE PRICE
   Same calculation as GetQuoteEngine.js
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

  /* =========================
     HOURLY
  ========================= */

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
      hours *
      hourlyRate;
  }

  /* =========================
     SHARED
  ========================= */

  else if(pricingMode === "SHARED"){

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
  }

  /* =========================
     INDIVIDUAL
  ========================= */

  else{

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
   SAFE CUSTOMER TRIP
========================= */

function buildSafeCustomerTrip(
  trip,
  service,
  policy
){

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
      extractLatLngFromObject(
        trip
      ),

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
        tripId
      } =
        verifyCustomerAddStopToken(
          req.params.token
        );

      const trip =
        await Trip
          .findById(tripId)
          .lean();

      if(!trip){

        return res
          .status(404)
          .json({
            success:false,
            message:"Trip not found"
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
          trip
        );

      const policy =
        buildAddStopPolicy(
          service
        );

      enforceAddStopPolicy(
        trip,
        policy
      );

      return res.json({

        success:true,

        trip:
          buildSafeCustomerTrip(
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
   CONFIRM / UPDATE TRIP
========================= */

router.post(
  "/:token/confirm",
  async (req,res)=>{

    try{

      const {
        tripId
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
        await Trip.findById(
          tripId
        );

      if(!trip){

        return res
          .status(404)
          .json({
            success:false,
            message:"Trip not found"
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
        Recheck current Get Quote service.
        An old email link cannot bypass Admin settings.
      */

      const service =
        await findGetQuoteService(
          trip
        );

      const policy =
        buildAddStopPolicy(
          service
        );

      enforceAddStopPolicy(
        trip,
        policy
      );

      const validated =
        validateRouteChangePayload(
          trip,
          body
        );

      const updatedRoutePoints =
        await buildUpdatedRoutePoints(
          trip,
          validated,
          body
        );

      if(
        updatedRoutePoints.length < 2
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Updated route points are invalid"
          });
      }

      /*
        Server calculates the new route.
      */

      const routeData =
        await calculateServerRoute(
          updatedRoutePoints
        );

      /*
        Get Quote Service Management pricing only.
      */

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

      if(newPrice < 0){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Updated trip price is invalid"
          });
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

        pickupLat:
          trip.pickupLat ?? null,

        pickupLng:
          trip.pickupLng ?? null,

        dropoffLat:
          trip.dropoffLat ?? null,

        dropoffLng:
          trip.dropoffLng ?? null,

        stopCoords:
          safeArray(
            trip.stopCoords
          ),

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
          trip.optimizedRoute || {},

        routeLocked:
          trip.routeLocked === true,

        routeFinalized:
          trip.routeFinalized === true
      };

      const now =
        new Date();

      /*
        Replace old route data.
      */

      trip.stops =
        validated.finalStops;

      trip.dropoff =
        validated.dropoffAfter;

      trip.routePoints =
        updatedRoutePoints
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
        Old coordinates are no longer trusted
        after addresses change.
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
        Replace old price.
      */

      trip.priceAmount =
        newPrice;

      trip.finalPrice =
        newPrice;

      /*
        Updated route state.
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
            updatedRoutePoints,

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

      /*
        Send updated email after successful save.
        Email failure does not undo the trip update.
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

        message:
          emailSent
            ? "Trip route and price updated. Updated email sent."
            : "Trip route and price updated, but the email could not be sent.",

        emailSent,

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

          distanceMeters:
            n(
              trip.distanceMeters,
              0
            ),

          durationSeconds:
            n(
              trip.durationSeconds,
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

module.exports = router;