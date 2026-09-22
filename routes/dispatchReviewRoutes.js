const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const ExternalTrip =
  mongoose.models.ExternalTrip ||
  require("../models/ExternalTrip");

const serviceIdentity =
  require("../utils/serviceIdentityResolver");

/* =====================================================
   FILE: server/routes/dispatchReviewRoutes.js
   DISPATCH REVIEW ROUTE - HISTORICAL ARCHIVE V4 MEMORY
   Final confirmed trips only

   SAFE RULES:
   - Dispatch Review shows ONLY trips that were final-confirmed.
   - Unconfirmed trips never appear here.
   - Editing status from Review does NOT remove confirmation markers.
   - Individual trip status is updated by /:id/status.
   - Shared trip passenger statuses are updated by /:id/shared-status.
   - Shared group status:
       Any Completed => Completed
       All Cancelled => Cancelled
       All No Show => No Show
       All Not Completed => Not Completed
       Mixed final statuses => Mixed Closed
===================================================== */

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

/* =========================
   FAST REVIEW CACHE
   Short-lived, tenant-scoped.
   Cleared after Review status writes.
========================= */

const REVIEW_CACHE_TTL_MS = 10 * 1000;
const reviewCache = new Map();

/*
  Historical archive memory cache.
  Old review trips do not need to be re-read from Mongo on every page visit.
  Keyed by tenant + current day. It is invalidated when an old trip is edited
  or when the day changes.
*/
const reviewHistoryMemory = new Map();

function clearReviewHistoryMemory(tenantKey=null){
  if(tenantKey){
    reviewHistoryMemory.delete(String(tenantKey));
    return;
  }

  reviewHistoryMemory.clear();
}


function reviewCacheKey(req){
  const role =
    String(req.authUser?.role || "")
      .trim()
      .toUpperCase();

  const tenantId =
    role === "PLATFORM_ADMIN"
      ? String(
          req.query?.tenantId ||
          req.body?.tenantId ||
          "platform-all"
        ).trim()
      : String(
          req.authUser?.tenantId ||
          ""
        ).trim();

  return tenantId || "platform-all";
}

function getReviewCache(req){
  const key = reviewCacheKey(req);
  const row = reviewCache.get(key);

  if(
    !row ||
    !row.at ||
    (Date.now() - row.at) > REVIEW_CACHE_TTL_MS
  ){
    reviewCache.delete(key);
    return null;
  }

  return row.payload || null;
}

function setReviewCache(req,payload){
  reviewCache.set(
    reviewCacheKey(req),
    {
      at:Date.now(),
      payload
    }
  );
}

function clearReviewCache(){
  reviewCache.clear();
}

/* =========================
   PERSISTENT REVIEW ARCHIVE
   Old review trips are stored once.
   Daily GET reads archive + today's live trips only.
========================= */

const DispatchReviewArchive =
  mongoose.models.DispatchReviewArchive ||
  mongoose.model(
    "DispatchReviewArchive",
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
        collection:"dispatch_review_archive"
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

const DispatchReviewArchiveState =
  mongoose.models.DispatchReviewArchiveState ||
  mongoose.model(
    "DispatchReviewArchiveState",
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
        collection:"dispatch_review_archive_state"
      }
    )
  );

function reviewTenantKey(req){
  return reviewCacheKey(req);
}

function dateKeyInTimezone(
  date = new Date(),
  timeZone = process.env.APP_TIMEZONE || "America/Phoenix"
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
  parts.forEach(part=>{
    if(part.type !== "literal"){
      map[part.type] = part.value;
    }
  });

  return `${map.year}-${map.month}-${map.day}`;
}

function compareReviewTrips(a,b){

  const dateCompare =
    String(b?.tripDate || "").localeCompare(
      String(a?.tripDate || "")
    );

  if(dateCompare !== 0){
    return dateCompare;
  }

  const timeCompare =
    String(b?.tripTime || "").localeCompare(
      String(a?.tripTime || "")
    );

  if(timeCompare !== 0){
    return timeCompare;
  }

  return statusRank(a?.reviewFinalStatus) - statusRank(b?.reviewFinalStatus);
}

/* =========================
   TENANT AUTH
========================= */

function readBearerToken(req){

  const header =
    String(
      req.headers?.authorization ||
      ""
    ).trim();

  if(
    !header
      .toLowerCase()
      .startsWith("bearer ")
  ){
    return "";
  }

  return header
    .slice(7)
    .trim();
}

function requireTenantApi(req,res,next){

  const token =
    readBearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{

    const verified =
      jwt.verify(
        token,
        JWT_SECRET
      );

    req.authUser = {
      id:verified.id || null,
      role:verified.role || "",
      tenantId:verified.tenantId || null
    };

    if(req.authUser.role === "PLATFORM_ADMIN"){
      return next();
    }

    if(!req.authUser.tenantId){
      return res.status(403).json({
        success:false,
        message:"Tenant Required"
      });
    }

    next();

  }catch(err){

    return res.status(401).json({
      success:false,
      message:"Invalid Token"
    });
  }
}

function tenantFilter(req,extra={}){

  if(req.authUser?.role === "PLATFORM_ADMIN"){

    const requestedTenantId =
      String(
        req.query?.tenantId ||
        req.body?.tenantId ||
        ""
      ).trim();

    if(requestedTenantId){
      return {
        ...extra,
        tenantId:requestedTenantId
      };
    }

    return {...extra};
  }

  return {
    ...extra,
    tenantId:req.authUser.tenantId
  };
}

/* =========================
   MODEL
========================= */

function getTripModel(){

  const Trip =
    global.Trip ||
    mongoose.models.Trip;

  if(!Trip){
    throw new Error("Trip model not loaded");
  }

  return Trip;
}

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "")
    .replace(/[_-]/g," ")
    .replace(/\s+/g," ")
    .trim()
    .toLowerCase();
}

function compact(v){
  return clean(v).replace(/\s+/g,"");
}

function bool(v){
  return (
    v === true ||
    String(v).toLowerCase() === "true" ||
    String(v).toLowerCase() === "yes" ||
    String(v).toLowerCase() === "1"
  );
}

function safeArray(v){
  return Array.isArray(v) ? v : [];
}

function nowIso(){
  return new Date().toISOString();
}

function normalizeFinalStatus(v){

  const s = clean(v);
  const c = compact(v);

  if(!s){
    return "";
  }

  if(
    s === "completed" ||
    s === "complete" ||
    c === "completed" ||
    c === "complete"
  ){
    return "Completed";
  }

  if(s.includes("cancel")){
    return "Cancelled";
  }

  if(
    s.includes("no show") ||
    c.includes("noshow") ||
    c === "no"
  ){
    return "No Show";
  }

  if(
    s === "not completed" ||
    c === "notcompleted" ||
    s.includes("not complete")
  ){
    return "Not Completed";
  }

  if(
    s === "mixed closed" ||
    c === "mixedclosed"
  ){
    return "Mixed Closed";
  }

  return "";
}

function isFinalStatus(v){
  return !!normalizeFinalStatus(v);
}

function statusRank(v){

  const s =
    normalizeFinalStatus(v);

  if(s === "Completed") return 1;
  if(s === "Cancelled") return 2;
  if(s === "No Show") return 3;
  if(s === "Not Completed") return 4;
  if(s === "Mixed Closed") return 5;

  return 99;
}

function normalizeServiceCode(v){

  const normalized =
    serviceIdentity
      .normalizeServiceCode(
        v
      );

  if(
    ["ST","WH","SH","LM","TX","XL"]
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
    return normalized;
  }

  const operational =
    serviceIdentity
      .normalizeOperationalCode(
        v
      );

  return (
    operational.length === 2
      ? operational
      : normalized
  );
}

/* =========================
   TRIP TYPE
========================= */

function isSharedTrip(trip){
  return (
    trip?.isShared === true ||
    String(trip?.tripType || "").toUpperCase() === "SHARED" ||
    String(trip?.type || "").toLowerCase() === "shared" ||
    normalizeServiceCode(trip?.serviceKey) === "SH" ||
    normalizeServiceCode(trip?.serviceCode) === "SH" ||
    normalizeServiceCode(trip?.serviceType) === "SH" ||
    normalizeServiceCode(trip?.serviceSuffix) === "SH" ||
    normalizeServiceCode(trip?.tripNumberSuffix) === "SH" ||
    String(trip?.tripNumber || "").toUpperCase().includes("-SH") ||
    safeArray(trip?.passengers).length > 0
  );
}

function rawText(value){
  return String(value ?? "").trim();
}

function externalPassengerObjectId(passenger){
  const candidates = [
    passenger?.externalTripObjectId,
    passenger?.sourceExternalTripId,
    passenger?.externalTripMongoId,
    passenger?.passengerId,
    passenger?._id
  ];

  for(const value of candidates){
    const id = rawText(value);
    if(mongoose.Types.ObjectId.isValid(id)){
      return id;
    }
  }

  return "";
}

function sharedPassengerTripNumber(value){
  const raw = rawText(value).toUpperCase();

  if(!raw){
    return "";
  }

  const isReturn = raw.endsWith("-R");
  const body = isReturn ? raw.slice(0,-2) : raw;
  const parts = body.split("-");
  const lastPart =
    String(
      parts[parts.length - 1] ||
      ""
    )
    .trim()
    .toUpperCase();

  /*
    Strip any two-letter service suffix, including custom services such as ME.
    Then append SH because the passenger now belongs to a shared dispatch trip.
  */
  if(
    parts.length > 1 &&
    /^[A-Z]{2}$/.test(
      lastPart
    )
  ){
    parts.pop();
  }

  const base = parts.join("-");

  if(!base){
    return "";
  }

  return isReturn
    ? `${base}-SH-R`
    : `${base}-SH`;
}

function enrichSharedPassenger(passenger,externalTrip,parentTrip){
  const current =
    passenger && typeof passenger.toObject === "function"
      ? passenger.toObject()
      : {...(passenger || {})};

  if(!externalTrip){
    return current;
  }

  const sourceNumber = rawText(
    externalTrip.ghExternalTripNumber ||
    externalTrip.externalTripNumber ||
    externalTrip.externalTripId ||
    current.ghExternalTripNumber ||
    current.externalTripNumber ||
    current.tripNumber
  );

  return {
    ...current,
    sourceExternalTripId:String(externalTrip._id || current.sourceExternalTripId || current.passengerId || ""),
    externalTripObjectId:String(externalTrip._id || current.externalTripObjectId || ""),
    tripNumber:sharedPassengerTripNumber(sourceNumber) || current.tripNumber || "",
    ghExternalTripNumber:rawText(externalTrip.ghExternalTripNumber || externalTrip.externalTripNumber || sourceNumber),
    externalTripNumber:rawText(externalTrip.externalTripNumber || externalTrip.ghExternalTripNumber || sourceNumber),
    brokerTripId:rawText(externalTrip.externalTripId || current.brokerTripId),
    externalTripId:rawText(externalTrip.externalTripId || current.externalTripId),
    brokerId:rawText(externalTrip.brokerId || current.brokerId || parentTrip?.brokerId),
    brokerCode:rawText(externalTrip.brokerCode || current.brokerCode || parentTrip?.brokerCode),
    brokerName:rawText(externalTrip.brokerName || current.brokerName || parentTrip?.brokerName),
    memberId:rawText(externalTrip.memberId || current.memberId),
    clientName:rawText(externalTrip.clientName || current.clientName || current.name),
    name:rawText(externalTrip.clientName || current.name || current.clientName),
    clientPhone:rawText(externalTrip.clientPhone || current.clientPhone || current.phone),
    phone:rawText(externalTrip.clientPhone || current.phone || current.clientPhone),
    clientEmail:rawText(externalTrip.clientEmail || current.clientEmail || current.email),
    email:rawText(externalTrip.clientEmail || current.email || current.clientEmail),
    tripDate:rawText(externalTrip.tripDate || current.tripDate || parentTrip?.tripDate),
    tripTime:rawText(externalTrip.tripTime || current.tripTime || current.pickupTime || parentTrip?.tripTime),
    pickupTime:rawText(externalTrip.tripTime || current.pickupTime || current.tripTime || parentTrip?.tripTime),
    appointmentTime:rawText(externalTrip.appointmentTime || current.appointmentTime),
    returnTime:rawText(externalTrip.returnTime || current.returnTime),
    pickup:rawText(externalTrip.pickup || current.pickup || parentTrip?.pickup),
    stops:safeArray(externalTrip.stops),
    dropoff:rawText(externalTrip.dropoff || current.dropoff || parentTrip?.dropoff),
    serviceKey:"SH",
    serviceCode:"SH",
    serviceType:"SHARED",
    serviceIdentity:"SH",
    serviceSuffix:"SH",
    tripNumberSuffix:"SH",
    serviceName:"Shared",
    serviceTitle:"Shared",
    notes:rawText(externalTrip.notes || current.notes),
    brokerNotes:rawText(externalTrip.brokerNotes || current.brokerNotes),
    status:current.status || parentTrip?.status || "Scheduled"
  };
}

async function buildSharedExternalTripMap(req,trips){
  const ids = new Set();

  safeArray(trips)
    .filter(isSharedTrip)
    .forEach(trip=>{
      safeArray(trip?.passengers).forEach(passenger=>{
        const id = externalPassengerObjectId(passenger);
        if(id){
          ids.add(id);
        }
      });
    });

  if(!ids.size){
    return new Map();
  }

  const rows = await ExternalTrip.find(
    tenantFilter(req,{
      _id:{
        $in:[...ids].map(id=>new mongoose.Types.ObjectId(id))
      }
    })
  ).lean();

  return new Map(
    rows.map(row=>[
      String(row._id),
      row
    ])
  );
}

/* =========================
   FINAL CONFIRM CHECK
   Review يدخل بس اللي اتعمله Confirm
========================= */

function passengerHasFinalConfirmation(passenger){

  return (
    bool(passenger?.finalStatusConfirmed) ||
    bool(passenger?.dispatchFinalConfirmed) ||
    !!passenger?.finalStatusConfirmedAt ||
    !!passenger?.dispatchFinalConfirmedAt
  );
}

function hasFinalConfirmation(trip){

  if(!trip){
    return false;
  }

  if(
    bool(trip.finalStatusConfirmed) ||
    bool(trip.dispatchFinalConfirmed) ||
    bool(trip.sharedFinalConfirmed) ||
    bool(trip.finalConfirmed) ||
    !!trip.finalStatusConfirmedAt ||
    !!trip.dispatchFinalConfirmedAt ||
    !!trip.sharedFinalConfirmedAt ||
    !!trip.finalConfirmedAt
  ){
    return true;
  }

  return safeArray(trip.passengers).some(passengerHasFinalConfirmation);
}

/* =========================
   REVIEW FILTER
========================= */

function sharedHasFinalPassenger(trip){

  const passengers =
    safeArray(trip?.passengers);

  if(passengers.length){

    return passengers.some(p=>{
      return isFinalStatus(p?.status || trip?.status);
    });
  }

  return isFinalStatus(trip?.status);
}

function shouldAppearInReview(trip){

  if(!trip){
    return false;
  }

  /*
    أهم شرط:
    أي رحلة ما اتعملهاش Final Confirm
    ممنوع تدخل Dispatch Review
  */
  if(!hasFinalConfirmation(trip)){
    return false;
  }

  if(isSharedTrip(trip)){
    return sharedHasFinalPassenger(trip);
  }

  return isFinalStatus(trip.status);
}

/* =========================
   SHARED GROUP STATUS
========================= */

function computeSharedGroupStatus(passengers,fallbackStatus){

  const statuses =
    safeArray(passengers)
      .map(p=>normalizeFinalStatus(p?.status || fallbackStatus))
      .filter(Boolean);

  if(!statuses.length){
    return normalizeFinalStatus(fallbackStatus) || "Mixed Closed";
  }

  if(statuses.includes("Completed")){
    return "Completed";
  }

  if(statuses.every(s=>s === "Cancelled")){
    return "Cancelled";
  }

  if(statuses.every(s=>s === "No Show")){
    return "No Show";
  }

  if(statuses.every(s=>s === "Not Completed")){
    return "Not Completed";
  }

  return "Mixed Closed";
}

/* =========================
   PASSENGER MATCHING
========================= */

function passengerIdentity(passenger,index){

  return String(
    passenger?.passengerId ||
    passenger?._id ||
    passenger?.id ||
    index
  );
}

function findPassengerIndex(currentPassengers,inputPassenger,inputIndex){

  const inputId =
    String(
      inputPassenger?.passengerId ||
      inputPassenger?._id ||
      inputPassenger?.id ||
      ""
    );

  if(inputId){

    const found =
      currentPassengers.findIndex((passenger,index)=>{
        return passengerIdentity(passenger,index) === inputId;
      });

    if(found >= 0){
      return found;
    }
  }

  if(currentPassengers[inputIndex]){
    return inputIndex;
  }

  return -1;
}

/* =========================
   DECORATE RESPONSE
========================= */

function decorateTripForReview(trip,externalTripMap=null){

  const out =
    typeof trip?.toObject === "function"
      ? trip.toObject()
      : {...trip};

  out.isShared =
    isSharedTrip(out);

  if(out.isShared){
    out.passengers =
      safeArray(out.passengers).map(passenger=>{
        const sourceId =
          externalPassengerObjectId(passenger);

        const externalTrip =
          sourceId && externalTripMap
            ? externalTripMap.get(sourceId)
            : null;

        return enrichSharedPassenger(
          passenger,
          externalTrip,
          out
        );
      });
  }

  out.reviewConfirmed =
    hasFinalConfirmation(out);

  out.reviewFinalStatus =
    out.isShared
      ? computeSharedGroupStatus(out.passengers,out.status)
      : normalizeFinalStatus(out.status);

  return out;
}

async function queryReviewTripsForRange(
  req,
  rangeFilter
){
  const Trip =
    getTripModel();

  const filter =
    tenantFilter(
      req,
      rangeFilter
    );

  let query =
    Trip.find(filter)
      .select(
        "-googleRoute -optimizedRoute -routePath -routePoints -overviewPolyline -sharedRouteMeta"
      )
      .sort({
        tripDate:-1,
        tripTime:-1,
        createdAt:-1
      })
      .lean();

  if(filter && filter.tenantId){
    query =
      query.hint({
        tenantId:1,
        tripDate:-1,
        tripTime:-1
      });
  }

  const trips =
    await query;

  const eligibleTrips =
    trips.filter(
      shouldAppearInReview
    );

  if(!eligibleTrips.length){
    return [];
  }

  const externalTripMap =
    await buildSharedExternalTripMap(
      req,
      eligibleTrips
    );

  return eligibleTrips
    .map(
      trip=>
        decorateTripForReview(
          trip,
          externalTripMap
        )
    )
    .sort(compareReviewTrips);
}

async function upsertArchiveRows(
  req,
  rows
){
  if(!rows.length){
    return;
  }

  const tenantKey =
    reviewTenantKey(req);

  const ops =
    rows
      .filter(row=>row?._id)
      .map(row=>({
        updateOne:{
          filter:{
            tenantKey,
            sourceTripId:String(row._id)
          },
          update:{
            $set:{
              tripDate:String(row.tripDate || ""),
              payload:row,
              archivedAt:new Date()
            }
          },
          upsert:true
        }
      }));

  if(ops.length){
    await DispatchReviewArchive.bulkWrite(
      ops,
      {
        ordered:false
      }
    );
  }
}

async function rebuildHistoricalArchive(
  req,
  todayKey
){
  const tenantKey =
    reviewTenantKey(req);

  const rows =
    await queryReviewTripsForRange(
      req,
      {
        tripDate:{
          $lt:todayKey
        }
      }
    );

  await DispatchReviewArchive.deleteMany({
    tenantKey
  });

  await upsertArchiveRows(
    req,
    rows
  );

  await DispatchReviewArchiveState.findOneAndUpdate(
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

  reviewHistoryMemory.set(
    tenantKey,
    {
      day:todayKey,
      rows
    }
  );

  return rows;
}

async function syncHistoricalArchive(
  req,
  todayKey
){
  const tenantKey =
    reviewTenantKey(req);

  const memory =
    reviewHistoryMemory.get(
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
    await DispatchReviewArchiveState.findOne({
      tenantKey
    }).lean();

  if(!state){
    return rebuildHistoricalArchive(
      req,
      todayKey
    );
  }

  const cutoff =
    String(
      state.cutoffDate ||
      ""
    ).trim();

  if(!cutoff){
    return rebuildHistoricalArchive(
      req,
      todayKey
    );
  }

  if(cutoff < todayKey){

    const deltaRows =
      await queryReviewTripsForRange(
        req,
        {
          tripDate:{
            $gte:cutoff,
            $lt:todayKey
          }
        }
      );

    await upsertArchiveRows(
      req,
      deltaRows
    );

    await DispatchReviewArchiveState.updateOne(
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

    return rebuildHistoricalArchive(
      req,
      todayKey
    );
  }

  const archived =
    await DispatchReviewArchive.find({
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
      .sort(compareReviewTrips);

  reviewHistoryMemory.set(
    tenantKey,
    {
      day:todayKey,
      rows
    }
  );

  return rows;
}

async function updateArchiveForTrip(
  req,
  trip
){
  const todayKey =
    dateKeyInTimezone();

  const tripDate =
    String(
      trip?.tripDate ||
      ""
    ).trim();

  if(!tripDate || tripDate >= todayKey){
    return;
  }

  const tenantKey =
    reviewTenantKey(req);

  clearReviewHistoryMemory(
    tenantKey
  );

  const plain =
    typeof trip?.toObject === "function"
      ? trip.toObject()
      : {...trip};

  if(!shouldAppearInReview(plain)){

    await DispatchReviewArchive.deleteOne({
      tenantKey,
      sourceTripId:String(plain._id)
    });

    return;
  }

  const externalTripMap =
    await buildSharedExternalTripMap(
      req,
      [plain]
    );

  const row =
    decorateTripForReview(
      plain,
      externalTripMap
    );

  await upsertArchiveRows(
    req,
    [row]
  );
}

/* =========================
   GET DISPATCH REVIEW
   Confirmed final trips only
========================= */

router.get("/", requireTenantApi, async (req,res)=>{

  try{

    const cached =
      getReviewCache(req);

    if(cached){
      return res.json(cached);
    }

    const todayKey =
      dateKeyInTimezone();

    /*
      HISTORY + LIVE MODEL

      Historical trips:
      - Persisted in dispatch_review_archive
      - Read directly without recalculating old Trip rows
      - At a new day, only the newly-finished day is added to the archive

      Live trips:
      - Only today/future are read from Trip
      - Same final-confirmation rules remain unchanged
    */
    const [
      historicalTrips,
      liveTrips
    ] =
      await Promise.all([
        syncHistoricalArchive(
          req,
          todayKey
        ),
        queryReviewTripsForRange(
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

    const reviewTrips =
      [
        ...safeArray(liveTrips),
        ...safeArray(historicalTrips)
      ]
        .filter(trip=>{

          const id =
            String(
              trip?._id ||
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
        .sort(compareReviewTrips);

    const payload = {
      success:true,
      count:reviewTrips.length,
      trips:reviewTrips
    };

    setReviewCache(
      req,
      payload
    );

    return res.json(payload);

  }catch(err){

    console.log(
      "DISPATCH REVIEW GET ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        err.message ||
        "Failed to load dispatch review trips"
    });
  }
});

/* =========================
   UPDATE SINGLE STATUS FROM REVIEW
   يفضل Confirmed وما يخرجش من Review
========================= */

router.patch("/:id/status", requireTenantApi, async (req,res)=>{

  try{

    const Trip =
      getTripModel();

    const { id } =
      req.params;

    const status =
      normalizeFinalStatus(req.body?.status);

    if(!mongoose.Types.ObjectId.isValid(String(id))){
      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    if(!status){
      return res.status(400).json({
        success:false,
        message:"Invalid final status"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:id}));

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    /*
      Review ما يعدلش رحلة مش Final Confirmed
    */
    if(!hasFinalConfirmation(trip)){
      return res.status(400).json({
        success:false,
        message:"Trip is not final confirmed yet"
      });
    }

    if(isSharedTrip(trip)){
      return res.status(400).json({
        success:false,
        message:"Use shared-status endpoint for shared trip"
      });
    }

    trip.status = status;
    trip.dispatchReviewStatus = status;
    trip.dispatchReviewUpdatedAt = nowIso();

    /*
      مهم:
      ما نمسحش confirmation markers هنا
      عشان تفضل في Dispatch Review
    */

    await trip.save();

    await updateArchiveForTrip(
      req,
      trip
    );

    clearReviewCache();

    return res.json({
      success:true,
      message:"Dispatch review trip updated",
      trip:decorateTripForReview(trip)
    });

  }catch(err){

    console.log("DISPATCH REVIEW SINGLE STATUS ERROR:",err);

    return res.status(500).json({
      success:false,
      message:err.message || "Failed to update review trip"
    });
  }
});

/* =========================
   UPDATE SHARED STATUS FROM REVIEW
   يفضل Confirmed وما يخرجش من Review
========================= */

router.patch("/:id/shared-status", requireTenantApi, async (req,res)=>{

  try{

    const Trip =
      getTripModel();

    const { id } =
      req.params;

    const passengersInput =
      Array.isArray(req.body?.passengers)
        ? req.body.passengers
        : null;

    if(!mongoose.Types.ObjectId.isValid(String(id))){
      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    if(!passengersInput){
      return res.status(400).json({
        success:false,
        message:"Passengers array is required"
      });
    }

    const trip =
      await Trip.findOne(tenantFilter(req,{_id:id}));

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    /*
      Review ما يعدلش رحلة مش Final Confirmed
    */
    if(!hasFinalConfirmation(trip)){
      return res.status(400).json({
        success:false,
        message:"Shared trip is not final confirmed yet"
      });
    }

    if(!isSharedTrip(trip)){
      return res.status(400).json({
        success:false,
        message:"Trip is not shared"
      });
    }

    const currentPassengers =
      safeArray(trip.passengers);

    passengersInput.forEach((inputPassenger,inputIndex)=>{

      const targetIndex =
        findPassengerIndex(
          currentPassengers,
          inputPassenger,
          inputIndex
        );

      if(targetIndex < 0 || !currentPassengers[targetIndex]){
        return;
      }

      const nextStatus =
        normalizeFinalStatus(inputPassenger?.status);

      if(!nextStatus){
        return;
      }

      currentPassengers[targetIndex].status = nextStatus;
      currentPassengers[targetIndex].dispatchReviewStatus = nextStatus;
      currentPassengers[targetIndex].dispatchReviewUpdatedAt = nowIso();

      /*
        مهم:
        ما نمسحش passenger final confirmation markers هنا
      */
    });

    trip.passengers = currentPassengers;

    trip.status =
      computeSharedGroupStatus(
        currentPassengers,
        trip.status
      );

    trip.dispatchReviewStatus = trip.status;
    trip.dispatchReviewUpdatedAt = nowIso();

    /*
      مهم:
      ما نمسحش:
      finalStatusConfirmedAt
      dispatchFinalConfirmedAt
      sharedFinalConfirmedAt
      عشان الرحلة تفضل في Review
    */

    await trip.save();

    await updateArchiveForTrip(
      req,
      trip
    );

    clearReviewCache();

    return res.json({
      success:true,
      message:"Dispatch review shared trip updated",
      trip:decorateTripForReview(trip)
    });

  }catch(err){

    console.log("DISPATCH REVIEW SHARED STATUS ERROR:",err);

    return res.status(500).json({
      success:false,
      message:err.message || "Failed to update review shared trip"
    });
  }
});

module.exports = router;