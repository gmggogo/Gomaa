"use strict";

/*
DESTINATION PATH:
server/services/externalTransferService.js

REPLACE THE PREVIOUS VERSION WITH THIS FILE.

PURPOSE:
Bridge from External Trips Hub to the EXISTING Trip model defined inside server.js.

IMPORTANT:
There is no server/models/Trip.js in the current project.
This service uses mongoose.models.Trip after server.js has registered the model.

MOUNT ORDER REQUIREMENT:
External transfer routes must be mounted AFTER:
  mongoose.model("Trip", tripSchema)
inside server.js.
*/

const mongoose =
  require("mongoose");

const ExternalTrip =
  require("../models/ExternalTrip");

const Service =
  require("../models/Service");

const Tenant =
  require("../models/Tenant");

const serviceIdentity =
  require("../utils/serviceIdentityResolver");

function clean(value){
  return String(value ?? "").trim();
}

function mainTripModel(){

  const Trip =
    mongoose.models.Trip;

  if(!Trip){
    throw new Error(
      "Trip model is not registered yet. Mount External Transfer routes after the Trip model in server.js."
    );
  }

  return Trip;
}

function normalizeService(value){

  return (
    serviceIdentity
      .normalizeServiceCode(
        value
      )
  );
}

function serviceSuffix(value){

  const operational =
    serviceIdentity
      .normalizeOperationalCode(
        value
      );

  if(operational.length === 2){
    return operational;
  }

  const normalized =
    normalizeService(value);

  const coreMap = {
    ST:"ST",
    STANDARD:"ST",
    SH:"SH",
    SHARED:"SH",
    WH:"WH",
    WC:"WH",
    WHEELCHAIR:"WH",
    TX:"TX",
    TAXI:"TX",
    LM:"LM",
    LIMO:"LM",
    LIMOUSINE:"LM",
    XL:"XL"
  };

  return (
    coreMap[normalized] ||
    ""
  );
}

function externalServiceInput(
  externalTrip
){

  return clean(
    externalTrip?.serviceKey ||
    externalTrip?.serviceCode ||
    externalTrip?.serviceType ||
    externalTrip?.serviceName
  );
}

function serviceMatchesExternal(
  service,
  value
){

  const raw =
    clean(value)
      .toUpperCase();

  const normalized =
    serviceIdentity
      .normalizeServiceCode(
        value
      );

  const gate =
    serviceIdentity
      .getServiceGateKey(
        service
      );

  const operational =
    serviceIdentity
      .getServiceOperationalCode(
        service
      );

  const aliases =
    serviceIdentity
      .getServiceMatchKeys(
        service
      );

  return (
    raw === gate ||
    normalized === gate ||
    raw === operational ||
    normalized === operational ||
    aliases.includes(raw) ||
    aliases.includes(normalized)
  );
}

async function resolveExternalService(
  externalTrip
){

  if(
    String(
      externalTrip?.tripType ||
      ""
    ).toUpperCase() ===
    "SHARED"
  ){
    return {
      service:null,
      gateKey:"SH",
      operationalCode:"SH",
      displayName:"Shared",
      customSlot:0,
      isCustom:false,
      legacy:false
    };
  }

  const tenantId =
    externalTrip?.tenantId;

  const input =
    externalServiceInput(
      externalTrip
    );

  if(!input){
    const error =
      new Error(
        "External trip service is missing"
      );

    error.statusCode = 400;
    throw error;
  }

  const [
    services,
    tenant
  ] =
    await Promise.all([
      Service
        .find({
          tenantId
        })
        .lean(),

      Tenant
        .findById(
          tenantId
        )
        .select({
          allowedServices:1
        })
        .lean()
    ]);

  const service =
    services.find(
      row =>
        serviceMatchesExternal(
          row,
          input
        )
    ) ||
    null;

  /*
    Preserve old broker integrations for the six built-in services
    even if an old tenant does not yet have a Service document.
  */
  if(!service){

    const normalized =
      serviceIdentity
        .normalizeServiceCode(
          input
        );

    const coreAliases = {
      ST:"ST",
      STANDARD:"ST",
      WH:"WH",
      WC:"WH",
      WHEELCHAIR:"WH",
      SH:"SH",
      SHARED:"SH",
      TX:"TX",
      TAXI:"TX",
      LM:"LM",
      LIMO:"LM",
      LIMOUSINE:"LM",
      XL:"XL"
    };

    const operationalCode =
      coreAliases[normalized] ||
      "";

    if(operationalCode){

      return {
        service:null,
        gateKey:
          operationalCode,
        operationalCode,
        displayName:
          clean(
            externalTrip
              ?.serviceName
          ) ||
          operationalCode,
        customSlot:0,
        isCustom:false,
        legacy:true
      };
    }

    const error =
      new Error(
        "External custom service is not configured for this company: " +
        input
      );

    error.statusCode = 409;
    throw error;
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

    const error =
      new Error(
        "External custom service is not configured"
      );

    error.statusCode = 409;
    throw error;
  }

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

  if(
    identity.gateKey &&
    !allowed.has(
      identity.gateKey
    )
  ){

    const error =
      new Error(
        "External service is not enabled for this company"
      );

    error.statusCode = 403;
    throw error;
  }

  if(
    !identity.operationalCode
  ){

    const error =
      new Error(
        "External service code is not configured"
      );

    error.statusCode = 409;
    throw error;
  }

  return {
    service,
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
    legacy:false
  };
}


function neutralTripNumber(value){
  const raw =
    clean(value)
      .toUpperCase();

  if(!raw){
    return "";
  }

  return raw.replace(
    /-(ST|SH|WH|WC|TX|LM|XL)(-R)?$/,
    (_match,_suffix,returnPart)=>
      returnPart || ""
  );
}

function finalTripNumber(value,service){
  const neutral =
    neutralTripNumber(value);

  const suffix =
    serviceSuffix(service);

  if(!suffix){
    throw new Error(
      "Trip service suffix is not configured"
    );
  }

  if(neutral.endsWith("-R")){
    return (
      neutral.slice(0,-2) +
      `-${suffix}-R`
    );
  }

  return `${neutral}-${suffix}`;
}

function mapStops(externalTrip){

  return (
    Array.isArray(
      externalTrip.stops
    )
      ? externalTrip.stops
      : []
  )
  .map(stop => {

    if(typeof stop === "string"){
      return clean(stop);
    }

    return clean(
      stop?.address
    );
  })
  .filter(Boolean);
}

function mapSharedPassengers(externalTrip){

  const source =
    Array.isArray(
      externalTrip.passengers
    )
      ? externalTrip.passengers
      : [];

  return source.map(
    (p,index) => ({
      passengerId:
        clean(
          p?.externalPassengerId
        ) ||
        `P${index + 1}`,

      name:
        clean(
          p?.clientName
        ),

      phone:
        clean(
          p?.clientPhone
        ),

      clientName:
        clean(
          p?.clientName
        ),

      clientPhone:
        clean(
          p?.clientPhone
        ),

      pickup:
        clean(
          p?.pickup
        ),

      dropoff:
        clean(
          p?.dropoff
        ),

      status:
        "Scheduled",

      source:
        "EXTERNAL",

      bookingSource:
        clean(
          externalTrip.brokerName
        ),

      routeOrder:
        index + 1,

      pickupOrder:
        index + 1,

      dropoffOrder:
        index + 1
    })
  );
}

function buildMainTripPayload(
  externalTrip,
  resolvedService
){

  const isShared =
    externalTrip.tripType === "SHARED";

  const serviceCode =
    isShared
      ? "SH"
      : clean(
          resolvedService
            ?.operationalCode
        );

  const serviceName =
    isShared
      ? "Shared"
      : (
          clean(
            resolvedService
              ?.displayName
          ) ||
          serviceCode
        );

  const serviceGate =
    isShared
      ? "SH"
      : clean(
          resolvedService
            ?.gateKey
        );

  const passengers =
    isShared
      ? mapSharedPassengers(
          externalTrip
        )
      : [];

  const firstPassenger =
    passengers[0] || {};

  const lastPassenger =
    passengers[
      passengers.length - 1
    ] || {};

  const pickup =
    isShared
      ? (
          clean(
            firstPassenger.pickup
          ) ||
          clean(
            externalTrip.pickup
          )
        )
      : clean(
          externalTrip.pickup
        );

  const dropoff =
    isShared
      ? (
          clean(
            lastPassenger.dropoff
          ) ||
          clean(
            externalTrip.dropoff
          )
        )
      : clean(
          externalTrip.dropoff
        );

  return {
    tenantId:
      externalTrip.tenantId,

    tenantSlug:
      clean(
        externalTrip.tenantSlug
      ),

    /*
      GH keeps the EX number as the real tripNumber.
      Example:
      EX-000123-MT
    */
    tripNumber:
      finalTripNumber(
        externalTrip.ghExternalTripNumber,
        serviceCode
      ),

    type:
      isShared
        ? "shared"
        : "company",

    company:
      "",

    entryName:
      clean(
        externalTrip.brokerName
      ),

    entryPhone:
      "",

    clientName:
      isShared
        ? "Shared Trip"
        : clean(
            externalTrip.clientName
          ),

    clientPhone:
      isShared
        ? ""
        : clean(
            externalTrip.clientPhone
          ),

    clientEmail:
      isShared
        ? ""
        : clean(
            externalTrip.clientEmail
          ),

    serviceType:
      serviceCode,

    serviceKey:
      serviceCode,

    serviceCode:
      serviceCode,

    serviceName:
      serviceName,

    serviceTitle:
      serviceName,

    /*
      Stable Platform identity snapshot for custom services.
      Core services simply use their normal two-letter key here.
    */
    serviceIdentity:
      serviceGate,

    customServiceSlot:
      Number(
        resolvedService
          ?.customSlot ||
        0
      ),

    tripNumberSuffix:
      serviceCode,

    vehicleTypeFromQuote:
      serviceCode,

    pickup,
    dropoff,

    stops:
      mapStops(
        externalTrip
      ),

    isShared,

    groupId:
      isShared
        ? `EXT-${String(
            externalTrip._id
          )}`
        : "",

    tripType:
      isShared
        ? "SHARED"
        : "INDIVIDUAL",

    sharedSuffix:
      isShared
        ? "SH"
        : "",

    passengers,

    totalPassengers:
      isShared
        ? passengers.length
        : 1,

    tripDate:
      clean(
        externalTrip.tripDate
      ),

    tripTime:
      clean(
        externalTrip.tripTime
      ),

    notes:
      clean(
        externalTrip.notes
      ),

    /*
      The main GH Trips Hub already handles Scheduled trips.
      External transfer does not bypass the normal operating flow.
    */
    status:
      "Scheduled",

    dispatchSelected:
      false,

    disabled:
      false,

    source:
      "EXTERNAL",

    bookingSource:
      clean(
        externalTrip.brokerName
      ),

    bookedAt:
      externalTrip.receivedAt ||
      new Date(),

    createdAt:
      new Date()
  };
}

async function transferExternalTrip({
  externalTripId,
  tenantId
}){

  const Trip =
    mainTripModel();

  const externalTrip =
    await ExternalTrip.findOne({
      _id:externalTripId,
      tenantId
    });

  if(!externalTrip){

    const error =
      new Error(
        "External trip not found"
      );

    error.statusCode = 404;
    throw error;
  }

  if(
    externalTrip.transferredToTripsHub
  ){
    return {
      transferred:false,
      alreadyTransferred:true,
      externalTrip
    };
  }

  if(
    externalTrip.transferEligible !== true
  ){

    const error =
      new Error(
        "External trip is not eligible for transfer"
      );

    error.statusCode = 409;
    throw error;
  }

  if(
    [
      "CANCELLED",
      "REJECTED",
      "ERROR"
    ].includes(
      externalTrip.status
    )
  ){

    const error =
      new Error(
        "External trip cannot be transferred in its current status"
      );

    error.statusCode = 409;
    throw error;
  }

  /*
    Resolve the tenant service before transfer.
    Broker pricing remains independent; this step only locks the
    service identity/name/code that the GH Trip will carry.
  */
  const resolvedService =
    await resolveExternalService(
      externalTrip
    );

  /*
    tripNumber is globally unique in the current Trip schema,
    so this check is enough to make transfer idempotent.
  */
  const expectedTripNumber =
    finalTripNumber(
      externalTrip.ghExternalTripNumber,
      resolvedService
        .operationalCode
    );

  const existingMainTrip =
    await Trip.findOne({
      tripNumber:
        expectedTripNumber
    });

  if(existingMainTrip){

    externalTrip.transferredToTripsHub =
      true;

    externalTrip.transferredTripId =
      existingMainTrip._id;

    externalTrip.transferredAt =
      externalTrip.transferredAt ||
      new Date();

    externalTrip.status =
      "TRANSFERRED";

    await externalTrip.save();

    return {
      transferred:false,
      alreadyTransferred:true,
      trip:existingMainTrip,
      externalTrip,
      serviceIdentity:
        resolvedService
    };
  }

  const payload =
    buildMainTripPayload(
      externalTrip,
      resolvedService
    );

  const trip =
    await Trip.create(
      payload
    );

  /*
    Reuse the current server's central coordinate repair engine if available.
    It fills pickup/drop-off/stops coordinates and saves them on the Trip.
  */
  if(
    typeof global.ensureTripCoords ===
    "function"
  ){
    await global.ensureTripCoords(
      trip
    );
  }

  externalTrip.transferredToTripsHub =
    true;

  externalTrip.transferredTripId =
    trip._id;

  externalTrip.transferredAt =
    new Date();

  externalTrip.status =
    "TRANSFERRED";

  await externalTrip.save();

  return {
    transferred:true,
    alreadyTransferred:false,
    trip,
    externalTrip,
    serviceIdentity:
      resolvedService
  };
}

async function transferDueExternalTrips({
  tenantId,
  tripDate
}){

  const filter = {
    tenantId,
    transferredToTripsHub:false,
    transferEligible:true,
    status:{
      $in:[
        "RECEIVED",
        "READY",
        "UPDATED"
      ]
    }
  };

  if(tripDate){
    filter.tripDate =
      clean(tripDate);
  }

  const candidates =
    await ExternalTrip.find(
      filter
    )
    .sort({
      tripDate:1,
      tripTime:1
    });

  const results = [];

  for(const trip of candidates){

    try{

      results.push(
        await transferExternalTrip({
          externalTripId:
            trip._id,

          tenantId
        })
      );

    }catch(err){

      results.push({
        transferred:false,
        externalTripId:
          trip._id,
        error:
          err.message
      });
    }
  }

  return results;
}

module.exports = {
  buildMainTripPayload,
  resolveExternalService,
  transferExternalTrip,
  transferDueExternalTrips
};
