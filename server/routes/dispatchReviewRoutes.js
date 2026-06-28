const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

/* =====================================================
   FILE: server/routes/dispatchReviewRoutes.js
   DISPATCH REVIEW ROUTE
   Final confirmed trips only

   POLICY:
   - Dispatch Review shows ONLY trips confirmed from Dispatch Final Confirmation.
   - Unconfirmed trips must NOT appear here.
   - Review status edits must NOT remove final confirmation markers.
   - Shared trips are edited per passenger.
   - Shared group status:
       Any Completed => Completed
       All Cancelled => Cancelled
       All No Show => No Show
       All Not Completed => Not Completed
       Mixed closed statuses => Mixed Closed
===================================================== */

/* =========================
   TRIP MODEL
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
   BASIC HELPERS
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

/* =========================
   TRIP TYPE
========================= */

function isSharedTrip(trip){
  return (
    trip?.isShared === true ||
    String(trip?.tripType || "").toUpperCase() === "SHARED" ||
    String(trip?.type || "").toLowerCase() === "shared" ||
    String(trip?.serviceKey || "").toUpperCase() === "SH" ||
    String(trip?.serviceCode || "").toUpperCase() === "SH" ||
    String(trip?.serviceType || "").toUpperCase() === "SH" ||
    String(trip?.tripNumberSuffix || "").toUpperCase() === "SH" ||
    String(trip?.tripNumber || "").toUpperCase().includes("-SH") ||
    safeArray(trip?.passengers).length > 0
  );
}

/* =========================
   FINAL CONFIRM CHECK
========================= */

function hasPassengerFinalConfirmation(passenger){

  return (
    bool(passenger?.finalStatusConfirmed) ||
    !!passenger?.finalStatusConfirmedAt ||
    !!passenger?.dispatchFinalConfirmedAt ||
    bool(passenger?.dispatchFinalConfirmed)
  );
}

function hasFinalConfirmation(trip){

  if(!trip){
    return false;
  }

  if(
    bool(trip.finalStatusConfirmed) ||
    !!trip.finalStatusConfirmedAt ||
    !!trip.dispatchFinalConfirmedAt ||
    bool(trip.dispatchFinalConfirmed) ||
    bool(trip.sharedFinalConfirmed) ||
    !!trip.sharedFinalConfirmedAt ||
    bool(trip.finalConfirmed) ||
    !!trip.finalConfirmedAt
  ){
    return true;
  }

  return safeArray(trip.passengers).some(hasPassengerFinalConfirmation);
}

/* =========================
   REVIEW FILTER
========================= */

function sharedHasFinalPassenger(trip){

  const passengers =
    safeArray(trip?.passengers);

  if(passengers.length){

    return passengers.some(passenger=>{
      return isFinalStatus(passenger?.status || trip?.status);
    });
  }

  return isFinalStatus(trip?.status);
}

function shouldAppearInReview(trip){

  if(!trip){
    return false;
  }

  /*
     Most important rule:
     unconfirmed trips must not enter Dispatch Review.
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
      .map(passenger=>{
        return normalizeFinalStatus(passenger?.status || fallbackStatus);
      })
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

function applySharedGroupStatus(trip){

  trip.status =
    computeSharedGroupStatus(
      trip.passengers,
      trip.status
    );

  trip.dispatchReviewStatus =
    trip.status;

  return trip.status;
}

/* =========================
   PASSENGER MATCHING
========================= */

function passengerIdentity(passenger,index){

  return String(
    passenger?.passengerId ||
    passenger?._id ||
    passenger?.id ||
    passenger?.clientName ||
    passenger?.name ||
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
   RESPONSE NORMALIZATION
========================= */

function decorateTripForReview(trip){

  const out =
    typeof trip?.toObject === "function"
      ? trip.toObject()
      : {...trip};

  out.reviewFinalStatus =
    isSharedTrip(out)
      ? computeSharedGroupStatus(out.passengers,out.status)
      : normalizeFinalStatus(out.status);

  out.isShared =
    isSharedTrip(out);

  out.reviewConfirmed =
    hasFinalConfirmation(out);

  return out;
}

/* =========================
   GET DISPATCH REVIEW
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
          createdAt:-1
        })
        .lean();

    const reviewTrips =
      trips
        .filter(shouldAppearInReview)
        .map(decorateTripForReview)
        .sort((a,b)=>{

          const dateCompare =
            String(b.tripDate || "").localeCompare(
              String(a.tripDate || "")
            );

          if(dateCompare !== 0){
            return dateCompare;
          }

          const timeCompare =
            String(b.tripTime || "").localeCompare(
              String(a.tripTime || "")
            );

          if(timeCompare !== 0){
            return timeCompare;
          }

          return statusRank(a.reviewFinalStatus) - statusRank(b.reviewFinalStatus);
        });

    return res.json({
      success:true,
      count:reviewTrips.length,
      trips:reviewTrips
    });

  }catch(err){

    console.log("DISPATCH REVIEW GET ERROR:",err);

    return res.status(500).json({
      success:false,
      message:err.message || "Failed to load dispatch review trips"
    });
  }
});

/* =========================
   UPDATE SINGLE STATUS FROM REVIEW
========================= */

router.patch("/:id/status", async (req,res)=>{

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
      await Trip.findById(id);

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

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
       Keep these markers untouched:
       finalStatusConfirmed
       finalStatusConfirmedAt
       dispatchFinalConfirmedAt
    */

    await trip.save();

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
========================= */

router.patch("/:id/shared-status", async (req,res)=>{

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
      await Trip.findById(id);

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

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
         Keep passenger final confirmation markers untouched.
      */
    });

    trip.passengers =
      currentPassengers;

    applySharedGroupStatus(trip);

    trip.dispatchReviewUpdatedAt =
      nowIso();

    await trip.save();

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