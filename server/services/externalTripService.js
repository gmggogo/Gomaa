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

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function safeArray(value){
  return Array.isArray(value) ? value : [];
}

function visibleBrokerPrefix({
  brokerName,
  brokerCode
}){
  const source =
    upper(
      brokerName ||
      brokerCode
    )
      .replace(/[^A-Z0-9]/g,"");

  const prefix =
    source.slice(0,3);

  if(prefix.length >= 2){
    return prefix;
  }

  return (
    upper(brokerCode)
      .replace(/[^A-Z0-9]/g,"")
      .padEnd(3,"X")
      .slice(0,3)
  );
}

function normalizeServiceKey(value){
  const raw =
    upper(value)
      .replace(/[_-]+/g," ")
      .replace(/\s+/g," ")
      .trim();

  if(!raw){
    return "STANDARD";
  }

  if(
    raw === "ST" ||
    raw === "STD" ||
    raw.includes("STANDARD")
  ){
    return "STANDARD";
  }

  if(
    raw === "SH" ||
    raw.includes("SHARED")
  ){
    return "SHARED";
  }

  return raw
    .replace(/\s+/g,"_");
}

function serviceSuffix(value){
  const key =
    normalizeServiceKey(
      value
    );

  if(key === "STANDARD"){
    return "ST";
  }

  if(key === "SHARED"){
    return "SH";
  }

  const compact =
    key.replace(/[^A-Z0-9]/g,"");

  return (
    compact.slice(0,2) ||
    "ST"
  ).padEnd(2,"X");
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

async function nextExternalTripNumber({
  brokerName,
  brokerCode,
  serviceKey
}){

  const brokerPrefix =
    visibleBrokerPrefix({
      brokerName,
      brokerCode
    });

  const suffix =
    serviceSuffix(
      serviceKey
    );

  /*
    Platform-wide sequence examples:
    MTM-000001-ST
    MTM-000002-SH
    MOD-000003-ST

    The numeric sequence remains platform-wide so ghExternalTripNumber
    stays unique across the full ExternalTrip collection.
  */
  const count =
    await ExternalTrip.countDocuments({});

  const sequence =
    String(count + 1)
      .padStart(6,"0");

  return `${brokerPrefix}-${sequence}-${suffix}`;
}

function normalizeStop(stop,index){

  if(typeof stop === "string"){
    return {
      name:"",
      address:clean(stop),
      phone:"",
      notes:"",
      scheduledTime:"",
      sequence:index + 1
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
    ) || index + 1
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

    dropoff:clean(
      passenger?.dropoff ||
      passenger?.dropoffAddress
    ),

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

    serviceKey:
      normalizeServiceKey(
        p.serviceKey ||
        p.serviceCode ||
        p.serviceType ||
        p.modeOfTransportation ||
        "STANDARD"
      ),

    serviceName:clean(
      p.serviceName ||
      p.modeOfTransportation ||
      "Standard"
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

    dropoff:clean(
      p.dropoff ||
      p.dropoffAddress ||
      primaryPassenger.dropoff
    ),

    stops:
      safeArray(
        p.stops ||
        p.intermediateStops
      )
      .slice(0,5)
      .map(
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
    return {
      created:false,
      duplicate:true,
      trip:duplicate
    };
  }

  for(let attempt=0; attempt<10; attempt++){

    normalized.ghExternalTripNumber =
      await nextExternalTripNumber({
        brokerName:
          normalized.brokerName,
        brokerCode:
          normalized.brokerCode,
        serviceKey:
          normalized.serviceKey
      });

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
  normalizeServiceKey,
  serviceSuffix,
  visibleBrokerPrefix,
  normalizeExternalPayload,
  validateNormalizedTrip,
  createExternalTrip,
  applyBrokerUpdate,
  cancelExternalTrip
};
