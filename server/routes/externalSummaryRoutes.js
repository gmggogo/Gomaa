"use strict";

/*
DESTINATION PATH:
server/routes/externalSummaryRoutes.js

PURPOSE:
Broker-only financial summary.
- Reads broker Trips after Broker Review confirmation.
- Uses price already locked by Broker Review Confirm.
- Uses final driver status for Completed / Cancelled / No Show / Not Completed.
- Does not recalculate historical broker prices.
*/

const express = require("express");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");

const router = express.Router();

const ExternalTrip =
  require("../models/ExternalTrip");

const TripSplitState =
  require("../models/TripSplitState");

const {
  calculateBrokerPrice,
  resolveBrokerPricing
} = require("../services/brokerPricingEngine");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function clean(value){
  return String(value ?? "").trim();
}

function upper(value){
  return clean(value).toUpperCase();
}

function bearerToken(req){
  const auth =
    clean(
      req.headers.authorization
    );

  if(
    !auth
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return auth
    .slice(7)
    .trim();
}

function requireStaff(req,res,next){

  const token =
    bearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const decoded =
      jwt.verify(
        token,
        JWT_SECRET
      );

    const role =
      upper(decoded.role);

    if(
      ![
        "SUPER_ADMIN",
        "ADMIN",
        "DISPATCHER"
      ].includes(role)
    ){
      return res.status(403).json({
        success:false,
        message:"Not allowed"
      });
    }

    if(!decoded.tenantId){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    req.authUser =
      decoded;

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

router.use(requireStaff);

function getTripModel(){
  const Trip =
    global.Trip ||
    mongoose.models.Trip ||
    null;

  if(!Trip){
    throw new Error(
      "Trip model not loaded"
    );
  }

  return Trip;
}

function normalizeStatus(value){
  return clean(value)
    .replace(/[_-]+/g," ")
    .replace(/\s+/g," ")
    .toUpperCase();
}

function isCompleted(value){
  const s = normalizeStatus(value);
  return s === "COMPLETED" ||
    s === "COMPLETE";
}

function isCancelled(value){
  return normalizeStatus(value)
    .includes("CANCEL");
}

function isNoShow(value){
  const s = normalizeStatus(value);
  return s === "NO SHOW" ||
    s === "NOSHOW";
}

function isNotCompleted(value){
  const s = normalizeStatus(value);
  return s === "NOT COMPLETED" ||
    s.includes("NOT COMPLETE");
}

function isClosedStatus(value){
  return (
    isCompleted(value) ||
    isCancelled(value) ||
    isNoShow(value) ||
    isNotCompleted(value)
  );
}

function displayStatus(value){
  if(isCompleted(value)) return "Completed";
  if(isCancelled(value)) return "Cancelled";
  if(isNoShow(value)) return "No Show";
  if(isNotCompleted(value)) return "Not Completed";
  return clean(value) || "-";
}

function tripIsBroker(trip){
  return Boolean(
    clean(trip?.brokerId) ||
    clean(trip?.brokerName)
  );
}

function tripServiceCode(trip){
  const raw =
    upper(
      trip?.serviceKey ||
      trip?.serviceCode ||
      trip?.serviceType ||
      ""
    );

  if(raw === "STANDARD") return "ST";
  if(raw === "WHEELCHAIR") return "WH";
  if(raw === "SHARED") return "SH";
  if(raw === "TAXI") return "TX";
  if(raw === "LIMO" || raw === "LIMOUSINE") return "LM";
  if(raw === "XL") return "XL";

  if(["ST","WH","SH","TX","LM","XL"].includes(raw)){
    return raw;
  }

  const num =
    upper(trip?.tripNumber);

  for(const code of ["SH","XL","WH","TX","LM","ST"]){
    if(num.includes(`-${code}`)){
      return code;
    }
  }

  return raw || "ST";
}

function tripServiceName(trip){
  const map = {
    ST:"Standard",
    WH:"Wheelchair",
    SH:"Shared",
    TX:"Taxi",
    LM:"Limousine",
    XL:"XL"
  };

  const code =
    tripServiceCode(trip);

  return map[code] || code;
}

function stopsArray(trip){
  return Array.isArray(trip?.stops)
    ? trip.stops
    : [];
}

function tripMiles(trip){
  if(!isCompleted(trip?.status)){
    return 0;
  }

  if(
    trip?.endedAtStop === true ||
    clean(trip?.completionType)
      .toUpperCase() ===
      "ENDED_AT_STOP"
  ){
    return Number(
      trip?.stopEndMiles ||
      trip?.stopExecution?.miles ||
      0
    );
  }

  const direct =
    Number(
      trip?.miles ||
      0
    );

  if(Number.isFinite(direct) && direct > 0){
    return direct;
  }

  const meters =
    Number(
      trip?.distanceMeters ||
      0
    );

  return (
    Number.isFinite(meters) &&
    meters > 0
  )
    ? meters / 1609.344
    : 0;
}

function cancellationChargeable(trip,passenger=null){

  const explicit =
    passenger?.cancellationChargeable ??
    trip?.cancellationChargeable;

  if(explicit === false){
    return false;
  }

  const role =
    upper(
      passenger?.cancelledByRole ||
      trip?.cancelledByRole ||
      ""
    );

  if([
    "DRIVER",
    "DISPATCHER",
    "DISPATCH",
    "ADMIN",
    "SUPER_ADMIN",
    "SUPERADMIN",
    "PLATFORM_ADMIN",
    "OPERATOR",
    "SYSTEM"
  ].includes(role)){
    return false;
  }

  return true;
}

function tripFee(trip){

  if(isCancelled(trip?.status)){
    if(!cancellationChargeable(trip)){
      return 0;
    }
    return Number(
      trip?.cancelFee ||
      0
    );
  }

  if(isNoShow(trip?.status)){
    return Number(
      trip?.noShowFee ||
      0
    );
  }

  return 0;
}

function tripTotal(trip){

  if(isCancelled(trip?.status)){
    return tripFee(trip);
  }

  if(isNoShow(trip?.status)){
    return tripFee(trip);
  }

  if(isNotCompleted(trip?.status)){
    return 0;
  }

  if(isCompleted(trip?.status)){
    return Number(
      trip?.finalPrice ??
      trip?.priceAmount ??
      0
    );
  }

  return 0;
}

function passengerStatus(passenger,trip){
  return (
    passenger?.status ||
    trip?.status ||
    ""
  );
}

function passengerFee(passenger,trip){

  const status =
    passengerStatus(
      passenger,
      trip
    );

  if(isCancelled(status)){

    if(
      !cancellationChargeable(
        trip,
        passenger
      )
    ){
      return 0;
    }

    return Number(
      passenger?.cancelFee ??
      trip?.cancelFee ??
      0
    );
  }

  if(isNoShow(status)){
    return Number(
      passenger?.noShowFee ??
      trip?.noShowFee ??
      0
    );
  }

  return 0;
}

function passengerTotal(passenger,trip){

  const status =
    passengerStatus(
      passenger,
      trip
    );

  if(
    isCancelled(status) ||
    isNoShow(status)
  ){
    return passengerFee(
      passenger,
      trip
    );
  }

  if(isNotCompleted(status)){
    return 0;
  }

  if(isCompleted(status)){
    return Number(
      passenger?.finalPrice ??
      passenger?.priceAmount ??
      trip?.pricePerPassenger ??
      0
    );
  }

  return 0;
}

function realPassengers(trip){

  const list =
    Array.isArray(trip?.passengers)
      ? trip.passengers
      : [];

  if(list.length){
    return list;
  }

  return [{
    passengerId:"",
    clientName:
      trip?.clientName ||
      "",
    clientPhone:
      trip?.clientPhone ||
      "",
    clientEmail:
      trip?.clientEmail ||
      "",
    pickup:
      trip?.pickup ||
      "",
    dropoff:
      trip?.dropoff ||
      "",
    status:
      trip?.status ||
      ""
  }];
}

function sharedClosed(trip){
  const passengers =
    realPassengers(trip);

  return (
    isClosedStatus(trip?.status) ||
    passengers.some(
      p=>
        isClosedStatus(
          passengerStatus(p,trip)
        )
    )
  );
}

function groupStatus(trip){

  if(!trip?.isShared){
    return displayStatus(
      trip?.status
    );
  }

  const closed =
    realPassengers(trip)
      .map(
        p=>
          displayStatus(
            passengerStatus(p,trip)
          )
      )
      .filter(
        s=>
          [
            "Completed",
            "Cancelled",
            "No Show",
            "Not Completed"
          ].includes(s)
      );

  if(!closed.length){
    return displayStatus(
      trip?.status
    );
  }

  if(closed.every(s=>s === closed[0])){
    return closed[0];
  }

  if(closed.includes("Completed")){
    return "Mixed Closed";
  }

  return "Mixed Closed";
}

function sharedTotal(trip){
  return realPassengers(trip)
    .reduce(
      (sum,p)=>
        sum +
        passengerTotal(
          p,
          trip
        ),
      0
    );
}

function sharedFee(trip){
  return realPassengers(trip)
    .reduce(
      (sum,p)=>
        sum +
        passengerFee(
          p,
          trip
        ),
      0
    );
}

function serializedPassenger(
  passenger,
  trip
){
  return {
    passengerId:
      clean(
        passenger?.passengerId
      ),
    name:
      clean(
        passenger?.clientName ||
        passenger?.name
      ),
    phone:
      clean(
        passenger?.clientPhone ||
        passenger?.phone
      ),
    email:
      clean(
        passenger?.clientEmail ||
        passenger?.email
      ),
    pickup:
      clean(
        passenger?.pickup ||
        trip?.pickup
      ),
    dropoff:
      clean(
        passenger?.dropoff ||
        trip?.dropoff
      ),
    status:
      displayStatus(
        passengerStatus(
          passenger,
          trip
        )
      ),
    fee:
      passengerFee(
        passenger,
        trip
      ),
    total:
      passengerTotal(
        passenger,
        trip
      )
  };
}


function positiveNumber(value){
  const n = Number(value);
  return Number.isFinite(n) && n > 0
    ? n
    : 0;
}

function tripMinutes(trip){
  return Number(
    trip?.estimatedMinutes ??
    (
      Number(trip?.durationSeconds || 0) > 0
        ? Number(trip.durationSeconds) / 60
        : 0
    )
  ) || 0;
}

function brokerPricingInput(trip){
  const passengers =
    Array.isArray(trip?.passengers)
      ? trip.passengers
      : [];

  return {
    tenantId:trip?.tenantId,
    brokerId:trip?.brokerId || null,
    brokerCode:trip?.brokerCode || "",
    brokerName:trip?.brokerName || "",
    serviceKey:tripServiceCode(trip),
    miles:tripMiles(trip) || Number(trip?.miles || 0) || 0,
    minutes:tripMinutes(trip),
    stops:stopsArray(trip).length,
    passengersCount:
      Math.max(
        1,
        trip?.isShared === true || tripServiceCode(trip) === "SH"
          ? passengers.length || Number(trip?.passengersCount || 1)
          : 1
      )
  };
}

async function applyFinalBrokerMoney(trip){

  if(!trip || !tripIsBroker(trip)){
    return trip;
  }

  const status =
    normalizeStatus(trip.status);

  if(!isClosedStatus(status)){
    return trip;
  }

  const input =
    brokerPricingInput(trip);

  /*
    IMPORTANT:
    Broker financial summary uses BrokerPricing ONLY.
    No Facility Pricing and no Service Management fallback.
  */
  try{

    const {
      service
    } =
      await resolveBrokerPricing(
        input
      );

    const cancelFee =
      positiveNumber(service?.cancelFee);

    const noShowFee =
      positiveNumber(service?.noShowFee);

    if(cancelFee > 0){
      trip.cancelFee = cancelFee;
    }

    if(noShowFee > 0){
      trip.noShowFee = noShowFee;
    }

    if(isCancelled(status)){

      trip.priceAmount =
        cancellationChargeable(trip)
          ? cancelFee
          : 0;

      trip.finalPrice =
        trip.priceAmount;

      return trip;
    }

    if(isNoShow(status)){

      trip.priceAmount =
        noShowFee;

      trip.finalPrice =
        noShowFee;

      return trip;
    }

    if(isNotCompleted(status)){

      trip.priceAmount = 0;
      trip.finalPrice = 0;

      return trip;
    }

    if(isCompleted(status)){

      const current =
        positiveNumber(
          trip.finalPrice ??
          trip.priceAmount
        );

      if(current > 0){
        return trip;
      }

      const result =
        await calculateBrokerPrice(
          input
        );

      trip.priceAmount =
        Number(result?.total || 0);

      trip.finalPrice =
        Number(result?.total || 0);

      trip.pricePerPassenger =
        Number(
          result?.pricePerPassenger ||
          0
        );

      if(
        (
          trip?.isShared === true ||
          tripServiceCode(trip) === "SH"
        ) &&
        Array.isArray(trip.passengers)
      ){

        trip.passengers =
          trip.passengers.map(
            passenger=>({
              ...passenger,
              cancelFee:
                positiveNumber(
                  passenger?.cancelFee
                ) || cancelFee,
              noShowFee:
                positiveNumber(
                  passenger?.noShowFee
                ) || noShowFee,
              priceAmount:
                isCompleted(
                  passenger?.status ||
                  trip.status
                )
                  ? Number(
                      passenger?.priceAmount ||
                      result?.pricePerPassenger ||
                      0
                    )
                  : passenger?.priceAmount,
              finalPrice:
                isCompleted(
                  passenger?.status ||
                  trip.status
                )
                  ? Number(
                      passenger?.finalPrice ||
                      result?.pricePerPassenger ||
                      0
                    )
                  : passenger?.finalPrice
            })
          );
      }
    }

  }catch(err){

    console.log(
      "EXTERNAL SUMMARY BROKER PRICING WARNING:",
      trip?.tripNumber || trip?._id,
      err?.message || err
    );
  }

  return trip;
}

function serializeTrip(
  trip,
  externalTrips
){

  const passengers =
    realPassengers(trip)
      .map(
        p=>
          serializedPassenger(
            p,
            trip
          )
      );

  const isShared =
    trip?.isShared === true ||
    tripServiceCode(trip) === "SH";

  return {
    id:
      String(
        trip?._id ||
        ""
      ),
    tripNumber:
      clean(trip?.tripNumber),
    brokerId:
      clean(trip?.brokerId),
    brokerName:
      clean(trip?.brokerName),
    brokerCode:
      clean(trip?.brokerCode),
    brokerTripId:
      clean(trip?.brokerTripId),
    serviceCode:
      tripServiceCode(trip),
    serviceName:
      tripServiceName(trip),
    isShared,
    groupId:
      clean(
        trip?.groupId ||
        trip?.sharedGroupId
      ),
    tripDate:
      clean(trip?.tripDate),
    tripTime:
      clean(trip?.tripTime),
    appointmentTime:
      clean(
        trip?.appointmentTime ||
        externalTrips?.[0]
          ?.appointmentTime
      ),
    returnTime:
      clean(
        externalTrips?.[0]
          ?.returnTime
      ),
    passenger:
      clean(
        trip?.clientName ||
        trip?.name ||
        passengers?.[0]?.name
      ),
    phone:
      clean(
        trip?.clientPhone ||
        passengers?.[0]?.phone
      ),
    email:
      clean(
        trip?.clientEmail ||
        passengers?.[0]?.email
      ),
    pickup:
      clean(trip?.pickup),
    stops:
      stopsArray(trip),
    dropoff:
      clean(trip?.dropoff),
    driverName:
      clean(trip?.driverName),
    vehicleNumber:
      clean(
        trip?.vehicleNumber ||
        trip?.vehicle
      ),
    status:
      groupStatus(trip),
    rawStatus:
      clean(trip?.status),
    miles:
      tripMiles(trip),
    fee:
      isShared
        ? sharedFee(trip)
        : tripFee(trip),
    total:
      isShared
        ? sharedTotal(trip)
        : tripTotal(trip),
    priceAmount:
      Number(
        trip?.priceAmount ||
        0
      ),
    finalPrice:
      Number(
        trip?.finalPrice ||
        0
      ),
    pricePerPassenger:
      Number(
        trip?.pricePerPassenger ||
        0
      ),
    cancelFee:
      Number(
        trip?.cancelFee ||
        0
      ),
    noShowFee:
      Number(
        trip?.noShowFee ||
        0
      ),
    passengerCount:
      isShared
        ? passengers.length
        : 1,
    passengers,
    notes:
      clean(trip?.notes),
    endedAtStop:
      trip?.endedAtStop === true,
    completionType:
      clean(trip?.completionType),
    stopEndAddress:
      clean(trip?.stopEndAddress),
    stopEndMiles:
      Number(
        trip?.stopEndMiles ||
        0
      ),
    externalTrips:
      (Array.isArray(externalTrips)
        ? externalTrips
        : []
      ).map(ex=>({
        id:
          String(ex?._id || ""),
        externalTripId:
          clean(ex?.externalTripId),
        ghExternalTripNumber:
          clean(
            ex?.ghExternalTripNumber ||
            ex?.externalTripNumber
          ),
        brokerCode:
          clean(ex?.brokerCode),
        brokerName:
          clean(ex?.brokerName),
        memberId:
          clean(ex?.memberId),
        clientName:
          clean(ex?.clientName),
        clientPhone:
          clean(ex?.clientPhone),
        clientEmail:
          clean(ex?.clientEmail),
        tripDate:
          clean(ex?.tripDate),
        tripTime:
          clean(ex?.tripTime),
        appointmentTime:
          clean(ex?.appointmentTime),
        returnTime:
          clean(ex?.returnTime),
        pickup:
          clean(ex?.pickup),
        stops:
          Array.isArray(ex?.stops)
            ? ex.stops
            : [],
        dropoff:
          clean(ex?.dropoff),
        serviceKey:
          clean(ex?.serviceKey),
        serviceName:
          clean(ex?.serviceName),
        notes:
          clean(ex?.notes)
      }))
  };
}

router.get("/",async(req,res)=>{

  try{

    const tenantId =
      clean(
        req.authUser?.tenantId
      );

    if(
      !mongoose.Types.ObjectId
        .isValid(tenantId)
    ){
      return res.status(400).json({
        success:false,
        message:"Invalid tenant"
      });
    }

    const Trip =
      getTripModel();

    const filter = {
      tenantId:
        new mongoose.Types.ObjectId(
          tenantId
        ),
      $or:[
        {
          brokerId:{
            $exists:true,
            $nin:["",null]
          }
        },
        {
          brokerName:{
            $exists:true,
            $nin:["",null]
          }
        }
      ]
    };

    if(req.query.brokerCode){
      filter.brokerCode =
        upper(
          req.query.brokerCode
        );
    }

    if(req.query.from || req.query.to){
      filter.tripDate = {};

      if(req.query.from){
        filter.tripDate.$gte =
          clean(req.query.from);
      }

      if(req.query.to){
        filter.tripDate.$lte =
          clean(req.query.to);
      }
    }

    const trips =
      await Trip.find(filter)
        .sort({
          tripDate:-1,
          tripTime:-1,
          createdAt:-1
        })
        .lean();

    const closedTrips =
      trips.filter(
        trip=>
          tripIsBroker(trip) &&
          (
            trip?.isShared
              ? sharedClosed(trip)
              : isClosedStatus(
                  trip?.status
                )
          )
      );

    /*
      Final broker financial pass:
      Completed -> Broker Pricing trip price.
      No Show   -> Broker Pricing no-show fee.
      Cancelled -> Broker Pricing cancel fee when chargeable.
      Not Completed -> 0.
    */
    for(const trip of closedTrips){
      await applyFinalBrokerMoney(trip);
    }

    const ids =
      closedTrips.map(
        trip=>trip._id
      );

    const states =
      ids.length
        ? await TripSplitState.find({
            tenantId,
            dispatchTripId:{
              $in:ids
            },
            reviewConfirmed:true
          })
            .lean()
        : [];

    const externalIds =
      states
        .map(
          state=>
            state.externalTripObjectId
        )
        .filter(Boolean);

    const externalTrips =
      externalIds.length
        ? await ExternalTrip.find({
            tenantId,
            _id:{
              $in:externalIds
            }
          }).lean()
        : [];

    const externalMap =
      new Map(
        externalTrips.map(
          ex=>[
            String(ex._id),
            ex
          ]
        )
      );

    const statesByTrip =
      new Map();

    for(const state of states){
      const id =
        String(
          state.dispatchTripId
        );

      if(!statesByTrip.has(id)){
        statesByTrip.set(id,[]);
      }

      statesByTrip
        .get(id)
        .push(state);
    }

    const items =
      closedTrips
        .filter(
          trip=>
            statesByTrip.has(
              String(trip._id)
            )
        )
        .map(
          trip=>{

            const source =
              statesByTrip.get(
                String(trip._id)
              ) || [];

            const linked =
              source
                .map(
                  state=>
                    externalMap.get(
                      String(
                        state.externalTripObjectId
                      )
                    )
                )
                .filter(Boolean);

            return serializeTrip(
              trip,
              linked
            );
          }
        );

    const brokers =
      [
        ...new Map(
          items
            .filter(
              item=>
                item.brokerCode ||
                item.brokerName
            )
            .map(item=>[
              item.brokerCode ||
              item.brokerName,
              {
                code:
                  item.brokerCode,
                name:
                  item.brokerName
              }
            ])
        ).values()
      ].sort(
        (a,b)=>
          String(
            a.name ||
            a.code
          ).localeCompare(
            String(
              b.name ||
              b.code
            )
          )
      );

    return res.json({
      success:true,
      items,
      brokers
    });

  }catch(err){

    console.log(
      "EXTERNAL SUMMARY ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        err.message ||
        "Failed to load External Summary"
    });
  }
});

module.exports = router;
