"use strict";

/*
DESTINATION PATH:
server/routes/externalSummaryRoutes.js

PURPOSE:
Broker-only financial summary.\n- Historical Archive + Today Live performance build.
- Reads broker Trips after Broker Review confirmation.
- Uses price already locked by Broker Review Confirm.
- Uses final driver status for Completed / Cancelled / No Show / Not Completed.
- Does not replace an existing locked historical broker price.
- Summary miles use the first stored final distance available on the trip.
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

const {
  listBrokerFields
} = require("../services/brokerDynamicFieldService");

const serviceIdentity =
  require("../utils/serviceIdentityResolver");

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";


/* =========================
   BROKER SUMMARY ARCHIVE
   Historical closed broker trips are serialized once and stored.
   Normal requests only calculate today's live broker rows.
========================= */

const BROKER_SUMMARY_CACHE_TTL_MS =
  10 * 1000;

const brokerSummaryResponseCache =
  new Map();

const brokerSummaryHistoryMemory =
  new Map();

const BrokerSummaryArchive =
  mongoose.models.BrokerSummaryArchive ||
  mongoose.model(
    "BrokerSummaryArchive",
    new mongoose.Schema(
      {
        tenantKey:{
          type:String,
          required:true,
          index:true
        },
        sourceTripId:{
          type:String,
          required:true
        },
        tripDate:{
          type:String,
          default:"",
          index:true
        },
        brokerCode:{
          type:String,
          default:"",
          index:true
        },
        payload:{
          type:mongoose.Schema.Types.Mixed,
          required:true
        },
        archivedAt:{
          type:Date,
          default:Date.now
        }
      },
      {
        timestamps:true,
        collection:"broker_summary_archive"
      }
    ).index(
      {
        tenantKey:1,
        sourceTripId:1
      },
      {
        unique:true
      }
    )
  );

const BrokerSummaryArchiveState =
  mongoose.models.BrokerSummaryArchiveState ||
  mongoose.model(
    "BrokerSummaryArchiveState",
    new mongoose.Schema(
      {
        tenantKey:{
          type:String,
          required:true,
          unique:true,
          index:true
        },
        cutoffDate:{
          type:String,
          default:""
        },
        updatedAt:{
          type:Date,
          default:Date.now
        }
      },
      {
        timestamps:true,
        collection:"broker_summary_archive_state"
      }
    )
  );

function brokerSummaryTenantKey(req){
  return String(
    req.authUser?.tenantId ||
    ""
  ).trim();
}

function brokerSummaryDateKey(
  date = new Date(),
  timeZone =
    process.env.APP_TIMEZONE ||
    "America/Phoenix"
){
  const parts =
    new Intl.DateTimeFormat(
      "en-US",
      {
        timeZone,
        year:"numeric",
        month:"2-digit",
        day:"2-digit"
      }
    ).formatToParts(date);

  const map = {};

  for(const part of parts){
    if(part.type !== "literal"){
      map[part.type] =
        part.value;
    }
  }

  return `${map.year}-${map.month}-${map.day}`;
}

function brokerSummaryCacheKey(req){
  return [
    brokerSummaryTenantKey(req),
    String(req.query?.brokerCode || "").toUpperCase(),
    String(req.query?.from || ""),
    String(req.query?.to || "")
  ].join("|");
}

function getBrokerSummaryCached(req){
  const key =
    brokerSummaryCacheKey(req);

  const entry =
    brokerSummaryResponseCache.get(key);

  if(
    !entry ||
    Date.now() - entry.at >
      BROKER_SUMMARY_CACHE_TTL_MS
  ){
    if(entry){
      brokerSummaryResponseCache.delete(key);
    }
    return null;
  }

  return entry.payload;
}

function setBrokerSummaryCached(
  req,
  payload
){
  const key =
    brokerSummaryCacheKey(req);

  brokerSummaryResponseCache.set(
    key,
    {
      at:Date.now(),
      payload
    }
  );

  if(
    brokerSummaryResponseCache.size >
    100
  ){
    const oldest =
      brokerSummaryResponseCache
        .keys()
        .next()
        .value;

    if(oldest){
      brokerSummaryResponseCache
        .delete(oldest);
    }
  }
}

function clearBrokerSummaryTenantMemory(
  tenantKey
){
  brokerSummaryHistoryMemory.delete(
    String(tenantKey || "")
  );

  for(
    const key of
    brokerSummaryResponseCache.keys()
  ){
    if(
      key.startsWith(
        String(tenantKey || "") + "|"
      )
    ){
      brokerSummaryResponseCache
        .delete(key);
    }
  }
}

function compareBrokerSummaryItems(a,b){
  const dateCompare =
    String(b?.tripDate || "")
      .localeCompare(
        String(a?.tripDate || "")
      );

  if(dateCompare !== 0){
    return dateCompare;
  }

  return String(b?.tripTime || "")
    .localeCompare(
      String(a?.tripTime || "")
    );
}

function itemMatchesRequest(
  item,
  req
){
  const wantedBroker =
    upper(
      req.query?.brokerCode
    );

  if(
    wantedBroker &&
    upper(item?.brokerCode) !==
      wantedBroker
  ){
    return false;
  }

  const from =
    clean(req.query?.from);

  const to =
    clean(req.query?.to);

  const date =
    clean(item?.tripDate);

  if(
    from &&
    date &&
    date < from
  ){
    return false;
  }

  if(
    to &&
    date &&
    date > to
  ){
    return false;
  }

  return true;
}

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
    clean(trip?.brokerName) ||
    clean(trip?.brokerCode) ||
    upper(trip?.externalSource) === "BROKER"
  );
}

function tripServiceCode(trip){

  const candidates = [
    trip?.serviceCode,
    trip?.serviceKey,
    trip?.serviceSuffix,
    trip?.tripNumberSuffix,
    trip?.serviceType,
    trip?.vehicleTypeFromQuote
  ];

  for(const value of candidates){

    const normalized =
      serviceIdentity
        .normalizeServiceCode(
          value
        );

    if(
      ["ST","WH","SH","TX","LM","XL"]
        .includes(normalized)
    ){
      return normalized;
    }

    if(
      serviceIdentity
        .isCustomGate(
          normalized
        )
    ){
      continue;
    }

    const operational =
      serviceIdentity
        .normalizeOperationalCode(
          value
        );

    if(operational.length === 2){
      return operational;
    }
  }

  const num =
    upper(
      trip?.tripNumber
    );

  const suffixMatch =
    num.match(
      /-([A-Z]{2})$/
    );

  if(suffixMatch?.[1]){
    return suffixMatch[1];
  }

  return "ST";
}

function tripServiceName(trip){

  const snapshot =
    clean(
      trip?.serviceName ||
      trip?.serviceTitle
    );

  if(snapshot){
    return snapshot;
  }

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

function tripServiceIdentity(trip){

  const stored =
    upper(
      trip?.serviceIdentity
    );

  if(stored){
    return stored;
  }

  const slot =
    Number(
      trip?.customServiceSlot ||
      0
    );

  if(slot >= 1 && slot <= 4){
    return `CUSTOM_${slot}`;
  }

  return tripServiceCode(trip);
}


function stopsArray(trip){
  return Array.isArray(trip?.stops)
    ? trip.stops
    : [];
}

function tripMiles(trip){

  /*
    SUMMARY MILES
    Read the final/locked trip distance without recalculating the route.
    Different trip flows may store the same distance in different fields,
    so use the first positive value that already exists on the trip.
  */

  const directMiles = [
    trip?.stopEndMiles,
    trip?.stopExecution?.miles,
    trip?.miles,
    trip?.tripMiles,
    trip?.actualMiles,
    trip?.completedMiles,
    trip?.routeMiles,
    trip?.distanceMiles,
    trip?.routeDistanceMiles,
    trip?.route?.miles,
    trip?.routeInfo?.miles,
    trip?.distance?.miles
  ];

  for(const value of directMiles){
    const miles = Number(value);

    if(Number.isFinite(miles) && miles > 0){
      return miles;
    }
  }

  const meterValues = [
    trip?.distanceMeters,
    trip?.routeDistanceMeters,
    trip?.actualDistanceMeters,
    trip?.route?.distanceMeters,
    trip?.routeInfo?.distanceMeters,
    trip?.distance?.meters
  ];

  for(const value of meterValues){
    const meters = Number(value);

    if(Number.isFinite(meters) && meters > 0){
      return meters / 1609.344;
    }
  }

  return 0;
}

function cancellationChargeable(trip,passenger=null){

  /*
    BROKER CANCELLATION FEE RULE

    Charge ONLY when the cancellation is explicitly customer-originated.

    Internal GH cancellations are always free:
    Driver / Dispatcher / Dispatch / Admin / Super Admin /
    Platform Admin / Operator / System.

    Unknown or missing cancellation source is also NO FEE.
  */

  const explicit =
    passenger?.cancellationChargeable ??
    trip?.cancellationChargeable;

  if(explicit === false){
    return false;
  }

  if(explicit === true){
    return true;
  }

  const sourceValues = [
    passenger?.cancelSource,
    passenger?.cancellationSource,
    passenger?.cancelledByRole,
    passenger?.cancelledByType,
    passenger?.cancelledBy,
    trip?.cancelSource,
    trip?.cancellationSource,
    trip?.cancelledByRole,
    trip?.cancelledByType,
    trip?.cancelledBy
  ]
    .map(upper)
    .filter(Boolean);

  const internalSources =
    new Set([
      "DRIVER",
      "DISPATCHER",
      "DISPATCH",
      "ADMIN",
      "SUPER_ADMIN",
      "SUPERADMIN",
      "PLATFORM_ADMIN",
      "OPERATOR",
      "SYSTEM",
      "INTERNAL",
      "STAFF"
    ]);

  if(
    sourceValues.some(
      value=>
        internalSources.has(value)
    )
  ){
    return false;
  }

  const customerSources =
    new Set([
      "CUSTOMER",
      "CLIENT",
      "PASSENGER",
      "RIDER",
      "MEMBER"
    ]);

  return sourceValues.some(
    value=>
      customerSources.has(value)
  );
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
    return (
      positiveNumber(trip?.finalPrice) ||
      positiveNumber(trip?.priceAmount) ||
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
      passenger?.feeAmount ??
      passenger?.cancelFee ??
      trip?.cancelFee ??
      0
    );
  }

  if(isNoShow(status)){
    return Number(
      passenger?.feeAmount ??
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
    return (
      positiveNumber(passenger?.finalPrice) ||
      positiveNumber(passenger?.priceAmount) ||
      positiveNumber(trip?.pricePerPassenger) ||
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
    serviceIdentity:
      tripServiceIdentity(trip),
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

  const passengers =
    Array.isArray(trip?.passengers)
      ? trip.passengers
      : [];

  const isShared =
    trip?.isShared === true ||
    tripServiceCode(trip) === "SH";

  const hasClosedPassenger =
    passengers.some(
      passenger=>
        isClosedStatus(
          passengerStatus(
            passenger,
            trip
          )
        )
    );

  if(
    !isClosedStatus(status) &&
    !hasClosedPassenger
  ){
    return trip;
  }

  const input =
    brokerPricingInput(trip);

  /*
    BROKER FINANCIAL RULES

    Pricing source:
    - BrokerPricing ONLY.
    - Never Facility Pricing.
    - Never Service Management.

    Final money:
    - Completed     -> normal broker fare.
    - No Show       -> broker noShowFee.
    - Cancelled     -> broker cancelFee when chargeable.
    - Not Completed -> 0.

    Shared:
    - Every passenger is calculated independently by final status.
    - Up to any number of passengers can exist; the UI shows the first 10.
    - Trip total is the sum of passenger totals.
  */
  try{

    const {
      service
    } =
      await resolveBrokerPricing(
        input
      );

    const cancelFee =
      positiveNumber(
        service?.cancelFee
      );

    const noShowFee =
      positiveNumber(
        service?.noShowFee
      );

    trip.cancelFee =
      cancelFee;

    trip.noShowFee =
      noShowFee;

    /*
      SHARED
    */
    if(isShared){

      let fareResult = null;

      const completedCount =
        passengers.filter(
          passenger=>
            isCompleted(
              passengerStatus(
                passenger,
                trip
              )
            )
        ).length;

      if(
        completedCount > 0 ||
        isCompleted(status)
      ){
        fareResult =
          await calculateBrokerPrice({
            ...input,
            passengersCount:
              Math.max(
                1,
                passengers.length ||
                input.passengersCount ||
                1
              )
          });

        trip.pricePerPassenger =
          Number(
            fareResult?.pricePerPassenger ||
            0
          );
      }

      trip.passengers =
        passengers.map(
          passenger=>{

            const pStatus =
              passengerStatus(
                passenger,
                trip
              );

            let finalAmount = 0;
            let feeAmount = 0;

            if(isCompleted(pStatus)){
              finalAmount =
                positiveNumber(passenger?.finalPrice) ||
                positiveNumber(passenger?.priceAmount) ||
                Number(
                  fareResult?.pricePerPassenger ||
                  0
                );
            }else if(isNoShow(pStatus)){
              feeAmount =
                noShowFee;
              finalAmount =
                noShowFee;
            }else if(isCancelled(pStatus)){
              feeAmount =
                cancellationChargeable(
                  trip,
                  passenger
                )
                  ? cancelFee
                  : 0;
              finalAmount =
                feeAmount;
            }else if(isNotCompleted(pStatus)){
              finalAmount = 0;
            }

            return {
              ...passenger,

              cancelFee:
                isCancelled(pStatus)
                  ? Number(feeAmount || 0)
                  : Number(
                      passenger?.cancelFee ||
                      0
                    ),

              noShowFee,
              feeAmount,

              priceAmount:
                Number(finalAmount || 0),

              finalPrice:
                Number(finalAmount || 0)
            };
          }
        );

      const total =
        trip.passengers.reduce(
          (sum,passenger)=>
            sum +
            Number(
              passenger?.finalPrice ||
              passenger?.priceAmount ||
              0
            ),
          0
        );

      trip.priceAmount =
        Number(total || 0);

      trip.finalPrice =
        Number(total || 0);

      return trip;
    }

    /*
      INDIVIDUAL
    */
    if(isCancelled(status)){

      const amount =
        cancellationChargeable(trip)
          ? cancelFee
          : 0;

      trip.cancelFee =
        Number(amount || 0);

      trip.priceAmount =
        Number(amount || 0);

      trip.finalPrice =
        Number(amount || 0);

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
        positiveNumber(trip.finalPrice) ||
        positiveNumber(trip.priceAmount);

      if(current > 0){
        return trip;
      }

      const result =
        await calculateBrokerPrice(
          input
        );

      trip.priceAmount =
        Number(
          result?.total ||
          0
        );

      trip.finalPrice =
        Number(
          result?.total ||
          0
        );

      trip.pricePerPassenger =
        Number(
          result?.pricePerPassenger ||
          result?.total ||
          0
        );
    }

  }catch(err){

    trip.brokerPricingError =
      clean(
        err?.message ||
        err ||
        "Broker pricing failed"
      );

    console.log(
      "EXTERNAL SUMMARY BROKER PRICING WARNING:",
      trip?.tripNumber || trip?._id,
      trip.brokerPricingError
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
    serviceIdentity:
      tripServiceIdentity(trip),
    customServiceSlot:
      Number(
        trip?.customServiceSlot ||
        0
      ),
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
    pricingError:
      clean(trip?.brokerPricingError),
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
        serviceCode:
          clean(
            ex?.serviceCode ||
            ex?.serviceKey
          ),
        serviceName:
          clean(ex?.serviceName),
        serviceIdentity:
          clean(ex?.serviceIdentity),
        customServiceSlot:
          Number(
            ex?.customServiceSlot ||
            0
          ),
        notes:
          clean(ex?.notes),
        brokerDynamicData:
          Array.isArray(ex?.brokerDynamicData)
            ? ex.brokerDynamicData
            : []
      }))
  };
}


async function buildBrokerSummaryItemsForRange(
  req,
  rangeFilter
){
  const tenantId =
    clean(
      req.authUser?.tenantId
    );

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
    ],
    ...rangeFilter
  };

  let query =
    Trip.find(filter)
      .select(
        "-googleRoute -optimizedRoute -routePath -routePoints " +
        "-overviewPolyline -sharedRouteMeta"
      )
      .sort({
        tripDate:-1,
        tripTime:-1,
        createdAt:-1
      })
      .lean();

  /*
    If this exact index exists, Mongo can use it for the daily date window.
    Do not force a hint here because older databases may not have the index yet.
  */
  const trips =
    await query;

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

  if(!closedTrips.length){
    return [];
  }

  const ids =
    closedTrips.map(
      trip=>trip._id
    );

  const states =
    await TripSplitState.find({
      tenantId,
      dispatchTripId:{
        $in:ids
      },
      reviewConfirmed:true
    })
      .select(
        "dispatchTripId externalTripObjectId reviewConfirmed"
      )
      .lean();

  if(!states.length){
    return [];
  }

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
        })
          .select(
            "externalTripId ghExternalTripNumber externalTripNumber " +
            "brokerCode brokerName memberId clientName clientPhone " +
            "clientEmail tripDate tripTime appointmentTime returnTime " +
            "pickup stops dropoff serviceKey serviceName notes brokerDynamicData"
          )
          .lean()
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

  return closedTrips
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
    )
    .sort(compareBrokerSummaryItems);
}

async function upsertBrokerSummaryArchiveRows(
  req,
  rows
){
  if(!rows.length){
    return;
  }

  const tenantKey =
    brokerSummaryTenantKey(req);

  const ops =
    rows
      .filter(row=>row?.id)
      .map(row=>({
        updateOne:{
          filter:{
            tenantKey,
            sourceTripId:String(row.id)
          },
          update:{
            $set:{
              tripDate:
                String(
                  row.tripDate ||
                  ""
                ),
              brokerCode:
                upper(
                  row.brokerCode
                ),
              payload:row,
              archivedAt:new Date()
            }
          },
          upsert:true
        }
      }));

  if(ops.length){
    await BrokerSummaryArchive.bulkWrite(
      ops,
      {
        ordered:false
      }
    );
  }
}

async function rebuildBrokerSummaryHistory(
  req,
  todayKey
){
  const tenantKey =
    brokerSummaryTenantKey(req);

  const rows =
    await buildBrokerSummaryItemsForRange(
      req,
      {
        tripDate:{
          $lt:todayKey
        }
      }
    );

  await BrokerSummaryArchive.deleteMany({
    tenantKey
  });

  await upsertBrokerSummaryArchiveRows(
    req,
    rows
  );

  await BrokerSummaryArchiveState
    .findOneAndUpdate(
      {
        tenantKey
      },
      {
        $set:{
          cutoffDate:todayKey,
          updatedAt:new Date()
        }
      },
      {
        upsert:true,
        new:true,
        setDefaultsOnInsert:true
      }
    );

  brokerSummaryHistoryMemory.set(
    tenantKey,
    {
      day:todayKey,
      rows
    }
  );

  return rows;
}

async function syncBrokerSummaryHistory(
  req,
  todayKey
){
  const tenantKey =
    brokerSummaryTenantKey(req);

  const memory =
    brokerSummaryHistoryMemory.get(
      tenantKey
    );

  if(
    memory &&
    memory.day === todayKey &&
    Array.isArray(memory.rows)
  ){
    return memory.rows;
  }

  const state =
    await BrokerSummaryArchiveState
      .findOne({
        tenantKey
      })
      .lean();

  if(!state){
    return rebuildBrokerSummaryHistory(
      req,
      todayKey
    );
  }

  const cutoff =
    clean(
      state.cutoffDate
    );

  if(!cutoff){
    return rebuildBrokerSummaryHistory(
      req,
      todayKey
    );
  }

  if(cutoff < todayKey){

    const deltaRows =
      await buildBrokerSummaryItemsForRange(
        req,
        {
          tripDate:{
            $gte:cutoff,
            $lt:todayKey
          }
        }
      );

    await upsertBrokerSummaryArchiveRows(
      req,
      deltaRows
    );

    await BrokerSummaryArchiveState
      .updateOne(
        {
          tenantKey
        },
        {
          $set:{
            cutoffDate:todayKey,
            updatedAt:new Date()
          }
        }
      );

  }else if(cutoff > todayKey){

    return rebuildBrokerSummaryHistory(
      req,
      todayKey
    );
  }

  const archived =
    await BrokerSummaryArchive
      .find({
        tenantKey
      })
      .select({
        _id:0,
        payload:1
      })
      .lean();

  const rows =
    archived
      .map(row=>row?.payload)
      .filter(Boolean)
      .sort(compareBrokerSummaryItems);

  brokerSummaryHistoryMemory.set(
    tenantKey,
    {
      day:todayKey,
      rows
    }
  );

  return rows;
}

function buildBrokerList(items){
  return [
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
            code:item.brokerCode,
            name:item.brokerName
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

    const cached =
      getBrokerSummaryCached(req);

    if(cached){
      return res.json(cached);
    }

    const todayKey =
      brokerSummaryDateKey();

    /*
      HISTORY + TODAY LIVE

      Historical broker summary rows:
      - Built once from confirmed Broker Review trips.
      - Persisted in Mongo.
      - Kept in memory while the server is running.
      - At the next calendar day, only the newly-finished day is appended.

      Today's broker rows:
      - Stay live so driver final status / money changes appear normally.
    */
    const [
      historicalItems,
      todayItems
    ] =
      await Promise.all([
        syncBrokerSummaryHistory(
          req,
          todayKey
        ),
        buildBrokerSummaryItemsForRange(
          req,
          {
            tripDate:{
              $gte:todayKey
            }
          }
        )
      ]);

    const seen =
      new Set();

    const allItems =
      [
        ...todayItems,
        ...historicalItems
      ]
        .filter(item=>{

          const id =
            String(
              item?.id ||
              ""
            );

          if(!id){
            return true;
          }

          if(seen.has(id)){
            return false;
          }

          seen.add(id);
          return true;
        })
        .sort(compareBrokerSummaryItems);

    /*
      Keep the exact old API filtering behavior.
      Filters are applied after merging archive + live rows.
    */
    const items =
      allItems.filter(
        item=>
          itemMatchesRequest(
            item,
            req
          )
      );

    /*
      Broker dropdown should continue to reflect the available result set
      exactly as this endpoint did before.
    */
    const brokers =
      buildBrokerList(items);

    const brokerFields =
      await listBrokerFields(tenantId);

    const payload = {
      success:true,
      items,
      brokers,
      brokerFields,
      archive:{
        enabled:true,
        liveWindow:"TODAY"
      }
    };

    setBrokerSummaryCached(
      req,
      payload
    );

    return res.json(payload);

  }catch(err){

    console.log(
      "EXTERNAL SUMMARY ARCHIVE ERROR:",
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