"use strict";

/* GH SHARED ENGINE RULES GEO BUILD: 2026-09-06-R1 */

/*
DESTINATION PATH:
server/services/sharedEngineRules.js

PURPOSE:
Shared Engine normalization and eligibility rules.
Used by COMPANY, RESERVED, and BROKER sources.
*/

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function safeArray(value){
  return Array.isArray(value) ? value : [];
}

function normalizeAddress(value){
  return clean(value)
    .replace(/\s+/g," ")
    .trim();
}

function addressKey(value){
  return normalizeAddress(value)
    .toLowerCase()
    .replace(/[.,#]/g," ")
    .replace(/\s+/g," ")
    .trim();
}

function normalizeSource(value){
  const source = upper(value);

  if(
    source === "BROKER" ||
    source === "EXTERNAL" ||
    source === "EXTERNAL_BROKER"
  ){
    return "BROKER";
  }

  if(
    source === "RESERVED" ||
    source === "RESERVATION"
  ){
    return "RESERVED";
  }

  return "COMPANY";
}

function detectTripSource(trip,explicitSource){
  if(explicitSource){
    return normalizeSource(explicitSource);
  }

  const raw =
    trip?.sharedEngineSource ||
    trip?.externalSource ||
    trip?.source ||
    trip?.createdFrom ||
    trip?.tripSource ||
    trip?.reservationSource ||
    "";

  return normalizeSource(raw);
}

function normalizeStops(value){
  if(Array.isArray(value)){
    return value
      .map(item=>{
        if(typeof item === "string"){
          return normalizeAddress(item);
        }

        return normalizeAddress(
          item?.address ||
          item?.stopAddress ||
          item?.location ||
          ""
        );
      })
      .filter(Boolean);
  }

  const text =
    normalizeAddress(value);

  if(!text){
    return [];
  }

  return text
    .split(/\n|;|\|/g)
    .map(item=>normalizeAddress(item))
    .filter(Boolean);
}

function getTripStops(trip){
  const candidates = [
    trip?.stops,
    trip?.stopList,
    trip?.stopAddresses,
    trip?.intermediateStops
  ];

  for(const value of candidates){
    const stops = normalizeStops(value);
    if(stops.length){
      return stops;
    }
  }

  return [];
}

function getTripPickup(trip){
  return normalizeAddress(
    trip?.pickup ||
    trip?.pickupAddress ||
    trip?.pickupLocation ||
    trip?.from ||
    ""
  );
}

function getTripDropoff(trip){
  return normalizeAddress(
    trip?.dropoff ||
    trip?.dropoffAddress ||
    trip?.dropoffLocation ||
    trip?.to ||
    ""
  );
}

function getTripDate(trip){
  const value =
    trip?.tripDate ||
    trip?.serviceDate ||
    trip?.date ||
    trip?.reservationDate ||
    "";

  if(value instanceof Date){
    return value.toISOString().slice(0,10);
  }

  const text = clean(value);

  if(/^\d{4}-\d{2}-\d{2}$/.test(text)){
    return text;
  }

  const parsed = new Date(text);

  if(!Number.isNaN(parsed.getTime())){
    return parsed.toISOString().slice(0,10);
  }

  return "";
}

function normalizeTimeString(value){
  if(value === null || value === undefined){
    return "";
  }

  if(value instanceof Date){
    return value.toTimeString().slice(0,5);
  }

  let text = clean(value);

  if(!text){
    return "";
  }

  const twelveHour =
    text.match(
      /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)$/i
    );

  if(twelveHour){
    let hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2]);
    const ampm = upper(twelveHour[3]);

    if(hour === 12){
      hour = 0;
    }

    if(ampm === "PM"){
      hour += 12;
    }

    return (
      String(hour).padStart(2,"0") +
      ":" +
      String(minute).padStart(2,"0")
    );
  }

  const twentyFour =
    text.match(
      /^(\d{1,2}):(\d{2})(?::\d{2})?$/
    );

  if(twentyFour){
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);

    if(
      hour >= 0 &&
      hour <= 23 &&
      minute >= 0 &&
      minute <= 59
    ){
      return (
        String(hour).padStart(2,"0") +
        ":" +
        String(minute).padStart(2,"0")
      );
    }
  }

  const parsed = new Date(text);

  if(!Number.isNaN(parsed.getTime())){
    return parsed.toTimeString().slice(0,5);
  }

  return "";
}

function timeToMinutes(value){
  const normalized =
    normalizeTimeString(value);

  if(!normalized){
    return null;
  }

  const [hour,minute] =
    normalized
      .split(":")
      .map(Number);

  return (hour * 60) + minute;
}

function minutesToTime(value){
  if(
    value === null ||
    value === undefined ||
    !Number.isFinite(Number(value))
  ){
    return "";
  }

  let total =
    Math.round(Number(value));

  while(total < 0){
    total += 1440;
  }

  total %= 1440;

  const hour =
    Math.floor(total / 60);

  const minute =
    total % 60;

  return (
    String(hour).padStart(2,"0") +
    ":" +
    String(minute).padStart(2,"0")
  );
}

function getPickupTime(trip){
  return normalizeTimeString(
    trip?.pickupTime ||
    trip?.tripTime ||
    trip?.scheduledPickupTime ||
    trip?.time ||
    ""
  );
}

function getAppointmentTime(trip){
  return normalizeTimeString(
    trip?.appointmentTime ||
    trip?.appointment ||
    trip?.appointmentAt ||
    trip?.dropoffDeadline ||
    ""
  );
}

function getTripId(trip,index = 0){
  return clean(
    trip?._id ||
    trip?.id ||
    trip?.tripId ||
    trip?.externalTripId ||
    trip?.brokerTripId ||
    trip?.tripNumber ||
    `TRIP_${index + 1}`
  );
}

function getPassengerName(trip){
  return clean(
    trip?.clientName ||
    trip?.passengerName ||
    trip?.name ||
    trip?.memberName ||
    ""
  );
}

function normalizeTrip(trip,index = 0,explicitSource){
  const source =
    detectTripSource(
      trip,
      explicitSource
    );

  const pickup =
    getTripPickup(trip);

  const dropoff =
    getTripDropoff(trip);

  const pickupTime =
    getPickupTime(trip);

  const appointmentTime =
    getAppointmentTime(trip);

  const tripDate =
    getTripDate(trip);

  const stops =
    getTripStops(trip);

  return {
    raw:trip,
    id:getTripId(trip,index),
    source,
    tenantId:clean(trip?.tenantId),
    tripNumber:clean(
      trip?.tripNumber ||
      trip?.ghExternalTripNumber ||
      trip?.externalTripNumber ||
      ""
    ),
    brokerCode:upper(trip?.brokerCode),
    brokerName:clean(trip?.brokerName),
    passengerName:getPassengerName(trip),

    /*
      Preserve broker/company/reserved coordinates during normalization.
      Trip Split resolves and saves these on ExternalTrip before the Shared
      Engine runs. The route planner must receive them instead of dropping
      them during normalizeTrip().
    */
    pickup,
    pickupKey:addressKey(pickup),
    pickupLat:
      Number.isFinite(Number(trip?.pickupLat))
        ? Number(trip.pickupLat)
        : null,
    pickupLng:
      Number.isFinite(Number(trip?.pickupLng))
        ? Number(trip.pickupLng)
        : null,

    dropoff,
    dropoffKey:addressKey(dropoff),
    dropoffLat:
      Number.isFinite(Number(trip?.dropoffLat))
        ? Number(trip.dropoffLat)
        : null,
    dropoffLng:
      Number.isFinite(Number(trip?.dropoffLng))
        ? Number(trip.dropoffLng)
        : null,

    tripDate,
    pickupTime,
    pickupMinutes:timeToMinutes(pickupTime),
    appointmentTime,
    appointmentMinutes:timeToMinutes(appointmentTime),
    hasFixedPickup:Boolean(pickupTime),
    stops,
    hasStops:stops.length > 0
  };
}

function sourceEnabled(settings,source){
  if(settings?.enabled === false){
    return false;
  }

  const key =
    normalizeSource(source)
      .toLowerCase();

  const sourceSettings =
    settings?.sources?.[key];

  if(
    sourceSettings &&
    sourceSettings.enabled === false
  ){
    return false;
  }

  return true;
}

function eligibilityReason(trip,settings){
  if(!sourceEnabled(settings,trip.source)){
    return "SOURCE_DISABLED";
  }

  if(trip.hasStops){
    return "HAS_STOPS";
  }

  if(!trip.pickup){
    return "MISSING_PICKUP";
  }

  if(!trip.dropoff){
    return "MISSING_DROPOFF";
  }

  if(!trip.tripDate){
    return "MISSING_TRIP_DATE";
  }

  if(
    trip.pickupMinutes === null &&
    trip.appointmentMinutes === null
  ){
    return "MISSING_TIME_REFERENCE";
  }

  return "";
}

function isEligible(trip,settings){
  return !eligibilityReason(
    trip,
    settings
  );
}

module.exports = {
  clean,
  upper,
  safeArray,
  normalizeAddress,
  addressKey,
  normalizeSource,
  detectTripSource,
  normalizeStops,
  getTripStops,
  getTripPickup,
  getTripDropoff,
  getTripDate,
  normalizeTimeString,
  timeToMinutes,
  minutesToTime,
  getPickupTime,
  getAppointmentTime,
  getTripId,
  getPassengerName,
  normalizeTrip,
  sourceEnabled,
  eligibilityReason,
  isEligible
};
