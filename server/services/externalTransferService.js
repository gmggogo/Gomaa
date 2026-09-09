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

  const raw =
    String(value || "")
      .trim()
      .toUpperCase()
      .replace(/[_-]+/g," ")
      .replace(/\s+/g," ");

  if(
    raw === "WH" ||
    raw === "WC" ||
    raw.includes("WHEELCHAIR") ||
    raw.includes("WHEEL CHAIR")
  ){
    return "WHEELCHAIR";
  }

  if(
    raw === "TX" ||
    raw.includes("TAXI")
  ){
    return "TAXI";
  }

  if(
    raw === "LM" ||
    raw.includes("LIMO")
  ){
    return "LIMO";
  }

  if(
    raw === "XL" ||
    raw.startsWith("XL ")
  ){
    return "XL";
  }

  if(
    raw === "SH" ||
    raw.includes("SHARED")
  ){
    return "SHARED";
  }

  return "STANDARD";
}

function serviceSuffix(value){
  const service =
    normalizeService(value);

  if(service === "STANDARD") return "ST";
  if(service === "SHARED") return "SH";
  if(service === "WHEELCHAIR") return "WH";
  if(service === "TAXI") return "TX";
  if(service === "LIMO") return "LM";
  if(service === "XL") return "XL";

  return "ST";
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

function buildMainTripPayload(externalTrip){

  const isShared =
    externalTrip.tripType === "SHARED";

  const service =
    isShared
      ? "SHARED"
      : normalizeService(
          externalTrip.serviceKey ||
          externalTrip.serviceName
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
        service
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
      service,

    serviceKey:
      service,

    serviceCode:
      service,

    vehicleTypeFromQuote:
      service,

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
    tripNumber is globally unique in the current Trip schema,
    so this check is enough to make transfer idempotent.
  */
  const expectedTripNumber =
    finalTripNumber(
      externalTrip.ghExternalTripNumber,
      (
        externalTrip.tripType === "SHARED"
          ? "SHARED"
          : normalizeService(
              externalTrip.serviceKey ||
              externalTrip.serviceName
            )
      )
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
      externalTrip
    };
  }

  const payload =
    buildMainTripPayload(
      externalTrip
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
    externalTrip
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
  transferExternalTrip,
  transferDueExternalTrips
};
