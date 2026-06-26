"use strict";

const express = require("express");
const router = express.Router();

const tripFinalizer =
  require("../utils/trip-finalizer");

const routeMapEngine =
  require("../utils/routeMapEngine");

/* =========================
   HELPERS
========================= */

function n(value){
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function getTripModel(){
  if(!global.Trip){
    throw new Error("Trip model not loaded");
  }

  return global.Trip;
}

async function calculateRoute(routePoints){

  if(
    routeMapEngine &&
    typeof routeMapEngine.calculateRouteMiles === "function"
  ){
    return await routeMapEngine.calculateRouteMiles(routePoints);
  }

  if(
    routeMapEngine &&
    typeof routeMapEngine.calculateRoute === "function"
  ){
    return await routeMapEngine.calculateRoute(routePoints);
  }

  throw new Error(
    "routeMapEngine calculate function not found"
  );
}

/* =========================
   CONFIRM RESERVED TRIP
   Shared + Individual
========================= */

router.post("/:tripId", async (req,res)=>{

  try{

    const Trip =
      getTripModel();

    const tripId =
      req.params.tripId;

    if(!tripId){
      return res.status(400).json({
        success:false,
        message:"Missing trip id"
      });
    }

    const trip =
      await Trip.findById(tripId);

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    if(
      trip.routeLocked === true &&
      trip.routeFinalized === true
    ){
      return res.status(400).json({
        success:false,
        message:"Trip already confirmed and route locked"
      });
    }

    const prepared =
      tripFinalizer.prepareConfirmRoute(trip,{
        debug:true
      });

    const routeData =
      await calculateRoute(
        prepared.routePoints
      );

    /*
      IMPORTANT:
      مؤقتًا هنستخدم السعر الموجود على الرحلة.
      بعد كده هنربطه بسعر Reserved الصحيح من Service Management.
    */

    const priceAmount =
      n(
        trip.priceAmount ||
        trip.finalPrice ||
        req.body?.priceAmount ||
        0
      );

    const activeCount =
      Math.max(
        1,
        n(prepared.activeCount || 1)
      );

    const pricePerPassenger =
      prepared.isShared
        ? priceAmount / activeCount
        : priceAmount;

    const updatedTrip =
      await tripFinalizer.lockConfirmedTrip(trip,{
        ...prepared,

        routeData,

        priceAmount,
        finalPrice:priceAmount,
        pricePerPassenger,

        routeSource:
          prepared.isShared
            ? "server-shared-route-engine"
            : "server-individual-route-engine"
      });

    return res.json({
      success:true,
      trip:updatedTrip
    });

  }catch(err){

    console.log(
      "DISPATCH RESERVED CONFIRM ERROR:",
      err
    );

    return res.status(500).json({
      success:false,
      message:err.message || "Server error"
    });

  }

});

module.exports = router;