/* ==========================================================================
   ADMIN SUMMARY ROUTES
   Closed Trips Only
   Admin / SuperAdmin / Dispatcher
   ========================================================================== */

const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

/* =========================
   GET TRIP MODEL SAFELY
========================= */

function getTripModel(){

  const Trip =
    mongoose.models.Trip ||
    global.Trip;

  if(!Trip){
    throw new Error("Trip model is not ready");
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
    .toLowerCase()
    .trim();
}

function compact(v){
  return clean(v).replace(/\s+/g,"");
}

function isCompleted(status){
  const s = clean(status);
  return s === "completed" || s === "complete";
}

function isCancelled(status){
  return clean(status).includes("cancel");
}

function isNoShow(status){
  const s = clean(status);
  return s.includes("no show") || s.includes("noshow");
}

function isScheduled(status){
  return clean(status) === "scheduled";
}

function isConfirmed(status){
  return clean(status) === "confirmed";
}

function parseTripDateTime(trip){

  if(!trip || !trip.tripDate){
    return null;
  }

  const date =
    String(trip.tripDate || "").trim();

  let time =
    String(trip.tripTime || "00:00").trim();

  if(!time){
    time = "00:00";
  }

  let d =
    new Date(`${date}T${time}`);

  if(isNaN(d.getTime())){
    d = new Date(`${date} ${time}`);
  }

  if(isNaN(d.getTime())){
    return null;
  }

  return d;

}

function isNotCompleted(status,trip){

  const s = clean(status);
  const c = compact(status);

  if(
    s === "not completed" ||
    c === "notcompleted" ||
    s.includes("not complete")
  ){
    return true;
  }

  if(
    isCompleted(status) ||
    isCancelled(status) ||
    isNoShow(status)
  ){
    return false;
  }

  if(
    !isScheduled(status) &&
    !isConfirmed(status)
  ){
    return false;
  }

  const dt =
    parseTripDateTime(trip);

  if(!dt){
    return false;
  }

  return Date.now() - dt.getTime() >= 10 * 60 * 60 * 1000;

}

function isSharedTrip(trip){

  return (
    trip?.isShared === true ||
    String(trip?.tripType || "").toUpperCase() === "SHARED" ||
    String(trip?.type || "").toLowerCase() === "shared" ||
    String(trip?.tripNumber || "").toUpperCase().includes("-SH") ||
    (
      Array.isArray(trip?.passengers) &&
      trip.passengers.length > 0
    )
  );

}

function passengerIsClosed(passenger,trip){

  const status =
    passenger?.status ||
    trip?.status ||
    "";

  return (
    isCompleted(status) ||
    isCancelled(status) ||
    isNoShow(status) ||
    isNotCompleted(status,trip)
  );

}

function tripIsClosed(trip){

  if(!trip){
    return false;
  }

  if(isSharedTrip(trip)){

    const passengers =
      Array.isArray(trip.passengers)
        ? trip.passengers
        : [];

    if(passengers.length){
      return passengers.some(p =>
        passengerIsClosed(p,trip)
      );
    }

  }

  return (
    isCompleted(trip.status) ||
    isCancelled(trip.status) ||
    isNoShow(trip.status) ||
    isNotCompleted(trip.status,trip)
  );

}

function normalizeTrip(trip){

  const obj =
    typeof trip.toObject === "function"
      ? trip.toObject()
      : trip;

  if(
    (!obj.company || obj.company === "Sunbeam Transportation") &&
    (
      obj.companyName ||
      obj.facilityName ||
      obj.organizationName ||
      obj.customerCompany
    )
  ){
    obj.company =
      obj.companyName ||
      obj.facilityName ||
      obj.organizationName ||
      obj.customerCompany;
  }

  return obj;

}

/* =========================
   GET ADMIN SUMMARY
========================= */

router.get("/", async (req,res)=>{

  try{

    const Trip =
      getTripModel();

    const trips =
      await Trip.find({})
        .sort({
          tripDate:-1,
          tripTime:-1,
          bookedAt:-1,
          createdAt:-1
        })
        .lean();

    const closedTrips =
      trips
        .map(normalizeTrip)
        .filter(tripIsClosed);

    return res.json({
      success:true,
      count:closedTrips.length,
      trips:closedTrips
    });

  }catch(err){

    console.log(
      "ADMIN SUMMARY ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:"Failed to load admin summary",
      error:err.message
    });

  }

});

module.exports = router;