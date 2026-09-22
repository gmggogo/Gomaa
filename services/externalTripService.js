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
const Service = require("../models/Service");
const Tenant = require("../models/Tenant");

const serviceIdentity =
  require("../utils/serviceIdentityResolver");

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

function normalizeServiceKey(value){

  const raw =
    clean(value);

  if(!raw){
    return "ST";
  }

  const normalized =
    serviceIdentity
      .normalizeServiceCode(
        raw
      );

  if(
    ["ST","WH","SH","TX","LM","XL"]
      .includes(normalized)
  ){
    return normalized;
  }

  /*
    CUSTOM_n is only the immutable Platform gate.
    External Trips must store/use the operational two-letter code
    such as ME once the service has been configured.
  */
  if(
    serviceIdentity
      .isCustomGate(
        normalized
      )
  ){
    return normalized;
  }

  const operational =
    serviceIdentity
      .normalizeOperationalCode(
        raw
      );

  if(operational.length === 2){
    return operational;
  }

  return normalized;
}

function serviceSuffix(value){

  const key =
    normalizeServiceKey(
      value
    );

  if(
    ["ST","WH","SH","TX","LM","XL"]
      .includes(key)
  ){
    return key;
  }

  if(
    serviceIdentity
      .isCustomGate(
        key
      )
  ){
    return "";
  }

  const operational =
    serviceIdentity
      .normalizeOperationalCode(
        key
      );

  return (
    operational.length === 2
      ? operational
      : ""
  );
}

function serviceDisplayName(value){

  const key =
    normalizeServiceKey(
      value
    );

  const names = {
    ST:"Standard",
    WH:"Wheelchair",
    SH:"Shared",
    TX:"Taxi",
    LM:"Limousine",
    XL:"XL"
  };

  return (
    names[key] ||
    clean(value) ||
    key
  );
}


function serviceMatchesInbound(
  service,
  value
){

  const raw =
    upper(value);

  const normalized =
    serviceIdentity
      .normalizeServiceCode(
        value
      );

  const operational =
    serviceIdentity
      .getServiceOperationalCode(
        service
      );

  const gate =
    serviceIdentity
      .getServiceGateKey(
        service
      );

  const aliases =
    serviceIdentity
      .getServiceMatchKeys(
        service
      );

  return (
    raw === operational ||
    normalized === operational ||
    raw === gate ||
    normalized === gate ||
    aliases.includes(raw) ||
    aliases.includes(normalized)
  );
}

async function resolveInboundTenantService(
  tenantId,
  requestedService,
  requestedName=""
){

  const [
    tenant,
    services
  ] =
    await Promise.all([
      Tenant
        .findById(
          tenantId
        )
        .select({
          allowedServices:1
        })
        .lean(),

      Service
        .find({
          tenantId
        })
        .lean()
    ]);

  const allowed =
    new Set(
      (
        Array.isArray(
          tenant?.allowedServices
        )
          ? tenant.allowedServices
          : []
      )
      .map(
        serviceIdentity
          .normalizeServiceCode
      )
      .filter(Boolean)
    );

  const candidates = [
    requestedService,
    requestedName
  ].filter(Boolean);

  let service = null;

  for(const candidate of candidates){

    service =
      services.find(
        row =>
          serviceMatchesInbound(
            row,
            candidate
          )
      ) ||
      null;

    if(service){
      break;
    }
  }

  /*
    Legacy compatibility:
    Old tenants may not yet have Service documents for the six built-ins.
    Custom services never use this fallback.
  */
  if(!service){

    const core =
      serviceIdentity
        .normalizeServiceCode(
          requestedService ||
          requestedName
        );

    if(
      ["ST","WH","SH","LM","TX","XL"]
        .includes(core)
    ){

      if(
        allowed.size &&
        !allowed.has(core)
      ){
        const err =
          new Error(
            "Broker service is not enabled for this organization"
          );

        err.statusCode = 403;
        throw err;
      }

      return {
        gateKey:core,
        operationalCode:core,
        displayName:
          serviceDisplayName(core),
        customSlot:0,
        isCustom:false,
        configured:true,
        legacy:true
      };
    }

    const err =
      new Error(
        "Broker custom service is not configured for this organization"
      );

    err.statusCode = 409;
    throw err;
  }

  const identity =
    serviceIdentity
      .resolveServiceIdentity(
        service
      );

  if(
    identity.isCustom &&
    identity.configured !== true
  ){
    const err =
      new Error(
        "Broker custom service is not configured"
      );

    err.statusCode = 409;
    throw err;
  }

  if(
    identity.isCustom
      ? !allowed.has(
          identity.gateKey
        )
      : (
          allowed.size &&
          !allowed.has(
            identity.gateKey
          )
        )
  ){
    const err =
      new Error(
        "Broker service is not enabled for this organization"
      );

    err.statusCode = 403;
    throw err;
  }

  if(!identity.operationalCode){
    const err =
      new Error(
        "Broker service code is not configured"
      );

    err.statusCode = 409;
    throw err;
  }

  return {
    gateKey:
      identity.gateKey,

    operationalCode:
      identity.operationalCode,

    displayName:
      identity.displayName ||
      identity.operationalCode,

    customSlot:
      identity.customSlot,

    isCustom:
      identity.isCustom,

    configured:
      identity.configured,

    legacy:false
  };
}

function applyResolvedServiceSnapshot(
  normalized,
  resolvedService
){

  const operational =
    clean(
      resolvedService
        ?.operationalCode
    )
    .toUpperCase();

  const displayName =
    clean(
      resolvedService
        ?.displayName
    ) ||
    operational;

  normalized.serviceKey =
    operational;

  normalized.serviceCode =
    operational;

  normalized.serviceName =
    displayName;

  normalized.serviceTitle =
    displayName;

  normalized.serviceIdentity =
    clean(
      resolvedService
        ?.gateKey
    )
    .toUpperCase();

  normalized.customServiceSlot =
    Number(
      resolvedService
        ?.customSlot ||
      0
    );

  normalized.serviceSuffix =
    operational;

  normalized.tripNumberSuffix =
    operational;

  /*
    duplicateKey / normalizedPayload were created before tenant service
    resolution, so rebuild both after the canonical service identity is known.
  */
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

async function nextExternalTripNumber(
  brokerCode,
  sequenceOffset = 0
){

  const broker =
    normalizeBrokerCode(brokerCode);

  /*
    NEUTRAL BROKER INTAKE NUMBER

    External Trips / Trip Split / Broker Review before Confirm:
    MT-000001
    MC-000002

    The service suffix is NOT attached here because the trip may still
    return to Trip Split and become Shared.

    Broker Review Confirm is the only place that finalizes the suffix:
    ST / Standard       => -ST
    TX / Taxi           => -TX
    XL                  => -XL
    SH / Shared         => -SH
    Custom operational  => e.g. -ME
  */
  const count =
    await ExternalTrip.countDocuments({});

  const sequence =
    String(
      count +
      1 +
      Number(sequenceOffset || 0)
    ).padStart(6,"0");

  return `${broker}-${sequence}`;
}

function replaceExternalTripServiceSuffix(
  tripNumber,
  serviceKey
){

  const value =
    upper(tripNumber);

  if(!value){
    return "";
  }

  const suffix =
    serviceSuffix(serviceKey);

  if(!suffix){
    return value;
  }

  const match =
    value.match(
      /^([A-Z0-9]{2})-(\d{6})-[A-Z0-9]+(-R)?$/
    );

  if(!match){
    return value;
  }

  return `${match[1]}-${match[2]}-${suffix}${match[3] || ""}`;
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

  /*
    External Trips Hub is intake only.
    Shared grouping is decided later in Trip Split.
  */
  const tripType =
    "SINGLE";

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

    serviceKey:normalizeServiceKey(
      p.serviceKey ||
      p.serviceCode ||
      p.serviceType ||
      p.modeOfTransportation ||
      "ST"
    ),

    serviceName:clean(
      p.serviceName ||
      p.modeOfTransportation ||
      serviceDisplayName(
        p.serviceKey ||
        p.serviceCode ||
        p.serviceType ||
        p.modeOfTransportation ||
        "ST"
      )
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

  if(
    serviceIdentity
      .isCustomGate(
        trip?.serviceKey
      )
  ){
    errors.push(
      "Custom service requires its configured two-letter service code"
    );
  }

  const resolvedServiceSuffix =
    serviceSuffix(
      trip?.serviceKey
    );

  if(!resolvedServiceSuffix){
    errors.push(
      "Invalid or unconfigured service code"
    );
  }

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

  const resolvedService =
    await resolveInboundTenantService(
      normalized.tenantId,
      normalized.serviceKey,
      normalized.serviceName
    );

  applyResolvedServiceSnapshot(
    normalized,
    resolvedService
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
        normalized.brokerCode,
        attempt
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

  const incomingPayload = {
    ...(payload || {})
  };

  const hasServiceUpdate =
    [
      incomingPayload.serviceKey,
      incomingPayload.serviceCode,
      incomingPayload.serviceType,
      incomingPayload.modeOfTransportation,
      incomingPayload.serviceName
    ]
    .some(
      value =>
        Boolean(
          clean(value)
        )
    );

  if(!hasServiceUpdate){

    incomingPayload.serviceKey =
      existingTrip.serviceKey ||
      existingTrip.serviceCode ||
      "ST";

    incomingPayload.serviceName =
      existingTrip.serviceName ||
      existingTrip.serviceTitle ||
      "";
  }

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

      payload:
        incomingPayload,
      source:"BROKER"
    });

  const resolvedService =
    await resolveInboundTenantService(
      normalized.tenantId,
      normalized.serviceKey,
      normalized.serviceName
    );

  applyResolvedServiceSnapshot(
    normalized,
    resolvedService
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
    incomingPayload;

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
  normalizeServiceKey,
  serviceSuffix,
  serviceDisplayName,
  resolveInboundTenantService,
  applyResolvedServiceSnapshot,
  replaceExternalTripServiceSuffix,
  normalizeExternalPayload,
  validateNormalizedTrip,
  createExternalTrip,
  applyBrokerUpdate,
  cancelExternalTrip
};
