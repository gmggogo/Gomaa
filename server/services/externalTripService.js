"use strict";

/*
DESTINATION PATH:
server/services/externalTripService.js

REPLACE THE PREVIOUS VERSION WITH THIS FILE.

IMPORTANT:
The EX numeric sequence is platform-wide because the existing main Trip model
has tripNumber: unique:true across the whole MongoDB collection.
The tenant does not need to appear in the visible number.
*/

const crypto = require("crypto");
const ExternalTrip = require("../models/ExternalTrip");

const {
  ensureExternalTripCoordinates
} = require("./externalTripGeoService");

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function safeArray(value){
  return Array.isArray(value) ? value : [];
}

function normalizeBrokerCode(value){

  const code =
    upper(value)
      .replace(/[^A-Z0-9]/g,"")
      .slice(0,2);

  if(code.length !== 2){
    throw new Error(
      "Broker code must be exactly two letters or numbers"
    );
  }

  return code;
}

function createDuplicateKey({
  tenantId,
  brokerCode,
  externalTripId,
  tripDate,
  tripTime,
  pickup,
  dropoff,
  clientName
}){

  const value = [
    clean(tenantId),
    normalizeBrokerCode(brokerCode),
    clean(externalTripId),
    clean(tripDate),
    clean(tripTime),
    clean(pickup).toLowerCase(),
    clean(dropoff).toLowerCase(),
    clean(clientName).toLowerCase()
  ].join("|");

  return crypto
    .createHash("sha256")
    .update(value)
    .digest("hex");
}

async function nextExternalTripNumber(brokerCode){

  const suffix =
    normalizeBrokerCode(brokerCode);

  /*
    Platform-wide sequence:
    EX-000001-MT
    EX-000002-MC
    EX-000003-SR

    This prevents collision with the current main Trip schema where
    tripNumber is globally unique.
  */
  const count =
    await ExternalTrip.countDocuments({});

  const sequence =
    String(count + 1)
      .padStart(6,"0");

  return `EX-${sequence}-${suffix}`;
}

function normalizeStop(stop,index){

  if(typeof stop === "string"){
    return {
      name:"",
      address:clean(stop),
      phone:"",
      notes:"",
      scheduledTime:"",
      sequence:index + 1,
      lat:null,
      lng:null,
      geoKey:"",
      geoAddress:"",
      geoSource:""
    };
  }

  return {
    name:clean(
      stop?.name ||
      stop?.facilityName
    ),

    address:clean(
      stop?.address ||
      stop?.location ||
      stop?.stopAddress
    ),

    phone:clean(
      stop?.phone ||
      stop?.phoneNumber
    ),

    notes:clean(
      stop?.notes ||
      stop?.instructions
    ),

    scheduledTime:clean(
      stop?.scheduledTime ||
      stop?.time
    ),

    sequence:Number(
      stop?.sequence ??
      index + 1
    ) || index + 1,

    lat:
      Number.isFinite(Number(stop?.lat))
        ? Number(stop.lat)
        : null,

    lng:
      Number.isFinite(Number(stop?.lng))
        ? Number(stop.lng)
        : null,

    geoKey:clean(stop?.geoKey),
    geoAddress:clean(stop?.geoAddress),
    geoSource:clean(stop?.geoSource)
  };
}

function normalizePassenger(passenger){

  return {
    externalPassengerId:clean(
      passenger?.externalPassengerId ||
      passenger?.passengerId ||
      passenger?.memberId
    ),

    clientName:clean(
      passenger?.clientName ||
      passenger?.passengerName ||
      passenger?.name
    ),

    clientPhone:clean(
      passenger?.clientPhone ||
      passenger?.passengerPhone ||
      passenger?.phone
    ),

    clientEmail:clean(
      passenger?.clientEmail ||
      passenger?.email
    ),

    memberId:clean(
      passenger?.memberId ||
      passenger?.medicaidId
    ),

    pickup:clean(
      passenger?.pickup ||
      passenger?.pickupAddress
    ),

    pickupLat:
      Number.isFinite(Number(passenger?.pickupLat))
        ? Number(passenger.pickupLat)
        : null,

    pickupLng:
      Number.isFinite(Number(passenger?.pickupLng))
        ? Number(passenger.pickupLng)
        : null,

    pickupGeoKey:clean(passenger?.pickupGeoKey),
    pickupGeoAddress:clean(passenger?.pickupGeoAddress),
    pickupGeoSource:clean(passenger?.pickupGeoSource),

    dropoff:clean(
      passenger?.dropoff ||
      passenger?.dropoffAddress
    ),

    dropoffLat:
      Number.isFinite(Number(passenger?.dropoffLat))
        ? Number(passenger.dropoffLat)
        : null,

    dropoffLng:
      Number.isFinite(Number(passenger?.dropoffLng))
        ? Number(passenger.dropoffLng)
        : null,

    dropoffGeoKey:clean(passenger?.dropoffGeoKey),
    dropoffGeoAddress:clean(passenger?.dropoffGeoAddress),
    dropoffGeoSource:clean(passenger?.dropoffGeoSource),

    pickupTime:clean(
      passenger?.pickupTime
    ),

    appointmentTime:clean(
      passenger?.appointmentTime
    ),

    returnTime:clean(
      passenger?.returnTime
    ),

    notes:clean(
      passenger?.notes ||
      passenger?.instructions
    )
  };
}

function normalizeExternalPayload({
  tenantId,
  tenantSlug,
  integrationId,
  brokerCode,
  brokerName,
  connectionType,
  payload,
  source="BROKER"
}){

  const p = payload || {};

  const passengers =
    safeArray(
      p.passengers
    ).map(
      normalizePassenger
    );

  const tripType =
    (
      p.tripType === "SHARED" ||
      p.isShared === true ||
      passengers.length > 1
    )
      ? "SHARED"
      : "SINGLE";

  const primaryPassenger =
    passengers[0] || {};

  const normalized = {

    tenantId,
    tenantSlug:clean(tenantSlug),

    integrationId:
      integrationId || null,

    brokerCode:
      normalizeBrokerCode(
        brokerCode
      ),

    brokerName:
      clean(brokerName),

    externalTripId:
      clean(
        p.externalTripId ||
        p.tripId ||
        p.requestId ||
        p.reservationId ||
        p.trackingNumber
      ),

    connectionType:
      upper(connectionType || "MANUAL"),

    source:
      source === "MANUAL"
        ? "MANUAL"
        : "BROKER",

    tripType,

    serviceKey:upper(
      p.serviceKey ||
      p.serviceCode ||
      p.serviceType ||
      p.modeOfTransportation
    ),

    serviceName:clean(
      p.serviceName ||
      p.modeOfTransportation
    ),

    tripDate:clean(
      p.tripDate ||
      p.date ||
      p.serviceDate
    ),

    tripTime:clean(
      p.tripTime ||
      p.pickupTime ||
      primaryPassenger.pickupTime
    ),

    appointmentTime:clean(
      p.appointmentTime ||
      primaryPassenger.appointmentTime
    ),

    returnTime:clean(
      p.returnTime ||
      primaryPassenger.returnTime
    ),

    clientName:clean(
      p.clientName ||
      p.passengerName ||
      p.memberName ||
      primaryPassenger.clientName
    ),

    clientPhone:clean(
      p.clientPhone ||
      p.passengerPhone ||
      p.phone ||
      primaryPassenger.clientPhone
    ),

    clientEmail:clean(
      p.clientEmail ||
      p.email ||
      primaryPassenger.clientEmail
    ),

    memberId:clean(
      p.memberId ||
      p.medicaidId ||
      primaryPassenger.memberId
    ),

    pickup:clean(
      p.pickup ||
      p.pickupAddress ||
      primaryPassenger.pickup
    ),

    pickupLat:
      Number.isFinite(Number(p.pickupLat))
        ? Number(p.pickupLat)
        : null,

    pickupLng:
      Number.isFinite(Number(p.pickupLng))
        ? Number(p.pickupLng)
        : null,

    pickupGeoKey:clean(p.pickupGeoKey),
    pickupGeoAddress:clean(p.pickupGeoAddress),
    pickupGeoSource:clean(p.pickupGeoSource),

    dropoff:clean(
      p.dropoff ||
      p.dropoffAddress ||
      primaryPassenger.dropoff
    ),

    dropoffLat:
      Number.isFinite(Number(p.dropoffLat))
        ? Number(p.dropoffLat)
        : null,

    dropoffLng:
      Number.isFinite(Number(p.dropoffLng))
        ? Number(p.dropoffLng)
        : null,

    dropoffGeoKey:clean(p.dropoffGeoKey),
    dropoffGeoAddress:clean(p.dropoffGeoAddress),
    dropoffGeoSource:clean(p.dropoffGeoSource),

    stops:
      safeArray(
        p.stops ||
        p.intermediateStops
      ).map(
        normalizeStop
      ),

    passengers,

    notes:clean(
      p.notes ||
      p.tripNotes ||
      p.specialInstructions ||
      p.driverInstructions
    ),

    brokerNotes:clean(
      p.brokerNotes ||
      p.notes ||
      p.tripNotes ||
      p.specialInstructions ||
      p.driverInstructions
    ),

    brokerStatus:clean(
      p.brokerStatus ||
      p.status
    ),

    lastBrokerUpdateAt:
      new Date(),

    receivedAt:
      new Date(),

    rawPayload:
      p
  };

  normalized.duplicateKey =
    createDuplicateKey(
      normalized
    );

  normalized.normalizedPayload = {
    ...normalized,
    rawPayload:undefined,
    normalizedPayload:undefined
  };

  return normalized;
}

function validateNormalizedTrip(trip){

  const errors = [];

  if(!trip.tenantId){
    errors.push("Tenant is required");
  }

  if(!trip.brokerCode){
    errors.push("Broker code is required");
  }

  if(!trip.tripDate){
    errors.push("Trip date is required");
  }

  if(!trip.tripTime){
    errors.push("Trip time is required");
  }

  if(
    trip.tripType === "SINGLE" &&
    !trip.clientName
  ){
    errors.push("Passenger name is required");
  }

  if(
    trip.tripType === "SINGLE" &&
    !trip.pickup
  ){
    errors.push("Pickup address is required");
  }

  if(
    trip.tripType === "SINGLE" &&
    !trip.dropoff
  ){
    errors.push("Drop-off address is required");
  }

  if(
    trip.tripType === "SHARED" &&
    trip.passengers.length < 2
  ){
    errors.push("Shared trip requires at least two passengers");
  }

  return errors;
}

async function findDuplicate(normalized){

  if(normalized.externalTripId){

    const byExternalId =
      await ExternalTrip.findOne({
        tenantId:
          normalized.tenantId,

        brokerCode:
          normalized.brokerCode,

        externalTripId:
          normalized.externalTripId
      });

    if(byExternalId){
      return byExternalId;
    }
  }

  return ExternalTrip.findOne({
    tenantId:
      normalized.tenantId,

    duplicateKey:
      normalized.duplicateKey
  });
}

async function createExternalTrip(options){

  const normalized =
    normalizeExternalPayload(
      options
    );

  const validationErrors =
    validateNormalizedTrip(
      normalized
    );

  if(validationErrors.length){

    const error =
      new Error(
        validationErrors.join("; ")
      );

    error.statusCode = 400;
    error.validationErrors =
      validationErrors;

    throw error;
  }

  const duplicate =
    await findDuplicate(
      normalized
    );

  if(duplicate){

    await ensureExternalTripCoordinates(
      duplicate,
      {
        save:true
      }
    );

    return {
      created:false,
      duplicate:true,
      trip:duplicate
    };
  }

  /*
    Every source reaches this same service:
    API / WEBHOOK / SFTP / FILE_IMPORT / MANUAL.
    Coordinates are resolved before the new ExternalTrip is persisted.
  */
  await ensureExternalTripCoordinates(
    normalized,
    {
      save:false
    }
  );

  for(let attempt=0; attempt<10; attempt++){

    normalized.ghExternalTripNumber =
      await nextExternalTripNumber(
        normalized.brokerCode
      );

    try{

      const trip =
        await ExternalTrip.create(
          normalized
        );

      return {
        created:true,
        duplicate:false,
        trip
      };

    }catch(err){

      if(err?.code === 11000){
        continue;
      }

      throw err;
    }
  }

  throw new Error(
    "Unable to generate a unique external trip number"
  );
}

async function applyBrokerUpdate(existingTrip,payload){

  const oldPickup =
    clean(existingTrip.pickup);

  const oldDropoff =
    clean(existingTrip.dropoff);

  const oldStops =
    JSON.stringify(
      safeArray(existingTrip.stops)
        .map(stop=>
          clean(
            stop?.address ||
            stop
          )
        )
    );

  const normalized =
    normalizeExternalPayload({
      tenantId:
        existingTrip.tenantId,

      tenantSlug:
        existingTrip.tenantSlug,

      integrationId:
        existingTrip.integrationId,

      brokerCode:
        existingTrip.brokerCode,

      brokerName:
        existingTrip.brokerName,

      connectionType:
        existingTrip.connectionType,

      payload,
      source:"BROKER"
    });

  const protectedFields =
    new Set([
      "tenantId",
      "integrationId",
      "ghExternalTripNumber",
      "brokerCode",
      "brokerName",
      "externalTripId",
      "source",
      "connectionType",
      "receivedAt",
      "rawPayload",
      "normalizedPayload",
      "duplicateKey"
    ]);

  for(const [key,value] of Object.entries(normalized)){

    if(protectedFields.has(key)){
      continue;
    }

    existingTrip[key] =
      value;
  }

  existingTrip.rawPayload =
    payload;

  existingTrip.normalizedPayload =
    normalized.normalizedPayload;

  existingTrip.lastBrokerUpdateAt =
    new Date();

  existingTrip.status =
    "UPDATED";

  const newStops =
    JSON.stringify(
      safeArray(existingTrip.stops)
        .map(stop=>
          clean(
            stop?.address ||
            stop
          )
        )
    );

  await ensureExternalTripCoordinates(
    existingTrip,
    {
      save:false,
      forcePickup:
        oldPickup !==
        clean(existingTrip.pickup),
      forceDropoff:
        oldDropoff !==
        clean(existingTrip.dropoff),
      forceStops:
        oldStops !==
        newStops,
      forcePassengers:true
    }
  );

  await existingTrip.save();

  return existingTrip;
}

async function cancelExternalTrip(existingTrip,brokerStatus="CANCELLED"){

  existingTrip.status =
    "CANCELLED";

  existingTrip.brokerStatus =
    clean(brokerStatus) || "CANCELLED";

  existingTrip.transferEligible =
    false;

  existingTrip.lastBrokerUpdateAt =
    new Date();

  await existingTrip.save();

  return existingTrip;
}

module.exports = {
  normalizeBrokerCode,
  normalizeExternalPayload,
  validateNormalizedTrip,
  createExternalTrip,
  applyBrokerUpdate,
  cancelExternalTrip
};
