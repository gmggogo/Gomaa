const express = require("express");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const router = express.Router();

const User = require("../models/User");
const DriverSchedule = require("../models/DriverSchedule");
const DispatchAssignment = require("../models/DispatchAssignment");
const SmartDispatchEngine = require("../models/SmartDispatchEngine");

// GH DISPATCH ROUTES — SHARED DRIVER MATCH FIX — 2026-07-23

const JWT_SECRET =
  process.env.JWT_SECRET ||
  "dev_secret";

function readBearerToken(req){
  const header = String(req.headers?.authorization || "").trim();
  if(!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function requireTenantApi(req,res,next){
  const token = readBearerToken(req);

  if(!token){
    return res.status(401).json({
      success:false,
      message:"Access Denied"
    });
  }

  try{
    const verified = jwt.verify(token,JWT_SECRET);

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
      String(req.query?.tenantId || req.body?.tenantId || "").trim();

    return requestedTenantId
      ? {...extra,tenantId:requestedTenantId}
      : {...extra};
  }

  return {
    ...extra,
    tenantId:req.authUser.tenantId
  };
}

/*
  LEGACY ASSIGNMENT MIGRATION

  Old DispatchAssignment rows were created before tenantId existed.
  Because tripId is globally unique, once the trip itself has been loaded
  from the current tenant we can safely attach the old assignment to that tenant.
  This prevents duplicate-key failures during Manual / Auto Assign.
*/
async function migrateLegacyAssignmentTenant(trip,tenantId){
  if(!trip?._id || !tenantId) return;

  await DispatchAssignment.collection.updateMany(
    {
      tripId:trip._id,
      $or:[
        {tenantId:{$exists:false}},
        {tenantId:null}
      ]
    },
    {
      $set:{
        tenantId:new mongoose.Types.ObjectId(String(tenantId))
      }
    }
  );
}

function requestTenantId(req,trip=null){
  if(req.authUser?.role === "PLATFORM_ADMIN"){
    return clean(
      trip?.tenantId ||
      req.body?.tenantId ||
      req.query?.tenantId ||
      ""
    );
  }
  return clean(req.authUser?.tenantId || "");
}

function TripModel(){
  const Trip = global.Trip || mongoose.models.Trip;
  if(!Trip) throw new Error("Trip model not loaded");
  return Trip;
}

function clean(v){ return String(v ?? "").trim(); }
function num(v,d=0){
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}
function id(v){
  return mongoose.isValidObjectId(v)
    ? new mongoose.Types.ObjectId(v)
    : null;
}
function code(v){
  if(v && typeof v === "object"){
    v =
      v.serviceCode ??
      v.serviceKey ??
      v.code ??
      v.key ??
      v.value ??
      v.name ??
      v.title ??
      "";
  }

  const c = clean(v)
    .toUpperCase()
    .replace(/[_/|-]+/g," ")
    .replace(/\s+/g," ")
    .trim();

  const words = c.split(" ").filter(Boolean);

  if(
    c === "SH" ||
    c === "SHARED" ||
    words.includes("SH") ||
    words.includes("SHARED")
  ) return "SH";

  if(
    c === "WH" ||
    c === "WC" ||
    c === "WHEELCHAIR" ||
    c === "WHEEL CHAIR" ||
    words.includes("WH") ||
    words.includes("WC") ||
    words.includes("WHEELCHAIR")
  ) return "WH";

  if(c === "ST" || c === "STANDARD" || words.includes("ST") || words.includes("STANDARD")){
    return "ST";
  }
  if(c === "LM" || c === "LIMO" || c === "LIMOUSINE" || words.includes("LM")){
    return "LM";
  }
  if(c === "TX" || c === "TAXI" || words.includes("TX") || words.includes("TAXI")){
    return "TX";
  }
  if(c === "XL" || words.includes("XL")) return "XL";
  if(c === "ALL" || words.includes("ALL")) return "ALL";

  return c;
}
function tripService(trip){
  const service = code(
    trip.serviceCode ||
    trip.serviceKey ||
    trip.service ||
    trip.tripType
  );
  if(
    trip.isShared === true ||
    trip.shared === true ||
    trip.sharedTrip === true ||
    Array.isArray(trip.passengers) && trip.passengers.length > 1 ||
    service === "SH"
  ){
    return "SH";
  }
  return service;
}

/*
  AUTO ASSIGN SERVICE POLICY

  Tier 0: the driver owns the exact trip service.
  Tier 1: the driver is an ALL-services fallback.
  null  : the driver must never receive this service automatically.

  This policy is mandatory for Auto Assign. The Smart Dispatch
  requireServiceMatch switch must not allow a driver assigned to a different
  specific service to take the trip.
*/
function driverServices(row){
  const raw = Array.isArray(row?.services)
    ? row.services
    : clean(row?.services)
      ? clean(row.services).split(",")
      : ["ALL"];

  const normalized = [...new Set(raw.map(code).filter(Boolean))];
  return normalized.length ? normalized : ["ALL"];
}

function serviceTier(row,trip){
  const required = tripService(trip);
  const services = driverServices(row);

  if(!required) return null;
  if(services.includes(required)) return 0;
  if(services.includes("ALL")) return 1;
  return null;
}

function isShared(trip){
  return trip.isShared === true ||
    trip.shared === true ||
    trip.sharedTrip === true ||
    code(trip.tripType) === "SH" ||
    tripService(trip) === "SH";
}
function point(lat,lng){

  /*
    IMPORTANT:
    DriverSchedule stores missing coordinates as null.
    Number(null) === 0, so the old code converted missing coordinates
    to (0,0). That made Arizona drivers look thousands of miles away
    and Smart Dispatch rejected every driver by maxPickupDistanceMiles.

    Missing / empty / zero-zero coordinates must be treated as UNKNOWN.
    Unknown distance gets the neutral Smart score and does NOT reject
    an otherwise active/scheduled/service-matching driver.
  */

  if(
    lat === null ||
    lat === undefined ||
    lng === null ||
    lng === undefined ||
    String(lat).trim() === "" ||
    String(lng).trim() === ""
  ){
    return null;
  }

  lat = Number(lat);
  lng = Number(lng);

  if(
    !Number.isFinite(lat) ||
    !Number.isFinite(lng)
  ){
    return null;
  }

  /*
    0,0 is the common database placeholder for "no coordinates",
    not a real driver location for this dispatch system.
  */
  if(lat === 0 && lng === 0){
    return null;
  }

  return {lat,lng};
}
function pickupPoint(trip){

  const current =
    point(
      trip?.__dispatchPickupLat,
      trip?.__dispatchPickupLng
    );

  if(current){
    return current;
  }

  if(isShared(trip)){
    const passenger = (trip.passengers || []).find(p=>
      point(p.pickupLat,p.pickupLng)
    );
    if(passenger) return point(passenger.pickupLat,passenger.pickupLng);
  }

  return point(
    trip.pickupLat ?? trip.pickupLatitude,
    trip.pickupLng ?? trip.pickupLongitude
  );
}

function dispatchCoordOk(lat,lng){

  lat = Number(lat);
  lng = Number(lng);

  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 &&
    lng >= -180 && lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

function dispatchCoordinateProblems(trip){

  const problems = [];

  if (isShared(trip)) {

    const passengers =
      Array.isArray(trip.passengers)
        ? trip.passengers
        : [];

    passengers.forEach((p,index)=>{

      const status =
        clean(p?.status)
          .toUpperCase()
          .replace(/[\s_-]+/g,"");

      if (
        status.includes("CANCEL") ||
        status.includes("NOSHOW")
      ) {
        return;
      }

      if (
        !dispatchCoordOk(
          p?.pickupLat,
          p?.pickupLng
        )
      ) {
        problems.push(
          `Passenger ${index+1} pickup`
        );
      }

      if (
        !dispatchCoordOk(
          p?.dropoffLat,
          p?.dropoffLng
        )
      ) {
        problems.push(
          `Passenger ${index+1} dropoff`
        );
      }
    });

    return problems;
  }

  if (
    !dispatchCoordOk(
      trip.pickupLat,
      trip.pickupLng
    )
  ) {
    problems.push("pickup");
  }

  const stops =
    Array.isArray(trip.stops)
      ? trip.stops
      : [];

  const stopCoords =
    Array.isArray(trip.stopCoords)
      ? trip.stopCoords
      : [];

  stops.forEach((address,index)=>{

    const row =
      stopCoords[index];

    if (
      !row ||
      !dispatchCoordOk(
        row.lat,
        row.lng
      )
    ) {
      problems.push(
        `stop ${index+1}`
      );
    }
  });

  if (
    !dispatchCoordOk(
      trip.dropoffLat,
      trip.dropoffLng
    )
  ) {
    problems.push("dropoff");
  }

  return problems;
}

async function prepareTripsForDriver(Trip,ids,req){

  if (
    typeof global.ensureTripCoords !==
    "function"
  ) {
    throw new Error(
      "Central trip coordinate engine is not ready"
    );
  }

  const trips =
    await Trip.find(
      tenantFilter(req,{
        _id:{ $in:ids }
      })
    );

  const failed = [];

  for (const trip of trips) {

    try {

      await global.ensureTripCoords(
        trip
      );

      const missing =
        dispatchCoordinateProblems(
          trip
        );

      if (missing.length) {

        failed.push({
          tripId:String(trip._id),
          tripNumber:
            trip.tripNumber || "",
          missing
        });
      }

    } catch (err) {

      failed.push({
        tripId:String(trip._id),
        tripNumber:
          trip.tripNumber || "",
        missing:[
          "coordinate preparation failed"
        ],
        error:
          err?.message ||
          String(err)
      });
    }
  }

  return failed;
}

function miles(a,b){
  if(!a || !b) return null;
  const rad = x=>x*Math.PI/180;
  const dLat = rad(b.lat-a.lat);
  const dLng = rad(b.lng-a.lng);
  const h =
    Math.sin(dLat/2)**2 +
    Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*
    Math.sin(dLng/2)**2;
  return 3958.7613*2*Math.atan2(Math.sqrt(h),Math.sqrt(1-h));
}
function tripDateTime(trip){
  const date = clean(trip.tripDate);
  const time = clean(trip.tripTime);
  if(!date || !time) return null;
  const value = new Date(`${date}T${time}`);
  return Number.isNaN(value.getTime()) ? null : value;
}
function dayKey(date){
  const d = new Date(`${date}T12:00:00`);
  return ["sun","mon","tue","wed","thu","fri","sat"][d.getDay()];
}
function driverUserFilter(){
  return {
    role:/^driver$/i,
    enabled:{$ne:false},
    disabled:{$ne:true}
  };
}
function scheduleAllows(row,trip,settings){
  const rowStatus = clean(row.status).toUpperCase();
  if(
    settings.requireActiveDriver !== false &&
    (
      row.enabled === false ||
      row.active === false ||
      rowStatus === "INACTIVE" ||
      rowStatus === "DISABLED"
    )
  ){
    return false;
  }
  if(settings.requireScheduleMatch !== false){
    const day = row.days?.[dayKey(trip.tripDate)];
    if(day === false || day?.enabled === false) return false;
    if(day && typeof day === "object"){
      const t = clean(trip.tripTime);
      if(day.start && t < day.start) return false;
      if(day.end && t > day.end) return false;
    }
  }
  return true;
}

async function buildContext(req){
  const Trip = TripModel();

  const [drivers,rows,settings,tenantTrips] = await Promise.all([
    User.find(
      tenantFilter(req,driverUserFilter())
    ).sort({name:1}).lean(),

    DriverSchedule.find(
      tenantFilter(req)
    ).lean(),

    SmartDispatchEngine.findOne(
      tenantFilter(req)
    ).lean(),

    Trip.find(
      tenantFilter(req,{disabled:false})
    ).select("_id tenantId tripDate tripTime").lean()
  ]);

  const tenantId = requestTenantId(req,tenantTrips[0] || null);

  if(tenantId){
    for(const trip of tenantTrips){
      await migrateLegacyAssignmentTenant(trip,tenantId);
    }
  }

  const tripIds = tenantTrips.map(t=>t._id);

  const assignments = tripIds.length
    ? await DispatchAssignment.find({
        tripId:{$in:tripIds},
        dispatchStatus:{$in:["ASSIGNED","SENT","ACCEPTED","ON_TRIP"]}
      }).lean()
    : [];

  const schedule = new Map(rows.map(r=>[String(r.driverId),r]));

  return {
    drivers,
    schedule,
    assignments,
    settings:settings || {}
  };
}

function hasConflict(driverId,trip,ctx){
  if(ctx.settings.enableTimeConflict === false) return false;
  const target = tripDateTime(trip);
  if(!target) return false;
  const buffer = num(ctx.settings.minBufferMinutes,30)*60000;
  return ctx.assignments.some(a=>{
    if(String(a.driverId) !== String(driverId)) return false;
    const other = a.__trip;
    if(!other || clean(other.tripDate) !== clean(trip.tripDate)) return false;
    const dt = tripDateTime(other);
    return dt && Math.abs(dt-target) < buffer;
  });
}


/* =========================
   DRIVER ORIGIN POLICY
   First trip of the day  -> Driver Schedule address
   Later trips            -> Previous assigned trip final dropoff
========================= */

function finalDropoffAddress(trip){

  if(!trip){
    return "";
  }

  if(isShared(trip)){

    const plan =
      Array.isArray(trip.sharedRoutePlan) && trip.sharedRoutePlan.length
        ? trip.sharedRoutePlan
        : Array.isArray(trip.routePlan) && trip.routePlan.length
          ? trip.routePlan
          : [];

    if(plan.length){

      const ordered =
        [...plan]
          .filter(p=>clean(p?.address))
          .sort((a,b)=>
            num(a?.order,0) -
            num(b?.order,0)
          );

      const last =
        ordered[ordered.length - 1];

      if(last?.address){
        return clean(last.address);
      }
    }

    const passengers =
      Array.isArray(trip.passengers)
        ? trip.passengers.filter(p=>{
            const status =
              clean(p?.status)
                .toUpperCase()
                .replace(/[\s_-]+/g,"");

            return !(
              status.includes("CANCEL") ||
              status.includes("NOSHOW")
            );
          })
        : [];

    if(passengers.length){

      const ordered =
        [...passengers].sort((a,b)=>{

          const aDrop =
            num(
              a?.dropoffOrder ??
              a?.routeOrder,
              -1
            );

          const bDrop =
            num(
              b?.dropoffOrder ??
              b?.routeOrder,
              -1
            );

          return aDrop - bDrop;
        });

      const last =
        ordered[ordered.length - 1];

      if(last?.dropoff){
        return clean(last.dropoff);
      }
    }
  }

  return clean(
    trip.dropoff ||
    trip.dropOff ||
    trip.destination ||
    ""
  );
}

function finalDropoffPoint(trip){

  if(!trip){
    return null;
  }

  if(isShared(trip)){

    const passengers =
      Array.isArray(trip.passengers)
        ? trip.passengers.filter(p=>{
            const status =
              clean(p?.status)
                .toUpperCase()
                .replace(/[\s_-]+/g,"");

            return !(
              status.includes("CANCEL") ||
              status.includes("NOSHOW")
            );
          })
        : [];

    if(passengers.length){

      const ordered =
        [...passengers].sort((a,b)=>{

          const aDrop =
            num(
              a?.dropoffOrder ??
              a?.routeOrder,
              -1
            );

          const bDrop =
            num(
              b?.dropoffOrder ??
              b?.routeOrder,
              -1
            );

          return aDrop - bDrop;
        });

      for(let i=ordered.length-1;i>=0;i--){

        const p =
          point(
            ordered[i]?.dropoffLat,
            ordered[i]?.dropoffLng
          );

        if(p){
          return p;
        }
      }
    }
  }

  return point(
    trip.dropoffLat ??
    trip.dropoffLatitude,
    trip.dropoffLng ??
    trip.dropoffLongitude
  );
}

function previousAssignedTrip(
  driverId,
  targetTrip,
  ctx
){

  const targetDT =
    tripDateTime(targetTrip);

  if(!targetDT){
    return null;
  }

  const sameDayEarlier =
    ctx.assignments
      .filter(a=>{

        if(
          String(a.driverId) !==
          String(driverId)
        ){
          return false;
        }

        const other =
          a.__trip;

        if(!other){
          return false;
        }

        if(
          clean(other.tripDate) !==
          clean(targetTrip.tripDate)
        ){
          return false;
        }

        const otherDT =
          tripDateTime(other);

        if(!otherDT){
          return false;
        }

        return otherDT < targetDT;
      })
      .sort((a,b)=>
        tripDateTime(b.__trip) -
        tripDateTime(a.__trip)
      );

  return sameDayEarlier[0]?.__trip || null;
}

async function prepareDriverOriginsForTrip(
  trip,
  ctx
){

  if(!(ctx.driverOrigins instanceof Map)){
    ctx.driverOrigins = new Map();
  }else{
    ctx.driverOrigins.clear();
  }

  for(const driver of ctx.drivers){

    const driverId =
      String(driver._id);

    const row =
      ctx.schedule.get(driverId) || {};

    const previous =
      previousAssignedTrip(
        driverId,
        trip,
        ctx
      );

    /*
      FIRST TRIP:
      Driver starts from Driver Schedule address.
    */
    if(!previous){

      ctx.driverOrigins.set(
        driverId,
        {
          point:
            point(
              row.lat,
              row.lng
            ),
          source:"DRIVER_ADDRESS",
          address:clean(row.address)
        }
      );

      continue;
    }

    /*
      NEXT TRIP:
      Driver starts from final dropoff of the most recent
      earlier assigned trip, never from home again.
    */
    let originPoint =
      finalDropoffPoint(previous);

    const originAddress =
      finalDropoffAddress(previous);

    /*
      Resolve from the CURRENT dropoff address when possible,
      so stale saved coordinates cannot reverse the distance result.
    */
    if(
      originAddress &&
      typeof global.resolveDispatchAddressPoint ===
      "function"
    ){

      try{

        const resolved =
          await global.resolveDispatchAddressPoint(
            originAddress
          );

        if(resolved){
          originPoint = resolved;
        }

      }catch(err){

        console.log(
          "PREVIOUS DROPOFF COORD WARNING:",
          driverId,
          err?.message || err
        );
      }
    }

    ctx.driverOrigins.set(
      driverId,
      {
        point:originPoint,
        source:"PREVIOUS_DROPOFF",
        address:originAddress,
        previousTripId:
          String(previous._id || ""),
        previousTripNumber:
          clean(previous.tripNumber)
      }
    );
  }
}

function driverOriginForTrip(
  driverId,
  row,
  ctx
){

  const prepared =
    ctx.driverOrigins instanceof Map
      ? ctx.driverOrigins.get(
          String(driverId)
        )
      : null;

  if(prepared){
    return prepared;
  }

  return {
    point:
      point(
        row?.lat,
        row?.lng
      ),
    source:"DRIVER_ADDRESS",
    address:clean(row?.address)
  };
}

function rejectionReason(trip,ctx){

  const required = tripService(trip);

  const rows = ctx.drivers.map(driver=>({
    driver,
    row:ctx.schedule.get(String(driver._id)) || {}
  }));

  const activeRows = rows.filter(item=>
    scheduleAllows(item.row,trip,{
      ...ctx.settings,
      requireScheduleMatch:false
    })
  );

  if(!activeRows.length){
    return "No active drivers";
  }

  const serviceRows = activeRows.filter(item=>
    serviceTier(item.row,trip) !== null
  );

  if(!serviceRows.length){
    return `No ${required || "matching"} or ALL driver`;
  }

  const scheduleRows = serviceRows.filter(item=>
    scheduleAllows(item.row,trip,ctx.settings)
  );

  if(!scheduleRows.length){
    return `No ${required || "matching"} or ALL driver matches schedule`;
  }

  const maxTrips =
    Math.max(1,num(ctx.settings.maxTripsPerDriver,20));

  const availableRows = scheduleRows.filter(item=>{
    const driverId = String(item.driver._id);

    const today = ctx.assignments.filter(a=>
      String(a.driverId) === driverId &&
      clean(a.__trip?.tripDate) === clean(trip.tripDate)
    ).length;

    if(today >= maxTrips) return false;
    if(hasConflict(driverId,trip,ctx)) return false;

    const origin =
      driverOriginForTrip(
        driverId,
        item.row,
        ctx
      );

    const distance =
      miles(
        origin.point,
        pickupPoint(trip)
      );

    const maxPickup =
      Math.max(
        1,
        num(ctx.settings.maxPickupDistanceMiles,50)
      );

    if(
      distance !== null &&
      distance > maxPickup
    ){
      return false;
    }

    return true;
  });

  if(!availableRows.length){
    return "Drivers blocked by trip limit, time conflict, or pickup distance";
  }

  return "No eligible driver";
}

async function prepareDriverScheduleCoords(ctx,tenantId){
  if(typeof global.ensureDriverScheduleCoords !== "function") return;

  for(const driver of ctx.drivers){
    const driverId = String(driver._id);
    const row = ctx.schedule.get(driverId) || {};

    if(!clean(row.address)) continue;

    try{
      const safeRow = await global.ensureDriverScheduleCoords(
        driverId,
        row,
        tenantId
      );
      ctx.schedule.set(driverId,safeRow || row);
    }catch(err){
      console.log("DRIVER COORD PREP WARNING:",driverId,err?.message || err);
    }
  }
}

async function prepareTripPickupForRanking(trip){

  if(
    typeof global.resolveDispatchAddressPoint !==
    "function"
  ){
    return;
  }

  const address =
    clean(trip?.pickup);

  if(!address){
    return;
  }

  try{

    const currentPoint =
      await global.resolveDispatchAddressPoint(
        address
      );

    if(!currentPoint){
      return;
    }

    trip.__dispatchPickupLat =
      currentPoint.lat;

    trip.__dispatchPickupLng =
      currentPoint.lng;

  }catch(err){

    console.log(
      "TRIP PICKUP RANKING COORD WARNING:",
      err?.message || err
    );
  }
}

function rankDrivers(trip,ctx){
  const maxTrips = Math.max(1,num(ctx.settings.maxTripsPerDriver,20));
  const maxPickup = Math.max(1,num(ctx.settings.maxPickupDistanceMiles,50));
  const pickup = pickupPoint(trip);

  return ctx.drivers.flatMap(driver=>{
    const driverId = String(driver._id);
    const row = ctx.schedule.get(driverId) || {};
    if(!scheduleAllows(row,trip,ctx.settings)) return [];

    /*
      Service ownership is a hard Auto Assign condition:
      exact service first, ALL only as fallback, other services rejected.
    */
    const tier = serviceTier(row,trip);
    if(tier === null) return [];

    const today = ctx.assignments.filter(a=>
      String(a.driverId) === driverId &&
      clean(a.__trip?.tripDate) === clean(trip.tripDate)
    ).length;
    if(today >= maxTrips || hasConflict(driverId,trip,ctx)) return [];

    const origin =
      driverOriginForTrip(
        driverId,
        row,
        ctx
      );

    const distance =
      miles(
        origin.point,
        pickup
      );

    if(distance !== null && distance > maxPickup) return [];

    const distanceScore = distance === null
      ? 50
      : Math.max(0,100-(distance/maxPickup*100));
    const travelScore = distance === null
      ? 50
      : Math.max(0,100-(distance*2/60*100));
    const loadScore = Math.max(0,100-(today/maxTrips*100));
    const strategy = clean(ctx.settings.strategy || "SMART").toUpperCase();

    let score;
    let reason;
    if(strategy === "DISTANCE"){
      score=distanceScore; reason="Closest Driver";
    }else if(strategy === "TIME"){
      score=travelScore; reason="Travel Time";
    }else if(strategy === "BALANCED"){
      score=loadScore; reason="Balanced Load";
    }else{
      score =
        distanceScore*num(ctx.settings.distanceWeight,40)/100 +
        travelScore*num(ctx.settings.travelTimeWeight,30)/100 +
        loadScore*num(ctx.settings.loadWeight,20)/100 +
        100*num(ctx.settings.conflictWeight,10)/100;
      reason="Smart Score";
    }

    return [{
      driver,row,
      driverId,
      serviceTier:tier,
      serviceMatch:tier === 0 ? tripService(trip) : "ALL",
      score:Math.round(score),
      reason:
        (
          tier === 0
            ? `${reason} | Service ${tripService(trip)}`
            : `${reason} | ALL fallback`
        ) +
        (
          origin.source === "PREVIOUS_DROPOFF"
            ? ` | From previous dropoff${origin.previousTripNumber ? " " + origin.previousTripNumber : ""}`
            : " | From driver address"
        ),
      distance:
        distance === null
          ? null
          : Number(distance.toFixed(2)),
      originSource:
        origin.source,
      originAddress:
        origin.address || ""
    }];
  }).sort((a,b)=>
    a.serviceTier-b.serviceTier ||
    b.score-a.score ||
    (a.distance ?? Infinity)-(b.distance ?? Infinity) ||
    clean(a.driver.name).localeCompare(clean(b.driver.name))
  );
}

async function attachTrips(ctx,req){
  const Trip = TripModel();
  const tripIds = [...new Set(ctx.assignments.map(a=>String(a.tripId)))];
  const rows = await Trip.find(tenantFilter(req,{_id:{$in:tripIds}})).lean();
  const map = new Map(rows.map(t=>[String(t._id),t]));
  ctx.assignments.forEach(a=>{ a.__trip=map.get(String(a.tripId)); });
}


/* =========================
   AUTO ASSIGN ONE NEW TRIP
   Internal server trigger
   Tenant-aware
========================= */

async function autoAssignTripById(
  tripIdValue,
  assignedBy = "SYSTEM",
  tenantIdValue = null
){
  try{

    const Trip = TripModel();
    const validTripId = id(tripIdValue);

    if(!validTripId){
      return {
        success:false,
        assigned:false,
        reason:"Invalid trip id"
      };
    }

    /*
      First load only the trip id + tenant.
      The trip itself is the source of truth for tenant isolation.
    */
    const baseTrip =
      await Trip.findOne({
        _id:validTripId,
        disabled:false
      }).lean();

    if(!baseTrip){
      return {
        success:true,
        assigned:false,
        reason:"Trip not found"
      };
    }

    const tenantId =
      clean(
        tenantIdValue ||
        baseTrip.tenantId ||
        ""
      );

    if(!tenantId){
      return {
        success:true,
        assigned:false,
        reason:"Trip tenant is missing"
      };
    }

    /*
      A caller may pass tenantId, but it must match the trip tenant.
      This prevents cross-company assignment.
    */
    if(
      tenantIdValue &&
      String(baseTrip.tenantId || "") !== String(tenantIdValue)
    ){
      return {
        success:false,
        assigned:false,
        reason:"Tenant mismatch"
      };
    }

    const internalReq = {
      authUser:{
        id:null,
        role:"SYSTEM",
        tenantId
      },
      user:null,
      query:{},
      body:{}
    };

    const settings =
      await SmartDispatchEngine
        .findOne({tenantId})
        .lean();

    if(settings?.enabled === false){
      return {
        success:true,
        assigned:false,
        reason:"Smart Dispatch is disabled"
      };
    }

    const trip =
      await Trip.findOne({
        _id:validTripId,
        tenantId,
        dispatchSelected:true,
        disabled:false
      }).lean();

    if(!trip){
      return {
        success:true,
        assigned:false,
        reason:"Trip is not available in Dispatch"
      };
    }

    await migrateLegacyAssignmentTenant(
      trip,
      tenantId
    );

    const existing =
      await DispatchAssignment.findOne({
        tripId:trip._id,
        tenantId,
        driverId:{$ne:null}
      }).lean();

    if(existing){
      return {
        success:true,
        assigned:false,
        skipped:true,
        reason:"Already assigned",
        tripId:String(trip._id),
        driverId:String(existing.driverId),
        driverName:existing.driverName || ""
      };
    }

    /*
      Keep the same Smart Dispatch ranking used by the normal
      Auto Assign button: service, schedule, conflicts, load,
      distance and selected strategy.
    */
    const ctx =
      await buildContext(internalReq);

    await attachTrips(
      ctx,
      internalReq
    );

    await prepareDriverScheduleCoords(
      ctx,
      tenantId
    );

    /*
      Prepare coordinates when the global helper exists.
      A coordinate preparation failure does not crash Dispatch;
      it simply lets the normal ranking rules decide.
    */
    try{
      if(
        typeof global.ensureTripCoords ===
        "function"
      ){
        await global.ensureTripCoords(trip);
      }
    }catch(coordErr){
      console.log(
        "AUTO ASSIGN ONE TRIP COORD WARNING:",
        coordErr?.message || coordErr
      );
    }

    await prepareTripPickupForRanking(
      trip
    );

    await prepareDriverOriginsForTrip(
      trip,
      ctx
    );

    const best =
      rankDrivers(trip,ctx)[0];

    if(!best){
      return {
        success:true,
        assigned:false,
        tripId:String(trip._id),
        service:tripService(trip),
        reason:rejectionReason(trip,ctx)
      };
    }

    const assignment =
      await DispatchAssignment.findOneAndUpdate(
        {
          tripId:trip._id,
          tenantId
        },
        {
          $set:{
            tenantId,
            tripId:trip._id,

            driverId:best.driver._id,
            driverName:
              best.driver.name ||
              best.driver.fullName ||
              "",

            driverPhone:
              best.row.phone ||
              best.driver.phone ||
              "",

            vehicleNumber:
              best.row.vehicleNumber ||
              "",

            driverAddress:
              best.row.address ||
              "",

            services:
              driverServices(best.row),

            dispatchStatus:"ASSIGNED",

            assignedBy:
              clean(assignedBy) ||
              "SYSTEM",

            assignmentType:"AUTO",

            smartScore:
              best.score,

            smartReason:
              best.reason,

            smartDistance:
              best.distance,

            assignedAt:
              new Date()
          }
        },
        {
          upsert:true,
          new:true
        }
      );

    return {
      success:true,
      assigned:true,
      tripId:String(trip._id),
      service:tripService(trip),
      driverId:best.driverId,
      driverName:assignment.driverName,
      serviceMatch:best.serviceMatch,
      score:best.score,
      reason:best.reason
    };

  }catch(err){

    console.error(
      "AUTO ASSIGN TRIP BY ID:",
      err
    );

    return {
      success:false,
      assigned:false,
      reason:
        err?.message ||
        "Auto assignment failed"
    };
  }
}

router.get("/",requireTenantApi,async(req,res)=>{
  try{
    const Trip = TripModel();
    const [trips,drivers,scheduleRows] = await Promise.all([
      Trip.find(tenantFilter(req,{dispatchSelected:true,disabled:false}))
        .sort({tripDate:1,tripTime:1,createdAt:1}).lean(),
      User.find(tenantFilter(req,driverUserFilter())).sort({name:1}).lean(),
      DriverSchedule.find(tenantFilter(req)).lean()
    ]);

    const tripIds = trips.map(t=>t._id);
    const tenantId = requestTenantId(req,trips[0] || null);

    if(tenantId){
      for(const trip of trips){
        await migrateLegacyAssignmentTenant(trip,tenantId);
      }
    }

    const assignments = tripIds.length
      ? await DispatchAssignment.find({tripId:{$in:tripIds}}).lean()
      : [];
    const assignmentMap = new Map(
      assignments.map(a=>[String(a.tripId),a])
    );
    const schedule = {};
    scheduleRows.forEach(row=>{
      schedule[String(row.driverId)] = row;
    });
    res.json({
      trips:trips.map(trip=>{
        const a=assignmentMap.get(String(trip._id));
        return {
          ...trip,
          driverId:a?.driverId || "",
          driverName:a?.driverName || "",
          vehicle:a?.vehicleNumber || "",
          driverAddress:a?.driverAddress || "",
          dispatchStatus:a?.dispatchStatus || "UNASSIGNED",
          assignmentType:a?.assignmentType || "",
          manualAssigned:a?.assignmentType === "MANUAL",
          smartScore:a?.smartScore ?? "",
          smartReason:a?.smartReason || "",
          smartDistance:a?.smartDistance ?? "",
          note:a?.note || "",
          sentAt:a?.sentAt || null
        };
      }),
      drivers,
      schedule
    });
  }catch(err){
    console.error("DISPATCH LOAD:",err);
    res.status(500).json({success:false,message:"Dispatch load error"});
  }
});

router.post("/auto-assign",requireTenantApi,async(req,res)=>{
  try{
    const Trip = TripModel();
    const settings = await SmartDispatchEngine.findOne(tenantFilter(req)).lean();

    if(settings?.enabled === false){
      return res.status(400).json({
        success:false,
        message:"Smart Dispatch is disabled"
      });
    }

    const requested = Array.isArray(req.body.ids)
      ? [...new Set(req.body.ids.map(id).filter(Boolean).map(String))]
      : [];

    const filter = tenantFilter(req,{
      dispatchSelected:true,
      disabled:false,
      ...(requested.length ? {_id:{$in:requested}} : {})
    });

    const trips = await Trip.find(filter)
      .sort({tripDate:1,tripTime:1,createdAt:1})
      .lean();

    const tripIds = trips.map(t=>t._id);

    for(const trip of trips){
      const tenantId = requestTenantId(req,trip);
      if(tenantId){
        await migrateLegacyAssignmentTenant(trip,tenantId);
      }
    }

    /*
      Explicit IDs mean the administrator intentionally requested a new
      calculation. Existing unsent assignments are cleared first so the
      latest driver table, schedule and services are used immediately.
      Sent, accepted and active-trip assignments remain locked.
    */
    if(requested.length && tripIds.length){
      await DispatchAssignment.deleteMany(
        tenantFilter(req,{
          tripId:{$in:tripIds},
          dispatchStatus:{$in:["UNASSIGNED","ASSIGNED"]}
        })
      );
    }

    const lockedAssignments = await DispatchAssignment.find(
      tenantFilter(req,{
        tripId:{$in:tripIds},
        driverId:{$ne:null},
        dispatchStatus:{$in:["SENT","ACCEPTED","ON_TRIP","COMPLETED"]}
      })
    ).select("tripId dispatchStatus").lean();

    const lockedIds = new Set(
      lockedAssignments.map(a=>String(a.tripId))
    );

    const ctx = await buildContext(req);
    await attachTrips(ctx,req);

    await prepareDriverScheduleCoords(
      ctx,
      requestTenantId(req,trips[0] || null)
    );

    const results = [];

    for(const trip of trips){

      try {

        if (
          typeof global.ensureTripCoords ===
          "function"
        ) {
          await global.ensureTripCoords(
            trip
          );
        }

      } catch (err) {

        results.push({
          tripId:trip._id,
          assigned:false,
          reason:
            "Trip coordinate preparation failed: " +
            (err?.message || err)
        });

        continue;
      }

      if(lockedIds.has(String(trip._id))){
        results.push({
          tripId:trip._id,
          assigned:false,
          reason:"Trip assignment is locked"
        });
        continue;
      }

      if(isShared(trip) && ctx.settings.autoAssignSharedTrips === false){
        results.push({
          tripId:trip._id,
          assigned:false,
          reason:"Shared Auto Assign is disabled"
        });
        continue;
      }

      await prepareTripPickupForRanking(
        trip
      );

      await prepareDriverOriginsForTrip(
        trip,
        ctx
      );

      const best = rankDrivers(trip,ctx)[0];

      if(!best){
        results.push({
          tripId:trip._id,
          assigned:false,
          reason:rejectionReason(trip,ctx)
        });
        continue;
      }

      const assignment = await DispatchAssignment.findOneAndUpdate(
        {tripId:trip._id},
        {$set:{
          tenantId:req.authUser.role === "PLATFORM_ADMIN"
            ? (trip.tenantId || req.body?.tenantId || null)
            : req.authUser.tenantId,
          tripId:trip._id,
          driverId:best.driver._id,
          driverName:best.driver.name || best.driver.fullName || "",
          driverPhone:best.row.phone || best.driver.phone || "",
          vehicleNumber:best.row.vehicleNumber || "",
          driverAddress:best.row.address || "",
          services:driverServices(best.row),
          dispatchStatus:"ASSIGNED",
          assignedBy:req.user?._id ? String(req.user._id) : "SYSTEM",
          assignmentType:"AUTO",
          smartScore:best.score,
          smartReason:best.reason,
          smartDistance:best.distance,
          assignedAt:new Date()
        }},
        {upsert:true,new:true}
      );

      ctx.assignments.push({
        ...assignment.toObject(),
        __trip:trip
      });

      results.push({
        tripId:trip._id,
        assigned:true,
        driverId:best.driverId,
        driverName:assignment.driverName,
        score:best.score,
        distance:best.distance,
        originSource:best.originSource,
        originAddress:best.originAddress
      });
    }

    res.json({
      success:true,
      assignedCount:results.filter(x=>x.assigned).length,
      unassignedCount:results.filter(x=>!x.assigned).length,
      results
    });

  }catch(err){
    console.error("AUTO ASSIGN:",err);
    res.status(500).json({
      success:false,
      message:"Smart assignment failed"
    });
  }
});

router.patch("/send",requireTenantApi,async(req,res)=>{
  try{
    if(req.body.selected !== true){
      return res.status(400).json({
        success:false,
        message:"Select the trip before sending"
      });
    }

    const ids = Array.isArray(req.body.ids)
      ? req.body.ids.map(id).filter(Boolean)
      : [];
    if(!ids.length){
      return res.status(400).json({success:false,message:"No trips selected"});
    }
    const Trip = TripModel();

    /*
      FINAL GATE BEFORE DRIVER:
      Any trip source must have pickup / stops / dropoff coordinates.
      Shared trips must have pickup/dropoff coordinates for each active passenger.
    */
    /*
      Try to repair coordinates before send, but NEVER block dispatch.
      Sending the trip is operationally more important.
      Driver Map will use coordinates when available.
    */
    let coordinateFailures = [];

    try {

      coordinateFailures =
        await prepareTripsForDriver(
          Trip,
          ids,
          req
        );

      if(coordinateFailures.length){
        console.log(
          "DISPATCH COORDINATE WARNING:",
          coordinateFailures
        );
      }

    } catch (coordErr) {

      console.log(
        "DISPATCH COORDINATE PREP ERROR:",
        coordErr?.message || coordErr
      );
    }

    const assignments = await DispatchAssignment.find(
      tenantFilter(req,{
        tripId:{$in:ids}
      })
    ).lean();
    const assigned = new Set(
      assignments.filter(a=>a.driverId).map(a=>String(a.tripId))
    );
    const missing = ids.filter(x=>!assigned.has(String(x)));
    if(missing.length){
      return res.status(400).json({
        success:false,
        message:"Assign a driver to every selected trip before sending",
        missing
      });
    }
    await DispatchAssignment.updateMany(
      tenantFilter(req,{tripId:{$in:ids}}),
      {$set:{dispatchStatus:"SENT",sentAt:new Date()}}
    );
    res.json({
      success:true,
      sentCount:ids.length,
      coordinateWarnings:
        coordinateFailures
    });
  }catch(err){
    console.error("SEND TRIPS:",err);
    res.status(500).json({success:false,message:"Send failed"});
  }
});

/* =========================
   SAVE TRIP DISPATCH SELECT
========================= */

router.patch("/:tripId/selection",requireTenantApi,async(req,res)=>{
  try{
    const tripId=id(req.params.tripId);

    if(!tripId){
      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    if(typeof req.body.dispatchSelected !== "boolean"){
      return res.status(400).json({
        success:false,
        message:"dispatchSelected must be true or false"
      });
    }

    const Trip=TripModel();
    const dispatchSelected=req.body.dispatchSelected;

    const trip=await Trip.findOneAndUpdate(
      tenantFilter(req,{_id:tripId}),
      {$set:{dispatchSelected}},
      {new:true,runValidators:true}
    ).lean();

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    /*
      Removing Select must also remove any unsent assignment, otherwise an
      old driver assignment can return if the trip is selected again later.
      Sent/accepted/on-trip/completed history is kept intact.
    */
    if(!dispatchSelected){
      await DispatchAssignment.deleteOne(
        tenantFilter(req,{
          tripId,
          dispatchStatus:{$in:["UNASSIGNED","ASSIGNED"]}
        })
      );
    }

    let autoAssignment = null;

    if(dispatchSelected){
      autoAssignment =
        await autoAssignTripById(
          trip._id,
          req.authUser?.id
            ? String(req.authUser.id)
            : "SYSTEM_SELECTION",
          requestTenantId(req,trip)
        );
    }

    res.json({
      success:true,
      tripId:String(trip._id),
      dispatchSelected:trip.dispatchSelected === true,
      autoAssignment
    });

  }catch(err){
    console.error("SAVE DISPATCH SELECT:",err);
    res.status(500).json({
      success:false,
      message:"Dispatch selection save failed"
    });
  }
});

router.patch("/:tripId/driver",requireTenantApi,async(req,res)=>{
  try{
    const tripId=id(req.params.tripId);
    const driverId=id(req.body.driverId);
    if(!tripId){
      return res.status(400).json({success:false,message:"Invalid trip id"});
    }
    const Trip=TripModel();
    /*
      A sent trip may no longer have dispatchSelected=true. That flag controls
      whether the trip enters dispatch; it must not block a manual driver
      replacement after SENT. Progress status below is the real safety lock.
    */
    const trip=await Trip.findOne(
      tenantFilter(req,{
        _id:tripId,
        disabled:false
      })
    ).lean();
    if(!trip){
      return res.status(404).json({success:false,message:"Trip not found"});
    }

    const tenantId = requestTenantId(req,trip);
    if(!tenantId){
      return res.status(403).json({success:false,message:"Tenant Required"});
    }

    await migrateLegacyAssignmentTenant(trip,tenantId);

    const currentAssignment=await DispatchAssignment.findOne({tripId});
    const progressValues=[
      currentAssignment?.dispatchStatus,
      trip.dispatchStatus,
      trip.status,
      trip.tripStatus,
      trip.driverStatus
    ].map(value=>clean(value).toUpperCase().replace(/[\s-]+/g,"_"));

    if(progressValues.some(value=>
      ["IN_PROGRESS","INPROGRESS","ON_TRIP","ONTRIP","STARTED"].includes(value)
    )){
      return res.status(409).json({
        success:false,
        message:"Driver cannot be changed while trip is in progress"
      });
    }

    const preservedStatus=
      ["SENT","ACCEPTED"].includes(currentAssignment?.dispatchStatus)
        ? currentAssignment.dispatchStatus
        : "ASSIGNED";

    if(!driverId){
      const assignment=await DispatchAssignment.findOneAndUpdate(
        {tripId},
        {$set:{
          tenantId,
          driverId:null,driverName:"",driverPhone:"",
          vehicleNumber:"",driverAddress:"",
          dispatchStatus:preservedStatus === "SENT" || preservedStatus === "ACCEPTED"
            ? preservedStatus
            : "UNASSIGNED",
          assignmentType:"MANUAL",
          smartScore:null,smartReason:"",smartDistance:null,
          assignedAt:null
        }},
        {upsert:true,new:true}
      );
      return res.json({success:true,assignment});
    }
    const driver=await User.findOne(
      tenantFilter(req,{
        _id:driverId,
        ...driverUserFilter()
      })
    ).lean();
    if(!driver){
      return res.status(404).json({success:false,message:"Active driver not found"});
    }
    const row=await DriverSchedule.findOne(tenantFilter(req,{driverId})).lean();
    const assignment=await DispatchAssignment.findOneAndUpdate(
      {tripId},
      {$set:{
        tenantId,
        tripId,driverId,
        driverName:driver.name || driver.fullName || "",
        driverPhone:row?.phone || driver.phone || "",
        vehicleNumber:row?.vehicleNumber || "",
        driverAddress:row?.address || "",
        services:Array.isArray(row?.services) ? row.services : ["ALL"],
        dispatchStatus:preservedStatus,
        assignedBy:req.user?._id ? String(req.user._id) : "DISPATCH",
        assignmentType:"MANUAL",
        smartScore:null,smartReason:"Manual Override",smartDistance:null,
        assignedAt:new Date()
      }},
      {upsert:true,new:true}
    );
    res.json({success:true,assignment});
  }catch(err){
    console.error("ASSIGN DRIVER:",err);
    res.status(500).json({success:false,message:"Assign failed"});
  }
});

router.patch("/:tripId/note",requireTenantApi,async(req,res)=>{
  try{
    const tripId=id(req.params.tripId);
    if(!tripId){
      return res.status(400).json({success:false,message:"Invalid trip id"});
    }
    const Trip=TripModel();

    const trip=await Trip.findOne(
      tenantFilter(req,{_id:tripId})
    ).select("_id tenantId").lean();

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    await DispatchAssignment.findOneAndUpdate(
      tenantFilter(req,{tripId}),
      {$set:{
        tenantId:req.authUser.role === "PLATFORM_ADMIN"
          ? (trip.tenantId || req.body?.tenantId || null)
          : req.authUser.tenantId,
        note:clean(req.body.note)
      }},
      {upsert:true,new:true}
    );
    res.json({success:true});
  }catch(err){
    res.status(500).json({success:false,message:"Note save failed"});
  }
});

router.autoAssignTripById =
  autoAssignTripById;

module.exports=router;