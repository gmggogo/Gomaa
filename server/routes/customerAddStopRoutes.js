/* =========================================
FILE: customerAddStopRoutes.js

CUSTOMER GET QUOTE ADD STOP

GET
/api/customer-add-stop/:token

POST
/api/customer-add-stop/:token/confirm

FLOW:
- Secure customer token
- Individual trips only
- Admin Service Add Stop permission
- Add Stop time-window validation
- Complete route replacement
- Get Quote price recalculation
- Save new route and new price
- Send ROUTE_UPDATED email
========================================= */

const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const fetch = require("node-fetch");

const Service =
  require("../models/Service");

const FacilityPricingOverride =
  require("../models/FacilityPricingOverride");

const {
  sendTripStatusEmail
} = require("../utils/tripEmailEngine");

const router = express.Router();

/* =========================
   TRIP MODEL
========================= */

const Trip = global.Trip;

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

const INTERNAL_BASE_URL =
  String(
    process.env.INTERNAL_BASE_URL ||
    process.env.PUBLIC_BASE_URL ||
    "https://sunbeam-933q.onrender.com"
  )
    .trim()
    .replace(/\/+$/,"");

/* =========================
   BASIC HELPERS
========================= */

function clean(value){

  return String(
    value ?? ""
  ).trim();

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

/* =========================
   SERVICE CODE
========================= */

function normalizeCode(value){

  const code =
    upper(value);

  if(code === "STANDARD"){
    return "ST";
  }

  if(code === "WHEELCHAIR"){
    return "WH";
  }

  if(code === "SHARED"){
    return "SH";
  }

  if(
    code === "LIMO" ||
    code === "LIMOUSINE"
  ){
    return "LM";
  }

  if(code === "TAXI"){
    return "TX";
  }

  if(code === "XL"){
    return "XL";
  }

  return code;

}

function getTripServiceKey(trip){

  return normalizeCode(
    trip?.serviceKey ||
    trip?.serviceCode ||
    trip?.serviceType ||
    trip?.vehicleTypeFromQuote ||
    trip?.vehicle ||
    ""
  );

}

function buildServiceSearchFilter(idOrKey){

  const raw =
    clean(idOrKey);

  if(validObjectId(raw)){

    return {
      _id:raw
    };

  }

  const key =
    normalizeCode(raw);

  const rawUpper =
    upper(raw);

  const rx =
    new RegExp(
      "^" +
      escapeRegex(raw) +
      "$",
      "i"
    );

  return {

    $or:[

      { serviceKey:key },
      { serviceKey:rawUpper },

      { serviceCode:key },
      { serviceCode:rawUpper },

      { serviceType:key },
      { serviceType:rawUpper },

      { suffix:key },
      { suffix:rawUpper },

      { companySuffix:key },
      { companySuffix:rawUpper },

      { reservedSuffix:key },
      { reservedSuffix:rawUpper },

      { title:rx },
      { name:rx },
      { serviceName:rx }

    ]

  };

}

function getOverrideServiceCode(service){

  return normalizeCode(
    service?.serviceKey ||
    service?.serviceCode ||
    service?.serviceType ||
    service?.serviceSuffix ||
    service?.suffix ||
    service?.companySuffix ||
    service?.reservedSuffix ||
    service?.key ||
    service?.code ||
    service?.title ||
    service?.name ||
    service?.serviceName ||
    ""
  );

}

function isOverrideServiceEnabled(service){

  if(!service){
    return false;
  }

  if(service.active !== undefined){
    return bool(service.active);
  }

  if(service.enabled !== undefined){
    return bool(service.enabled);
  }

  if(service.companyEnabled !== undefined){
    return bool(service.companyEnabled);
  }

  return true;

}

/* =========================
   ADDRESS HELPERS
========================= */

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

  if(!Array.isArray(stops)){

    return [];

  }

  return stops
    .map(getStopAddress)
    .filter(Boolean);

}

function sanitizeAddressArray(value){

  if(!Array.isArray(value)){

    return [];

  }

  return value
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

  const serviceKey =
    getTripServiceKey(trip);

  return (
    trip.isShared === true ||
    tripType === "SHARED" ||
    serviceKey === "SH" ||
    serviceKey === "SHARED" ||
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

  let tripDateTime =
    new Date(
      `${date}T${time}`
    );

  if(
    Number.isNaN(
      tripDateTime.getTime()
    )
  ){

    tripDateTime =
      new Date(
        `${date} ${time}`
      );

  }

  if(
    Number.isNaN(
      tripDateTime.getTime()
    )
  ){

    return null;

  }

  return tripDateTime;

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

/* =========================
   TOKEN
========================= */

function verifyCustomerAddStopToken(token){

  if(!clean(token)){

    throw new Error(
      "Missing customer Add Stop token"
    );

  }

  let decoded;

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
   FACILITY OVERRIDE
========================= */

async function findFacilityOverride(trip){

  const facilityId =
    clean(
      trip?.facilityId ||
      trip?.companyId ||
      ""
    );

  const company =
    clean(
      trip?.company
    );

  const or = [];

  if(
    facilityId &&
    validObjectId(facilityId)
  ){

    or.push({
      facilityId
    });

  }

  if(company){

    const rx =
      new RegExp(
        "^" +
        escapeRegex(company) +
        "$",
        "i"
      );

    or.push({
      facilityName:rx
    });

  }

  if(!or.length){

    return null;

  }

  return FacilityPricingOverride
    .findOne({
      active:true,
      $or:or
    })
    .sort({
      updatedAt:-1,
      createdAt:-1
    })
    .lean();

}

/* =========================
   RESOLVE ADD STOP POLICY
========================= */

async function resolveAddStopPolicy(trip){

  const serviceKey =
    getTripServiceKey(trip);

  if(!serviceKey){

    throw new Error(
      "Trip service is missing"
    );

  }

  const override =
    await findFacilityOverride(
      trip
    );

  if(override){

    const services =
      Array.isArray(
        override.services
      )
        ? override.services
        : [];

    const overrideService =
      services.find(
        service =>
          getOverrideServiceCode(
            service
          ) === serviceKey
      );

    if(
      overrideService &&
      isOverrideServiceEnabled(
        overrideService
      )
    ){

      return {

        source:
          "FACILITY_OVERRIDE",

        serviceKey,

        addStopEnabled:
          bool(
            overrideService
              .addStopEnabled ??
            overrideService
              .companyAddStopEnabled ??
            false
          ),

        addStopCustomTimeEnabled:
          bool(
            overrideService
              .addStopCustomTimeEnabled ??
            overrideService
              .companyAddStopCustomTimeEnabled ??
            false
          ),

        addStopCutoffMinutes:
          Math.max(
            0,
            n(
              overrideService
                .addStopCutoffMinutes ??
              overrideService
                .companyAddStopCutoffMinutes ??
              0
            )
          )

      };

    }

  }

  const service =
    await Service
      .findOne(
        buildServiceSearchFilter(
          serviceKey
        )
      )
      .lean();

  if(!service){

    throw new Error(
      "Trip service was not found"
    );

  }

  if(
    service.companyEnabled === false ||
    service.enabled === false ||
    service.active === false
  ){

    throw new Error(
      "This service is disabled"
    );

  }

  return {

    source:
      "SERVICE_MANAGEMENT",

    serviceKey,

    addStopEnabled:
      bool(
        service.companyAddStopEnabled ??
        service.addStopEnabled ??
        false
      ),

    addStopCustomTimeEnabled:
      bool(
        service
          .companyAddStopCustomTimeEnabled ??
        service
          .addStopCustomTimeEnabled ??
        false
      ),

    addStopCutoffMinutes:
      Math.max(
        0,
        n(
          service
            .companyAddStopCutoffMinutes ??
          service
            .addStopCutoffMinutes ??
          0
        )
      )

  };

}

/* =========================
   ENFORCE ADD STOP POLICY
========================= */

function enforceAddStopPolicy(
  trip,
  policy
){

  if(
    !policy ||
    policy.addStopEnabled !== true
  ){

    throw new Error(
      "Add Stop is disabled for this service"
    );

  }

  const inProgress =
    tripIsInProgress(trip);

  const customTimeEnabled =
    policy
      .addStopCustomTimeEnabled === true;

  const cutoffMinutes =
    Math.max(
      0,
      n(
        policy
          .addStopCutoffMinutes,
        0
      )
    );

  /*
    CUSTOM TIME OFF:
    Add Stop is allowed during the active trip.
  */

  if(!customTimeEnabled){

    if(!inProgress){

      throw new Error(
        "Add Stop is available only while the trip is in progress"
      );

    }

    return true;

  }

  /*
    CUSTOM TIME ON:
    cutoff 0 = until trip time.
    cutoff > 0 = closes before trip.
  */

  const tripDateTime =
    getTripDateTime(trip);

  if(!tripDateTime){

    throw new Error(
      "Trip date or time is invalid"
    );

  }

  const cutoffTime =
    new Date(
      tripDateTime.getTime() -
      cutoffMinutes * 60000
    );

  if(
    Date.now() >
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
   ROUTE DATA
========================= */

function sanitizeRoutePoint(point){

  if(typeof point === "string"){

    return clean(point);

  }

  if(
    point &&
    typeof point === "object" &&
    Number.isFinite(Number(point.lat)) &&
    Number.isFinite(Number(point.lng))
  ){

    return {
      lat:Number(point.lat),
      lng:Number(point.lng)
    };

  }

  return null;

}

function sanitizeRoutePoints(points){

  if(!Array.isArray(points)){

    return [];

  }

  return points
    .map(sanitizeRoutePoint)
    .filter(Boolean)
    .slice(0,20);

}

function sanitizeRouteData(value){

  if(
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ){

    return {
      miles:0,
      distanceMeters:0,
      durationSeconds:0,
      estimatedMinutes:0,
      googleRoute:{}
    };

  }

  return {

    miles:
      n(value.miles,0),

    distanceMeters:
      n(value.distanceMeters,0),

    durationSeconds:
      n(value.durationSeconds,0),

    estimatedMinutes:
      n(value.estimatedMinutes,0),

    googleRoute:
      value.googleRoute &&
      typeof value.googleRoute === "object"
        ? value.googleRoute
        : {}

  };

}

/* =========================
   VALIDATE CHANGE
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
      body.pickup
    );

  const submittedDropoffBefore =
    clean(
      body.dropoffBefore
    );

  const existingStopsBefore =
    sanitizeAddressArray(
      body.existingStopsBefore
    );

  const editedExistingStops =
    sanitizeAddressArray(
      body.editedExistingStops
    );

  const addedStops =
    sanitizeAddressArray(
      body.addedStops
    );

  const finalStops =
    sanitizeAddressArray(
      body.finalStops
    );

  const dropoffAfter =
    clean(
      body.dropoffAfter
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
      "Trip changed before the request was submitted. Reload the page."
    );

  }

  if(
    !sameAddressArray(
      existingStopsBefore,
      actualStops
    )
  ){

    throw new Error(
      "Trip stops changed before the request was submitted. Reload the page."
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

  const hasAddedStops =
    addedStops.length > 0;

  if(
    !existingChanged &&
    !dropoffChanged &&
    !hasAddedStops
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
   GET QUOTE PRICE
========================= */

async function calculateUpdatedGetQuote({
  trip,
  miles,
  minutes,
  stopsCount
}){

  const serviceKey =
    getTripServiceKey(trip);

  if(!serviceKey){

    throw new Error(
      "Trip service is missing"
    );

  }

  const response =
    await fetch(
      `${INTERNAL_BASE_URL}/api/getquote-core/calculate`,
      {
        method:"POST",

        headers:{
          "Content-Type":"application/json",
          "Accept":"application/json"
        },

        body:JSON.stringify({

          serviceKey,

          miles:
            n(miles,0),

          minutes:
            n(minutes,0),

          stops:
            n(stopsCount,0),

          passengersCount:
            1,

          passengerCount:
            1,

          company:
            trip.company || "",

          companyName:
            trip.company || "",

          facilityId:
            trip.facilityId ||
            trip.companyId ||
            "",

          tripId:
            String(
              trip._id
            ),

          tripType:
            trip.tripType ||
            trip.type ||
            "INDIVIDUAL"

        })
      }
    );

  const data =
    await response
      .json()
      .catch(()=>({}));

  if(
    !response.ok ||
    data.success === false
  ){

    throw new Error(
      data.message ||
      "Get Quote price calculation failed"
    );

  }

  const total =
    money(
      data.total ??
      data.priceAmount ??
      data.finalPrice ??
      data.price ??
      0
    );

  if(total < 0){

    throw new Error(
      "Calculated trip price is invalid"
    );

  }

  return {

    priceAmount:
      total,

    finalPrice:
      total,

    pricingSource:
      clean(
        data.pricingSource ||
        data.source ||
        "GET_QUOTE_ENGINE"
      ),

    pricingDetails:
      data

  };

}

/* =========================
   SAFE TRIP RESPONSE
========================= */

function buildSafeCustomerTrip(
  trip,
  policy
){

  const driverLocation =
    extractLatLngFromObject(
      trip
    );

  return {

    _id:
      String(trip._id),

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

    tripType:
      trip.tripType ||
      trip.type ||
      "",

    isShared:
      isSharedTrip(trip),

    serviceKey:
      getTripServiceKey(trip),

    tripDate:
      trip.tripDate || "",

    tripTime:
      trip.tripTime || "",

    routePoints:
      Array.isArray(
        trip.routePoints
      )
        ? trip.routePoints
        : [],

    miles:
      n(trip.miles,0),

    priceAmount:
      n(trip.priceAmount,0),

    finalPrice:
      n(trip.finalPrice,0),

    safeDriverLocation:
      driverLocation,

    driverLocationAtRequest:
      driverLocation,

    tripInProgress:
      tripIsInProgress(trip),

    addStopPolicy:{

      source:
        policy.source || "",

      serviceKey:
        policy.serviceKey || "",

      addStopEnabled:
        policy.addStopEnabled === true,

      addStopCustomTimeEnabled:
        policy
          .addStopCustomTimeEnabled === true,

      addStopCutoffMinutes:
        n(
          policy.addStopCutoffMinutes,
          0
        )

    }

  };

}

/* =========================
   GET TRIP
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

        return res.status(404).json({
          success:false,
          message:"Trip not found"
        });

      }

      if(isSharedTrip(trip)){

        return res.status(400).json({
          success:false,
          message:
            "Add Stop is not available for shared trips"
        });

      }

      if(tripIsClosed(trip)){

        return res.status(400).json({
          success:false,
          message:
            "This trip is closed and cannot be modified"
        });

      }

      const policy =
        await resolveAddStopPolicy(
          trip
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
            policy
          )

      });

    }catch(err){

      console.error(
        "CUSTOMER ADD STOP GET ERROR:",
        err
      );

      return res.status(400).json({
        success:false,
        message:
          err.message ||
          "Failed to load Add Stop page"
      });

    }

  }
);

/* =========================
   CONFIRM AND UPDATE
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

        return res.status(403).json({
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

        return res.status(404).json({
          success:false,
          message:"Trip not found"
        });

      }

      if(isSharedTrip(trip)){

        return res.status(400).json({
          success:false,
          message:
            "Add Stop is not available for shared trips"
        });

      }

      if(tripIsClosed(trip)){

        return res.status(400).json({
          success:false,
          message:
            "This trip is closed and cannot be modified"
        });

      }

      const policy =
        await resolveAddStopPolicy(
          trip
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

      const routeData =
        sanitizeRouteData(
          body.newRouteData
        );

      const finalRoutePoints =
        sanitizeRoutePoints(
          body.finalRoutePoints ||
          body.newRoutePoints
        );

      if(
        routeData.miles <= 0 ||
        routeData.distanceMeters <= 0
      ){

        return res.status(400).json({
          success:false,
          message:
            "New route calculation is invalid"
        });

      }

      if(finalRoutePoints.length < 2){

        return res.status(400).json({
          success:false,
          message:
            "New route points are invalid"
        });

      }

      const pricing =
        await calculateUpdatedGetQuote({

          trip,

          miles:
            routeData.miles,

          minutes:
            routeData.estimatedMinutes,

          stopsCount:
            validated.finalStops.length

        });

      const newPrice =
        money(
          pricing.finalPrice ??
          pricing.priceAmount
        );

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
          n(trip.miles,0),

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
          Array.isArray(
            trip.routePoints
          )
            ? trip.routePoints
            : [],

        googleRoute:
          trip.googleRoute || {}

      };

      /*
        Replace old route.
      */

      trip.stops =
        validated.finalStops;

      trip.dropoff =
        validated.dropoffAfter;

      trip.routePoints =
        finalRoutePoints.map(point=>{

          if(typeof point === "string"){

            return point;

          }

          return (
            `${point.lat},${point.lng}`
          );

        });

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

      /*
        Replace old price.
      */

      trip.priceAmount =
        newPrice;

      trip.finalPrice =
        newPrice;

      /*
        Rebuild final state.
      */

      trip.routeLocked =
        true;

      trip.routeFinalized =
        true;

      trip.routeSource =
        "customer-add-stop";

      trip.routeUpdatedAt =
        new Date();

      trip.confirmedAt =
        new Date();

      trip.isFinalized =
        true;

      trip.routeChangePending =
        false;

      trip.routeChangeStatus =
        "COMPLETED";

      trip.addStopRequest = {

        active:false,

        source:
          "customer-email-add-stop",

        requestType:
          "CUSTOMER_ROUTE_CHANGE",

        status:
          "COMPLETED",

        submittedBy:
          "CUSTOMER",

        completedAt:
          new Date(),

        mode:
          tripIsInProgress(trip)
            ? "IN_PROGRESS"
            : "BEFORE_START",

        oldTrip,

        newTrip:{

          pickup:
            getPickup(trip),

          stops:
            validated.finalStops,

          dropoff:
            validated.dropoffAfter,

          miles:
            routeData.miles,

          estimatedMinutes:
            routeData.estimatedMinutes,

          durationSeconds:
            routeData.durationSeconds,

          distanceMeters:
            routeData.distanceMeters,

          priceAmount:
            newPrice,

          finalPrice:
            newPrice,

          routePoints:
            finalRoutePoints,

          googleRoute:
            routeData.googleRoute

        },

        policy:{

          source:
            policy.source,

          addStopEnabled:
            policy.addStopEnabled === true,

          addStopCustomTimeEnabled:
            policy
              .addStopCustomTimeEnabled === true,

          addStopCutoffMinutes:
            n(
              policy
                .addStopCutoffMinutes,
              0
            )

        },

        pricing:{

          pricingSource:
            pricing.pricingSource,

          pricingDetails:
            pricing.pricingDetails

        }

      };

      trip.markModified(
        "googleRoute"
      );

      trip.markModified(
        "addStopRequest"
      );

      await trip.save();

      await sendTripStatusEmail(
        trip,
        "ROUTE_UPDATED"
      );

      return res.json({

        success:true,

        message:
          "Trip route and price updated successfully",

        trip:{

          tripId:
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
            n(trip.miles,0),

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
            )

        }

      });

    }catch(err){

      console.error(
        "CUSTOMER ADD STOP CONFIRM ERROR:",
        err
      );

      return res.status(400).json({
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