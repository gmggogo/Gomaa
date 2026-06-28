const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Trip =
  global.Trip ||
  mongoose.models.Trip;

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v || "")
    .replace(/[_-]/g," ")
    .replace(/\s+/g," ")
    .trim()
    .toLowerCase();
}

function compact(v){
  return clean(v).replace(/\s+/g,"");
}

function normalizeFinalStatus(v){

  const s = clean(v);
  const c = compact(v);

  if(s === "completed" || s === "complete"){
    return "Completed";
  }

  if(s.includes("cancel")){
    return "Cancelled";
  }

  if(s.includes("no show") || c.includes("noshow")){
    return "No Show";
  }

  if(
    s === "not completed" ||
    c === "notcompleted" ||
    s.includes("not complete")
  ){
    return "Not Completed";
  }

  if(s === "mixed closed" || c === "mixedclosed"){
    return "Mixed Closed";
  }

  return "";
}

function isFinalStatus(v){
  return !!normalizeFinalStatus(v);
}

function isSharedTrip(trip){
  return (
    trip?.isShared === true ||
    String(trip?.tripType || "").toUpperCase() === "SHARED" ||
    String(trip?.type || "").toLowerCase() === "shared" ||
    String(trip?.tripNumber || "").toUpperCase().includes("-SH") ||
    (Array.isArray(trip?.passengers) && trip.passengers.length > 0)
  );
}

/* =========================
   FINAL CONFIRM CHECK
   Review يدخل بس اللي اتعمله Confirm
========================= */

function hasFinalConfirmation(trip){

  if(!trip){
    return false;
  }

  if(
    trip.finalStatusConfirmed === true ||
    !!trip.finalStatusConfirmedAt ||
    !!trip.dispatchFinalConfirmedAt ||
    trip.sharedFinalConfirmed === true ||
    !!trip.sharedFinalConfirmedAt
  ){
    return true;
  }

  const passengers =
    Array.isArray(trip.passengers)
      ? trip.passengers
      : [];

  return passengers.some(p =>
    p.finalStatusConfirmed === true ||
    !!p.finalStatusConfirmedAt ||
    !!p.dispatchFinalConfirmedAt
  );
}

/* =========================
   REVIEW FILTER
========================= */

function sharedHasFinalPassenger(trip){

  const passengers =
    Array.isArray(trip?.passengers)
      ? trip.passengers
      : [];

  if(passengers.length){
    return passengers.some(p =>
      isFinalStatus(p.status || trip.status)
    );
  }

  return isFinalStatus(trip.status);
}

function shouldAppearInReview(trip){

  if(!trip){
    return false;
  }

  /*
    أهم شرط:
    أي رحلة ما اتعملهاش Confirm
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
   Any Completed => Completed
   All Cancelled => Cancelled
   All No Show => No Show
   All Not Completed => Not Completed
   Mixed Cancelled/No Show/Not Completed => Mixed Closed
========================= */

function computeSharedGroupStatus(passengers, fallbackStatus){

  const statuses =
    Array.isArray(passengers)
      ? passengers
          .map(p => normalizeFinalStatus(p.status || fallbackStatus))
          .filter(Boolean)
      : [];

  if(!statuses.length){
    return normalizeFinalStatus(fallbackStatus) || "Mixed Closed";
  }

  if(statuses.includes("Completed")){
    return "Completed";
  }

  const allCancelled =
    statuses.every(s => s === "Cancelled");

  if(allCancelled){
    return "Cancelled";
  }

  const allNoShow =
    statuses.every(s => s === "No Show");

  if(allNoShow){
    return "No Show";
  }

  const allNotCompleted =
    statuses.every(s => s === "Not Completed");

  if(allNotCompleted){
    return "Not Completed";
  }

  return "Mixed Closed";
}

/* =========================
   GET DISPATCH REVIEW
   Confirmed final trips only
========================= */

router.get("/", async (req,res)=>{

  try{

    if(!Trip){
      return res.status(500).json({
        success:false,
        message:"Trip model not loaded"
      });
    }

    const trips =
      await Trip.find({})
        .sort({
          tripDate:-1,
          tripTime:-1,
          createdAt:-1
        })
        .lean();

    const reviewTrips =
      trips.filter(shouldAppearInReview);

    return res.json({
      success:true,
      count:reviewTrips.length,
      trips:reviewTrips
    });

  }catch(err){

    console.log("DISPATCH REVIEW GET ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Failed to load dispatch review trips"
    });

  }

});

/* =========================
   UPDATE SINGLE STATUS FROM REVIEW
   يفضل Confirmed وما يخرجش من Review
========================= */

router.patch("/:id/status", async (req,res)=>{

  try{

    const { id } = req.params;
    const status = normalizeFinalStatus(req.body?.status);

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

    /*
      Review ما يعدلش رحلة مش Confirmed
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

    /*
      مهم:
      ما نمسحش confirmation markers هنا
      عشان تفضل في Dispatch Review
    */

    await trip.save();

    return res.json({
      success:true,
      message:"Dispatch review trip updated",
      trip
    });

  }catch(err){

    console.log("DISPATCH REVIEW SINGLE STATUS ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Failed to update review trip"
    });

  }

});

/* =========================
   UPDATE SHARED STATUS FROM REVIEW
   يفضل Confirmed وما يخرجش من Review
========================= */

router.patch("/:id/shared-status", async (req,res)=>{

  try{

    const { id } = req.params;

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

    /*
      Review ما يعدلش رحلة مش Confirmed
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
      Array.isArray(trip.passengers)
        ? trip.passengers
        : [];

    passengersInput.forEach((inputPassenger,idx)=>{

      if(!currentPassengers[idx]){
        return;
      }

      const nextStatus =
        normalizeFinalStatus(inputPassenger?.status);

      if(nextStatus){
        currentPassengers[idx].status = nextStatus;
      }

    });

    trip.passengers = currentPassengers;

    trip.status =
      computeSharedGroupStatus(
        currentPassengers,
        trip.status
      );

    /*
      مهم:
      ما نمسحش:
      finalStatusConfirmedAt
      dispatchFinalConfirmedAt
      sharedFinalConfirmedAt

      عشان الرحلة تفضل في Review
    */

    await trip.save();

    return res.json({
      success:true,
      message:"Dispatch review shared trip updated",
      trip
    });

  }catch(err){

    console.log("DISPATCH REVIEW SHARED STATUS ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Failed to update review shared trip"
    });

  }

});

module.exports = router;