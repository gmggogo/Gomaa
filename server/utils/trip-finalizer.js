// =========================================
// FILE: server/utils/trip-finalizer.js
// SINGLE SOURCE OF TRUTH
// CONFIRM / COMPLETE / NOSHOW / CANCEL
// INDIVIDUAL + SHARED
// =========================================

const sharedRouteEngine =
  require("./sharedRouteEngine");

/* =========================================
BASIC HELPERS
========================================= */

function n(v){
  return Number(v || 0);
}

function clean(v){
  return String(v ?? "").trim();
}

function cleanStatus(v){
  return clean(v)
    .replace(/\s+/g,"")
    .toLowerCase();
}

function normalizeAddress(v){
  return clean(v)
    .replace(/\s+/g," ")
    .trim();
}

function isSharedTrip(trip){

  if(!trip){
    return false;
  }

  const serviceKey =
    clean(
      trip.serviceKey ||
      trip.serviceCode ||
      trip.serviceType ||
      trip.tripNumberSuffix ||
      ""
    ).toUpperCase();

  return (
    trip.isShared === true ||
    trip.tripType === "SHARED" ||
    serviceKey === "SH"
  );
}

function isPassengerActive(passenger){

  const status =
    cleanStatus(passenger?.status);

  return (
    !status.includes("cancel") &&
    !status.includes("noshow") &&
    !status.includes("no-show") &&
    normalizeAddress(passenger?.pickup) &&
    normalizeAddress(passenger?.dropoff)
  );
}

function buildIndividualRoutePoints(trip){

  return [
    trip.pickup,
    ...(Array.isArray(trip.stops) ? trip.stops : []),
    trip.dropoff
  ]
  .map(normalizeAddress)
  .filter(Boolean);
}

/* =========================================
CONFIRM ROUTE PREP
This does not calculate price.
This does not call Google Directions.
It only prepares route order.
========================================= */

function prepareConfirmRoute(trip, options = {}){

  if(!trip){
    throw new Error("Trip Missing");
  }

  const shared =
    isSharedTrip(trip);

  if(shared){

    const passengers =
      Array.isArray(trip.passengers)
        ? trip.passengers
        : [];

    const sharedRoute =
      sharedRouteEngine
        .buildSharedRouteFromSavedCoordinates(
          passengers,
          {
            debug:options.debug === true
          }
        );

    if(
      !Array.isArray(sharedRoute.routePoints) ||
      sharedRoute.routePoints.length < 2
    ){
      throw new Error("Shared route is missing pickup/dropoff");
    }

    return {
      isShared:true,

      routePoints:
        sharedRoute.routePoints,

      passengers:
        sharedRoute.passengers,

      activeCount:
        sharedRoute.activeCount || passengers.filter(isPassengerActive).length || 1,

      sharedStopsCount:
        sharedRoute.sharedStopsCount || 0,

      routeMeta:{
        anchorPickup:
          sharedRoute.anchorPickup || null,

        anchorDropoff:
          sharedRoute.anchorDropoff || null,

        anchorMiles:
          n(sharedRoute.anchorMiles),

        virtualCenter:
          sharedRoute.virtualCenter || null,

        orderedPickups:
          sharedRoute.orderedPickups || [],

        orderedDropoffs:
          sharedRoute.orderedDropoffs || []
      }
    };
  }

  const routePoints =
    buildIndividualRoutePoints(trip);

  if(routePoints.length < 2){
    throw new Error("Route is missing pickup/dropoff");
  }

  return {
    isShared:false,
    routePoints,
    passengers:[],
    activeCount:1,
    sharedStopsCount:0,
    routeMeta:null
  };
}

/* =========================================
LOCK CONFIRMED TRIP
Call this after:
1. prepareConfirmRoute()
2. routeMapEngine calculates miles/minutes
3. pricing engine calculates final price
========================================= */

async function lockConfirmedTrip(
  trip,
  data = {}
){

  if(!trip){
    throw new Error("Trip Missing");
  }

  const isShared =
    data.isShared === true ||
    isSharedTrip(trip);

  const routePoints =
    Array.isArray(data.routePoints)
      ? data.routePoints.map(normalizeAddress).filter(Boolean)
      : [];

  if(routePoints.length < 2){
    throw new Error("Cannot confirm trip without route points");
  }

  const routeData =
    data.routeData || {};

  const passengers =
    Array.isArray(data.passengers)
      ? data.passengers
      : Array.isArray(trip.passengers)
        ? trip.passengers
        : [];

  const priceAmount =
    n(data.priceAmount ?? data.finalPrice);

  const pricePerPassenger =
    n(data.pricePerPassenger);

  const activeCount =
    Math.max(1,n(data.activeCount || 1));

  const sharedStopsCount =
    isShared
      ? Math.max(0,n(data.sharedStopsCount))
      : 0;

  trip.status =
    "Confirmed";

  trip.reservationStatus =
    data.reservationStatus || trip.reservationStatus || "RV";

  trip.reviewOnly =
    false;

  trip.dispatchSelected =
    true;

  trip.disabled =
    false;

  trip.isShared =
    isShared;

  trip.tripType =
    isShared ? "SHARED" : "INDIVIDUAL";

  trip.routePoints =
    routePoints;

  trip.googleRoute =
    routeData.googleRoute || {};

  trip.optimizedRoute =
    routeData.googleRoute || {};

  trip.miles =
    n(routeData.miles);

  trip.distanceMeters =
    n(routeData.distanceMeters);

  trip.durationSeconds =
    n(routeData.durationSeconds);

  trip.estimatedMinutes =
    n(routeData.estimatedMinutes);

  trip.priceAmount =
    priceAmount;

  trip.finalPrice =
    priceAmount;

  trip.pricePerPassenger =
    pricePerPassenger;

  trip.routeLocked =
    true;

  trip.routeFinalized =
    true;

  trip.routeSource =
    data.routeSource || "server-shared-route-engine";

  trip.routeUpdatedAt =
    new Date();

  trip.confirmedAt =
    new Date();

  if(isShared){

    trip.passengers =
      passengers;

    trip.totalPassengers =
      passengers.length;

    trip.passengerCount =
      passengers.length;

    trip.passengersCount =
      passengers.length;

    trip.sharedStopsCount =
      sharedStopsCount;

    trip.sharedStopTotal =
      n(data.sharedStopTotal);

    trip.sharedStopShare =
      n(data.sharedStopShare);

    trip.sharedRouteMeta =
      data.routeMeta || null;

    trip.pickup =
      routePoints[0] || trip.pickup || "";

    trip.dropoff =
      routePoints[routePoints.length - 1] || trip.dropoff || "";

    trip.stops =
      [];

  }else{

    trip.stops =
      Array.isArray(trip.stops)
        ? trip.stops
        : [];
  }

  if(data.cancelFee !== undefined){
    trip.cancelFee =
      n(data.cancelFee);
  }

  if(data.noShowFee !== undefined){
    trip.noShowFee =
      n(data.noShowFee);
  }

  if(data.pricingSnapshot){
    trip.reservedPriceSnapshot =
      data.pricingSnapshot;
  }

  if(data.reservedPricingMode){
    trip.reservedPricingMode =
      data.reservedPricingMode;
  }

  await trip.save();

  return trip;
}

/* =========================================
INDIVIDUAL FINALIZATION
COMPLETE / NOSHOW / CANCEL
========================================= */

async function finalizeIndividualTrip(
  trip,
  action,
  options = {}
){

  if(!trip){
    throw new Error("Trip Missing");
  }

  const finalPrice =
    n(options.finalPrice);

  const cancelFee =
    n(options.cancelFee);

  const noShowFee =
    n(options.noShowFee);

  const refundAmount =
    n(options.refundAmount);

  switch(
    String(action || "")
      .toUpperCase()
  ){

    case "COMPLETE":

      trip.status =
        "Completed";

      trip.finalPrice =
        finalPrice;

      trip.isFinalized =
        true;

      trip.finalizedAt =
        new Date();

      break;

    case "NOSHOW":

      trip.status =
        "No Show";

      trip.noShowFee =
        noShowFee;

      trip.finalPrice =
        noShowFee;

      trip.isFinalized =
        true;

      trip.finalizedAt =
        new Date();

      break;

    case "CANCEL":

      trip.status =
        "Cancelled";

      trip.cancelFee =
        cancelFee;

      trip.finalPrice =
        cancelFee;

      trip.refundAmount =
        refundAmount;

      trip.cancelDateTime =
        new Date();

      trip.isFinalized =
        true;

      trip.finalizedAt =
        new Date();

      break;

    default:

      throw new Error(
        "Unknown Action"
      );
  }

  await trip.save();

  return trip;
}

/* =========================================
SHARED PASSENGER FINALIZATION
COMPLETE / NOSHOW / CANCEL
========================================= */

async function finalizeSharedPassenger(
  trip,
  passengerId,
  action,
  options = {}
){

  if(!trip){
    throw new Error(
      "Trip Missing"
    );
  }

  const passenger =
    (trip.passengers || [])
      .find(p =>
        String(p.passengerId) ===
        String(passengerId)
      );

  if(!passenger){
    throw new Error(
      "Passenger Missing"
    );
  }

  const finalPrice =
    n(options.finalPrice);

  const cancelFee =
    n(options.cancelFee);

  const noShowFee =
    n(options.noShowFee);

  switch(
    String(action || "")
      .toUpperCase()
  ){

    case "COMPLETE":

      passenger.status =
        "Completed";

      passenger.finalPrice =
        finalPrice;

      passenger.isFinalized =
        true;

      passenger.finalizedAt =
        new Date();

      break;

    case "NOSHOW":

      passenger.status =
        "No Show";

      passenger.noShowFee =
        noShowFee;

      passenger.finalPrice =
        noShowFee;

      passenger.isFinalized =
        true;

      passenger.finalizedAt =
        new Date();

      break;

    case "CANCEL":

      passenger.status =
        "Cancelled";

      passenger.cancelFee =
        cancelFee;

      passenger.finalPrice =
        cancelFee;

      passenger.isFinalized =
        true;

      passenger.finalizedAt =
        new Date();

      break;

    default:

      throw new Error(
        "Unknown Action"
      );
  }

  trip.groupTotal =
    calculateGroupTotal(trip);

  const totalPassengers =
    trip.passengers.length;

  const completedCount =
    trip.passengers.filter(
      p => p.status === "Completed"
    ).length;

  const cancelledCount =
    trip.passengers.filter(
      p => p.status === "Cancelled"
    ).length;

  const noShowCount =
    trip.passengers.filter(
      p => p.status === "No Show"
    ).length;

  if(completedCount === totalPassengers){

    trip.groupStatus =
      "Completed";

  }else if(cancelledCount === totalPassengers){

    trip.groupStatus =
      "Cancelled";

  }else if(noShowCount === totalPassengers){

    trip.groupStatus =
      "No Show";

  }else{

    trip.groupStatus =
      "Mixed";
  }

  await trip.save();

  return trip;
}

/* =========================================
HELPERS
========================================= */

function calculateGroupTotal(trip){

  return (
    trip.passengers || []
  ).reduce((sum,p)=>{

    return (
      sum +
      n(p.finalPrice)
    );

  },0);
}

/* =========================================
EXPORTS
========================================= */

module.exports = {

  prepareConfirmRoute,
  lockConfirmedTrip,

  finalizeIndividualTrip,
  finalizeSharedPassenger,

  calculateGroupTotal,

  isSharedTrip,
  buildIndividualRoutePoints
};