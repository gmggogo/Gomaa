/* =====================================================
   FILE: routes/companyAddStopRoutes.js
   COMPANY / FACILITY / GET QUOTE / INDIVIDUAL
   ADD STOP / ROUTE CHANGE REQUEST
   Saves request inside trip.addStopRequest
===================================================== */

const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

/* =========================
   MODELS
========================= */

const Trip =
  mongoose.models.Trip ||
  global.Trip;

if(!Trip){
  throw new Error("Trip model not loaded. Mount companyAddStopRoutes after Trip model in index.js");
}

/* =========================
   HELPERS
========================= */

function clean(v){
  return String(v ?? "").trim();
}

function toNumber(v){
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function isValidObjectId(id){
  return mongoose.Types.ObjectId.isValid(String(id || ""));
}

function getTripSource(trip, body){

  const source =
    clean(
      body.source ||
      trip.source ||
      trip.bookingSource ||
      trip.createdBy ||
      ""
    ).toLowerCase();

  const isCompany =
    trip.isCompany === true ||
    trip.company === true ||
    clean(trip.companyName) ||
    clean(trip.facilityName) ||
    source.includes("company") ||
    source.includes("facility");

  const isGetQuote =
    trip.isGetQuote === true ||
    trip.getQuote === true ||
    source.includes("getquote") ||
    source.includes("get quote") ||
    clean(trip.source).toLowerCase() === "gq";

  const isIndividual =
    !isCompany && !isGetQuote;

  if(isCompany){
    return "COMPANY";
  }

  if(isGetQuote){
    return "GET_QUOTE";
  }

  if(isIndividual){
    return "INDIVIDUAL";
  }

  return "UNKNOWN";
}

function tripIsClosed(trip){

  const status =
    clean(trip.status)
      .toLowerCase()
      .replace(/\s+/g,"")
      .replace(/-/g,"")
      .replace(/_/g,"");

  return (
    status.includes("complete") ||
    status.includes("cancel") ||
    status.includes("noshow") ||
    status.includes("notcompleted")
  );
}

function hasActiveRouteChange(trip){

  const req =
    trip.addStopRequest || {};

  const status =
    clean(req.status).toUpperCase();

  return (
    req.active === true &&
    ![
      "CANCELLED",
      "CANCELLED_BY_COMPANY",
      "CANCELLED_BY_CUSTOMER",
      "COMPLETED",
      "STOP_REACHED",
      "REJECTED"
    ].includes(status)
  );
}

function normalizeStringArray(arr){

  if(!Array.isArray(arr)){
    return [];
  }

  return arr
    .map(x => clean(x))
    .filter(Boolean);
}

function normalizeAddedStopsDetailed(arr){

  if(!Array.isArray(arr)){
    return [];
  }

  return arr
    .map((s,index)=>({
      address:clean(s.address || s.stop || s.location || ""),
      insertAfterIndex:toNumber(s.insertAfterIndex),
      rowIndex:toNumber(s.rowIndex ?? index)
    }))
    .filter(s => s.address);
}

function normalizeEditedExistingStops(arr){

  if(!Array.isArray(arr)){
    return [];
  }

  return arr
    .map(s=>({
      index:toNumber(s.index),
      oldAddress:clean(s.oldAddress),
      newAddress:clean(s.newAddress)
    }))
    .filter(s => s.newAddress);
}

/* =========================
   CONFIRM ROUTE CHANGE REQUEST
   POST /api/company/add-stop/:id/confirm
========================= */

router.post("/add-stop/:id/confirm", async (req,res)=>{

  try{

    const tripId =
      clean(req.params.id);

    if(!tripId || !isValidObjectId(tripId)){
      return res.status(400).json({
        success:false,
        message:"Invalid trip ID"
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

    if(tripIsClosed(trip)){
      return res.status(400).json({
        success:false,
        message:"This trip is closed and cannot be modified"
      });
    }

    if(hasActiveRouteChange(trip)){
      return res.status(409).json({
        success:false,
        message:"This trip already has an active route change request"
      });
    }

    const body =
      req.body || {};

    const tripSource =
      getTripSource(trip, body);

    const pickup =
      clean(
        body.pickup ||
        trip.pickup ||
        trip.pickupAddress ||
        ""
      );

    const dropoffBefore =
      clean(
        body.dropoffBefore ||
        trip.dropoff ||
        trip.dropoffAddress ||
        ""
      );

    const dropoffAfter =
      clean(
        body.dropoffAfter ||
        body.finalDropoff ||
        dropoffBefore
      );

    const existingStopsBefore =
      normalizeStringArray(
        body.existingStopsBefore ||
        trip.stops ||
        []
      );

    const editedExistingStops =
      normalizeEditedExistingStops(
        body.editedExistingStops
      );

    const addedStops =
      normalizeStringArray(
        body.addedStops
      );

    const addedStopsDetailed =
      normalizeAddedStopsDetailed(
        body.addedStopsDetailed
      );

    const finalStops =
      normalizeStringArray(
        body.finalStops
      );

    if(!pickup){
      return res.status(400).json({
        success:false,
        message:"Pickup address missing"
      });
    }

    if(!dropoffBefore){
      return res.status(400).json({
        success:false,
        message:"Dropoff address missing"
      });
    }

    if(
      !addedStops.length &&
      !editedExistingStops.length &&
      dropoffAfter === dropoffBefore
    ){
      return res.status(400).json({
        success:false,
        message:"No route change detected"
      });
    }

    trip.addStopRequest = {
      active:true,

      status:
        body.status || "PENDING_REVIEW",

      requestType:
        body.requestType || "ROUTE_CHANGE",

      source:
        body.source || "company-add-stop",

      tripSource,

      calculatePriceOnReview:
        body.calculatePriceOnReview !== false,

      companyName:
        clean(
          body.companyName ||
          trip.companyName ||
          trip.facilityName ||
          ""
        ),

      facilityName:
        clean(
          body.facilityName ||
          trip.facilityName ||
          trip.companyName ||
          ""
        ),

      tripNumber:
        clean(
          body.tripNumber ||
          trip.tripNumber ||
          ""
        ),

      clientName:
        clean(
          body.clientName ||
          trip.clientName ||
          trip.name ||
          trip.customerName ||
          ""
        ),

      tripStatusAtConfirm:
        clean(
          body.tripStatusAtConfirm ||
          trip.status ||
          ""
        ),

      confirmedAt:
        body.confirmedAt || new Date(),

      mode:
        clean(body.mode || ""),

      maxStops:
        toNumber(body.maxStops || 5),

      pickup,

      dropoffBefore,
      dropoffAfter,

      existingStopsBefore,
      editedExistingStops,

      addedStops,
      addedStopsDetailed,

      finalStops,

      finalRoutePoints:
        Array.isArray(body.finalRoutePoints)
          ? body.finalRoutePoints
          : [],

      driverLocationAtConfirm:
        body.driverLocationAtConfirm || null,

      beforeStopChange:
        body.beforeStopChange || {
          pickup,
          dropoff:dropoffBefore,
          stops:existingStopsBefore,
          miles:toNumber(trip.miles),
          priceAmount:toNumber(trip.priceAmount),
          finalPrice:toNumber(trip.finalPrice)
        },

      originalRoutePoints:
        Array.isArray(body.originalRoutePoints)
          ? body.originalRoutePoints
          : [],

      newRoutePoints:
        Array.isArray(body.newRoutePoints)
          ? body.newRoutePoints
          : [],

      originalRemainingMiles:
        toNumber(body.originalRemainingMiles),

      newRemainingMiles:
        toNumber(body.newRemainingMiles),

      extraMiles:
        toNumber(body.extraMiles),

      originalRouteData:
        body.originalRouteData || {},

      newRouteData:
        body.newRouteData || {},

      createdAt:
        new Date(),

      updatedAt:
        new Date()
    };

    /*
      الرحلة نفسها لا تتعدل هنا.
      التعديل يفضل Pending للـ Review / Confirm.
    */

    trip.routeChangePending = true;
    trip.routeChangeStatus = "PENDING_REVIEW";

    trip.markModified("addStopRequest");

    await trip.save();

    return res.json({
      success:true,
      message:"Route change request saved for review",
      tripId:trip._id,
      tripNumber:trip.tripNumber || "",
      tripSource,
      addStopRequest:trip.addStopRequest
    });

  }catch(err){

    console.error("ADD STOP CONFIRM ROUTE ERROR:",err);

    return res.status(500).json({
      success:false,
      message:"Failed to send added stop request",
      error:err.message
    });
  }
});

/* =========================
   GET ACTIVE ROUTE CHANGE
   GET /api/company/add-stop/:id/request
========================= */

router.get("/add-stop/:id/request", async (req,res)=>{

  try{

    const tripId =
      clean(req.params.id);

    if(!tripId || !isValidObjectId(tripId)){
      return res.status(400).json({
        success:false,
        message:"Invalid trip ID"
      });
    }

    const trip =
      await Trip.findById(tripId).lean();

    if(!trip){
      return res.status(404).json({
        success:false,
        message:"Trip not found"
      });
    }

    return res.json({
      success:true,
      tripId:trip._id,
      tripNumber:trip.tripNumber || "",
      addStopRequest:trip.addStopRequest || null
    });

  }catch(err){

    return res.status(500).json({
      success:false,
      message:"Failed to load route change request",
      error:err.message
    });
  }
});

/* =========================
   CANCEL ROUTE CHANGE
   POST /api/company/add-stop/:id/cancel
========================= */

router.post("/add-stop/:id/cancel", async (req,res)=>{

  try{

    const tripId =
      clean(req.params.id);

    if(!tripId || !isValidObjectId(tripId)){
      return res.status(400).json({
        success:false,
        message:"Invalid trip ID"
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

    if(!trip.addStopRequest){
      return res.status(404).json({
        success:false,
        message:"No active route change request found"
      });
    }

    trip.addStopRequest.active = false;
    trip.addStopRequest.status =
      req.body?.status || "CANCELLED_BY_COMPANY";
    trip.addStopRequest.cancelledAt = new Date();
    trip.addStopRequest.updatedAt = new Date();

    trip.routeChangePending = false;
    trip.routeChangeStatus = "CANCELLED";

    trip.markModified("addStopRequest");

    await trip.save();

    return res.json({
      success:true,
      message:"Route change request cancelled",
      tripId:trip._id
    });

  }catch(err){

    return res.status(500).json({
      success:false,
      message:"Failed to cancel route change request",
      error:err.message
    });
  }
});

module.exports = router;