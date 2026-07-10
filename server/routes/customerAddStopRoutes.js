/* =========================================
FILE: customerAddStopRoutes.js

CUSTOMER GET QUOTE ADD STOP

GET
/api/customer-add-stop/:token

POST
/api/customer-add-stop/:token/confirm

- Secure customer email link
- Individual trips only
- Shared trips blocked
- Maximum 5 total stops
- Saves route-change request for Review
- Does not apply the route directly
========================================= */

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();

/* =========================
   TRIP MODEL
   server.js mounts this route
   after global.Trip is created
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

function number(value,fallback = 0){

  const parsed =
    Number(value);

  return Number.isFinite(parsed)
    ? parsed
    : fallback;

}

function cleanStatus(value){

  return clean(value)
    .toLowerCase()
    .replace(/\s+/g,"")
    .replace(/-/g,"")
    .replace(/_/g,"");

}

function validObjectId(value){

  return mongoose.Types.ObjectId.isValid(
    String(value || "")
  );

}

function safeDate(value){

  const date =
    value
      ? new Date(value)
      : new Date();

  if(Number.isNaN(date.getTime())){

    return new Date();

  }

  return date;

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
    .map(item=>{

      if(typeof item === "string"){

        return clean(item);

      }

      return getStopAddress(item);

    })
    .filter(Boolean);

}

function sameAddressArray(a,b){

  const first =
    sanitizeAddressArray(a);

  const second =
    sanitizeAddressArray(b);

  if(first.length !== second.length){

    return false;

  }

  return first.every(
    (address,index)=>
      clean(address).toLowerCase() ===
      clean(second[index]).toLowerCase()
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
    upper(
      trip.serviceKey ||
      trip.serviceCode ||
      trip.serviceType ||
      trip.serviceSuffix ||
      trip.vehicle ||
      ""
    );

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

function hasActiveStopRequest(trip){

  const request =
    trip?.addStopRequest || {};

  const status =
    upper(
      request.status || ""
    );

  return (
    request.active === true &&
    ![
      "CANCELLED",
      "CANCELLED_BY_COMPANY",
      "CANCELLED_BY_CUSTOMER",
      "COMPLETED",
      "STOP_REACHED",
      "REJECTED",
      "APPROVED"
    ].includes(status)
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

  const directLat =
    obj.lat ??
    obj.latitude ??
    obj.driverLat ??
    obj.currentLat ??
    obj.locationLat;

  const directLng =
    obj.lng ??
    obj.lon ??
    obj.long ??
    obj.longitude ??
    obj.driverLng ??
    obj.currentLng ??
    obj.locationLng;

  if(
    Number.isFinite(
      Number(directLat)
    ) &&
    Number.isFinite(
      Number(directLng)
    )
  ){

    return {
      lat:Number(directLat),
      lng:Number(directLng)
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
   SAFE ROUTE POINTS
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

/* =========================
   SAFE GOOGLE ROUTE DATA
========================= */

function sanitizeGoogleRouteData(value){

  if(
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ){

    return {};

  }

  const legs =
    Array.isArray(value.googleRoute?.legs)
      ? value.googleRoute.legs
      : Array.isArray(value.legs)
        ? value.legs
        : [];

  return {

    miles:
      number(value.miles,0),

    distanceMeters:
      number(value.distanceMeters,0),

    durationSeconds:
      number(value.durationSeconds,0),

    estimatedMinutes:
      number(value.estimatedMinutes,0),

    googleRoute:{

      summary:
        clean(
          value.googleRoute?.summary ||
          value.summary ||
          ""
        ),

      legs:
        legs
          .slice(0,20)
          .map((leg,index)=>({

            legIndex:
              number(
                leg?.legIndex,
                index
              ),

            startAddress:
              clean(
                leg?.startAddress ||
                leg?.start_address ||
                ""
              ),

            endAddress:
              clean(
                leg?.endAddress ||
                leg?.end_address ||
                ""
              ),

            distanceText:
              clean(
                leg?.distanceText ||
                ""
              ),

            distanceMeters:
              number(
                leg?.distanceMeters,
                0
              ),

            durationText:
              clean(
                leg?.durationText ||
                ""
              ),

            durationSeconds:
              number(
                leg?.durationSeconds,
                0
              )

          }))

    }

  };

}

/* =========================
   TOKEN
========================= */

/*
  Token payload:

  {
    tripId:"TRIP_OBJECT_ID",
    purpose:"CUSTOMER_ADD_STOP"
  }
*/

function verifyCustomerAddStopToken(token){

  if(!clean(token)){

    throw new Error(
      "Missing customer Add Stop token"
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

    if(err.name === "TokenExpiredError"){

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

/* =========================
   CREATE TOKEN HELPER
========================= */

function createCustomerAddStopToken(
  tripId,
  expiresIn = "30d"
){

  const cleanTripId =
    clean(tripId);

  if(
    !cleanTripId ||
    !validObjectId(cleanTripId)
  ){

    throw new Error(
      "A valid trip ID is required to create Add Stop token"
    );

  }

  return jwt.sign(
    {
      tripId:cleanTripId,
      purpose:"CUSTOMER_ADD_STOP"
    },
    CUSTOMER_LINK_SECRET,
    {
      expiresIn
    }
  );

}

/* =========================
   SAFE CUSTOMER TRIP
========================= */

function buildSafeCustomerTrip(trip){

  const driverLocation =
    extractLatLngFromObject(trip);

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
      trip.serviceKey ||
      trip.serviceCode ||
      trip.serviceType ||
      trip.serviceSuffix ||
      "",

    routePoints:
      Array.isArray(trip.routePoints)
        ? trip.routePoints
        : [],

    miles:
      number(
        trip.miles,
        0
      ),

    estimatedMinutes:
      number(
        trip.estimatedMinutes,
        0
      ),

    durationSeconds:
      number(
        trip.durationSeconds,
        0
      ),

    distanceMeters:
      number(
        trip.distanceMeters,
        0
      ),

    priceAmount:
      number(
        trip.priceAmount,
        0
      ),

    finalPrice:
      number(
        trip.finalPrice,
        0
      ),

    routeLocked:
      trip.routeLocked === true,

    addStopRequest:
      trip.addStopRequest || null,

    safeDriverLocation:
      driverLocation,

    driverLocationAtRequest:
      driverLocation,

    tripInProgress:
      tripIsInProgress(trip)

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

  const actualExistingStops =
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

  const dropoffAfter =
    clean(
      body.dropoffAfter
    );

  const submittedExistingStops =
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
    submittedPickup.toLowerCase() !==
    actualPickup.toLowerCase()
  ){

    throw new Error(
      "Pickup address cannot be changed"
    );

  }

  if(
    submittedDropoffBefore &&
    submittedDropoffBefore.toLowerCase() !==
    actualDropoff.toLowerCase()
  ){

    throw new Error(
      "Trip changed before this request was submitted. Reload the page and try again."
    );

  }

  if(
    submittedExistingStops.length ||
    actualExistingStops.length
  ){

    if(
      !sameAddressArray(
        submittedExistingStops,
        actualExistingStops
      )
    ){

      throw new Error(
        "Trip stops changed before this request was submitted. Reload the page and try again."
      );

    }

  }

  if(
    editedExistingStops.length !==
    actualExistingStops.length
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
    actualExistingStops.length +
    addedStops.length >
    MAX_STOPS
  ){

    throw new Error(
      `Maximum ${MAX_STOPS} total stops allowed`
    );

  }

  if(
    finalStops.length !==
    actualExistingStops.length +
    addedStops.length
  ){

    throw new Error(
      "Final stop list is invalid"
    );

  }

  const changedExistingStops =
    !sameAddressArray(
      editedExistingStops,
      actualExistingStops
    );

  const changedDropoff =
    dropoffAfter.toLowerCase() !==
    actualDropoff.toLowerCase();

  const hasAddedStops =
    addedStops.length > 0;

  if(
    !changedExistingStops &&
    !changedDropoff &&
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
      actualExistingStops,

    editedExistingStops,

    addedStops,

    finalStops

  };

}

/* =========================
   ADDED STOPS DETAILS
========================= */

function sanitizeAddedStopsDetailed(
  value,
  existingStopsCount
){

  if(!Array.isArray(value)){

    return [];

  }

  return value
    .map((stop,index)=>{

      const address =
        clean(
          stop?.address
        );

      let insertAfterIndex =
        Math.floor(
          number(
            stop?.insertAfterIndex,
            0
          )
        );

      let rowIndex =
        Math.floor(
          number(
            stop?.rowIndex,
            index
          )
        );

      insertAfterIndex =
        Math.max(
          0,
          Math.min(
            insertAfterIndex,
            existingStopsCount
          )
        );

      rowIndex =
        Math.max(
          0,
          rowIndex
        );

      return {
        address,
        insertAfterIndex,
        rowIndex
      };

    })
    .filter(
      stop=>stop.address
    )
    .slice(
      0,
      MAX_STOPS
    );

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

      return res.json({
        success:true,
        trip:
          buildSafeCustomerTrip(
            trip
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
            "Failed to load trip"
        });

    }

  }
);

/* =========================
   CONFIRM ROUTE CHANGE
========================= */

router.post(
  "/:token/confirm",
  async (req,res)=>{

    try{

      const {
        tripId,
        decoded
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
              "Trip ID does not match this Add Stop link"
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

      if(hasActiveStopRequest(trip)){

        return res
          .status(409)
          .json({
            success:false,
            message:
              "This trip already has an active route change request"
          });

      }

      const validated =
        validateRouteChangePayload(
          trip,
          body
        );

      const addedStopsDetailed =
        sanitizeAddedStopsDetailed(
          body.addedStopsDetailed,
          validated.existingStopsBefore.length
        );

      if(
        addedStopsDetailed.length !==
        validated.addedStops.length
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Added stop information is incomplete"
          });

      }

      const detailedAddresses =
        addedStopsDetailed.map(
          stop=>stop.address
        );

      if(
        !sameAddressArray(
          detailedAddresses,
          validated.addedStops
        )
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Added stop information does not match"
          });

      }

      const originalRoutePoints =
        sanitizeRoutePoints(
          body.originalRoutePoints
        );

      const newRoutePoints =
        sanitizeRoutePoints(
          body.newRoutePoints
        );

      const finalRoutePoints =
        sanitizeRoutePoints(
          body.finalRoutePoints
        );

      const driverLocation =
        extractLatLngFromObject(
          body.driverLocationAtConfirm
        ) ||
        extractLatLngFromObject(
          trip
        );

      const originalRouteData =
        sanitizeGoogleRouteData(
          body.originalRouteData
        );

      const newRouteData =
        sanitizeGoogleRouteData(
          body.newRouteData
        );

      const requestId =
        new mongoose.Types.ObjectId();

      const now =
        new Date();

      const mode =
        upper(
          body.mode ||
          (
            tripIsInProgress(trip)
              ? "IN_PROGRESS"
              : "BEFORE_START"
          )
        );

      if(
        mode !== "IN_PROGRESS" &&
        mode !== "BEFORE_START"
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Invalid route calculation mode"
          });

      }

      if(
        tripIsInProgress(trip) &&
        !driverLocation
      ){

        return res
          .status(400)
          .json({
            success:false,
            message:
              "Driver current location is required for an active trip"
          });

      }

      trip.addStopRequest = {

        requestId,

        active:true,

        source:
          "customer-email-add-stop",

        requestType:
          "CUSTOMER_ROUTE_CHANGE",

        status:
          "PENDING_REVIEW",

        calculatePriceOnReview:
          true,

        submittedBy:
          "CUSTOMER",

        submittedFrom:
          "GET_QUOTE_EMAIL",

        tokenPurpose:
          clean(
            decoded?.purpose
          ) ||
          "CUSTOMER_ADD_STOP",

        requestedAt:
          now,

        confirmedAt:
          safeDate(
            body.confirmedAt
          ),

        tripStatusAtConfirm:
          clean(
            body.tripStatusAtConfirm ||
            trip.status
          ),

        mode,

        maxStops:
          MAX_STOPS,

        pickup:
          validated.pickup,

        dropoffBefore:
          validated.dropoffBefore,

        dropoffAfter:
          validated.dropoffAfter,

        existingStopsBefore:
          validated.existingStopsBefore,

        editedExistingStops:
          validated.editedExistingStops,

        addedStops:
          validated.addedStops,

        addedStopsDetailed,

        finalStops:
          validated.finalStops,

        finalRoutePoints,

        driverLocationAtConfirm:
          driverLocation,

        beforeStopChange:{

          pickup:
            getPickup(trip),

          dropoff:
            getDropoff(trip),

          stops:
            normalizeStops(
              trip.stops
            ),

          routePoints:
            Array.isArray(
              trip.routePoints
            )
              ? trip.routePoints
              : [],

          miles:
            number(
              trip.miles,
              0
            ),

          estimatedMinutes:
            number(
              trip.estimatedMinutes,
              0
            ),

          durationSeconds:
            number(
              trip.durationSeconds,
              0
            ),

          distanceMeters:
            number(
              trip.distanceMeters,
              0
            ),

          priceAmount:
            number(
              trip.priceAmount,
              0
            ),

          finalPrice:
            number(
              trip.finalPrice,
              0
            ),

          routeLocked:
            trip.routeLocked === true,

          routeFinalized:
            trip.routeFinalized === true

        },

        originalRoutePoints,

        newRoutePoints,

        originalRemainingMiles:
          number(
            body.originalRemainingMiles,
            originalRouteData.miles
          ),

        newRemainingMiles:
          number(
            body.newRemainingMiles,
            newRouteData.miles
          ),

        extraMiles:
          number(
            body.extraMiles,
            number(
              newRouteData.miles,
              0
            ) -
            number(
              originalRouteData.miles,
              0
            )
          ),

        originalRouteData,

        newRouteData

      };

      /*
        Do not change:
        pickup
        stops
        dropoff
        miles
        price

        The request stays pending until Review.
      */

      trip.routeChangePending =
        true;

      trip.routeChangeStatus =
        "PENDING_REVIEW";

      trip.markModified(
        "addStopRequest"
      );

      await trip.save();

      return res.json({

        success:true,

        message:
          "Route change request submitted successfully",

        requestId:
          String(requestId),

        status:
          "PENDING_REVIEW"

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
            "Failed to submit route change request"
        });

    }

  }
);

/* =========================
   TOKEN CREATION ENDPOINT
   Internal use only is recommended.
   The email engine should normally
   call the exported helper instead.
========================= */

router.createCustomerAddStopToken =
  createCustomerAddStopToken;

/* =========================
   EXPORT
========================= */

module.exports = router;