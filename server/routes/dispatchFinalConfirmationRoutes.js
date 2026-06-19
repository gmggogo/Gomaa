const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Trip = global.Trip || mongoose.models.Trip;

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

  return "";
}

function isCompletedStatus(v){
  return normalizeFinalStatus(v) === "Completed";
}

function isCancelledStatus(v){
  return normalizeFinalStatus(v) === "Cancelled";
}

function isNoShowStatus(v){
  return normalizeFinalStatus(v) === "No Show";
}

function isNotCompletedStatus(v){
  return normalizeFinalStatus(v) === "Not Completed";
}

function isFinalStatus(v){
  return !!normalizeFinalStatus(v);
}

function nowDate(){
  return new Date();
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
   FINAL CONFIRM MARKER
   مهم:
   Dispatch Review يدخل الرحلة بس بعد العلامة دي
========================= */

function getTripFinalConfirmed(trip){

  return (
    !!trip?.dispatchFinalConfirmedAt ||
    !!trip?.finalStatusConfirmedAt
  );
}

function getSharedFinalConfirmed(trip){

  return (
    !!trip?.dispatchFinalConfirmedAt ||
    !!trip?.sharedFinalConfirmedAt ||
    !!trip?.finalStatusConfirmedAt
  );
}

/* =========================
   PAGE ENTRY STAMP
========================= */

function getEnteredAt(trip){
  return (
    trip?.finalPageEnteredAt ||
    trip?.dispatchFinalPageEnteredAt ||
    trip?.enteredFinalConfirmationAt ||
    null
  );
}

function ensurePageEntryStamp(trip){

  const stamp = getEnteredAt(trip);

  if(stamp){
    return false;
  }

  const now = nowDate();

  if(!trip.finalPageEnteredAt){
    trip.finalPageEnteredAt = now;
  }

  if(!trip.dispatchFinalPageEnteredAt){
    trip.dispatchFinalPageEnteredAt = trip.finalPageEnteredAt || now;
  }

  if(!trip.enteredFinalConfirmationAt){
    trip.enteredFinalConfirmationAt = trip.finalPageEnteredAt || now;
  }

  return true;
}

/* =========================
   CLEAR CONFIRM STATE
   أي تعديل Status يرجع الرحلة Not Confirmed
========================= */

function clearSingleConfirmState(trip){

  trip.finalStatusConfirmed = false;
  trip.finalStatusConfirmedAt = null;
  trip.dispatchFinalConfirmedAt = null;
  trip.finalStatusConfirmedBy = null;
}

function clearSharedConfirmState(trip){

  trip.sharedFinalConfirmed = false;
  trip.sharedFinalConfirmedAt = null;

  trip.finalStatusConfirmed = false;
  trip.finalStatusConfirmedAt = null;
  trip.dispatchFinalConfirmedAt = null;
  trip.finalStatusConfirmedBy = null;
}

/* =========================
   PAGE READY ENGINE
   أي Closed Status يدخل Final Confirmation
   سواء من المصدر أو من السواق أو من الأدمن
========================= */

function singleTripReadyForPage(trip){

  if(!trip){
    return false;
  }

  if(isSharedTrip(trip)){
    return false;
  }

  return isFinalStatus(trip.status);
}

function getReadySharedPassengers(trip){

  const passengers =
    Array.isArray(trip?.passengers)
      ? trip.passengers
      : [];

  return passengers.filter((p)=>{
    const status = p?.status || trip?.status;
    return isFinalStatus(status);
  });
}

function sharedTripReadyForPage(trip){
  return getReadySharedPassengers(trip).length > 0;
}

/* =========================
   SHOULD APPEAR
   Final Confirmation يعرض فقط:
   Closed + مش Confirmed
========================= */

function singleTripShouldAppear(trip){

  if(!singleTripReadyForPage(trip)){
    return false;
  }

  if(getTripFinalConfirmed(trip)){
    return false;
  }

  return true;
}

function sharedTripShouldAppear(trip){

  if(!sharedTripReadyForPage(trip)){
    return false;
  }

  if(getSharedFinalConfirmed(trip)){
    return false;
  }

  return true;
}

/* =========================
   SANITIZE
========================= */

function sanitizeTripForFinalPage(trip){

  const obj =
    trip.toObject
      ? trip.toObject()
      : trip;

  if(isSharedTrip(obj)){
    return {
      ...obj,
      __pageType:"shared",
      __readyPassengers:getReadySharedPassengers(obj),
      __finalConfirmed:getSharedFinalConfirmed(obj),
      __finalConfirmedAt:
        obj.dispatchFinalConfirmedAt ||
        obj.sharedFinalConfirmedAt ||
        obj.finalStatusConfirmedAt ||
        null
    };
  }

  return {
    ...obj,
    __pageType:"single",
    __finalConfirmed:getTripFinalConfirmed(obj),
    __finalConfirmedAt:
      obj.dispatchFinalConfirmedAt ||
      obj.finalStatusConfirmedAt ||
      null
  };
}

/* =========================
   GET PAGE DATA
   يسحب الرحلات المقفولة اللي لسه مستنية Final Confirm
========================= */

router.get("/", async (req,res)=>{

  try{

    const trips = await Trip.find({})
      .sort({
        tripDate:-1,
        tripTime:-1,
        createdAt:-1
      });

    const result = [];
    const saveOps = [];

    for(const trip of trips){

      const shouldAppear =
        isSharedTrip(trip)
          ? sharedTripShouldAppear(trip)
          : singleTripShouldAppear(trip);

      if(!shouldAppear){
        continue;
      }

      const stamped = ensurePageEntryStamp(trip);

      if(stamped){
        saveOps.push(trip.save());
      }

      result.push(sanitizeTripForFinalPage(trip));
    }

    if(saveOps.length){
      await Promise.all(saveOps);
    }

    return res.json({
      success:true,
      count:result.length,
      trips:result
    });

  }catch(err){

    console.log("DISPATCH FINAL CONFIRMATION GET ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Failed to load dispatch final confirmation trips"
    });

  }

});

/* =========================
   UPDATE SINGLE STATUS
   Edit فقط، مش Final Confirm
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

    const trip = await Trip.findById(id);

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(isSharedTrip(trip)){
      return res.status(400).json({
        success:false,
        message:"Use shared-status endpoint for shared trip"
      });
    }

    trip.status = status;

    ensurePageEntryStamp(trip);

    clearSingleConfirmState(trip);

    await trip.save();

    return res.json({
      success:true,
      message:"Trip status updated",
      trip:sanitizeTripForFinalPage(trip)
    });

  }catch(err){

    console.log("DISPATCH FINAL SINGLE STATUS ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Failed to update trip status"
    });

  }

});

/* =========================
   CONFIRM SINGLE TRIP
   ده الوحيد اللي يدخلها Dispatch Review
========================= */

router.patch("/:id/confirm", async (req,res)=>{

  try{

    const { id } = req.params;
    const status = normalizeFinalStatus(req.body?.status || "");
    const confirmedBy = String(req.body?.confirmedBy || "").trim();

    if(!mongoose.Types.ObjectId.isValid(String(id))){
      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    const trip = await Trip.findById(id);

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(isSharedTrip(trip)){
      return res.status(400).json({
        success:false,
        message:"Use shared-confirm endpoint for shared trip"
      });
    }

    if(status){
      trip.status = status;
    }

    if(!isFinalStatus(trip.status)){
      return res.status(400).json({
        success:false,
        message:"Trip status is not final"
      });
    }

    ensurePageEntryStamp(trip);

    const now = nowDate();

    trip.finalStatusConfirmed = true;
    trip.finalStatusConfirmedAt = now;
    trip.dispatchFinalConfirmedAt = now;

    if(confirmedBy){
      trip.finalStatusConfirmedBy = confirmedBy;
    }

    await trip.save();

    return res.json({
      success:true,
      message:"Trip confirmed",
      trip:sanitizeTripForFinalPage(trip)
    });

  }catch(err){

    console.log("DISPATCH FINAL SINGLE CONFIRM ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Failed to confirm trip"
    });

  }

});

/* =========================
   UPDATE SHARED PASSENGERS
   Edit فقط، مش Final Confirm
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

    const trip = await Trip.findById(id);

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
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

    ensurePageEntryStamp(trip);

    clearSharedConfirmState(trip);

    await trip.save();

    return res.json({
      success:true,
      message:"Shared passenger statuses updated",
      trip:sanitizeTripForFinalPage(trip)
    });

  }catch(err){

    console.log("DISPATCH FINAL SHARED STATUS ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Failed to update shared statuses"
    });

  }

});

/* =========================
   CONFIRM SHARED TRIP
   ده الوحيد اللي يدخل الشير Dispatch Review
========================= */

router.patch("/:id/shared-confirm", async (req,res)=>{

  try{

    const { id } = req.params;

    const passengersInput =
      Array.isArray(req.body?.passengers)
        ? req.body.passengers
        : null;

    const confirmedBy =
      String(req.body?.confirmedBy || "").trim();

    if(!mongoose.Types.ObjectId.isValid(String(id))){
      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    const trip = await Trip.findById(id);

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
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

    if(passengersInput){
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
    }

    trip.passengers = currentPassengers;

    const readyPassengers = getReadySharedPassengers(trip);

    if(!readyPassengers.length){
      return res.status(400).json({
        success:false,
        message:"No shared passengers ready for final confirmation"
      });
    }

    ensurePageEntryStamp(trip);

    const now = nowDate();

    trip.sharedFinalConfirmed = true;
    trip.sharedFinalConfirmedAt = now;

    trip.finalStatusConfirmed = true;
    trip.finalStatusConfirmedAt = now;
    trip.dispatchFinalConfirmedAt = now;

    if(confirmedBy){
      trip.finalStatusConfirmedBy = confirmedBy;
    }

    await trip.save();

    return res.json({
      success:true,
      message:"Shared trip confirmed",
      trip:sanitizeTripForFinalPage(trip)
    });

  }catch(err){

    console.log("DISPATCH FINAL SHARED CONFIRM ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Failed to confirm shared trip"
    });

  }

});

module.exports = router;