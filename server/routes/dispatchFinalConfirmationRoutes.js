const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");

const Trip = global.Trip || mongoose.models.Trip;

/* =========================
   CONFIG
========================= */

const HOLD_HOURS = 12;

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

function isFinalStatus(v){
  return !!normalizeFinalStatus(v);
}

function nowDate(){
  return new Date();
}

function hoursDiff(dateValue){
  const d = new Date(dateValue);

  if(isNaN(d)){
    return 0;
  }

  return (
    Date.now() - d.getTime()
  ) / (1000 * 60 * 60);
}

function olderThanHours(dateValue,hours){

  if(!dateValue){
    return false;
  }

  return hoursDiff(dateValue) >= hours;
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

/* =========================
   FINAL CONFIRM MARKER
========================= */

function getTripFinalConfirmed(trip){
  return (
    trip?.finalStatusConfirmed === true ||
    !!trip?.dispatchFinalConfirmedAt ||
    !!trip?.finalStatusConfirmedAt
  );
}

function getTripFinalConfirmedAt(trip){
  return (
    trip?.dispatchFinalConfirmedAt ||
    trip?.finalStatusConfirmedAt ||
    null
  );
}

function getSharedFinalConfirmed(trip){
  return (
    trip?.sharedFinalConfirmed === true ||
    trip?.finalStatusConfirmed === true ||
    !!trip?.dispatchFinalConfirmedAt ||
    !!trip?.sharedFinalConfirmedAt ||
    !!trip?.finalStatusConfirmedAt
  );
}

function getSharedFinalConfirmedAt(trip){
  return (
    trip?.dispatchFinalConfirmedAt ||
    trip?.sharedFinalConfirmedAt ||
    trip?.finalStatusConfirmedAt ||
    null
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
    trip.dispatchFinalPageEnteredAt =
      trip.finalPageEnteredAt ||
      now;
  }

  if(!trip.enteredFinalConfirmationAt){
    trip.enteredFinalConfirmationAt =
      trip.finalPageEnteredAt ||
      now;
  }

  return true;
}

/* =========================
   CLEAR CONFIRM STATE
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

    const status =
      p?.status ||
      trip?.status;

    return isFinalStatus(status);
  });
}

function sharedTripReadyForPage(trip){
  return (
    getReadySharedPassengers(trip)
      .length > 0
  );
}

/* =========================
   SHOULD APPEAR
========================= */

function singleTripShouldAppear(trip){

  if(!singleTripReadyForPage(trip)){
    return false;
  }

  if(getTripFinalConfirmed(trip)){

    return !olderThanHours(
      getTripFinalConfirmedAt(trip),
      HOLD_HOURS
    );
  }

  return true;
}

function sharedTripShouldAppear(trip){

  if(!sharedTripReadyForPage(trip)){
    return false;
  }

  if(getSharedFinalConfirmed(trip)){

    return !olderThanHours(
      getSharedFinalConfirmedAt(trip),
      HOLD_HOURS
    );
  }

  return true;
}

/* =========================
   SANITIZE
========================= */

function sanitizeTripForFinalPage(trip){

  const obj =
    trip?.toObject
      ? trip.toObject()
      : trip;

  if(isSharedTrip(obj)){

    return {
      ...obj,
      __pageType:"shared",
      __readyPassengers:
        getReadySharedPassengers(obj),
      __finalConfirmed:
        getSharedFinalConfirmed(obj),
      __finalConfirmedAt:
        getSharedFinalConfirmedAt(obj),
      __holdHours:HOLD_HOURS
    };
  }

  return {
    ...obj,
    __pageType:"single",
    __finalConfirmed:
      getTripFinalConfirmed(obj),
    __finalConfirmedAt:
      getTripFinalConfirmedAt(obj),
    __holdHours:HOLD_HOURS
  };
}

/* =========================
   GET PAGE DATA
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
      await Trip
        .find({})
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

      const stamped =
        ensurePageEntryStamp(trip);

      if(stamped){
        saveOps.push(
          trip.save()
        );
      }

      result.push(
        sanitizeTripForFinalPage(trip)
      );
    }

    if(saveOps.length){
      await Promise.all(saveOps);
    }

    return res.json({
      success:true,
      holdHours:HOLD_HOURS,
      count:result.length,
      trips:result
    });

  }catch(err){

    console.log(
      "DISPATCH FINAL CONFIRMATION GET ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Failed to load dispatch final confirmation trips"
    });
  }
});

/* =========================
   UPDATE SINGLE STATUS
========================= */

router.patch("/:id/status", async (req,res)=>{

  try{

    const { id } = req.params;

    const status =
      normalizeFinalStatus(
        req.body?.status
      );

    if(
      !mongoose.Types.ObjectId
        .isValid(String(id))
    ){

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

    if(isSharedTrip(trip)){

      return res.status(400).json({
        success:false,
        message:
          "Use shared-status endpoint for shared trip"
      });
    }

    const wasConfirmed =
      getTripFinalConfirmed(trip);

    trip.status = status;

    ensurePageEntryStamp(trip);

    if(!wasConfirmed){
      clearSingleConfirmState(trip);
    }

    await trip.save();

    return res.json({
      success:true,
      message:"Trip status updated",
      trip:
        sanitizeTripForFinalPage(trip)
    });

  }catch(err){

    console.log(
      "DISPATCH FINAL SINGLE STATUS ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Failed to update trip status"
    });
  }
});

/* =========================
   CONFIRM SINGLE TRIP
========================= */

router.patch("/:id/confirm", async (req,res)=>{

  try{

    const { id } = req.params;

    const status =
      normalizeFinalStatus(
        req.body?.status || ""
      );

    const confirmedBy =
      String(
        req.body?.confirmedBy || ""
      ).trim();

    if(
      !mongoose.Types.ObjectId
        .isValid(String(id))
    ){

      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
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

    if(isSharedTrip(trip)){

      return res.status(400).json({
        success:false,
        message:
          "Use shared-confirm endpoint for shared trip"
      });
    }

    if(status){
      trip.status = status;
    }

    if(!isFinalStatus(trip.status)){

      return res.status(400).json({
        success:false,
        message:
          "Trip status is not final"
      });
    }

    ensurePageEntryStamp(trip);

    const now = nowDate();

    trip.finalStatusConfirmed = true;
    trip.finalStatusConfirmedAt = now;
    trip.dispatchFinalConfirmedAt = now;

    if(confirmedBy){
      trip.finalStatusConfirmedBy =
        confirmedBy;
    }

    await trip.save();

    return res.json({
      success:true,
      message:"Trip confirmed",
      trip:
        sanitizeTripForFinalPage(trip)
    });

  }catch(err){

    console.log(
      "DISPATCH FINAL SINGLE CONFIRM ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Failed to confirm trip"
    });
  }
});

/* =========================
   UPDATE SHARED PASSENGERS
========================= */

router.patch("/:id/shared-status", async (req,res)=>{

  try{

    const { id } = req.params;

    const passengersInput =
      Array.isArray(
        req.body?.passengers
      )
        ? req.body.passengers
        : null;

    if(
      !mongoose.Types.ObjectId
        .isValid(String(id))
    ){

      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
      });
    }

    if(!passengersInput){

      return res.status(400).json({
        success:false,
        message:
          "Passengers array is required"
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

    if(!isSharedTrip(trip)){

      return res.status(400).json({
        success:false,
        message:
          "Trip is not shared"
      });
    }

    const wasConfirmed =
      getSharedFinalConfirmed(trip);

    const currentPassengers =
      Array.isArray(
        trip.passengers
      )
        ? trip.passengers
        : [];

    passengersInput
      .forEach(
        (inputPassenger,idx)=>{

          if(!currentPassengers[idx]){
            return;
          }

          const nextStatus =
            normalizeFinalStatus(
              inputPassenger?.status
            );

          if(nextStatus){
            currentPassengers[idx].status =
              nextStatus;
          }
        }
      );

    trip.passengers =
      currentPassengers;

    ensurePageEntryStamp(trip);

    if(!wasConfirmed){
      clearSharedConfirmState(trip);
    }

    await trip.save();

    return res.json({
      success:true,
      message:
        "Shared passenger statuses updated",
      trip:
        sanitizeTripForFinalPage(trip)
    });

  }catch(err){

    console.log(
      "DISPATCH FINAL SHARED STATUS ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Failed to update shared statuses"
    });
  }
});

/* =========================
   CONFIRM SHARED TRIP
========================= */

router.patch("/:id/shared-confirm", async (req,res)=>{

  try{

    const { id } = req.params;

    const passengersInput =
      Array.isArray(
        req.body?.passengers
      )
        ? req.body.passengers
        : null;

    const confirmedBy =
      String(
        req.body?.confirmedBy || ""
      ).trim();

    if(
      !mongoose.Types.ObjectId
        .isValid(String(id))
    ){

      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
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

    if(!isSharedTrip(trip)){

      return res.status(400).json({
        success:false,
        message:
          "Trip is not shared"
      });
    }

    const currentPassengers =
      Array.isArray(
        trip.passengers
      )
        ? trip.passengers
        : [];

    if(passengersInput){

      passengersInput
        .forEach(
          (inputPassenger,idx)=>{

            if(!currentPassengers[idx]){
              return;
            }

            const nextStatus =
              normalizeFinalStatus(
                inputPassenger?.status
              );

            if(nextStatus){
              currentPassengers[idx].status =
                nextStatus;
            }
          }
        );
    }

    trip.passengers =
      currentPassengers;

    const readyPassengers =
      getReadySharedPassengers(trip);

    if(!readyPassengers.length){

      return res.status(400).json({
        success:false,
        message:
          "No shared passengers ready for final confirmation"
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
      trip.finalStatusConfirmedBy =
        confirmedBy;
    }

    await trip.save();

    return res.json({
      success:true,
      message:
        "Shared trip confirmed",
      trip:
        sanitizeTripForFinalPage(trip)
    });

  }catch(err){

    console.log(
      "DISPATCH FINAL SHARED CONFIRM ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Failed to confirm shared trip"
    });
  }
});

/* =========================
   RETURN SINGLE TRIP TO DRIVER
   Rescue action:
   Driver closed trip by mistake.
   Dispatch reopens SAME trip for SAME assigned driver.
========================= */

router.patch("/:id/return-to-driver", async (req,res)=>{

  try{

    const { id } = req.params;

    if(
      !mongoose.Types.ObjectId
        .isValid(String(id))
    ){

      return res.status(400).json({
        success:false,
        message:"Invalid trip id"
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

    if(isSharedTrip(trip)){

      return res.status(400).json({
        success:false,
        message:
          "Return To Driver currently supports single trips only"
      });
    }

    if(!isFinalStatus(trip.status)){

      return res.status(400).json({
        success:false,
        message:
          "Only a closed trip can be returned to the driver"
      });
    }

    const previousStatus =
      normalizeFinalStatus(
        trip.status
      ) ||
      String(
        trip.status || ""
      );

    const returnedBy =
      String(
        req.body?.returnedBy || ""
      ).trim();

    const reason =
      String(
        req.body?.reason || ""
      ).trim();

    const now =
      nowDate();

    /*
      Use the raw Mongo collection intentionally here.
      This lets us clear old close/final fields even if some of them
      are not explicitly declared in the current Mongoose schema.
    */
    await Trip.collection.updateOne(
      {
        _id:
          new mongoose.Types.ObjectId(
            String(id)
          )
      },
      {
        $set:{
          status:"InProgress",

          returnToDriver:true,
          returnedToDriverAt:now,
          returnedToDriverBy:
            returnedBy ||
            "dispatcher",

          returnToDriverReason:
            reason ||
            "Returned to driver from Final Confirmation",

          previousFinalStatus:
            previousStatus,

          updatedAt:now
        },

        $unset:{
          finalStatusConfirmed:"",
          finalStatusConfirmedAt:"",
          dispatchFinalConfirmedAt:"",
          finalStatusConfirmedBy:"",

          sharedFinalConfirmed:"",
          sharedFinalConfirmedAt:"",

          finalPageEnteredAt:"",
          dispatchFinalPageEnteredAt:"",
          enteredFinalConfirmationAt:"",

          completedAt:"",
          completeAt:"",
          cancelledAt:"",
          canceledAt:"",
          noShowAt:"",
          noshowAt:"",
          notCompletedAt:"",

          driverReportedFinalStatus:"",
          finalStatusFromDriver:"",
          driverFinalStatusReported:"",
          reportedByDriver:""
        }
      }
    );

    /*
      If DispatchAssignment exists, reopen that same assignment.
      We do NOT create a new assignment and we do NOT change driverId.
    */
    const DispatchAssignment =
      mongoose.models
        .DispatchAssignment ||
      global.DispatchAssignment ||
      null;

    if(DispatchAssignment){

      const tripIdCandidates = [
        String(id),
        trip?._id,
        trip?.tripNumber,
        trip?.bookingNumber
      ].filter(Boolean);

      try{

        await DispatchAssignment.updateMany(
          {
            $or:[
              {
                tripId:{
                  $in:tripIdCandidates
                }
              },
              {
                tripNumber:{
                  $in:tripIdCandidates
                }
              }
            ]
          },
          {
            $set:{
              dispatchStatus:"ON_TRIP",
              status:"ON_TRIP",
              updatedAt:now
            },
            $unset:{
              completedAt:"",
              cancelledAt:"",
              canceledAt:"",
              noShowAt:"",
              noshowAt:""
            }
          }
        );

      }catch(assignmentErr){

        console.log(
          "RETURN TO DRIVER ASSIGNMENT UPDATE WARNING:",
          assignmentErr
        );
      }
    }

    const reopenedTrip =
      await Trip.findById(id);

    return res.json({
      success:true,
      message:
        "Trip returned to driver",
      previousStatus,
      status:
        reopenedTrip?.status ||
        "InProgress",
      trip:
        reopenedTrip
          ? reopenedTrip.toObject()
          : null
    });

  }catch(err){

    console.log(
      "RETURN TO DRIVER ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:
        "Failed to return trip to driver"
    });
  }
});

module.exports = router;